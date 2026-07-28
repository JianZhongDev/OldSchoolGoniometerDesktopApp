import { app, BrowserWindow, ipcMain, clipboard, screen, nativeTheme, shell } from 'electron'
import type { GoniometerState } from '../shared/types'
import { displayIdForWindow, allOverlayWindows } from './windows'
import { loadDisplayState, saveDisplayState } from './store'
import { setLocked } from './controller'

/**
 * The most recently reported angle-readout text, from whichever overlay the
 * user last interacted with. Used by the global "copy angle" shortcut and the
 * tray "Copy angle" item, which have no renderer context of their own.
 */
let lastAngleText = ''

export function getLastAngleText(): string {
  return lastAngleText
}

export function registerIpc(): void {
  // Passthrough toggle. The renderer calls this as the cursor enters/leaves the
  // goniometer's pixels. `ignore === true` -> clicks pass through.
  ipcMain.on('overlay:set-passthrough', (e, ignore: boolean) => {
    const win = BrowserWindow.fromWebContents(e.sender)
    win?.setIgnoreMouseEvents(ignore, { forward: true })
  })

  // Numeric-entry focus dance (PRD §6.3). The window is normally focusable:false
  // so it never steals the design tool's selection; we flip it on only while a
  // number is being typed into the readout.
  ipcMain.handle('overlay:set-focusable', (e, focusable: boolean) => {
    const win = BrowserWindow.fromWebContents(e.sender)
    win?.setFocusable(focusable)
    if (focusable) win?.focus()
  })

  ipcMain.on('overlay:save-state', (e, state: GoniometerState) => {
    const win = BrowserWindow.fromWebContents(e.sender)
    if (!win) return
    const id = displayIdForWindow(win)
    if (id !== undefined) saveDisplayState(id, state)
  })

  ipcMain.handle('overlay:load-state', (e): GoniometerState | null => {
    const win = BrowserWindow.fromWebContents(e.sender)
    if (!win) return null
    const id = displayIdForWindow(win)
    return id !== undefined ? loadDisplayState(id) : null
  })

  ipcMain.handle('overlay:get-display-id', (e): number => {
    const win = BrowserWindow.fromWebContents(e.sender)
    const id = win ? displayIdForWindow(win) : undefined
    return id ?? -1
  })

  ipcMain.handle('overlay:get-display-info', (e): { scaleFactor: number; dark: boolean } => {
    const win = BrowserWindow.fromWebContents(e.sender)
    const dark = nativeTheme.shouldUseDarkColors
    if (!win) return { scaleFactor: 1, dark }
    const display = screen.getDisplayMatching(win.getBounds())
    return { scaleFactor: display.scaleFactor || 1, dark }
  })

  // Push OS light/dark changes to every overlay so the chrome panels retheme.
  nativeTheme.on('updated', () => {
    for (const win of allOverlayWindows()) {
      win.webContents.send('overlay:theme-changed', nativeTheme.shouldUseDarkColors)
    }
  })

  // Lock toggled from the overlay's own toolbar — route through the controller
  // so the tray checkbox and every display stay in sync.
  ipcMain.on('overlay:set-locked', (_e, locked: boolean) => {
    setLocked(locked)
  })

  ipcMain.on('overlay:quit', () => {
    app.quit()
  })

  // Open a link from the info panel externally. Only https is allowed.
  ipcMain.on('overlay:open-external', (_e, url: string) => {
    if (typeof url === 'string' && /^https:\/\//i.test(url)) {
      shell.openExternal(url)
    }
  })

  ipcMain.on('overlay:copy', (_e, text: string) => {
    clipboard.writeText(text)
  })

  // Renderers report their readout text on every change so the global copy
  // shortcut always has a fresh value to place on the clipboard.
  ipcMain.on('overlay:report-angle', (_e, text: string) => {
    lastAngleText = text
  })
}
