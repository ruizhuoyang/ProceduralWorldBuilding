import {
  blendValues,
  colorForValue,
  createNoiseSampler,
  type NoiseLayer,
  type NoiseSampler,
} from './noise'

/** Pan of the sampled window, in map widths (1 = one full map to the right/down). */
export type MapOffset = { x: number; y: number }

export const ZERO_OFFSET: MapOffset = { x: 0, y: 0 }

/**
 * Renders multi-layer noise into an offscreen canvas for 3D texture use.
 */
export function generateNoiseTexture(
  layers: NoiseLayer[],
  size: number,
  offset: MapOffset = ZERO_OFFSET,
): HTMLCanvasElement {
  const colorMode = layers[0]?.params.colorMode ?? 'grayscale'
  return heightmapToTexture(generateHeightfield(layers, size, offset), size, colorMode)
}

/**
 * Generates a Float32Array of composited 0..1 values for displacement.
 */
export function generateHeightfield(
  layers: NoiseLayer[],
  size: number,
  offset: MapOffset = ZERO_OFFSET,
): Float32Array {
  const active = prepareLayers(layers)
  const data = new Float32Array(size * size)
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      data[y * size + x] = compositeLayers(active, x / size + offset.x, y / size + offset.y)
    }
  }
  return data
}

/**
 * Renders a raw Float32Array heightmap (0..1) into a coloured offscreen canvas.
 */
export function heightmapToTexture(
  heightmap: Float32Array,
  size: number,
  colorMode: import('./noise').ColorMode = 'terrain',
): HTMLCanvasElement {
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size

  const ctx = canvas.getContext('2d')!
  const image = ctx.createImageData(size, size)
  const px = image.data

  for (let i = 0; i < heightmap.length; i++) {
    const v = Math.min(1, Math.max(0, heightmap[i]))
    const [r, g, b] = colorForValue(colorMode, v)
    const off = i * 4
    px[off] = r
    px[off + 1] = g
    px[off + 2] = b
    px[off + 3] = 255
  }

  ctx.putImageData(image, 0, 0)
  return canvas
}

type ActiveLayer = { layer: NoiseLayer; sampler: NoiseSampler }

/** Builds each visible layer's sampler once, instead of once per pixel. */
export function prepareLayers(layers: NoiseLayer[]): ActiveLayer[] {
  return layers
    .filter((l) => l.visible)
    .map((layer) => ({ layer, sampler: createNoiseSampler(layer.params, layer.shaping) }))
}

/** Composites layers at map coordinates `(u, v)`, where one map width = 1. */
export function compositeLayers(active: ActiveLayer[], u: number, v: number): number {
  let result = 0
  let first = true

  for (const { layer, sampler } of active) {
    const value = sampler.sample(u * layer.params.scale, v * layer.params.scale)

    if (first) {
      result = value * layer.opacity
      first = false
    } else {
      result = blendValues(result, value, layer.blendMode, layer.opacity)
    }
  }

  return Math.min(1, Math.max(0, result))
}
