import Store from 'electron-store'
import type { GoniometerState } from '../shared/types'

interface Schema {
  /** Per-display persisted state, keyed by stringified display id. */
  displays: Record<string, GoniometerState>
}

/**
 * The store is created LAZILY, not at module load. electron-store resolves its
 * file path (`app.getPath('userData')`) in its constructor, and the dev-vs-
 * installed separation in main/index.ts (`app.setPath('userData', …/dev)`,
 * PRD §9.7) only runs in the main module body — AFTER this module is imported.
 * Constructing eagerly would capture the pre-override path and defeat the
 * isolation. Every accessor below goes through `store()`, whose first call
 * happens from an IPC handler (well after `whenReady`), so the override is in
 * effect by then.
 */
let _store: Store<Schema> | null = null

function store(): Store<Schema> {
  if (!_store) {
    _store = new Store<Schema>({
      name: 'goniometer-overlay',
      defaults: { displays: {} }
    })
  }
  return _store
}

export function loadDisplayState(displayId: number): GoniometerState | null {
  const displays = store().get('displays')
  return displays[String(displayId)] ?? null
}

export function saveDisplayState(displayId: number, state: GoniometerState): void {
  const displays = { ...store().get('displays') }
  displays[String(displayId)] = state
  store().set('displays', displays)
}
