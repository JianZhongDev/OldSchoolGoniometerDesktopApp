# Goniometer Overlay

A lightweight, always-on-top **goniometer** (protractor with two hinged arms)
that floats over every other application. Position it, set an angle, and use the
infinite guide rays as a visual reference while you work in any design tool.

> Built to the spec in [`../Planning/goniometer-overlay-prd.md`](../Planning/goniometer-overlay-prd.md).

## The one idea that makes this app work

**The window never moves.** Each display gets one full-screen, transparent,
always-on-top "sheet of glass" window created at the display's exact bounds. The
goniometer is an SVG group *inside* that window; "dragging it" just updates an
`(x, y)` coordinate and re-renders. The window covers everything but passes
clicks through (`setIgnoreMouseEvents(true, { forward: true })`) except over the
goniometer's own pixels.

## Tech stack

| Layer | Choice |
|---|---|
| Runtime | Electron `^31` |
| Language | TypeScript `^5.4` |
| Build | electron-vite `^2.3` |
| UI | Vanilla TypeScript + inline SVG (no framework) |
| Persistence | electron-store `^8` |
| Packaging | electron-builder `^24` |
| Toolchain pinning | Volta (`node@20.18.0`, `npm@10.8.2`) |

## Prerequisites

This repo pins Node/npm with [Volta](https://volta.sh) so it never disturbs
other projects on the machine (PRD §9).

```bash
# Windows
winget install Volta.Volta
# macOS
curl https://get.volta.sh | bash
```

Restart your shell after installing. Volta auto-installs the pinned Node/npm the
first time you run a command inside this directory.

## Run in development

```bash
npm ci        # exact install from the lockfile (or `npm install` first time)
npm run dev
```

`node --version` inside this directory must print `v20.18.0`. If it prints
anything else, Volta is not on your `PATH` — fix that before continuing.

There are two ways to control and quit the app:

- **On-overlay toolbar** (floats just above the dial): switch display **Mode**,
  toggle **Snap/Free**, **Lock/Unlock**, open **⚙ settings**, and **✕ quit**.
- **Tray / menu-bar icon** (protractor glyph): the same essentials plus opacity
  presets and Reset Position.

There is no window chrome or taskbar/dock icon — those two surfaces are the app.

## Display modes

The **Mode** button cycles the two arms through three representations:

| Mode | Arms drawn as |
|---|---|
| **Lines** | Thin red/blue reference lines with infinite guide rays (original look) |
| **Metric** | Physical rulers graduated in **cm/mm** |
| **Imperial** | Physical rulers graduated in **inches** (1/16″) |

Ruler graduations reflect **real on-screen dimensions**, scaled from the display
DPI (96 × `scaleFactor`). If the on-screen size is off for your monitor, open
**⚙ → Ruler px/inch** and calibrate against a real ruler. `0 = auto` (DPI).

## Controls

| Action | How |
|---|---|
| Move the goniometer | Drag the fulcrum (center dot) or anywhere on the dial |
| Rotate an arm | Drag the blue (stationary) or red (moving) handle |
| Free vs. snapped rotation | **Snap/Free** toolbar button (step chosen in ⚙); or hold **Shift** = 15°, **Alt** = free |
| Resize the dial | Mouse-wheel over the dial, or ⚙ → Size (80–400 px) |
| Set an arm's exact angle | Click the underlined **S** or **M** value, type the absolute angle, **Enter** (**Esc** cancels) |
| Lock (click-through but visible) | **🔓/🔒** toolbar button, `Ctrl/Cmd + Shift + L`, or tray |
| Quit | **✕** toolbar button, or tray → Quit |
| Toggle visibility | `Ctrl/Cmd + Shift + P` or tray |
| Copy angle to clipboard | `Ctrl/Cmd + Shift + C` or tray |

The readout is `[ S <stationary°> ]  ∠ <between°>  [ M <moving°> ]` — you input
each **arm's absolute angle** (S, M) and the **angle between them** (`∠`, `[0,180]`)
is the display. 0° points east; angles increase counter-clockwise (PRD §4.3).

**Lock** (requirement: reference the overlay while using the app underneath):
when locked, every click passes through to the app below so you can keep working
while the goniometer floats on top as a visual reference — the toolbar stays
clickable so you can unlock again.

## Build & package

```bash
npm run build            # compile main / preload / renderer into out/
npm run package:win      # NSIS installer + portable exe -> dist/   (run on Windows)
npm run package:mac      # universal .dmg -> dist/                  (run on macOS)
```

Each platform must be packaged on that platform. For a clean double-click
experience the builds must be code-signed and (macOS) notarized — see PRD §10.2.

## Project layout

```
src/
  main/        app lifecycle, per-display windows, tray, shortcuts, IPC, store
  preload/     the typed window.api bridge (contextIsolated)
  shared/      GoniometerState + defaults, shared by main and renderer
  renderer/    SVG goniometer, geometry, hit testing, interaction loop
build/         icons (generated) + macOS entitlements
```

## Generated icons

The icons in `build/` (`icon.ico`, `tray.png`, `trayTemplate*.png`, `icon.png`)
were generated programmatically. The tray icon is additionally embedded as
base64 inside `src/main/tray.ts`, so the tray always renders regardless of
packaging paths. For a polished release, replace `build/icon.ico` /
`build/icon.icns` with hand-designed art (see PRD §7.7, §8).

> **macOS note:** `build/icon.icns` is not generated here (it must be produced on
> macOS). Add it before running `npm run package:mac`.
