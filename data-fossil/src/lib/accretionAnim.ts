import * as THREE from 'three'
import {
  buildFormedPlanetGeometry,
  defaultScarRadius,
  type PlanetScar,
} from './planetFormation'
import { applyStoneNoiseParams, enableStoneNoiseMaterial, type StoneScarParams } from './stoneNoiseMaterial'
import { mergeSystemBodies, type BodyCollision, type SystemBody } from './systemBodies'
import type { PlanetBody, SolarSystem } from './solarSystem'
import { orbitRadiusAt, planetDisplayScale } from './orbit'

export const ACCRETION_DURATION = 1.7

const DEBRIS_COUNT = 48
const _mid = new THREE.Vector3()
const _tmp = new THREE.Vector3()
const _orbitA = new THREE.Vector3()
const _orbitB = new THREE.Vector3()

export type AccretionAnim = {
  survivorId: string
  absorbedId: string
  collision: BodyCollision
  mergedPreview: SystemBody
  elapsed: number
  duration: number
  root: THREE.Group
  flash: THREE.Mesh
  flashLight: THREE.PointLight
  debris: THREE.Points
  debrisVel: Float32Array
  preview: THREE.Mesh
  survivorStartScale: number
  absorbedStartScale: number
  finalScale: number
  survivorMat: THREE.MeshStandardMaterial
  absorbedMat: THREE.MeshStandardMaterial
  previewMat: THREE.MeshStandardMaterial
  /** Absorbed holder world position at contact. */
  absorbWorld0: THREE.Vector3
  /** Prior scars + growing new stain on the survivor mesh during fusion. */
  survivorScarBase: StoneScarParams[]
  newScar: PlanetScar
  scarFinalRadius: number
  survivorLook: {
    colors: string[]
    colorAlts: number[]
    seed: number
    normalStrength: number
    heightBlend: number
    radiusMin: number
    radiusMax: number
  }
}

function scarsToStone(scars: PlanetScar[]): StoneScarParams[] {
  return scars.map((s) => ({
    localPoint: s.localPoint,
    color: s.color,
    radius: s.radius ?? defaultScarRadius(),
  }))
}

function easeInOut(t: number) {
  return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2
}

function orbitLocalPos(planet: PlanetBody, out: THREE.Vector3) {
  const r = orbitRadiusAt(planet.semiMajor, planet.eccentricity, planet.phase)
  return out.set(Math.cos(planet.phase) * r, 0, Math.sin(planet.phase) * r)
}

export function startAccretionAnim(
  system: SolarSystem,
  survivor: PlanetBody,
  absorbed: PlanetBody,
  collision: BodyCollision,
  survivorBody: SystemBody,
  absorbedBody: SystemBody,
): AccretionAnim {
  const mergedPreview = mergeSystemBodies(survivorBody, absorbedBody, collision)
  const built = buildFormedPlanetGeometry(mergedPreview.planet)
  const survivorBuilt = buildFormedPlanetGeometry(survivorBody.planet)
  const newScar =
    mergedPreview.planet.scars[mergedPreview.planet.scars.length - 1] ??
    ({
      fossilId: absorbedBody.planet.baseId,
      color: collision.color,
      localPoint: collision.localPoint,
      direction: collision.direction,
      radius: defaultScarRadius(survivorBody.planet.scars.length),
    } satisfies PlanetScar)
  const scarFinalRadius = newScar.radius ?? defaultScarRadius(survivorBody.planet.scars.length)
  const survivorScarBase = scarsToStone(survivorBody.planet.scars)
  const survivorLook = {
    colors: survivorBuilt.params.stoneColors,
    colorAlts: survivorBuilt.params.colorAlts,
    seed: survivorBuilt.seed,
    normalStrength: survivorBuilt.params.normalStrength,
    heightBlend: survivorBuilt.params.heightBlend,
    radiusMin: survivorBuilt.radiusMin,
    radiusMax: survivorBuilt.radiusMax,
  }
  // Contact frame: keep the survivor look; the new stain starts tiny at the impact.
  applyStoneNoiseParams(survivor.material, {
    ...survivorLook,
    noiseScale: 2.4,
    scars: [
      ...survivorScarBase,
      { localPoint: newScar.localPoint, color: newScar.color, radius: 0.02 },
    ],
  })
  survivorBuilt.geometry.dispose()

  const root = new THREE.Group()
  root.name = 'accretionFx'
  system.root.add(root)

  const flashGeo = new THREE.SphereGeometry(0.08, 16, 12)
  const flashMat = new THREE.MeshBasicMaterial({
    color: 0xffe2a8,
    transparent: true,
    opacity: 0.95,
    depthWrite: false,
  })
  const flash = new THREE.Mesh(flashGeo, flashMat)
  root.add(flash)

  const flashLight = new THREE.PointLight(0xffd9a0, 2.4, 3.5, 2)
  root.add(flashLight)

  const positions = new Float32Array(DEBRIS_COUNT * 3)
  const debrisVel = new Float32Array(DEBRIS_COUNT * 3)
  survivor.holder.getWorldPosition(_orbitA)
  absorbed.holder.getWorldPosition(_orbitB)
  _mid.lerpVectors(_orbitA, _orbitB, 0.5)
  for (let i = 0; i < DEBRIS_COUNT; i++) {
    positions[i * 3] = _mid.x
    positions[i * 3 + 1] = _mid.y
    positions[i * 3 + 2] = _mid.z
    const dir = new THREE.Vector3(
      Math.random() * 2 - 1,
      Math.random() * 2 - 1,
      Math.random() * 2 - 1,
    )
    if (dir.lengthSq() < 1e-6) dir.set(1, 0.2, 0)
    dir.normalize().multiplyScalar(0.55 + Math.random() * 1.1)
    debrisVel[i * 3] = dir.x
    debrisVel[i * 3 + 1] = dir.y
    debrisVel[i * 3 + 2] = dir.z
  }
  const debrisGeo = new THREE.BufferGeometry()
  debrisGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  const debrisColor = new THREE.Color(collision.color || '#c4b49a')
  const debrisMat = new THREE.PointsMaterial({
    color: debrisColor,
    size: 0.05,
    transparent: true,
    opacity: 0.92,
    depthWrite: false,
    sizeAttenuation: true,
  })
  const debris = new THREE.Points(debrisGeo, debrisMat)
  root.add(debris)

  flash.position.copy(_mid)
  flashLight.position.copy(_mid)

  const previewMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    roughness: 1,
    metalness: 0,
    transparent: true,
    opacity: 0,
    depthWrite: false,
  })
  enableStoneNoiseMaterial(previewMat)
  applyStoneNoiseParams(previewMat, {
    colors: built.params.stoneColors,
    colorAlts: built.params.colorAlts,
    seed: built.seed,
    normalStrength: built.params.normalStrength,
    noiseScale: 2.4,
    heightBlend: built.params.heightBlend,
    radiusMin: built.radiusMin,
    radiusMax: built.radiusMax,
    scars: built.scars,
  })
  const preview = new THREE.Mesh(built.geometry, previewMat)
  const finalScale = planetDisplayScale(mergedPreview.orbit.size)
  preview.scale.setScalar(finalScale * 0.55)
  survivor.holder.add(preview)

  const survivorMat = survivor.material
  const absorbedMat = absorbed.material
  survivorMat.transparent = true
  absorbedMat.transparent = true
  survivorMat.depthWrite = true
  absorbedMat.depthWrite = true

  const absorbWorld0 = new THREE.Vector3()
  absorbed.holder.getWorldPosition(absorbWorld0)

  // Hide absorbed orbit line during merge (still animate the mesh).
  absorbed.orbitLine.visible = false

  return {
    survivorId: survivor.id,
    absorbedId: absorbed.id,
    collision: {
      ...collision,
      phase: survivor.phase,
      nodeAngle: survivor.nodeAngle,
      orbit: { ...mergedPreview.orbit },
    },
    mergedPreview,
    elapsed: 0,
    duration: ACCRETION_DURATION,
    root,
    flash,
    flashLight,
    debris,
    debrisVel,
    preview,
    survivorStartScale: survivor.mesh.scale.x,
    absorbedStartScale: absorbed.mesh.scale.x,
    finalScale,
    survivorMat,
    absorbedMat,
    previewMat,
    absorbWorld0,
    survivorScarBase,
    newScar,
    scarFinalRadius,
    survivorLook,
  }
}

/**
 * Advance the visible merge. Returns true when finished (caller should commit merge).
 * Survivor keeps orbiting; absorbed slides in; debris bursts then falls back.
 */
export function tickAccretionAnim(
  anim: AccretionAnim,
  system: SolarSystem,
  dt: number,
  playing: boolean,
): boolean {
  const survivor = system.planets.find((p) => p.id === anim.survivorId)
  const absorbed = system.planets.find((p) => p.id === anim.absorbedId)
  if (!survivor || !absorbed) return true

  anim.elapsed += dt
  const t = Math.min(1, anim.elapsed / anim.duration)
  const e = easeInOut(t)

  // Survivor keeps orbiting; absorbed slides from contact toward the survivor.
  if (playing) {
    survivor.phase += dt * survivor.orbitSpeed
    absorbed.phase += dt * absorbed.orbitSpeed
    survivor.mesh.rotation.y += dt * survivor.spinSpeed
    absorbed.mesh.rotation.y += dt * absorbed.spinSpeed * 1.15
  }
  orbitLocalPos(survivor, _orbitA)
  survivor.holder.position.copy(_orbitA)
  survivor.holder.updateWorldMatrix(true, false)
  survivor.holder.getWorldPosition(_tmp)
  // World target for absorbed: lerp contact start → current survivor center.
  _orbitB.copy(anim.absorbWorld0).lerp(_tmp, e)
  absorbed.pivot.worldToLocal(_orbitB)
  absorbed.holder.position.copy(_orbitB)

  // Contact midpoint for FX (world).
  survivor.holder.getWorldPosition(_orbitA)
  absorbed.holder.getWorldPosition(_orbitB)
  _mid.lerpVectors(_orbitA, _orbitB, 0.5)

  const flashPeak = t < 0.18 ? t / 0.18 : Math.max(0, 1 - (t - 0.18) / 0.35)
  anim.flash.position.copy(_mid)
  anim.flashLight.position.copy(_mid)
  anim.flash.scale.setScalar(0.7 + flashPeak * 2.2)
  ;(anim.flash.material as THREE.MeshBasicMaterial).opacity = 0.15 + flashPeak * 0.85
  anim.flashLight.intensity = flashPeak * 3.2

  const pos = anim.debris.geometry.getAttribute('position') as THREE.BufferAttribute
  const pull = e * e
  for (let i = 0; i < DEBRIS_COUNT; i++) {
    const ix = i * 3
    // Burst out early, then get sucked toward the merge center.
    const burst = Math.min(1, t / 0.35)
    const vx = anim.debrisVel[ix]!
    const vy = anim.debrisVel[ix + 1]!
    const vz = anim.debrisVel[ix + 2]!
    const ox = _mid.x + vx * burst * (1 - pull * 0.92)
    const oy = _mid.y + vy * burst * (1 - pull * 0.92)
    const oz = _mid.z + vz * burst * (1 - pull * 0.92)
    pos.setXYZ(i, ox, oy, oz)
  }
  pos.needsUpdate = true
  ;(anim.debris.material as THREE.PointsMaterial).opacity = t < 0.75 ? 0.85 : 0.85 * (1 - (t - 0.75) / 0.25)

  // Grow the absorbed color out from the contact site along the rock grain.
  const stain = easeInOut(Math.min(1, Math.max(0, (t - 0.08) / 0.72)))
  applyStoneNoiseParams(anim.survivorMat, {
    ...anim.survivorLook,
    noiseScale: 2.4,
    scars: [
      ...anim.survivorScarBase,
      {
        localPoint: anim.newScar.localPoint,
        color: anim.newScar.color,
        radius: Math.max(0.02, anim.scarFinalRadius * stain),
      },
    ],
  })

  // Overlap: keep both source colors early, then crossfade into the finished mesh.
  const fadeOut = 1 - Math.min(1, Math.max(0, (t - 0.28) / 0.65))
  const fadeIn = Math.min(1, Math.max(0, (t - 0.32) / 0.6))
  anim.survivorMat.opacity = 0.3 + fadeOut * 0.7
  anim.absorbedMat.opacity = fadeOut
  anim.previewMat.opacity = fadeIn
  anim.previewMat.depthWrite = fadeIn > 0.55

  const sScale = THREE.MathUtils.lerp(anim.survivorStartScale, anim.finalScale, e)
  const aScale = THREE.MathUtils.lerp(anim.absorbedStartScale, anim.finalScale * 0.15, e)
  survivor.mesh.scale.setScalar(sScale)
  absorbed.mesh.scale.setScalar(Math.max(0.02, aScale))
  anim.preview.scale.setScalar(THREE.MathUtils.lerp(anim.finalScale * 0.55, anim.finalScale, fadeIn))

  anim.collision.phase = survivor.phase
  anim.collision.nodeAngle = survivor.nodeAngle

  return t >= 1
}

export function disposeAccretionAnim(anim: AccretionAnim | null | undefined) {
  if (!anim) return
  anim.flash.removeFromParent()
  anim.flash.geometry.dispose()
  ;(anim.flash.material as THREE.Material).dispose()
  anim.flashLight.removeFromParent()
  anim.debris.removeFromParent()
  anim.debris.geometry.dispose()
  ;(anim.debris.material as THREE.Material).dispose()
  anim.preview.removeFromParent()
  anim.preview.geometry.dispose()
  anim.previewMat.dispose()
  if (anim.root.parent) anim.root.parent.remove(anim.root)
  // Restore material flags on survivors if they somehow remain (rebuild usually replaces them).
  anim.survivorMat.transparent = false
  anim.survivorMat.opacity = 1
  anim.absorbedMat.transparent = false
  anim.absorbedMat.opacity = 1
  void _tmp
}
