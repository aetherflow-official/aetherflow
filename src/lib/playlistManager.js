import { useStore } from '../store/useStore.js'
import { safeListen, tauriInvoke, isTauri, applyWallpaperToDesktop } from './wallpaperActions.js'
import { batchImportMediaFiles } from './storageManager.js'
import { WALLPAPER_LIST } from '../engines/index.js'

let isInitialized = false
let devIntervalTimer = null

/**
 * Helper to retrieve a wallpaper object by ID (custom or built-in)
 */
function findWallpaperById(id) {
  const state = useStore.getState()
  const installed = state.installed || []
  const found = installed.find(w => w.id === id)
  if (found) return found

  // Check builtins
  const b = WALLPAPER_LIST.find(w => w.id === id)
  if (b) {
    const names = state.customNames || {}
    return {
      id: b.id,
      name: names[b.id] || b.name,
      engine: b.id,
      tags: b.tags || ['canvas'],
      config: b.defaultConfig || {},
      isCustom: false,
      builtin: true,
    }
  }

  return null
}

/**
 * Picks the next wallpaper ID from a playlist according to order ('shuffle' | 'linear')
 */
export function getNextWallpaperId(playlist) {
  if (!playlist || !Array.isArray(playlist.wallpaperIds) || playlist.wallpaperIds.length === 0) {
    return null
  }

  const ids = playlist.wallpaperIds
  if (ids.length === 1) return ids[0]

  const state = useStore.getState()
  const historyMap = state.playlistHistory || {}
  const history = historyMap[playlist.id] || []

  if (playlist.order === 'shuffle') {
    // Non-repeating shuffle: filter out items already played in this cycle
    let pool = ids.filter(id => !history.includes(id))
    if (pool.length === 0) {
      // Cycle complete — reset history
      pool = ids
      useStore.setState(s => ({
        playlistHistory: {
          ...(s.playlistHistory || {}),
          [playlist.id]: []
        }
      }))
    }

    const randomIndex = Math.floor(Math.random() * pool.length)
    const selectedId = pool[randomIndex]

    // Record into history
    useStore.setState(s => ({
      playlistHistory: {
        ...(s.playlistHistory || {}),
        [playlist.id]: [...(s.playlistHistory?.[playlist.id] || []).filter(x => x !== selectedId), selectedId]
      }
    }))

    return selectedId
  } else {
    // Linear mode: find last played and step to next
    const lastPlayedId = history[history.length - 1]
    let nextIndex = 0
    if (lastPlayedId) {
      const idx = ids.indexOf(lastPlayedId)
      if (idx >= 0) {
        nextIndex = (idx + 1) % ids.length
      }
    }
    const selectedId = ids[nextIndex]

    useStore.setState(s => ({
      playlistHistory: {
        ...(s.playlistHistory || {}),
        [playlist.id]: [selectedId]
      }
    }))

    return selectedId
  }
}

/**
 * Advance rotation for a monitor or global scope
 */
export async function rotateNext(monitorScope = '*', playlistId = null, forced = false) {
  const state = useStore.getState()
  const activePlaylists = state.activePlaylists || {}
  const targetPlaylistId = playlistId
    || activePlaylists[monitorScope]
    || (monitorScope === '*' ? activePlaylists['*'] : null)

  if (!targetPlaylistId) {
    return false
  }

  const playlist = (state.playlists || []).find(p => p.id === targetPlaylistId)
  if (!playlist) return false

  if (!forced && !playlist.enabled) {
    return false
  }

  const nextId = getNextWallpaperId(playlist)
  if (!nextId) return false

  // Find wallpaper definition
  const nextWallpaper = findWallpaperById(nextId)

  if (!nextWallpaper) {
    console.warn('[PlaylistManager] Target wallpaper not found in installed library or builtins:', nextId)
    return false
  }

  // Resolve target monitor: respect playlist.targetMonitor if explicitly set
  const resolvedScope = (monitorScope && monitorScope !== '*')
    ? monitorScope
    : (playlist.targetMonitor && playlist.targetMonitor !== '*' ? playlist.targetMonitor : '*')

  const targetMonitor = resolvedScope === '*' ? null : resolvedScope

  console.log(`[PlaylistManager] Rotating to "${nextWallpaper.name}" on scope "${resolvedScope}" (Playlist: ${playlist.name})`)
  
  await applyWallpaperToDesktop(nextWallpaper, { targetMonitor })

  // Update lastRotated timestamp
  useStore.setState(s => ({
    playlists: (s.playlists || []).map(p => {
      if (p.id === playlist.id) {
        return { ...p, lastRotatedAt: Date.now() }
      }
      return p
    })
  }))

  return true
}

/**
 * Synchronize playlist timers to the Rust backend
 */
export async function syncPlaylistTimersToRust() {
  if (!isTauri()) return

  const state = useStore.getState()
  const playlists = state.playlists || []
  const activePlaylists = state.activePlaylists || {}

  const timers = []
  for (const [scope, pId] of Object.entries(activePlaylists)) {
    if (!pId) continue
    const pl = playlists.find(p => p.id === pId)
    if (pl && pl.enabled && Array.isArray(pl.wallpaperIds) && pl.wallpaperIds.length > 0) {
      const intervalMins = Math.max(1, pl.intervalMins || 15)
      timers.push({
        monitor_scope: scope,
        playlist_id: pId,
        interval_secs: intervalMins * 60,
        enabled: true,
      })
    }
  }

  try {
    await tauriInvoke('sync_playlist_timers', { timers })
  } catch (err) {
    console.warn('[PlaylistManager] Failed to sync playlist timers:', err)
  }
}

/**
 * Initialize Playlist Manager listeners (called once on startup)
 */
export function initPlaylistManager() {
  if (isInitialized) return
  isInitialized = true

  // Listen to Rust background rotation trigger
  safeListen('aether:playlist-rotate-trigger', (event) => {
    const payload = event?.payload
    if (payload && payload.playlist_id) {
      rotateNext(payload.monitor_scope || '*', payload.playlist_id, false)
    }
  })

  // Listen to Watch Folder auto-ingestion event
  safeListen('aether:watch-folder-new-items', async (event) => {
    const newPaths = event?.payload
    if (Array.isArray(newPaths) && newPaths.length > 0) {
      console.log(`[PlaylistManager] Watch folder detected ${newPaths.length} new items. Auto-importing...`)
      try {
        await batchImportMediaFiles(newPaths, { pinToHome: true })
      } catch (err) {
        console.error('[PlaylistManager] Watch folder auto-import failed:', err)
      }
    }
  })

  // Sync timers immediately
  syncPlaylistTimersToRust()

  // Browser dev fallback rotation runner
  if (!isTauri()) {
    if (devIntervalTimer) clearInterval(devIntervalTimer)
    devIntervalTimer = setInterval(() => {
      const state = useStore.getState()
      const playlists = state.playlists || []
      const activePlaylists = state.activePlaylists || {}
      const now = Date.now()

      for (const [scope, pId] of Object.entries(activePlaylists)) {
        if (!pId) continue
        const pl = playlists.find(p => p.id === pId)
        if (pl && pl.enabled && pl.wallpaperIds?.length > 0) {
          const intervalMs = (pl.intervalMins || 15) * 60 * 1000
          const lastRotated = pl.lastRotatedAt || 0
          if (now - lastRotated >= intervalMs) {
            rotateNext(scope, pId, false)
          }
        }
      }
    }, 10000) // Check every 10s in dev mode
  }
}
