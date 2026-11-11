import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import { buildFossilGeometry } from '../lib/buildFossilGeometry'
import { enableStoneNoiseMaterial, applyStoneNoiseParams } from '../lib/stoneNoiseMaterial'
import { DEFAULT_FOSSIL_PARAMS, DEFAULT_LIGHTING } from '../lib/types'
import './HomeHeroCanvas.css'

const SPIN = 0.18
const HOME_CAM = new THREE.Vector3(2.35, 1.15, 2.7)

/** Slow-turning studio fossil for the landing page — same stone look as the project. */
export default function HomeHeroCanvas() {
  const hostRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const host = hostRef.current
    if (!host) return

    const scene = new THREE.Scene()
    scene.background = new THREE.Color(0xe4e2de)

    const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 100)
    camera.position.copy(HOME_CAM)
    camera.lookAt(0, 0, 0)

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.setSize(host.clientWidth, host.clientHeight)
    renderer.toneMapping = THREE.ACESFilmicToneMapping
    renderer.toneMappingExposure = 1.05
    host.appendChild(renderer.domElement)

    const k = DEFAULT_LIGHTING.key
    const ambient = new THREE.AmbientLight(0xd4d1cb, k * 0.82)
    const hemi = new THREE.HemisphereLight(0xe8e4de, 0xa8a49c, k * 0.58)
    const key = new THREE.DirectionalLight(0xf0ece6, k * 0.32)
    key.position.set(2.8, 4.2, 3)
    const fill = new THREE.DirectionalLight(0xc8c5bf, k * 0.16)
    fill.position.set(-3.2, 1.6, 2.4)
    const rim = new THREE.DirectionalLight(0xcfcbc4, k * 0.05)
    rim.position.set(-1.6, 2.8, -3.4)
    scene.add(ambient, hemi, key, fill, rim)

    const material = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 1,
      metalness: 0,
      flatShading: false,
    })
    enableStoneNoiseMaterial(material)

    const { geometry, seed, radiusMin, radiusMax } = buildFossilGeometry({
      ...DEFAULT_FOSSIL_PARAMS,
      digits: '1208',
    })
    applyStoneNoiseParams(material, {
      colors: DEFAULT_FOSSIL_PARAMS.stoneColors,
      colorAlts: DEFAULT_FOSSIL_PARAMS.colorAlts,
      seed,
      normalStrength: DEFAULT_FOSSIL_PARAMS.normalStrength,
      noiseScale: 2.4,
      heightBlend: DEFAULT_FOSSIL_PARAMS.heightBlend,
      radiusMin,
      radiusMax,
    })

    const rock = new THREE.Mesh(geometry, material)
    scene.add(rock)

    const clock = new THREE.Clock()
    let frame = 0
    const resize = () => {
      const w = host.clientWidth
      const h = host.clientHeight
      if (w <= 0 || h <= 0) return
      camera.aspect = w / h
      camera.updateProjectionMatrix()
      renderer.setSize(w, h)
    }
    resize()
    const ro = new ResizeObserver(resize)
    ro.observe(host)

    const tick = () => {
      frame = requestAnimationFrame(tick)
      const dt = clock.getDelta()
      rock.rotation.y += dt * SPIN
      renderer.render(scene, camera)
    }
    tick()

    return () => {
      cancelAnimationFrame(frame)
      ro.disconnect()
      geometry.dispose()
      material.dispose()
      renderer.dispose()
      if (renderer.domElement.parentNode === host) host.removeChild(renderer.domElement)
    }
  }, [])

  return <div className="home-hero-canvas" ref={hostRef} aria-hidden />
}
