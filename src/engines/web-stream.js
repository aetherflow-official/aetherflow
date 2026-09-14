/**
 * Web Stream & YouTube Wallpaper Engine
 * Renders live streams, ambient YouTube loops, or interactive web pages as wallpapers.
 * - Canvas 2D fallback for lightweight grid previews
 * - Native YouTube IFrame API (YT.Player) with zero-stutter loop, audio auto-recovery, and multi-monitor sync
 */

export function parseYouTubeId(url) {
  if (!url || typeof url !== 'string') return null
  const clean = url.trim()
  if (/^[a-zA-Z0-9_-]{11}$/.test(clean)) return clean

  try {
    const parsed = new URL(clean.startsWith('http') ? clean : `https://${clean}`)
    const host = parsed.hostname.replace(/^www\./, '').replace(/^m\./, '').replace(/^music\./, '')

    if (host === 'youtube.com' || host === 'youtube-nocookie.com') {
      if (parsed.searchParams.has('v')) {
        const v = parsed.searchParams.get('v')
        if (v && /^[a-zA-Z0-9_-]{11}$/.test(v)) return v
      }
      const pathSegments = parsed.pathname.split('/').filter(Boolean)
      if (['embed', 'live', 'shorts', 'v'].includes(pathSegments[0]) && pathSegments[1]) {
        const id = pathSegments[1].slice(0, 11)
        if (/^[a-zA-Z0-9_-]{11}$/.test(id)) return id
      }
    } else if (host === 'youtu.be') {
      const id = parsed.pathname.slice(1).split(/[?#&/]/)[0]
      if (/^[a-zA-Z0-9_-]{11}$/.test(id)) return id
    }
  } catch (e) {
    // Fallback regex
  }

  const regexFallback = [
    /[?&]v=([a-zA-Z0-9_-]{11})/,
    /(?:youtu\.be\/|youtube(?:-nocookie)?\.com\/(?:embed\/|live\/|shorts\/|v\/))([a-zA-Z0-9_-]{11})/,
    /^([a-zA-Z0-9_-]{11})$/
  ]
  for (const re of regexFallback) {
    const m = clean.match(re)
    if (m && m[1]) return m[1]
  }
  return null
}

export function getYouTubeThumbnail(videoId) {
  if (!videoId) return null
  return `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`
}

export function isYouTubeLiveStream(url) {
  if (!url || typeof url !== 'string') return false
  return url.includes('/live/') || url.includes('live=1')
}

let ytApiPromise = null
function loadYouTubeApi() {
  if (typeof window !== 'undefined' && window.YT && window.YT.Player) {
    return Promise.resolve(window.YT)
  }
  if (!ytApiPromise) {
    ytApiPromise = new Promise((resolve) => {
      const checkInterval = setInterval(() => {
        if (typeof window !== 'undefined' && window.YT && window.YT.Player) {
          clearInterval(checkInterval)
          resolve(window.YT)
        }
      }, 50)

      const prev = window.onYouTubeIframeAPIReady
      window.onYouTubeIframeAPIReady = () => {
        clearInterval(checkInterval)
        if (typeof prev === 'function') prev()
        resolve(window.YT)
      }
      if (!document.querySelector('script[src*="youtube.com/iframe_api"]')) {
        const tag = document.createElement('script')
        tag.src = 'https://www.youtube.com/iframe_api'
        document.head.appendChild(tag)
      }
    })
  }
  return ytApiPromise
}

export function createWebStream(canvas, options = {}) {
  const ctx = canvas.getContext('2d')
  let animId = null
  let containerEl = null
  let wrapEl = null
  let player = null
  let hasFadedIn = false
  let syncInterval = null
  let uiCleanInterval = null
  const syncChannel = (typeof window !== 'undefined' && typeof BroadcastChannel !== 'undefined')
    ? new BroadcastChannel('aetherflow_yt_sync')
    : null
  let iframeEl = null
  let thumbImg = null
  let thumbLoaded = false
  let currentUrl = options.streamUrl || options.url || ''
  let isSecondary = Boolean(options.isSecondary)
  let currentMuted = isSecondary ? true : Boolean(options.muted)
  let currentVolume = options.volume !== undefined ? Number(options.volume) : 50
  let currentSpeed = Number(options.speedMultiplier ?? options.speed ?? 1)
  let isRunning = false
  let isPausedByUser = false
  let playStartTime = 0
  let audioUnlocked = false

  function resize() {
    if (!canvas) return
    canvas.width = canvas.offsetWidth || window.innerWidth
    canvas.height = canvas.offsetHeight || window.innerHeight
    renderThumbnail()
  }

  function renderThumbnail() {
    if (!ctx || !canvas.width || !canvas.height) return
    ctx.fillStyle = '#05070a'
    ctx.fillRect(0, 0, canvas.width, canvas.height)

    if (thumbLoaded && thumbImg && thumbImg.complete) {
      const cw = canvas.width
      const ch = canvas.height
      const iw = thumbImg.naturalWidth || 480
      const ih = thumbImg.naturalHeight || 360
      const scale = Math.max(cw / iw, ch / ih)
      const sw = iw * scale
      const sh = ih * scale
      const sx = (cw - sw) / 2
      const sy = (ch - sh) / 2
      ctx.drawImage(thumbImg, sx, sy, sw, sh)
    } else {
      const grad = ctx.createLinearGradient(0, 0, canvas.width, canvas.height)
      grad.addColorStop(0, '#090d16')
      grad.addColorStop(0.5, '#121b2d')
      grad.addColorStop(1, '#06080e')
      ctx.fillStyle = grad
      ctx.fillRect(0, 0, canvas.width, canvas.height)
    }
  }

  function loadThumbnail(ytIdOrUrl) {
    if (!ytIdOrUrl) {
      thumbLoaded = false
      renderThumbnail()
      return
    }
    thumbImg = new Image()
    thumbImg.onload = () => {
      thumbLoaded = true
      renderThumbnail()
    }
    thumbImg.onerror = () => {
      thumbLoaded = false
      renderThumbnail()
    }
    const src = (typeof ytIdOrUrl === 'string' && (ytIdOrUrl.startsWith('http') || ytIdOrUrl.startsWith('data:') || ytIdOrUrl.startsWith('/')))
      ? ytIdOrUrl
      : getYouTubeThumbnail(ytIdOrUrl)
    thumbImg.src = src
  }

  function syncAudio() {
    const shouldMute = isSecondary || currentMuted
    const vol = Math.max(1, Math.min(100, Math.round(currentVolume)))
    try {
      if (shouldMute) {
        player?.mute?.()
        player?.setVolume?.(0)
      } else {
        player?.unMute?.()
        player?.setVolume?.(vol)
      }
    } catch (e) {}

    const frame = iframeEl || player?.getIframe?.()
    if (frame?.contentWindow) {
      try {
        frame.contentWindow.postMessage(JSON.stringify({
          event: 'command',
          func: shouldMute ? 'mute' : 'unMute',
          args: []
        }), '*')
        if (!shouldMute) {
          frame.contentWindow.postMessage(JSON.stringify({
            event: 'command',
            func: 'setVolume',
            args: [vol]
          }), '*')
        }
      } catch (e) {}
    }
  }

  // Attempt to unlock unmuted audio on first user click or key anywhere in window
  function onFirstUserGesture() {
    audioUnlocked = true
    if (!isSecondary && !currentMuted) {
      syncAudio()
    }
  }

  function mountPlayer() {
    if (options.preview) return
    if (!canvas.parentElement) return

    unmountPlayer()

    const ytId = parseYouTubeId(currentUrl)

    if (ytId) {
      const isLive = isYouTubeLiveStream(currentUrl)

      // Container with overscan to push any YouTube edge elements completely off-screen
      containerEl = document.createElement('div')
      containerEl.setAttribute('data-aether-player', 'youtube')
      containerEl.style.position = 'absolute'
      containerEl.style.top = '-60px'
      containerEl.style.left = '-60px'
      containerEl.style.width = 'calc(100% + 120px)'
      containerEl.style.height = 'calc(100% + 120px)'
      containerEl.style.pointerEvents = 'none'
      containerEl.style.zIndex = '1'
      containerEl.style.filter = `brightness(${options.brightness ?? 1})`
      containerEl.style.overflow = 'hidden'

      // Player wrapper with smooth fade-in
      wrapEl = document.createElement('div')
      wrapEl.style.position = 'absolute'
      wrapEl.style.inset = '0'
      wrapEl.style.opacity = '0'
      wrapEl.style.transition = 'opacity 0.5s ease-in-out'
      wrapEl.style.pointerEvents = 'none'

      // Pre-create iframe with explicit Permissions Policy upfront before document creation
      iframeEl = document.createElement('iframe')
      iframeEl.id = 'yt-frame-' + Math.random().toString(36).slice(2)
      iframeEl.setAttribute('allow', 'accelerometer; autoplay *; clipboard-write; encrypted-media *; gyroscope; picture-in-picture; web-share')
      iframeEl.setAttribute('referrerpolicy', 'strict-origin-when-cross-origin')
      iframeEl.style.width = '100%'
      iframeEl.style.height = '100%'
      iframeEl.style.border = 'none'
      iframeEl.style.display = 'block'
      iframeEl.style.pointerEvents = 'none'
      iframeEl.tabIndex = -1
      iframeEl.setAttribute('tabindex', '-1')
      iframeEl.setAttribute('aria-hidden', 'true')

      // Start with mute=1 to guarantee zero autoplay policy blocks; unmuted onReady/PLAYING if Aether policy permits
      const embedSrc = `https://www.youtube.com/embed/${ytId}?autoplay=1&mute=1&controls=0&disablekb=1&fs=0&rel=0&iv_load_policy=3&modestbranding=1&playsinline=1&enablejsapi=1`
      iframeEl.src = embedSrc

      wrapEl.appendChild(iframeEl)
      containerEl.appendChild(wrapEl)

      function injectIframeHideUI() {
        try {
          const fDoc = iframeEl?.contentDocument || (iframeEl?.contentWindow && iframeEl.contentWindow.document)
          if (fDoc && !fDoc.getElementById('aether-yt-engine-hide-ui')) {
            const s = fDoc.createElement('style')
            s.id = 'aether-yt-engine-hide-ui'
            s.textContent = `
              .ytp-bezel, .ytp-bezel-icon, .ytp-bezel-text, .ytp-large-play-button, .ytp-large-play-button-bg,
              .ytp-pause-overlay, .ytp-endscreen-content, .ytp-ce-element, .ytp-chrome-top, .ytp-chrome-bottom,
              .ytp-gradient-top, .ytp-gradient-bottom, .ytp-spinner {
                display: none !important; opacity: 0 !important; visibility: hidden !important; pointer-events: none !important;
              }
            `
            ;(fDoc.head || fDoc.documentElement).appendChild(s)
          }
        } catch (e) {}
      }
      iframeEl.addEventListener('load', () => {
        injectIframeHideUI()
        setTimeout(() => {
          if (!hasFadedIn && wrapEl && isRunning) {
            hasFadedIn = true
            wrapEl.style.opacity = String(options.opacity ?? 1)
          }
        }, 1200)
      })
      clearInterval(uiCleanInterval)
      uiCleanInterval = setInterval(injectIframeHideUI, 500)

      // Transparent interaction shield
      const shieldEl = document.createElement('div')
      shieldEl.style.position = 'absolute'
      shieldEl.style.inset = '0'
      shieldEl.style.zIndex = '5'
      shieldEl.style.background = 'transparent'
      shieldEl.style.pointerEvents = 'none'
      containerEl.appendChild(shieldEl)

      canvas.parentElement.appendChild(containerEl)

      // Neutralize MediaSession API across all contexts
      try {
        if (typeof window !== 'undefined' && window.MediaSession && window.MediaSession.prototype) {
          window.MediaSession.prototype.setActionHandler = function() {}
          window.MediaSession.prototype.setPositionState = function() {}
          Object.defineProperty(window.MediaSession.prototype, 'metadata', { get: () => null, set: () => {}, configurable: true })
          Object.defineProperty(window.MediaSession.prototype, 'playbackState', { get: () => 'none', set: () => {}, configurable: true })
        }
        if (typeof navigator !== 'undefined' && navigator.mediaSession) {
          navigator.mediaSession.metadata = null
          navigator.mediaSession.playbackState = 'none'
          ;['play', 'pause', 'previoustrack', 'nexttrack', 'seekbackward', 'seekforward', 'seekto', 'stop', 'skipad'].forEach(action => {
            try { navigator.mediaSession.setActionHandler(action, null) } catch (e) {}
          })
        }
      } catch (e) {}

      function logMediaSessionDiagnostics(phase, extra = {}) {
        const hasMediaSession = typeof navigator !== 'undefined' && Boolean(navigator.mediaSession)
        const mediaMetadata = (hasMediaSession && navigator.mediaSession.metadata) ? 'present' : 'null'
        const playbackState = (hasMediaSession && navigator.mediaSession.playbackState) ? navigator.mediaSession.playbackState : 'none'
        const mediaElementsCount = document.querySelectorAll('video, audio').length
        console.log(`[AetherFlow SMTC Diagnostic] [${phase}]`, {
          wallpaperInitialized: true,
          webView2Instance: typeof window.__TAURI__ !== 'undefined' || Boolean(window.chrome?.webview),
          navigatorMediaSessionExists: hasMediaSession,
          mediaSessionMetadata: mediaMetadata,
          mediaSessionPlaybackState: playbackState,
          registeredMediaActions: [],
          mediaElementCount: mediaElementsCount,
          videoMutedState: extra.muted ?? currentMuted,
          videoVolume: extra.volume ?? currentVolume,
          playbackState: extra.playerState ?? (isRunning ? (isPausedByUser ? 'PAUSED' : 'ACTIVE') : 'STOPPED'),
          mediaSessionSuppressionEnabled: true,
          ...extra
        })
      }

      logMediaSessionDiagnostics('INIT', { ytId, isLive, isSecondary, muted: currentMuted, volume: currentVolume })

      loadYouTubeApi().then((YT) => {
        if (!isRunning || !containerEl || !iframeEl) return

        player = new YT.Player(iframeEl, {
          events: {
            onReady: (e) => {
              if (!isRunning) return
              playStartTime = Date.now()
              const shouldMute = isSecondary || currentMuted
              const vol = Math.max(1, Math.min(100, Math.round(currentVolume)))

              logMediaSessionDiagnostics('READY', {
                title: e.target.getVideoData?.()?.title || '',
                shouldMute,
                muted: e.target.isMuted?.(),
                volume: vol,
                playerState: 'READY'
              })

              // Apply Aether audio policy state
              if (shouldMute) {
                try {
                  e.target.mute()
                  e.target.setVolume(0)
                } catch {}
              } else {
                try {
                  e.target.unMute()
                  e.target.setVolume(vol)
                } catch {}
              }

              // Also dispatch postMessage commands directly to iframe for guaranteed delivery
              if (iframeEl?.contentWindow) {
                try {
                  iframeEl.contentWindow.postMessage(JSON.stringify({
                    event: 'command',
                    func: shouldMute ? 'mute' : 'unMute',
                    args: []
                  }), '*')
                  if (!shouldMute) {
                    iframeEl.contentWindow.postMessage(JSON.stringify({
                      event: 'command',
                      func: 'setVolume',
                      args: [vol]
                    }), '*')
                  }
                } catch {}
              }

              try { e.target.playVideo() } catch {}
              if (currentSpeed !== 1 && e.target.setPlaybackRate) {
                try { e.target.setPlaybackRate(currentSpeed) } catch {}
              }
              if (!isLive) {
                startSyncMonitor(ytId)
              }
            },
            onStateChange: (e) => {
              if (!isRunning) return

              // State 1: PLAYING
              if (e.data === 1) {
                if (!hasFadedIn && wrapEl) {
                  hasFadedIn = true
                  wrapEl.style.opacity = String(options.opacity ?? 1)
                }
                const shouldMute = isSecondary || currentMuted
                const vol = Math.max(1, Math.min(100, Math.round(currentVolume)))
                logMediaSessionDiagnostics('PLAYING', {
                  shouldMute,
                  muted: e.target.isMuted?.(),
                  volume: vol,
                  playerState: 'PLAYING'
                })
                if (!shouldMute) {
                  try {
                    e.target.unMute()
                    e.target.setVolume(vol)
                  } catch {}
                  if (iframeEl?.contentWindow) {
                    try {
                      iframeEl.contentWindow.postMessage(JSON.stringify({
                        event: 'command',
                        func: 'unMute',
                        args: []
                      }), '*')
                      iframeEl.contentWindow.postMessage(JSON.stringify({
                        event: 'command',
                        func: 'setVolume',
                        args: [vol]
                      }), '*')
                    } catch {}
                  }
                }
              }

              // State 2: PAUSED
              if (e.data === 2 && !isPausedByUser) {
                try { e.target.playVideo() } catch {}
              }

              // State 0: ENDED (Seamless loop fallback for non-live stream)
              if (e.data === 0 && !isPausedByUser) {
                const streamIsLive = isLive || Boolean(e.target.getVideoData?.()?.isLive)
                if (!streamIsLive) {
                  try {
                    e.target.seekTo(0, true)
                    e.target.playVideo()
                  } catch (err) {}
                }
              }
            },
            onError: (e) => {
              console.warn('[AetherFlow YouTube Stream] Playback error code:', e.data)
              // Error 150/101: Restricted embedding. Fall back to clean thumbnail display
              if (e.data === 150 || e.data === 101) {
                loadThumbnail(ytId)
              }
            }
          }
        })
      })
    } else {
      // General web URL / interactive page wallpaper
      iframeEl = document.createElement('iframe')
      iframeEl.setAttribute('allow', 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share; fullscreen')
      iframeEl.setAttribute('referrerpolicy', 'strict-origin-when-cross-origin')
      iframeEl.style.position = 'absolute'
      iframeEl.style.top = '0'
      iframeEl.style.left = '0'
      iframeEl.style.width = '100%'
      iframeEl.style.height = '100%'
      iframeEl.style.border = 'none'
      iframeEl.style.pointerEvents = 'none'
      iframeEl.style.zIndex = '1'
      iframeEl.style.backgroundColor = options.themeBg || '#070a13'
      iframeEl.style.colorScheme = 'dark'
      iframeEl.style.opacity = String(options.opacity ?? 1)
      iframeEl.style.filter = `brightness(${options.brightness ?? 1})`
      iframeEl.src = currentUrl
      canvas.parentElement.appendChild(iframeEl)
    }
  }

  function startSyncMonitor(ytId) {
    if (!syncChannel) return
    if (!isSecondary) {
      // Primary display: broadcast master audio-synced timestamp to secondary displays
      clearInterval(syncInterval)
      syncInterval = setInterval(() => {
        if (!isRunning || isPausedByUser || !player?.getCurrentTime) return
        if (player.getPlayerState?.() === 1) {
          try {
            syncChannel.postMessage({ type: 'sync_time', ytId, time: player.getCurrentTime() })
          } catch (e) {}
        }
      }, 1000)
    } else {
      // Secondary display: keep video frame synchronized while remaining permanently muted
      syncChannel.onmessage = (ev) => {
        if (!isRunning || isPausedByUser || !player?.getCurrentTime) return
        if (ev.data?.type === 'sync_time' && ev.data?.ytId === ytId) {
          if (player.getPlayerState?.() === 1) {
            try {
              const currentT = player.getCurrentTime()
              if (Math.abs(currentT - ev.data.time) > 0.45) {
                player.seekTo(ev.data.time, true)
              }
            } catch (e) {}
          }
        }
      }
    }
  }

  function unmountPlayer() {
    clearInterval(syncInterval)
    syncInterval = null
    clearInterval(uiCleanInterval)
    uiCleanInterval = null

    window.removeEventListener('pointerdown', onFirstUserGesture)
    window.removeEventListener('keydown', onFirstUserGesture)

    if (player) {
      try { player.destroy() } catch {}
      player = null
    }
    if (iframeEl) {
      try {
        iframeEl.src = 'about:blank'
        iframeEl.remove()
      } catch {}
      iframeEl = null
    }
    if (containerEl) {
      try { containerEl.remove() } catch {}
      containerEl = null
      wrapEl = null
    }
    hasFadedIn = false
  }

  function frame() {
    if (!isRunning) return
    animId = requestAnimationFrame(frame)
  }

  function start() {
    isRunning = true
    resize()
    window.addEventListener('resize', resize)

    const ytId = parseYouTubeId(currentUrl)
    const customThumb = typeof options.preview === 'string' ? options.preview : (options.thumbnail || options.previewUrl || null)
    if (ytId) {
      loadThumbnail(ytId)
    } else if (customThumb) {
      loadThumbnail(customThumb)
    } else {
      renderThumbnail()
    }

    if (!options.preview) {
      mountPlayer()
    }

    animId = requestAnimationFrame(frame)
  }

  function stop() {
    isRunning = false
    if (animId) {
      cancelAnimationFrame(animId)
      animId = null
    }
    window.removeEventListener('resize', resize)
    unmountPlayer()
  }

  function pause() {
    isPausedByUser = true
    try { player?.pauseVideo() } catch {}
    if (iframeEl?.contentWindow) {
      try {
        iframeEl.contentWindow.postMessage(JSON.stringify({
          event: 'command',
          func: 'pauseVideo',
          args: []
        }), '*')
      } catch {}
    }
  }

  function resume() {
    isPausedByUser = false
    try {
      player?.playVideo()
      if (currentSpeed !== 1 && player?.setPlaybackRate) {
        player.setPlaybackRate(currentSpeed)
      }
    } catch {}
    if (iframeEl?.contentWindow) {
      try {
        iframeEl.contentWindow.postMessage(JSON.stringify({
          event: 'command',
          func: 'playVideo',
          args: []
        }), '*')
      } catch {}
    }
  }

  function updateOptions(newOpts = {}) {
    Object.assign(options, newOpts)
    const nextUrl = newOpts.streamUrl ?? newOpts.url
    if (nextUrl !== undefined && nextUrl !== currentUrl) {
      currentUrl = nextUrl
      const ytId = parseYouTubeId(currentUrl)
      const customThumb = typeof newOpts.preview === 'string' ? newOpts.preview : (newOpts.thumbnail || newOpts.previewUrl || null)
      if (ytId) {
        loadThumbnail(ytId)
      } else if (customThumb) {
        loadThumbnail(customThumb)
      } else {
        renderThumbnail()
      }
      if (!options.preview) mountPlayer()
    }

    if (newOpts.speedMultiplier !== undefined || newOpts.speed !== undefined) {
      currentSpeed = Number(newOpts.speedMultiplier ?? newOpts.speed ?? 1)
      try { player?.setPlaybackRate(currentSpeed) } catch {}
    }

    if (newOpts.paused !== undefined) {
      if (newOpts.paused) pause()
      else resume()
    }

    if (newOpts.isSecondary !== undefined) {
      isSecondary = Boolean(newOpts.isSecondary)
    }

    if (newOpts.volume !== undefined) {
      currentVolume = Number(newOpts.volume)
    }

    if (newOpts.muted !== undefined) {
      currentMuted = Boolean(newOpts.muted)
    }

    syncAudio()

    if (newOpts.opacity !== undefined) {
      if (hasFadedIn && wrapEl) wrapEl.style.opacity = String(newOpts.opacity)
      if (iframeEl) iframeEl.style.opacity = String(newOpts.opacity)
    }

    if (newOpts.brightness !== undefined) {
      if (containerEl) containerEl.style.filter = `brightness(${newOpts.brightness})`
      if (iframeEl) iframeEl.style.filter = `brightness(${newOpts.brightness})`
    }
  }

  return { start, stop, pause, resume, updateOptions }
}

export default createWebStream
