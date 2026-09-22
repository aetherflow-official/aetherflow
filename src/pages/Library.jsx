import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react'
import { createPortal } from 'react-dom'
import {
  Trash2, Play, Image as ImageIcon, Plus, Video, Monitor, Check,
  Pin, PinOff, Pencil, Search, X, Globe, Heart, ChevronDown,
  LayoutGrid, List, Sparkles, Terminal, Waves, Compass, Flame,
  CloudRain, Activity, Code, ExternalLink, MoreHorizontal, Eye, FolderPlus,
  HardDrive, Cloud, DownloadCloud
} from 'lucide-react'
import { useStore } from '../store/useStore.js'
import { WALLPAPER_LIST } from '../engines/index.js'
import WallpaperPlayer from '../components/WallpaperPlayer/index.jsx'
import WallpaperThumbnail, { resolveWallpaperThumbnail, extractYouTubeId } from '../components/WallpaperThumbnail/index.jsx'
import WallpaperCard from '../components/WallpaperCard/index.jsx'
import { AddWallpaperModal, RenameWallpaperModal, AddWebStreamModal } from '../components/Modals/WallpaperModals.jsx'
import { BatchImportModal } from '../components/Modals/BatchImportModal.jsx'
import { scanDirectoryMedia } from '../lib/storageManager.js'
import { downloadCommunityWallpaper } from '../lib/community.js'
import {
  applyWallpaperToDesktop,
  stopDesktopWallpaper,
  addCustomMediaWallpaper,
  addCustomStreamWallpaper,
  tauriInvoke,
  safeListen,
  safeConvertFileSrc,
} from '../lib/wallpaperActions.js'
import { previewManager } from '../lib/previewManager.js'

export function getWallpaperTypeInfo(wallpaper) {
  if (!wallpaper) return { label: 'Canvas 2D', color: 'var(--color-purple)', type: 'canvas', icon: Code }
  const engineId = wallpaper.engine || wallpaper.id
  const streamUrl = wallpaper.config?.streamUrl || wallpaper.config?.url || ''
  const isStream = engineId === 'web-stream' || Boolean(wallpaper.config?.streamUrl)
  const urlOrPath = wallpaper.remoteUrl || wallpaper.localPath || wallpaper.source || wallpaper.config?.imagePath || wallpaper.config?.videoPath || ''
  const hasImageExt = /\.(png|jpg|jpeg|webp|bmp|gif|avif)$/i.test(urlOrPath) || urlOrPath.includes('images.unsplash.com') || ['image', 'jpg', 'jpeg', 'png', 'webp', 'avif'].includes(String(wallpaper.communityMeta?.mediaFormat || '').toLowerCase())
  const isImage = engineId === 'image-player' || wallpaper.mediaType === 'image' || wallpaper.type === 'image' || hasImageExt || Boolean(wallpaper.config?.imagePath && !wallpaper.config?.videoPath)
  const isEngine = !isImage && (wallpaper.type === 'engine' || wallpaper.mediaType === 'canvas' || (Boolean(wallpaper.engine) && wallpaper.engine !== 'video-player' && wallpaper.engine !== 'image-player' && wallpaper.engine !== 'web-stream') || (Array.isArray(wallpaper.tags) && wallpaper.tags.includes('procedural')))
  const isVideo = !isImage && !isStream && !isEngine && (wallpaper.isCustom || engineId === 'video-player' || wallpaper.mediaType === 'video')

  if (isEngine) {
    return { label: 'Canvas 2D', color: 'var(--color-purple)', type: 'canvas', icon: Sparkles }
  }
  if (isStream) {
    const streamUrl = wallpaper.config?.streamUrl || wallpaper.config?.url || ''
    const isYt = /(?:youtu\.be\/|youtube\.com)/.test(streamUrl)
    return {
      label: isYt ? 'YouTube' : 'Web Stream',
      color: isYt ? 'var(--color-rose)' : 'var(--color-cyan)',
      type: isYt ? 'youtube' : 'stream',
      icon: Globe,
    }
  }
  if (isImage) {
    return { label: 'Picture', color: 'var(--color-emerald)', type: 'image', icon: ImageIcon }
  }
  if (isVideo) {
    return { label: 'Video', color: 'var(--color-brand)', type: 'video', icon: Video }
  }
  return { label: 'Canvas 2D', color: 'var(--color-purple)', type: 'canvas', icon: Sparkles }
}

/**
 * Dedicated Library Preview Modal — opens on card click or "Preview" button.
 * Enforces immediate and complete teardown of decoders/media buffers on close.
 */
function LibraryPreviewModal({ wallpaper, onClose, onApply, isLive, onDownloadOffline, onFreeSpace }) {
  const videoRef = useRef(null)

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
      if (videoRef.current) {
        try {
          videoRef.current.pause()
          videoRef.current.removeAttribute('src')
          videoRef.current.load()
        } catch (e) {}
      }
      tauriInvoke('trim_memory').catch(() => {})
    }
  }, [onClose])

  if (!wallpaper) return null

  const typeInfo = getWallpaperTypeInfo(wallpaper)
  const isVideo = typeInfo.type === 'video'
  const isImage = typeInfo.type === 'image'
  const isCanvas = typeInfo.type === 'canvas'

  const isCommunity = Boolean(
    wallpaper.id?.startsWith('community-') ||
    wallpaper.communityMeta ||
    wallpaper.remoteUrl ||
    (wallpaper.tags && wallpaper.tags.includes('community'))
  )
  const isLocal = Boolean(
    wallpaper.localPath && !wallpaper.localPath.startsWith('http')
  ) || (!isCommunity && !wallpaper.config?.streamUrl) || isCanvas || wallpaper.storageStatus === 'downloaded'
  const authorPortfolio = wallpaper.authorPortfolio || wallpaper.communityMeta?.authorPortfolio || wallpaper.author_portfolio || ''
  const license = wallpaper.license || wallpaper.communityMeta?.license || ''

  const videoPath =
    wallpaper.config?.videoPath ||
    wallpaper.videoPath ||
    wallpaper.source ||
    wallpaper.path ||
    wallpaper.config?.path ||
    wallpaper.config?.url ||
    wallpaper.defaultConfig?.videoPath
  const videoSrc = videoPath
    ? (videoPath.startsWith('http') || videoPath.startsWith('data:') ? videoPath : safeConvertFileSrc(videoPath))
    : ''

  const imgPath = wallpaper.config?.imagePath || wallpaper.defaultConfig?.imagePath
  const imgSrc = imgPath
    ? (imgPath.startsWith('http') || imgPath.startsWith('data:') ? imgPath : safeConvertFileSrc(imgPath))
    : resolveWallpaperThumbnail(wallpaper) || wallpaper.preview || ''

  const streamUrl = wallpaper.config?.streamUrl || wallpaper.config?.url || ''
  const ytId = wallpaper.config?.youtubeId || extractYouTubeId(streamUrl)

  return createPortal(
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 99999,
        background: 'rgba(0, 0, 0, 0.84)',
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
          maxWidth: 860,
          background: 'var(--bg-card)',
          border: '1px solid var(--border-main)',
          borderRadius: 14,
          boxShadow: '0 24px 60px rgba(0, 0, 0, 0.75), 0 0 0 1px rgba(255,255,255,0.08)',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          maxHeight: '92vh',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '14px 20px',
            borderBottom: '1px solid var(--border-subtle)',
            background: 'rgba(var(--rgb-card), 0.7)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
            <span
              style={{
                padding: '4px 10px',
                borderRadius: 6,
                fontSize: 11,
                fontWeight: 700,
                background: 'rgba(0,0,0,0.6)',
                color: typeInfo.color,
                border: '1px solid rgba(255,255,255,0.12)',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 5,
              }}
            >
              <typeInfo.icon size={12} />
              <span>{typeInfo.label.toUpperCase()}</span>
            </span>
            {isCommunity && (
              <span
                style={{
                  padding: '4px 10px',
                  borderRadius: 6,
                  fontSize: 11,
                  fontWeight: 700,
                  background: isLocal ? 'rgba(16, 185, 129, 0.22)' : 'rgba(56, 189, 248, 0.22)',
                  color: isLocal ? 'var(--color-emerald)' : 'var(--color-cyan)',
                  border: `1px solid ${isLocal ? 'rgba(16, 185, 129, 0.4)' : 'rgba(56, 189, 248, 0.4)'}`,
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 5,
                }}
              >
                {isLocal ? <HardDrive size={12} /> : <Cloud size={12} />}
                <span>{isLocal ? 'LOCAL (OFFLINE)' : 'CLOUD (STREAM)'}</span>
              </span>
            )}
            <div style={{ minWidth: 0 }}>
              <h3 style={{ margin: 0, fontSize: 15, fontWeight: 600, color: 'var(--text-main)' }} className="truncate">
                {wallpaper.name}
              </h3>
              <p style={{ margin: 0, fontSize: 11.5, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                <span>by</span>
                {authorPortfolio ? (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation()
                      openExternalUrl(authorPortfolio)
                    }}
                    title={`Open portfolio (${authorPortfolio})`}
                    style={{
                      background: 'none', border: 'none', padding: 0,
                      color: 'var(--color-brand)', fontWeight: 600, cursor: 'pointer',
                      display: 'inline-flex', alignItems: 'center', gap: 3,
                      textDecoration: 'underline', textUnderlineOffset: 2,
                      fontSize: 'inherit'
                    }}
                  >
                    {wallpaper.communityMeta?.author || wallpaper.author || 'Anonymous'} <ExternalLink size={11} />
                  </button>
                ) : (
                  <span>{wallpaper.communityMeta?.author || (wallpaper.isCustom ? 'Custom Media' : 'Built-in Canvas Engine')}</span>
                )}
                {license && (
                  <span
                    className="library-tag-chip"
                    style={{ background: 'rgba(255,255,255,0.08)', fontSize: 9.5, padding: '1px 5px' }}
                    title={license}
                  >
                    {license.replace(/ 4\.0| 1\.0/g, '')}
                  </span>
                )}
              </p>
            </div>
          </div>
          <button className="btn-icon" onClick={onClose} style={{ padding: 6 }}>
            <X size={16} />
          </button>
        </div>

        {/* Modal Preview Stage */}
        <div
          style={{
            position: 'relative',
            width: '100%',
            height: '460px',
            background: '#04060a',
            overflow: 'hidden',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          {isVideo && videoSrc ? (
            <video
              ref={videoRef}
              src={videoSrc}
              autoPlay
              loop
              muted
              playsInline
              style={{ width: '100%', height: '100%', objectFit: 'contain' }}
            />
          ) : isCanvas ? (
            <div style={{ width: '100%', height: '100%', position: 'relative' }}>
              <WallpaperPlayer engineId={wallpaper.engine || wallpaper.id} config={wallpaper.config || {}} preview />
            </div>
          ) : ytId ? (
            <div style={{ width: '100%', height: '100%', position: 'relative', overflow: 'hidden' }}>
              <iframe
                src={`https://www.youtube-nocookie.com/embed/${ytId}?autoplay=1&mute=1&controls=0&loop=1&playlist=${ytId}&modestbranding=1&rel=0&iv_load_policy=3&disablekb=1`}
                style={{ width: '100%', height: '100%', border: 'none', pointerEvents: 'none' }}
                allow="autoplay; encrypted-media"
                title={wallpaper.name}
              />
            </div>
          ) : (
            <img
              src={imgSrc}
              alt={wallpaper.name}
              style={{ width: '100%', height: '100%', objectFit: 'contain' }}
            />
          )}
        </div>

        {/* Modal Footer */}
        <div
          style={{
            padding: '14px 20px',
            borderTop: '1px solid var(--border-subtle)',
            background: 'rgba(var(--rgb-card), 0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 14,
          }}
        >
          <div className="flex items-center gap-2">
            {wallpaper.tags && wallpaper.tags.length > 0 ? (
              wallpaper.tags.slice(0, 4).map(t => (
                <span key={t} className="library-tag-chip">
                  #{t}
                </span>
              ))
            ) : (
              <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>High-Definition Desktop Surface</span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {isCommunity && !isLocal && onDownloadOffline && (
              <button
                className="btn btn-secondary"
                onClick={() => onDownloadOffline(wallpaper)}
                style={{ height: 34, fontSize: 12, display: 'inline-flex', alignItems: 'center', gap: 6 }}
              >
                <DownloadCloud size={13} /> Download Offline
              </button>
            )}
            {isCommunity && isLocal && onFreeSpace && (
              <button
                className="btn btn-ghost"
                onClick={() => onFreeSpace(wallpaper.id)}
                style={{ height: 34, fontSize: 12, display: 'inline-flex', alignItems: 'center', gap: 6 }}
                title="Free up local disk space while keeping wallpaper in Library"
              >
                <Cloud size={13} /> Free Space
              </button>
            )}
            <button className="btn btn-ghost" onClick={onClose} style={{ height: 34, fontSize: 12 }}>
              Close
            </button>
            {isLive ? (
              <div
                className="btn btn-success"
                style={{
                  height: 34,
                  fontSize: 12,
                  background: 'color-mix(in srgb, var(--color-emerald) 18%, transparent)',
                  borderColor: 'var(--color-emerald)',
                  color: 'var(--color-emerald)',
                  cursor: 'default',
                }}
              >
                <Check size={13} /> Active on Desktop
              </div>
            ) : (
              <button
                className="btn btn-primary"
                onClick={() => {
                  onApply(wallpaper)
                  onClose()
                }}
                style={{ height: 34, fontSize: 12, padding: '0 16px' }}
              >
                <Play size={13} fill="currentColor" /> Apply to Desktop
              </button>
            )}
          </div>
        </div>
      </div>
    </div>,
    document.body
  )
}

export default function LibraryPage() {
  const installed               = useStore(s => s.installed)
  const currentDesktopWallpaper = useStore(s => s.currentDesktopWallpaper)
  const isWallpaperRunning      = useStore(s => s.isWallpaperRunning)
  const likedWallpaperIds       = useStore(s => s.likedWallpaperIds) || []
  const toggleLikeWallpaper     = useStore(s => s.toggleLikeWallpaper)
  const uninstallItem           = useStore(s => s.uninstallItem)
  const screenArrangement       = useStore(s => s.screenArrangement)
  const monitorWallpapers       = useStore(s => s.monitorWallpapers)
  const homeWallpaperIds        = useStore(s => s.homeWallpaperIds) || []
  const togglePinToHome         = useStore(s => s.togglePinToHome)
  const customNames             = useStore(s => s.customNames) || {}
  const setWallpaperName        = useStore(s => s.setWallpaperName)
  const setActiveWallpaper      = useStore(s => s.setActiveWallpaper)
  const thumbnailMode           = useStore(s => s.thumbnailMode) || 'hover'
  const setThumbnailMode        = useStore(s => s.setThumbnailMode)
  const updateInstalledStorage  = useStore(s => s.updateInstalledStorage)
  const removeLocalCommunityCopy = useStore(s => s.removeLocalCommunityCopy)

  const [monitors, setMonitors] = useState([])
  const [selectedMonitorLabel, setSelectedMonitorLabel] = useState(null)
  const [applyingId, setApplyingId] = useState(null)
  const [hoveredId, setHoveredId]   = useState(null)
  const [downloadingId, setDownloadingId] = useState(null)
  const [downloadProgress, setDownloadProgress] = useState({})
  const [storageNotice, setStorageNotice] = useState(null)

  // Filters, Search, Sort & View Modes
  const [filterCategory, setFilterCategory] = useState('all') // 'all' | 'liked' | 'pinned' | 'builtin' | 'custom' | 'stream'
  const [typeFilter, setTypeFilter]         = useState('all') // 'all' | 'video' | 'image' | 'canvas' | 'stream'
  const [sortBy, setSortBy]                 = useState('recent') // 'recent' | 'name-asc' | 'name-desc' | 'liked'
  const [viewMode, setViewMode]             = useState('grid') // 'grid' | 'list'
  const [searchQuery, setSearchQuery]       = useState('')

  // UI Dropdowns & Context Menus
  const [isAddMenuOpen, setIsAddMenuOpen]   = useState(false)
  const [activeMenuId, setActiveMenuId]     = useState(null)
  const [previewingWallpaper, setPreviewingWallpaper] = useState(null)

  // Modals state
  const [addModal, setAddModal]             = useState({ isOpen: false, path: '', initialName: '' })
  const [batchModal, setBatchModal]         = useState({ isOpen: false, paths: [] })
  const [renameModal, setRenameModal]       = useState({ isOpen: false, id: null, currentName: '' })
  const [addStreamModal, setAddStreamModal] = useState(false)

  // Close open dropdowns on outside click or escape
  useEffect(() => {
    const handleWindowClick = (e) => {
      if (!e.target.closest('.library-context-menu') && !e.target.closest('.library-menu-trigger')) {
        setActiveMenuId(null)
      }
      if (!e.target.closest('.library-split-btn') && !e.target.closest('.library-add-dropdown')) {
        setIsAddMenuOpen(false)
      }
    }
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        setActiveMenuId(null)
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

  // Native Windows Shell thumbnail sync (runs on background OS thread in Rust, zero WebView2 video decoders)
  useEffect(() => {
    let unlistenUpdated
    tauriInvoke('sync_all_custom_video_thumbnails').catch(() => {})

    safeListen('custom_thumbnails_updated', (event) => {
      if (Array.isArray(event?.payload)) {
        const updatedMap = new Map(event.payload.map(i => [i.id, i]))
        useStore.setState(s => ({
          installed: (s.installed || []).map(w => {
            const match = updatedMap.get(w.id)
            if (match && match.thumbnail && match.thumbnail !== w.thumbnail) {
              return { ...w, thumbnail: match.thumbnail }
            }
            return w
          })
        }))
      }
    }).then(fn => { unlistenUpdated = fn })

    return () => {
      if (unlistenUpdated) unlistenUpdated()
    }
  }, [])

  // Fetch monitors
  useEffect(() => {
    let unlistenMonitors
    function loadMonitors() {
      tauriInvoke('get_monitors').then(res => {
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
    }
    loadMonitors()

    safeListen('aether:monitors-changed', () => loadMonitors())
      .then(u => { unlistenMonitors = u }).catch(() => {})

    window.addEventListener('focus', loadMonitors)
    return () => {
      if (unlistenMonitors) unlistenMonitors()
      window.removeEventListener('focus', loadMonitors)
    }
  }, [])

  // Import file handler (supports single and multiple file selection)
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
        if (paths.length === 0) return
        if (paths.length === 1) {
          const path = paths[0]
          const filename = path.split('\\').pop().split('/').pop()
          const cleanName = filename.replace(/\.[^/.]+$/, '')
          setAddModal({ isOpen: true, path, initialName: cleanName })
        } else {
          setBatchModal({ isOpen: true, paths })
        }
      }
    } catch (err) {
      console.error('Failed to open import dialog:', err)
    }
  }

  // Import folder handler (recursively scans directory)
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
              const filename = files[0].split('\\').pop().split('/').pop()
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

  // Drag & drop listener (supports batch drops)
  useEffect(() => {
    let unlistenFn
    safeListen('tauri://drag-drop', event => {
      const paths = event.payload?.paths
      if (!paths || paths.length === 0) return

      const supportedExts = ['png', 'jpg', 'jpeg', 'webp', 'bmp', 'mp4', 'webm', 'ogg', 'mkv', 'avi', 'mov', 'wmv', 'flv']
      const validPaths = paths.filter(p => {
        const ext = p.split('.').pop()?.toLowerCase() || ''
        return supportedExts.includes(ext)
      })

      if (validPaths.length === 0) return
      if (validPaths.length === 1) {
        const path = validPaths[0]
        const filename = path.split('\\').pop().split('/').pop()
        const cleanName = filename.replace(/\.[^/.]+$/, '')
        setAddModal({ isOpen: true, path, initialName: cleanName })
      } else {
        setBatchModal({ isOpen: true, paths: validPaths })
      }
    }).then(u => { unlistenFn = u }).catch(err => console.error(err))

    return () => { if (unlistenFn) unlistenFn() }
  }, [])

  async function handleConfirmAdd({ name, pinToHome }) {
    if (!addModal.path) return
    const newItem = await addCustomMediaWallpaper(addModal.path, name, pinToHome)
    setAddModal({ isOpen: false, path: '', initialName: '' })
    if (newItem) {
      handleApply(newItem)
    }
  }

  function handleConfirmAddStream({ name, url, muted, pinToHome }) {
    const newItem = addCustomStreamWallpaper(url, name, muted, pinToHome)
    setAddStreamModal(false)
    if (newItem) {
      handleApply(newItem)
    }
  }

  function handleConfirmRename(newName) {
    if (!renameModal.id) return
    setWallpaperName(renameModal.id, newName)
    setRenameModal({ isOpen: false, id: null, currentName: '' })
  }

  async function handleApply(item, targetMon = null) {
    setApplyingId(item.id)
    try {
      setActiveWallpaper(item)
      const mon = targetMon ?? (screenArrangement === 'per-screen' ? selectedMonitorLabel : null)
      await applyWallpaperToDesktop(item, { targetMonitor: mon })
    } finally {
      setApplyingId(null)
    }
  }

  const handleDownloadOffline = async (item) => {
    if (!item) return
    const typeInfo = getWallpaperTypeInfo(item)
    if (typeInfo.type === 'canvas') {
      updateInstalledStorage(item.id, {
        localPath: 'builtin:canvas',
        storageStatus: 'downloaded',
        fileSize: 0,
      })
      setStorageNotice({ type: 'success', message: `"${item.name}" saved for 100% offline playback!` })
      setTimeout(() => setStorageNotice(null), 4000)
      return
    }
    setDownloadingId(item.id)
    try {
      setStorageNotice({ type: 'info', message: `Downloading "${item.name}" for offline use…` })
      const res = await downloadCommunityWallpaper(item, (p) => {
        setDownloadProgress(prev => ({ ...prev, [item.id]: p.progress }))
      })
      if (res?.localPath) {
        updateInstalledStorage(item.id, {
          localPath: res.localPath,
          storageStatus: 'cached',
          fileSize: res.fileSize,
        })
        setStorageNotice({ type: 'success', message: `Cached "${item.name}" locally (${(res.fileSize / (1024 * 1024)).toFixed(1)} MB). Ready offline!` })
      }
    } catch (err) {
      setStorageNotice({ type: 'error', message: `Download failed: ${err.message || err}` })
    } finally {
      setDownloadingId(null)
      setTimeout(() => setStorageNotice(null), 4000)
    }
  }

  const handleFreeSpace = async (itemId) => {
    const target = (installed || []).find(i => i.id === itemId)
    const name = target?.name || 'wallpaper'
    const success = await removeLocalCommunityCopy(itemId)
    if (success) {
      setStorageNotice({ type: 'success', message: `Freed local disk space for "${name}". Kept in Library as cloud stream.` })
      setTimeout(() => setStorageNotice(null), 4000)
    }
  }

  function getActiveStatus(item) {
    if (!isWallpaperRunning || !item) return null
    if (screenArrangement === 'per-screen') {
      const activeScreens = Object.entries(monitorWallpapers || {})
        .filter(([_, wp]) => wp?.id === item.id)
        .map(([monLabel]) => {
          const idx = monitors.findIndex(m => m.label === monLabel)
          return idx >= 0 ? `Screen ${idx + 1}` : 'Screen'
        })
      return activeScreens.length > 0 ? activeScreens : null
    }
    return currentDesktopWallpaper?.id === item.id ? ['all'] : null
  }

  // Liked lookup helper that handles original IDs, community- prefixes, and builtins
  const isWallpaperLiked = useCallback((w) => {
    if (!w) return false
    const likedSet = new Set(likedWallpaperIds || [])
    const altId = w.id?.startsWith('community-') ? w.id.replace(/^community-/, '') : `community-${w.id}`
    const origId = w.communityMeta?.originalId
    return likedSet.has(w.id) || likedSet.has(altId) || (Boolean(origId) && likedSet.has(origId))
  }, [likedWallpaperIds])

  // Combine All Wallpapers (Built-in + Custom)
  const allWallpapers = useMemo(() => {
    const names = customNames || {}
    const builtins = WALLPAPER_LIST.map((w, idx) => ({
      id: w.id,
      name: names[w.id] || w.name,
      engine: w.id,
      tags: w.tags || ['canvas'],
      config: w.defaultConfig || {},
      isCustom: false,
      builtin: true,
      installedAt: 1000 - idx,
    }))

    const customs = (installed || [])
      .filter(i => i && (i.type === 'wallpaper' || i.type === 'engine' || i.isCustom || Boolean(i.engine)))
      .map((i, idx) => ({
        ...i,
        name: names[i.id] || i.name,
        engine: i.engine || (i.mediaType === 'canvas' ? i.source?.replace('engine:', '') : 'video-player'),
        isCustom: true,
        installedAt: i.installedAt || (Date.now() - idx * 1000),
      }))

    return [...customs, ...builtins]
  }, [installed, customNames])

  // Filtered & Sorted Wallpapers
  const filteredWallpapers = useMemo(() => {
    const pinnedSet = new Set(homeWallpaperIds || [])

    let list = allWallpapers.filter(w => {
      const isPinned = pinnedSet.has(w.id)
      const isLiked = isWallpaperLiked(w)
      const typeInfo = getWallpaperTypeInfo(w)

      // Category Pill Filters
      if (filterCategory === 'liked' && !isLiked) return false
      if (filterCategory === 'pinned' && !isPinned) return false
      if (filterCategory === 'video' && typeInfo.type !== 'video') return false
      if (filterCategory === 'image' && typeInfo.type !== 'image') return false
      if (filterCategory === 'builtin' && w.isCustom) return false
      if (filterCategory === 'custom' && (!w.isCustom || w.config?.streamUrl || typeInfo.type === 'canvas')) return false
      if (filterCategory === 'stream' && !w.config?.streamUrl) return false
      if (filterCategory === 'procedural' && typeInfo.type !== 'canvas') return false

      // Type Filter Dropdown
      if (typeFilter !== 'all') {
        if (typeFilter === 'video' && typeInfo.type !== 'video') return false
        if (typeFilter === 'image' && typeInfo.type !== 'image') return false
        if (typeFilter === 'canvas' && typeInfo.type !== 'canvas') return false
        if (typeFilter === 'stream' && typeInfo.type !== 'stream' && typeInfo.type !== 'youtube') return false
      }

      // Search Query
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase()
        const matchName = (w.name || '').toLowerCase().includes(query)
        const matchAuthor = (w.communityMeta?.author || '').toLowerCase().includes(query)
        const matchTag = w.tags?.some(t => t.toLowerCase().includes(query))
        return matchName || matchAuthor || matchTag
      }
      return true
    })

    // Sort order
    if (sortBy === 'recent') {
      list.sort((a, b) => {
        const aTime = a.installedAt || (a.isCustom ? 1 : 0)
        const bTime = b.installedAt || (b.isCustom ? 1 : 0)
        return bTime - aTime
      })
    } else if (sortBy === 'name-asc') {
      list.sort((a, b) => (a.name || '').localeCompare(b.name || ''))
    } else if (sortBy === 'name-desc') {
      list.sort((a, b) => (b.name || '').localeCompare(a.name || ''))
    } else if (sortBy === 'liked') {
      list.sort((a, b) => {
        const aLiked = isWallpaperLiked(a) ? 1 : 0
        const bLiked = isWallpaperLiked(b) ? 1 : 0
        return bLiked - aLiked
      })
    }

    return list
  }, [allWallpapers, filterCategory, typeFilter, sortBy, searchQuery, homeWallpaperIds, isWallpaperLiked])

  const storageTelemetry = useMemo(() => {
    let localCount = 0
    let localBytes = 0
    let cloudCount = 0

    for (const item of installed || []) {
      if (item.type !== 'wallpaper') continue
      const isCommunity = Boolean(item.communityMeta || item.source === 'community')
      if (!isCommunity) continue

      if (item.storageStatus === 'cached' || item.localPath) {
        localCount++
        localBytes += (item.fileSize || 30 * 1024 * 1024)
      } else {
        cloudCount++
      }
    }

    const localMb = (localBytes / (1024 * 1024)).toFixed(1)
    const savedGb = ((cloudCount * 35) / 1024).toFixed(2)

    return {
      hasCommunityItems: (localCount + cloudCount) > 0,
      localCount,
      localMb,
      cloudCount,
      savedGb,
    }
  }, [installed])


  return (
    <div className="library-page-container animate-fadeIn">
      {/* ── Top Header Bar ────────────────────────────────────────────────────── */}
      <div className="library-header">
        <div>
          <h1 className="library-title">Wallpaper Library</h1>
          <p className="library-subtitle">Your collection. Make your desktop feel alive.</p>
        </div>

        <div className="flex items-center gap-3">
          <span style={{ fontSize: 12.5, color: 'var(--text-muted)', fontWeight: 500 }}>
            {allWallpapers.length} wallpapers
          </span>

          {/* Split Add Button matching reference */}
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

      {/* ── Storage Action Notification Banner ───────────────────────────────── */}
      {storageNotice && (
        <div
          style={{
            marginBottom: 14,
            padding: '9px 16px',
            borderRadius: 8,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            fontSize: 12.5,
            fontWeight: 500,
            background: storageNotice.type === 'error' ? 'rgba(239, 68, 68, 0.15)' : 'rgba(16, 185, 129, 0.15)',
            border: `1px solid ${storageNotice.type === 'error' ? 'rgba(239, 68, 68, 0.35)' : 'rgba(16, 185, 129, 0.35)'}`,
            color: storageNotice.type === 'error' ? 'var(--color-rose)' : 'var(--color-emerald)',
          }}
        >
          <span>{storageNotice.message}</span>
          <button className="btn-icon" onClick={() => setStorageNotice(null)} style={{ padding: 2 }}>
            <X size={13} />
          </button>
        </div>
      )}

      {/* ── Storage Telemetry Header ─────────────────────────────────────────── */}
      {storageTelemetry.hasCommunityItems && (
        <div
          style={{
            marginBottom: 16,
            padding: '10px 16px',
            borderRadius: 9,
            background: 'rgba(var(--rgb-card), 0.65)',
            border: '1px solid var(--border-subtle)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: 12,
            fontSize: 12,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--color-emerald)' }}>
              <HardDrive size={14} />
              <span style={{ fontWeight: 600, color: 'var(--text-main)' }}>Local Storage:</span>
              <span>{storageTelemetry.localMb} MB ({storageTelemetry.localCount} item{storageTelemetry.localCount === 1 ? '' : 's'})</span>
            </div>
            <span style={{ color: 'var(--border-subtle)' }}>•</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--color-cyan)' }}>
              <Cloud size={14} />
              <span style={{ fontWeight: 600, color: 'var(--text-main)' }}>Cloud Stream:</span>
              <span>{storageTelemetry.cloudCount} item{storageTelemetry.cloudCount === 1 ? '' : 's'} (~{storageTelemetry.savedGb} GB drive space saved)</span>
            </div>
          </div>
          <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
            Manage offline availability per item or change default behavior in Settings
          </span>
        </div>
      )}

      {/* ── Multi-Monitor Target Screen Bar ───────────────────────────────────── */}
      {screenArrangement === 'per-screen' && monitors.length > 1 && (
        <div
          style={{
            marginBottom: 16,
            padding: '10px 14px',
            background: 'var(--bg-card)',
            border: '1px solid var(--border-subtle)',
            borderRadius: 8,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: 10,
          }}
        >
          <div className="flex items-center gap-2">
            <Monitor size={14} className="text-brand" />
            <span className="text-xs font-semibold uppercase tracking-wider text-muted">Target Screen:</span>
          </div>
          <div className="flex gap-2">
            {monitors.map((m, i) => {
              const isSelected = selectedMonitorLabel === m.label
              const monWp = monitorWallpapers?.[m.label]
              return (
                <button
                  key={m.label}
                  className={`btn ${isSelected ? 'btn-primary' : 'btn-ghost'}`}
                  style={{ padding: '4px 10px', fontSize: 11.5, height: 'auto', borderRadius: 6 }}
                  onClick={() => setSelectedMonitorLabel(m.label)}
                >
                  Screen {i + 1} {monWp ? `(${monWp.name})` : ''}
                </button>
              )
            })}
          </div>
        </div>
      )}

      {/* ── Integrated Toolbar (Two Rows) ─────────────────────────────────────── */}
      <div className="library-toolbar">
        {/* Row 1: Search, Type Dropdown, Sort Dropdown, View Switcher */}
        <div className="library-toolbar-row1">
          <div className="library-search-box">
            <Search
              size={14}
              style={{ position: 'absolute', left: 12, color: 'var(--text-muted)', pointerEvents: 'none' }}
            />
            <input
              type="text"
              className="library-search-input"
              placeholder="Search wallpapers by title, creator, or tags..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
            />
            {searchQuery && (
              <button
                className="btn-icon"
                style={{ position: 'absolute', right: 8, padding: 2 }}
                onClick={() => setSearchQuery('')}
              >
                <X size={13} />
              </button>
            )}
          </div>

          <select
            className="library-select"
            value={typeFilter}
            onChange={e => setTypeFilter(e.target.value)}
            title="Filter by media type"
          >
            <option value="all">All Types</option>
            <option value="video">Videos</option>
            <option value="image">Pictures</option>
            <option value="canvas">Canvas 2D</option>
            <option value="stream">Web Streams</option>
          </select>

          <select
            className="library-select"
            value={sortBy}
            onChange={e => setSortBy(e.target.value)}
            title="Sort order"
          >
            <option value="recent">Sort: Recently Added</option>
            <option value="name-asc">Sort: Name (A-Z)</option>
            <option value="name-desc">Sort: Name (Z-A)</option>
            <option value="liked">Sort: Most Liked</option>
          </select>

          <div className="library-view-switcher">
            <button
              className={`library-view-btn ${viewMode === 'grid' ? 'active' : ''}`}
              onClick={() => setViewMode('grid')}
              title="Grid View"
            >
              <LayoutGrid size={15} />
            </button>
            <button
              className={`library-view-btn ${viewMode === 'list' ? 'active' : ''}`}
              onClick={() => setViewMode('list')}
              title="Compact List View"
            >
              <List size={15} />
            </button>
          </div>
        </div>

        {/* Row 2: Category Filter Pills */}
        <div className="library-pills-row">
          {[
            { id: 'all', label: 'All', count: allWallpapers.length },
            { id: 'liked', label: 'Liked', count: allWallpapers.filter(w => isWallpaperLiked(w)).length, icon: Heart },
            { id: 'pinned', label: 'Pinned', count: homeWallpaperIds.length, icon: Pin },
            { id: 'video', label: 'Videos', count: allWallpapers.filter(w => getWallpaperTypeInfo(w).type === 'video').length, icon: Video },
            { id: 'image', label: 'Pictures', count: allWallpapers.filter(w => getWallpaperTypeInfo(w).type === 'image').length, icon: ImageIcon },
            { id: 'procedural', label: 'Procedural', count: allWallpapers.filter(w => getWallpaperTypeInfo(w).type === 'canvas').length, icon: Sparkles },
            { id: 'stream', label: 'Web Streams', count: allWallpapers.filter(w => w.config?.streamUrl).length, icon: Globe },
            { id: 'builtin', label: 'Built-in', count: WALLPAPER_LIST.length },
            { id: 'custom', label: 'Custom Media', count: allWallpapers.filter(w => w.isCustom && !w.config?.streamUrl && getWallpaperTypeInfo(w).type !== 'canvas').length },
          ].map(cat => {
            const isActive = filterCategory === cat.id
            const Icon = cat.icon
            return (
              <button
                key={cat.id}
                className={`library-pill-btn ${isActive ? 'active' : ''}`}
                onClick={() => setFilterCategory(cat.id)}
              >
                {Icon && <Icon size={12} fill={isActive && cat.id === 'liked' ? 'currentColor' : 'none'} />}
                <span>{cat.label}</span>
                <span className="library-pill-count">{cat.count}</span>
              </button>
            )
          })}
        </div>
      </div>

      {/* ── Empty State ───────────────────────────────────────────────────────── */}
      {filteredWallpapers.length === 0 ? (
        <div
          className="card"
          style={{
            padding: 56,
            textAlign: 'center',
            color: 'var(--text-subtle)',
            margin: '20px 0 40px',
            border: '1.5px dashed var(--border-main)',
            background: 'transparent',
            borderRadius: 14,
          }}
        >
          <Search size={28} className="text-brand" style={{ margin: '0 auto 12px', opacity: 0.7 }} />
          <div className="text-base font-semibold" style={{ color: 'var(--text-main)', marginBottom: 4 }}>
            No wallpapers match your filter
          </div>
          <p className="text-xs text-muted" style={{ maxWidth: 380, margin: '0 auto 18px' }}>
            Try resetting your search query or switching to another category pill to view wallpapers.
          </p>
          <button
            className="btn btn-ghost"
            style={{ margin: '0 auto', fontSize: 12.5 }}
            onClick={() => { setSearchQuery(''); setFilterCategory('all'); setTypeFilter('all'); }}
          >
            Reset Filters
          </button>
        </div>
      ) : viewMode === 'grid' ? (
        /* ── Sovereign Uniform Wallpaper Grid (Continuous Artwork Card System) ───────── */
        <div className="library-editorial-grid">
          {filteredWallpapers.map(item => {
            const isLive = Boolean(getActiveStatus(item))
            return (
              <WallpaperCard
                key={item.id}
                wallpaper={item}
                isFeatured={false}
                isLive={isLive}
                isLiked={isWallpaperLiked(item)}
                isPinned={homeWallpaperIds.includes(item.id)}
                isApplying={applyingId === item.id}
                thumbnailMode={thumbnailMode}
                onApply={handleApply}
                onPreview={setPreviewingWallpaper}
                onToggleLike={toggleLikeWallpaper}
                onTogglePin={togglePinToHome}
                onRename={(id, name) => setRenameModal({ isOpen: true, id, currentName: name })}
                onDelete={(id) => {
                  if (isLive) handleStop()
                  uninstallItem(id)
                }}
                onDownloadOffline={handleDownloadOffline}
                onFreeSpace={handleFreeSpace}
              />
            )
          })}
        </div>
      ) : (
        /* ── Compact List View ────────────────────────────────────────────────── */
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 40 }}>
          {filteredWallpapers.map(item => {
            const activeStatus = getActiveStatus(item)
            const isLive = Boolean(activeStatus)
            const isApplying = applyingId === item.id
            const isPinned = homeWallpaperIds.includes(item.id)
            const isLiked = isWallpaperLiked(item)
            const typeInfo = getWallpaperTypeInfo(item)
            const isCommunity = Boolean(item.communityMeta || item.source === 'community')
            const isLocal = !isCommunity || item.storageStatus === 'cached' || item.storageStatus === 'downloaded' || Boolean(item.localPath) || typeInfo.type === 'canvas'

            return (
              <div
                key={item.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 16,
                  padding: '10px 16px',
                  background: 'var(--bg-card)',
                  border: isLive ? '1px solid var(--color-emerald)' : '1px solid var(--border-subtle)',
                  borderRadius: 10,
                  transition: 'border-color 0.15s ease',
                }}
              >
                {/* Mini Thumbnail */}
                <div
                  style={{
                    width: 68,
                    height: 42,
                    borderRadius: 6,
                    overflow: 'hidden',
                    position: 'relative',
                    flexShrink: 0,
                    background: '#0a0d14',
                    cursor: 'pointer',
                  }}
                  onClick={() => setPreviewingWallpaper(item)}
                >
                  <WallpaperThumbnail wallpaper={item} isHovered={false} mode="off" />
                </div>

                {/* Info */}
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <h4 style={{ margin: 0, fontSize: 13.5, fontWeight: 600, color: 'var(--text-main)' }} className="truncate">
                      {item.name}
                    </h4>
                    <span
                      style={{
                        padding: '1px 6px',
                        borderRadius: 4,
                        fontSize: 9.5,
                        fontWeight: 700,
                        background: 'rgba(0,0,0,0.5)',
                        color: typeInfo.color,
                        border: '1px solid rgba(255,255,255,0.1)',
                      }}
                    >
                      {typeInfo.label.toUpperCase()}
                    </span>
                    {isCommunity && (
                      <span
                        style={{
                          padding: '1px 6px',
                          borderRadius: 4,
                          fontSize: 9.5,
                          fontWeight: 700,
                          background: isLocal ? 'rgba(16, 185, 129, 0.2)' : 'rgba(56, 189, 248, 0.2)',
                          color: isLocal ? 'var(--color-emerald)' : 'var(--color-cyan)',
                          border: `1px solid ${isLocal ? 'rgba(16, 185, 129, 0.35)' : 'rgba(56, 189, 248, 0.35)'}`,
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 3,
                        }}
                      >
                        {isLocal ? <HardDrive size={10} /> : <Cloud size={10} />}
                        <span>{isLocal ? 'LOCAL' : 'CLOUD'}</span>
                      </span>
                    )}
                    {isLive && (
                      <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--color-emerald)' }}>
                        ● LIVE
                      </span>
                    )}
                  </div>
                  <div style={{ fontSize: 11.5, color: 'var(--text-muted)', marginTop: 2 }}>
                    {item.communityMeta?.author ? `by ${item.communityMeta.author}` : item.isCustom ? 'Custom Media' : 'Built-in Canvas'}
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-2">
                  {isCommunity && !isLocal && (
                    <button
                      className="btn btn-ghost"
                      onClick={() => handleDownloadOffline(item)}
                      disabled={downloadingId === item.id}
                      title="Download wallpaper to keep offline"
                      style={{ height: 30, fontSize: 11.5, padding: '0 8px', color: 'var(--color-cyan)' }}
                    >
                      <DownloadCloud size={12} /> {downloadingId === item.id ? `${downloadProgress[item.id] || 0}%` : 'Download'}
                    </button>
                  )}
                  {isCommunity && isLocal && (
                    <button
                      className="btn btn-ghost"
                      onClick={() => handleFreeSpace(item.id)}
                      title="Free up local disk space (keeps in Library as stream)"
                      style={{ height: 30, fontSize: 11.5, padding: '0 8px' }}
                    >
                      <Cloud size={12} /> Free Space
                    </button>
                  )}
                  <button
                    className="btn-icon"
                    title={isLiked ? 'Unlike' : 'Like'}
                    onClick={() => toggleLikeWallpaper(item.id)}
                    style={{ color: isLiked ? 'var(--color-rose)' : 'var(--text-muted)' }}
                  >
                    <Heart size={14} fill={isLiked ? 'currentColor' : 'none'} />
                  </button>
                  <button
                    className="btn-icon"
                    title={isPinned ? 'Unpin' : 'Pin'}
                    onClick={() => togglePinToHome(item.id)}
                    style={{ color: isPinned ? 'var(--color-brand)' : 'var(--text-muted)' }}
                  >
                    <Pin size={14} fill={isPinned ? 'currentColor' : 'none'} />
                  </button>
                  <button
                    className="btn btn-ghost"
                    onClick={() => setPreviewingWallpaper(item)}
                    style={{ height: 30, fontSize: 11.5, padding: '0 10px' }}
                  >
                    <Eye size={12} /> Preview
                  </button>
                  {isLive ? (
                    <div
                      className="btn btn-success"
                      style={{
                        height: 30,
                        fontSize: 11.5,
                        padding: '0 12px',
                        background: 'color-mix(in srgb, var(--color-emerald) 15%, transparent)',
                        borderColor: 'var(--color-emerald)',
                        color: 'var(--color-emerald)',
                        cursor: 'default',
                      }}
                    >
                      <Check size={12} /> Active
                    </div>
                  ) : (
                    <button
                      className="btn btn-primary"
                      onClick={() => handleApply(item)}
                      disabled={isApplying}
                      style={{ height: 30, fontSize: 11.5, padding: '0 12px' }}
                    >
                      <Play size={11} fill="currentColor" /> Apply
                    </button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* ── Modals ───────────────────────────────────────────────────────────── */}
      {previewingWallpaper && (
        <LibraryPreviewModal
          wallpaper={previewingWallpaper}
          onClose={() => setPreviewingWallpaper(null)}
          onApply={handleApply}
          isLive={Boolean(getActiveStatus(previewingWallpaper))}
          onDownloadOffline={handleDownloadOffline}
          onFreeSpace={handleFreeSpace}
        />
      )}

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
    </div>
  )
}
