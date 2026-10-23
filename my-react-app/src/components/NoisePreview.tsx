import { useEffect, useRef } from 'react'
import {
  blendValues,
  colorForValue,
  createNoiseSampler,
  type NoiseLayer,
} from '../lib/noise'
import './NoisePreview.css'

type NoisePreviewProps = {
  layers: NoiseLayer[]
  noiseFieldSize: number
  onApply: () => void
  onClose: () => void
}

const PREVIEW_SIZE = 192

export default function NoisePreview({
  layers,
  noiseFieldSize,
  onApply,
  onClose,
}: NoisePreviewProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || layers.length === 0) return

    const id = requestAnimationFrame(() => {
      const ctx = canvas.getContext('2d')
      if (!ctx) return

      const size = Math.min(noiseFieldSize, 256)
      canvas.width = size
      canvas.height = size

      const colorMode = layers[0].params.colorMode
      const activeLayers = layers
        .filter((l) => l.visible)
        .map((l) => ({ layer: l, sampler: createNoiseSampler(l.params, l.shaping) }))

      const image = ctx.createImageData(size, size)
      const px = image.data

      for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
          let result = 0
          let first = true

          for (const { layer, sampler } of activeLayers) {
            const nx = (x / size) * layer.params.scale
            const ny = (y / size) * layer.params.scale
            const v = sampler.sample(nx, ny)

            if (first) {
              result = v * layer.opacity
              first = false
            } else {
              result = blendValues(result, v, layer.blendMode, layer.opacity)
            }
          }

          result = Math.min(1, Math.max(0, result))
          const [r, g, b] = colorForValue(colorMode, result)
          const offset = (y * size + x) * 4
          px[offset] = r
          px[offset + 1] = g
          px[offset + 2] = b
          px[offset + 3] = 255
        }
      }

      ctx.putImageData(image, 0, 0)
    })

    return () => cancelAnimationFrame(id)
  }, [layers, noiseFieldSize])

  return (
    <div className="noise-preview" aria-label="Noise map preview">
      <div className="noise-preview__header">
        <span className="noise-preview__title">
          Noise Preview ({layers.filter((l) => l.visible).length} layer{layers.filter((l) => l.visible).length !== 1 ? 's' : ''})
        </span>
        <button type="button" className="noise-preview__close" onClick={onClose} aria-label="Close preview">
          ×
        </button>
      </div>

      <canvas
        ref={canvasRef}
        className="noise-preview__canvas"
        style={{ width: PREVIEW_SIZE, height: PREVIEW_SIZE }}
      />

      <button type="button" className="noise-preview__apply" onClick={onApply}>
        Apply to Plane
      </button>
    </div>
  )
}
