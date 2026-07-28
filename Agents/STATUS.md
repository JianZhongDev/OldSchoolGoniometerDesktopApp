# Goniometer Overlay — Project Status Snapshot

> **Purpose:** a current-state handoff so another engineer/AI agent can pick the
> project up directly. For full depth (file-by-file map, IPC contract, detailed
> architecture, and every gotcha), read **[`PROJECT_GUIDE.md`](PROJECT_GUIDE.md)** —
> that is the canonical, continuously-maintained guide; this file is a snapshot.
>
> **Snapshot date:** 2026-07-27 · **App version:** 1.0.0 · **HEAD:** `79787b2`
> (branch `main`, clean, in sync with origin)

---

## 1. What it is
A Windows/macOS **Electron** desktop utility: a transparent, always-on-top
**goniometer** (a protractor with two hinged, graduated ruler arms) that floats
over every other app so a user can measure/reference **angles and distances** on
screen while working normally. Clicks pass through except on the goniometer
itself. **No UI framework** — the whole UI is one inline SVG plus a small HTML
control panel.

## 2. Repository & location
| | |
|---|---|
| **Working copy** | `D:\Workspace\DesktopProjects\OldSchoolGoniometerDesktopApp\` (correct spelling) |
| **GitHub** | `github.com/JianZhongDev/OldSchoolGoniometerDesktopApp`, branch `main` |
| **HEAD** | `79787b2` — working tree clean, in sync with `origin/main` |
| **Old folder/repo** | `…\OldSchoolGaniometerDesktopApp` (typo) — backup only; points at the old GitHub repo |

Top-level layout: `Source/` (all code), `Planning/` (PRD), `Agents/` (this doc +
the guide), `docs/` (banner.gif used by the README), `.github/workflows/` (CI),
`Apps/` (local build output — **git-ignored**), `README.md`, `LICENSE` (GPL-3.0).

**Git conventions:**
- Commit messages **omit** the `Co-Authored-By: Claude` trailer (user preference —
  it was listing Claude as a GitHub contributor).
- Built installers are **not** committed (see §6). Don't `git add` `.exe`/`.dmg`.

## 3. Toolchain & setup ⚠️
- **Volta** pins **Node 20.18.0 / npm 10.8.2** (`Source/package.json` `volta` block).
- **Critical PATH quirk on this machine:** Volta's shims live in
  **`C:\Program Files\Volta`**, *not* `%LOCALAPPDATA%\Volta\bin`. A fresh
  non-interactive shell does **not** have `node`/`npm` on PATH. Set it first:
  ```powershell
  $env:Path = 'C:\Program Files\Volta;' + [Environment]::GetEnvironmentVariable('Path','Machine') + ';' + [Environment]::GetEnvironmentVariable('Path','User')
  $env:VOLTA_HOME = "$env:LOCALAPPDATA\Volta"
  ```
- **Run:** `cd Source && npm ci && npm run dev` — launches the transparent overlay.
  There is no window to close; quit via the panel **✕**, the tray, or
  **Ctrl/Cmd+Shift+Q**.
- **Verify code:** `npm run typecheck` and `npm run build`.

## 4. Feature status — all implemented & working
- Transparent, always-on-top, click-through overlay, **one window per display**.
- SVG dial (1°/5°/10° ticks + labels) and two arms.
- **4 display modes:** Lines, Metric ruler, Imperial ruler, Pixels ruler.
  Metric/imperial reflect real on-screen size via DPI (calibratable); ruler number
  labels stay upright at every angle.
- Drag to move/rotate; persistent **Snap** toggle (0.5/1/5/15°) + momentary
  **Shift**=15° / **Alt**=free.
- **Numeric entry:** click the underlined **S**/**M** value to set that arm's
  absolute angle; **∠** (between them) is display-only.
- **Measurement mode (📏):** click-drag = linear distance along a ruler / swept
  angle on the dial / radius from the centre (near-centre resolves by drag
  endpoint); units follow the mode (cm / in / px).
- **Single control panel** below the dial (readout row + button row), theme-aware
  (follows OS light/dark).
- **⚙ Settings** (opacity, dial size, snap step, ruler calibration) and **ⓘ About**
  popover (description, GPL-3.0 license, GitHub/X/LinkedIn links opened via an
  https-only `openExternal` IPC).
- **Lock mode**, **global shortcuts** (`Ctrl/Cmd+Shift+P` show/hide, `+L` lock,
  `+C` copy angle, `+Q` quit), and a **tray / menu-bar menu**.
- **Per-display persistence** (electron-store); **renderer crash auto-recovery**,
  self-healing passthrough loop, and **hardware acceleration disabled** for
  transparent-window stability.

## 5. Architecture (must-know)
- **The window never moves** — it's a full-display glass sheet; "dragging" only
  updates `cx,cy` + an SVG transform.
- **Passthrough** via `setIgnoreMouseEvents(true,{forward:true})`; a
  requestAnimationFrame loop toggles it as the cursor enters/leaves the
  goniometer. It's all-or-nothing per window, so the loop is **self-healing**
  (stale-rAF reset + 1 s watchdog + `visibilitychange`) to prevent freezes.
- **`setFocusable` dance** for numeric entry (the window is `focusable:false`).
- **electron-store is lazy-initialized** so dev-vs-installed userData isolation
  works. Dev writes to `…\goniometer-overlay\dev\`, packaged to
  `…\goniometer-overlay\`.
- Source files: `main/` (index, windows, ipc, controller, shortcuts, tray, store),
  `preload/index.ts` (typed `window.api`), `shared/types.ts` (`GoniometerState`),
  `renderer/` (main, goniometer, geometry, hittest, measure, style.css,
  index.html). Full map in `PROJECT_GUIDE.md` §6.

## 6. Distribution (how binaries are shipped)
- **Installers are NOT in the repo.** They're published to **GitHub Releases** by
  CI: [`.github/workflows/release.yml`](../.github/workflows/release.yml) builds
  the Windows installer + portable exe on a `v*` tag push (or manual dispatch) and
  attaches them, using the built-in `GITHUB_TOKEN` (no secrets needed for an
  unsigned build; CI runners don't need the local build workarounds).
- **No release has been cut yet** (no tags). To publish `1.0.0`:
  ```bash
  git tag v1.0.0 && git push origin v1.0.0     # triggers CI → Release
  ```
  Keep the tag in sync with `Source/package.json` `version` (version drives the
  installer filenames).
- Local Windows packaging also works: `npm run package:win` → `Apps/`. See
  `PROJECT_GUIDE.md` §11.1 for the two **local-only** gotchas (winCodeSign symlink
  pre-extract; Windows Defender output file-lock → build to a fresh dir).

## 7. Known gotchas / do-not-break (from real bugs)
- Keep **electron-store lazy** (dev/prod isolation depends on it).
- Keep the **`MAX_RULER_GRADS` cap + `>0` guard** in `buildRuler` (a tiny/zero
  calibration otherwise infinite-loops the renderer).
- Keep the **self-healing passthrough loop + `Ctrl/Cmd+Shift+Q`** (freeze
  recovery / guaranteed escape).
- Ruler labels live in a **separate screen-space layer** and are flipped so they
  never read upside down; if you add a ruler mode, also add it to the `isRuler`
  check in `render()`.
- Don't set `backgroundColor` with `transparent:true`. Don't upgrade
  electron-store past v8. Don't `git add` the `.exe`/`.dmg`.

## 8. Outstanding / next steps
1. **Cut the first release** (tag `v1.0.0`) to actually host the installers.
2. **macOS build** — needs a Mac (or a `macos-latest` CI job) + a
   `Source/build/icon.icns`.
3. **Code signing** (Windows OV/EV cert; Apple Developer ID + notarization) for a
   warning-free download — builds are currently **unsigned** (one-time
   SmartScreen/Gatekeeper bypass on first launch).
4. **Clean-VM verification** before a public release.
5. **Freeze fix is a mitigation, not a proven cure** — disabling hardware
   acceleration is the standard remedy for transparent-overlay freezes on Windows,
   but it couldn't be reproduced/confirmed over many hours; the watchdog +
   auto-reload + `[renderer]`/`[overlay]` logging remain as safety nets.
6. Optional polish (PRD open questions): "snap stationary arm to horizontal"
   button, half-circle dial option, non-color arm accessibility, guided ruler
   calibration.
