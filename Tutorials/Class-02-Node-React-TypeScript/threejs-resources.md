# Three.js + React — Resources & Example Projects

A curated list of sites, demos, and open-source projects to help you imagine what is possible. Start with the **Learning path** section if you are new.

---

## Learning Path (recommended order)

1. **Three.js fundamentals** — Understand scenes, cameras, meshes, lights (you already have this in your app).
2. **Browse official examples** — Skim what exists; pick 2–3 that excite you.
3. **Try React Three Fiber (R3F)** — Same Three.js engine, but components fit naturally into React.
4. **Study one full project** — Clone a repo, run it locally, change one thing at a time.
5. **Build a small idea** — One scene, one interaction (slider controls a color, scroll moves the camera, etc.).

---

## Official Documentation (start here)

| Resource | URL | Why it matters |
|----------|-----|----------------|
| Three.js Manual | https://threejs.org/manual/ | Best beginner-friendly explanations |
| Three.js Docs | https://threejs.org/docs/ | API reference |
| Three.js Examples | https://threejs.org/examples/ | 100+ live demos with source code — **gold mine** |
| React Three Fiber Docs | https://r3f.docs.pmnd.rs/ | React + Three.js (declarative style) |
| Drei (R3F helpers) | https://github.com/pmndrs/drei | Orbit controls, loaders, text, effects — saves hours |
| Poimandres / pmndrs | https://github.com/pmndrs | Maintainers of R3F, Zustand, and related tools |

### Three.js examples worth opening first

| Example | What it shows |
|---------|----------------|
| [webgl_geometry_cube](https://threejs.org/examples/#webgl_geometry_cube) | Basics — you already have this |
| [webgl_materials_physical_clearcoat](https://threejs.org/examples/#webgl_materials_physical_clearcoat) | Realistic materials |
| [webgl_shaders_ocean](https://threejs.org/examples/#webgl_shaders_ocean) | Custom shaders |
| [webgl_postprocessing_unreal_bloom](https://threejs.org/examples/#webgl_postprocessing_unreal_bloom) | Glow / bloom effects |
| [webgl_instancing_morph](https://threejs.org/examples/#webgl_instancing_morph) | Many objects at once (performance) |
| [webgl_loader_gltf](https://threejs.org/examples/#webgl_loader_gltf) | Import 3D models (.glb / .gltf) |
| [webgl_points_waves](https://threejs.org/examples/#webgl_points_waves) | Particle-like point clouds |
| [webgl_interactive_cubes_gpu](https://threejs.org/examples/#webgl_interactive_cubes_gpu) | Click / hover interaction |

---

## Live Galleries & Inspiration (no code, but sparks ideas)

| Site | URL | What you will see |
|------|-----|-------------------|
| Awwwards — WebGL | https://www.awwwards.com/websites/webgl/ | Award-winning interactive sites |
| Codrops | https://tympanus.net/codrops/ | Tutorials + experimental UI / WebGL |
| Three.js Showcase | https://threejs.org/ | Featured community work |
| Bruno Simon | https://bruno-simon.com/ | Drive a jeep through a 3D world — famous portfolio |
| Lusion | https://lusion.co/ | Studio-grade real-time 3D |
| Active Theory | https://activetheory.net/ | Large-scale immersive web experiences |
| Immersive Garden | https://www.immersive-garden.com/ | Creative studio references |
| Neort | https://neort.io/ | Digital art / creative coding gallery |

---

## Paid Course (worth it if you learn by doing)

| Course | URL | Notes |
|--------|-----|-------|
| Three.js Journey | https://threejs-journey.com/ | By Bruno Simon; project-based; very popular |
| Three.js Journey — Discord | (included with course) | Community help when you get stuck |

---

## YouTube Channels

| Channel | URL | Focus |
|---------|-----|-------|
| Wawa Sensei | https://www.youtube.com/@wawasensei | React Three Fiber tutorials, beginner-friendly |
| Three.js Journey (free snippets) | https://www.youtube.com/@ThreejsJourney | Short tips from the course author |
| Simon Dev | https://www.youtube.com/@SimonDev | Game-dev-style graphics explained clearly |
| Fireship | https://www.youtube.com/@Fireship | Quick overviews of tools and concepts |

---

## Open-Source Projects to Study (with code)

Clone these, run locally, and read the source. Sorted from simpler to advanced.

### Beginner-friendly

| Project | Link | What you can learn |
|---------|------|-------------------|
| **Vite + R3F starter patterns** | https://r3f.docs.pmnd.rs/getting-started/your-first-scene | Minimal React scene — closest to your setup |
| **R3F — Scroll controls** | https://docs.pmnd.rs/react-three-fiber/tutorials/scroll-controls | Tie 3D camera to page scroll |
| **Three.js Portfolio (Plattnericus)** | https://github.com/Plattnericus/ThreeJS_Portfolio · [Live](https://threejs.plattnericus.dev/) | Data-driven 3D world (GitHub stars → 3D village) |
| **r3f-dogstudio** | https://github.com/ExploitEngineer/r3f-dogstudio · [Live](https://r3f-dogstudio.vercel.app/) | Scroll-driven 3D like a creative studio site |

### Intermediate

| Project | Link | What you can learn |
|---------|------|-------------------|
| **Advanced_UI (Sai-Teja-Meka)** | https://github.com/Sai-Teja-Meka/Advanced_UI | Shaders, physics feel, React UI + 3D together |
| **Hari Houdini Portfolio** | https://github.com/hari-houdini/me-portfolio · [Live](https://harihoudini.dev/) | Procedural 3D, post-processing, scroll narrative |
| **pmndrs — react-three-next** | https://github.com/pmndrs/react-three-next | Next.js + R3F production template |
| **pmndrs — game-demo** | https://github.com/pmndrs/react-three-rapier) | 3D physics in React (games, falling objects) |

### Advanced

| Project | Link | What you can learn |
|---------|------|-------------------|
| **0xAnakin/editor** | https://github.com/0xAnakin/editor | Full 3D editor — walls, furniture, undo/redo |
| **three.js editor (official)** | https://threejs.org/editor/ · [Source](https://github.com/mrdoob/three.js/tree/dev/editor) | Scene builder built on Three.js itself |
| **Poimandres — vfx** | https://github.com/pmndrs/vfx | Particle / visual effects in R3F |

---

## Code Sandboxes (experiment in the browser)

| Platform | URL | Notes |
|----------|-----|-------|
| CodeSandbox — R3F | https://codesandbox.io/search?query=react-three-fiber | Fork and tweak instantly |
| StackBlitz — R3F | https://stackblitz.com/search?query=react-three-fiber | Fast startup, no install |
| Three.js Editor | https://threejs.org/editor/ | Drag-and-drop scene building; export JSON |

---

## Ideas: What Could *You* Build?

Use this table to connect **ideas** to **techniques** you would need to learn.

| Project idea | Three.js / React skills involved |
|--------------|----------------------------------|
| **Interactive product viewer** (rotate a shoe, change color) | GLTF loader, OrbitControls, material color from React state |
| **Music visualizer** | Audio analyser, buffer geometry, shaders, `useFrame` loop |
| **Generative art / daily sketch** | Noise functions, instancing, random seeds, export as image |
| **Mini game** (collect items, simple physics) | Raycasting (click), collision, Rapier physics + R3F |
| **Data visualization in 3D** | Bar charts as boxes, scale from JSON, labels with Drei `<Text>` |
| **Architectural walkthrough** | GLTF scene, camera paths, scroll or click navigation |
| **Particle field controlled by sliders** | Points material, your side panel → React state → uniforms |
| **Portfolio with one hero scene** | One polished scene + minimal UI (like your current layout) |
| **Shader playground** | Custom GLSL, tweak params with sliders in your side panel |
| **Timeline / keyframe animator** | GSAP or custom; store keyframes in React state |

---

## Techniques Map (when you see something cool)

| You see… | Look up… |
|----------|----------|
| Realistic lighting | PBR materials, environment maps (HDRI), `MeshStandardMaterial` |
| Glow / bloom | Post-processing (`@react-three/postprocessing`) |
| Smooth scroll + 3D | GSAP ScrollTrigger, R3F ScrollControls |
| Custom look (water, glitch) | Fragment shaders (GLSL) |
| 3D text | Drei `<Text>`, `<Text3D>`, or font loaders |
| Import Blender models | Export as `.glb`, use `useGLTF` from Drei |
| Many trees / rocks | InstancedMesh, or Drei `<Instances>` |
| Click to select objects | Raycaster, pointer events in R3F |
| Performance issues | Lower polygon count, instancing, lazy load, `dpr` cap |

---

## Libraries to Know (React ecosystem)

| Library | Purpose |
|---------|---------|
| `@react-three/fiber` | React renderer for Three.js |
| `@react-three/drei` | Helpers (controls, loaders, HTML overlay, etc.) |
| `@react-three/postprocessing` | Bloom, depth of field, vignette |
| `@react-three/rapier` | Physics engine |
| `leva` | Debug panel with sliders (great for prototyping) |
| `gsap` | Timeline animation (UI + camera) |
| `zustand` | Simple global state (share values between UI and 3D) |

---

## Suggested First Study Session (~2 hours)

1. Open https://threejs.org/examples/ — click **5 random examples**, read each source file for 5 minutes.
2. Open https://bruno-simon.com/ — ask: what is 3D vs 2D UI overlay?
3. Fork one CodeSandbox R3F demo — change mesh color and camera position.
4. In **your** app: connect one side-panel slider to cube rotation (small step toward interactivity).

---

## Keep This List Growing

When you find something inspiring, add a row:

```markdown
| Name | URL | Notes |
|------|-----|-------|
| ... | ... | What you liked |
```

---

## Version

- **v1.0** — Initial resource list for Procedural World Building
