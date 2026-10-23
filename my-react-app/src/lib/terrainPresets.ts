import { createLayer, DEFAULT_NOISE_PARAMS, DEFAULT_SHAPING, type NoiseLayer } from './noise'

/**
 * Class 03 style stack: Layer 1 = Perlin + power curve, Layer 2 = Perlin + ridged
 * blend. Both still contribute; Edit picks which layer's equation/shaping you tune.
 */
export function createCalibratedLayers(): NoiseLayer[] {
  return [
    createLayer({
      name: 'Layer 1',
      blendMode: 'add',
      params: {
        ...DEFAULT_NOISE_PARAMS,
        type: 'perlin',
        scale: 2.5,
        octaves: 6,
        persistence: 0.5,
        lacunarity: 2,
        colorMode: 'grayscale',
      },
      shaping: { ...DEFAULT_SHAPING, op: 'power', power: 1.3 },
    }),
    createLayer({
      name: 'Layer 2',
      blendMode: 'overlay',
      opacity: 0.4,
      params: {
        ...DEFAULT_NOISE_PARAMS,
        type: 'perlin',
        scale: 4,
        octaves: 5,
        persistence: 0.5,
        lacunarity: 2.1,
        seed: 7919,
        colorMode: 'grayscale',
      },
      shaping: { ...DEFAULT_SHAPING, op: 'ridged' },
    }),
  ]
}
