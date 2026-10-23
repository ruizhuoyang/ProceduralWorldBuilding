import { useEffect, useRef, useState, type ReactNode } from 'react'

export function FieldLabel({
  htmlFor,
  tip,
  value,
  children,
}: {
  htmlFor?: string
  tip: string
  value?: string
  children: string
}) {
  const body = (
    <>
      <span className="controls__name" data-tip={tip} tabIndex={0}>
        {children}
      </span>
      {value !== undefined ? <span className="controls__value">{value}</span> : null}
    </>
  )
  if (htmlFor) {
    return (
      <label className="controls__label" htmlFor={htmlFor}>
        {body}
      </label>
    )
  }
  return <span className="controls__label">{body}</span>
}

export function SwitchRow({
  id,
  tip,
  checked,
  onChange,
  children,
}: {
  id: string
  tip: string
  checked: boolean
  onChange: (value: boolean) => void
  children: string
}) {
  return (
    <div className="switch-row">
      <span className="controls__name" data-tip={tip} tabIndex={0}>
        {children}
      </span>
      <button
        id={id}
        type="button"
        className={`switch ${checked ? 'is-on' : ''}`}
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
      >
        <span className="switch__knob" />
      </button>
    </div>
  )
}

export function PaletteSelect<T extends string>({
  id,
  value,
  options,
  onChange,
}: {
  id: string
  value: T
  options: { value: T; label: string }[]
  onChange: (value: T) => void
}) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const current = options.find((item) => item.value === value) ?? options[0]

  useEffect(() => {
    if (!open) return
    const onDoc = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false)
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDoc)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  return (
    <div className="field-select" ref={rootRef}>
      <button
        id={id}
        type="button"
        className="field-select__btn"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        {current?.label ?? value}
      </button>
      {open ? (
        <ul className="field-select__menu" role="listbox" aria-labelledby={id}>
          {options.map((item) => (
            <li key={item.value}>
              <button
                type="button"
                role="option"
                aria-selected={item.value === value}
                className={
                  item.value === value ? 'field-select__option is-active' : 'field-select__option'
                }
                onClick={() => {
                  onChange(item.value)
                  setOpen(false)
                }}
              >
                {item.label}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  )
}

export function PaletteShell({
  label,
  children,
}: {
  label: string
  children: ReactNode
}) {
  return (
    <aside className="controls" aria-label={`${label} palette`}>
      <p className="controls__palette-label">{label}</p>
      {children}
    </aside>
  )
}
