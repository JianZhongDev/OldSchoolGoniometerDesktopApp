import { contextBridge, ipcRenderer } from 'electron'
import type { GoniometerState } from '../shared/types'

/**
 * The narrow, typed surface exposed to the renderer as `window.api`.
 * Keep this the single source of truth for the IPC contract (PRD §7.5).
 */
const api = {
  // --- renderer -> main (fire and forget) ---
  setPassthrough: (ignore: boolean): void =>
    ipcRenderer.send('overlay:set-passthrough', ignore),

  saveState: (state: GoniometerState): void =>
    ipcRenderer.send('overlay:save-state', state),

  copyToClipboard: (text: string): void => ipcRenderer.send('overlay:copy', text),

  reportAngle: (text: string): void => ipcRenderer.send('overlay:report-angle', text),

  /** Toggle locked (inert) mode from the overlay's own toolbar; syncs tray + all displays. */
  setLocked: (locked: boolean): void => ipcRenderer.send('overlay:set-locked', locked),

  /** Quit the whole app (the overlay has no window chrome of its own). */
  quit: (): void => ipcRenderer.send('overlay:quit'),

  /** Open an https URL (the info panel's links) in the default browser. */
  openExternal: (url: string): void => ipcRenderer.send('overlay:open-external', url),

  // --- renderer -> main (request/response) ---
  setFocusable: (focusable: boolean): Promise<void> =>
    ipcRenderer.invoke('overlay:set-focusable', focusable),

  loadState: (): Promise<GoniometerState | null> => ipcRenderer.invoke('overlay:load-state'),

  getDisplayId: (): Promise<number> => ipcRenderer.invoke('overlay:get-display-id'),

  /** Display metrics for ruler scaling (DPI = 96 × scaleFactor) + OS dark mode. */
  getDisplayInfo: (): Promise<{ scaleFactor: number; dark: boolean }> =>
    ipcRenderer.invoke('overlay:get-display-info'),

  // --- main -> renderer (subscriptions) ---
  onLockChanged: (cb: (locked: boolean) => void): void => {
    ipcRenderer.on('overlay:lock-changed', (_e, locked: boolean) => cb(locked))
  },

  onReset: (cb: () => void): void => {
    ipcRenderer.on('overlay:reset', () => cb())
  },

  onSetOpacity: (cb: (opacity: number) => void): void => {
    ipcRenderer.on('overlay:set-opacity', (_e, opacity: number) => cb(opacity))
  },

  onDisplayResized: (
    cb: (size: { width: number; height: number; scaleFactor: number }) => void
  ): void => {
    ipcRenderer.on('overlay:display-resized', (_e, size) => cb(size))
  },

  onThemeChanged: (cb: (dark: boolean) => void): void => {
    ipcRenderer.on('overlay:theme-changed', (_e, dark: boolean) => cb(dark))
  }
}

contextBridge.exposeInMainWorld('api', api)

export type Api = typeof api
