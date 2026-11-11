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
import {
  setCollisionAbsorbTarget,
  spawnCollisionDebris,
  type FxParticleSystem,
} from './fxParticles'

export const ACCRETION_DURATION = 1.7

const _mid = new THREE.Vector3()
const _tmp = new THREE.Vector3()
const _orbitA = new THREE.Vector3()
const _orbitB = new THREE.Vector3()
const _impactDir = new THREE.Vector3()

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
    imprintProfile: s.imprintProfile,
    imprintSeed: s.imprintSeed,
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
  fx?: FxParticleSystem | null,
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
      kind: 'impact',
      digits: absorbedBody.planet.digits,
      memoryNote: '',
      imprintProfile: absorbedBody.planet.scars.find((s) => s.kind === 'impact')?.imprintProfile,
      imprintSeed: absorbedBody.planet.seed,
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
  // Contact frame: keep the survivor look; the new imprint starts tiny at the impact.
  applyStoneNoiseParams(survivor.material, {
    ...survivorLook,
    noiseScale: 2.4,
    scars: [
      ...survivorScarBase,
      {
        localPoint: newScar.localPoint,
        color: newScar.color,
        radius: 0.02,
        imprintProfile: newScar.imprintProfile,
        imprintSeed: newScar.imprintSeed,
      },
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

  survivor.holder.getWorldPosition(_orbitA)
  absorbed.holder.getWorldPosition(_orbitB)
  _mid.lerpVectors(_orbitA, _orbitB, 0.5)
  flash.position.copy(_mid)
  flashLight.position.copy(_mid)

  // Dual-stream debris (return arc + scatter) in the shared FX system.
  if (fx) {
    _impactDir.set(...collision.direction)
    if (_impactDir.lengthSq() < 1e-8) _impactDir.subVectors(_orbitA, _orbitB)
    if (_impactDir.lengthSq() < 1e-8) _impactDir.set(1, 0.1, 0)
    // Direction is stored as flight toward the planet; convert to world via survivor pivot.
    survivor.holder.updateWorldMatrix(true, false)
    _impactDir.transformDirection(survivor.holder.matrixWorld)
    spawnCollisionDebris(fx, {
      origin: _mid.clone(),
      color: collision.color || '#c4b49a',
      impactDir: _impactDir,
      absorbTarget: _orbitA.clone(),
    })
  }

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
  fx?: FxParticleSystem | null,
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

  if (fx) setCollisionAbsorbTarget(fx, _orbitA)

  // Grow the fossil imprint out from the contact site.
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
        imprintProfile: anim.newScar.imprintProfile,
        imprintSeed: anim.newScar.imprintSeed,
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
