import { app, BrowserWindow, screen, shell } from 'electron'
import { join } from 'path'

/**
 * Map from Electron display id -> the overlay window covering that display.
 * Every display gets exactly one full-screen, transparent, always-on-top
 * "sheet of glass" window (PRD §7.2). The window is created at the display's
 * bounds and never moves again.
 */
export const overlayWindows = new Map<number, BrowserWindow>()

/** Reverse lookup: which display does this window belong to? */
const windowToDisplay = new WeakMap<BrowserWindow, number>()

export function displayIdForWindow(win: BrowserWindow): number | undefined {
  return windowToDisplay.get(win)
}

export function createOverlayWindow(display: Electron.Display): BrowserWindow {
  const { x, y, width, height } = display.bounds

  const win = new BrowserWindow({
    x,
    y,
    width,
    height,
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
    // NOTE: never set backgroundColor alongside transparent:true — it silently
    // kills transparency (PRD §7.2, trap 1).
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      // Keep the overlay animating at full rate even when it never has focus.
      backgroundThrottling: false
    }
  })

  // 'screen-saver' keeps us above fullscreen apps on macOS (trap 2).
  win.setAlwaysOnTop(true, 'screen-saver')
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
  // Ignore clicks everywhere, but keep receiving mousemove so the renderer can
  // hit-test and ask us to disable passthrough over the goniometer (PRD §4.2).
  win.setIgnoreMouseEvents(true, { forward: true })

  // Open target=_blank links externally rather than in the overlay.
  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })

  // Dev-only: surface renderer console warnings/errors in the main process
  // stdout so they aren't swallowed by the frameless overlay.
  if (!app.isPackaged) {
    win.webContents.on('console-message', (_e, level, message, line, sourceId) => {
      if (level >= 2) console.error(`[renderer] ${message} (${sourceId}:${line})`)
    })
  }

  // Auto-recover from a hard renderer crash. Without this, a crashed renderer
  // leaves a dead transparent sheet on screen that looks like the app hung and
  // can only be fixed by quitting from the tray. Reload it — but if it crashes
  // repeatedly in a short window (a crash-on-load bug), give up rather than spin
  // in a reload storm. The 30 s window lets unrelated later crashes recover.
  let recentReloads: number[] = []
  win.webContents.on('render-process-gone', (_e, details) => {
    console.error('[renderer gone]', details.reason)
    if (details.reason === 'clean-exit' || win.isDestroyed()) return
    const now = Date.now()
    recentReloads = recentReloads.filter((t) => now - t < 30_000)
    if (recentReloads.length < 3) {
      recentReloads.push(now)
      win.webContents.reload()
    } else {
      console.error('[renderer] too many crashes in 30s; auto-reload paused')
    }
  })

  windowToDisplay.set(win, display.id)
  overlayWindows.set(display.id, win)

  win.on('closed', () => {
    overlayWindows.delete(display.id)
  })

  // Load the renderer, tagging the URL with the display id so the renderer can
  // resolve its own display synchronously if needed.
  if (!app.isPackaged && process.env['ELECTRON_RENDERER_URL']) {
    win.loadURL(`${process.env['ELECTRON_RENDERER_URL']}?displayId=${display.id}`)
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'), {
      query: { displayId: String(display.id) }
    })
  }

  win.once('ready-to-show', () => {
    win.showInactive() // show without stealing focus
  })

  return win
}

/** Create overlays for every display that does not yet have one. */
export function ensureOverlaysForAllDisplays(): void {
  for (const display of screen.getAllDisplays()) {
    if (!overlayWindows.has(display.id)) {
      createOverlayWindow(display)
    }
  }
}

/** Tear down the overlay for a removed display. */
export function destroyOverlayForDisplay(displayId: number): void {
  const win = overlayWindows.get(displayId)
  if (win && !win.isDestroyed()) {
    win.close()
  }
  overlayWindows.delete(displayId)
}

export function allOverlayWindows(): BrowserWindow[] {
  return [...overlayWindows.values()].filter((w) => !w.isDestroyed())
}
