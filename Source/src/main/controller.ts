import { clipboard, Notification } from 'electron'
import { allOverlayWindows } from './windows'
import { getLastAngleText } from './ipc'

/**
 * App-level overlay state and the actions that mutate it. Both the tray menu and
 * the global shortcuts drive the overlay through this single controller so the
 * two never disagree about whether the overlay is hidden or locked.
 */

let visible = true
let locked = false

type Listener = () => void
const changeListeners = new Set<Listener>()

/** Register a callback fired whenever visible/locked change (e.g. to refresh the tray checkboxes). */
export function onStateChanged(cb: Listener): void {
  changeListeners.add(cb)
}

function emitChanged(): void {
  for (const cb of changeListeners) cb()
}

export function isVisible(): boolean {
  return visible
}

export function isLocked(): boolean {
  return locked
}

export function setVisible(next: boolean): void {
  visible = next
  for (const win of allOverlayWindows()) {
    if (visible) win.showInactive()
    else win.hide()
  }
  emitChanged()
}

export function toggleVisibility(): void {
  setVisible(!visible)
}

export function setLocked(next: boolean): void {
  locked = next
  for (const win of allOverlayWindows()) {
    win.webContents.send('overlay:lock-changed', locked)
  }
  emitChanged()
}

export function toggleLock(): void {
  setLocked(!locked)
}

export function resetPosition(): void {
  for (const win of allOverlayWindows()) {
    win.webContents.send('overlay:reset')
  }
}

export function setOpacity(opacity: number): void {
  for (const win of allOverlayWindows()) {
    win.webContents.send('overlay:set-opacity', opacity)
  }
}

/** Push the current lock/visibility state to a freshly-created overlay window. */
export function syncWindow(win: Electron.BrowserWindow): void {
  win.webContents.send('overlay:lock-changed', locked)
}

export function copyAngle(): void {
  const text = getLastAngleText()
  if (text) clipboard.writeText(text)
}

export function notify(title: string, body: string): void {
  if (Notification.isSupported()) {
    new Notification({ title, body }).show()
  }
}
