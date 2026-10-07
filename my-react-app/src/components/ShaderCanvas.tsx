import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import {
  createParticleMaterial,
  createParticleState,
  resetParticles,
  stepParticles,
  type ParticleState,
} from '../lib/shaders/particleMaterial'
import { createWaterMaterial, MAX_RIPPLES, syncWaterUniforms } from '../lib/shaders/waterMaterial'
import { DEFAULT_ROCKS, type ShaderStudyMode, type ShaderStudyParams } from '../lib/shaders/types'
import './ThreeCanvas.css'

type ShaderCanvasProps = {
  mode: ShaderStudyMode
  params: ShaderStudyParams
}

type SceneBag = {
  renderer: THREE.WebGLRenderer
  scene: THREE.Scene
  camera: THREE.PerspectiveCamera
  controls: OrbitControls
  water: THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>
  waterMaterial: THREE.ShaderMaterial
  rocks: THREE.Mesh[]
  particles: THREE.Points<THREE.BufferGeometry, THREE.ShaderMaterial>
  particleState: ParticleState
  ripples: THREE.Vector4[]
  rippleCursor: number
  raycaster: THREE.Raycaster
  pointer: THREE.Vector2
  clock: THREE.Clock
}

export default function ShaderCanvas({ mode, params }: ShaderCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const bagRef = useRef<SceneBag | null>(null)
  const modeRef = useRef(mode)
  const paramsRef = useRef(params)
  useEffect(() => {
    modeRef.current = mode
    paramsRef.current = params
  }, [mode, params])

  // ── Scene setup (once) ──
  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const scene = new THREE.Scene()
    scene.background = new THREE.Color(0x0b1018)

    const camera = new THREE.PerspectiveCamera(50, container.clientWidth / container.clientHeight, 0.1, 200)
    camera.position.set(5.5, 4.2, 6.5)

    const renderer = new THREE.WebGLRenderer({ antialias: true })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.setSize(container.clientWidth, container.clientHeight)
    container.appendChild(renderer.domElement)

    const controls = new OrbitControls(camera, renderer.domElement)
    controls.enableDamping = true
    controls.target.set(0, 0.1, 0)
    controls.mouseButtons.RIGHT = THREE.MOUSE.ROTATE
    controls.mouseButtons.MIDDLE = THREE.MOUSE.DOLLY

    scene.add(new THREE.AmbientLight(0xffffff, 0.45))
    const sun = new THREE.DirectionalLight(0xffffff, 1.15)
    sun.position.set(5, 9, 3)
    scene.add(sun)

    const floor = new THREE.Mesh(
      new THREE.CircleGeometry(7, 48),
      new THREE.MeshStandardMaterial({ color: 0x2a2430, roughness: 0.95 }),
    )
    floor.rotation.x = -Math.PI / 2
    floor.position.y = -1.35
    scene.add(floor)

    const waterMaterial = createWaterMaterial(paramsRef.current, modeRef.current)
    const waterGeom = new THREE.PlaneGeometry(10, 10, 128, 128)
    waterGeom.rotateX(-Math.PI / 2) // bake so local +Y is up for vertex displacement
    const water = new THREE.Mesh(waterGeom, waterMaterial)
    water.position.y = 0
    scene.add(water)

    const rocks: THREE.Mesh[] = []
    const rockMat = new THREE.MeshStandardMaterial({ color: 0x6a6570, roughness: 0.85, metalness: 0.05 })
    for (const [x, y, z, r] of DEFAULT_ROCKS) {
      const mesh = new THREE.Mesh(new THREE.SphereGeometry(r, 28, 20), rockMat.clone())
      mesh.position.set(x, y, z)
      mesh.scale.set(1, 0.85 + Math.random() * 0.25, 1)
      scene.add(mesh)
      rocks.push(mesh)
    }

    const particleState = createParticleState(paramsRef.current.particleCount)
    resetParticles(particleState, paramsRef.current.particleLife)
    const particleGeom = new THREE.BufferGeometry()
    particleGeom.setAttribute('position', new THREE.BufferAttribute(particleState.positions, 3))
    particleGeom.setAttribute('aLife', new THREE.BufferAttribute(particleState.life, 1))
    particleGeom.setAttribute('aMaxLife', new THREE.BufferAttribute(particleState.maxLife, 1))
    const particleMat = createParticleMaterial(paramsRef.current.particleSize)
    const particles = new THREE.Points(particleGeom, particleMat)
    particles.frustumCulled = false
    particles.visible = false
    scene.add(particles)

    const ripples = Array.from({ length: MAX_RIPPLES }, () => new THREE.Vector4(0, 0, 0, 0))
    const bag: SceneBag = {
      renderer,
      scene,
      camera,
      controls,
      water,
      waterMaterial,
      rocks,
      particles,
      particleState,
      ripples,
      rippleCursor: 0,
      raycaster: new THREE.Raycaster(),
      pointer: new THREE.Vector2(),
      clock: new THREE.Clock(),
    }
    bagRef.current = bag

    let downX = 0
    let downY = 0
    const onPointerDown = (event: PointerEvent) => {
      downX = event.clientX
      downY = event.clientY
    }
    const onPointerUp = (event: PointerEvent) => {
      if (modeRef.current !== 'ripple') return
      if (Math.hypot(event.clientX - downX, event.clientY - downY) > 6) return
      const rect = renderer.domElement.getBoundingClientRect()
      bag.pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1
      bag.pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1
      bag.raycaster.setFromCamera(bag.pointer, camera)
      const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0)
      const hit = new THREE.Vector3()
      if (!bag.raycaster.ray.intersectPlane(plane, hit)) return
      if (Math.abs(hit.x) > 5 || Math.abs(hit.z) > 5) return
      const slot = bag.ripples[bag.rippleCursor % MAX_RIPPLES]
      slot.set(hit.x, hit.z, bag.clock.getElapsedTime(), 1)
      bag.rippleCursor++
    }
    renderer.domElement.addEventListener('pointerdown', onPointerDown)
    renderer.domElement.addEventListener('pointerup', onPointerUp)

    let frameId = 0
    const animate = () => {
      frameId = requestAnimationFrame(animate)
      const dt = Math.min(0.05, bag.clock.getDelta())
      const time = bag.clock.getElapsedTime()
      const m = modeRef.current
      const p = paramsRef.current

      syncWaterUniforms(waterMaterial, p, m, time, bag.ripples)
      particles.visible = m === 'particles'
      particleMat.uniforms.uSize.value = p.particleSize

      if (m === 'particles') {
        if (bag.particleState.count !== p.particleCount) {
          const next = createParticleState(p.particleCount)
          resetParticles(next, p.particleLife)
          bag.particleState = next
          particleGeom.setAttribute('position', new THREE.BufferAttribute(next.positions, 3))
          particleGeom.setAttribute('aLife', new THREE.BufferAttribute(next.life, 1))
          particleGeom.setAttribute('aMaxLife', new THREE.BufferAttribute(next.maxLife, 1))
        }
        stepParticles(bag.particleState, dt, p.particleSpawnRate, p.particleLife)
        const posAttr = particleGeom.getAttribute('position') as THREE.BufferAttribute
        const lifeAttr = particleGeom.getAttribute('aLife') as THREE.BufferAttribute
        const maxAttr = particleGeom.getAttribute('aMaxLife') as THREE.BufferAttribute
        posAttr.needsUpdate = true
        lifeAttr.needsUpdate = true
        maxAttr.needsUpdate = true
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
      water.geometry.dispose()
      waterMaterial.dispose()
      particleGeom.dispose()
      particleMat.dispose()
      floor.geometry.dispose()
      ;(floor.material as THREE.Material).dispose()
      for (const rock of rocks) {
        rock.geometry.dispose()
        ;(rock.material as THREE.Material).dispose()
      }
      renderer.dispose()
      container.removeChild(renderer.domElement)
      bagRef.current = null
    }
  }, [])

  // Cursor + orbit buttons for ripple mode (left click = ripple, right drag = orbit)
  useEffect(() => {
    const bag = bagRef.current
    if (!bag) return
    bag.renderer.domElement.style.cursor = mode === 'ripple' ? 'crosshair' : 'default'
    bag.controls.mouseButtons.LEFT = mode === 'ripple' ? -1 as THREE.MOUSE : THREE.MOUSE.ROTATE
  }, [mode])

  return (
    <div
      ref={containerRef}
      className="three-canvas"
      aria-label="Shader study viewport"
    />
  )
}
