# Goniometer Overlay — Complete Project Guide (AI Agent Handoff)

> **Purpose of this document:** everything another engineer or AI agent needs to
> pick up this project cold — what it is, its current status, how to set it up,
> how to build/package it, how to use it, its architecture, and every non-obvious
> gotcha discovered so far. Read this top to bottom before touching the code.
>
> **Last updated:** 2026-07-26 · **App version:** 1.0.0

---

## 0. 30-second orientation

- **What:** a Windows/macOS desktop utility (Electron) that floats a transparent,
  always-on-top **goniometer** (a protractor with two hinged, graduated ruler
  arms) over every other application, so a designer can visually reference an
  angle or distance while working in any other app.
- **Where the code is:** `Source/` (all app code). `Planning/` holds the original
  PRD. `Agents/` holds this doc. Built installers are **not** in the repo — they're
  published to **GitHub Releases** by CI (§11.4); local builds land in `Apps/`
  (git-ignored).
- **Language/stack:** Electron 31 + TypeScript 5 + electron-vite 2, **no UI
  framework** — the whole UI is one inline SVG plus a small HTML control panel.
- **Toolchain:** Node is pinned to **20.18.0** / npm **10.8.2** via **Volta**.
- **Status:** feature-complete for the MVP + several extensions; Windows build is
  produced and verified; macOS build is not (can only be built on a Mac).
- **Run it:** `cd Source && npm ci && npm run dev`.
- **Quit it (no window chrome!):** the **✕** button on the on-screen panel, the
  **tray icon → Quit**, or the global shortcut **Ctrl/Cmd+Shift+Q**.

---

## 1. Concept & terminology (use these terms consistently)

The tool is a **goniometer** — a protractor with two hinged arms, as used in
physical therapy and drafting.

| Term | Meaning |
|---|---|
| **Fulcrum** | Pivot point at the center of the dial. Both arms rotate around it. |
| **Stationary arm (S)** | The reference arm (drawn **blue**). "Stationary" is only the naming convention — it rotates freely like the other. |
| **Moving arm (M)** | The arm you rotate to the target (drawn **red**). |
| **Dial** | The circular protractor face carrying degree ticks + labels. |
| **Guide ray** | The infinite extension of an arm to the screen edge (digital-only feature). |
| **Readout** | The `S / ∠ / M` panel: each arm's absolute angle + the angle between them. |

**Angle convention (critical, defined once in `geometry.ts`):** `0°` points
**right (east)**; angles increase **counter-clockwise** (90° up, 180° left, 270°
down); range `[0, 360)`. Screen Y is down, so the Y term is negated in the math.

---

## 2. Current status

### Implemented & working
- Transparent, always-on-top, click-through overlay, **one window per display**.
- SVG dial with 1°/5°/10° tick marks + degree labels.
- Two arms with **three display modes** + a fourth "lines" mode:
  - **Lines** — thin blue/red reference lines + infinite guide rays.
  - **Metric / Imperial / Pixels rulers** — physical graduated rulers; metric &
    imperial reflect real on-screen dimensions via DPI calibration; ruler number
    labels stay upright at every angle.
- Drag to move (fulcrum/dial) and rotate (arm handles).
- **Snapping**: persistent Snap/Free toggle (step 0.5/1/5/15°), plus momentary
  Shift = 15° and Alt = free overrides.
- **Numeric entry**: click the underlined **S** or **M** value → type that arm's
  absolute angle (Enter applies, Esc cancels). `∠` (between) is display-only.
- **Measurement mode (📏)**: click-drag to measure directly on the overlay —
  along a ruler = linear distance; on the dial = swept angle; from center =
  radial distance; near-center resolves by drag endpoint. Units follow the mode
  (mm / in / px).
- **Single merged control panel** below the dial (readout row + button row),
  theme-aware (follows OS light/dark).
- **Settings popover (⚙)**: opacity, dial size, snap step, ruler calibration
  (px/mm or px/inch; auto-tracks display scaling).
- **Global shortcuts**: `Ctrl/Cmd+Shift+P` show/hide, `+L` lock, `+C` copy angle,
  `+Q` quit.
- **Lock mode**: overlay becomes fully click-through (reference while using other
  apps); the panel stays clickable so you can unlock.
- **Tray / menu-bar icon**: the essential control surface (frameless window).
- **State persistence** per display via electron-store (position, size, angles,
  opacity, mode, snap, calibration, lock).
- **Robustness**: renderer crash auto-recovery, self-healing passthrough loop,
  ruler-generation cap, guaranteed keyboard exit.

### Not done / limitations
- **macOS `.dmg` is NOT built** — electron-builder can only produce/sign a macOS
  app on macOS. Needs a Mac + `build/icon.icns` (see §11).
- **Unsigned builds** — no code-signing certificates, so first launch triggers a
  one-time SmartScreen (Windows) / Gatekeeper (macOS) bypass. Full function works
  after the bypass. Signing needs paid certs (Apple Developer Program; a Windows
  OV/EV cert).
- **Not tested on a clean VM** (PRD §9.6) — only on the dev machine.
- **Auto-update, Linux, multi-goniometer-per-display, CV angle detection** are
  explicitly out of scope.

### Git / distribution status
- Repo: `github.com/JianZhongDev/OldSchoolGoniometerDesktopApp` (branch `main`),
  pushed and in sync.
- **Installers are distributed via GitHub Releases** (built by CI, §11.4) — they
  are no longer committed to the repo, and the previously-committed binaries were
  purged from history via `filter-branch` + force-push.
- Commit messages here **omit** the `Co-Authored-By: Claude` trailer (user
  preference — GitHub was listing Claude as a contributor).
- The old, typo-named folder/repo `OldSchoolGaniometerDesktopApp` still exists as
  a backup (its git remote points at the old `…Ganiometer…` GitHub repo).

---

## 3. Repository & locations

| Path | What |
|---|---|
| `D:\Workspace\DesktopProjects\OldSchoolGoniometerDesktopApp\` | **Current** repo root (correct spelling). |
| `…\Source\` | All app source + config. Run npm commands from here. |
| `…\Planning\goniometer-overlay-prd.md` | Original product requirements doc. |
| `…\Apps\` | Local build output (git-ignored). Releases host the shipped installers. |
| `…\.github\workflows\release.yml` | CI that builds + publishes installers to Releases (§11.4). |
| `…\Agents\PROJECT_GUIDE.md` | This document. |
| `D:\Workspace\DesktopProjects\OldSchoolGaniometerDesktopApp\` | **OLD** folder (typo). Safe backup; not the working copy. |

- GitHub remote (current): `https://github.com/JianZhongDev/OldSchoolGoniometerDesktopApp.git`
- `.gitignore` (repo root) excludes: `/Apps/`, `/AppsBuild/`, `dist/`,
  `node_modules/`, `out/`, `*.log`, `.DS_Store`, `.vite/`. `Source/.gitignore`
  additionally covers Source-local build outputs.

---

## 4. Tech stack & versions

| Layer | Choice | Version |
|---|---|---|
| Runtime | Electron | `^31.0.0` (built with 31.7.7) |
| Language | TypeScript | `^5.4.0` |
| Build tooling | electron-vite | `^2.3.0` (uses Vite 5) |
| Renderer UI | Vanilla TS + inline SVG | — (no React/framework) |
| Persistence | electron-store | `^8.2.0` (do NOT upgrade to v9+, it's ESM-only) |
| Packaging | electron-builder | `^24.13.0` |
| Toolchain pin | Volta | node 20.18.0, npm 10.8.2 (in `package.json` `volta` block) |

`npm run` scripts (`Source/package.json`): `dev`, `build`, `start`, `typecheck`,
`package:win`, `package:mac`.

---

## 5. Environment setup

### 5.1 Toolchain (Volta)
Node/npm are pinned with **Volta** so this project never disturbs other Node
projects on the machine. On this Windows machine Volta was installed via
`winget install Volta.Volta`.

**⚠️ Critical PATH quirk on this machine:** Volta 2.0.2's shims (`node.exe`,
`npm.exe`) live in **`C:\Program Files\Volta`**, *not* in `%LOCALAPPDATA%\Volta\bin`
(that dir is empty; VOLTA_HOME data lives under `%LOCALAPPDATA%\Volta`). A fresh
shell/tool invocation does **not** have Volta on PATH automatically. Before
running node/npm in a non-interactive shell, set:

```powershell
$env:Path = 'C:\Program Files\Volta;' + [Environment]::GetEnvironmentVariable('Path','Machine') + ';' + [Environment]::GetEnvironmentVariable('Path','User')
$env:VOLTA_HOME = "$env:LOCALAPPDATA\Volta"
```

Verify: inside `Source/`, `node --version` must print `v20.18.0`. If it doesn't,
Volta isn't on PATH — fix that first.

Fresh machine without Volta:
```bash
# Windows:  winget install Volta.Volta      (then restart shell)
# macOS:    curl https://get.volta.sh | bash
```
Volta auto-installs the pinned Node/npm on first command inside the project.

### 5.2 Install & run
```bash
cd Source
npm ci          # exact install from package-lock.json (no global installs!)
npm run dev     # launches the Electron overlay via electron-vite
```
- `npm ci` pulls ~387 packages incl. Electron (~100 MB, cached machine-wide).
- On first `npm run dev` you'll see the transparent overlay appear. There is **no
  window to close** — quit from the panel ✕, tray, or `Ctrl/Cmd+Shift+Q`.
- `npm run typecheck` runs `tsc --noEmit` for both the node and web tsconfigs.

### 5.3 Dev vs. installed isolation
`electron-store` settings are separated so a dev build and an installed build
don't clobber each other's state:
- **Dev** (`npm run dev`): `%APPDATA%\goniometer-overlay\dev\goniometer-overlay.json`
- **Packaged**: `%APPDATA%\goniometer-overlay\goniometer-overlay.json`
- macOS equivalents live under `~/Library/Application Support/goniometer-overlay/`.

This works because `main/index.ts` calls `app.setPath('userData', …/dev)` when
`!app.isPackaged`, **and** `store.ts` constructs the store **lazily** (see §13).

---

## 6. Project structure (file-by-file)

```
Source/
├── package.json            # scripts, deps, Volta pin, engines
├── package-lock.json       # commit this; npm ci reproduces the exact tree
├── electron.vite.config.ts # main/preload/renderer build entries
├── electron-builder.yml    # packaging config; output → ../Apps
├── tsconfig*.json           # base + node + web (project references)
├── build/                  # packaging resources (icons, entitlements)
│   ├── icon.ico / icon.png # Windows/app icon (generated)
│   ├── tray.png / tray.ico / trayTemplate*.png  # tray icons (generated)
│   └── entitlements.mac.plist
└── src/
    ├── shared/types.ts     # GoniometerState + DisplayMode + constants + defaults
    ├── main/
    │   ├── index.ts        # lifecycle, single-instance lock, dev userData, display watching
    │   ├── windows.ts      # per-display overlay window factory + crash auto-recovery
    │   ├── ipc.ts          # all ipcMain handlers + nativeTheme broadcast
    │   ├── controller.ts   # app-level visible/locked state, tray↔shortcut sync
    │   ├── shortcuts.ts    # global shortcuts (P/L/C/Q)
    │   ├── tray.ts         # tray icon + menu (embedded base64 icon)
    │   └── store.ts        # electron-store (LAZY init — see §13)
    ├── preload/index.ts    # window.api contextBridge surface (typed IPC contract)
    └── renderer/
        ├── index.html      # #stage (SVG mount) + #panel + #popover + #angle-input + CSP
        ├── main.ts         # entry: passthrough loop, drag/rotate, measure, numeric entry, toolbar/popover wiring
        ├── goniometer.ts   # SVG build + render (dial, arms, rulers, handles); computeReadout
        ├── geometry.ts     # angle math, projections, ray-to-edge, snapping
        ├── hittest.ts      # which handle is under the cursor
        ├── measure.ts      # measurement classify/resolve/render + unit formatting
        ├── style.css       # theme CSS variables + panel/popover styling
        └── env.d.ts        # declares window.api type
```

---

## 7. Architecture & core concepts

### 7.1 The window never moves (most important idea)
Each display gets **one** full-screen, transparent, always-on-top window created
at the display's exact bounds — and it **never moves again**. "Dragging the
goniometer" only updates `cx,cy` in renderer state and re-applies an SVG
transform. Moving transparent always-on-top windows is slow/flickery, so we don't.

Window flags (`windows.ts`): `transparent`, `frame:false`, `hasShadow:false`,
`resizable/movable/minimizable/maximizable/fullscreenable:false`,
`skipTaskbar:true`, `focusable:false`, `show:false`, plus
`setAlwaysOnTop(true,'screen-saver')` (stays above fullscreen apps on macOS),
`setVisibleOnAllWorkspaces`, and `setIgnoreMouseEvents(true,{forward:true})`.
**Never set `backgroundColor` with `transparent:true`** — it kills transparency.

### 7.2 Click-through passthrough (the trick that makes it usable)
The window covers the whole display, so it would swallow every click. It's set to
**ignore mouse events** but with `forward:true`, meaning: ignore clicks but keep
delivering `mousemove`. The renderer tracks the cursor; when it's over the
goniometer's pixels it asks main to turn passthrough **off** (window becomes
click-catching); when it leaves, passthrough goes back **on**.

**Caveat:** passthrough is all-or-nothing for the whole window. While it's OFF,
the *entire* screen is click-catching, so the loop must flip it back ON quickly.
See §13 for the freeze bug this caused and the self-healing fix.

### 7.3 The `setFocusable` dance (numeric entry)
The window is `focusable:false` so it never steals the design tool's selection.
But a non-focusable window can't receive keyboard input. So numeric entry
temporarily calls `window.api.setFocusable(true)` (main flips it and focuses),
then `false` again on Enter/Escape.

### 7.4 Self-healing passthrough loop
`mousemove` schedules `handleMove` via `requestAnimationFrame`, throttled. If an
rAF callback is ever dropped (display sleep / lock), the guard is reset after
250 ms, a **1-second `setInterval`** re-evaluates passthrough from the last
pointer, and `visibilitychange` forces passthrough on while hidden. This
guarantees the overlay can't stay permanently click-stuck.

---

## 8. State model & persistence

```ts
// src/shared/types.ts
interface GoniometerState {
  cx, cy: number            // fulcrum position, window-relative px
  radius: number            // dial radius, 80–400
  angleStationary: number   // absolute angle [0,360)  (blue arm, S)
  angleMoving: number       // absolute angle [0,360)  (red arm, M)
  opacity: number           // 0.3–1.0
  snapIncrement: number     // degrees (0.5/1/5/15), used when snapEnabled
  snapEnabled: boolean      // persistent Snap vs Free
  displayMode: 'lines' | 'rulerMetric' | 'rulerImperial' | 'rulerPixels'
  measureMode: boolean      // 📏 measurement toggle (transient measurements are NOT persisted)
  pxPerInch: number         // ruler calibration; 0 = auto (from display DPI)
  locked: boolean
}
```
- Persisted per display, keyed by Electron display id, via electron-store.
- Saves are **debounced** (~500 ms) during drags; discrete changes save
  immediately. On load, `cx/cy` are clamped into the current viewport and missing
  fields are merged from defaults (forward-compatible with older saved files).
- **Ruler scale:** effective px/inch = `pxPerInch` if >0 else `96 × display.scaleFactor`.
  Metric field shows px/mm (= px/inch ÷ 25.4); auto-updates when display scaling
  changes. Calibration is clamped to `[12, 1200]` px/inch.

---

## 9. IPC contract (`preload/index.ts`)

Renderer → main (fire-and-forget): `setPassthrough(ignore)`, `saveState(state)`,
`copyToClipboard(text)`, `reportAngle(text)`, `setLocked(locked)`, `quit()`.

Renderer → main (request/response): `setFocusable(focusable)`, `loadState()`,
`getDisplayId()`, `getDisplayInfo()` → `{scaleFactor, dark}`.

Main → renderer (subscriptions): `onLockChanged(cb)`, `onReset(cb)`,
`onSetOpacity(cb)`, `onDisplayResized(cb)` → `{width,height,scaleFactor}`,
`onThemeChanged(cb)` → `dark:boolean`.

Main also keeps `lastAngleText` (the latest `∠` value any renderer reported) so
the global "copy angle" shortcut and tray item have a value without a renderer
round-trip. OS light/dark comes from `nativeTheme` (authoritative), broadcast to
renderers; the HTML panel also follows CSS `prefers-color-scheme`.

---

## 10. How to use the app (end-user guide)

The overlay shows the dial, two arms, and a **single control panel below the
dial**. The panel's top row is the readout; the bottom row is the buttons.

### Readout row
`S <blue°>   ∠ <between°>   M <red°>` — `S`/`M` are each arm's **absolute** angle;
`∠` is the angle **between** them (always 0–180°). **Click the underlined S or M**
to type an exact absolute angle for that arm (Enter applies, Esc cancels).

### Button row
| Button | Action |
|---|---|
| **Lines / Metric / Imperial / Pixels** | Cycle how the arms are drawn (lines vs. graduated rulers). |
| **Snap N° / Free** | Toggle persistent angle snapping (step chosen in ⚙). |
| **📏 Measure** | Toggle measurement mode (see below). |
| **🔓 / 🔒** | Lock: overlay becomes click-through so you can use the app underneath. |
| **⚙** | Open settings popover (opacity, size, snap step, ruler calibration). |
| **✕** | Quit the app. |

### Mouse interactions (when not in Measure mode)
| Target | Action |
|---|---|
| Fulcrum (center dot) or dial | Drag = move the whole goniometer |
| Blue/red arm handle | Drag = rotate that arm |
| Hold **Shift** while rotating | Snap to 15° |
| Hold **Alt** while rotating | Free (no snapping) |
| Mouse-wheel over the dial | Resize the dial (80–400 px) |

### Measurement mode (📏)
Toggle it on, then click-drag on the goniometer (click once more to clear the
result and be ready for the next):
- **Along a ruler edge** → linear distance along that ruler.
- **On the protractor face** → swept angle (highlighted sector).
- **From the center outward** → radial distance to the center.
- **Near the center** (rulers + dial overlap): if you release on a ruler it
  measures along it, otherwise it measures radial distance.
- Distance readouts use the current mode's unit (cm / in / px); the amber
  highlight + a value badge show the measurement. Measurements are transient
  (not saved).

### Global keyboard shortcuts (work even when another app is focused)
| Shortcut | Action |
|---|---|
| `Ctrl/Cmd + Shift + P` | Show / hide the overlay |
| `Ctrl/Cmd + Shift + L` | Lock / unlock |
| `Ctrl/Cmd + Shift + C` | Copy current `∠` angle to clipboard |
| `Ctrl/Cmd + Shift + Q` | **Quit** (works even if the UI is frozen) |

### Tray / menu-bar menu
Show/Hide, Lock (checkbox), Reset Position, Opacity (30/50/70/100%), Copy Angle,
Quit. This is the fallback control surface since the window has no title bar.

---

## 11. Building & packaging

Output goes to `../Apps` (set in `electron-builder.yml`). Each platform must be
built **on that platform**.

### 11.1 Windows (verified working on this machine)
```powershell
# set Volta PATH (see §5.1), then from Source/:
$env:CSC_IDENTITY_AUTO_DISCOVERY = 'false'   # unsigned build
npm run build                                # electron-vite → out/
npx electron-builder --win                   # → ../Apps/*.exe
```
Produces (in `Apps/`):
- `Goniometer Overlay Setup 1.0.0.exe` — NSIS installer (~75 MB).
- `Goniometer Overlay 1.0.0.exe` — portable single-exe (~75 MB).

**⚠️ Two Windows build gotchas encountered (and their fixes):**
1. **winCodeSign symlink extraction fails** with *"A required privilege is not
   held by the client"* — electron-builder's `winCodeSign-2.6.0.7z` contains
   macOS `.dylib` **symlinks** that Windows can't create without Developer
   Mode/admin. **Fix without changing system settings:** pre-extract it manually,
   tolerating the 2 symlink errors, into the cache:
   ```powershell
   $t = "$env:LOCALAPPDATA\electron-builder\Cache\winCodeSign\winCodeSign-2.6.0"
   & 'Source\node_modules\7zip-bin\win\x64\7za.exe' x '<winCodeSign-2.6.0.7z>' "-o$t" -y
   ```
   The Windows tools (`signtool.exe`, `rcedit`) extract fine; electron-builder
   then skips its own extraction. (Download the 7z from the electron-builder-
   binaries GitHub release if not cached.)
2. **Windows Defender file-lock:** `MsMpEng` scan-locks the freshly built
   `win-unpacked\resources\app.asar`, so a re-run that tries to clean the output
   dir fails with *"used by another process."* **Fix:** build to a **fresh** output
   dir (`--config.directories.output=<clean>`), then copy the final `.exe`s into
   `Apps/`. The lock clears on its own after a while (or a reboot).

### 11.2 macOS (must be done on a Mac — cannot be built on Windows)
```bash
cd Source
npm ci
# First add build/icon.icns (a macOS icon; not generated on Windows).
npm run package:mac        # → ../Apps/Goniometer Overlay-1.0.0-universal.dmg
```
`electron-builder.yml` already targets a **universal** `.dmg`, sets
`LSUIElement:true` (no dock icon), hardened runtime, and entitlements
(`build/entitlements.mac.plist`). For a clean (no-Gatekeeper-warning) build you
must code-sign + notarize: set `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`,
`APPLE_TEAM_ID` env vars and provide a Developer ID Application certificate.

### 11.3 Signing status
Both current builds are **unsigned**. First launch shows a one-time prompt
(Windows SmartScreen → "More info → Run anyway"; macOS Gatekeeper → right-click →
Open → Open). After that, all functionality works. Public distribution should be
signed (Apple Developer Program ~$99/yr + notarization; a Windows OV/EV cert).

### 11.4 Distribution — GitHub Releases via CI (installers are NOT in the repo)

The built installers are **published to GitHub Releases**, not committed to git
(that keeps clones small and history clean). `Apps/` and `AppsBuild/` are
git-ignored. Do **not** `git add` the `.exe`/`.dmg` files.

**How releases are produced** — [`.github/workflows/release.yml`](../.github/workflows/release.yml):
- Trigger: pushing a tag matching `v*` (e.g. `v1.0.0`), or the **Run workflow**
  button on the Actions tab (`workflow_dispatch`).
- Runs on `windows-latest`, sets up Node 20.18.0, `npm ci`, `npm run build`,
  `npx electron-builder --win --publish never`, then attaches `Apps/*.exe` to the
  Release with `softprops/action-gh-release`.
- Auth: uses the built-in `GITHUB_TOKEN` (workflow has `permissions: contents:
  write`) — no manual login or secrets needed for an unsigned build. The CI
  runner has the privileges electron-builder's `winCodeSign` needs, so the local
  symlink/Defender workarounds from §11.1 are **not** required in CI.

**To cut a release:**
```bash
# 1. Bump the version so the installer filename + release match the tag:
#    edit Source/package.json  "version": "1.0.1"   (commit it)
# 2. Tag and push — this triggers the workflow:
git tag v1.0.1
git push origin v1.0.1
# 3. Watch the Actions tab; when green, the installers are on the Releases page.
```
The installer filenames come from `Source/package.json` `version`, so **keep the
tag and that version in sync** (tag `vX.Y.Z` ↔ version `X.Y.Z`).

**macOS in CI:** not enabled yet. To add it, create a `macos-latest` job mirroring
the Windows one running `npm run package:mac`, and first commit a
`Source/build/icon.icns` (see §11.2). For a notarized signed build, add
`APPLE_ID` / `APPLE_APP_SPECIFIC_PASSWORD` / `APPLE_TEAM_ID` (and a Developer ID
cert) as repo secrets.

**Signing in CI (optional):** add the cert as a base64 secret + `CSC_LINK` /
`CSC_KEY_PASSWORD` (Windows) and remove the `CSC_IDENTITY_AUTO_DISCOVERY: false`
line from the workflow.

> The installers were historically committed to `Apps/` for a few commits; that
> was later removed and the binaries were purged from git history (a
> `filter-branch` + force-push) to reclaim the space. Keep them out of git.

---

## 12. Testing / verification approach

There are no automated tests yet. Two practical techniques used during
development:

1. **Typecheck + build as a smoke test:** `npm run typecheck` then `npm run build`
   catches most regressions.
2. **Stubbed browser harness (for the renderer/SVG logic):** the live overlay is
   hard to screenshot (transparent, and a dev Electron window isn't a
   screen-capturable "app"). Instead, create a temporary `Source/src/renderer/
   harness.html` that (a) provides the same DOM ids as `index.html`, (b) defines
   a stub `window.api` (returning canned `loadState`/`getDisplayInfo`), and (c)
   `import`s `./main.ts` or the pure modules (`./measure.ts`, `./geometry.ts`,
   `./goniometer.ts`). Then open `http://localhost:5173/harness.html` (the
   electron-vite dev server; port may be 5173 or 5174) in a browser and drive the
   DOM / call the exposed functions to assert geometry, rendering, theming, etc.
   **Delete the harness afterward** — it must not ship. (rAF is frozen when the
   pane isn't displayed, which conveniently also lets you verify the self-healing
   interval.)

To launch/verify from a script without blocking, start `npm run dev` with output
redirected to a log file and poll the log + process list (see the packaging
history for the exact PowerShell pattern). The main process logs renderer
errors/crashes with `[renderer]` / `[overlay]` prefixes in dev.

---

## 13. Known issues, gotchas & past bug fixes (root causes)

Read these before changing the relevant code — each was a real bug with a subtle
cause.

- **electron-store dev/prod isolation depended on lazy init.** `store.ts` must
  create the `Store` **lazily** (on first use), because `app.setPath('userData',
  …/dev)` in `index.ts` runs in the module body *after* imports evaluate. An
  eager `new Store()` at import time captured the pre-override path and wrote to
  the shared (non-dev) location. Keep it lazy.
- **Ruler generation could hang/crash the renderer.** `buildRuler` looped
  `maxLen / pxPerMm` times with no bound; a tiny calibration made that huge, and
  `pxPerInch === 0` made it `Math.floor(Infinity)` = an infinite loop. Fixed with
  a `> 0` guard + `MAX_RULER_GRADS = 6000` cap. Don't remove the cap.
- **App "froze" after long idle.** The `mousemove`→rAF loop wedged permanently if
  an rAF callback was dropped (display sleep/lock): `pendingRaf` never cleared, so
  every later `mousemove` no-oped and passthrough stuck (often OFF = whole screen
  click-blocked, even over the tray). Fixed by the self-healing loop + 1 s safety
  interval + `visibilitychange` handler (§7.4), plus the `Ctrl/Cmd+Shift+Q`
  global quit as a guaranteed keyboard escape. Keep all of these.
- **Renderer crash recovery.** `windows.ts` reloads a crashed renderer on
  `render-process-gone` (capped at 3 crashes / 30 s to avoid a reload storm).
- **Ruler number labels were upside down.** Labels are drawn in a **separate
  screen-space layer** (not inside the rotated ruler group) and rotated to follow
  the ruler but flipped 180° when the arm points left (`cos(angle) < 0`), so they
  never read upside down. See `positionLabels` in `goniometer.ts`.
- **`rulerPixels` mode looked like plain lines** until `rulerPixels` was added to
  the `isRuler` check in `render()`. If you add a new ruler mode, update that
  check too.
- **Theme sync.** The HTML panel follows CSS `prefers-color-scheme`; any SVG-only
  chrome (e.g., measurement value badges) is themed from the `dark` flag pushed by
  `nativeTheme` (matchMedia change events proved unreliable under emulation).
- **Line-ending noise:** git may warn `LF will be replaced by CRLF` on Windows —
  harmless normalization.

---

## 14. Suggested next steps / TODO

1. **Cut the first release**: bump `Source/package.json` version, then
   `git tag vX.Y.Z && git push origin vX.Y.Z` to trigger the CI release (§11.4).
2. **macOS build/CI**: on a Mac (or a `macos-latest` CI job), generate
   `build/icon.icns`, run `npm run package:mac`; ideally sign + notarize.
3. **Code signing** for both platforms for a clean download experience.
4. **Clean-VM verification** (PRD §9.6) before any public release.
5. Optional polish from the PRD's open questions: "snap stationary arm to
   horizontal" button; half-circle dial option; accessibility (dashed vs solid
   arm in addition to color); a guided ruler calibration ("match a credit card").
6. Consider automated tests around the pure modules (`geometry.ts`, `measure.ts`).
7. Delete the old `OldSchoolGaniometerDesktopApp` folder + archive/delete the old
   GitHub repo once you're confident in the new one.

---

## 15. Change history (high level)

1. **MVP** — transparent overlay, dial, two line-arms + guide rays, drag/rotate,
   snapping, numeric entry, passthrough loop, global shortcuts, tray, per-display
   persistence, opacity/size.
2. **Display modes + on-overlay controls** — added metric/imperial rulers with
   real DPI-based dimensions, a floating toolbar (Mode/Snap/Lock/⚙/✕), a settings
   popover, a persistent Snap/Free toggle, and reworked the readout so S/M are
   editable absolute angles and ∠ is the display.
3. **Polish** — upright ruler labels; unified theme (panel + readout follow OS
   light/dark); calibration shows px/mm in metric and auto-tracks display scaling.
4. **Measurement mode + pixel ruler** — 📏 click-drag distance/angle/radius
   measurements with near-center disambiguation; added the Pixels ruler/unit.
5. **Persistence fix** — made electron-store lazy so dev/installed builds stay
   isolated.
6. **Crash hardening** — bounded ruler generation; renderer error surfacing +
   auto-reload.
7. **Freeze fix** — self-healing passthrough loop + `Ctrl/Cmd+Shift+Q` guaranteed
   exit.
8. **Merged control panel** — combined the top toolbar and bottom readout into one
   themed panel below the dial; readout moved from SVG to HTML.
9. **Windows packaging** — produced NSIS installer + portable exe (with the
   winCodeSign + Defender workarounds).
10. **Repo migration** — moved the project into the correctly-spelled
    `OldSchoolGoniometerDesktopApp` repo/folder.
11. **About panel** — added the ⓘ info popover (description, GPL-3.0 license,
    GitHub/X/LinkedIn links via an https-only `openExternal` IPC); crisp inline-SVG
    icon; corrected `package.json` license to `GPL-3.0-only`.
12. **Transparent-window freeze mitigation** — `app.disableHardwareAcceleration()`
    (software compositing is more stable for a transparent always-on-top overlay
    on Windows).
13. **Release distribution** — installers moved out of the repo to **GitHub
    Releases** via `.github/workflows/release.yml`; existing binaries purged from
    git history.
```
