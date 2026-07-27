# Goniometer Overlay — MVP Product Requirements Document

**Version:** 1.0 (MVP)
**Platforms:** Windows 10/11 (x64), macOS 12+ (Apple Silicon + Intel)
**Deliverable:** Signed, double-clickable installer. No terminal, no Node.js install, no config files.

---

## 1. Problem & Goal

Designers frequently need to draw or align objects at a precise angle, but many design tools either lack a numeric angle input or bury it several clicks deep. The workaround today is eyeballing it.

**Goal:** A lightweight utility that floats a goniometer on top of everything else on screen. The user positions it, sets an angle, and uses the on-screen guide rays as a visual reference while working normally in any other application.

**The core promise:** the overlay is always visible but never in the way.

### 1.1 Terminology

The measurement tool is a **goniometer** — a protractor with two hinged arms, as used in physical therapy and drafting. Use these terms consistently in code, comments, and UI copy:

| Term | Meaning |
|---|---|
| **Fulcrum** | The pivot point at the center of the dial. Both arms rotate around it. |
| **Stationary arm** | The reference arm. Conventionally aligned with the baseline you're measuring against. |
| **Moving arm** | The arm the user rotates to the target angle. |
| **Dial** | The circular face carrying the degree ticks and labels. |
| **Guide ray** | The infinite extension of an arm out to the screen edge. This is the digital-only feature — a physical goniometer's arms stop where the plastic ends. |

Both arms are rotatable in this app, despite the name. "Stationary" is the anatomical convention, not a constraint.

---

## 2. Scope

### In scope for MVP

| # | Feature |
|---|---------|
| F1 | Transparent, always-on-top overlay covering each display |
| F2 | Goniometer dial with degree tick marks and labels |
| F3 | Two rotatable arms that extend as infinite guide rays to the screen edges |
| F4 | Drag to move the goniometer; drag handles to rotate arms |
| F5 | Live angle readout (angle between arms + each arm's absolute angle) |
| F6 | Angle snapping (default 1°, hold Shift for 15°, hold Alt for free rotation) |
| F7 | Numeric angle entry — click the readout, type a value, press Enter |
| F8 | Hit-test passthrough — clicks pass through except on the goniometer itself |
| F9 | Global hotkeys: show/hide, lock/unlock |
| F10 | System tray / menu bar icon with menu (essential — the window has no title bar to close) |
| F11 | Copy current angle to clipboard |
| F12 | State persists across restarts |
| F13 | Adjustable overlay opacity and goniometer size |

### Explicitly out of scope for MVP

- Linux support
- Computer-vision detection of angles from screen pixels
- Sending synthetic keyboard/mouse input to other applications
- Moving one goniometer between displays (each display gets its own independent instance)
- Auto-update
- Multiple goniometers per display
- Distance/length measurement

---

## 3. Tech Stack

| Layer | Choice | Version |
|---|---|---|
| Runtime | Electron | `^31.0.0` |
| Language | TypeScript | `^5.4.0` |
| Build tooling | electron-vite | `^2.3.0` |
| Renderer UI | Vanilla TypeScript + inline SVG | — |
| Persistence | electron-store | `^8.2.0` (v9+ is ESM-only; stay on v8) |
| Packaging | electron-builder | `^24.13.0` |
| Toolchain pinning | Volta | latest — see §9.2 |

**No React, no CSS framework.** The entire UI is one SVG element and one small HTML input. Adding a framework would slow this project down, not speed it up.

**Scaffold the project with:**
```bash
npm create @quick-start/electron@latest goniometer-overlay -- --template vanilla-ts
```

---

## 4. Core Concepts (read this before writing code)

### 4.1 The window never moves

This is the single most important architectural idea in the app, and it is counterintuitive.

You might assume that "dragging the goniometer around the desktop" means moving an Electron window. **It does not.** Moving transparent always-on-top windows is slow, flickers, and creates edge cases at display boundaries.

Instead: **the overlay window is created at the exact size and position of the display and never moves again.** It is a full-screen invisible sheet of glass. The goniometer is an SVG group *inside* that window, and "dragging the goniometer" means updating an `x, y` coordinate in the renderer and applying a CSS/SVG transform.

Everything gets simpler once you internalize this.

### 4.2 Passthrough

The window covers the entire display, so by default it would swallow every click on that display. To prevent this, the window is set to ignore mouse events:

```ts
win.setIgnoreMouseEvents(true, { forward: true })
```

The `forward: true` flag is what makes this app possible. It means: *ignore clicks, but keep sending me `mousemove` events anyway.* So the renderer can still track where the cursor is, and when the cursor moves over the goniometer's pixels, the renderer asks the main process to turn passthrough **off** — making the goniometer clickable. When the cursor leaves, passthrough goes back on.

The result: the goniometer feels like a real floating object, and the rest of the screen behaves as if the app weren't running.

`forward: true` is supported on Windows and macOS only. This is why Linux is out of scope.

### 4.3 Angle convention

Screen coordinates have Y increasing **downward**, but users think in standard math orientation. Normalize once, in one place:

- **0°** = pointing right (east)
- **Angles increase counter-clockwise** — 90° points up, 180° left, 270° down
- Range is `[0, 360)`

```ts
// geometry.ts
export function pointToAngle(cx: number, cy: number, px: number, py: number): number {
  const deg = Math.atan2(-(py - cy), px - cx) * (180 / Math.PI)
  return (deg + 360) % 360
}

export function angleToPoint(cx: number, cy: number, angle: number, radius: number) {
  const rad = angle * (Math.PI / 180)
  return { x: cx + radius * Math.cos(rad), y: cy - radius * Math.sin(rad) }
}
```

Note the negated Y in both functions. Get this right once and never think about it again.

---

## 5. Visual Specification

### 5.1 Goniometer anatomy

```
                   moving arm handle
                         ●
                        /
        guide ray  ····/·············→  (extends to screen edge)
                      /
         ╭──────────╱───────────╮
        │      ·  ·│·  ·         │      ← dial (ticks + labels)
        │    ·     │      ·      │
        │   ·      ●───────·─────│──────→  (stationary arm guide ray)
        │    ·  fulcrum      ·   │        ●  stationary arm handle
        │      ·  ·  ·  ·  ·     │
         ╰───────────────────────╯
                 ┌─────────┐
                 │  47.5°  │             ← readout badge
                 └─────────┘
```

### 5.2 Dimensions and colors

| Element | Spec |
|---|---|
| Dial radius | 150 px default, range 80–400 px |
| Dial face | `rgba(255,255,255,0.14)`, 1px border `rgba(0,0,0,0.35)` |
| Minor ticks | Every 1°, length 5 px, `rgba(0,0,0,0.30)`, 1 px wide |
| Medium ticks | Every 5°, length 9 px, `rgba(0,0,0,0.50)`, 1 px wide |
| Major ticks | Every 10°, length 14 px, `rgba(0,0,0,0.75)`, 1.5 px wide |
| Degree labels | Every 10°, 10 px sans-serif, `rgba(0,0,0,0.8)`, placed just inside the dial edge |
| Fulcrum handle | Filled circle, radius 6 px visual / **12 px hit radius**, `#5f6368` |
| Stationary arm | 1.5 px solid line, `#1a73e8` (blue) |
| Moving arm | 1.5 px solid line, `#d93025` (red) |
| Guide rays | Same colors at 60% opacity, extend from center to screen edge |
| Arm handles | Filled circle, radius 7 px visual / **14 px hit radius**, matching arm color |
| Readout badge | Rounded rect, `rgba(255,255,255,0.92)`, 1 px border, 13 px monospace text |

**Every stroke needs a contrasting outline.** The overlay sits on unknown backgrounds — a dark line vanishes on a dark canvas. Give each line a 3 px `rgba(255,255,255,0.6)` stroke rendered underneath the colored stroke. This is a two-line SVG change and it is the difference between a usable tool and an unusable one.

### 5.3 Readout content

```
∠ 47.5°     S 120.0°   M 72.5°
```

`∠` is the angle between the two arms — always the smaller of the two possible angles, so it stays in `[0, 180]`. `S` and `M` are the absolute screen angles of the stationary and moving arms.

The `∠` value is the primary number and should be visually dominant; `S` and `M` are secondary and rendered smaller and dimmer.

---

## 6. Interaction Specification

### 6.1 Modes

| Mode | Behavior | How to enter |
|---|---|---|
| **Active** (default) | Passthrough auto-toggles based on cursor position. Goniometer is draggable. | Default state |
| **Locked** | Passthrough always on. Goniometer visible but completely inert. | `Ctrl/Cmd + Shift + L`, or tray menu |
| **Hidden** | Overlay window hidden entirely. | `Ctrl/Cmd + Shift + P`, or tray menu |

Locked mode exists because sometimes the user needs to click exactly where the goniometer is sitting.

### 6.2 Mouse interactions

| Target | Action | Result |
|---|---|---|
| Fulcrum handle | Drag | Moves whole goniometer |
| Stationary or moving arm handle | Drag | Rotates that arm around the fulcrum |
| Arm handle | Drag + `Shift` | Snaps to 15° increments |
| Arm handle | Drag + `Alt` | Free rotation, no snapping, 0.1° precision |
| Readout badge | Click | Enters numeric entry mode |
| Dial | Drag | Moves whole goniometer (same as fulcrum handle) |
| Mouse wheel over dial | Scroll | Resizes dial radius, 10 px per notch |

Default snapping (no modifier) is 1°.

### 6.3 Numeric entry

Clicking the readout replaces it with a text input. The user types a number and presses `Enter` to set **the moving arm's angle relative to the stationary arm**. `Escape` cancels.

Accept values in `[-360, 360]`; normalize into range and treat negatives as clockwise. Reject non-numeric input by silently ignoring the keystroke rather than showing an error.

**This requires a focus trick.** The overlay window is created with `focusable: false` so it never steals focus from the user's design tool — which would destroy their selection state every time they nudged the goniometer. But a non-focusable window cannot receive keyboard input.

So numeric entry temporarily makes the window focusable:

```ts
// renderer, on readout click
await window.api.setFocusable(true)
input.focus()

// on Enter or Escape
await window.api.setFocusable(false)
```

```ts
// main, IPC handler
ipcMain.handle('overlay:set-focusable', (e, focusable: boolean) => {
  const win = BrowserWindow.fromWebContents(e.sender)
  win?.setFocusable(focusable)
  if (focusable) win?.focus()
})
```

Also set `isDragging = true` equivalent during entry so passthrough stays off while typing.

### 6.4 Keyboard shortcuts

**Global** (registered via Electron's `globalShortcut`, work even when the app has no focus):

| Shortcut | Action |
|---|---|
| `Ctrl/Cmd + Shift + P` | Toggle overlay visibility |
| `Ctrl/Cmd + Shift + L` | Toggle locked mode |
| `Ctrl/Cmd + Shift + C` | Copy current angle to clipboard |

Register these at startup. `globalShortcut.register` returns `false` if another app already owns the combination — if that happens, show a tray notification rather than failing silently.

**Local** (only while the goniometer is focused during numeric entry): `Enter`, `Escape`.

---

## 7. Technical Architecture

### 7.1 Process layout

```
Main process
├── Creates one overlay window per display
├── Owns passthrough / focusable flags
├── Registers global shortcuts
├── Owns the tray icon and menu
├── Reads/writes persisted settings
└── Handles clipboard writes

Preload script (contextIsolated)
└── Exposes a narrow, typed `window.api` surface

Renderer (one per display)
├── Renders the SVG goniometer
├── Tracks cursor position and runs hit testing
├── Handles all drag / rotate / snap logic
└── Requests passthrough changes via IPC
```

### 7.2 Window creation

```ts
// src/main/windows.ts
import { BrowserWindow, screen } from 'electron'

export function createOverlayWindow(display: Electron.Display): BrowserWindow {
  const { x, y, width, height } = display.bounds

  const win = new BrowserWindow({
    x, y, width, height,
    transparent: true,
    frame: false,
    hasShadow: false,
    resizable: false,
    movable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    focusable: false,
    show: false,
    webPreferences: {
      preload: /* path to preload */,
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  win.setAlwaysOnTop(true, 'screen-saver')
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
  win.setIgnoreMouseEvents(true, { forward: true })

  return win
}
```

**Three traps to avoid:**

1. **Never set `backgroundColor` alongside `transparent: true`.** It silently kills transparency. Also make sure your CSS `body` background is `transparent`, not `white`.
2. **Use `'screen-saver'` as the always-on-top level.** The default level sits below fullscreen apps on macOS, so the overlay would disappear the moment the user goes fullscreen in their design tool.
3. **Create one window per display.** Do not create a single window spanning all displays. Displays with different DPI scaling inside one window render blurry or mispositioned on Windows.

Handle `screen.on('display-added')` and `screen.on('display-removed')` to create/destroy windows accordingly.

### 7.3 Hit testing

```ts
// src/renderer/hittest.ts
type Handle = 'fulcrum' | 'armStationary' | 'armMoving' | 'readout' | 'dial' | null

export function hitTest(state: GoniometerState, mx: number, my: number): Handle {
  const { cx, cy, radius, angleStationary, angleMoving } = state

  const dx = mx - cx, dy = my - cy
  const dist = Math.hypot(dx, dy)

  if (dist <= 12) return 'fulcrum'

  const hS = angleToPoint(cx, cy, angleStationary, radius)
  if (Math.hypot(mx - hS.x, my - hS.y) <= 14) return 'armStationary'

  const hM = angleToPoint(cx, cy, angleMoving, radius)
  if (Math.hypot(mx - hM.x, my - hM.y) <= 14) return 'armMoving'

  if (pointInRect(mx, my, readoutBounds(state))) return 'readout'

  if (dist <= radius) return 'dial'

  return null
}
```

Note that the **infinite guide rays are deliberately not hit-testable.** If they were, thin interactive strips would stretch across the entire screen and users would constantly catch them by accident.

### 7.4 The passthrough loop

```ts
// src/renderer/main.ts
let currentlyInteractive = false
let isDragging = false
let pending: number | null = null

window.addEventListener('mousemove', (e) => {
  if (pending !== null) return
  pending = requestAnimationFrame(() => {
    pending = null
    handleMove(e.clientX, e.clientY)
  })
})

function handleMove(mx: number, my: number) {
  if (isDragging) { updateDrag(mx, my); return }

  const hit = hitTest(state, mx, my)
  const shouldBeInteractive = hit !== null && !state.locked

  if (shouldBeInteractive !== currentlyInteractive) {
    currentlyInteractive = shouldBeInteractive
    window.api.setPassthrough(!shouldBeInteractive)
  }

  setCursorForHandle(hit)
}
```

**Critical detail:** while `isDragging` is true, never re-enable passthrough. The user's cursor will move outside the small handle hit region during a drag, and if passthrough flips back on mid-drag the goniometer will stick and the drag will be lost to whatever is underneath. Set `isDragging = true` on `mousedown`, `false` on `mouseup`.

Throttle with `requestAnimationFrame`. Firing IPC on every raw `mousemove` will flood the main process.

### 7.5 IPC contract

Define this once and don't deviate.

```ts
// src/preload/index.ts
import { contextBridge, ipcRenderer } from 'electron'

const api = {
  setPassthrough: (ignore: boolean) =>
    ipcRenderer.send('overlay:set-passthrough', ignore),

  setFocusable: (focusable: boolean) =>
    ipcRenderer.invoke('overlay:set-focusable', focusable),

  saveState: (state: GoniometerState) =>
    ipcRenderer.send('overlay:save-state', state),

  loadState: (): Promise<GoniometerState> =>
    ipcRenderer.invoke('overlay:load-state'),

  copyToClipboard: (text: string) =>
    ipcRenderer.send('overlay:copy', text),

  onLockChanged: (cb: (locked: boolean) => void) =>
    ipcRenderer.on('overlay:lock-changed', (_e, locked) => cb(locked)),

  getDisplayId: (): Promise<number> =>
    ipcRenderer.invoke('overlay:get-display-id')
}

contextBridge.exposeInMainWorld('api', api)
export type Api = typeof api
```

Add a `src/renderer/env.d.ts` declaring `declare global { interface Window { api: Api } }` so TypeScript recognizes it.

### 7.6 State model

```ts
export interface GoniometerState {
  cx: number          // fulcrum X, window-relative px
  cy: number          // fulcrum Y, window-relative px
  radius: number      // dial radius px, 80–400
  angleStationary: number      // absolute angle, [0, 360)
  angleMoving: number      // absolute angle, [0, 360)
  opacity: number     // 0.3–1.0
  snapIncrement: number // degrees, default 1
  locked: boolean
}
```

Persisted per display via electron-store, keyed by display ID:

```ts
// src/main/store.ts
import Store from 'electron-store'

const store = new Store<{ displays: Record<string, GoniometerState> }>({
  defaults: { displays: {} }
})
```

Debounce saves — write at most once every 500 ms during a drag, not on every frame.

**Guard on load:** a persisted center point may fall outside the current display bounds if the user changed resolution. Clamp `cx`/`cy` into bounds on load, and fall back to the display center if the stored values are invalid.

### 7.7 Tray icon (do not skip this)

The overlay window is frameless, skips the taskbar, and on macOS has no dock icon. **Without a tray icon there is literally no way to quit the app.** This is a required MVP feature, not a nice-to-have.

Tray menu:
- Show / Hide Overlay
- Lock / Unlock  *(checkbox)*
- Reset Position
- Opacity submenu (30% / 50% / 70% / 100%)
- —
- Quit

macOS requires a template image named `trayTemplate.png` (and `trayTemplate@2x.png`) — a solid black-and-transparent icon — so it adapts to light and dark menu bars. Windows needs a `.ico`.

Set `app.dock.hide()` on macOS at startup, and add `"LSUIElement": true` to the Info.plist via electron-builder config, so no dock icon appears.

---

## 8. Project Structure

```
goniometer-overlay/
├── package.json
├── tsconfig.json
├── electron.vite.config.ts
├── electron-builder.yml
├── build/
│   ├── icon.ico              # 256x256, Windows
│   ├── icon.icns             # macOS app icon
│   ├── trayTemplate.png      # 16x16 macOS tray
│   ├── trayTemplate@2x.png   # 32x32
│   └── tray.ico              # Windows tray
└── src/
    ├── main/
    │   ├── index.ts          # app lifecycle, display watching
    │   ├── windows.ts        # overlay window factory
    │   ├── ipc.ts            # all ipcMain handlers
    │   ├── tray.ts
    │   ├── shortcuts.ts
    │   └── store.ts
    ├── preload/
    │   └── index.ts
    ├── shared/
    │   └── types.ts          # GoniometerState, imported by main + renderer
    └── renderer/
        ├── index.html
        ├── main.ts           # entry, event wiring, passthrough loop
        ├── goniometer.ts     # SVG construction + render
        ├── geometry.ts       # angle math
        ├── hittest.ts
        └── style.css
```

---

## 9. Development Environment Isolation

The requirement: working on this project must not disturb any other development environment on the machine, and vice versa.

### 9.1 What is already isolated (no work needed)

`npm install` writes to `./node_modules` inside the project directory. There is no global package directory to pollute, so the problem that Python's `venv` exists to solve does not exist here by default. Two Electron projects on the same machine with conflicting dependency versions coexist without any tooling.

### 9.2 Pinning the toolchain — the part that actually needs solving

The one genuinely global resource is the **Node binary on `PATH`**. If another project on the machine needs a different Node major version, that is a real conflict.

Use **Volta**. It is chosen over `nvm` because it has first-class Windows support and because it pins versions in `package.json` rather than in a shell hook — so there is no `activate` step for a developer to forget.

Install:
```bash
# macOS
curl https://get.volta.sh | bash

# Windows (PowerShell)
winget install Volta.Volta
```

Pin, from inside the project directory:
```bash
volta pin node@20.18.0
volta pin npm@10.8.2
```

This writes into `package.json`:
```json
{
  "volta": {
    "node": "20.18.0",
    "npm": "10.8.2"
  },
  "engines": {
    "node": ">=20.0.0"
  }
}
```

After this, `cd`-ing into the project directory makes `node` resolve to 20.18.0 automatically, and `cd`-ing out restores whatever the rest of the machine uses. No activation, no shell state, identical behavior on Windows and macOS.

Commit both `package.json` and `package-lock.json`. A fresh clone plus `npm ci` must reproduce the exact dependency tree.

> **Alternative:** if you also want to pin a Python version for the same repository, use [`mise`](https://mise.jdx.dev) instead — it manages Node and Python together from a single `.mise.toml`. Pick one tool or the other; running both will produce confusing `PATH` conflicts.

### 9.3 Never install globally

Do not run `npm install -g` for anything this project uses. Every tool goes in `devDependencies` and is invoked through an npm script:

```json
"devDependencies": {
  "electron": "^31.0.0",
  "electron-builder": "^24.13.0",
  "electron-vite": "^2.3.0",
  "typescript": "^5.4.0"
},
"scripts": {
  "dev": "electron-vite dev",
  "build": "electron-vite build",
  "typecheck": "tsc --noEmit",
  "package:win": "npm run build && electron-builder --win",
  "package:mac": "npm run build && electron-builder --mac"
}
```

A globally installed `electron-builder` at a different version than the project's is a classic source of "works on my machine" packaging failures. Volta additionally shims global installs per-project if one is ever unavoidable.

### 9.4 Shared caches — leave these alone

Electron downloads its ~100 MB runtime binary into a machine-wide cache:

- macOS: `~/Library/Caches/electron`
- Windows: `%LOCALAPPDATA%\electron\Cache`

`electron-builder` maintains a similar cache for platform tooling. These are **immutable artifacts keyed by version number**, not mutable shared state. Two projects on different Electron versions store different files side by side and do not interfere.

You *can* redirect them per-project with the `ELECTRON_CACHE` and `ELECTRON_BUILDER_CACHE` environment variables. Do not bother. It costs hundreds of megabytes of redundant downloads to solve a problem that does not occur in practice.

### 9.5 Why this project must not be developed in Docker

Containers are the usual answer to "isolate my environment," and they are the wrong answer here. Document the reasoning so nobody proposes it mid-project:

1. This app is *entirely* about native window behavior — transparency, always-on-top layering, click-through passthrough. None of that exists inside a headless Linux container. You would be unable to test the only hard part of the product.
2. `electron-builder` cannot produce macOS `.dmg` artifacts or run notarization from a Linux container. macOS builds require macOS.
3. The target platforms are Windows and macOS. A Linux container tests neither.

### 9.6 Clean-machine verification (do this before shipping)

Isolation cuts both ways: a dev machine hides problems that a user's machine will not. Before any release, install the packaged build on a **clean VM** — a fresh Windows 11 image and a fresh macOS image with no developer tooling.

This is where you will catch:
- SmartScreen and Gatekeeper warnings at their real severity
- Missing Visual C++ redistributables
- Global shortcut conflicts with software you do not have installed locally
- First-run behavior with no persisted settings file

VirtualBox or Hyper-V works for Windows. For macOS, use a second user account or a spare machine — macOS VMs on non-Apple hardware are a licensing and configuration headache not worth taking on for this.

### 9.7 Runtime isolation (dev build vs installed build)

This one is not about the development environment but belongs with it, and it *will* cause a confusing bug around step 9 of the build order if skipped.

`electron-store` writes settings into the OS user-data directory keyed by app name. A dev build running from `npm run dev` and an installed copy of the app therefore **share one settings file and overwrite each other's state**. Separate them:

```ts
// src/main/index.ts — before app.whenReady()
import { app } from 'electron'
import path from 'path'

if (!app.isPackaged) {
  app.setPath('userData', path.join(app.getPath('userData'), 'dev'))
}
```

While in the same file, add a single-instance lock. Two copies of this app running simultaneously will contend over global shortcut registration, and the second instance's hotkeys will silently fail to register — a bug that is very hard to diagnose from the symptom:

```ts
if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on('second-instance', () => {
    // surface the existing overlay instead of starting a new one
    BrowserWindow.getAllWindows().forEach((w) => w.show())
  })
}
```

### 9.8 New-developer setup checklist

```bash
# 1. Install Volta (see 9.2), then restart the shell
# 2. Clone and enter the repo
git clone <repo-url> goniometer-overlay
cd goniometer-overlay

# 3. Volta auto-installs the pinned Node/npm on first command
node --version        # must print v20.18.0

# 4. Exact dependency install
npm ci

# 5. Run
npm run dev
```

If `node --version` prints anything other than the pinned version, Volta is not on `PATH` — stop and fix that before continuing. Everything downstream assumes it.

## 10. Build & Distribution

### 10.1 electron-builder config

```yaml
# electron-builder.yml
appId: com.yourname.goniometeroverlay
productName: Goniometer Overlay
directories:
  output: dist
  buildResources: build
files:
  - out/**/*
  - package.json

win:
  target:
    - target: nsis
      arch: [x64]
    - target: portable
      arch: [x64]
  icon: build/icon.ico

nsis:
  oneClick: false
  allowToChangeInstallationDirectory: true
  createDesktopShortcut: true

mac:
  target:
    - target: dmg
      arch: [universal]
  icon: build/icon.icns
  category: public.app-category.graphics-design
  extendInfo:
    LSUIElement: true
  hardenedRuntime: true
  gatekeeperAssess: false
  entitlements: build/entitlements.mac.plist
  entitlementsInherit: build/entitlements.mac.plist
```

Build commands:
```bash
npm run build && npx electron-builder --win    # on Windows
npm run build && npx electron-builder --mac    # on macOS
```

You must build each platform on that platform. macOS builds cannot be produced on Windows.

### 10.2 Code signing — read this before you promise a ship date

The requirement is "user can directly click and use." Without code signing, that is **not** what happens:

- **macOS:** Gatekeeper blocks the app with "cannot be opened because the developer cannot be verified." The user must right-click → Open → Open, or clear the quarantine flag in Terminal. Most users give up here.
- **Windows:** SmartScreen shows "Windows protected your PC" with a blue banner. Users must click "More info" → "Run anyway."

To actually deliver a clean double-click experience:

| Platform | What you need | Cost |
|---|---|---|
| macOS | Apple Developer Program membership, Developer ID Application certificate, and **notarization** via `notarytool` | $99/year |
| Windows | OV or EV code signing certificate from a CA (DigiCert, Sectigo, SSL.com) | ~$200–600/year |

Notarization is automated by electron-builder if you set `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`, and `APPLE_TEAM_ID` environment variables. Budget for it in the project timeline; it is not a last-day task, and the first notarization attempt usually fails on some entitlement detail.

If MVP is going to a handful of friendly testers, unsigned builds plus written bypass instructions are acceptable. For anything public, sign.

### 10.3 macOS permissions

The MVP does **not** need Screen Recording or Accessibility permission. It only draws its own window. Keep it that way — the moment you add screen capture, you inherit a permission prompt that materially reduces install conversion.

---

## 11. Acceptance Criteria

The MVP is done when every one of these passes on both Windows 11 and macOS.

**Overlay behavior**
- [ ] App launches with no visible window flash and no dock/taskbar icon
- [ ] Goniometer appears centered on each connected display
- [ ] Clicking anywhere except the goniometer activates the app underneath
- [ ] Typing in a text editor underneath works normally while the overlay is visible
- [ ] Overlay remains on top when the app underneath enters fullscreen
- [ ] Overlay stays visible when switching macOS Spaces / Windows virtual desktops

**Interaction**
- [ ] Cursor changes shape when hovering the fulcrum, arm handles, and readout
- [ ] Dragging the fulcrum moves the whole goniometer smoothly, no stutter
- [ ] Dragging an arm handle rotates that arm and updates the readout live
- [ ] A drag that moves the cursor far from the handle does not break mid-drag
- [ ] Default rotation snaps to whole degrees; Shift snaps to 15°; Alt is free
- [ ] Guide rays reach all four screen edges at every angle
- [ ] Mouse wheel over the dial resizes it between 80 and 400 px
- [ ] Clicking the readout allows typing an angle; Enter applies, Escape cancels
- [ ] The design tool underneath does **not** lose its selection when the goniometer is dragged

**Shortcuts and tray**
- [ ] All three global hotkeys work while another app has focus
- [ ] Locked mode makes the goniometer fully click-through but still visible
- [ ] Tray menu opens; every item works; Quit fully exits the process
- [ ] Copy-angle places a value like `47.5` on the clipboard, pasteable elsewhere

**Persistence and edge cases**
- [ ] Position, angles, radius, and opacity survive a restart
- [ ] Unplugging a display does not crash the app
- [ ] Plugging in a display creates a new overlay on it within a second or two
- [ ] Changing display resolution does not leave the goniometer off-screen
- [ ] Idle CPU usage stays under 1%
- [ ] Memory stays under 200 MB with two displays connected

**Environment and build hygiene**
- [ ] `package.json` contains a `volta` block pinning Node and npm
- [ ] `node --version` inside the repo matches the pin, regardless of the machine's system Node
- [ ] Fresh clone + `npm ci` + `npm run dev` works with no global installs
- [ ] No project tool is installed with `npm install -g`
- [ ] Dev build and installed build maintain separate settings (§9.7)
- [ ] Launching the app twice does not produce two instances or break hotkeys
- [ ] Packaged installer verified on a clean VM, not just the dev machine

---

## 12. Suggested Build Order

Work in this sequence. Each step produces something you can visually verify, which matters a lot when debugging transparency and passthrough issues.

0. **Set up the isolated toolchain.** Install Volta, scaffold the project, `volta pin` Node and npm, commit the lockfile (§9). Ten minutes now, and no version-drift debugging later.
1. **Scaffold + transparent window.** Get a full-screen transparent always-on-top window showing a single opaque red square. Confirm the rest of the screen is visible through it.
2. **Passthrough.** Add `setIgnoreMouseEvents(true, { forward: true })` and the hover loop, hit-testing against just that red square. Confirm you can click through everywhere except the square. *This is the riskiest step — do it early.*
3. **Tray icon and quit.** Do this before anything else, or you will be killing the process from Task Manager for the rest of the project.
4. **Render the goniometer.** Replace the square with the real SVG dial, arms, and rays.
5. **Drag and rotate.** Wire up mouse interaction with real hit testing.
6. **Snapping and readout.**
7. **Numeric entry** with the `setFocusable` dance.
8. **Global shortcuts, lock mode, clipboard.**
9. **Persistence.**
10. **Multi-display.**
11. **Package, sign, notarize.**

Steps 1–3 are the whole technical risk of this project. If they work, the rest is ordinary application code.

---

## 13. Open Questions

- Which design tool is the primary target? If it's one with a plugin API (Figma, for instance), a plugin might serve that specific workflow better than an overlay — though the overlay wins on universality.
- Should the stationary arm have a one-click "snap to horizontal" action? For the draw-a-line-at-angle workflow the stationary arm is almost always horizontal, and a dedicated button would beat dragging it there each time.
- Is a half-circle (180°) dial sufficient, or is the full 360° dial needed? A half-circle occludes less of the screen, which matters for a persistent overlay.
- Should the two arms be visually distinguishable beyond color, for accessibility? A dashed stationary arm and solid moving arm would work without relying on red/blue discrimination.
