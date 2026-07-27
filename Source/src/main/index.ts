import { app, BrowserWindow, screen } from 'electron'
import path from 'path'
import {
  createOverlayWindow,
  ensureOverlaysForAllDisplays,
  destroyOverlayForDisplay,
  overlayWindows
} from './windows'
import { registerIpc } from './ipc'
import { registerShortcuts, unregisterShortcuts } from './shortcuts'
import { createTray, destroyTray } from './tray'
import { isVisible, syncWindow } from './controller'

// --- Runtime isolation (PRD §9.7) --------------------------------------------
// Dev and installed builds must not share one electron-store settings file, or
// they overwrite each other's persisted per-display state.
if (!app.isPackaged) {
  app.setPath('userData', path.join(app.getPath('userData'), 'dev'))
}

// --- Single-instance lock (PRD §9.7) -----------------------------------------
// A second instance would contend over global-shortcut registration and its
// hotkeys would silently fail to register.
const gotLock = app.requestSingleInstanceLock()
if (!gotLock) {
  app.quit()
} else {
  app.on('second-instance', () => {
    // Surface the existing overlay(s) instead of starting a new instance.
    for (const w of BrowserWindow.getAllWindows()) w.show()
  })

  main()
}

function main(): void {
  // No dock icon on macOS — this is a menu-bar utility (PRD §7.7).
  if (process.platform === 'darwin') {
    app.dock?.hide()
  }

  app.whenReady().then(() => {
    registerIpc()
    createTray()
    ensureOverlaysForAllDisplays()
    registerShortcuts()
    watchDisplays()
  })

  // Never quit when the last window is "closed" — overlays get hidden, not
  // closed, and the app lives in the tray. Quit only via the tray menu.
  app.on('window-all-closed', () => {
    // Intentionally empty: keep running in the tray.
  })

  app.on('will-quit', () => {
    unregisterShortcuts()
    destroyTray()
  })
}

/**
 * Create/destroy overlays as displays are plugged in or removed, and re-clamp
 * on metrics changes (resolution / scaling) so a persisted center can't strand
 * the goniometer off-screen (PRD §7.2, §7.6).
 */
function watchDisplays(): void {
  screen.on('display-added', (_e, display) => {
    if (!overlayWindows.has(display.id)) {
      const win = createOverlayWindow(display)
      win.webContents.once('did-finish-load', () => {
        if (!isVisible()) win.hide()
        syncWindow(win)
      })
    }
  })

  screen.on('display-removed', (_e, display) => {
    destroyOverlayForDisplay(display.id)
  })

  // When a display's resolution/scale changes, tell its overlay to re-clamp and
  // resize its glass sheet to the new bounds.
  screen.on('display-metrics-changed', (_e, display, changed) => {
    const win = overlayWindows.get(display.id)
    if (!win || win.isDestroyed()) return
    if (changed.includes('bounds') || changed.includes('scaleFactor')) {
      const { x, y, width, height } = display.bounds
      win.setBounds({ x, y, width, height })
      win.webContents.send('overlay:display-resized', {
        width,
        height,
        scaleFactor: display.scaleFactor || 1
      })
    }
  })
}
