# Style Guide — Procedural World Building

Visual language for the app UI. Inspired by **TouchDesigner** and **Max/MSP**: dense, technical, dark, and parameter-driven.

---

## Design Principles

1. **Tool-first, not marketing-first** — The UI is a control surface. Clarity and density beat decoration.
2. **Dark by default** — The 3D canvas is the focus. UI recedes into dark panels.
3. **One highlight color** — A single accent for active states, values, and focus. Everything else is neutral gray.
4. **Small type, tight spacing** — Fit more controls on screen. Labels stay readable; body text stays compact.
5. **Flat and sharp** — No gradients, no drop shadows, minimal border-radius. Panels are separated by 1px lines.
6. **Monospace for data** — Numbers, parameter names, and status strings use a mono face. Prose uses sans-serif.

---

## Color Palette

### Core tokens

| Token | Hex | Usage |
|-------|-----|--------|
| `--bg-deep` | `#0a0b0d` | App background, canvas surround |
| `--bg-panel` | `#141619` | Side panels, headers, parameter rows |
| `--bg-panel-raised` | `#1a1d22` | Hovered rows, inset control backgrounds |
| `--bg-input` | `#0f1114` | Slider tracks, text fields |
| `--border` | `#2e333b` | Panel dividers, control outlines |
| `--border-subtle` | `#23262c` | Inner grid lines, secondary separators |
| `--text-primary` | `#b8bcc4` | Labels, body copy |
| `--text-secondary` | `#6b7280` | Hints, disabled labels, section headers |
| `--text-bright` | `#e8eaed` | Active values, titles |
| `--accent` | `#3ecf8e` | **Single highlight** — active slider, focus ring, selected tab, links |
| `--accent-dim` | `#3ecf8e33` | Accent at ~20% opacity for subtle fills |
| `--accent-hover` | `#52e09e` | Hover state on accent elements |
| `--danger` | `#c44` | Errors only (exception to one-accent rule) |

### Rules

- **Never** introduce a second brand color (no purple buttons + green sliders).
- Accent is for **interaction and emphasis**, not large background areas.
- Canvas background (`Three.js`) should stay close to `--bg-deep` so the viewport feels continuous with the shell.

### TouchDesigner / Max/MSP reference

| Tool | What we borrow |
|------|----------------|
| TouchDesigner | Dark charcoal panels, bold parameter highlights, uppercase section labels |
| Max/MSP | Dense parameter rows, thin borders, monospace numbers, minimal chrome |

---

## Typography

### Font stacks

```css
--font-sans: "Segoe UI", system-ui, -apple-system, sans-serif;
--font-mono: "Consolas", "SF Mono", "Cascadia Mono", ui-monospace, monospace;
```

### Scale (small, technical)

| Role | Size | Weight | Font | Case | Example |
|------|------|--------|------|------|---------|
| App title | `13px` | 600 | sans | uppercase | `PROCEDURAL WORLD BUILDING` |
| Section label | `10px` | 600 | sans | uppercase | `CONTROLS` |
| Parameter label | `11px` | 400 | sans | as-is | `Rotation` |
| Parameter value | `11px` | 500 | **mono** | as-is | `0.742` |
| Hint / footer | `10px` | 400 | sans | as-is | `Sliders will go here soon.` |
| Body (rare) | `11px` | 400 | sans | as-is | Short descriptions only |

### Rules

- Default UI base size: **`11px`**. Do not exceed `13px` except for rare hero moments.
- Line height: **`1.35`** for labels, **`1.2`** for mono values.
- Letter-spacing: **`0.06em`** on uppercase section labels.
- Avoid long paragraphs in the UI. Use one-line hints.

---

## Layout & Spacing

### Grid

- Base unit: **`4px`**. All padding and gaps should be multiples of 4 (`4`, `8`, `12`, `16`).
- Side panel width: **`220px`** (narrow, TD-like). Max **`260px`** on wide screens.
- Header height: **`32px`** — single compact bar, not a marketing hero.

### Structure

```text
┌─────────────────────────────────────────────────────────┐
│ HEADER  32px  — title left, optional status mono right   │
├───────────────────────────────────────┬─────────────────┤
│                                       │  SIDE PANEL     │
│         3D VIEWPORT (flex)            │  220px fixed    │
│                                       │  scroll inside  │
└───────────────────────────────────────┴─────────────────┘
```

### Borders

- Panel separation: **`1px solid var(--border)`**.
- No rounded corners on panels. Controls: **`border-radius: 2px`** max.

---

## Components

### Header

- Background: `--bg-panel`
- Title: `13px`, uppercase, `--text-bright`
- Subtitle (if any): `10px`, `--text-secondary`, same line or directly below with `2px` gap
- Bottom border only — no shadow

### Side panel

- Background: `--bg-panel`
- Section title: `10px`, uppercase, `--text-secondary`, `letter-spacing: 0.06em`
- Parameter row: label left, value right (mono), control full width below
- Row padding: `8px 12px`
- Row gap between parameters: `12px`

### Sliders (future)

- Track: `--bg-input`, height `4px`, radius `0`
- Fill / thumb accent: `--accent`
- Disabled: `opacity: 0.4`, `cursor: not-allowed`
- Label above, numeric value to the right in mono (e.g. `Rotation  0.50`)

### Buttons (when added)

- Height: `24px`, padding `0 10px`, font `11px`
- Default: `--bg-panel-raised`, border `1px solid var(--border)`, text `--text-primary`
- Primary / active: border-color `--accent`, text `--accent`
- No filled accent buttons unless it is the single primary action on screen

### Inputs (when added)

- Background: `--bg-input`
- Border: `1px solid var(--border)`
- Focus: `outline: 1px solid var(--accent)` — no glow blur
- Text: `11px` mono for numeric inputs

---

## 3D Viewport

- Scene background: **`#0a0b0d`** (match `--bg-deep`)
- Grid helper: low contrast — line colors near `#252932` / `#1e2228`
- Default mesh accent may echo UI highlight (`#3ecf8e`) or stay neutral gray — pick one per scene, not both fighting for attention
- No UI overlays on the canvas except essential gizmos

---

## CSS Variables (copy-ready)

Add or align these in `my-react-app/src/index.css`:

```css
:root {
  /* Backgrounds */
  --bg-deep: #0a0b0d;
  --bg-panel: #141619;
  --bg-panel-raised: #1a1d22;
  --bg-input: #0f1114;

  /* Borders */
  --border: #2e333b;
  --border-subtle: #23262c;

  /* Text */
  --text-primary: #b8bcc4;
  --text-secondary: #6b7280;
  --text-bright: #e8eaed;

  /* Single highlight */
  --accent: #3ecf8e;
  --accent-dim: rgba(62, 207, 142, 0.2);
  --accent-hover: #52e09e;

  /* Typography */
  --font-sans: "Segoe UI", system-ui, -apple-system, sans-serif;
  --font-mono: "Consolas", "SF Mono", "Cascadia Mono", ui-monospace, monospace;
  --text-xs: 10px;
  --text-sm: 11px;
  --text-md: 13px;

  /* Layout */
  --header-height: 32px;
  --panel-width: 220px;
  --space-1: 4px;
  --space-2: 8px;
  --space-3: 12px;
  --space-4: 16px;

  font-family: var(--font-sans);
  font-size: var(--text-sm);
  line-height: 1.35;
  color: var(--text-primary);
  background: var(--bg-deep);
}
```

---

## Do / Don't

| Do | Don't |
|----|--------|
| Uppercase 10px section headers | Large 24px+ marketing headings |
| Mono for numbers and parameters | Mixed fonts on the same row |
| 1px flat borders | Card shadows and heavy elevation |
| One accent color for active UI | Rainbow sliders or multicolor icons |
| Compact 32px header | Tall hero banners |
| Let the canvas dominate | Bright white panels |

---

## File Map

| File | Role |
|------|------|
| `my-react-app/src/index.css` | Global tokens, base typography |
| `my-react-app/src/App.css` | Shell layout (header, main) |
| `my-react-app/src/components/SidePanel.css` | Parameter panel patterns |
| `my-react-app/src/components/ThreeCanvas.css` | Viewport container (full bleed) |

This guide lives at `Style-guides/STYLE-GUIDE.md` in the documentation vault.

When adding new UI, create component-scoped CSS that **only uses tokens** from this guide — no hard-coded hex in component files.

---

## Version

- **v1.1** — Green accent (`#3ecf8e`)
- **v1.0** — Initial spec (TouchDesigner / Max/MSP inspired, dark UI)
