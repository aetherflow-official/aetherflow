import { safeConvertFileSrc } from './wallpaperActions.js'
import { useStore } from '../store/useStore.js'
import { videoPosterMemoryCache } from '../components/WallpaperThumbnail/index.jsx'

/**
 * Sequential, single-worker background poster generator for local custom videos.
 *
 * Architecture Rules:
 * 1. MAX ACTIVE POSTER DECODERS = 1 (Strictly serialized offscreen extraction).
 * 2. Generates a compact ~640x360 JPEG data URL.
 * 3. Saves to wallpaper.thumbnail via useStore.updateInstalledWallpaper and updates memory cache.
 * 4. Full decoder teardown after each frame: pause, removeAttribute('src'), load(), and 80ms cooling gap.
 * 5. Deduplicated, timeout-protected, and cancellable on navigation.
 */

class PosterGeneratorQueue {
  constructor() {
    this.queue = []
    this.activeJob = null
    this.processedSet = new Set()
    this.failedSet = new Set()
    this.isPaused = false
    this.coolingTimer = null
  }

  /**
   * Enqueue custom video wallpapers that need poster generation.
   * @param {Array<{ id: string, config?: { videoPath?: string }, videoPath?: string }>} wallpapers
   * @param {boolean} highPriority If true, unshift to front of queue (for visible cards)
   */
  enqueue(wallpapers, highPriority = false) {
    if (!Array.isArray(wallpapers) || wallpapers.length === 0) return

    const newJobs = []
    for (const wp of wallpapers) {
      if (!wp || !wp.id) continue

      // Skip if already processed, failed, or already has thumbnail/preview
      if (this.processedSet.has(wp.id) || this.failedSet.has(wp.id)) continue
      if (wp.thumbnail || wp.preview || wp.cover) {
        this.processedSet.add(wp.id)
        continue
      }
      if (videoPosterMemoryCache.has(wp.id)) {
        this.processedSet.add(wp.id)
        continue
      }

      // Check if already in queue
      if (this.queue.some(j => j.id === wp.id)) continue

      const videoPath =
        wp.config?.videoPath ||
        wp.videoPath ||
        wp.source ||
        wp.path ||
        wp.config?.path ||
        wp.defaultConfig?.videoPath ||
        ''

      if (!videoPath) {
        this.failedSet.add(wp.id)
        continue
      }

      newJobs.push({ id: wp.id, videoPath })
    }

    if (newJobs.length === 0) return

    if (highPriority) {
      this.queue.unshift(...newJobs)
    } else {
      this.queue.push(...newJobs)
    }

    this.processNext()
  }

  pause() {
    this.isPaused = true
    if (this.coolingTimer) {
      clearTimeout(this.coolingTimer)
      this.coolingTimer = null
    }
  }

  resume() {
    if (!this.isPaused) return
    this.isPaused = false
    this.processNext()
  }

  clear() {
    this.queue = []
    this.pause()
  }

  isIdle() {
    return this.activeJob === null && this.queue.length === 0
  }

  getStatus() {
    return {
      activeJob: this.activeJob ? this.activeJob.id : null,
      queueLength: this.queue.length,
      processedCount: this.processedSet.size,
      failedCount: this.failedSet.size,
      isPaused: this.isPaused,
    }
  }

  processNext() {
    if (this.isPaused || this.activeJob !== null || this.queue.length === 0) {
      return
    }

    const job = this.queue.shift()
    if (!job) return

    // Verify item is still installed and still lacks a thumbnail
    const state = useStore.getState()
    const installed = state.installed || []
    const currentItem = installed.find(w => w.id === job.id)

    if (!currentItem) {
      // Uninstalled while queued
      this.processNext()
      return
    }

    if (currentItem.thumbnail || currentItem.preview) {
      this.processedSet.add(job.id)
      this.processNext()
      return
    }

    this.activeJob = job

    this.extractFrame(job.videoPath)
      .then((dataUrl) => {
        if (dataUrl && dataUrl.length > 200) {
          // Persist to store (and localStorage/disk)
          try {
            const update = useStore.getState().updateInstalledWallpaper
            if (typeof update === 'function') {
              update(job.id, { thumbnail: dataUrl })
            }
          } catch (err) {
            console.warn('[PosterGenerator] Failed to persist thumbnail to store:', err)
          }

          // Cache in memory for immediate UI sync
          videoPosterMemoryCache.set(job.id, dataUrl)
          if (job.videoPath) videoPosterMemoryCache.set(job.videoPath, dataUrl)
          this.processedSet.add(job.id)
        } else {
          this.failedSet.add(job.id)
        }
      })
      .catch((err) => {
        console.warn(`[PosterGenerator] Poster extraction failed for ${job.id}:`, err?.message || err)
        this.failedSet.add(job.id)
      })
      .finally(() => {
        this.activeJob = null
        // 80ms cooling gap between jobs to ensure GPU decoder teardown completes
        this.coolingTimer = setTimeout(() => {
          this.coolingTimer = null
          this.processNext()
        }, 80)
      })
  }

  /**
   * Extracts a single frame from the video path using an offscreen HTML5 video element.
   * Enforces strict timeout and resource cleanup.
   * @param {string} videoPath
   * @returns {Promise<string>} dataUrl (JPEG)
   */
  extractFrame(videoPath) {
    return new Promise((resolve, reject) => {
      const videoSrc = safeConvertFileSrc(videoPath)
      if (!videoSrc) {
        return reject(new Error('Invalid videoSrc'))
      }

      let isResolved = false
      let timeoutId = null

      const video = document.createElement('video')
      video.muted = true
      video.playsInline = true
      video.preload = 'metadata'
      video.crossOrigin = 'anonymous'

      const cleanup = () => {
        if (timeoutId) {
          clearTimeout(timeoutId)
          timeoutId = null
        }
        video.onloadedmetadata = null
        video.onseeked = null
        video.onloadeddata = null
        video.onerror = null
        try {
          video.pause()
          video.removeAttribute('src')
          video.load()
        } catch (e) {}
      }

      const finishSuccess = (dataUrl) => {
        if (isResolved) return
        isResolved = true
        cleanup()
        resolve(dataUrl)
      }

      const finishError = (err) => {
        if (isResolved) return
        isResolved = true
        cleanup()
        reject(err)
      }

      // Timeout safeguard: 4500ms max per video
      timeoutId = setTimeout(() => {
        finishError(new Error('Video poster extraction timed out (4.5s)'))
      }, 4500)

      const captureCanvas = () => {
        try {
          if (video.videoWidth === 0 || video.videoHeight === 0) {
            return false
          }

          const MAX_WIDTH = 640
          const MAX_HEIGHT = 360
          let w = video.videoWidth
          let h = video.videoHeight

          const scale = Math.min(MAX_WIDTH / w, MAX_HEIGHT / h, 1)
          w = Math.max(1, Math.round(w * scale))
          h = Math.max(1, Math.round(h * scale))

          const canvas = document.createElement('canvas')
          canvas.width = w
          canvas.height = h
          const ctx = canvas.getContext('2d')
          if (!ctx) return false

          ctx.drawImage(video, 0, 0, w, h)
          const dataUrl = canvas.toDataURL('image/jpeg', 0.82)
          if (dataUrl && dataUrl.length > 200) {
            finishSuccess(dataUrl)
            return true
          }
        } catch (e) {
          finishError(e)
          return true
        }
        return false
      }

      video.onloadedmetadata = () => {
        try {
          const duration = video.duration || 0
          // Seek to representative frame: 1.0s or 10% of short videos, minimum 0.3s
          let targetTime = 0.5
          if (duration > 3) {
            targetTime = Math.min(1.0, duration * 0.1)
          } else if (duration > 0.5) {
            targetTime = duration * 0.25
          }
          video.currentTime = targetTime
        } catch (err) {
          video.currentTime = 0.5
        }
      }

      video.onseeked = () => {
        if (!captureCanvas()) {
          // If width/height not ready on seeked, wait for loadeddata
          video.onloadeddata = () => captureCanvas()
        }
      }

      video.onerror = () => {
        finishError(new Error('Video element error event fired'))
      }

      video.src = videoSrc
      video.load()
    })
  }
}

export const posterGenerator = new PosterGeneratorQueue()
