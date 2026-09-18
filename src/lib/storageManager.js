import { tauriInvoke, isTauri } from './wallpaperActions.js'
import { useStore } from '../store/useStore.js'

/**
 * Inspect file metadata (size, format, existence)
 */
export async function getFileMetadata(filePath) {
  if (!filePath) return null
  if (!isTauri()) {
    const filename = filePath.split('\\').pop().split('/').pop()
    const ext = filename.split('.').pop()?.toLowerCase() || ''
    const isVideo = ['mp4', 'webm', 'mkv', 'avi', 'mov', 'wmv', 'flv'].includes(ext)
    return {
      path: filePath,
      name: filename.replace(/\.[^/.]+$/, ''),
      extension: ext,
      size_bytes: 10 * 1024 * 1024,
      is_file: true,
      is_video: isVideo,
      is_image: !isVideo,
    }
  }
  return await tauriInvoke('get_file_metadata', { path: filePath })
}

/**
 * Batch import media files with Hybrid storage policy (Copy vs In-place Reference)
 */
export async function batchImportMediaFiles(paths, options = {}) {
  if (!Array.isArray(paths) || paths.length === 0) return []

  const state = useStore.getState()
  const copyThresholdMb = options.copyThresholdMb ?? state.storageThresholdMb ?? 50
  const storageMode = options.storageMode ?? state.storageMode ?? 'hybrid'
  const onProgress = options.onProgress || null

  let results = []
  if (isTauri()) {
    try {
      results = await tauriInvoke('batch_import_media_files', {
        paths,
        copyThresholdMb,
        storageMode,
      })
    } catch (err) {
      console.error('[StorageManager] batch_import_media_files failed:', err)
    }
  }

  // Fallback if not in Tauri or backend call failed
  if (!results || results.length === 0) {
    results = paths.map((p, idx) => {
      const filename = p.split('\\').pop().split('/').pop()
      const ext = filename.split('.').pop()?.toLowerCase() || ''
      const isVideo = ['mp4', 'webm', 'mkv', 'avi', 'mov', 'wmv', 'flv'].includes(ext)
      return {
        original_path: p,
        final_path: p,
        name: filename.replace(/\.[^/.]+$/, '').replace(/[-_]/g, ' '),
        storage_type: 'reference',
        size_bytes: 15 * 1024 * 1024,
        media_type: isVideo ? 'video' : 'image',
        thumbnail: null,
        success: true,
        error: null,
      }
    })
  }

  const newWallpapers = []
  const now = Date.now()

  for (let i = 0; i < results.length; i++) {
    const res = results[i]
    if (!res.success) continue

    const isImg = res.media_type === 'image'
    const itemId = `local-${now}-${i}`

    const item = isImg ? {
      id: itemId,
      type: 'wallpaper',
      name: res.name || `Custom Image ${i + 1}`,
      engine: 'image-player',
      config: { imagePath: res.final_path, fit: 'cover' },
      tags: ['custom', 'picture', 'image'],
      installedAt: new Date().toISOString(),
      isCustom: true,
      mediaType: 'image',
      storageType: res.storage_type || 'reference',
      fileSize: res.size_bytes || 0,
      originalPath: res.original_path,
    } : {
      id: itemId,
      type: 'wallpaper',
      name: res.name || `Custom Video ${i + 1}`,
      engine: 'video-player',
      thumbnail: res.thumbnail || null,
      config: { videoPath: res.final_path, speedMultiplier: 1 },
      tags: ['custom', 'video'],
      installedAt: new Date().toISOString(),
      isCustom: true,
      mediaType: 'video',
      storageType: res.storage_type || 'reference',
      fileSize: res.size_bytes || 0,
      originalPath: res.original_path,
    }

    newWallpapers.push(item)
    if (onProgress) {
      onProgress(i + 1, results.length, item)
    }
  }

  // Install all items into state
  if (newWallpapers.length > 0) {
    state.batchInstallItems(newWallpapers, options.pinToHome ?? true)
  }

  return newWallpapers
}

/**
 * Recursively scan directory for supported wallpaper media
 */
export async function scanDirectoryMedia(dirPath) {
  if (!dirPath) return []
  if (!isTauri()) return []
  try {
    return (await tauriInvoke('scan_directory_media', { dirPath })) || []
  } catch (err) {
    console.error('[StorageManager] scanDirectoryMedia failed:', err)
    return []
  }
}

/**
 * Get library storage consumption statistics
 */
export async function getLibraryStorageStats() {
  if (!isTauri()) {
    return {
      library_dir: '%APPDATA%\\AetherFlow\\library',
      total_files: 0,
      total_bytes: 0,
    }
  }
  try {
    return (await tauriInvoke('get_library_storage_stats')) || {
      library_dir: '',
      total_files: 0,
      total_bytes: 0,
    }
  } catch (err) {
    console.error('[StorageManager] getLibraryStorageStats failed:', err)
    return { library_dir: '', total_files: 0, total_bytes: 0 }
  }
}

/**
 * Configure Watch Folder in Rust backend
 */
export async function setWatchFolder(path, enabled) {
  if (isTauri()) {
    try {
      await tauriInvoke('set_watch_folder', { path: path || null, enabled: Boolean(enabled) })
    } catch (err) {
      console.error('[StorageManager] setWatchFolder failed:', err)
    }
  }
}

/**
 * Trigger immediate scan of watch folder
 */
export async function scanWatchFolder() {
  if (!isTauri()) return []
  try {
    return (await tauriInvoke('scan_watch_folder')) || []
  } catch (err) {
    console.error('[StorageManager] scanWatchFolder failed:', err)
    return []
  }
}
