import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { gridSpacing, gridToWorld, type DensityGrid } from '../lib/voxel/densityGrid'
import type { ChunkMesh } from '../lib/voxel/chunks'
import type { MeshData } from '../lib/voxel/marchingCubes'
import { createWaterMaterial, MAX_RIPPLES, syncWaterUniforms } from '../lib/shaders/waterMaterial'
import { buildTerrainHeightTexture } from '../lib/shaders/terrainHeightTexture'
import {
  createDefaultShaderParams,
  type ShaderStudyMode,
  type ShaderStudyParams,
} from '../lib/shaders/types'
import './ThreeCanvas.css'

export type VoxelViewMode = 'mesh' | 'debug'

export type VoxelDisplay = {
  mode: VoxelViewMode
  /** Debug mode: exposed solid samples as cubes. */
  voxels: boolean
  /** Debug mode: every sample as a density-coloured point. */
  points: boolean
  bounds: boolean
  /** Mesh mode: wireframe overlay of the triangles. */
  meshWireframe: boolean
  /** Mesh mode: one Marching Cubes mesh per chunk instead of one for the whole grid. */
  chunked: boolean
  /** Chunked mesh: outline every chunk. */
  chunkBounds: boolean
  /** Chunked mesh: give each chunk its own colour. */
  chunkTint: boolean
  /** Show the hydrology water mesh. */
  showWater: boolean
}

type VoxelCanvasProps = {
  /** Whole-grid samples; null when only chunks were built. */
  grid: DensityGrid | null
  extent: number
  isoLevel: number
  /** Sample indices to draw as cubes (see collectSurfaceVoxels); null skips the debug objects. */
  surface: Uint32Array | null
  /** Single Marching Cubes mesh; null when not in unchunked mesh mode. */
  mesh: MeshData | null
  /** Per-chunk meshes; null when not in chunked mesh mode. */
  chunks: ChunkMesh[] | null
  /** Water volume Marching Cubes mesh. */
  waterMesh: MeshData | null
  /** Mid-air rain drops as xyz triplets (small particles). */
  fallingDrops: Float32Array | null
  display: VoxelDisplay
  /** When true, Class 05 water shaders run on the voxel water MC mesh. */
  shaderEnabled?: boolean
  shaderMode?: ShaderStudyMode
  shaderParams?: ShaderStudyParams
}

type ChunkObject = THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>

type SceneObjects = {
  content: THREE.Group
  floor: THREE.GridHelper
  surfaceMesh: THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>
  surfaceWire: THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>
  voxels: THREE.InstancedMesh | null
  points: THREE.Points | null
  bounds: THREE.Box3Helper | null
  chunkGroup: THREE.Group
  /** Persistent per chunk key; only the geometry is swapped on rebuild. */
  chunkMeshes: Map<string, ChunkObject>
  chunkBoxes: THREE.Group
  waterMesh: THREE.Mesh<THREE.BufferGeometry, THREE.Material>
  waterStandard: THREE.MeshStandardMaterial
  waterShader: THREE.ShaderMaterial
  rainDrops: THREE.Points<THREE.BufferGeometry, THREE.PointsMaterial>
  heightMap: THREE.DataTexture | null
  ripples: THREE.Vector4[]
  rippleCursor: number
  clock: THREE.Clock
  raycaster: THREE.Raycaster
  pointer: THREE.Vector2
  renderer: THREE.WebGLRenderer
  camera: THREE.PerspectiveCamera
  controls: OrbitControls
}

const EMPTY_COLOR = new THREE.Color(0x14305e)
const SURFACE_COLOR = new THREE.Color(0x4a5060)
const SOLID_COLOR = new THREE.Color(0xf28a2e)
const LOW_COLOR = new THREE.Color(0x2b8f6a)
const HIGH_COLOR = new THREE.Color(0xd8f5e6)
const MESH_COLOR = 0x5fbf8f
const WATER_COLOR = 0x3a8fd4
const CHUNK_BOX_COLOR = 0xf2c14e
const EMPTY_CHUNK_BOX_COLOR = 0x3a3f4b

export default function VoxelCanvas({
  grid,
  extent,
  isoLevel,
  surface,
  mesh,
  chunks,
  waterMesh,
  fallingDrops,
  display,
  shaderEnabled = false,
  shaderMode = 'deform',
  shaderParams = createDefaultShaderParams(),
}: VoxelCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const objectsRef = useRef<SceneObjects | null>(null)
  const shaderRef = useRef({ enabled: false, mode: shaderMode, params: shaderParams, extent })
  useEffect(() => {
    shaderRef.current = { enabled: shaderEnabled, mode: shaderMode, params: shaderParams, extent }
  }, [shaderEnabled, shaderMode, shaderParams, extent])

  // ── Scene setup (once) ──
  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const scene = new THREE.Scene()
    scene.background = new THREE.Color(0x0a0b0d)

    const camera = new THREE.PerspectiveCamera(50, container.clientWidth / container.clientHeight, 0.1, 200)
    camera.position.set(9, 7, 11)

    const renderer = new THREE.WebGLRenderer({ antialias: true })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.setSize(container.clientWidth, container.clientHeight)
    container.appendChild(renderer.domElement)

    const controls = new OrbitControls(camera, renderer.domElement)
    controls.enableDamping = true
    controls.mouseButtons.RIGHT = THREE.MOUSE.ROTATE
    controls.mouseButtons.MIDDLE = THREE.MOUSE.DOLLY

    scene.add(new THREE.AmbientLight(0xffffff, 0.55))
    const sun = new THREE.DirectionalLight(0xffffff, 1.1)
    sun.position.set(6, 10, 5)
    scene.add(sun)

    const floor = new THREE.GridHelper(20, 20, 0x3a3f4b, 0x1e2228)
    scene.add(floor)

    const surfaceMesh = new THREE.Mesh(
      new THREE.BufferGeometry(),
      new THREE.MeshStandardMaterial({
        color: MESH_COLOR,
        roughness: 0.65,
        metalness: 0.05,
        polygonOffset: true,
        polygonOffsetFactor: 1,
        polygonOffsetUnits: 1,
      }),
    )
    const surfaceWire = new THREE.Mesh(
      surfaceMesh.geometry,
      new THREE.MeshBasicMaterial({ color: 0xd8f5e6, wireframe: true, transparent: true, opacity: 0.25 }),
    )
    scene.add(surfaceMesh, surfaceWire)

    const waterStandard = new THREE.MeshStandardMaterial({
      color: WATER_COLOR,
      roughness: 0.28,
      metalness: 0.08,
      transparent: true,
      opacity: 0.62,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -2,
      side: THREE.DoubleSide,
    })
    const waterShader = createWaterMaterial(createDefaultShaderParams(), 'deform')
    const waterSurface: THREE.Mesh<THREE.BufferGeometry, THREE.Material> = new THREE.Mesh(
      new THREE.BufferGeometry(),
      waterStandard,
    )
    waterSurface.visible = false
    scene.add(waterSurface)

    const rainDrops = new THREE.Points(
      new THREE.BufferGeometry(),
      new THREE.PointsMaterial({
        color: 0xc5e4f5,
        size: 0.028,
        sizeAttenuation: true,
        transparent: true,
        opacity: 0.7,
        depthWrite: false,
      }),
    )
    rainDrops.visible = false
    rainDrops.frustumCulled = false
    scene.add(rainDrops)

    const content = new THREE.Group()
    const chunkGroup = new THREE.Group()
    const chunkBoxes = new THREE.Group()
    scene.add(content, chunkGroup, chunkBoxes)

    const ripples = Array.from({ length: MAX_RIPPLES }, () => new THREE.Vector4(0, 0, 0, 0))
    const bag: SceneObjects = {
      content,
      floor,
      surfaceMesh,
      surfaceWire,
      voxels: null,
      points: null,
      bounds: null,
      chunkGroup,
      chunkMeshes: new Map(),
      chunkBoxes,
      waterMesh: waterSurface,
      waterStandard,
      waterShader,
      rainDrops,
      heightMap: null,
      ripples,
      rippleCursor: 0,
      clock: new THREE.Clock(),
      raycaster: new THREE.Raycaster(),
      pointer: new THREE.Vector2(),
      renderer,
      camera,
      controls,
    }
    objectsRef.current = bag

    let downX = 0
    let downY = 0
    const onPointerDown = (e: PointerEvent) => {
      downX = e.clientX
      downY = e.clientY
    }
    const onPointerUp = (e: PointerEvent) => {
      if (!shaderRef.current.enabled || shaderRef.current.mode !== 'ripple') return
      if (Math.hypot(e.clientX - downX, e.clientY - downY) > 6) return
      const rect = renderer.domElement.getBoundingClientRect()
      bag.pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1
      bag.pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1
      bag.raycaster.setFromCamera(bag.pointer, camera)
      const hits = bag.raycaster.intersectObject(waterSurface, false)
      if (!hits.length) return
      const p = hits[0].point
      const slot = bag.ripples[bag.rippleCursor % MAX_RIPPLES]
      slot.set(p.x, p.z, bag.clock.getElapsedTime(), 1)
      bag.rippleCursor++
    }
    renderer.domElement.addEventListener('pointerdown', onPointerDown)
    renderer.domElement.addEventListener('pointerup', onPointerUp)

    let frameId = 0
    const animate = () => {
      frameId = requestAnimationFrame(animate)
      const s = shaderRef.current
      const t = bag.clock.getElapsedTime()
      if (s.enabled) {
        waterSurface.material = waterShader
        syncWaterUniforms(waterShader, s.params, s.mode, t, bag.ripples, undefined, bag.heightMap, s.extent)
        controls.mouseButtons.LEFT = s.mode === 'ripple' ? (-1 as THREE.MOUSE) : THREE.MOUSE.ROTATE
        renderer.domElement.style.cursor = s.mode === 'ripple' ? 'crosshair' : 'default'
      } else {
        waterSurface.material = waterStandard
        controls.mouseButtons.LEFT = THREE.MOUSE.ROTATE
        renderer.domElement.style.cursor = 'default'
      }
      controls.update()
      renderer.render(scene, camera)
    }
    animate()

    const ro = new ResizeObserver(() => {
      const { clientWidth, clientHeight } = container
      if (clientWidth === 0 || clientHeight === 0) return
      camera.aspect = clientWidth / clientHeight
      camera.updateProjectionMatrix()
      renderer.setSize(clientWidth, clientHeight)
    })
    ro.observe(container)

    return () => {
      cancelAnimationFrame(frameId)
      ro.disconnect()
      renderer.domElement.removeEventListener('pointerdown', onPointerDown)
      renderer.domElement.removeEventListener('pointerup', onPointerUp)
      controls.dispose()
      disposeContent(objectsRef.current)
      if (objectsRef.current) {
        syncChunkMeshes(objectsRef.current, [])
        clearChunkBoxes(objectsRef.current)
        objectsRef.current.heightMap?.dispose()
      }
      objectsRef.current = null
      surfaceMesh.geometry.dispose()
      surfaceMesh.material.dispose()
      surfaceWire.material.dispose()
      waterSurface.geometry.dispose()
      waterStandard.dispose()
      waterShader.dispose()
      rainDrops.geometry.dispose()
      rainDrops.material.dispose()
      floor.dispose()
      renderer.dispose()
      container.removeChild(renderer.domElement)
    }
  }, [])

  // ── Marching Cubes mesh: swap geometry only ──
  useEffect(() => {
    const objects = objectsRef.current
    if (!objects || !mesh) return
    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute('position', new THREE.BufferAttribute(mesh.positions, 3))
    geometry.setIndex(new THREE.BufferAttribute(mesh.indices, 1))
    // Vertices are shared between neighbouring triangles, so averaged face normals are smooth.
    geometry.computeVertexNormals()
    objects.surfaceMesh.geometry.dispose()
    objects.surfaceMesh.geometry = geometry
    objects.surfaceWire.geometry = geometry
  }, [mesh])

  // ── Chunk meshes: one Mesh per chunk, reused by key ──
  useEffect(() => {
    const objects = objectsRef.current
    if (!objects) return
    syncChunkMeshes(objects, chunks ?? [])
    clearChunkBoxes(objects)
    for (const chunk of chunks ?? []) {
      const box = new THREE.Box3(new THREE.Vector3(...chunk.bounds.min), new THREE.Vector3(...chunk.bounds.max))
      const empty = chunk.mesh.indices.length === 0
      objects.chunkBoxes.add(new THREE.Box3Helper(box, empty ? EMPTY_CHUNK_BOX_COLOR : CHUNK_BOX_COLOR))
    }
  }, [chunks])

  // ── Water Marching Cubes mesh ──
  useEffect(() => {
    const objects = objectsRef.current
    if (!objects) return
    if (!waterMesh || waterMesh.indices.length === 0) {
      objects.waterMesh.visible = false
      return
    }
    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute('position', new THREE.BufferAttribute(waterMesh.positions, 3))
    geometry.setIndex(new THREE.BufferAttribute(waterMesh.indices, 1))
    geometry.computeVertexNormals()
    objects.waterMesh.geometry.dispose()
    objects.waterMesh.geometry = geometry
    objects.waterMesh.visible = display.showWater
  }, [waterMesh, display.showWater])

  // ── Falling rain particles (tiny points) ──
  useEffect(() => {
    const objects = objectsRef.current
    if (!objects) return
    if (!fallingDrops || fallingDrops.length < 3 || !display.showWater) {
      objects.rainDrops.visible = false
      return
    }
    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute('position', new THREE.BufferAttribute(fallingDrops, 3))
    objects.rainDrops.geometry.dispose()
    objects.rainDrops.geometry = geometry
    objects.rainDrops.visible = true
  }, [fallingDrops, display.showWater])

  // ── Debug visualization + bounds: rebuilt when the field changes ──
  useEffect(() => {
    const objects = objectsRef.current
    if (!objects) return
    disposeContent(objects)

    const half = extent / 2
    objects.floor.position.y = -half

    const bounds = new THREE.Box3Helper(
      new THREE.Box3(new THREE.Vector3(-half, -half, -half), new THREE.Vector3(half, half, half)),
      0x3ecf8e,
    )
    objects.content.add(bounds)
    objects.bounds = bounds

    objects.heightMap?.dispose()
    objects.heightMap = grid ? buildTerrainHeightTexture(grid, isoLevel) : null

    if (!surface || !grid) return
    const voxels = buildSurfaceVoxels(grid, surface)
    const points = buildDensityPoints(grid, isoLevel)
    objects.content.add(voxels, points)
    objects.voxels = voxels
    objects.points = points
  }, [grid, extent, isoLevel, surface])

  // ── Display toggles ──
  useEffect(() => {
    const objects = objectsRef.current
    if (!objects) return
    const debug = display.mode === 'debug'
    objects.surfaceMesh.visible = !debug && mesh !== null
    objects.surfaceWire.visible = !debug && mesh !== null && display.meshWireframe
    if (objects.voxels) objects.voxels.visible = debug && display.voxels
    if (objects.points) objects.points.visible = debug && display.points
    if (objects.bounds) objects.bounds.visible = display.bounds

    const showChunks = !debug && chunks !== null
    objects.chunkGroup.visible = showChunks
    objects.chunkBoxes.visible = showChunks && display.chunkBounds
    styleChunkMeshes(objects, display)
    objects.waterMesh.visible = display.showWater && waterMesh !== null && waterMesh.indices.length > 0
    objects.rainDrops.visible =
      display.showWater && fallingDrops !== null && fallingDrops.length >= 3
  }, [display, grid, isoLevel, surface, mesh, chunks, waterMesh, fallingDrops])

  return <div ref={containerRef} className="three-canvas" aria-label="Voxel density field" />
}

/** One instanced cube per exposed solid sample, shaded by height. */
function buildSurfaceVoxels(grid: DensityGrid, surface: Uint32Array): THREE.InstancedMesh {
  const spacing = gridSpacing(grid)
  const r = grid.resolution
  const half = grid.extent / 2
  const cube = new THREE.BoxGeometry(spacing * 0.92, spacing * 0.92, spacing * 0.92)
  const voxelMaterial = new THREE.MeshStandardMaterial({ roughness: 0.7, metalness: 0.05 })
  const voxels = new THREE.InstancedMesh(cube, voxelMaterial, Math.max(1, surface.length))
  voxels.count = surface.length
  const matrix = new THREE.Matrix4()
  const color = new THREE.Color()
  for (let n = 0; n < surface.length; n++) {
    const i = surface[n]
    const ix = i % r
    const iy = Math.floor(i / r) % r
    const iz = Math.floor(i / (r * r))
    const y = gridToWorld(grid, iy)
    matrix.makeTranslation(gridToWorld(grid, ix), y, gridToWorld(grid, iz))
    voxels.setMatrixAt(n, matrix)
    voxels.setColorAt(n, color.copy(LOW_COLOR).lerp(HIGH_COLOR, (y + half) / grid.extent))
  }
  voxels.instanceMatrix.needsUpdate = true
  if (voxels.instanceColor) voxels.instanceColor.needsUpdate = true
  return voxels
}

/** Every sample as a point: blue = empty, grey = near the surface, orange = solid. */
function buildDensityPoints(grid: DensityGrid, isoLevel: number): THREE.Points {
  const r = grid.resolution
  const count = grid.data.length
  const positions = new Float32Array(count * 3)
  const colors = new Float32Array(count * 3)
  const color = new THREE.Color()
  let maxAbs = 1e-6
  for (let i = 0; i < count; i++) maxAbs = Math.max(maxAbs, Math.abs(grid.data[i] - isoLevel))
  for (let i = 0; i < count; i++) {
    positions[i * 3] = gridToWorld(grid, i % r)
    positions[i * 3 + 1] = gridToWorld(grid, Math.floor(i / r) % r)
    positions[i * 3 + 2] = gridToWorld(grid, Math.floor(i / (r * r)))
    const t = (grid.data[i] - isoLevel) / maxAbs
    color.copy(SURFACE_COLOR).lerp(t > 0 ? SOLID_COLOR : EMPTY_COLOR, Math.min(1, Math.abs(t)))
    colors[i * 3] = color.r
    colors[i * 3 + 1] = color.g
    colors[i * 3 + 2] = color.b
  }
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3))
  return new THREE.Points(
    geometry,
    new THREE.PointsMaterial({ size: gridSpacing(grid) * 0.2, vertexColors: true, transparent: true, opacity: 0.75, depthWrite: false }),
  )
}

/** Adds, updates and removes chunk Mesh objects so they match `chunks`. Empty chunks get no Mesh. */
function syncChunkMeshes(objects: SceneObjects, chunks: ChunkMesh[]) {
  const live = new Set<string>()
  for (const chunk of chunks) {
    if (chunk.mesh.indices.length === 0) continue
    live.add(chunk.key)
    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute('position', new THREE.BufferAttribute(chunk.mesh.positions, 3))
    if (chunk.mesh.normals) geometry.setAttribute('normal', new THREE.BufferAttribute(chunk.mesh.normals, 3))
    else geometry.computeVertexNormals()
    geometry.setIndex(new THREE.BufferAttribute(chunk.mesh.indices, 1))

    const existing = objects.chunkMeshes.get(chunk.key)
    if (existing) {
      existing.geometry.dispose()
      existing.geometry = geometry
    } else {
      const created: ChunkObject = new THREE.Mesh(
        geometry,
        new THREE.MeshStandardMaterial({ color: MESH_COLOR, roughness: 0.65, metalness: 0.05 }),
      )
      objects.chunkMeshes.set(chunk.key, created)
      objects.chunkGroup.add(created)
    }
  }
  for (const [key, stale] of objects.chunkMeshes) {
    if (live.has(key)) continue
    objects.chunkGroup.remove(stale)
    stale.geometry.dispose()
    stale.material.dispose()
    objects.chunkMeshes.delete(key)
  }
}

function styleChunkMeshes(objects: SceneObjects, display: VoxelDisplay) {
  for (const [key, chunkMesh] of objects.chunkMeshes) {
    chunkMesh.material.wireframe = display.meshWireframe
    if (display.chunkTint) chunkMesh.material.color.setHSL(chunkHue(key), 0.45, 0.55)
    else chunkMesh.material.color.set(MESH_COLOR)
  }
}

function clearChunkBoxes(objects: SceneObjects) {
  for (const child of [...objects.chunkBoxes.children]) {
    objects.chunkBoxes.remove(child)
    if (child instanceof THREE.Box3Helper) child.dispose()
  }
}

/** Stable, well-spread hue per chunk key "cx,cy,cz". */
function chunkHue(key: string): number {
  const [cx, cy, cz] = key.split(',').map(Number)
  return ((cx * 0.37 + cy * 0.61 + cz * 0.83) % 1 + 1) % 1
}

function disposeContent(objects: SceneObjects | null) {
  if (!objects) return
  for (const child of [...objects.content.children]) {
    objects.content.remove(child)
    if (child instanceof THREE.InstancedMesh || child instanceof THREE.Points) {
      child.geometry.dispose()
      ;(child.material as THREE.Material).dispose()
    } else if (child instanceof THREE.Box3Helper) {
      child.dispose()
    }
  }
  objects.voxels = null
  objects.points = null
  objects.bounds = null
}
