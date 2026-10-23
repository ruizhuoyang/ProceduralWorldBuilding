# Environment (Atmosphere)

Time of day, sun direction, and sun intensity for the **3D World** view. Fog / clouds / weather presets were removed from the side panel; weather-like motion lives under **Particles**.

Keep lighting simple for a class project. Animated weather belongs in the particle system, not as mesh rain or cloud puffs in the Environment accordion.

```mermaid
flowchart TD
  UI[EnvironmentParams — time / sun] --> Compute[computeEnvironment]
  Compute --> State[Sky + light colors]
  State --> Scene[environmentScene update]
  Scene --> Lights[Directional + ambient]
  Scene --> Sky[Sky dome]
```

- Side panel: **Environment** accordion (below Class 06 tabs) → Time of Day, Play Day Cycle, Sun Direction, Sun Intensity.
- **Camera** accordion sits last (reset / store / recall view).
- `computeEnvironment` still accepts legacy weather fields in the type for internal defaults; the UI only exposes time and sun.
- Day cycle can auto-advance time and report back to React state (throttled).

## Code

- [`environment.ts`](../../my-react-app/src/lib/environment.ts)
- [`environmentScene.ts`](../../my-react-app/src/lib/environmentScene.ts)
- Wired in [`ThreeCanvas.tsx`](../../my-react-app/src/components/ThreeCanvas.tsx) and Environment / Camera in [`SidePanel.tsx`](../../my-react-app/src/components/SidePanel.tsx)
- Weather particles: [`lib/particles/`](../../my-react-app/src/lib/particles/) · [particles-vector-fields.md](particles-vector-fields.md)

## Screenshot

Environment accordion (time of day / sun) sits under the Class 06 tabs in **3D World**:

![3D World — Environment under distributions](../../my-react-app/docs/assets/01-3d-terrain.png)
