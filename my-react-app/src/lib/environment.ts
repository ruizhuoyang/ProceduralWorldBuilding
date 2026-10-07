// ─────────────────────────────────────────────────────────
// Environment — time of day, sun and weather → lighting & sky
//
// Pure function of the UI parameters; the Three.js objects that
// consume the result live in environmentScene.ts.
// ─────────────────────────────────────────────────────────

import * as THREE from 'three'

export type Weather = 'clear' | 'cloudy' | 'rain'

export type EnvironmentParams = {
  /** Hours, 0..24. */
  timeOfDay: number
  /** Advance the time automatically. */
  dayCycle: boolean
  /** Compass direction of the sun's path, degrees. */
  sunAzimuth: number
  /** Multiplier on the sunlight. */
  sunIntensity: number
  weather: Weather
  clouds: boolean
  /** 0..1 share of the cloud pool that is shown. */
  cloudCover: number
}

export const DEFAULT_ENVIRONMENT: EnvironmentParams = {
  timeOfDay: 14,
  dayCycle: false,
  sunAzimuth: 35,
  sunIntensity: 1,
  weather: 'clear',
  clouds: false,
  cloudCover: 0.2,
}

/** A full day passes in one minute while the day cycle plays. */
export const DAY_CYCLE_HOURS_PER_SECOND = 24 / 60

type WeatherPreset = {
  label: string
  /** Cloud cover applied when this weather is selected. */
  cloudCover: number
  /** Sunlight multiplier. */
  light: number
  /** 0..1 blend of the sky and clouds toward overcast grey. */
  overcast: number
  /** Extra FogExp2 density on top of the Fog toggle. */
  fog: number
  /** 0..1 rain strength. */
  rain: number
  /** Cloud drift speed, world units per second. */
  wind: number
}

export const WEATHER_PRESETS: Record<Weather, WeatherPreset> = {
  clear: { label: 'Clear', cloudCover: 0.2, light: 1, overcast: 0, fog: 0, rain: 0, wind: 0.25 },
  cloudy: { label: 'Cloudy', cloudCover: 0.75, light: 0.6, overcast: 0.5, fog: 0.008, rain: 0, wind: 0.4 },
  rain: { label: 'Rain', cloudCover: 1, light: 0.35, overcast: 0.8, fog: 0.028, rain: 1, wind: 0.7 },
}

export const WEATHERS = Object.keys(WEATHER_PRESETS) as Weather[]

export type EnvironmentState = {
  /** Unit vector pointing toward the sun. */
  sunDirection: THREE.Vector3
  sunColor: THREE.Color
  sunIntensity: number
  /** 0..1 how visible the sun disc is. */
  sunDisc: number
  moonIntensity: number
  ambientColor: THREE.Color
  ambientIntensity: number
  zenithColor: THREE.Color
  horizonColor: THREE.Color
  cloudColor: THREE.Color
  starOpacity: number
  fogDensity: number
  rain: number
  wind: number
}

const NIGHT_ZENITH = new THREE.Color(0x050814)
const NIGHT_HORIZON = new THREE.Color(0x121b30)
const DAY_ZENITH = new THREE.Color(0x3d7fd1)
const DAY_HORIZON = new THREE.Color(0xa9cdea)
const SUNSET_ZENITH = new THREE.Color(0x4a4f8a)
const SUNSET_HORIZON = new THREE.Color(0xf08a4b)
const OVERCAST = new THREE.Color(0x8e98a5)
const SUN_LOW = new THREE.Color(0xffa865)
const SUN_HIGH = new THREE.Color(0xfff4e0)
const CLOUD_NIGHT = new THREE.Color(0x1c2233)
const CLOUD_DAY = new THREE.Color(0xffffff)
const CLOUD_SUNSET = new THREE.Color(0xf2a07b)
/** How far the noon sun leans away from straight overhead. */
const SUN_TILT = THREE.MathUtils.degToRad(25)

const clamp01 = (v: number) => Math.min(1, Math.max(0, v))
const smoothstep = (a: number, b: number, v: number) => {
  const t = clamp01((v - a) / (b - a))
  return t * t * (3 - 2 * t)
}

export function formatTimeOfDay(hours: number): string {
  const total = Math.round(hours * 60) % (24 * 60)
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`
}

export function computeEnvironment(params: EnvironmentParams): EnvironmentState {
  const preset = WEATHER_PRESETS[params.weather]

  // Sunrise at 06:00 in the east, highest at 12:00, sunset at 18:00.
  const angle = ((params.timeOfDay - 6) / 24) * Math.PI * 2
  const up = Math.sin(angle)
  const sunDirection = new THREE.Vector3(Math.cos(angle), up * Math.cos(SUN_TILT), up * Math.sin(SUN_TILT))
    .applyAxisAngle(new THREE.Vector3(0, 1, 0), THREE.MathUtils.degToRad(params.sunAzimuth))
    .normalize()
  const elevation = sunDirection.y

  const day = smoothstep(-0.12, 0.2, elevation)
  const twilight = clamp01(1 - Math.abs(elevation) / 0.25)
  const sunUp = smoothstep(-0.05, 0.1, elevation)

  const overcast = OVERCAST.clone().multiplyScalar(0.25 + 0.75 * day)
  const zenithColor = NIGHT_ZENITH.clone()
    .lerp(DAY_ZENITH, day)
    .lerp(SUNSET_ZENITH, twilight * 0.5)
    .lerp(overcast, preset.overcast)
  const horizonColor = NIGHT_HORIZON.clone()
    .lerp(DAY_HORIZON, day)
    .lerp(SUNSET_HORIZON, twilight * 0.8 * (1 - preset.overcast))
    .lerp(overcast, preset.overcast)

  const sunColor = SUN_LOW.clone().lerp(SUN_HIGH, smoothstep(0, 0.4, elevation))
  const cloudColor = CLOUD_NIGHT.clone()
    .lerp(CLOUD_DAY, day)
    .lerp(CLOUD_SUNSET, twilight * 0.45 * (1 - preset.overcast))
    .multiplyScalar(1 - preset.overcast * 0.6)

  return {
    sunDirection,
    sunColor,
    sunIntensity: 1.3 * sunUp * preset.light * params.sunIntensity,
    sunDisc: sunUp * (1 - preset.overcast * 0.85),
    moonIntensity: 0.2 * (1 - sunUp) * (1 - preset.overcast * 0.5),
    ambientColor: horizonColor.clone().lerp(new THREE.Color(0xffffff), 0.5),
    ambientIntensity: 0.18 + 0.37 * day,
    zenithColor,
    horizonColor,
    cloudColor,
    starOpacity: (1 - day) * (1 - preset.overcast),
    fogDensity: preset.fog,
    rain: preset.rain,
    wind: preset.wind,
  }
}
