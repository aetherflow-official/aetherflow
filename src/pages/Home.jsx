import React, { useState, useEffect, useMemo, useRef } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import {
  Play, Pause, Zap, MonitorPlay, Square, Monitor, Plus, Search,
  Video, Image as ImageIcon, Trash2, Check, Sparkles, Filter, X, Pin, PinOff, Pencil, ArrowRight, Globe, Eye,
  Volume2, VolumeX, SlidersHorizontal, Heart
} from 'lucide-react'
import { useStore } from '../store/useStore.js'
import { WALLPAPER_LIST } from '../engines/index.js'
import WallpaperPlayer from '../components/WallpaperPlayer/index.jsx'
import WallpaperThumbnail from '../components/WallpaperThumbnail/index.jsx'
import WallpaperCard from '../components/WallpaperCard/index.jsx'
import { AddWallpaperModal, RenameWallpaperModal, AddWebStreamModal } from '../components/Modals/WallpaperModals.jsx'
import {
  applyWallpaperToDesktop,
  stopDesktopWallpaper,
  addCustomMediaWallpaper,
  addCustomVideoWallpaper,
  addCustomStreamWallpaper,
  setSystemWallpaper,
  tauriInvoke,
  safeListen,
  safeConvertFileSrc,
} from '../lib/wallpaperActions.js'

function getWallpaperTypeInfo(wallpaper) {
  const engineId = wallpaper.engine || wallpaper.id
  const isStream = engineId === 'web-stream' || Boolean(wallpaper.config?.streamUrl)
  const isImage = engineId === 'image-player' || wallpaper.mediaType === 'image' || Boolean(wallpaper.config?.imagePath && !wallpaper.config?.videoPath)
  const isVideo = !isImage && !isStream && (wallpaper.isCustom || engineId === 'video-player' || wallpaper.mediaType === 'video')

  if (isStream) {
    const streamUrl = wallpaper.config?.streamUrl || wallpaper.config?.url || ''
    const isYt = /(?:youtu\.be\/|youtube\.com)/.test(streamUrl)
    return {
      label: isYt ? 'YouTube' : 'Stream',
      color: isYt ? 'var(--color-rose)' : 'var(--color-cyan)',
      icon: isYt ? MonitorPlay : Globe,
      type: isYt ? 'youtube' : 'stream',
    }
  }
  if (isImage) {
    return { label: 'Image', color: 'var(--color-emerald)', icon: ImageIcon, type: 'image' }
  }
  if (isVideo) {
    return { label: 'Video', color: 'var(--color-brand)', icon: Video, type: 'video' }
  }
  return { label: 'Canvas 2D', color: 'var(--color-purple)', icon: Sparkles, type: 'canvas' }
}

function getWallpaperStaticThumbnail(wallpaper) {
  if (wallpaper.preview && typeof wallpaper.preview === 'string') {
    if (wallpaper.preview.startsWith('http') || wallpaper.preview.startsWith('/') || wallpaper.preview.startsWith('data:')) {
      return wallpaper.preview
    }
    return safeConvertFileSrc(wallpaper.preview)
  }

  const engineId = wallpaper.engine || wallpaper.id
  const builtinPreviews = {
    'matrix-rain': '/previews/matrix-rain.svg',
    'cyber-particles': '/previews/cyber-particles.svg',
    'synthwave-grid': '/previews/synthwave-grid.svg',
    'deep-space': '/previews/deep-space.svg',
    'aurora': '/previews/aurora.svg',
    'tokyo-rain': '/previews/tokyo-rain.svg',
    'audio-spectrum': '/previews/audio-spectrum.svg',
  }
  if (builtinPreviews[engineId]) {
    return builtinPreviews[engineId]
  }

  const streamUrl = wallpaper.config?.streamUrl || wallpaper.config?.url
  if (streamUrl) {
    const ytMatch = streamUrl.match(/(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=))([\w-]{11})/)
    if (ytMatch && ytMatch[1]) {
      return `https://img.youtube.com/vi/${ytMatch[1]}/hqdefault.jpg`
    }
  }

  const imgPath = wallpaper.config?.imagePath || wallpaper.defaultConfig?.imagePath
  if (imgPath) {
    return imgPath.startsWith('http') || imgPath.startsWith('data:') ? imgPath : safeConvertFileSrc(imgPath)
  }

  return null
}

/**
 * CleanHomeVideoPreview — Hardware-accelerated, zero-leak video preview.
 * Completely cleans up decoders and textures upon unmount.
 */
function CleanHomeVideoPreview({ videoSrc }) {
  const videoRef = useRef(null)

  useEffect(() => {
    const v = videoRef.current
    return () => {
      if (v) {
        try {
          v.pause()
          v.removeAttribute('src')
          v.load()
        } catch (e) {}
      }
    }
  }, [videoSrc])

  return (
    <video
      ref={videoRef}
      src={videoSrc}
      autoPlay
      loop
      muted
      playsInline
      style={{ width: '100%', height: '100%', objectFit: 'cover' }}
    />
  )
}

/**
 * CleanHomeYouTubePreview — Zero-leak YouTube IFrame preview with about:blank navigation teardown and sound toggle.
 */
function CleanHomeYouTubePreview({ ytId, title }) {
  const containerRef = useRef(null)
  const iframeRef = useRef(null)
  let finalId = ytId
  if (finalId === 'jfKfPfyJRdk') finalId = 'TURbeWK2wwg'
  else if (finalId === '1zxD9O4b1oY') finalId = 'uD4izuDMUQA'
  else if (finalId === '7uK_Z2Q2R2E') finalId = '21qNxnCS8WU'
  else if (finalId === 'aXYKRAdrfEo') finalId = 'eZe4Q_58UTU'
  else if (finalId === 'nz1cEO01LzE') finalId = 'WJ3-F02-F_Y'

  const [isMuted, setIsMuted] = useState(true)

  useEffect(() => {
    const container = containerRef.current
    if (!container || !finalId) return

    const iframe = document.createElement('iframe')
    const originParam = encodeURIComponent(window.location.origin || 'http://localhost:1420')
    iframe.src = `https://www.youtube-nocookie.com/embed/${finalId}?autoplay=1&mute=1&controls=0&disablekb=1&fs=0&rel=0&iv_load_policy=3&modestbranding=1&playsinline=1&enablejsapi=1&origin=${originParam}`
    iframe.title = title || 'YouTube Preview'
    iframe.setAttribute('allow', 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share')
    iframe.style.width = '100%'
    iframe.style.height = '100%'
    iframe.style.border = 'none'
    iframe.style.display = 'block'
    iframe.style.pointerEvents = 'none'
    iframe.tabIndex = -1
    iframe.setAttribute('tabindex', '-1')
    iframe.setAttribute('aria-hidden', 'true')

    function injectIframeHideUI() {
      try {
        const fDoc = iframe.contentDocument || (iframe.contentWindow && iframe.contentWindow.document)
        if (fDoc && !fDoc.getElementById('aether-yt-preview-hide-ui')) {
          const s = fDoc.createElement('style')
          s.id = 'aether-yt-preview-hide-ui'
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
    iframe.addEventListener('load', injectIframeHideUI)
    const injectInterval = setInterval(injectIframeHideUI, 500)

    container.appendChild(iframe)
    iframeRef.current = iframe

    return () => {
      clearInterval(injectInterval)
      try {
        iframe.src = 'about:blank'
      } catch {}
      if (container.contains(iframe)) {
        container.removeChild(iframe)
      }
      iframeRef.current = null
    }
  }, [finalId, title])

  const toggleMute = () => {
    const nextMuted = !isMuted
    setIsMuted(nextMuted)
    const frame = iframeRef.current
    if (frame?.contentWindow) {
      frame.contentWindow.postMessage(JSON.stringify({
        event: 'command',
        func: nextMuted ? 'mute' : 'unMute',
        args: []
      }), '*')
      if (!nextMuted) {
        frame.contentWindow.postMessage(JSON.stringify({
          event: 'command',
          func: 'setVolume',
          args: [85]
        }), '*')
        frame.contentWindow.postMessage(JSON.stringify({
          event: 'command',
          func: 'playVideo',
          args: []
        }), '*')
      }
    }
  }

  return (
    <div style={{ width: '100%', height: '100%', position: 'relative', overflow: 'hidden' }}>
      <div
        ref={containerRef}
        style={{ width: '100%', height: '100%', pointerEvents: 'none' }}
      />
      {/* Invisible overlay absorbing all pointer interaction so YouTube UI cannot be triggered */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          zIndex: 2,
          background: 'transparent',
          pointerEvents: 'auto',
          cursor: 'default',
        }}
        onClick={(e) => {
          e.preventDefault()
          e.stopPropagation()
        }}
        onPointerDown={(e) => {
          e.preventDefault()
          e.stopPropagation()
        }}
        onContextMenu={(e) => {
          e.preventDefault()
          e.stopPropagation()
        }}
      />
      <button
        onClick={toggleMute}
        style={{
          position: 'absolute',
          bottom: 12,
          right: 12,
          zIndex: 10,
          background: 'rgba(0,0,0,0.75)',
          backdropFilter: 'blur(8px)',
          WebkitBackdropFilter: 'blur(8px)',
          border: '1px solid rgba(255,255,255,0.2)',
          borderRadius: 6,
          padding: '6px 10px',
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          color: '#ffffff',
          fontSize: 12,
          fontWeight: 600,
          cursor: 'pointer',
          transition: 'all 0.15s',
        }}
        title={isMuted ? 'Click to enable preview sound' : 'Mute preview sound'}
      >
        {isMuted ? <VolumeX size={14} color="var(--color-rose, #f43f5e)" /> : <Volume2 size={14} color="var(--color-emerald, #10b981)" />}
        <span>{isMuted ? 'Sound Muted' : 'Sound Playing'}</span>
      </button>
    </div>
  )
}

/**
 * Full Live Preview Modal for Home Page Wallpapers (Canvas 2D, Video, Image, Stream)
 */
function HomePreviewModal({ wallpaper, onClose, onApply, isLive }) {
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
      // Reclaim any GPU textures & memory immediately upon modal close
      tauriInvoke('trim_memory').catch(() => {})
    }
  }, [onClose])

  if (!wallpaper) return null

  const typeInfo = getWallpaperTypeInfo(wallpaper)
  const isVideo = typeInfo.type === 'video'
  const isImage = typeInfo.type === 'image'
  const isStream = typeInfo.type === 'stream' || typeInfo.type === 'youtube'

  const videoPath = wallpaper.config?.videoPath || wallpaper.defaultConfig?.videoPath
  const videoSrc = videoPath ? (videoPath.startsWith('http') || videoPath.startsWith('data:') ? videoPath : safeConvertFileSrc(videoPath)) : ''

  const imgPath = wallpaper.config?.imagePath || wallpaper.defaultConfig?.imagePath
  const imgSrc = imgPath ? (imgPath.startsWith('http') || imgPath.startsWith('data:') ? imgPath : safeConvertFileSrc(imgPath)) : (wallpaper.preview || '')

  const streamUrl = wallpaper.config?.streamUrl || wallpaper.config?.url || ''
  const ytMatch = streamUrl.match(/(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=))([\w-]{11})/)
  const ytId = ytMatch ? ytMatch[1] : null

  return createPortal(
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 99999,
        background: 'rgba(0, 0, 0, 0.82)',
        backdropFilter: 'blur(12px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '24px 16px',
        animation: 'fadeIn 0.18s ease-out',
      }}
      onClick={onClose}
    >
      <div
        className="card"
        style={{
          width: '100%',
          maxWidth: 720,
          background: 'var(--bg-card)',
          border: '1px solid var(--border-main)',
          borderRadius: 14,
          boxShadow: '0 24px 60px rgba(0, 0, 0, 0.7), 0 0 0 1px rgba(255,255,255,0.08)',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          maxHeight: '92vh',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header with clean 14px gap */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '14px 20px',
            borderBottom: '1px solid var(--border-main)',
            background: 'rgba(var(--rgb-card), 0.5)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, minWidth: 0, flex: 1 }}>
            <span
              style={{
                padding: '4px 10px',
                borderRadius: 6,
                fontSize: 11,
                fontWeight: 600,
                background: 'rgba(0,0,0,0.6)',
                color: typeInfo.color || 'var(--text-main)',
                border: '1px solid rgba(255,255,255,0.12)',
                flexShrink: 0,
                display: 'inline-flex',
                alignItems: 'center',
                gap: 5,
              }}
            >
              <typeInfo.icon size={12} />
              <span>{typeInfo.label}</span>
            </span>
            <div style={{ minWidth: 0, flex: 1 }}>
              <div
                className="font-semibold text-base"
                style={{
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  maxWidth: 460,
                  color: 'var(--text-main)',
                }}
                title={wallpaper.name}
              >
                {wallpaper.name}
              </div>
              <div className="text-xs text-muted" style={{ fontSize: 12, marginTop: 2 }}>
                {wallpaper.communityMeta?.author
                  ? `by ${wallpaper.communityMeta.author}`
                  : wallpaper.isCustom
                  ? `Custom ${typeInfo.label}`
                  : `Built-in Canvas 2D Engine`}
              </div>
            </div>
          </div>

          <button
            onClick={onClose}
            style={{
              background: 'rgba(255,255,255,0.05)',
              border: '1px solid var(--border-main)',
              borderRadius: 8,
              padding: '6px',
              cursor: 'pointer',
              color: 'var(--text-muted)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              marginLeft: 12,
            }}
            title="Close preview (Esc)"
          >
            <X size={15} />
          </button>
        </div>

        {/* Modal Body: Active Wallpaper Preview */}
        <div style={{ padding: 20, flex: 1, overflowY: 'auto' }}>
          <div
            style={{
              width: '100%',
              aspectRatio: '16/9',
              maxHeight: '52vh',
              background: '#050505',
              borderRadius: 8,
              overflow: 'hidden',
              position: 'relative',
              boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.08)',
            }}
          >
            {isVideo && videoSrc ? (
              <CleanHomeVideoPreview videoSrc={videoSrc} />
            ) : isImage && imgSrc ? (
              <img
                src={imgSrc}
                alt={wallpaper.name}
                style={{ width: '100%', height: '100%', objectFit: 'cover' }}
              />
            ) : isStream && ytId ? (
              <CleanHomeYouTubePreview ytId={ytId} title={wallpaper.name} />
            ) : (
              <WallpaperPlayer
                engineId={wallpaper.engine || wallpaper.id}
                config={wallpaper.config}
                preview
              />
            )}
          </div>

          {wallpaper.tags && wallpaper.tags.length > 0 && (
            <div className="flex gap-1.5" style={{ flexWrap: 'wrap', marginTop: 14 }}>
              {wallpaper.tags.map(t => (
                <span
                  key={t}
                  style={{
                    padding: '2px 8px',
                    borderRadius: 6,
                    background: 'rgba(255,255,255,0.05)',
                    border: '1px solid var(--border-main)',
                    fontSize: 11,
                    color: 'var(--text-muted)',
                  }}
                >
                  #{t}
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div
          style={{
            padding: '12px 20px',
            borderTop: '1px solid var(--border-main)',
            background: 'rgba(var(--rgb-card), 0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'flex-end',
            gap: 10,
          }}
        >
          <button
            className="btn btn-ghost"
            style={{ padding: '7px 14px', fontSize: 12 }}
            onClick={onClose}
          >
            Close
          </button>
          {isLive ? (
            <span
              className="btn btn-success"
              style={{ padding: '7px 16px', fontSize: 12, cursor: 'default', display: 'flex', alignItems: 'center', gap: 6 }}
            >
              <Check size={13} /> Active on Desktop
            </span>
          ) : (
            <button
              className="btn btn-primary"
              style={{ padding: '7px 18px', fontSize: 12, display: 'flex', alignItems: 'center', gap: 6 }}
              onClick={() => onApply(wallpaper)}
            >
              <Play size={13} fill="currentColor" /> Apply to Desktop
            </button>
          )}
        </div>
      </div>
    </div>,
    document.body
  )
}


export default function HomePage() {
  const navigate = useNavigate()
  const [applying, setApplying]               = useState(false)
  const [searchQuery, setSearchQuery]         = useState('')
  const [filterCategory, setFilterCategory]   = useState('all') // 'all' | 'liked' | 'builtin' | 'custom' | 'stream'
  const [hoveredId, setHoveredId]             = useState(null)

  // Modals state
  const [addModal, setAddModal] = useState({ isOpen: false, path: '', initialName: '' })
  const [renameModal, setRenameModal] = useState({ isOpen: false, id: null, currentName: '' })
  const [addStreamModal, setAddStreamModal] = useState(false)
  const [winWallpaperSet, setWinWallpaperSet] = useState(false)
  const [previewWallpaper, setPreviewWallpaper] = useState(null)

  const activeWallpaper       = useStore(s => s.activeWallpaper)
  const setActiveWallpaper    = useStore(s => s.setActiveWallpaper)
  const currentDesktopWallpaper = useStore(s => s.currentDesktopWallpaper)
  const isWallpaperRunning    = useStore(s => s.isWallpaperRunning)
  const likedWallpaperIds     = useStore(s => s.likedWallpaperIds) || []
  const toggleLikeWallpaper   = useStore(s => s.toggleLikeWallpaper)
  const installed             = useStore(s => s.installed)
  const uninstallItem         = useStore(s => s.uninstallItem)
  const homeWallpaperIds      = useStore(s => s.homeWallpaperIds) || []
  const unpinFromHome         = useStore(s => s.unpinFromHome)
  const customNames           = useStore(s => s.customNames) || {}
  const setWallpaperName      = useStore(s => s.setWallpaperName)

  const wallpaperOpacity      = useStore(s => s.wallpaperOpacity)
  const setWallpaperOpacity   = useStore(s => s.setWallpaperOpacity)
  const wallpaperBrightness   = useStore(s => s.wallpaperBrightness)
  const setWallpaperBrightness = useStore(s => s.setWallpaperBrightness)
  const wallpaperSpeed        = useStore(s => s.wallpaperSpeed)
  const setWallpaperSpeed     = useStore(s => s.setWallpaperSpeed)

  const audioVolume           = useStore(s => s.audioVolume)
  const audioMuted            = useStore(s => s.audioMuted)
  const thumbnailMode         = useStore(s => s.thumbnailMode) || 'hover'
  const setThumbnailMode      = useStore(s => s.setThumbnailMode)
  const wallpaperAudioSettings = useStore(s => s.wallpaperAudioSettings) || {}
  const setWallpaperAudio     = useStore(s => s.setWallpaperAudio)
  const fpsCap                = useStore(s => s.fps) ?? 60

  const screenArrangement     = useStore(s => s.screenArrangement)
  const monitorWallpapers     = useStore(s => s.monitorWallpapers)

  const [monitors, setMonitors] = useState([])
  const [selectedMonitorLabel, setSelectedMonitorLabel] = useState(null)
  const [isTopPreviewPaused, setIsTopPreviewPaused] = useState(false)
  const volumeIpcTimerRef = useRef(null)

  useEffect(() => {
    let unlistenMonitors
    function loadMonitors() {
      tauriInvoke('get_monitors')
        .then(res => {
          if (res && res.length > 0) {
            res.sort((a, b) => {
              if (a.isPrimary && !b.isPrimary) return -1
              if (!a.isPrimary && b.isPrimary) return 1
              return a.x - b.x
            })
            setMonitors(res)
            setSelectedMonitorLabel(prev => {
              if (prev && res.some(m => m.label === prev)) return prev
              return res[0].label
            })
          }
        })
        .catch(e => console.error('Failed to fetch monitors', e))
    }
    loadMonitors()

    safeListen('aether:monitors-changed', () => {
      loadMonitors()
    }).then(u => { unlistenMonitors = u }).catch(() => {})
    safeListen('aura:monitors-changed', () => {
      loadMonitors()
    }).catch(() => {})

    window.addEventListener('focus', loadMonitors)
    return () => {
      if (unlistenMonitors) unlistenMonitors()
      window.removeEventListener('focus', loadMonitors)
    }
  }, [])

  // ── Sync Active Wallpaper with Current Desktop Wallpaper ─────────────────
  useEffect(() => {
    if (currentDesktopWallpaper) {
      if (!activeWallpaper || activeWallpaper.id !== currentDesktopWallpaper.id) {
        setActiveWallpaper(currentDesktopWallpaper)
      }
    }
  }, [currentDesktopWallpaper])

  // ── Auto-Heal Home Wallpapers if Missing After Cache Reset ────────────────
  useEffect(() => {
    if (installed && installed.length > 0) {
      const customWallpapers = installed.filter(i => i && i.type === 'wallpaper')
      if (customWallpapers.length > 0) {
        const homeIds = homeWallpaperIds || []
        const missing = customWallpapers.map(c => c.id).filter(id => !homeIds.includes(id))
        if (missing.length > 0 && !customWallpapers.some(c => homeIds.includes(c.id))) {
          useStore.setState({
            homeWallpaperIds: [...homeIds, ...missing]
          })
        }
      }
    }
  }, [installed, homeWallpaperIds])

  // ── Import file handler with naming modal ──────────────────────────────────
  const handleOpenImportDialog = async () => {
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
        if (!path) return
        const filename = path.split('\\').pop().split('/').pop()
        const cleanName = filename.replace(/\.[^/.]+$/, '')
        setAddModal({ isOpen: true, path, initialName: cleanName })
      }
    } catch (err) {
      console.error('Failed to open import dialog:', err)
    }
  }

  // ── Drag & Drop listener ───────────────────────────────────────────────────
  useEffect(() => {
    let unlistenFn
    safeListen('tauri://drag-drop', event => {
      const paths = event.payload?.paths
      if (!paths || paths.length === 0) return

      const path = paths[0]
      const ext = path.split('.').pop().toLowerCase()
      if (['png', 'jpg', 'jpeg', 'webp', 'bmp', 'mp4', 'webm', 'ogg', 'mkv', 'avi', 'mov', 'wmv', 'flv'].includes(ext)) {
        const filename = path.split('\\').pop().split('/').pop()
        const cleanName = filename.replace(/\.[^/.]+$/, '')
        setAddModal({ isOpen: true, path, initialName: cleanName })
      }
    }).then(u => { unlistenFn = u }).catch(e => console.error(e))

    return () => { if (unlistenFn) unlistenFn() }
  }, [])

  async function handleConfirmAdd({ name, pinToHome }) {
    if (!addModal.path) return
    const newItem = await addCustomMediaWallpaper(addModal.path, name, pinToHome)
    setAddModal({ isOpen: false, path: '', initialName: '' })
    if (newItem) {
      selectWallpaper(newItem)
      handleApply(newItem)
    }
  }

  function handleConfirmAddStream({ name, url, muted, pinToHome }) {
    const newItem = addCustomStreamWallpaper(url, name, muted, pinToHome)
    setAddStreamModal(false)
    if (newItem) {
      selectWallpaper(newItem)
      handleApply(newItem)
    }
  }

  function handleConfirmRename(newName) {
    if (!renameModal.id) return
    setWallpaperName(renameModal.id, newName)
    setRenameModal({ isOpen: false, id: null, currentName: '' })
  }

  function handleSelectMonitor(label) {
    setSelectedMonitorLabel(label)
    if (monitorWallpapers && monitorWallpapers[label]) {
      setActiveWallpaper(monitorWallpapers[label])
    }
  }

  // ── Curated Home Wallpapers List ───────────────────────────────────────────
  // Combine all items, but display ONLY those where homeWallpaperIds.includes(w.id)
  const homeWallpapers = useMemo(() => {
    const names = customNames || {}
    const builtins = WALLPAPER_LIST.map(w => ({
      id: w.id,
      name: names[w.id] || w.name,
      engine: w.id,
      tags: w.tags || ['canvas'],
      config: w.defaultConfig || {},
      isCustom: false,
      builtin: true,
    }))

    const customs = (installed || [])
      .filter(item => item && item.type === 'wallpaper')
      .map(item => ({
        ...item,
        id: item.id,
        name: names[item.id] || item.name,
        engine: item.engine || 'video-player',
        tags: item.tags || ['custom', 'video'],
        config: item.config || {},
        isCustom: true,
        installedAt: item.installedAt,
      }))

    const all = [...customs, ...builtins]
    const homeIds = homeWallpaperIds || []

    // If homeIds is empty, display all
    if (homeIds.length === 0) return all

    // If customs exist but none are in homeIds (e.g. after cache reset before re-pinning),
    // ensure customs are displayed on Home so user's wallpapers are never blank/missing
    const hasCustomInHome = customs.some(c => homeIds.includes(c.id))
    if (!hasCustomInHome && customs.length > 0) {
      const activeBuiltins = builtins.filter(b => homeIds.includes(b.id))
      return [...customs, ...activeBuiltins]
    }

    return all.filter(w => homeIds.includes(w.id))
  }, [installed, homeWallpaperIds, customNames])

  const filteredWallpapers = useMemo(() => {
    return homeWallpapers.filter(w => {
      if (filterCategory === 'liked' && !(likedWallpaperIds || []).includes(w.id)) return false
      if (filterCategory === 'builtin' && w.isCustom) return false
      if (filterCategory === 'custom' && (!w.isCustom || w.config?.streamUrl)) return false
      if (filterCategory === 'stream' && !w.config?.streamUrl) return false
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase()
        const matchName = w.name.toLowerCase().includes(query)
        const matchTag = w.tags?.some(t => t.toLowerCase().includes(query))
        return matchName || matchTag
      }
      return true
    })
  }, [homeWallpapers, filterCategory, searchQuery, likedWallpaperIds])

  // ── Select a wallpaper (for previewing & tuning sliders) ───────────────────
  function selectWallpaper(wallpaper) {
    setActiveWallpaper({
      id: wallpaper.id,
      name: wallpaper.name,
      engine: wallpaper.engine || wallpaper.id,
      config: { ...(wallpaper.config || {}), speedMultiplier: wallpaperSpeed },
      isCustom: wallpaper.isCustom,
    })
    // Asynchronously request native memory trim to reclaim any dormant video decoder cache
    setTimeout(() => {
      tauriInvoke('trim_memory').catch(() => {})
    }, 400)
  }

  // ── Apply to desktop ─────────────────────────────────────────────────────
  async function handleApply(targetWp = null) {
    const wp = targetWp || activeWallpaper
    if (!wp) return

    setApplying(true)
    try {
      const mon = screenArrangement === 'per-screen' ? selectedMonitorLabel : null
      const targetAudio = wallpaperAudioSettings[wp.id] || {
        volume: wp.config?.volume ?? audioVolume ?? 50,
        muted: wp.config?.muted ?? audioMuted ?? false,
      }
      await applyWallpaperToDesktop(wp, {
        targetMonitor: mon,
        speed: wallpaperSpeed,
        volume: targetAudio.volume,
        muted: targetAudio.muted,
        opacity: wallpaperOpacity,
        brightness: wallpaperBrightness,
      })
    } finally {
      setApplying(false)
    }
  }

  // ── Stop wallpaper ───────────────────────────────────────────────────────
  async function handleStop() {
    const mon = screenArrangement === 'per-screen' ? selectedMonitorLabel : null
    await stopDesktopWallpaper(mon)
  }

  // ── Check if a wallpaper is active on any screen ──────────────────────────
  function getWallpaperActiveScreens(wp) {
    if (!isWallpaperRunning || !wp) return []
    if (screenArrangement === 'per-screen') {
      const matched = Object.entries(monitorWallpapers || {})
        .filter(([_, current]) => current?.id === wp.id)
        .map(([label]) => {
          const mon = monitors.find(m => m.label === label)
          return mon?.displayName || 'Screen'
        })
      return matched
    }
    return currentDesktopWallpaper?.id === wp.id ? ['All Screens'] : []
  }

  // ── Sliders live update ──────────────────────────────────────────────────
  async function handleBrightness(v) {
    setWallpaperBrightness(v)
    if (isWallpaperRunning) {
      await tauriInvoke('set_wallpaper_brightness', { brightness: v })
      await tauriInvoke('update_wallpaper_config', { config: { brightness: v } })
    }
  }

  async function handleOpacity(v) {
    setWallpaperOpacity(v)
    if (isWallpaperRunning) {
      await tauriInvoke('set_wallpaper_opacity', { opacity: v })
      await tauriInvoke('update_wallpaper_config', { config: { opacity: v } })
    }
  }

  async function handleSpeed(v) {
    setWallpaperSpeed(v)
    if (isWallpaperRunning) {
      await tauriInvoke('update_wallpaper_config', {
        config: { speedMultiplier: v, speed: v }
      })
    }
  }

  async function handleFit(fit) {
    if (!activeWallpaper) return
    const updatedConfig = { ...(activeWallpaper.config || {}), fit }
    useStore.getState().updateWallpaperConfig({ fit })
    if (isWallpaperRunning) {
      await tauriInvoke('update_wallpaper_config', {
        config: updatedConfig,
        monitorLabel: selectedMonitorLabel || null,
      })
    }
  }

  async function handleBackgroundColor(backgroundColor) {
    if (!activeWallpaper) return
    const updatedConfig = { ...(activeWallpaper.config || {}), backgroundColor }
    useStore.getState().updateWallpaperConfig({ backgroundColor })
    if (isWallpaperRunning) {
      await tauriInvoke('update_wallpaper_config', {
        config: updatedConfig,
        monitorLabel: selectedMonitorLabel || null,
      })
    }
  }

  async function handleSetWindowsWallpaper() {
    const imgPath = activeWallpaper?.config?.imagePath
    if (!imgPath) return
    const ok = await setSystemWallpaper(imgPath)
    if (ok) {
      setWinWallpaperSet(true)
      setTimeout(() => setWinWallpaperSet(false), 2500)
    }
  }

  const isCurrentWallpaperImage = activeWallpaper?.engine === 'image-player' ||
    Boolean(activeWallpaper?.config?.imagePath && !activeWallpaper?.config?.videoPath)

  // ── Per-wallpaper adhered audio ───────────────────────────────────────────
  const currentWallpaperAudio = activeWallpaper
    ? (wallpaperAudioSettings[activeWallpaper.id] || {
        volume: activeWallpaper.config?.volume ?? audioVolume ?? 50,
        muted: activeWallpaper.config?.muted ?? audioMuted ?? false,
      })
    : { volume: audioVolume ?? 50, muted: audioMuted ?? false }

  async function handleWallpaperVolumeChange(vol) {
    if (!activeWallpaper) return
    const nextMuted = vol <= 0
    const nextAudio = { ...currentWallpaperAudio, volume: vol, muted: nextMuted }
    setWallpaperAudio(activeWallpaper.id, nextAudio)
    useStore.setState({ audioVolume: vol, audioMuted: nextMuted })

    // If active wallpaper is running on desktop, debounced update of native audio
    if (isWallpaperRunning) {
      clearTimeout(volumeIpcTimerRef.current)
      volumeIpcTimerRef.current = setTimeout(async () => {
        await tauriInvoke('set_mpv_volume', { monitorLabel: null, volume: vol }).catch(() => {})
        await tauriInvoke('set_mpv_mute', { monitorLabel: null, muted: nextMuted }).catch(() => {})
        await tauriInvoke('update_wallpaper_config', {
          config: { volume: vol, muted: nextMuted },
          monitorLabel: null,
        }).catch(() => {})
      }, 35)
    }
  }

  async function handleWallpaperMuteToggle() {
    if (!activeWallpaper) return
    const nextMuted = !currentWallpaperAudio.muted
    const nextAudio = { ...currentWallpaperAudio, muted: nextMuted }
    setWallpaperAudio(activeWallpaper.id, nextAudio)
    useStore.setState({ audioMuted: nextMuted })

    // If active wallpaper is running on desktop, update live native audio immediately
    if (isWallpaperRunning) {
      await tauriInvoke('set_mpv_mute', { monitorLabel: null, muted: nextMuted }).catch(() => {})
      await tauriInvoke('update_wallpaper_config', {
        config: { volume: nextAudio.volume, muted: nextMuted },
        monitorLabel: null,
      }).catch(() => {})
    }
  }

  const activeScreensForSelected = activeWallpaper ? getWallpaperActiveScreens(activeWallpaper) : []
  const selectedIsLive = activeScreensForSelected.length > 0

  return (
    <div className="content-page-container animate-fadeIn">
      {/* Top Application Header */}
      <div className="content-page-header">
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
            <h1 className="content-page-title">Home</h1>
            <div
              className="telemetry-chip"
              style={{
                fontSize: 10.5,
                padding: '2px 8px',
                color: isWallpaperRunning ? 'var(--color-emerald)' : 'var(--text-muted)',
                borderColor: isWallpaperRunning ? 'rgba(16, 185, 129, 0.35)' : 'var(--border-subtle)',
                background: isWallpaperRunning ? 'rgba(16, 185, 129, 0.08)' : 'transparent',
              }}
            >
              {isWallpaperRunning ? (
                <>
                  <span className="status-dot-live" style={{ width: 6, height: 6 }} />
                  <span>DESKTOP ACTIVE</span>
                </>
              ) : (
                <span>DESKTOP IDLE</span>
              )}
            </div>
          </div>
          <p className="content-page-subtitle">
            Curated desktop dashboard — monitor, adjust, and switch live wallpapers
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            className="btn btn-ghost"
            onClick={() => setAddStreamModal(true)}
            style={{ height: 34, fontSize: 12, padding: '0 12px' }}
          >
            <Globe size={14} /> Add Web Stream
          </button>
          <button
            className="btn btn-primary"
            onClick={handleOpenImportDialog}
            style={{ height: 34, fontSize: 12, padding: '0 14px' }}
          >
            <Plus size={14} /> Add Media
          </button>
        </div>
      </div>

      {/* Hero Wallpaper Stage for Selected / Active Wallpaper */}
      {activeWallpaper ? (
        <div className="wallpaper-stage-card">
          {!isTopPreviewPaused ? (
            <WallpaperPlayer
              key={activeWallpaper.id || activeWallpaper.name}
              engineId={activeWallpaper.engine || activeWallpaper.id}
              config={activeWallpaper.config}
              preview
            />
          ) : (
            <div
              style={{
                position: 'absolute',
                inset: 0,
                background: '#05070d',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <WallpaperThumbnail
                wallpaper={activeWallpaper}
                isHovered={false}
                mode="always"
              />
              <div
                style={{
                  position: 'absolute',
                  top: 14,
                  right: 14,
                  background: 'rgba(10, 14, 24, 0.85)',
                  backdropFilter: 'blur(10px)',
                  WebkitBackdropFilter: 'blur(10px)',
                  border: '1px solid var(--border-subtle)',
                  borderRadius: 8,
                  padding: '4px 10px',
                  fontSize: 10,
                  fontWeight: 700,
                  letterSpacing: '0.05em',
                  color: 'var(--text-muted)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  zIndex: 4,
                  boxShadow: 'var(--surface-bevel)',
                }}
              >
                <Pause size={10} />
                <span>PREVIEW PAUSED (ZERO RAM / GPU)</span>
              </div>
            </div>
          )}

          {/* Scrim Overlay & Control Surface */}
          <div
            style={{
              position: 'absolute',
              inset: 0,
              background: 'linear-gradient(to top, rgba(7, 10, 18, 0.94) 0%, rgba(7, 10, 18, 0.4) 50%, rgba(0, 0, 0, 0.1) 100%)',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between',
              padding: '16px 20px',
              zIndex: 10,
              pointerEvents: 'auto',
            }}
          >
            {/* Top Badges */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                {selectedIsLive ? (
                  <div
                    className="badge"
                    style={{
                      background: 'rgba(16, 185, 129, 0.2)',
                      color: '#34d399',
                      border: '1px solid rgba(16, 185, 129, 0.45)',
                      boxShadow: '0 0 14px rgba(16, 185, 129, 0.2)',
                      gap: 6,
                      padding: '4px 10px',
                      fontWeight: 600,
                      letterSpacing: '0.04em',
                      fontSize: 11,
                    }}
                  >
                    <div className="status-dot-live" />
                    <span>LIVE ON {activeScreensForSelected.join(', ').toUpperCase()}</span>
                  </div>
                ) : (
                  <div
                    className="badge"
                    style={{
                      background: 'rgba(0, 0, 0, 0.6)',
                      backdropFilter: 'blur(8px)',
                      border: '1px solid var(--border-subtle)',
                      letterSpacing: '0.04em',
                      fontWeight: 600,
                      fontSize: 11,
                      color: 'var(--text-main)',
                    }}
                  >
                    SELECTED PREVIEW
                  </div>
                )}
                {activeWallpaper.config?.streamUrl ? (
                  <div
                    className="badge"
                    style={{
                      background: 'rgba(239, 68, 68, 0.2)',
                      color: '#f87171',
                      borderColor: 'rgba(239, 68, 68, 0.4)',
                      fontSize: 11,
                    }}
                  >
                    {activeWallpaper.config?.youtubeId ? 'YOUTUBE STREAM' : 'WEB STREAM'}
                  </div>
                ) : activeWallpaper.isCustom ? (
                  <div className="badge badge-brand" style={{ fontSize: 11 }}>
                    {activeWallpaper.engine === 'image-player' ? 'PICTURE' : 'VIDEO WALLPAPER'}
                  </div>
                ) : (
                  <div
                    className="badge"
                    style={{
                      background: 'rgba(168, 85, 247, 0.2)',
                      color: '#c084fc',
                      borderColor: 'rgba(168, 85, 247, 0.4)',
                      fontSize: 11,
                    }}
                  >
                    CANVAS 2D
                  </div>
                )}
              </div>

              {/* Pause/Resume Preview Toggle */}
              <button
                className="btn btn-ghost"
                style={{
                  height: 32,
                  padding: '0 10px',
                  fontSize: 11,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 5,
                  background: isTopPreviewPaused ? 'rgba(59, 130, 246, 0.2)' : 'rgba(10, 14, 22, 0.75)',
                  backdropFilter: 'blur(8px)',
                  border: '1px solid var(--border-subtle)',
                  color: isTopPreviewPaused ? 'var(--color-brand)' : 'var(--text-muted)',
                  borderRadius: 6,
                }}
                onClick={() => {
                  setIsTopPreviewPaused(p => !p)
                  tauriInvoke('trim_memory').catch(() => {})
                }}
                title={isTopPreviewPaused ? 'Resume live animation' : 'Pause animation to save GPU/RAM'}
              >
                {isTopPreviewPaused ? <Play size={12} fill="currentColor" /> : <Pause size={12} />}
                <span>{isTopPreviewPaused ? 'Resume' : 'Pause'}</span>
              </button>
            </div>

            {/* Bottom Metadata & Actions */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: 16 }}>
              <div>
                <div className="font-bold text-lg flex items-center gap-2" style={{ color: '#fff' }}>
                  <span style={{ letterSpacing: '-0.2px' }}>
                    {(customNames || {})[activeWallpaper?.id] || activeWallpaper?.name}
                  </span>
                  <button
                    className="btn-icon"
                    style={{ padding: 3, color: 'rgba(255,255,255,0.7)' }}
                    title="Rename Wallpaper"
                    onClick={() => setRenameModal({ isOpen: true, id: activeWallpaper.id, currentName: activeWallpaper.name })}
                  >
                    <Pencil size={12} />
                  </button>
                </div>
                <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.7)', marginTop: 2 }}>
                  {activeWallpaper.communityMeta?.author
                    ? `by ${activeWallpaper.communityMeta.author}`
                    : activeWallpaper.isCustom
                    ? (activeWallpaper.engine === 'image-player' ? 'Custom High-Res Picture' : 'Custom Video')
                    : `Built-in Canvas Engine · ${activeWallpaper.id}`}
                </div>
              </div>

              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                {isWallpaperRunning && (
                  <button
                    className="btn"
                    style={{
                      background: 'rgba(239,68,68,0.18)',
                      color: '#fca5a5',
                      border: '1px solid rgba(239,68,68,0.35)',
                      height: 34,
                      padding: '0 12px',
                      borderRadius: 8,
                      fontSize: 12,
                    }}
                    onClick={handleStop}
                  >
                    <Square size={12} fill="#fca5a5" style={{ marginRight: 6 }} /> Stop
                  </button>
                )}
                <button
                  className="btn btn-primary"
                  onClick={() => handleApply()}
                  disabled={applying}
                  style={{
                    opacity: applying ? 0.7 : 1,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    minWidth: 140,
                    height: 34,
                    fontSize: 12,
                    justifyContent: 'center',
                    borderRadius: 8,
                    boxShadow: '0 0 16px var(--color-glow)',
                  }}
                >
                  <MonitorPlay size={14} />
                  {applying ? 'Applying…' : selectedIsLive ? 'Re-apply' : 'Apply to Desktop'}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div
          className="card card-interactive"
          style={{
            marginBottom: 20,
            padding: 32,
            textAlign: 'center',
            border: '1.5px dashed var(--border-main)',
            background: 'transparent',
          }}
          onClick={handleOpenImportDialog}
        >
          <Plus size={24} className="text-brand" style={{ margin: '0 auto 8px', opacity: 0.8 }} />
          <div className="text-sm font-medium">Select a wallpaper below or click to import your own</div>
          <div className="text-xs text-muted" style={{ marginTop: 4 }}>
            Supports pictures (PNG, JPG, WebP) and videos (MP4, WebM, MKV)
          </div>
        </div>
      )}

      {/* Property Controls: Compact Horizontal Engine Surface */}
      {activeWallpaper && (
        <div className="engine-params-surface">
          <div className="engine-params-header">
            <div className="flex items-center gap-2">
              <SlidersHorizontal size={13} style={{ color: 'var(--color-brand)' }} />
              <span className="font-semibold text-xs uppercase tracking-wider text-muted">Active Wallpaper Controls</span>
            </div>
            <div className="telemetry-chip">
              <span style={{ color: 'var(--color-brand)', fontWeight: 600 }}>
                {activeWallpaper.engine || activeWallpaper.id || 'native'}
              </span>
              <span style={{ opacity: 0.4 }}>•</span>
              <span>{fpsCap > 0 && fpsCap < 240 ? `${fpsCap} FPS CAP` : 'UNLIMITED FPS'}</span>
            </div>
          </div>

          {/* Multi-monitor selector if per-screen mode */}
          {screenArrangement === 'per-screen' && monitors.length > 1 && (
            <div style={{ marginBottom: 14, padding: 10, background: 'var(--bg-card)', borderRadius: 8, border: '1px solid var(--border-subtle)' }}>
              <div className="text-xs font-semibold uppercase tracking-wider text-muted" style={{ marginBottom: 8 }}>Target Monitor</div>
              <div className="flex gap-2">
                {monitors.map((m, i) => {
                  const isSelected = selectedMonitorLabel === m.label
                  const monWp = monitorWallpapers?.[m.label]
                  return (
                    <button
                      key={m.label}
                      className={`btn ${isSelected ? 'btn-primary' : 'btn-ghost'}`}
                      onClick={() => handleSelectMonitor(m.label)}
                      style={{
                        flex: 1,
                        padding: '6px 10px',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 3,
                        alignItems: 'center',
                        borderRadius: 6,
                        border: isSelected ? '1px solid var(--color-brand)' : '1px solid var(--border-subtle)',
                        fontSize: 11,
                      }}
                    >
                      <Monitor size={14} />
                      <span style={{ fontWeight: 600 }}>{m.displayName || `Display ${m.displayNumber || i + 1}`}</span>
                      {monWp && (
                        <span style={{ fontSize: 9.5, opacity: 0.8, maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {monWp.name}
                        </span>
                      )}
                    </button>
                  )
                })}
              </div>
            </div>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 16 }}>
            {/* Opacity */}
            <div>
              <div className="flex justify-between text-xs text-muted" style={{ marginBottom: 6, userSelect: 'none' }}>
                <span>Opacity</span>
                <span className="text-brand font-mono">{Math.round(wallpaperOpacity * 100)}%</span>
              </div>
              <input
                type="range"
                className="slider"
                min={0.1} max={1} step={0.05}
                value={wallpaperOpacity}
                draggable={false}
                onDragStart={e => e.preventDefault()}
                style={{ touchAction: 'none' }}
                onChange={e => handleOpacity(parseFloat(e.target.value))}
              />
            </div>

            {/* Brightness */}
            <div>
              <div className="flex justify-between text-xs text-muted" style={{ marginBottom: 6, userSelect: 'none' }}>
                <span>Brightness</span>
                <span className="text-brand font-mono">{Math.round(wallpaperBrightness * 100)}%</span>
              </div>
              <input
                type="range"
                className="slider"
                min={0.1} max={1.5} step={0.05}
                value={wallpaperBrightness}
                draggable={false}
                onDragStart={e => e.preventDefault()}
                style={{ touchAction: 'none' }}
                onChange={e => handleBrightness(parseFloat(e.target.value))}
              />
            </div>

            {/* Speed or Picture Fit */}
            {isCurrentWallpaperImage ? (
              <div>
                <div className="flex justify-between text-xs text-muted" style={{ marginBottom: 6, userSelect: 'none' }}>
                  <span>Choose Fit</span>
                  <span className="text-brand font-mono capitalize">
                    {activeWallpaper.config?.fit === 'cover' ? 'fill' : (activeWallpaper.config?.fit === 'contain' ? 'fit' : (activeWallpaper.config?.fit || 'fill'))}
                  </span>
                </div>
                <div className="flex gap-1" style={{ flexWrap: 'wrap' }}>
                  {[
                    { id: 'fill', label: 'Fill' },
                    { id: 'fit', label: 'Fit' },
                    { id: 'stretch', label: 'Stretch' },
                    { id: 'center', label: 'Center' },
                    { id: 'tile', label: 'Tile' },
                  ].map(({ id, label }) => {
                    const currentFit = (activeWallpaper.config?.fit || 'fill').toLowerCase()
                    const isActive = currentFit === id || (id === 'fill' && currentFit === 'cover') || (id === 'fit' && currentFit === 'contain')
                    return (
                      <button
                        key={id}
                        className={`btn ${isActive ? 'btn-primary' : 'btn-ghost'}`}
                        style={{ flex: 1, minWidth: 44, padding: '4px 6px', fontSize: 10.5 }}
                        onClick={() => handleFit(id)}
                      >
                        {label}
                      </button>
                    )
                  })}
                </div>

                {['fit', 'contain', 'center'].includes((activeWallpaper.config?.fit || '').toLowerCase()) && (
                  <div style={{ marginTop: 8, paddingTop: 8, borderTop: '1px solid var(--border-subtle)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span className="text-xs text-muted">Matte Background</span>
                    <div className="flex items-center gap-1.5">
                      {['#000000', '#0a0e17', '#18181b', '#2d3748', '#ffffff'].map(c => (
                        <button
                          key={c}
                          type="button"
                          onClick={() => handleBackgroundColor(c)}
                          style={{
                            width: 16,
                            height: 16,
                            borderRadius: '50%',
                            background: c,
                            border: (activeWallpaper.config?.backgroundColor || '#000000') === c
                              ? '2px solid var(--color-brand)'
                              : '1px solid rgba(255,255,255,0.2)',
                            cursor: 'pointer',
                            padding: 0,
                          }}
                          title={c}
                        />
                      ))}
                      <input
                        type="color"
                        value={activeWallpaper.config?.backgroundColor || '#000000'}
                        onChange={e => handleBackgroundColor(e.target.value)}
                        style={{
                          width: 20,
                          height: 20,
                          padding: 0,
                          borderRadius: 4,
                          border: '1px solid var(--border-main)',
                          background: 'transparent',
                          cursor: 'pointer',
                        }}
                        title="Custom matte color"
                      />
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div>
                <div className="flex justify-between text-xs text-muted" style={{ marginBottom: 6, userSelect: 'none' }}>
                  <span>Speed</span>
                  <span className="text-brand font-mono">{parseFloat(wallpaperSpeed).toFixed(1)}×</span>
                </div>
                <input
                  type="range"
                  className="slider"
                  min={0.1} max={3} step={0.1}
                  value={wallpaperSpeed}
                  draggable={false}
                  onDragStart={e => e.preventDefault()}
                  style={{ touchAction: 'none' }}
                  onChange={e => handleSpeed(parseFloat(e.target.value))}
                />
              </div>
            )}

            {/* Volume */}
            <div>
              <div className="flex justify-between items-center text-xs text-muted" style={{ marginBottom: 6, userSelect: 'none' }}>
                <span className="flex items-center gap-1.5">
                  <button
                    className="btn-icon"
                    style={{
                      padding: 2,
                      color: currentWallpaperAudio.muted ? 'var(--color-rose)' : 'var(--color-brand)',
                    }}
                    onClick={handleWallpaperMuteToggle}
                    title={currentWallpaperAudio.muted ? 'Unmute wallpaper' : 'Mute wallpaper'}
                  >
                    {currentWallpaperAudio.muted ? <VolumeX size={13} /> : <Volume2 size={13} />}
                  </button>
                  <span>Volume</span>
                </span>
                <span className="text-brand font-mono">
                  {currentWallpaperAudio.muted ? 'Muted' : `${currentWallpaperAudio.volume}%`}
                </span>
              </div>
              <input
                type="range"
                className="slider"
                min={0} max={100} step={1}
                value={currentWallpaperAudio.muted ? 0 : currentWallpaperAudio.volume}
                draggable={false}
                onDragStart={e => e.preventDefault()}
                style={{ touchAction: 'none' }}
                onChange={e => {
                  const v = parseInt(e.target.value, 10)
                  handleWallpaperVolumeChange(v)
                }}
              />
            </div>
          </div>

          {isCurrentWallpaperImage && activeWallpaper?.config?.imagePath && (
            <div style={{ marginTop: 12, paddingTop: 10, borderTop: '1px solid var(--border-subtle)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
              <div className="text-xs text-muted">
                Also set this picture as your Windows desktop system wallpaper (persists even when app closes)
              </div>
              <button
                className={`btn ${winWallpaperSet ? 'btn-success' : 'btn-ghost'}`}
                style={{ fontSize: 11, padding: '4px 12px' }}
                onClick={handleSetWindowsWallpaper}
              >
                {winWallpaperSet ? (
                  <>
                    <Check size={12} style={{ marginRight: 4 }} /> Set as System Wallpaper!
                  </>
                ) : (
                  <>
                    <ImageIcon size={12} style={{ marginRight: 4 }} /> Set as Windows Wallpaper
                  </>
                )}
              </button>
            </div>
          )}
        </div>
      )}

      {/* Wallpapers Section Header & Filter Toolbar */}
      <div style={{ marginBottom: 16 }}>
        <div className="flex items-center justify-between" style={{ marginBottom: 12 }}>
          <div className="flex items-center gap-3">
            <h2 className="font-semibold text-base" style={{ letterSpacing: '-0.2px' }}>Home Favorites</h2>
            <span className="badge font-mono" style={{ fontSize: 11 }}>{homeWallpapers.length}</span>
            <button
              className="btn btn-ghost"
              style={{ fontSize: 11, padding: '2px 8px', height: 'auto', color: 'var(--text-muted)' }}
              onClick={() => navigate('/library')}
            >
              Manage in Library <ArrowRight size={11} style={{ marginLeft: 3 }} />
            </button>
          </div>

          {/* Search bar */}
          <div style={{ position: 'relative', width: 220 }}>
            <Search size={13} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
            <input
              type="text"
              placeholder="Search home wallpapers…"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              style={{
                width: '100%',
                padding: '6px 26px 6px 30px',
                background: 'var(--bg-card)',
                border: '1px solid var(--border-subtle)',
                borderRadius: 8,
                color: 'var(--text-main)',
                fontSize: 12,
                outline: 'none',
              }}
            />
            {searchQuery && (
              <button
                className="btn-icon"
                style={{ position: 'absolute', right: 4, top: '50%', transform: 'translateY(-50%)', padding: 2 }}
                onClick={() => setSearchQuery('')}
              >
                <X size={12} />
              </button>
            )}
          </div>
        </div>

        {/* Category Filters & Thumbnail Mode Selector */}
        <div className="flex items-center justify-between gap-3" style={{ flexWrap: 'wrap' }}>
          <div className="flex items-center gap-1.5" style={{ flexWrap: 'wrap' }}>
            {[
              { id: 'all', label: 'All Favorites', count: homeWallpapers.length },
              { id: 'liked', label: 'Liked', count: homeWallpapers.filter(w => (likedWallpaperIds || []).includes(w.id)).length, icon: Heart },
              { id: 'builtin', label: 'Built-in Canvas', count: homeWallpapers.filter(w => !w.isCustom).length },
              { id: 'custom', label: 'Custom Media', count: homeWallpapers.filter(w => w.isCustom && !w.config?.streamUrl).length },
              { id: 'stream', label: 'Web Streams', count: homeWallpapers.filter(w => w.config?.streamUrl).length },
            ].map(cat => {
              const isActive = filterCategory === cat.id
              return (
                <button
                  key={cat.id}
                  style={{
                    cursor: 'pointer',
                    padding: '4px 10px',
                    fontSize: 11.5,
                    fontWeight: isActive ? 600 : 500,
                    borderRadius: 6,
                    background: isActive ? 'var(--bg-card-hover)' : 'transparent',
                    color: isActive ? (cat.id === 'liked' ? 'var(--color-rose)' : 'var(--color-brand)') : 'var(--text-muted)',
                    border: isActive ? (cat.id === 'liked' ? '1px solid var(--color-rose)' : '1px solid var(--color-brand)') : '1px solid var(--border-subtle)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 5,
                    transition: 'all 0.15s ease',
                  }}
                  onClick={() => setFilterCategory(cat.id)}
                >
                  {cat.icon && <cat.icon size={11} fill={isActive ? 'currentColor' : 'none'} />}
                  <span>{cat.label}</span>
                  <span style={{ opacity: 0.65, fontSize: 10, fontFamily: 'var(--font-mono)' }}>{cat.count}</span>
                </button>
              )
            })}
          </div>
        </div>
      </div>

      {/* Pinned Wallpaper Grid */}
      {homeWallpapers.length === 0 ? (
        <div className="card" style={{ padding: 48, textAlign: 'center', color: 'var(--text-subtle)', marginBottom: 36, border: '1.5px dashed var(--border-main)', background: 'transparent' }}>
          <Pin size={28} className="text-brand" style={{ margin: '0 auto 12px', opacity: 0.7 }} />
          <div className="text-base font-semibold" style={{ color: 'var(--text-main)', marginBottom: 6 }}>
            No wallpapers pinned to Home yet
          </div>
          <p className="text-xs text-muted" style={{ maxWidth: 380, margin: '0 auto 18px' }}>
            Your Library holds all available wallpapers. Visit the Library to select which ones you want to appear on your Home dashboard.
          </p>
          <button className="btn btn-primary" onClick={() => navigate('/library')} style={{ margin: '0 auto' }}>
            Open Library to Pick Wallpapers <ArrowRight size={13} style={{ marginLeft: 4 }} />
          </button>
        </div>
      ) : filteredWallpapers.length === 0 ? (
        <div className="card" style={{ padding: 40, textAlign: 'center', color: 'var(--text-subtle)', marginBottom: 32 }}>
          <Search size={24} style={{ margin: '0 auto 8px', opacity: 0.4 }} />
          <div className="text-sm">No home wallpapers matching "{searchQuery}"</div>
          <button className="btn btn-ghost" style={{ marginTop: 12, fontSize: 12 }} onClick={() => { setSearchQuery(''); setFilterCategory('all'); }}>
            Reset Filters
          </button>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 18, marginBottom: 36 }}>
          {filteredWallpapers.map(wallpaper => {
            const isSelected    = activeWallpaper?.id === wallpaper.id
            const activeScreens = getWallpaperActiveScreens(wallpaper)
            const isLive        = activeScreens.length > 0
            const isLiked       = (likedWallpaperIds || []).includes(wallpaper.id)
            const isPinned      = homeWallpaperIds.includes(wallpaper.id)

            return (
              <WallpaperCard
                key={wallpaper.id}
                wallpaper={wallpaper}
                isFeatured={false}
                isLive={isLive}
                isSelected={isSelected}
                isLiked={isLiked}
                isPinned={isPinned}
                isApplying={applying}
                thumbnailMode={thumbnailMode}
                onSelect={(wp) => selectWallpaper(wp)}
                onApply={(wp) => {
                  selectWallpaper(wp)
                  handleApply(wp)
                }}
                onPreview={(wp) => setPreviewWallpaper(wp)}
                onToggleLike={(id) => toggleLikeWallpaper(id)}
                onTogglePin={(id) => unpinFromHome(id)}
                onRename={(id, name) => setRenameModal({ isOpen: true, id, currentName: name })}
                onDelete={(id) => {
                  if (isLive) handleStop()
                  uninstallItem(id)
                }}
              />
            )
          })}
        </div>
      )}

      {/* Modals */}
      <AddWallpaperModal
        isOpen={addModal.isOpen}
        filePath={addModal.path}
        initialName={addModal.initialName}
        onClose={() => setAddModal({ isOpen: false, path: '', initialName: '' })}
        onConfirm={handleConfirmAdd}
      />

      <RenameWallpaperModal
        isOpen={renameModal.isOpen}
        currentName={renameModal.currentName}
        onClose={() => setRenameModal({ isOpen: false, id: null, currentName: '' })}
        onConfirm={handleConfirmRename}
      />

      <AddWebStreamModal
        isOpen={addStreamModal}
        onClose={() => setAddStreamModal(false)}
        onConfirm={handleConfirmAddStream}
      />

      {previewWallpaper && (
        <HomePreviewModal
          wallpaper={previewWallpaper}
          onClose={() => setPreviewWallpaper(null)}
          onApply={(wp) => {
            selectWallpaper(wp)
            handleApply(wp)
            setPreviewWallpaper(null)
          }}
          isLive={getWallpaperActiveScreens(previewWallpaper).length > 0}
        />
      )}
    </div>
  )
}
