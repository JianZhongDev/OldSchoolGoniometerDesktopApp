import { app, globalShortcut } from 'electron'
import { toggleVisibility, toggleLock, copyAngle, notify } from './controller'

/**
 * Global shortcuts (PRD §6.4). These fire even when another app has focus.
 * `globalShortcut.register` returns false if another app already owns the
 * combination — surface that via a tray notification rather than failing
 * silently.
 */
const bindings: Array<{ accelerator: string; action: () => void; label: string }> = [
  {
    accelerator: 'CommandOrControl+Shift+P',
    action: toggleVisibility,
    label: 'Toggle overlay visibility'
  },
  {
    accelerator: 'CommandOrControl+Shift+L',
    action: toggleLock,
    label: 'Toggle locked mode'
  },
  {
    accelerator: 'CommandOrControl+Shift+C',
    action: copyAngle,
    label: 'Copy current angle'
  },
  {
    // Emergency exit. Handled entirely in the main process + OS, so it works even
    // if the renderer is frozen and the overlay is swallowing all mouse clicks
    // (in which case the tray icon can't be reached either).
    accelerator: 'CommandOrControl+Shift+Q',
    action: () => app.quit(),
    label: 'Quit Goniometer Overlay'
  }
]

export function registerShortcuts(): void {
  const failed: string[] = []
  for (const { accelerator, action, label } of bindings) {
    const ok = globalShortcut.register(accelerator, action)
    if (!ok) failed.push(`${label} (${accelerator})`)
  }

  if (failed.length > 0) {
    notify(
      'Goniometer Overlay — shortcut conflict',
      `Could not register: ${failed.join(', ')}. Another app may already use these keys.`
    )
  }
}

export function unregisterShortcuts(): void {
  globalShortcut.unregisterAll()
}
