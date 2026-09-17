import React, { useState, useEffect, useMemo, useRef } from 'react'
import { createPortal } from 'react-dom'
import {
  Trash2, Play, Image as ImageIcon, Plus, Video, Monitor, Check,
  Pin, PinOff, Pencil, Search, X, Globe, Heart, ChevronDown,
  LayoutGrid, List, Sparkles, Terminal, Waves, Compass, Flame,
  CloudRain, Activity, Code, ExternalLink, MoreHorizontal, Eye
} from 'lucide-react'
import { useStore } from '../store/useStore.js'
import { WALLPAPER_LIST } from '../engines/index.js'
import WallpaperPlayer from '../components/WallpaperPlayer/index.jsx'
import WallpaperThumbnail, { resolveWallpaperThumbnail } from '../components/WallpaperThumbnail/index.jsx'
import { AddWallpaperModal, RenameWallpaperModal, AddWebStreamModal } from '../components/Modals/WallpaperModals.jsx'
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
  const isStream = engineId === 'web-stream' || Boolean(wallpaper.config?.streamUrl)
  const isImage = engineId === 'image-player' || wallpaper.mediaType === 'image' || Boolean(wallpaper.config?.imagePath && !wallpaper.config?.videoPath)
  const isVideo = !isImage && !isStream && (wallpaper.isCustom || engineId === 'video-player' || wallpaper.mediaType === 'video')

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
function LibraryPreviewModal({ wallpaper, onClose, onApply, isLive }) {
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

  const videoPath = wallpaper.config?.videoPath || wallpaper.defaultConfig?.videoPath
  const videoSrc = videoPath
    ? (videoPath.startsWith('http') || videoPath.startsWith('data:') ? videoPath : safeConvertFileSrc(videoPath))
    : ''

  const imgPath = wallpaper.config?.imagePath || wallpaper.defaultConfig?.imagePath
  const imgSrc = imgPath
    ? (imgPath.startsWith('http') || imgPath.startsWith('data:') ? imgPath : safeConvertFileSrc(imgPath))
    : resolveWallpaperThumbnail(wallpaper) || wallpaper.preview || ''

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
            <div style={{ minWidth: 0 }}>
              <h3 style={{ margin: 0, fontSize: 15, fontWeight: 600, color: 'var(--text-main)' }} className="truncate">
                {wallpaper.name}
              </h3>
              <p style={{ margin: 0, fontSize: 11.5, color: 'var(--text-muted)' }}>
                {wallpaper.communityMeta?.author
                  ? `by ${wallpaper.communityMeta.author}`
                  : wallpaper.isCustom
                  ? 'Custom Media'
                  : 'Built-in Canvas Engine'}
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
              <WallpaperPlayer engineId={wallpaper.engine || wallpaper.id} options={wallpaper.config || {}} />
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

  const [monitors, setMonitors] = useState([])
  const [selectedMonitorLabel, setSelectedMonitorLabel] = useState(null)
  const [applyingId, setApplyingId] = useState(null)
  const [hoveredId, setHoveredId]   = useState(null)

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

  // Import file handler
  const handleOpenImportDialog = async () => {
    setIsAddMenuOpen(false)
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

  // Drag & drop listener
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

  // Combine All Wallpapers (Built-in + Custom)
  const allWallpapers = useMemo(() => {
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
      .filter(i => i && i.type === 'wallpaper')
      .map(i => ({
        ...i,
        name: names[i.id] || i.name,
        engine: i.engine || 'video-player',
        isCustom: true,
      }))

    return [...customs, ...builtins]
  }, [installed, customNames])

  // Filtered & Sorted Wallpapers
  const filteredWallpapers = useMemo(() => {
    const pinnedSet = new Set(homeWallpaperIds || [])
    const likedSet = new Set(likedWallpaperIds || [])

    let list = allWallpapers.filter(w => {
      const isPinned = pinnedSet.has(w.id)
      const isLiked = likedSet.has(w.id)
      const typeInfo = getWallpaperTypeInfo(w)

      // Category Pill Filters
      if (filterCategory === 'liked' && !isLiked) return false
      if (filterCategory === 'pinned' && !isPinned) return false
      if (filterCategory === 'builtin' && w.isCustom) return false
      if (filterCategory === 'custom' && (!w.isCustom || w.config?.streamUrl)) return false
      if (filterCategory === 'stream' && !w.config?.streamUrl) return false

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
    if (sortBy === 'name-asc') {
      list.sort((a, b) => (a.name || '').localeCompare(b.name || ''))
    } else if (sortBy === 'name-desc') {
      list.sort((a, b) => (b.name || '').localeCompare(a.name || ''))
    } else if (sortBy === 'liked') {
      list.sort((a, b) => {
        const aLiked = likedSet.has(a.id) ? 1 : 0
        const bLiked = likedSet.has(b.id) ? 1 : 0
        return bLiked - aLiked
      })
    }

    return list
  }, [allWallpapers, filterCategory, typeFilter, sortBy, searchQuery, homeWallpaperIds, likedWallpaperIds])

  // Split out first item for the featured asymmetric hero card if in grid mode and >= 1 item
  const featuredItem = (viewMode === 'grid' && filteredWallpapers.length > 0) ? filteredWallpapers[0] : null
  const standardItems = (viewMode === 'grid' && filteredWallpapers.length > 0) ? filteredWallpapers.slice(1) : filteredWallpapers

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
                  <Plus size={13} /> Add Local Wallpaper
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
            { id: 'liked', label: 'Liked', count: allWallpapers.filter(w => (likedWallpaperIds || []).includes(w.id)).length, icon: Heart },
            { id: 'pinned', label: 'Pinned', count: homeWallpaperIds.length, icon: Pin },
            { id: 'builtin', label: 'Built-in', count: WALLPAPER_LIST.length },
            { id: 'custom', label: 'Custom Media', count: allWallpapers.filter(w => w.isCustom && !w.config?.streamUrl).length },
            { id: 'stream', label: 'Web Streams', count: allWallpapers.filter(w => w.config?.streamUrl).length },
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
        /* ── Asymmetric Editorial Grid (Matching Reference) ──────────────────── */
        <div className="library-editorial-grid">
          {/* Featured Hero Card (Item 1, Spans 2 Columns in Row 1) */}
          {featuredItem && (() => {
            const activeStatus = getActiveStatus(featuredItem)
            const isLive = Boolean(activeStatus)
            const isApplying = applyingId === featuredItem.id
            const isPinned = homeWallpaperIds.includes(featuredItem.id)
            const isLiked = (likedWallpaperIds || []).includes(featuredItem.id)
            const typeInfo = getWallpaperTypeInfo(featuredItem)

            return (
              <div
                key={featuredItem.id}
                className="library-featured-card"
                onMouseEnter={() => setHoveredId(featuredItem.id)}
                onMouseLeave={() => setHoveredId(null)}
              >
                {/* Upper Panoramic Thumbnail with Overlays */}
                <div
                  className="library-featured-thumb-container"
                  onClick={() => setPreviewingWallpaper(featuredItem)}
                  title="Click to open full preview"
                >
                  <WallpaperThumbnail
                    wallpaper={featuredItem}
                    isHovered={hoveredId === featuredItem.id}
                    mode={thumbnailMode}
                  />

                  {/* Top-Left Media Type Badge */}
                  <div className="library-card-badge-tl">
                    <div className="library-glass-pill" style={{ color: typeInfo.color }}>
                      <typeInfo.icon size={11} />
                      <span>{typeInfo.label.toUpperCase()}</span>
                    </div>
                  </div>

                  {/* Top-Right Heart & Context Menu */}
                  <div className="library-card-badge-tr">
                    <button
                      className="library-icon-btn"
                      title={isLiked ? 'Unlike' : 'Like'}
                      onClick={(e) => {
                        e.stopPropagation()
                        toggleLikeWallpaper(featuredItem.id)
                      }}
                      style={{ color: isLiked ? 'var(--color-rose)' : 'inherit' }}
                    >
                      <Heart size={13} fill={isLiked ? 'currentColor' : 'none'} />
                    </button>

                    <div style={{ position: 'relative' }}>
                      <button
                        className="library-icon-btn library-menu-trigger"
                        title="More options"
                        onClick={(e) => {
                          e.stopPropagation()
                          setActiveMenuId(activeMenuId === featuredItem.id ? null : featuredItem.id)
                        }}
                      >
                        <MoreHorizontal size={13} />
                      </button>

                      {activeMenuId === featuredItem.id && (
                        <div className="library-context-menu" onClick={e => e.stopPropagation()}>
                          <button
                            className="library-context-item"
                            onClick={() => {
                              togglePinToHome(featuredItem.id)
                              setActiveMenuId(null)
                            }}
                          >
                            <Pin size={12} /> {isPinned ? 'Unpin from Home' : 'Pin to Home'}
                          </button>
                          <button
                            className="library-context-item"
                            onClick={() => {
                              setRenameModal({ isOpen: true, id: featuredItem.id, currentName: featuredItem.name })
                              setActiveMenuId(null)
                            }}
                          >
                            <Pencil size={12} /> Rename
                          </button>
                          {featuredItem.isCustom && (
                            <button
                              className="library-context-item danger"
                              onClick={() => {
                                if (isLive) handleStop()
                                uninstallItem(featuredItem.id)
                                setActiveMenuId(null)
                              }}
                            >
                              <Trash2 size={12} /> Delete
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Hover Overlay with Preview & Apply Actions */}
                  <div className="library-card-hover-overlay" onClick={e => e.stopPropagation()}>
                    <button
                      className="library-hover-action-preview"
                      onClick={() => setPreviewingWallpaper(featuredItem)}
                    >
                      <Eye size={13} /> Preview
                    </button>
                    <button
                      className="library-hover-action-apply"
                      onClick={() => handleApply(featuredItem)}
                      disabled={isApplying}
                    >
                      <Play size={13} fill="currentColor" /> {isApplying ? 'Applying…' : 'Apply to Desktop'}
                    </button>
                  </div>
                </div>

                {/* Bottom Featured Footer */}
                <div className="library-featured-footer">
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <h3
                      className="library-card-title"
                      style={{ fontSize: 15, marginBottom: 2 }}
                      title={featuredItem.name}
                    >
                      {featuredItem.name}
                    </h3>
                    <div className="library-card-creator">
                      {featuredItem.communityMeta?.author
                        ? `by ${featuredItem.communityMeta.author}`
                        : featuredItem.isCustom
                        ? `Custom ${typeInfo.label}`
                        : `Built-in Canvas Engine`}
                    </div>
                    <div className="library-card-tags">
                      {featuredItem.tags && featuredItem.tags.length > 0 ? (
                        featuredItem.tags.slice(0, 3).map(t => (
                          <span key={t} className="library-tag-chip">
                            #{t}
                          </span>
                        ))
                      ) : (
                        <span className="library-tag-chip">#featured</span>
                      )}
                    </div>
                  </div>

                  <div>
                    {isLive ? (
                      <div
                        className="btn btn-success"
                        style={{
                          height: 32,
                          fontSize: 12,
                          padding: '0 14px',
                          background: 'color-mix(in srgb, var(--color-emerald) 18%, transparent)',
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
                        onClick={() => handleApply(featuredItem)}
                        disabled={isApplying}
                        style={{ height: 32, fontSize: 12, padding: '0 16px', borderRadius: 999 }}
                      >
                        <Play size={11} fill="currentColor" /> {isApplying ? '…' : 'Apply'}
                      </button>
                    )}
                  </div>
                </div>
              </div>
            )
          })()}

          {/* Standard Cards (Cols 3 & 4 in Row 1, and all subsequent rows) */}
          {standardItems.map(item => {
            const activeStatus = getActiveStatus(item)
            const isLive = Boolean(activeStatus)
            const isApplying = applyingId === item.id
            const isPinned = homeWallpaperIds.includes(item.id)
            const isLiked = (likedWallpaperIds || []).includes(item.id)
            const typeInfo = getWallpaperTypeInfo(item)

            return (
              <div
                key={item.id}
                className="library-standard-card"
                onMouseEnter={() => setHoveredId(item.id)}
                onMouseLeave={() => setHoveredId(null)}
              >
                {/* Artwork Area */}
                <div
                  className="library-card-thumb-container"
                  onClick={() => setPreviewingWallpaper(item)}
                  title="Click to preview"
                >
                  <WallpaperThumbnail
                    wallpaper={item}
                    isHovered={hoveredId === item.id}
                    mode={thumbnailMode}
                  />

                  {/* Top-Left Badge */}
                  <div className="library-card-badge-tl">
                    <div className="library-glass-pill" style={{ color: typeInfo.color }}>
                      <typeInfo.icon size={10} />
                      <span>{typeInfo.label.toUpperCase()}</span>
                    </div>
                  </div>

                  {/* Top-Right Heart & Context Menu */}
                  <div className="library-card-badge-tr">
                    <button
                      className="library-icon-btn"
                      title={isLiked ? 'Unlike' : 'Like'}
                      onClick={(e) => {
                        e.stopPropagation()
                        toggleLikeWallpaper(item.id)
                      }}
                      style={{ color: isLiked ? 'var(--color-rose)' : 'inherit' }}
                    >
                      <Heart size={12} fill={isLiked ? 'currentColor' : 'none'} />
                    </button>

                    <div style={{ position: 'relative' }}>
                      <button
                        className="library-icon-btn library-menu-trigger"
                        title="More options"
                        onClick={(e) => {
                          e.stopPropagation()
                          setActiveMenuId(activeMenuId === item.id ? null : item.id)
                        }}
                      >
                        <MoreHorizontal size={12} />
                      </button>

                      {activeMenuId === item.id && (
                        <div className="library-context-menu" onClick={e => e.stopPropagation()}>
                          <button
                            className="library-context-item"
                            onClick={() => {
                              togglePinToHome(item.id)
                              setActiveMenuId(null)
                            }}
                          >
                            <Pin size={12} /> {isPinned ? 'Unpin from Home' : 'Pin to Home'}
                          </button>
                          <button
                            className="library-context-item"
                            onClick={() => {
                              setRenameModal({ isOpen: true, id: item.id, currentName: item.name })
                              setActiveMenuId(null)
                            }}
                          >
                            <Pencil size={12} /> Rename
                          </button>
                          {item.isCustom && (
                            <button
                              className="library-context-item danger"
                              onClick={() => {
                                if (isLive) handleStop()
                                uninstallItem(item.id)
                                setActiveMenuId(null)
                              }}
                            >
                              <Trash2 size={12} /> Delete
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Hover Actions Overlay (Preview & Apply to Desktop) */}
                  <div className="library-card-hover-overlay" onClick={e => e.stopPropagation()}>
                    <button
                      className="library-hover-action-preview"
                      onClick={() => setPreviewingWallpaper(item)}
                    >
                      <Eye size={12} /> Preview
                    </button>
                    {isLive ? (
                      <div
                        className="library-hover-action-apply"
                        style={{
                          background: 'var(--color-emerald)',
                          borderColor: 'rgba(255,255,255,0.3)',
                          cursor: 'default',
                        }}
                      >
                        <Check size={12} /> Active on Desktop
                      </div>
                    ) : (
                      <button
                        className="library-hover-action-apply"
                        onClick={() => handleApply(item)}
                        disabled={isApplying}
                      >
                        <Play size={12} fill="currentColor" /> {isApplying ? 'Applying…' : 'Apply to Desktop'}
                      </button>
                    )}
                  </div>
                </div>

                {/* Card Body Information */}
                <div className="library-card-body">
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}>
                    <h3 className="library-card-title" title={item.name}>
                      {item.name}
                    </h3>
                    {isLive && (
                      <span
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 4,
                          fontSize: 9.5,
                          fontWeight: 700,
                          color: 'var(--color-emerald)',
                          background: 'rgba(16, 185, 129, 0.12)',
                          padding: '1px 6px',
                          borderRadius: 4,
                          flexShrink: 0,
                        }}
                      >
                        <span className="status-dot-live" style={{ width: 5, height: 5 }} />
                        ACTIVE
                      </span>
                    )}
                  </div>

                  <div className="library-card-creator">
                    {item.communityMeta?.author
                      ? `by ${item.communityMeta.author}`
                      : item.isCustom
                      ? `Custom ${typeInfo.label}`
                      : `Built-in Engine`}
                  </div>

                  <div className="library-card-tags">
                    {item.tags && item.tags.length > 0 ? (
                      item.tags.slice(0, 3).map(t => (
                        <span key={t} className="library-tag-chip">
                          #{t}
                        </span>
                      ))
                    ) : (
                      <span className="library-tag-chip">#wallpaper</span>
                    )}
                  </div>
                </div>
              </div>
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
            const isLiked = (likedWallpaperIds || []).includes(item.id)
            const typeInfo = getWallpaperTypeInfo(item)

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
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
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
        />
      )}

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
    </div>
  )
}
