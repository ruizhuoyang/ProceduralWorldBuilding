import { formatLatLon, type SurfaceMemoryInfo } from '../lib/planetFormation'

type MemoryCardProps = {
  memory: SurfaceMemoryInfo
  /** When the source fossil was first made (history entry), if known. */
  fossilBornAt?: number
  /** Planet the walker is standing on. */
  hostLabel?: string
  /** Impact imprints on this planet in total. */
  impactTotal: number
}

function pad2(n: number) {
  return n.toString().padStart(2, '0')
}

function fmtDate(ms?: number) {
  if (!ms || !Number.isFinite(ms)) return null
  const d = new Date(ms)
  return `${d.getFullYear()}.${pad2(d.getMonth() + 1)}.${pad2(d.getDate())}`
}

function fmtTime(ms?: number) {
  if (!ms || !Number.isFinite(ms)) return null
  const d = new Date(ms)
  return `${fmtDate(ms)} · ${pad2(d.getHours())}:${pad2(d.getMinutes())}`
}

/** Body of the surface memory card: digits, note, survey data and the fossil's journey. */
export default function MemoryCard({ memory, fossilBornAt, hostLabel, impactTotal }: MemoryCardProps) {
  const rec = memory.record
  const impact = memory.kind !== 'native'
  const host = rec?.hostLabel ?? hostLabel ?? 'this planet'

  const journey: Array<{ when: string | null; text: string }> = []
  journey.push({
    when: fmtDate(fossilBornAt),
    text: `Fossil ${memory.digits || '—'} shaped from its digits`,
  })
  if (impact) {
    if (rec?.absorbedLabel) {
      journey.push({
        when: fmtTime(rec.absorbedJoinedAt),
        text: `Set in orbit as ${rec.absorbedLabel}`,
      })
    }
    journey.push({
      when: fmtTime(rec?.at),
      text:
        `Struck ${host}` +
        (rec?.carried ? ` — carrying ${rec.carried} older imprint${rec.carried === 1 ? '' : 's'}` : ''),
    })
    journey.push({
      when: null,
      text: memory.craterRadius
        ? `Blasted a crater ${(memory.craterRadius * 2).toFixed(2)} u across into the crust`
        : 'Pressed its outline into the crust',
    })
  } else {
    journey.push({ when: fmtTime(rec?.at), text: `Became ${host}; its vein marks the origin` })
  }

  const rows: Array<[string, string]> = [['Site', formatLatLon(memory.localPoint)]]
  if (rec?.at) rows.push([impact ? 'Struck' : 'Formed', fmtTime(rec.at)!])
  if (impact && rec?.impactAngleDeg !== undefined) rows.push(['Angle', `${rec.impactAngleDeg}° from zenith`])
  if (impact && rec?.impactSpeed) rows.push(['Speed', `${rec.impactSpeed.toFixed(2)} u/s`])
  if (impact && memory.craterRadius) rows.push(['Crater', `⌀ ${(memory.craterRadius * 2).toFixed(2)} u`])
  if (impact) {
    rows.push([
      'Layer',
      rec?.generation ? `Imprint ${rec.generation} of ${Math.max(impactTotal, rec.generation)}` : `Imprint · ${impactTotal} on ${host}`,
    ])
  } else {
    rows.push(['Layer', 'Origin vein'])
  }

  return (
    <>
      <p className="app__memory-card-kicker">{impact ? 'Fossil imprint' : 'Origin vein'}</p>
      <p className="app__memory-card-digits">{memory.digits || '—'}</p>
      {memory.memoryNote ? <p className="app__memory-card-note">{memory.memoryNote}</p> : null}
      <dl className="app__memory-card-meta">
        {rows.map(([k, v]) => (
          <div key={k} className="app__memory-card-row">
            <dt>{k}</dt>
            <dd>{v}</dd>
          </div>
        ))}
      </dl>
      <ol className="app__memory-card-journey" aria-label="Journey">
        {journey.map((step, i) => (
          <li key={i}>
            {step.when ? <span className="app__memory-card-when">{step.when}</span> : null}
            <span>{step.text}</span>
          </li>
        ))}
      </ol>
    </>
  )
}
