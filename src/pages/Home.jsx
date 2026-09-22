import React, { useState, useEffect, useMemo, useRef } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import {
  Play, Pause, Zap, MonitorPlay, Square, Monitor, Plus, Search,
  Video, Image as ImageIcon, Trash2, Check, Sparkles, Filter, X, Pin, PinOff, Pencil, ArrowRight, Globe, Eye,
  Volume2, VolumeX, SlidersHorizontal, Heart, LayoutGrid, List, ChevronDown, Flame, FolderPlus
} from 'lucide-react'
import { useStore } from '../store/useStore.js'
import { WALLPAPER_LIST } from '../engines/index.js'
import WallpaperPlayer from '../components/WallpaperPlayer/index.jsx'
import WallpaperThumbnail from '../components/WallpaperThumbnail/index.jsx'
import WallpaperCard from '../components/WallpaperCard/index.jsx'
import WallpaperSettingsPanel from '../components/Home/WallpaperSettingsPanel.jsx'
import { AddWallpaperModal, RenameWallpaperModal, AddWebStreamModal } from '../components/Modals/WallpaperModals.jsx'
import { BatchImportModal } from '../components/Modals/BatchImportModal.jsx'
import { scanDirectoryMedia } from '../lib/storageManager.js'
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
  const isEngine = wallpaper.type === 'engine' || (Boolean(wallpaper.engine) && wallpaper.engine !== 'video-player' && wallpaper.engine !== 'image-player' && wallpaper.engine !== 'web-stream')
  const isVideo = !isImage && !isStream && !isEngine && (wallpaper.isCustom || engineId === 'video-player' || wallpaper.mediaType === 'video')

  if (isEngine) {
    return { label: 'Canvas 2D', color: 'var(--color-purple)', icon: Sparkles, type: 'canvas' }
  }
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
  const [filterCategory, setFilterCategory]   = useState('all')
  const [sortBy, setSortBy]                   = useState('trending') // 'trending' | 'recent' | 'name' | 'liked'
  const [viewMode, setViewMode]               = useState('grid') // 'grid' | 'list'
  const [hoveredId, setHoveredId]             = useState(null)

  // Modals state
  const [addModal, setAddModal] = useState({ isOpen: false, path: '', initialName: '' })
  const [renameModal, setRenameModal] = useState({ isOpen: false, id: null, currentName: '' })
  const [addStreamModal, setAddStreamModal] = useState(false)
  const [isAddMenuOpen, setIsAddMenuOpen]     = useState(false)
  const [batchModal, setBatchModal]           = useState({ isOpen: false, paths: [] })
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
  const isWindowHidden        = useStore(s => s.isWindowHidden)

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
    setIsAddMenuOpen(false)
    try {
      const { open } = await import('@tauri-apps/plugin-dialog')
      const selected = await open({
        multiple: true,
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
        const paths = Array.isArray(selected) ? selected : [selected]
        if (paths.length === 1) {
          const path = paths[0]
          const filename = path.split('\\').pop().split('/').pop()
          const cleanName = filename.replace(/\.[^/.]+$/, '')
          setAddModal({ isOpen: true, path, initialName: cleanName })
        } else if (paths.length > 1) {
          setBatchModal({ isOpen: true, paths })
        }
      }
    } catch (err) {
      console.error('Failed to open import dialog:', err)
    }
  }

  // ── Import folder handler (recursively scans directory) ─────────────────────
  const handleOpenFolderImportDialog = async () => {
    setIsAddMenuOpen(false)
    try {
      const { open } = await import('@tauri-apps/plugin-dialog')
      const selectedDir = await open({
        directory: true,
        multiple: false,
      })
      if (selectedDir) {
        const dirPath = typeof selectedDir === 'string' ? selectedDir : selectedDir[0]
        if (dirPath) {
          const files = await scanDirectoryMedia(dirPath)
          if (files && files.length > 0) {
            if (files.length === 1) {
              const filename = files[0].split(/[/\\]/).pop() || ''
              setAddModal({ isOpen: true, path: files[0], initialName: filename.replace(/\.[^/.]+$/, '') })
            } else {
              setBatchModal({ isOpen: true, paths: files })
            }
          } else {
            alert('No supported media files found in selected folder.')
          }
        }
      }
    } catch (err) {
      console.error('Failed to open folder import dialog:', err)
    }
  }

  // Close dropdown on outside click or Escape
  useEffect(() => {
    const handleWindowClick = (e) => {
      if (!e.target.closest('.library-split-btn') && !e.target.closest('.library-add-dropdown')) {
        setIsAddMenuOpen(false)
      }
    }
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        setIsAddMenuOpen(false)
      }
    }
    window.addEventListener('click', handleWindowClick)
    window.addEventListener('keydown', handleKeyDown)
    return () => {
      window.removeEventListener('click', handleWindowClick)
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [])

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
    const list = homeWallpapers.filter(w => {
      if (filterCategory === 'liked' && !(likedWallpaperIds || []).includes(w.id)) return false
      if (filterCategory === 'pinned' && !(homeWallpaperIds || []).includes(w.id)) return false
      if (filterCategory === 'procedural' && (w.engine === 'video-player' || w.engine === 'image-player' || w.config?.videoPath || w.config?.imagePath || w.config?.streamUrl)) return false
      if (filterCategory === 'builtin' && w.isCustom) return false
      if (filterCategory === 'custom' && (!w.isCustom || w.config?.streamUrl)) return false
      if (filterCategory === 'stream' && !w.config?.streamUrl) return false
      if (filterCategory === '4k') {
        const is4k = w.name?.toLowerCase().includes('4k') || w.name?.toLowerCase().includes('uhd') || w.tags?.some(t => t.toLowerCase().includes('4k') || t.toLowerCase().includes('uhd'))
        if (!is4k) return false
      }
      if (['nature', 'anime', 'abstract', 'games', 'minimal'].includes(filterCategory)) {
        const cat = filterCategory.toLowerCase()
        const matchTag = w.tags?.some(t => t.toLowerCase().includes(cat))
        const matchName = w.name?.toLowerCase().includes(cat)
        if (!matchTag && !matchName) return false
      }
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase()
        const matchName = w.name.toLowerCase().includes(query)
        const matchTag = w.tags?.some(t => t.toLowerCase().includes(query))
        return matchName || matchTag
      }
      return true
    })

    if (sortBy === 'recent') {
      return [...list].sort((a, b) => (b.installedAt || 0) - (a.installedAt || 0))
    }
    if (sortBy === 'name') {
      return [...list].sort((a, b) => (a.name || '').localeCompare(b.name || ''))
    }
    if (sortBy === 'liked') {
      return [...list].sort((a, b) => {
        const aLiked = (likedWallpaperIds || []).includes(a.id) ? 1 : 0
        const bLiked = (likedWallpaperIds || []).includes(b.id) ? 1 : 0
        return bLiked - aLiked
      })
    }
    return list
  }, [homeWallpapers, filterCategory, searchQuery, likedWallpaperIds, homeWallpaperIds, sortBy])

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
      {/* ── Sovereign Split Hero Deck: Live Stage (60%) + Wallpaper Settings (40%) ── */}
      {activeWallpaper ? (
        <div className="sovereign-hero-container">
          {/* Left: Active Live Stage Hero Card */}
          <div className="sovereign-hero-stage">
            {!isTopPreviewPaused && !isWindowHidden ? (
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
              </div>
            )}

            {/* Gradient Scrim Overlay */}
            <div
              style={{
                position: 'absolute',
                inset: 0,
                background: 'linear-gradient(to top, rgba(5, 8, 15, 0.95) 0%, rgba(5, 8, 15, 0.45) 45%, rgba(0, 0, 0, 0.15) 100%)',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
                padding: '16px 20px',
                zIndex: 10,
                pointerEvents: 'auto',
              }}
            >
              {/* Top Badges */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  {selectedIsLive ? (
                    <div
                      className="wp-badge-pill"
                      style={{
                        background: 'rgba(16, 185, 129, 0.22)',
                        color: '#34d399',
                        border: '1px solid rgba(16, 185, 129, 0.45)',
                        gap: 6,
                        padding: '4px 10px',
                        fontSize: 10,
                      }}
                    >
                      <div className="status-dot-live" style={{ width: 6, height: 6 }} />
                      <span>LIVE ON {activeScreensForSelected.join(', ').toUpperCase()}</span>
                    </div>
                  ) : (
                    <div
                      className="wp-badge-pill"
                      style={{
                        background: 'rgba(0, 0, 0, 0.65)',
                        color: 'var(--text-main)',
                        border: '1px solid var(--border-subtle)',
                        fontSize: 10,
                      }}
                    >
                      SELECTED PREVIEW
                    </div>
                  )}

                  <div
                    className="wp-badge-pill"
                    style={{
                      background: 'rgba(10, 14, 24, 0.75)',
                      color: 'var(--text-muted)',
                      border: '1px solid var(--border-subtle)',
                      fontSize: 10,
                    }}
                  >
                    {activeWallpaper.engine === 'image-player' || (!activeWallpaper.config?.videoPath && activeWallpaper.config?.imagePath)
                      ? 'IMAGE WALLPAPER'
                      : activeWallpaper.config?.streamUrl
                      ? 'STREAM WALLPAPER'
                      : activeWallpaper.isCustom
                      ? 'VIDEO WALLPAPER'
                      : 'CANVAS 2D'}
                  </div>
                </div>

                {/* Pause/Resume Preview Toggle */}
                <button
                  type="button"
                  style={{
                    padding: '4px 8px',
                    borderRadius: 6,
                    background: 'rgba(10, 14, 24, 0.75)',
                    border: '1px solid var(--border-subtle)',
                    color: isTopPreviewPaused ? 'var(--color-brand)' : 'var(--text-muted)',
                    fontSize: 11,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 5,
                    cursor: 'pointer',
                  }}
                  onClick={() => setIsTopPreviewPaused(p => !p)}
                  title={isTopPreviewPaused ? 'Resume preview' : 'Pause preview (saves GPU/RAM)'}
                >
                  {isTopPreviewPaused ? <Play size={11} fill="currentColor" /> : <Pause size={11} />}
                  <span>{isTopPreviewPaused ? 'Resume' : 'Pause'}</span>
                </button>
              </div>

              {/* Bottom Artwork Metadata & Control Actions */}
              <div>
                <div style={{ marginBottom: 6 }}>
                  <div style={{ fontSize: 20, fontWeight: 700, color: '#ffffff', letterSpacing: '-0.4px', display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span>{(customNames || {})[activeWallpaper?.id] || activeWallpaper?.name}</span>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 2, fontSize: 12, color: 'rgba(255, 255, 255, 0.75)' }}>
                    <span>
                      by {activeWallpaper?.author || activeWallpaper?.communityMeta?.author || (activeWallpaper?.isCustom ? 'Local User' : 'NordicVibes')}
                    </span>
                    <span
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        width: 14,
                        height: 14,
                        borderRadius: '50%',
                        background: '#38bdf8',
                        color: '#05070d',
                      }}
                      title="Verified Creator"
                    >
                      <Check size={10} strokeWidth={3} />
                    </span>
                  </div>

                  {/* Tags */}
                  <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
                    {(activeWallpaper?.tags || ['nature', 'mountains', '4k', 'ambient', 'landscape']).slice(0, 5).map(tag => (
                      <span
                        key={tag}
                        style={{
                          fontSize: 11,
                          color: 'rgba(255, 255, 255, 0.65)',
                          fontFamily: 'inherit',
                        }}
                      >
                        #{tag}
                      </span>
                    ))}
                  </div>
                </div>

                {/* Actions row */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 14 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <button
                      type="button"
                      onClick={() => handleApply()}
                      disabled={applying}
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 6,
                        padding: '6px 16px',
                        borderRadius: 8,
                        background: 'var(--color-brand)',
                        color: '#05070d',
                        border: 'none',
                        fontSize: 12,
                        fontWeight: 700,
                        cursor: 'pointer',
                        boxShadow: '0 0 16px rgba(6, 182, 212, 0.4)',
                        transition: 'all 0.15s ease',
                      }}
                    >
                      {isWallpaperRunning ? <Pause size={13} fill="currentColor" /> : <Play size={13} fill="currentColor" />}
                      <span>{isWallpaperRunning ? 'Pause' : 'Apply'}</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        const allList = homeWallpapers || []
                        if (allList.length > 1) {
                          const idx = allList.findIndex(w => w.id === activeWallpaper.id)
                          const nextIdx = (idx + 1) % allList.length
                          selectWallpaper(allList[nextIdx])
                        }
                      }}
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 6,
                        padding: '6px 14px',
                        borderRadius: 8,
                        background: 'rgba(255, 255, 255, 0.08)',
                        border: '1px solid rgba(255, 255, 255, 0.15)',
                        color: 'var(--text-main)',
                        fontSize: 12,
                        fontWeight: 600,
                        cursor: 'pointer',
                        transition: 'all 0.15s ease',
                      }}
                    >
                      <span>⇄ Change Wallpaper</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => toggleLikeWallpaper(activeWallpaper.id)}
                      className="btn-icon"
                      style={{
                        padding: 7,
                        borderRadius: 8,
                        background: 'rgba(255, 255, 255, 0.08)',
                        border: '1px solid rgba(255, 255, 255, 0.15)',
                        color: (likedWallpaperIds || []).includes(activeWallpaper.id) ? 'var(--color-rose)' : 'var(--text-main)',
                      }}
                      title="Like wallpaper"
                    >
                      <Heart size={14} fill={(likedWallpaperIds || []).includes(activeWallpaper.id) ? 'currentColor' : 'none'} />
                    </button>
                  </div>

                  {/* Carousel indicators on bottom right */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <div style={{ width: 18, height: 4, borderRadius: 2, background: 'rgba(255, 255, 255, 0.9)' }} />
                    <div style={{ width: 6, height: 4, borderRadius: 2, background: 'rgba(255, 255, 255, 0.3)' }} />
                    <div style={{ width: 6, height: 4, borderRadius: 2, background: 'rgba(255, 255, 255, 0.3)' }} />
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Right: Wallpaper Settings Panel */}
          <WallpaperSettingsPanel
            monitors={monitors}
            selectedMonitorLabel={selectedMonitorLabel}
            onSelectMonitor={handleSelectMonitor}
          />
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

      {/* Wallpapers Section Header & Filter Toolbar */}
      <div style={{ marginBottom: 16 }}>
        <div className="flex items-center justify-between gap-4" style={{ marginBottom: 12, flexWrap: 'wrap' }}>
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

          <div className="flex items-center gap-3" style={{ flex: 1, justifyContent: 'flex-end', minWidth: 260 }}>
            {/* Search bar */}
            <div style={{ position: 'relative', flex: 1, maxWidth: 320 }}>
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

            {/* Split Add Button matching Library */}
            <div style={{ position: 'relative' }}>
              <div className="library-split-btn">
                <button
                  className="library-split-main"
                  onClick={handleOpenImportDialog}
                  title="Add a local video or picture wallpaper"
                >
                  <Plus size={14} /> Add Wallpaper
                </button>
                <button
                  className="library-split-arrow"
                  onClick={(e) => {
                    e.stopPropagation()
                    setIsAddMenuOpen(!isAddMenuOpen)
                  }}
                  title="More import options"
                >
                  <ChevronDown size={13} />
                </button>
              </div>

              {isAddMenuOpen && (
                <div
                  className="library-context-menu library-add-dropdown"
                  style={{ top: 'calc(100% + 6px)', right: 0 }}
                  onClick={(e) => e.stopPropagation()}
                >
                  <button
                    className="library-context-item"
                    onClick={handleOpenImportDialog}
                  >
                    <Plus size={13} /> Add Local Wallpaper(s)
                  </button>
                  <button
                    className="library-context-item"
                    onClick={handleOpenFolderImportDialog}
                  >
                    <FolderPlus size={13} /> Import Entire Folder...
                  </button>
                  <button
                    className="library-context-item"
                    onClick={() => {
                      setIsAddMenuOpen(false)
                      setAddStreamModal(true)
                    }}
                  >
                    <Globe size={13} /> Add Web Stream
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Category Filters, Search & View Controls */}
        <div className="flex items-center justify-between gap-3" style={{ flexWrap: 'nowrap', marginBottom: 6 }}>
          {/* Scrollable Filter Chips */}
          <div className="aether-filter-scroll" style={{ flex: 1, minWidth: 0 }}>
            {[
              { id: 'all', label: 'All', count: homeWallpapers.length },
              { id: 'liked', label: 'Liked', count: homeWallpapers.filter(w => (likedWallpaperIds || []).includes(w.id)).length, icon: Heart },
              { id: 'pinned', label: 'Pinned', count: homeWallpapers.filter(w => (homeWallpaperIds || []).includes(w.id)).length, icon: Pin },
              { id: 'procedural', label: 'Procedural', count: homeWallpapers.filter(w => w.engine !== 'video-player' && w.engine !== 'image-player' && !w.config?.videoPath && !w.config?.imagePath && !w.config?.streamUrl).length, icon: Sparkles },
              { id: 'builtin', label: 'Built-in', count: homeWallpapers.filter(w => !w.isCustom).length },
              { id: 'custom', label: 'Custom Media', count: homeWallpapers.filter(w => w.isCustom && !w.config?.streamUrl).length },
              { id: 'stream', label: 'Web Streams', count: homeWallpapers.filter(w => w.config?.streamUrl).length, icon: Globe },
              { id: '4k', label: '4K+' },
              { id: 'nature', label: 'Nature' },
              { id: 'anime', label: 'Anime' },
              { id: 'abstract', label: 'Abstract' },
              { id: 'games', label: 'Games' },
              { id: 'minimal', label: 'Minimal' },
            ].map(cat => {
              const isActive = filterCategory === cat.id
              const isLikedChip = cat.id === 'liked'
              return (
                <button
                  key={cat.id}
                  className={`aether-filter-chip ${isActive ? (isLikedChip ? 'active-liked' : 'active') : ''}`}
                  onClick={() => setFilterCategory(cat.id)}
                >
                  {cat.icon && <cat.icon size={11} fill={isActive ? 'currentColor' : 'none'} />}
                  <span>{cat.label}</span>
                  {typeof cat.count === 'number' && (
                    <span style={{ opacity: 0.65, fontSize: 10, fontFamily: 'var(--font-mono)' }}>{cat.count}</span>
                  )}
                </button>
              )
            })}
          </div>

          {/* Right Controls: Sort dropdown and Grid/List switcher */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
            <select
              value={sortBy}
              onChange={e => setSortBy(e.target.value)}
              className="aether-sort-select"
            >
              <option value="trending">Trending ▾</option>
              <option value="recent">Recently Added</option>
              <option value="name">Name (A-Z)</option>
              <option value="liked">Most Liked</option>
            </select>

            <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
              <button
                className={`aether-view-switch-btn ${viewMode === 'grid' ? 'active' : ''}`}
                onClick={() => setViewMode('grid')}
                title="Grid View"
              >
                <LayoutGrid size={14} />
              </button>
              <button
                className={`aether-view-switch-btn ${viewMode === 'list' ? 'active' : ''}`}
                onClick={() => setViewMode('list')}
                title="List View"
              >
                <List size={14} />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Pinned Wallpaper Grid or List */}
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
      ) : viewMode === 'list' ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 36 }}>
          {filteredWallpapers.map(wallpaper => {
            const isSelected    = activeWallpaper?.id === wallpaper.id
            const activeScreens = getWallpaperActiveScreens(wallpaper)
            const isLive        = activeScreens.length > 0
            const isLiked       = (likedWallpaperIds || []).includes(wallpaper.id)
            const isPinned      = homeWallpaperIds.includes(wallpaper.id)

            return (
              <div
                key={wallpaper.id}
                className={`aether-wallpaper-list-row ${isLive ? 'is-live' : ''}`}
                style={{
                  border: isSelected ? '1px solid var(--color-brand)' : undefined,
                  cursor: 'pointer',
                }}
                onClick={() => selectWallpaper(wallpaper)}
              >
                <div style={{ width: 108, height: 62, borderRadius: 6, overflow: 'hidden', flexShrink: 0, position: 'relative', background: '#080c14' }}>
                  <WallpaperThumbnail wallpaper={wallpaper} isHovered={false} mode={thumbnailMode} />
                  {isLive && (
                    <div style={{ position: 'absolute', top: 5, left: 5, width: 7, height: 7, borderRadius: '50%', background: '#10b981', boxShadow: '0 0 6px #10b981' }} />
                  )}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontWeight: 600, fontSize: 13, color: 'var(--text-main)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {wallpaper.name}
                    </span>
                    {isLive && (
                      <span className="telemetry-chip" style={{ fontSize: 9.5, padding: '1px 6px', color: '#10b981', borderColor: 'rgba(16, 185, 129, 0.3)' }}>
                        ACTIVE
                      </span>
                    )}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 4, fontSize: 11, color: 'var(--text-muted)' }}>
                    <span>{wallpaper.communityMeta?.author ? `by ${wallpaper.communityMeta.author}` : (wallpaper.isCustom ? 'Custom Media' : 'Built-in Canvas')}</span>
                    <span>•</span>
                    <span style={{ textTransform: 'capitalize' }}>{wallpaper.engine || 'Engine'}</span>
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <button
                    className="btn-icon"
                    style={{ width: 30, height: 30, color: isLiked ? 'var(--color-rose)' : 'var(--text-muted)' }}
                    onClick={(e) => { e.stopPropagation(); toggleLikeWallpaper(wallpaper.id) }}
                    title="Like"
                  >
                    <Heart size={14} fill={isLiked ? 'currentColor' : 'none'} />
                  </button>
                  <button
                    className="btn-icon"
                    style={{ width: 30, height: 30, color: isPinned ? 'var(--color-brand)' : 'var(--text-muted)' }}
                    onClick={(e) => { e.stopPropagation(); unpinFromHome(wallpaper.id) }}
                    title="Pin/Unpin"
                  >
                    <Pin size={14} fill={isPinned ? 'currentColor' : 'none'} />
                  </button>
                  <button
                    className={`wp-pill-apply-btn ${isLive ? 'active' : ''}`}
                    onClick={(e) => {
                      e.stopPropagation()
                      selectWallpaper(wallpaper)
                      handleApply(wallpaper)
                    }}
                  >
                    <Play size={10} fill="currentColor" /> {isLive ? 'Live' : 'Apply'}
                  </button>
                </div>
              </div>
            )
          })}
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
                onPreview={(wp) => selectWallpaper(wp)}
                onModalPreview={(wp) => setPreviewWallpaper(wp)}
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

      <BatchImportModal
        isOpen={batchModal.isOpen}
        filePaths={batchModal.paths}
        onClose={() => setBatchModal({ isOpen: false, paths: [] })}
        onSuccess={() => setBatchModal({ isOpen: false, paths: [] })}
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
