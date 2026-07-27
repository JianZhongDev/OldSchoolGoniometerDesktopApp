import { app, Menu, Tray, nativeImage } from 'electron'
import {
  isVisible,
  isLocked,
  toggleVisibility,
  toggleLock,
  resetPosition,
  setOpacity,
  copyAngle,
  onStateChanged
} from './controller'

/**
 * The overlay window is frameless, skips the taskbar, and hides the macOS dock
 * icon — so the tray is the ONLY way to control or quit the app (PRD §7.7).
 *
 * The icon is embedded as a base64 PNG so it renders identically in dev and in
 * the packaged app without depending on any on-disk resource path.
 */
const TRAY_ICON_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAAAXNSR0IArs4c6QAAAARnQU1BAACxjwv8YQUAAAAJcEhZcwAADsMAAA7DAcdvqGQAAAFuSURBVFhH7ZUtTwNBEIYrkUgkEolEIuved5s0wR2GpBKJxGFIkMhKJH+ABBTIOk4gKisQSByQOWaaZXJz7RVw+yQjuvM9O3sdDAqFQqFQKGwIgF0Ah5nse5s/J6U0JDkluSD52SLvJG8AHHvfXyHdkbx3yWo9M5k5/RwAfazeADjNgi7k92g02vN2wng83iE5keTmk1K6rqpqy9uuhY477+rE20Ro4XIl4vfUu4is8zeSl3bHsnzeNkKvzvZl6vUh6mgjHMpZNo1e3ch1aRPiO/H6VmyhAJzbGYBt6yY/X4eU0pHt0MriZXMjY3nv2WQOct0qSN6q34XX/UDecde4SF6pfu4L7CIrvva6JRLQ7itaNrWRb0C/xfouvokdPWNbGAk887ocXdLmicn9en2ETTf8UtqYANSyaF1C8k6L/QDw6PWBPKjPmc/dIJ1Jclu0/xAAL9Koz71E/9l85ZE8a+DXFl0kcfJNCBeqsCZfWpxSNwTcoGQAAAAASUVORK5CYII='

let tray: Tray | null = null

function buildIcon(): Electron.NativeImage {
  const img = nativeImage.createFromDataURL(`data:image/png;base64,${TRAY_ICON_BASE64}`)
  if (process.platform === 'darwin') {
    // Template images adapt to light/dark menu bars (PRD §7.7).
    img.setTemplateImage(true)
    return img.resize({ width: 16, height: 16 })
  }
  return img.resize({ width: 16, height: 16 })
}

function buildMenu(): Electron.Menu {
  return Menu.buildFromTemplate([
    {
      label: isVisible() ? 'Hide Overlay' : 'Show Overlay',
      click: () => toggleVisibility()
    },
    {
      label: 'Lock',
      type: 'checkbox',
      checked: isLocked(),
      click: () => toggleLock()
    },
    { type: 'separator' },
    {
      label: 'Reset Position',
      click: () => resetPosition()
    },
    {
      label: 'Opacity',
      submenu: [
        { label: '30%', click: () => setOpacity(0.3) },
        { label: '50%', click: () => setOpacity(0.5) },
        { label: '70%', click: () => setOpacity(0.7) },
        { label: '100%', click: () => setOpacity(1.0) }
      ]
    },
    {
      label: 'Copy Angle',
      click: () => copyAngle()
    },
    { type: 'separator' },
    {
      label: 'Quit',
      accelerator: 'CommandOrControl+Shift+Q',
      click: () => {
        app.quit()
      }
    }
  ])
}

function refreshMenu(): void {
  if (tray) tray.setContextMenu(buildMenu())
}

export function createTray(): Tray {
  tray = new Tray(buildIcon())
  tray.setToolTip('Goniometer Overlay')
  refreshMenu()

  // Left-click toggles visibility (Windows/Linux convention); macOS shows menu.
  tray.on('click', () => {
    if (process.platform !== 'darwin') toggleVisibility()
  })

  // Keep the checkbox/labels in sync when state changes via shortcuts.
  onStateChanged(refreshMenu)

  return tray
}

export function destroyTray(): void {
  tray?.destroy()
  tray = null
}
