import { useStore } from '../store/useStore.js'
import { parseYouTubeId } from '../engines/web-stream.js'

/**
 * Check if currently running inside the native Tauri runtime
 */
export function isTauri() {
  return typeof window !== 'undefined' && Boolean(window.__TAURI_INTERNALS__)
}

/**
 * Safely converts local file paths for WebView2 / browser display.
 * In Tauri: uses convertFileSrc from window.__TAURI_INTERNALS__
 * In Web Browser: uses local dev server /api/local-file streaming
 */
export function safeConvertFileSrc(filePath) {
  if (!filePath) return ''
  let cleanPath = typeof filePath === 'string' ? filePath.trim() : String(filePath)
  if (cleanPath.startsWith('file:///')) {
    cleanPath = cleanPath.slice(8)
  } else if (cleanPath.startsWith('file://')) {
    cleanPath = cleanPath.slice(7)
  }
  const normalized = cleanPath.replace(/\\/g, '/')
  if (
    normalized.startsWith('http://') ||
    normalized.startsWith('https://') ||
    normalized.startsWith('data:') ||
    normalized.startsWith('blob:') ||
    normalized.startsWith('/')
  ) {
    return normalized
  }
  if (isTauri()) {
    try {
      if (typeof window.__TAURI_INTERNALS__?.convertFileSrc === 'function') {
        return window.__TAURI_INTERNALS__.convertFileSrc(normalized, 'asset')
      }
    } catch (e) {
      console.warn('[AetherFlow] convertFileSrc error:', e)
    }
  }
  return `/api/local-file?path=${encodeURIComponent(cleanPath)}`
}

export const convertFileSrc = safeConvertFileSrc

/**
 * Safely listens to Tauri runtime events with automatic fallback when running in browser.
 */
export async function safeListen(eventName, callback) {
  if (!isTauri()) {
    return () => {}
  }
  try {
    const { listen } = await import('@tauri-apps/api/event')
    return await listen(eventName, callback)
  } catch (err) {
    console.warn('[AetherFlow] safeListen error:', eventName, err)
    return () => {}
  }
}

/**
 * Safely opens a URL in the user's default system browser.
 */
export async function openExternalUrl(url) {
  if (!url) return
  let target = url.trim()
  if (!/^https?:\/\//i.test(target)) {
    target = 'https://' + target
  }
  if (isTauri()) {
    try {
      const { invoke } = await import('@tauri-apps/api/core')
      await invoke('open_url', { url: target })
      return
    } catch {}
  }
  window.open(target, '_blank', 'noopener,noreferrer')
}

/**
 * Tauri invoke wrapper that fails gracefully when running in web browser dev mode
 */
export async function tauriInvoke(cmd, args) {
  if (!isTauri()) {
    return null
  }
  try {
    const { invoke } = await import('@tauri-apps/api/core')
    return await invoke(cmd, args)
  } catch (err) {
    console.warn('[AetherFlow] Tauri invoke skipped:', cmd, err)
    return null
  }
}

// Track monotonically increasing apply transaction IDs per monitor scope
const monitorApplyTransactions = new Map()

let settleTrimTimer = null

/**
 * Trims process memory after wallpaper initialization settles, purging transient
 * startup pages (codec DLL mappings, shader compilation caches, V8 JIT heap) to
 * drop working set memory down to true steady-state requirements (~200-300 MB).
 */
export function schedulePostApplyTrim(delayMs = 10000) {
  if (settleTrimTimer) clearTimeout(settleTrimTimer)
  settleTrimTimer = setTimeout(() => {
    settleTrimTimer = null
    tauriInvoke('trim_memory').catch(() => {})
  }, delayMs)
}

/**
 * Applies any wallpaper (built-in or custom video) to the Windows desktop
 * directly via Tauri backend.
 */
export async function applyWallpaperToDesktop(wallpaper, options = {}) {
  if (!wallpaper) return false

  const state = useStore.getState()
  const rawTarget = options.targetMonitor ?? (state.screenArrangement === 'per-screen' ? options.selectedMonitorLabel : null)
  const targetLabel = (rawTarget && rawTarget !== 'all') ? rawTarget : null
  const txScope = targetLabel || '*'
  const myTxId = (monitorApplyTransactions.get(txScope) || 0) + 1
  monitorApplyTransactions.set(txScope, myTxId)
  if (txScope === '*') {
    for (const key of monitorApplyTransactions.keys()) {
      monitorApplyTransactions.set(key, myTxId)
    }
  }
  
  const adheredAudio = state.wallpaperAudioSettings?.[wallpaper.id]
  const speed = options.speed ?? wallpaper.config?.speedMultiplier ?? state.wallpaperSpeed ?? 1
  const volume = options.forceVolume ?? adheredAudio?.volume ?? options.volume ?? wallpaper.config?.volume ?? state.audioVolume ?? 50
  const muted = options.forceMuted ?? adheredAudio?.muted ?? options.muted ?? wallpaper.config?.muted ?? state.audioMuted ?? false
  const opacity = options.opacity ?? state.wallpaperOpacity ?? 1
  const brightness = options.brightness ?? state.wallpaperBrightness ?? 0.85
  const fps = options.fps ?? state.fps ?? 60
  const contrast = options.contrast ?? state.wallpaperContrast ?? 1.0
  const saturation = options.saturation ?? state.wallpaperSaturation ?? 1.0

  try {
    const resolvedEngine = wallpaper.engine
      || (wallpaper.config?.videoPath ? 'video-player' : null)
      || (wallpaper.config?.imagePath ? 'image-player' : null)
      || (wallpaper.config?.streamUrl || wallpaper.config?.url ? 'web-stream' : null)
      || wallpaper.id

    let finalStreamUrl = wallpaper.config?.streamUrl || wallpaper.config?.url || ''
    const ytId = parseYouTubeId(finalStreamUrl)
    if (ytId === 'jfKfPfyJRdk') finalStreamUrl = 'https://www.youtube.com/watch?v=TURbeWK2wwg'
    else if (ytId === '1zxD9O4b1oY') finalStreamUrl = 'https://www.youtube.com/watch?v=uD4izuDMUQA'
    else if (ytId === '7uK_Z2Q2R2E') finalStreamUrl = 'https://www.youtube.com/watch?v=21qNxnCS8WU'
    else if (ytId === 'aXYKRAdrfEo') finalStreamUrl = 'https://www.youtube.com/watch?v=eZe4Q_58UTU'
    else if (ytId === 'nz1cEO01LzE') finalStreamUrl = 'https://www.youtube.com/watch?v=WJ3-F02-F_Y'

    await tauriInvoke('apply_wallpaper', {
      engineId: resolvedEngine,
      config: {
        ...(wallpaper.config || {}),
        streamUrl: finalStreamUrl,
        speedMultiplier: speed,
        volume,
        muted,
        fps,
        contrast,
        saturation,
        youtubeBackend: state.youtubeBackend || 'mpv',
      },
      opacity,
      brightness,
      monitorLabel: targetLabel || null,
    })

    // Discard commit if a newer apply request was already triggered
    if (monitorApplyTransactions.get(txScope) !== myTxId) {
      console.log(`[AetherFlow] Apply transaction ${myTxId} for ${txScope} was superseded; discarding commit.`)
      return false
    }

    // Update Zustand state
    state.setActiveWallpaper(wallpaper)
    state.setCurrentDesktopWallpaper(wallpaper)
    state.setWallpaperRunning(true)
    if (targetLabel) {
      state.setMonitorWallpaper(targetLabel, wallpaper)
    } else {
      // In duplicate mode, clear individual monitor overrides so all screens share currentDesktopWallpaper
      state.clearMonitorWallpapers()
      state.setCurrentDesktopWallpaper(wallpaper)
      state.setWallpaperRunning(true)
    }

    // Auto-trim working set after wallpaper decoders and GPU pipeline settle
    schedulePostApplyTrim(10000)

    return true
  } catch (err) {
    console.error('[AetherFlow] Failed to apply wallpaper to desktop:', err)
    return false
  }
}

/**
 * Stops live wallpaper on one or all monitors
 */
export async function stopDesktopWallpaper(targetMonitor = null) {
  const txScope = targetMonitor || '*'
  monitorApplyTransactions.set(txScope, (monitorApplyTransactions.get(txScope) || 0) + 1)
  if (txScope === '*') {
    for (const key of monitorApplyTransactions.keys()) {
      monitorApplyTransactions.set(key, (monitorApplyTransactions.get(key) || 0) + 1)
    }
  }

  const state = useStore.getState()
  try {
    await tauriInvoke('stop_wallpaper', { monitorLabel: targetMonitor || null })
    if (targetMonitor) {
      state.setMonitorWallpaper(targetMonitor, null)
      // If no other monitors have an active wallpaper, mark running as false
      const remaining = Object.values(state.monitorWallpapers || {}).filter(Boolean)
      if (remaining.length === 0) {
        state.setWallpaperRunning(false)
        state.setCurrentDesktopWallpaper(null)
      }
    } else {
      state.clearMonitorWallpapers()
      state.setWallpaperRunning(false)
      state.setCurrentDesktopWallpaper(null)
    }
    tauriInvoke('trim_memory').catch(() => {})
    return true
  } catch (err) {
    console.error('[AetherFlow] Failed to stop wallpaper:', err)
    return false
  }
}

/**
/**
 * Sets the native Windows desktop wallpaper (Explorer wallpaper)
 */
export async function setSystemWallpaper(path) {
  if (!path) return false
  try {
    await tauriInvoke('set_system_wallpaper', { path })
    return true
  } catch (err) {
    console.error('[AetherFlow] Failed to set system wallpaper:', err)
    return false
  }
}

/**
 * Opens native file dialog to import a video or picture wallpaper and adds it to Library
 */
export async function importWallpaperDialog() {
  try {
    const { open } = await import('@tauri-apps/plugin-dialog')
    const selected = await open({
      multiple: false,
      filters: [
        {
          name: 'All Supported Media',
          extensions: ['png', 'jpg', 'jpeg', 'webp', 'bmp', 'mp4', 'webm', 'mkv', 'avi', 'mov', 'wmv', 'flv']
        },
        {
          name: 'Pictures (*.png, *.jpg, *.jpeg, *.webp, *.bmp)',
          extensions: ['png', 'jpg', 'jpeg', 'webp', 'bmp']
        },
        {
          name: 'Videos (*.mp4, *.webm, *.mkv, *.avi, *.mov)',
          extensions: ['mp4', 'webm', 'mkv', 'avi', 'mov', 'wmv', 'flv']
        }
      ]
    })

    if (selected) {
      const path = typeof selected === 'string' ? selected : selected[0]
      if (!path) return null

      return await addCustomMediaWallpaper(path)
    }
  } catch (err) {
    console.error('[AetherFlow] Failed to open import dialog:', err)
  }
  return null
}

const inFlightMediaThumbnails = new Map()

/**
 * Deduplicated, bounded thumbnail request for any media item (image or video).
 * Multiple simultaneous requests for the same wallpaper share the exact same Promise.
 */
export async function getOrCreateMediaThumbnail(wallpaperId, mediaPath, mediaType = 'image') {
  if (!wallpaperId || !mediaPath) return null
  const cacheKey = `${wallpaperId}:${mediaPath}`
  if (inFlightMediaThumbnails.has(cacheKey)) {
    return inFlightMediaThumbnails.get(cacheKey)
  }

  const promise = (async () => {
    try {
      const thumb = await tauriInvoke('get_or_create_media_thumbnail', {
        wallpaperId,
        mediaPath,
        mediaType,
      })
      return thumb || null
    } catch (err) {
      console.warn(`[AetherFlow] get_or_create_media_thumbnail failed for ${wallpaperId}:`, err)
      return null
    } finally {
      inFlightMediaThumbnails.delete(cacheKey)
    }
  })()

  inFlightMediaThumbnails.set(cacheKey, promise)
  return promise
}

/**
 * Adds a media file path (picture or video) into the user's installed library with optional custom name & home pinning.
 * Self-contained: Copies media to %APPDATA%\AetherFlow\library\ so deleting original files doesn't break wallpapers.
 */
export async function addCustomMediaWallpaper(path, customName = null, pinToHome = true) {
  if (!path) return null

  let finalPath = path
  try {
    const importedPath = await tauriInvoke('import_wallpaper_media', { sourcePath: path })
    if (importedPath) {
      finalPath = importedPath
    }
  } catch (err) {
    console.warn('[AetherFlow] Self-contained media copy failed, using source path:', err)
  }

  const filename = finalPath.split('\\').pop().split('/').pop()
  const cleanName = filename.replace(/\.[^/.]+$/, '').replace(/^\d{9,12}[-_]/, '')

  const isImg = /\.(png|jpe?g|webp|bmp|gif|avif)$/i.test(finalPath)

  const itemId = 'local-' + Date.now()
  let thumbnail = null
  try {
    const generatedThumb = await tauriInvoke('get_or_create_media_thumbnail', {
      wallpaperId: itemId,
      mediaPath: finalPath,
      mediaType: isImg ? 'image' : 'video',
    })
    if (generatedThumb) {
      thumbnail = generatedThumb
    }
  } catch (thumbErr) {
    console.warn('[AetherFlow] Native thumbnail generation failed on import:', thumbErr)
  }

  const item = isImg ? {
    id: itemId,
    type: 'wallpaper',
    name: customName?.trim() || cleanName || filename,
    engine: 'image-player',
    thumbnail,
    config: { imagePath: finalPath, fit: 'cover' },
    tags: ['custom', 'picture', 'image'],
    installedAt: new Date().toISOString(),
    isCustom: true,
    mediaType: 'image',
  } : {
    id: itemId,
    type: 'wallpaper',
    name: customName?.trim() || cleanName || filename,
    engine: 'video-player',
    thumbnail,
    config: { videoPath: finalPath, speedMultiplier: 1 },
    tags: ['custom', 'video'],
    installedAt: new Date().toISOString(),
    isCustom: true,
    mediaType: 'video',
  }

  const state = useStore.getState()
  state.installItem(item)
  if (pinToHome) {
    state.pinToHome(item.id)
  }
  return item
}

// Backward compatibility alias
export const addCustomVideoWallpaper = addCustomMediaWallpaper

/**
 * Adds a live stream or YouTube URL into the user's library
 */
export function addCustomStreamWallpaper(url, customName = null, muted = false, pinToHome = true) {
  if (!url) return null
  const cleanUrl = url.trim()

  // Extract YouTube ID if present
  let ytId = parseYouTubeId(cleanUrl)
  if (ytId === 'jfKfPfyJRdk') ytId = 'TURbeWK2wwg'
  else if (ytId === '1zxD9O4b1oY') ytId = 'uD4izuDMUQA'
  else if (ytId === '7uK_Z2Q2R2E') ytId = '21qNxnCS8WU'
  else if (ytId === 'aXYKRAdrfEo') ytId = 'eZe4Q_58UTU'
  else if (ytId === 'nz1cEO01LzE') ytId = 'WJ3-F02-F_Y'

  const defaultName = ytId ? 'YouTube Ambient Stream' : 'Live Web Stream'
  const preview = ytId ? `https://img.youtube.com/vi/${ytId}/hqdefault.jpg` : '/previews/deep-space.svg'

  const item = {
    id: 'stream-' + Date.now(),
    type: 'wallpaper',
    name: customName?.trim() || defaultName,
    engine: 'web-stream',
    config: {
      streamUrl: cleanUrl,
      muted,
      youtubeId: ytId,
    },
    preview,
    tags: ytId ? ['custom', 'stream', 'youtube', 'live'] : ['custom', 'stream', 'web', 'live'],
    installedAt: new Date().toISOString(),
    isCustom: true,
    mediaType: 'stream',
  }

  const state = useStore.getState()
  state.installItem(item)
  if (pinToHome) {
    state.pinToHome(item.id)
  }
  return item
}
