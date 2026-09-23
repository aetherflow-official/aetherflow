/**
 * previewManager.js — Centralized Single-Slot Hover Preview Coordinator
 * 
 * ARCHITECTURAL RULES:
 * 1. MAX ACTIVE HOVER PREVIEWS = 1 at all times.
 * 2. 250ms hover debounce to avoid allocating hardware video decoders on quick mouse sweeps.
 * 3. Monotonic request ID sequence to prevent race conditions during rapid card transitions.
 * 4. Strict teardown: pause(), removeAttribute('src'), load(), and garbage collection trigger.
 * 5. YouTube & Web Streams: strictly static poster previews. Never launch iframes or WebView2 on hover.
 */

import { tauriInvoke } from './wallpaperActions.js'

class PreviewManager {
  constructor() {
    this.activeId = null
    this.pendingId = null
    this.activeSrc = null
    this.activeType = null // 'video' | 'canvas' | 'image'
    this.pendingTimer = null
    this.requestId = 0
    this.listeners = new Set()
    this.videoElement = null
  }

  /**
   * Subscribe to preview state updates.
   * Listener receives: { activeId, activeSrc, activeType }
   */
  subscribe(listener) {
    this.listeners.add(listener)
    listener(this.getState())
    return () => this.listeners.delete(listener)
  }

  getState() {
    return {
      activeId: this.activeId,
      activeSrc: this.activeSrc,
      activeType: this.activeType,
    }
  }

  _notify() {
    const state = this.getState()
    for (const listener of this.listeners) {
      try {
        listener(state)
      } catch (err) {
        console.error('PreviewManager listener error:', err)
      }
    }
  }

  /**
   * Request a preview for a specific wallpaper.
   * Debounces by 250ms. If hover moves to another card before 250ms,
   * the previous request is cancelled with zero media or decoder allocation.
   */
  requestPreview(id, src, type = 'video') {
    if (!id || !src) {
      this.cancelPreview()
      return
    }

    // If already playing this exact preview, keep it alive
    if (this.activeId === id) return

    // Clear any previous pending debounce timer
    if (this.pendingTimer) {
      clearTimeout(this.pendingTimer)
      this.pendingTimer = null
    }

    this.pendingId = id
    const currentReq = ++this.requestId

    this.pendingTimer = setTimeout(() => {
      // Race condition check: ensure this request is still current
      if (this.requestId !== currentReq || this.pendingId !== id) {
        return
      }

      // Tear down previously active preview before activating new one
      this._teardownCurrent()

      // Activate new preview
      this.activeId = id
      this.activeSrc = src
      this.activeType = type
      this.pendingId = null
      this._notify()
    }, 250)
  }

  /**
   * Cancel preview for a specific wallpaper (or any pending preview if id omitted).
   */
  cancelPreview(id = null) {
    if (id === null || this.pendingId === id) {
      if (this.pendingTimer) {
        clearTimeout(this.pendingTimer)
        this.pendingTimer = null
      }
      this.pendingId = null
    }

    if (id === null || this.activeId === id) {
      this._teardownCurrent()
      this._notify()
    }
  }

  /**
   * Internal teardown: completely flushes decoders, video buffers, and DOM references.
   */
  _teardownCurrent() {
    if (this.videoElement) {
      try {
        this.videoElement.pause()
        this.videoElement.removeAttribute('src')
        this.videoElement.load() // Critical: instructs browser engine to release hardware decoders & textures
      } catch (e) {}
      this.videoElement = null
    }

    this.activeId = null
    this.activeSrc = null
    this.activeType = null

    // Light memory trim scheduled after preview ends to return working set
    setTimeout(() => {
      tauriInvoke('trim_memory').catch(() => {})
    }, 500)
  }

  /**
   * Register or assign the shared video element so its lifecycle is strictly bounded.
   */
  registerVideoElement(el) {
    this.videoElement = el
  }

  /**
   * Unregister video element
   */
  unregisterVideoElement(el) {
    if (this.videoElement === el) {
      this._teardownCurrent()
    }
  }

  /**
   * Force release all active preview resources immediately.
   */
  releaseAll() {
    this.cancelPreview()
  }
}

export const previewManager = new PreviewManager()
if (typeof window !== 'undefined') {
  window.previewManager = previewManager
}
