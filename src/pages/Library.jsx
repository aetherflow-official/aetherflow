import React, { useState, useEffect, useMemo } from 'react'
import {
  Trash2, Play, Image, Plus, Video, Monitor, Square, Check,
  Zap, Pin, PinOff, Pencil, Search, X, Globe, Heart
} from 'lucide-react'
import { useStore } from '../store/useStore.js'
import { WALLPAPER_LIST } from '../engines/index.js'
import WallpaperPlayer from '../components/WallpaperPlayer/index.jsx'
import WallpaperThumbnail from '../components/WallpaperThumbnail/index.jsx'
import { AddWallpaperModal, RenameWallpaperModal, AddWebStreamModal } from '../components/Modals/WallpaperModals.jsx'
import {
  applyWallpaperToDesktop,
  stopDesktopWallpaper,
  addCustomMediaWallpaper,
  addCustomVideoWallpaper,
  addCustomStreamWallpaper,
  tauriInvoke,
  safeListen,
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
      label: isYt ? 'YouTube' : 'Web Stream',
      color: isYt ? 'var(--color-rose)' : 'var(--color-cyan)',
      type: isYt ? 'youtube' : 'stream',
    }
  }
  if (isImage) {
    return { label: 'Picture', color: 'var(--color-emerald)', type: 'image' }
  }
  if (isVideo) {
    return { label: 'Video', color: 'var(--color-brand)', type: 'video' }
  }
  return { label: 'Canvas 2D', color: 'var(--color-purple)', type: 'canvas' }
}

export default function LibraryPage() {
  const installed            = useStore(s => s.installed)
  const activeWallpaper      = useStore(s => s.activeWallpaper)
  const currentDesktopWallpaper = useStore(s => s.currentDesktopWallpaper)
  const isWallpaperRunning   = useStore(s => s.isWallpaperRunning)
  const likedWallpaperIds    = useStore(s => s.likedWallpaperIds) || []
  const toggleLikeWallpaper  = useStore(s => s.toggleLikeWallpaper)
  const uninstallItem        = useStore(s => s.uninstallItem)
  const screenArrangement    = useStore(s => s.screenArrangement)
  const monitorWallpapers    = useStore(s => s.monitorWallpapers)
  const homeWallpaperIds     = useStore(s => s.homeWallpaperIds) || []
  const togglePinToHome      = useStore(s => s.togglePinToHome)
  const customNames          = useStore(s => s.customNames) || {}
  const setWallpaperName     = useStore(s => s.setWallpaperName)
  const setActiveWallpaper   = useStore(s => s.setActiveWallpaper)
  const thumbnailMode        = useStore(s => s.thumbnailMode) || 'hover'
  const setThumbnailMode     = useStore(s => s.setThumbnailMode)

  const [monitors, setMonitors] = useState([])
  const [selectedMonitorLabel, setSelectedMonitorLabel] = useState(null)
  const [applyingId, setApplyingId] = useState(null)
  const [hoveredId, setHoveredId]   = useState(null)

  // Filters & Search
  const [filterCategory, setFilterCategory] = useState('all') // 'all' | 'liked' | 'pinned' | 'builtin' | 'custom' | 'stream'
  const [searchQuery, setSearchQuery]       = useState('')

  // Modals state
  const [addModal, setAddModal] = useState({ isOpen: false, path: '', initialName: '' })
  const [renameModal, setRenameModal] = useState({ isOpen: false, id: null, currentName: '' })
  const [addStreamModal, setAddStreamModal] = useState(false)

  // Fetch monitors on mount and when display configuration changes
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

  // ── Apply to Desktop ───────────────────────────────────────────────────────
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

  // ── Stop Desktop Wallpaper ─────────────────────────────────────────────────
  async function handleStop(targetMon = null) {
    const mon = targetMon ?? (screenArrangement === 'per-screen' ? selectedMonitorLabel : null)
    await stopDesktopWallpaper(mon)
  }

  // Check if wallpaper is currently active on desktop
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

  // ── Combine All Wallpapers (Built-in + Custom) ───────────────────────────────
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

  const filteredWallpapers = useMemo(() => {
    const pinnedSet = new Set(homeWallpaperIds || [])
    const likedSet = new Set(likedWallpaperIds || [])
    return allWallpapers.filter(w => {
      const isPinned = pinnedSet.has(w.id)
      const isLiked = likedSet.has(w.id)
      if (filterCategory === 'liked' && !isLiked) return false
      if (filterCategory === 'builtin' && w.isCustom) return false
      if (filterCategory === 'custom' && (!w.isCustom || w.config?.streamUrl)) return false
      if (filterCategory === 'stream' && !w.config?.streamUrl) return false
      if (filterCategory === 'pinned' && !isPinned) return false
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase()
        const matchName = w.name.toLowerCase().includes(query)
        const matchTag = w.tags?.some(t => t.toLowerCase().includes(query))
        return matchName || matchTag
      }
      return true
    })
  }, [allWallpapers, filterCategory, searchQuery, homeWallpaperIds, likedWallpaperIds])

  return (
    <div className="content-page-container animate-fadeIn">
      {/* Top Application Header */}
      <div className="content-page-header">
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
            <h1 className="content-page-title">Library</h1>
            <span className="badge font-mono" style={{ fontSize: 11 }}>{allWallpapers.length} items</span>
          </div>
          <p className="content-page-subtitle">
            Master wallpaper repository — organize, preview, and pin to your Home dashboard
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
            <Plus size={14} /> Add Local Wallpaper
          </button>
        </div>
      </div>

      {/* Target Screen Bar (for multi-monitor per-screen arrangement) */}
      {screenArrangement === 'per-screen' && monitors.length > 1 && (
        <div
          style={{
            marginBottom: 18,
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

      {/* Filter and Search Bar */}
      <div style={{ marginBottom: 18 }}>
        <div className="flex items-center justify-between" style={{ marginBottom: 12 }}>
          <div className="flex items-center gap-2">
            <h2 className="font-semibold text-base" style={{ letterSpacing: '-0.2px' }}>
              {filterCategory === 'all' ? 'All Wallpapers' :
               filterCategory === 'liked' ? 'Liked Wallpapers' :
               filterCategory === 'pinned' ? 'Pinned to Home' :
               filterCategory === 'builtin' ? 'Built-in Canvas Engines' :
               filterCategory === 'custom' ? 'Custom Media' : 'Web Streams'}
            </h2>
            <span className="badge font-mono" style={{ fontSize: 11 }}>{filteredWallpapers.length}</span>
          </div>

          <div style={{ position: 'relative', width: 220 }}>
            <Search size={13} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
            <input
              type="text"
              placeholder="Search library…"
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

        {/* Filter Pills & Thumbnail Mode Selector */}
        <div className="flex items-center justify-between gap-3" style={{ flexWrap: 'wrap' }}>
          <div className="flex items-center gap-1.5" style={{ flexWrap: 'wrap' }}>
            {[
              { id: 'all', label: 'All', count: allWallpapers.length },
              { id: 'liked', label: 'Liked', count: allWallpapers.filter(w => (likedWallpaperIds || []).includes(w.id)).length, icon: Heart },
              { id: 'pinned', label: 'Pinned', count: homeWallpaperIds.length, icon: Pin },
              { id: 'builtin', label: 'Built-in', count: WALLPAPER_LIST.length },
              { id: 'custom', label: 'Custom Media', count: allWallpapers.filter(w => w.isCustom && !w.config?.streamUrl).length },
              { id: 'stream', label: 'Web Streams', count: allWallpapers.filter(w => w.config?.streamUrl).length },
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

          {/* Thumbnail / Preview Mode Selector */}
          <div className="segmented-control" title="Card Preview Mode: On (Always), Hover (On Mouse Hover), Off (Minimalist vector badges)">
            <span style={{ fontSize: 10, color: 'var(--text-subtle)', paddingLeft: 6, paddingRight: 4, fontWeight: 600, letterSpacing: '0.02em' }}>
              PREVIEWS:
            </span>
            {[
              { id: 'always', label: 'On', title: 'Always Show Thumbnails' },
              { id: 'hover', label: 'Hover', title: 'Show Previews on Hover (Low RAM)' },
              { id: 'off', label: 'Off', title: 'Off — Clean Vector Badges (Zero RAM)' },
            ].map(m => (
              <button
                key={m.id}
                className={`segmented-item ${thumbnailMode === m.id ? 'active' : ''}`}
                onClick={() => setThumbnailMode(m.id)}
                title={m.title}
                style={{ fontSize: 11, padding: '3px 8px' }}
              >
                {m.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Wallpapers Grid */}
      {filteredWallpapers.length === 0 ? (
        <div className="card" style={{ padding: 48, textAlign: 'center', color: 'var(--text-subtle)', marginBottom: 36, border: '1.5px dashed var(--border-main)', background: 'transparent' }}>
          <Search size={26} className="text-brand" style={{ margin: '0 auto 10px', opacity: 0.7 }} />
          <div className="text-base font-semibold" style={{ color: 'var(--text-main)', marginBottom: 4 }}>
            No wallpapers match your filter
          </div>
          <p className="text-xs text-muted" style={{ maxWidth: 360, margin: '0 auto 16px' }}>
            Try selecting another category or clear your search term to see wallpapers in your library.
          </p>
          <button
            className="btn btn-ghost"
            style={{ margin: '0 auto', fontSize: 12 }}
            onClick={() => { setSearchQuery(''); setFilterCategory('all'); }}
          >
            Reset Filters
          </button>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 18, marginBottom: 36 }}>
          {filteredWallpapers.map(item => {
            const activeStatus = getActiveStatus(item)
            const isLive = Boolean(activeStatus)
            const isApplying = applyingId === item.id
            const isPinnedToHome = homeWallpaperIds.includes(item.id)
            const isLiked = (likedWallpaperIds || []).includes(item.id)
            const typeInfo = getWallpaperTypeInfo(item)

            return (
              <div
                key={item.id}
                className="mp-card"
                style={{
                  border: isLive ? '1px solid var(--color-emerald)' : '1px solid var(--border-subtle)',
                  boxShadow: isLive ? '0 0 0 1px var(--color-emerald), 0 8px 24px rgba(0,0,0,0.3)' : undefined,
                }}
                onMouseEnter={() => setHoveredId(item.id)}
                onMouseLeave={() => setHoveredId(null)}
                onDoubleClick={() => handleApply(item)}
              >
                {/* Thumbnail Preview */}
                <div
                  className="mp-thumb-container"
                  title={`Double-click to apply ${item.name}`}
                >
                  <WallpaperThumbnail
                    wallpaper={item}
                    isHovered={hoveredId === item.id}
                    mode={thumbnailMode}
                  />

                  {/* Top-Left: Type Badge */}
                  <div className="mp-badge-top-left">
                    <div
                      className="mp-pill-badge"
                      style={{
                        background: 'rgba(10, 10, 14, 0.75)',
                        color: typeInfo.color,
                        border: '1px solid rgba(255,255,255,0.12)',
                        fontSize: 10,
                      }}
                    >
                      <span>{typeInfo.label}</span>
                    </div>
                  </div>

                  {/* Top-Right: Active Indicator, Heart & Pin */}
                  <div className="mp-badge-top-right flex items-center gap-1">
                    {isLive && (
                      <div
                        className="mp-pill-badge"
                        style={{
                          background: 'rgba(16, 185, 129, 0.92)',
                          color: '#fff',
                          border: '1px solid rgba(255,255,255,0.2)',
                          fontSize: 10,
                          fontWeight: 700,
                        }}
                      >
                        <div className="status-dot-live" />
                        <span>{activeStatus[0] === 'all' ? 'LIVE' : activeStatus.join(', ')}</span>
                      </div>
                    )}

                    <button
                      className="btn-icon"
                      style={{
                        background: isLiked ? 'color-mix(in srgb, var(--color-rose) 30%, rgba(0,0,0,0.7))' : 'rgba(0,0,0,0.65)',
                        color: isLiked ? 'var(--color-rose)' : 'rgba(255,255,255,0.85)',
                        padding: 5,
                        borderRadius: 6,
                        backdropFilter: 'blur(8px)',
                        border: isLiked ? '1px solid var(--color-rose)' : '1px solid rgba(255,255,255,0.14)',
                        transition: 'all 0.15s ease',
                      }}
                      title={isLiked ? 'Unlike wallpaper' : 'Like wallpaper'}
                      onClick={(e) => {
                        e.stopPropagation()
                        toggleLikeWallpaper(item.id)
                      }}
                    >
                      <Heart size={12} fill={isLiked ? 'currentColor' : 'none'} />
                    </button>

                    <button
                      className="btn-icon"
                      style={{
                        background: isPinnedToHome ? 'var(--color-brand)' : 'rgba(0,0,0,0.65)',
                        color: '#fff',
                        padding: 5,
                        borderRadius: 6,
                        backdropFilter: 'blur(8px)',
                        border: isPinnedToHome ? '1px solid var(--color-brand)' : '1px solid rgba(255,255,255,0.12)',
                      }}
                      title={isPinnedToHome ? 'Pinned to Home (Click to remove)' : 'Pin to Home'}
                      onClick={(e) => {
                        e.stopPropagation()
                        togglePinToHome(item.id)
                      }}
                    >
                      <Pin size={12} fill={isPinnedToHome ? '#fff' : 'none'} />
                    </button>
                  </div>
                </div>

                {/* Card Content & Hierarchy */}
                <div style={{ padding: '14px 14px 12px', display: 'flex', flexDirection: 'column', flex: 1 }}>
                  <div style={{ marginBottom: 8 }}>
                    <h3
                      className="font-semibold"
                      style={{
                        fontSize: 13.5,
                        lineHeight: '1.3',
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        color: 'var(--text-main)',
                      }}
                      title={item.name}
                    >
                      {item.name}
                    </h3>
                    <div className="text-xs text-muted" style={{ marginTop: 2 }}>
                      {item.communityMeta?.author
                        ? `by ${item.communityMeta.author}`
                        : item.isCustom
                        ? `Custom ${typeInfo.label}`
                        : `Built-in Canvas Engine`}
                    </div>
                  </div>

                  {/* Secondary actions row */}
                  <div
                    className="flex items-center justify-between"
                    style={{
                      paddingTop: 8,
                      paddingBottom: 10,
                      borderTop: '1px solid var(--border-subtle)',
                      marginBottom: 10,
                    }}
                  >
                    <div className="flex items-center gap-1 text-xs text-subtle truncate" style={{ maxWidth: '60%' }}>
                      {item.tags && item.tags.length > 0 ? (
                        item.tags.slice(0, 2).map(tag => (
                          <span
                            key={tag}
                            style={{
                              padding: '2px 6px',
                              borderRadius: 4,
                              background: 'var(--bg-card-hover)',
                              border: '1px solid var(--border-subtle)',
                              fontSize: 9.5,
                              color: 'var(--text-muted)',
                            }}
                          >
                            #{tag}
                          </span>
                        ))
                      ) : (
                        <span style={{ fontSize: 10.5, color: 'var(--text-subtle)' }}>60 FPS Native</span>
                      )}
                    </div>

                    <div className="flex items-center gap-1">
                      <button
                        className="btn-icon"
                        style={{ padding: '3px 5px', color: 'var(--text-muted)' }}
                        title="Rename Wallpaper"
                        onClick={(e) => {
                          e.stopPropagation()
                          setRenameModal({ isOpen: true, id: item.id, currentName: item.name })
                        }}
                      >
                        <Pencil size={11} />
                      </button>

                      {item.isCustom && (
                        <button
                          className="btn-icon"
                          style={{ padding: '3px 5px', color: 'var(--color-rose)' }}
                          title="Delete custom wallpaper"
                          onClick={(e) => {
                            e.stopPropagation()
                            if (isLive) handleStop()
                            uninstallItem(item.id)
                          }}
                        >
                          <Trash2 size={11} />
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Primary Action Button */}
                  <div style={{ marginTop: 'auto' }}>
                    {isLive ? (
                      <div
                        className="btn btn-success mp-btn-action w-full"
                        style={{
                          cursor: 'default',
                          background: 'color-mix(in srgb, var(--color-emerald) 15%, transparent)',
                          borderColor: 'var(--color-emerald)',
                          color: 'var(--color-emerald)',
                          height: 32,
                          fontSize: 12,
                        }}
                      >
                        <Check size={13} /> Active on Desktop
                      </div>
                    ) : (
                      <button
                        className="btn btn-secondary mp-btn-action w-full"
                        onClick={(e) => {
                          e.stopPropagation()
                          handleApply(item)
                        }}
                        disabled={isApplying}
                        title="Apply to Windows desktop"
                        style={{ height: 32, fontSize: 12 }}
                      >
                        <Play size={12} fill="currentColor" /> {isApplying ? 'Applying…' : 'Apply to Desktop'}
                      </button>
                    )}
                  </div>
                </div>
              </div>
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
    </div>
  )
}
