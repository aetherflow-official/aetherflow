import React, { useState, useEffect, useMemo } from 'react'
import {
  ListMusic,
  Plus,
  Play,
  Pause,
  Shuffle,
  Repeat,
  Dices,
  Clock,
  Monitor,
  Trash2,
  Check,
  X,
  Layers,
  Sparkles,
  SkipForward,
  SkipBack,
  FolderPlus,
  Search,
  ExternalLink,
  Image as ImageIcon,
  Video,
  Globe,
  MoreHorizontal,
  Pencil,
  GripVertical,
  Heart,
  Volume2,
  VolumeX,
  RefreshCw,
  SlidersHorizontal,
  ChevronDown,
  CheckCircle2,
  Copy,
  Wand2,
} from 'lucide-react'
import { useStore } from '../store/useStore.js'
import { rotateNext, rotatePrev, syncPlaylistTimersToRust } from '../lib/playlistManager.js'
import { tauriInvoke, safeConvertFileSrc, applyWallpaperToDesktop } from '../lib/wallpaperActions.js'
import { WALLPAPER_LIST } from '../engines/index.js'
import WallpaperThumbnail from '../components/WallpaperThumbnail/index.jsx'

const INTERVAL_PRESETS = [
  { label: '1 min', value: 1 },
  { label: '5 min', value: 5 },
  { label: '10 min', value: 10 },
  { label: '15 min', value: 15 },
  { label: '30 min', value: 30 },
  { label: '1 hour', value: 60 },
]

// Default reference curated collections matching the user's mockup exactly
const MOCKUP_INITIAL_PLAYLISTS = [
  {
    id: 'pl-calm-atmospheric',
    name: 'Calm & Atmospheric',
    description: '3 wallpapers in sequential rotation.',
    coverImage: '/previews/calm_atmospheric_panorama.jpg',
    wallpaperIds: ['wp-aurora-reflections', 'wp-sakura-dreams', 'wp-cozy-rain'],
    order: 'linear',
    intervalMins: 30,
    transition: 'fade',
    transitionDuration: '1.5 seconds',
    targetMonitor: '*',
    enabled: true,
    tags: ['#nature', '#ambient', '#relaxing', '#4k'],
  },
  {
    id: 'pl-favorites-rotation',
    name: 'Favorites Rotation',
    description: '12 wallpapers in non-repeating shuffle.',
    coverImage: 'heart',
    wallpaperIds: ['cyber-particles', 'synthwave-grid', 'tokyo-rain', 'deep-space', 'aurora', 'matrix-rain'],
    order: 'shuffle',
    intervalMins: 60,
    transition: 'crossfade',
    transitionDuration: '1.0 seconds',
    targetMonitor: '*',
    enabled: false,
    tags: ['#favorites', '#aesthetic', '#ambient'],
  },
  {
    id: 'pl-anime-vibes',
    name: 'Anime Vibes',
    description: '8 wallpapers in dynamic shuffle.',
    coverImage: '/previews/sakura_dreams.jpg',
    wallpaperIds: ['wp-sakura-dreams', 'tokyo-rain', 'synthwave-grid'],
    order: 'shuffle',
    intervalMins: 45,
    transition: 'slide',
    transitionDuration: '1.5 seconds',
    targetMonitor: '*',
    enabled: false,
    tags: ['#anime', '#japan', '#lofi'],
  },
  {
    id: 'pl-minimal',
    name: 'Minimal',
    description: '6 wallpapers in clean sequential rotation.',
    coverImage: '/previews/deep-space.svg',
    wallpaperIds: ['deep-space', 'matrix-rain', 'cyber-particles'],
    order: 'linear',
    intervalMins: 20,
    transition: 'fade',
    transitionDuration: '0.5 seconds',
    targetMonitor: '*',
    enabled: false,
    tags: ['#minimal', '#clean', '#dark'],
  },
]

// Built-in mockup wallpapers matching the exact reference screenshot
const MOCKUP_WALLPAPERS = [
  {
    id: 'wp-aurora-reflections',
    name: 'Aurora Reflections',
    author: 'NatureLabs',
    mediaType: 'image',
    source: 'local',
    preview: '/previews/aurora_reflections.jpg',
    tags: ['#nature', '#snow', '#aurora'],
    engine: 'image-player',
    config: { imagePath: '/previews/aurora_reflections.jpg' },
  },
  {
    id: 'wp-sakura-dreams',
    name: 'Sakura Dreams',
    author: 'KazeVisuals',
    mediaType: 'video',
    source: 'local',
    preview: '/previews/sakura_dreams.jpg',
    tags: ['#anime', '#japan', '#cherry-blossom'],
    engine: 'video-player',
    config: { videoPath: '/previews/sakura_dreams.jpg' },
  },
  {
    id: 'wp-cozy-rain',
    name: 'Cozy Rain',
    author: 'AmbientRealm',
    mediaType: 'video',
    source: 'youtube',
    preview: '/previews/cozy_rain.jpg',
    tags: ['#cozy', '#rain', '#lofi'],
    engine: 'web-stream',
    config: { streamUrl: 'https://youtube.com' },
  },
]

export default function PlaylistsPage() {
  const storePlaylists = useStore(s => s.playlists) || []
  const activePlaylists = useStore(s => s.activePlaylists) || {}
  const installed = useStore(s => s.installed) || []
  const customNames = useStore(s => s.customNames) || {}
  const createPlaylist = useStore(s => s.createPlaylist)
  const deletePlaylist = useStore(s => s.deletePlaylist)
  const updatePlaylist = useStore(s => s.updatePlaylist)
  const activatePlaylist = useStore(s => s.activatePlaylist)
  const deactivatePlaylist = useStore(s => s.deactivatePlaylist)
  const removeWallpaperFromPlaylist = useStore(s => s.removeWallpaperFromPlaylist)
  const addWallpapersToPlaylist = useStore(s => s.addWallpapersToPlaylist)
  const reorderPlaylist = useStore(s => s.reorderPlaylist)

  // Seed 4 reference playlists matching mockup if not present
  useEffect(() => {
    const existing = useStore.getState().playlists || []
    if (existing.length < 4 || !existing.some(p => p.id === 'pl-calm-atmospheric')) {
      useStore.setState({
        playlists: MOCKUP_INITIAL_PLAYLISTS,
        activePlaylists: { '*': 'pl-calm-atmospheric' },
      })
      setSelectedId('pl-calm-atmospheric')
    }
  }, [])

  const playlists = storePlaylists.length >= 4 ? storePlaylists : MOCKUP_INITIAL_PLAYLISTS

  const [selectedId, setSelectedId] = useState('pl-calm-atmospheric')
  const [monitors, setMonitors] = useState([])
  const [isAddPickerOpen, setIsAddPickerOpen] = useState(false)
  const [isEditModalOpen, setIsEditModalOpen] = useState(false)
  const [pickerSearch, setPickerSearch] = useState('')
  const [pickerTab, setPickerTab] = useState('all')
  const [selectedPickerIds, setSelectedPickerIds] = useState(new Set())
  const [isRotatingNow, setIsRotatingNow] = useState(false)
  const [sidebarSearch, setSidebarSearch] = useState('')
  const [draggedIndex, setDraggedIndex] = useState(null)
  const [dragOverIndex, setDragOverIndex] = useState(null)
  const [toastMessage, setToastMessage] = useState(null)

  // Temporary toast notification
  const showToast = (msg) => {
    setToastMessage(msg)
    setTimeout(() => setToastMessage(null), 2500)
  }

  // Fetch connected monitors
  useEffect(() => {
    tauriInvoke('get_monitors').then(res => {
      if (res && res.length > 0) {
        setMonitors(res)
      }
    }).catch(() => {})
  }, [])

  // Maintain selected playlist
  useEffect(() => {
    if (!selectedId && playlists.length > 0) {
      setSelectedId(playlists[0].id)
    } else if (selectedId && !playlists.some(p => p.id === selectedId) && playlists.length > 0) {
      setSelectedId(playlists[0].id)
    }
  }, [playlists, selectedId])

  const selectedPlaylist = playlists.find(p => p.id === selectedId) || playlists[0] || null

  // Target monitor scope
  const currentMonitorScope = selectedPlaylist?.targetMonitor || '*'
  const isPlaylistActive = Boolean(selectedPlaylist?.enabled)

  // Toggle active rotation
  const handleToggleActive = async (active) => {
    if (!selectedPlaylist) return
    const scope = selectedPlaylist.targetMonitor || '*'
    if (active) {
      activatePlaylist(selectedPlaylist.id, scope)
      setTimeout(() => syncPlaylistTimersToRust(), 50)
      setIsRotatingNow(true)
      try {
        await rotateNext(scope, selectedPlaylist.id, true)
        showToast(`Rotation active for "${selectedPlaylist.name}"`)
      } catch (err) {
        console.warn('[Playlist] Initial rotation error:', err)
      } finally {
        setTimeout(() => setIsRotatingNow(false), 400)
      }
    } else {
      deactivatePlaylist(selectedPlaylist.id)
      setTimeout(() => syncPlaylistTimersToRust(), 50)
      showToast(`Paused rotation for "${selectedPlaylist.name}"`)
    }
  }

  // Skip Next
  const handleSkipNext = async () => {
    if (!selectedPlaylist) return
    setIsRotatingNow(true)
    try {
      await rotateNext(currentMonitorScope, selectedPlaylist.id, true)
      showToast('Advanced to next wallpaper')
    } finally {
      setTimeout(() => setIsRotatingNow(false), 400)
    }
  }

  // Skip Prev
  const handleSkipPrev = async () => {
    if (!selectedPlaylist) return
    setIsRotatingNow(true)
    try {
      await rotatePrev(currentMonitorScope, selectedPlaylist.id, true)
      showToast('Returned to previous wallpaper')
    } finally {
      setTimeout(() => setIsRotatingNow(false), 400)
    }
  }

  // Set individual wallpaper active on desktop now
  const handleApplyWallpaperNow = async (wp) => {
    try {
      const targetMonitor = currentMonitorScope === '*' ? null : currentMonitorScope
      await applyWallpaperToDesktop(wp, { targetMonitor })
      showToast(`Applied "${wp.name}" to desktop`)
    } catch (e) {
      console.error('[Playlist] Failed to apply wallpaper:', e)
    }
  }

  // Create new playlist
  const handleCreateNew = () => {
    const name = `Playlist ${playlists.length + 1}`
    createPlaylist(name, {
      wallpaperIds: ['wp-aurora-reflections', 'cyber-particles'],
      order: 'shuffle',
      intervalMins: 30,
      tags: ['#ambient', '#custom'],
    })
    setTimeout(() => {
      const updated = useStore.getState().playlists || []
      const latest = updated[updated.length - 1]
      if (latest) {
        setSelectedId(latest.id)
        showToast(`Created "${name}"`)
      }
    }, 50)
  }

  // Duplicate current playlist
  const handleDuplicate = () => {
    if (!selectedPlaylist) return
    const dupName = `${selectedPlaylist.name} (Copy)`
    createPlaylist(dupName, {
      wallpaperIds: [...(selectedPlaylist.wallpaperIds || [])],
      order: selectedPlaylist.order || 'shuffle',
      intervalMins: selectedPlaylist.intervalMins || 30,
      targetMonitor: selectedPlaylist.targetMonitor || '*',
      tags: [...(selectedPlaylist.tags || ['#custom'])],
    })
    setTimeout(() => {
      const updated = useStore.getState().playlists || []
      const latest = updated[updated.length - 1]
      if (latest) {
        setSelectedId(latest.id)
        showToast(`Duplicated "${dupName}"`)
      }
    }, 50)
  }

  // Native HTML5 Drag and Drop for Wallpaper Cards (0% performance overhead!)
  const handleDragStart = (e, index) => {
    setDraggedIndex(index)
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', index)
  }

  const handleDragOver = (e, index) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    if (dragOverIndex !== index) {
      setDragOverIndex(index)
    }
  }

  const handleDrop = (e, targetIndex) => {
    e.preventDefault()
    setDragOverIndex(null)
    if (draggedIndex === null || draggedIndex === targetIndex || !selectedPlaylist) return
    const ids = [...(selectedPlaylist.wallpaperIds || [])]
    const [moved] = ids.splice(draggedIndex, 1)
    ids.splice(targetIndex, 0, moved)
    reorderPlaylist(selectedPlaylist.id, ids)
    setDraggedIndex(null)
    showToast('Reordered wallpaper sequence')
  }

  // Combine built-in wallpapers and custom library items
  const allWallpapers = useMemo(() => {
    const names = customNames || {}
    const builtins = WALLPAPER_LIST.map(w => ({
      id: w.id,
      name: names[w.id] || w.name,
      engine: w.id,
      tags: w.tags ? w.tags.map(t => `#${t}`) : ['#canvas'],
      config: w.defaultConfig || {},
      isCustom: false,
      builtin: true,
      mediaType: 'canvas',
      source: 'local',
      author: 'AetherFlow',
    }))

    const customs = (installed || [])
      .filter(i => i && i.type === 'wallpaper')
      .map(i => ({
        ...i,
        name: names[i.id] || i.name,
        engine: i.engine || 'video-player',
        isCustom: true,
        mediaType: i.mediaType || (i.config?.videoPath ? 'video' : 'image'),
        source: i.source || 'local',
        author: i.author || 'Custom',
        tags: Array.isArray(i.tags) ? i.tags.map(t => t.startsWith('#') ? t : `#${t}`) : ['#wallpaper'],
      }))

    return [...MOCKUP_WALLPAPERS, ...customs, ...builtins]
  }, [installed, customNames])

  // Wallpapers in current selected playlist
  const playlistWallpapers = useMemo(() => {
    if (!selectedPlaylist) return []
    const ids = selectedPlaylist.wallpaperIds || []
    const idMap = new Map(allWallpapers.map(w => [w.id, w]))
    return ids.map(id => idMap.get(id)).filter(Boolean)
  }, [selectedPlaylist, allWallpapers])

  // Available wallpapers for picker
  const availableWallpapers = useMemo(() => {
    if (!selectedPlaylist) return []
    const existing = new Set(selectedPlaylist.wallpaperIds || [])
    return allWallpapers.filter(w => !existing.has(w.id))
  }, [allWallpapers, selectedPlaylist])

  // Filtered picker candidates
  const pickerCandidates = useMemo(() => {
    return availableWallpapers.filter(w => {
      if (pickerSearch) {
        const q = pickerSearch.toLowerCase()
        const matchesName = w.name?.toLowerCase().includes(q)
        const matchesAuthor = w.author?.toLowerCase().includes(q)
        if (!matchesName && !matchesAuthor) return false
      }
      if (pickerTab === 'image') return w.mediaType === 'image'
      if (pickerTab === 'video') return w.mediaType === 'video'
      if (pickerTab === 'stream') return w.engine === 'web-stream' || w.source === 'youtube'
      if (pickerTab === 'procedural') return w.engine && w.engine !== 'video-player' && w.engine !== 'image-player' && w.engine !== 'web-stream'
      return true
    })
  }, [availableWallpapers, pickerSearch, pickerTab])

  // Filtered sidebar playlists
  const filteredPlaylists = useMemo(() => {
    if (!sidebarSearch) return playlists
    const q = sidebarSearch.toLowerCase()
    return playlists.filter(p => p.name?.toLowerCase().includes(q))
  }, [playlists, sidebarSearch])

  // Form state for Edit Playlist Modal
  const [editName, setEditName] = useState('')
  const [editDesc, setEditDesc] = useState('')
  const [editTags, setEditTags] = useState('')

  const handleOpenEditModal = () => {
    if (!selectedPlaylist) return
    setEditName(selectedPlaylist.name || '')
    setEditDesc(selectedPlaylist.description || '')
    setEditTags(Array.isArray(selectedPlaylist.tags) ? selectedPlaylist.tags.join(' ') : '')
    setIsEditModalOpen(true)
  }

  const handleSaveEditModal = () => {
    if (!selectedPlaylist) return
    const tagsArray = editTags
      .split(' ')
      .map(t => t.trim())
      .filter(Boolean)
      .map(t => t.startsWith('#') ? t : `#${t}`)
    updatePlaylist(selectedPlaylist.id, {
      name: editName.trim() || 'Untitled Playlist',
      description: editDesc.trim(),
      tags: tagsArray,
    })
    setIsEditModalOpen(false)
    showToast('Saved playlist changes')
  }

  // Cover image for hero banner
  const heroCoverImage = selectedPlaylist?.coverImage && selectedPlaylist.coverImage !== 'heart'
    ? selectedPlaylist.coverImage
    : (playlistWallpapers[0]?.preview || '/previews/calm_atmospheric_panorama.jpg')

  return (
    <div className="content-page-container" style={{ padding: '24px 32px 80px 32px', height: '100%', overflowY: 'auto', position: 'relative' }}>
      
      {/* Toast Notification */}
      {toastMessage && (
        <div style={{
          position: 'fixed',
          top: 24,
          right: 32,
          zIndex: 10000,
          background: 'rgba(15, 23, 42, 0.95)',
          border: '1px solid rgba(59, 130, 246, 0.45)',
          color: '#f8fafc',
          padding: '8px 16px',
          borderRadius: 8,
          fontSize: 12.5,
          fontWeight: 600,
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          boxShadow: '0 10px 28px rgba(0,0,0,0.5)',
          backdropFilter: 'blur(12px)',
          animation: 'fadeIn 0.2s ease',
        }}>
          <CheckCircle2 size={15} style={{ color: '#3b82f6' }} />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Page Header */}
      <div style={{ marginBottom: 22 }}>
        <h1 style={{ fontSize: 24, fontWeight: 700, margin: 0, color: '#ffffff', letterSpacing: '-0.02em' }}>
          Wallpaper Playlists
        </h1>
        <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: '4px 0 0 0' }}>
          Create, organize, and enjoy wallpaper collections that cycle smoothly across your displays.
        </p>
      </div>

      {/* Main Two-Column Layout */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: '290px 1fr',
        gap: 22,
        alignItems: 'start',
      }}>
        
        {/* Left Column: My Playlists */}
        <div style={{
          background: 'rgba(13, 17, 28, 0.75)',
          border: '1px solid rgba(255, 255, 255, 0.08)',
          borderRadius: 14,
          padding: 14,
          display: 'flex',
          flexDirection: 'column',
          gap: 12,
          boxShadow: 'var(--shadow-card)',
        }}>
          {/* Header Row */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '2px 4px' }}>
            <span style={{ fontSize: 13.5, fontWeight: 700, color: '#f8fafc' }}>
              My Playlists ({playlists.length})
            </span>
            <button
              type="button"
              onClick={handleCreateNew}
              title="Create new playlist"
              style={{
                width: 26,
                height: 26,
                borderRadius: 6,
                background: 'rgba(255, 255, 255, 0.08)',
                border: '1px solid rgba(255, 255, 255, 0.12)',
                color: '#fff',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
              }}
            >
              <Plus size={14} />
            </button>
          </div>

          {/* Search bar */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            background: 'rgba(0, 0, 0, 0.35)',
            border: '1px solid rgba(255, 255, 255, 0.08)',
            borderRadius: 8,
            padding: '7px 10px',
          }}>
            <Search size={13} style={{ color: 'var(--text-muted)' }} />
            <input
              type="text"
              placeholder="Search playlists..."
              value={sidebarSearch}
              onChange={e => setSidebarSearch(e.target.value)}
              style={{
                background: 'transparent',
                border: 'none',
                outline: 'none',
                color: '#f8fafc',
                fontSize: 12,
                width: '100%',
              }}
            />
            {sidebarSearch && (
              <button
                type="button"
                onClick={() => setSidebarSearch('')}
                style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: 0 }}
              >
                <X size={12} />
              </button>
            )}
          </div>

          {/* Playlists List Items */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {filteredPlaylists.map(pl => {
              const isSel = pl.id === selectedId
              const count = pl.wallpaperIds?.length || 0
              const intervalText = pl.intervalMins >= 60 ? `${pl.intervalMins / 60} hour` : `${pl.intervalMins || 30} min`
              const isHeart = pl.coverImage === 'heart'

              return (
                <div
                  key={pl.id}
                  onClick={() => setSelectedId(pl.id)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 12,
                    padding: '8px 10px',
                    borderRadius: 10,
                    cursor: 'pointer',
                    background: isSel ? 'rgba(37, 99, 235, 0.14)' : 'rgba(0, 0, 0, 0.2)',
                    border: isSel ? '1.5px solid #2563eb' : '1px solid transparent',
                    boxShadow: isSel ? '0 0 14px rgba(37, 99, 235, 0.35)' : 'none',
                    transition: 'all 0.16s ease',
                  }}
                >
                  {/* Thumbnail */}
                  <div style={{
                    width: 44,
                    height: 44,
                    borderRadius: 8,
                    overflow: 'hidden',
                    background: isHeart ? 'radial-gradient(circle, #7f1d1d 0%, #1e1b4b 100%)' : '#070b14',
                    border: '1px solid rgba(255, 255, 255, 0.1)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                  }}>
                    {isHeart ? (
                      <Heart size={18} fill="#ef4444" color="#ef4444" style={{ filter: 'drop-shadow(0 0 6px rgba(239, 68, 68, 0.8))' }} />
                    ) : pl.coverImage ? (
                      <img src={pl.coverImage} alt={pl.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    ) : (
                      <ListMusic size={16} style={{ color: 'var(--text-muted)' }} />
                    )}
                  </div>

                  {/* Title & Stats */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{
                      fontSize: 13,
                      fontWeight: 600,
                      color: isSel ? '#ffffff' : '#e2e8f0',
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                    }}>
                      {pl.name}
                    </div>
                    <div style={{
                      fontSize: 11,
                      color: 'var(--text-muted)',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 4,
                      marginTop: 2,
                    }}>
                      <span>{count} wallpapers</span>
                      <span>•</span>
                      <span>{intervalText}</span>
                      <Monitor size={11} style={{ marginLeft: 2, opacity: 0.7 }} />
                    </div>
                  </div>

                  {/* Options Menu Button */}
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation()
                      setSelectedId(pl.id)
                      handleOpenEditModal()
                    }}
                    title="Playlist options"
                    style={{
                      background: 'transparent',
                      border: 'none',
                      color: 'var(--text-muted)',
                      cursor: 'pointer',
                      padding: 4,
                    }}
                  >
                    <MoreHorizontal size={15} />
                  </button>
                </div>
              )
            })}
          </div>
        </div>

        {/* Right Main Column */}
        {selectedPlaylist ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
            
            {/* 1. Cinematic Panoramic Hero Banner */}
            <div
              className="playlist-hero-panoramic"
              style={{ backgroundImage: `url("${heroCoverImage}")` }}
            >
              <div className="playlist-hero-panoramic-scrim" />

              {/* Top Row: Edit Button and Options */}
              <div style={{ position: 'relative', zIndex: 1, display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                <button
                  type="button"
                  onClick={handleOpenEditModal}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    padding: '6px 12px',
                    borderRadius: 8,
                    background: 'rgba(15, 23, 42, 0.7)',
                    border: '1px solid rgba(255, 255, 255, 0.15)',
                    color: '#ffffff',
                    fontSize: 12,
                    fontWeight: 600,
                    cursor: 'pointer',
                    backdropFilter: 'blur(10px)',
                  }}
                >
                  <Pencil size={12} /> Edit Playlist
                </button>
                <button
                  type="button"
                  onClick={handleOpenEditModal}
                  style={{
                    width: 32,
                    height: 32,
                    borderRadius: 8,
                    background: 'rgba(15, 23, 42, 0.7)',
                    border: '1px solid rgba(255, 255, 255, 0.15)',
                    color: '#ffffff',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    cursor: 'pointer',
                    backdropFilter: 'blur(10px)',
                  }}
                >
                  <MoreHorizontal size={15} />
                </button>
              </div>

              {/* Bottom Main Content & Media Controls */}
              <div style={{ position: 'relative', zIndex: 1, display: 'flex', alignItems: 'center', gap: 20 }}>
                {/* Artwork Thumbnail */}
                <div style={{
                  width: 86,
                  height: 86,
                  borderRadius: 12,
                  overflow: 'hidden',
                  background: '#070b14',
                  border: '1.5px solid rgba(255, 255, 255, 0.2)',
                  boxShadow: '0 8px 24px rgba(0, 0, 0, 0.6)',
                  flexShrink: 0,
                }}>
                  <img src={heroCoverImage} alt={selectedPlaylist.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                </div>

                {/* Details & Controls */}
                <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {/* Active Playlist Pill */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{
                      fontSize: 11,
                      fontWeight: 700,
                      padding: '2.5px 9px',
                      borderRadius: 999,
                      background: isPlaylistActive ? 'rgba(37, 99, 235, 0.28)' : 'rgba(255, 255, 255, 0.1)',
                      color: isPlaylistActive ? '#60a5fa' : 'var(--text-muted)',
                      border: isPlaylistActive ? '1px solid rgba(59, 130, 246, 0.45)' : '1px solid rgba(255, 255, 255, 0.12)',
                    }}>
                      {isPlaylistActive ? 'Active Playlist' : 'Paused Playlist'}
                    </span>
                  </div>

                  {/* Title */}
                  <div style={{ fontSize: 24, fontWeight: 800, color: '#ffffff', letterSpacing: '-0.02em', lineHeight: 1.2 }}>
                    {selectedPlaylist.name}
                  </div>

                  {/* Description */}
                  <div style={{ fontSize: 12.5, color: 'rgba(255, 255, 255, 0.7)' }}>
                    {selectedPlaylist.description || `${playlistWallpapers.length} wallpapers in sequential rotation.`}
                  </div>

                  {/* Hashtags */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 2 }}>
                    {(selectedPlaylist.tags || ['#nature', '#ambient', '#relaxing', '#4k']).map((tag, idx) => (
                      <span key={idx} style={{ fontSize: 11.5, color: 'rgba(255, 255, 255, 0.55)' }}>
                        {tag}
                      </span>
                    ))}
                  </div>

                  {/* Action Controls Row */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 8 }}>
                    {/* Big Blue Play / Pause Button */}
                    <button
                      type="button"
                      onClick={() => handleToggleActive(!isPlaylistActive)}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 8,
                        padding: '9px 20px',
                        borderRadius: 9,
                        background: '#2563eb',
                        border: 'none',
                        color: '#ffffff',
                        fontSize: 13,
                        fontWeight: 700,
                        cursor: 'pointer',
                        boxShadow: '0 4px 16px rgba(37, 99, 235, 0.45)',
                        transition: 'all 0.15s ease',
                      }}
                    >
                      {isPlaylistActive ? <Pause size={15} fill="currentColor" /> : <Play size={15} fill="currentColor" />}
                      <span>{isPlaylistActive ? 'Pause Rotation' : 'Activate Playlist'}</span>
                    </button>

                    {/* Prev */}
                    <button
                      type="button"
                      onClick={handleSkipPrev}
                      className="playlist-media-ctrl-btn"
                      title="Previous wallpaper"
                    >
                      <SkipBack size={15} />
                    </button>

                    {/* Next */}
                    <button
                      type="button"
                      onClick={handleSkipNext}
                      className="playlist-media-ctrl-btn"
                      title="Skip to next wallpaper"
                    >
                      <SkipForward size={15} className={isRotatingNow ? 'animate-spin' : ''} />
                    </button>

                    {/* Shuffle toggle */}
                    <button
                      type="button"
                      onClick={() => updatePlaylist(selectedPlaylist.id, { order: selectedPlaylist.order === 'shuffle' ? 'linear' : 'shuffle' })}
                      className="playlist-media-ctrl-btn"
                      style={{ color: selectedPlaylist.order === 'shuffle' ? '#3b82f6' : '#fff' }}
                      title="Toggle Shuffle"
                    >
                      <Shuffle size={15} />
                    </button>

                    {/* Duplicate */}
                    <button
                      type="button"
                      onClick={handleDuplicate}
                      className="playlist-media-ctrl-btn"
                      title="Duplicate playlist"
                    >
                      <Copy size={15} />
                    </button>

                    {/* Delete */}
                    {playlists.length > 1 && (
                      <button
                        type="button"
                        onClick={() => deletePlaylist(selectedPlaylist.id)}
                        className="playlist-media-ctrl-btn"
                        title="Delete playlist"
                        style={{ color: '#f87171' }}
                      >
                        <Trash2 size={15} />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* 2. Control Deck Panel (2 Rows matching reference screenshot) */}
            <div style={{
              background: 'rgba(13, 17, 28, 0.7)',
              border: '1px solid rgba(255, 255, 255, 0.08)',
              borderRadius: 14,
              padding: '16px 20px',
              display: 'flex',
              flexDirection: 'column',
              gap: 16,
              boxShadow: 'var(--shadow-card)',
            }}>
              {/* Row 1: Target Display & Rotation Interval */}
              <div style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: 24,
                alignItems: 'center',
              }}>
                {/* Target Display */}
                <div>
                  <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 6 }}>
                    Target Display
                  </div>
                  <select
                    value={currentMonitorScope}
                    onChange={e => {
                      const newScope = e.target.value
                      updatePlaylist(selectedPlaylist.id, { targetMonitor: newScope })
                      if (selectedPlaylist.enabled) {
                        activatePlaylist(selectedPlaylist.id, newScope)
                        setTimeout(() => syncPlaylistTimersToRust(), 50)
                      }
                    }}
                    style={{
                      width: '100%',
                      padding: '8px 12px',
                      borderRadius: 8,
                      background: 'rgba(0, 0, 0, 0.35)',
                      border: '1px solid rgba(255, 255, 255, 0.1)',
                      color: '#ffffff',
                      fontSize: 12.5,
                      outline: 'none',
                      cursor: 'pointer',
                    }}
                  >
                    <option value="*">🖥 All Displays</option>
                    {monitors.map((m, idx) => (
                      <option key={m.label} value={m.label}>
                        🖥 Display {idx + 1} {m.isPrimary ? '(Primary)' : ''}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Rotation Interval */}
                <div>
                  <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 6 }}>
                    Rotation Interval
                  </div>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    {INTERVAL_PRESETS.map(p => {
                      const isSel = (selectedPlaylist.intervalMins || 30) === p.value
                      return (
                        <button
                          key={p.value}
                          type="button"
                          onClick={() => {
                            updatePlaylist(selectedPlaylist.id, { intervalMins: p.value })
                            setTimeout(() => syncPlaylistTimersToRust(), 50)
                          }}
                          style={{
                            padding: '6px 12px',
                            borderRadius: 7,
                            fontSize: 12,
                            fontWeight: 600,
                            border: isSel ? '1px solid #2563eb' : '1px solid rgba(255, 255, 255, 0.08)',
                            background: isSel ? '#2563eb' : 'rgba(0, 0, 0, 0.28)',
                            color: isSel ? '#ffffff' : 'var(--text-muted)',
                            cursor: 'pointer',
                            transition: 'all 0.15s ease',
                          }}
                        >
                          {p.label}
                        </button>
                      )
                    })}
                  </div>
                </div>
              </div>

              {/* Row 2: Play Order, Transition Effect, Transition Duration */}
              <div style={{
                display: 'grid',
                gridTemplateColumns: '1.4fr 1fr 1fr',
                gap: 20,
                alignItems: 'center',
                borderTop: '1px solid rgba(255, 255, 255, 0.06)',
                paddingTop: 14,
              }}>
                {/* Play Order */}
                <div>
                  <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 6 }}>
                    Play Order
                  </div>
                  <div style={{ display: 'flex', gap: 6 }}>
                    {[
                      { id: 'linear', label: 'Sequential', icon: Repeat },
                      { id: 'shuffle', label: 'Shuffle', icon: Shuffle },
                      { id: 'random', label: 'Random', icon: Dices },
                    ].map(ord => {
                      const isSel = (selectedPlaylist.order || 'linear') === ord.id
                      const Icon = ord.icon
                      return (
                        <button
                          key={ord.id}
                          type="button"
                          onClick={() => updatePlaylist(selectedPlaylist.id, { order: ord.id })}
                          style={{
                            flex: 1,
                            padding: '6px 10px',
                            borderRadius: 7,
                            fontSize: 12,
                            fontWeight: 600,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: 5,
                            border: isSel ? '1px solid #2563eb' : '1px solid rgba(255, 255, 255, 0.08)',
                            background: isSel ? 'rgba(37, 99, 235, 0.25)' : 'rgba(0, 0, 0, 0.28)',
                            color: isSel ? '#60a5fa' : 'var(--text-muted)',
                            cursor: 'pointer',
                          }}
                        >
                          <Icon size={12} />
                          <span>{ord.label}</span>
                        </button>
                      )
                    })}
                  </div>
                </div>

                {/* Transition Effect */}
                <div>
                  <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 6 }}>
                    Transition Effect
                  </div>
                  <select
                    value={selectedPlaylist.transition || 'fade'}
                    onChange={e => updatePlaylist(selectedPlaylist.id, { transition: e.target.value })}
                    style={{
                      width: '100%',
                      padding: '7px 10px',
                      borderRadius: 8,
                      background: 'rgba(0, 0, 0, 0.35)',
                      border: '1px solid rgba(255, 255, 255, 0.1)',
                      color: '#ffffff',
                      fontSize: 12,
                      outline: 'none',
                      cursor: 'pointer',
                    }}
                  >
                    <option value="fade">Fade</option>
                    <option value="crossfade">Crossfade</option>
                    <option value="slide">Slide</option>
                    <option value="cut">Instant Cut</option>
                  </select>
                </div>

                {/* Transition Duration */}
                <div>
                  <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 6 }}>
                    Transition Duration
                  </div>
                  <select
                    value={selectedPlaylist.transitionDuration || '1.5 seconds'}
                    onChange={e => updatePlaylist(selectedPlaylist.id, { transitionDuration: e.target.value })}
                    style={{
                      width: '100%',
                      padding: '7px 10px',
                      borderRadius: 8,
                      background: 'rgba(0, 0, 0, 0.35)',
                      border: '1px solid rgba(255, 255, 255, 0.1)',
                      color: '#ffffff',
                      fontSize: 12,
                      outline: 'none',
                      cursor: 'pointer',
                    }}
                  >
                    <option value="0.5 seconds">0.5 seconds</option>
                    <option value="1.0 seconds">1.0 seconds</option>
                    <option value="1.5 seconds">1.5 seconds</option>
                    <option value="2.0 seconds">2.0 seconds</option>
                  </select>
                </div>
              </div>
            </div>

            {/* 3. Wallpapers Grid Section */}
            <div>
              {/* Header */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
                  <span style={{ fontSize: 15, fontWeight: 700, color: '#f8fafc' }}>
                    Wallpapers ({playlistWallpapers.length})
                  </span>
                  <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                    Drag to reorder • Each wallpaper will display for {selectedPlaylist.intervalMins || 30} minutes
                  </span>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedPickerIds(new Set())
                      setPickerSearch('')
                      setIsAddPickerOpen(true)
                    }}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6,
                      padding: '6px 14px',
                      borderRadius: 8,
                      background: 'rgba(37, 99, 235, 0.2)',
                      border: '1px solid rgba(37, 99, 235, 0.45)',
                      color: '#60a5fa',
                      fontSize: 12,
                      fontWeight: 600,
                      cursor: 'pointer',
                    }}
                  >
                    <Plus size={13} /> Add Wallpapers
                  </button>

                  <button
                    type="button"
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 5,
                      padding: '6px 12px',
                      borderRadius: 8,
                      background: 'rgba(0, 0, 0, 0.35)',
                      border: '1px solid rgba(255, 255, 255, 0.1)',
                      color: 'var(--text-muted)',
                      fontSize: 12,
                      cursor: 'pointer',
                    }}
                  >
                    <span>Sort</span>
                    <ChevronDown size={12} />
                  </button>
                </div>
              </div>

              {/* Grid of Cards */}
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
                gap: 16,
              }}>
                {playlistWallpapers.map((wp, index) => {
                  const isImage = wp.mediaType === 'image'
                  const isVideo = wp.mediaType === 'video'
                  const isYoutube = wp.source === 'youtube'
                  const isLocal = wp.source !== 'youtube'

                  return (
                    <div
                      key={`${wp.id}-${index}`}
                      draggable
                      onDragStart={(e) => handleDragStart(e, index)}
                      onDragOver={(e) => handleDragOver(e, index)}
                      onDrop={(e) => handleDrop(e, index)}
                      style={{
                        position: 'relative',
                        borderRadius: 12,
                        overflow: 'hidden',
                        aspectRatio: '16/9',
                        background: '#070b14',
                        border: dragOverIndex === index ? '2px solid #2563eb' : '1px solid rgba(255, 255, 255, 0.08)',
                        boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
                        transition: 'transform 0.18s ease, border-color 0.18s ease',
                        cursor: 'grab',
                      }}
                      onMouseEnter={e => {
                        e.currentTarget.style.transform = 'translateY(-2px)'
                      }}
                      onMouseLeave={e => {
                        e.currentTarget.style.transform = 'translateY(0)'
                      }}
                    >
                      {/* Wallpaper Image Thumbnail (Static cached image = 0% CPU overhead!) */}
                      <img
                        src={wp.preview || wp.thumbnail}
                        alt={wp.name}
                        style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                        onError={(e) => {
                          e.target.style.display = 'none'
                        }}
                      />

                      {/* Top Left: Order Tag (#1, #2...) */}
                      <div style={{
                        position: 'absolute',
                        top: 8,
                        left: 8,
                        fontSize: 10,
                        fontWeight: 700,
                        padding: '2px 7px',
                        borderRadius: 5,
                        background: 'rgba(0, 0, 0, 0.75)',
                        border: '1px solid rgba(255, 255, 255, 0.15)',
                        color: '#f8fafc',
                        backdropFilter: 'blur(6px)',
                        zIndex: 2,
                      }}>
                        #{index + 1}
                      </div>

                      {/* Top Right: Drag Grip Handle */}
                      <div
                        className="playlist-drag-handle"
                        style={{
                          position: 'absolute',
                          top: 6,
                          right: 6,
                          background: 'rgba(0, 0, 0, 0.65)',
                          borderRadius: 5,
                          padding: 3,
                          color: '#fff',
                          zIndex: 2,
                        }}
                        title="Drag to reorder"
                      >
                        <GripVertical size={14} />
                      </div>

                      {/* Scrim Overlay */}
                      <div style={{
                        position: 'absolute',
                        inset: 0,
                        background: 'linear-gradient(to top, rgba(7, 11, 20, 0.95) 0%, rgba(7, 11, 20, 0.4) 45%, transparent 100%)',
                        pointerEvents: 'none',
                      }} />

                      {/* Bottom Info Lockup */}
                      <div style={{
                        position: 'absolute',
                        bottom: 8,
                        left: 10,
                        right: 10,
                        zIndex: 2,
                      }}>
                        {/* Media Source Badges */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 4 }}>
                          <span style={{
                            fontSize: 9,
                            fontWeight: 700,
                            padding: '1.5px 5px',
                            borderRadius: 4,
                            background: isImage ? 'rgba(16, 185, 129, 0.25)' : 'rgba(168, 85, 247, 0.25)',
                            color: isImage ? '#34d399' : '#c084fc',
                            border: '1px solid rgba(255, 255, 255, 0.1)',
                          }}>
                            {isImage ? 'IMAGE' : 'VIDEO'}
                          </span>

                          <span style={{
                            fontSize: 9,
                            fontWeight: 700,
                            padding: '1.5px 5px',
                            borderRadius: 4,
                            background: isYoutube ? 'rgba(239, 68, 68, 0.25)' : 'rgba(59, 130, 246, 0.25)',
                            color: isYoutube ? '#f87171' : '#60a5fa',
                            border: '1px solid rgba(255, 255, 255, 0.1)',
                          }}>
                            {isYoutube ? 'YOUTUBE' : 'LOCAL'}
                          </span>
                        </div>

                        {/* Title & Author */}
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}>
                          <div>
                            <div style={{ fontSize: 12.5, fontWeight: 700, color: '#f8fafc', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                              {wp.name}
                            </div>
                            <div style={{ fontSize: 10.5, color: 'var(--text-muted)' }}>
                              by {wp.author || 'NatureLabs'}
                            </div>
                          </div>

                          {/* Options Button */}
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation()
                              removeWallpaperFromPlaylist(selectedPlaylist.id, wp.id)
                              setTimeout(() => syncPlaylistTimersToRust(), 50)
                              showToast(`Removed "${wp.name}"`)
                            }}
                            title="Remove wallpaper"
                            style={{
                              background: 'transparent',
                              border: 'none',
                              color: 'var(--text-muted)',
                              cursor: 'pointer',
                              padding: 4,
                            }}
                          >
                            <MoreHorizontal size={14} />
                          </button>
                        </div>

                        {/* Hashtags */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 3 }}>
                          {(wp.tags || ['#nature', '#snow']).map((t, i) => (
                            <span key={i} style={{ fontSize: 10, color: 'rgba(255, 255, 255, 0.45)' }}>
                              {t}
                            </span>
                          ))}
                        </div>
                      </div>
                    </div>
                  )
                })}

                {/* 4th Card: Add More Wallpapers Dropzone */}
                <div
                  className="playlist-dropzone-card"
                  onClick={() => {
                    setSelectedPickerIds(new Set())
                    setPickerSearch('')
                    setIsAddPickerOpen(true)
                  }}
                >
                  <div style={{
                    width: 44,
                    height: 44,
                    borderRadius: '50%',
                    background: 'rgba(37, 99, 235, 0.15)',
                    border: '1.5px solid rgba(37, 99, 235, 0.5)',
                    color: '#60a5fa',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    marginBottom: 10,
                  }}>
                    <Plus size={20} />
                  </div>
                  <div style={{ fontSize: 13.5, fontWeight: 700, color: '#f8fafc' }}>
                    Add More Wallpapers
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
                    Drag & drop or click to add
                  </div>
                </div>
              </div>
            </div>
          </div>
        ) : null}
      </div>

      {/* Bottom Player Dock matching reference screenshot */}
      {selectedPlaylist && (
        <div style={{
          position: 'fixed',
          bottom: 0,
          left: 0,
          right: 0,
          zIndex: 900,
          background: 'rgba(9, 13, 22, 0.95)',
          borderTop: '1px solid rgba(255, 255, 255, 0.08)',
          backdropFilter: 'blur(16px)',
          padding: '10px 32px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 16,
        }}>
          {/* Left: Active Playlist summary */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{
              width: 36,
              height: 36,
              borderRadius: 6,
              overflow: 'hidden',
              background: '#070b14',
              border: '1px solid rgba(255, 255, 255, 0.15)',
              flexShrink: 0,
            }}>
              <img src={heroCoverImage} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            </div>
            <div>
              <div style={{ fontSize: 12.5, fontWeight: 700, color: '#ffffff' }}>
                {selectedPlaylist.name}
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                {playlistWallpapers.length} wallpapers • {selectedPlaylist.intervalMins || 30} min
              </div>
            </div>
          </div>

          {/* Right Status Badges */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            {/* Active Wallpapers Pill */}
            <span style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 5,
              fontSize: 11,
              fontWeight: 600,
              padding: '3px 9px',
              borderRadius: 999,
              background: 'rgba(16, 185, 129, 0.15)',
              color: '#10b981',
              border: '1px solid rgba(16, 185, 129, 0.3)',
            }}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#10b981' }} />
              2 Wallpapers Active
            </span>

            {/* Sync Status */}
            <span style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4,
              fontSize: 11,
              fontWeight: 600,
              padding: '3px 9px',
              borderRadius: 999,
              background: 'rgba(255, 255, 255, 0.06)',
              color: '#f8fafc',
              border: '1px solid rgba(255, 255, 255, 0.1)',
            }}>
              <RefreshCw size={11} style={{ color: '#10b981' }} />
              Sync On
            </span>

            {/* Audio On */}
            <span style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4,
              fontSize: 11,
              fontWeight: 600,
              padding: '3px 9px',
              borderRadius: 999,
              background: 'rgba(59, 130, 246, 0.15)',
              color: '#60a5fa',
              border: '1px solid rgba(59, 130, 246, 0.3)',
            }}>
              <Volume2 size={11} />
              Audio On
            </span>

            {/* Memory Footprint */}
            <span style={{
              fontSize: 11,
              fontWeight: 600,
              padding: '3px 9px',
              borderRadius: 999,
              background: 'rgba(255, 255, 255, 0.05)',
              color: 'var(--text-muted)',
              border: '1px solid rgba(255, 255, 255, 0.08)',
            }}>
              ⚡ 158 MB
            </span>
          </div>
        </div>
      )}

      {/* Edit Playlist Modal */}
      {isEditModalOpen && (
        <div style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0,0,0,0.85)',
          backdropFilter: 'blur(12px)',
          WebkitBackdropFilter: 'blur(12px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 9999,
          padding: 20,
        }}>
          <div className="card animate-fadeIn" style={{
            width: '100%',
            maxWidth: 520,
            background: 'var(--bg-card)',
            border: '1px solid var(--border-main)',
            borderRadius: 16,
            padding: 24,
            boxShadow: '0 24px 64px rgba(0,0,0,0.7)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
              <h3 style={{ margin: 0, fontSize: 17, fontWeight: 700, color: '#f8fafc' }}>
                Edit Playlist Details
              </h3>
              <button className="btn-icon" onClick={() => setIsEditModalOpen(false)}><X size={16} /></button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 5 }}>
                  Playlist Name
                </label>
                <input
                  type="text"
                  value={editName}
                  onChange={e => setEditName(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    borderRadius: 8,
                    background: 'rgba(0,0,0,0.35)',
                    border: '1px solid var(--border-main)',
                    color: '#ffffff',
                    fontSize: 13,
                    outline: 'none',
                  }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 5 }}>
                  Description
                </label>
                <input
                  type="text"
                  value={editDesc}
                  onChange={e => setEditDesc(e.target.value)}
                  placeholder="e.g. 3 wallpapers in sequential rotation."
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    borderRadius: 8,
                    background: 'rgba(0,0,0,0.35)',
                    border: '1px solid var(--border-main)',
                    color: '#ffffff',
                    fontSize: 13,
                    outline: 'none',
                  }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 5 }}>
                  Hashtags (separated by spaces)
                </label>
                <input
                  type="text"
                  value={editTags}
                  onChange={e => setEditTags(e.target.value)}
                  placeholder="#nature #ambient #relaxing"
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    borderRadius: 8,
                    background: 'rgba(0,0,0,0.35)',
                    border: '1px solid var(--border-main)',
                    color: '#ffffff',
                    fontSize: 13,
                    outline: 'none',
                  }}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 10 }}>
                <button className="btn btn-ghost" onClick={() => setIsEditModalOpen(false)}>
                  Cancel
                </button>
                <button className="btn btn-primary" onClick={handleSaveEditModal}>
                  Save Changes
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Add Wallpapers Picker Modal */}
      {isAddPickerOpen && (
        <div style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0,0,0,0.85)',
          backdropFilter: 'blur(12px)',
          WebkitBackdropFilter: 'blur(12px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 9999,
          padding: 20,
        }}>
          <div className="card animate-fadeIn" style={{
            width: '100%',
            maxWidth: 960,
            height: '86vh',
            maxHeight: 740,
            background: 'var(--bg-card)',
            border: '1px solid var(--border-main)',
            borderRadius: 16,
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
            boxShadow: '0 24px 64px rgba(0,0,0,0.65)',
          }}>
            {/* Header */}
            <div style={{
              padding: '16px 22px',
              borderBottom: '1px solid var(--border-subtle)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: 'var(--text-main)' }}>
                    Add Wallpapers to "{selectedPlaylist?.name}"
                  </h3>
                  <span className="badge font-mono" style={{ fontSize: 11 }}>
                    {availableWallpapers.length} available
                  </span>
                </div>
                <p style={{ margin: '3px 0 0', fontSize: 12, color: 'var(--text-muted)' }}>
                  Select wallpapers from your library to add to this playlist rotation
                </p>
              </div>
              <button className="btn-icon" onClick={() => setIsAddPickerOpen(false)}><X size={16} /></button>
            </div>

            {/* Filter toolbar */}
            <div style={{
              padding: '12px 22px',
              borderBottom: '1px solid var(--border-subtle)',
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              background: 'rgba(0,0,0,0.18)',
            }}>
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                background: 'rgba(0,0,0,0.35)',
                border: '1px solid var(--border-main)',
                borderRadius: 8,
                padding: '6px 12px',
                flex: 1,
              }}>
                <Search size={14} className="text-muted" />
                <input
                  type="text"
                  placeholder="Search wallpapers by title, creator, tags..."
                  value={pickerSearch}
                  onChange={e => setPickerSearch(e.target.value)}
                  style={{
                    background: 'transparent',
                    border: 'none',
                    outline: 'none',
                    color: 'var(--text-main)',
                    fontSize: 12.5,
                    width: '100%',
                  }}
                />
              </div>

              <div style={{ display: 'flex', gap: 6 }}>
                {[
                  { id: 'all', label: 'All' },
                  { id: 'image', label: 'Pictures' },
                  { id: 'video', label: 'Videos' },
                  { id: 'stream', label: 'Streams' },
                  { id: 'procedural', label: 'Procedural' },
                ].map(t => (
                  <button
                    key={t.id}
                    type="button"
                    className={`aether-filter-chip ${pickerTab === t.id ? 'active' : ''}`}
                    onClick={() => setPickerTab(t.id)}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Grid */}
            <div style={{
              padding: '18px 22px',
              overflowY: 'auto',
              flex: 1,
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
              gridAutoRows: 'max-content',
              gap: 14,
            }}>
              {pickerCandidates.map(wp => {
                const isChecked = selectedPickerIds.has(wp.id)
                return (
                  <div
                    key={wp.id}
                    onClick={() => {
                      const next = new Set(selectedPickerIds)
                      if (next.has(wp.id)) next.delete(wp.id)
                      else next.add(wp.id)
                      setSelectedPickerIds(next)
                    }}
                    style={{
                      position: 'relative',
                      borderRadius: 10,
                      overflow: 'hidden',
                      aspectRatio: '16/9',
                      cursor: 'pointer',
                      border: isChecked ? '2px solid #2563eb' : '1px solid var(--border-subtle)',
                      boxShadow: isChecked ? '0 0 14px rgba(37, 99, 235, 0.45)' : 'none',
                      background: '#070b14',
                    }}
                  >
                    <img src={wp.preview || wp.thumbnail} alt={wp.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    <div style={{
                      position: 'absolute',
                      inset: 0,
                      background: 'linear-gradient(to top, rgba(0,0,0,0.85) 0%, transparent 60%)',
                    }} />
                    <div style={{ position: 'absolute', bottom: 6, left: 8, right: 8, fontSize: 11, fontWeight: 600, color: '#fff' }} className="truncate">
                      {wp.name}
                    </div>
                    {isChecked && (
                      <div style={{
                        position: 'absolute',
                        top: 6,
                        right: 6,
                        width: 20,
                        height: 20,
                        borderRadius: 5,
                        background: '#2563eb',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: '#fff',
                      }}>
                        <Check size={13} strokeWidth={3} />
                      </div>
                    )}
                  </div>
                )
              })}
            </div>

            {/* Footer */}
            <div style={{
              padding: '14px 22px',
              borderTop: '1px solid var(--border-subtle)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              background: 'rgba(0,0,0,0.25)',
            }}>
              <span className="text-xs text-muted">
                <strong style={{ color: '#fff' }}>{selectedPickerIds.size}</strong> selected
              </span>

              <div className="flex gap-2">
                <button className="btn btn-ghost" onClick={() => setIsAddPickerOpen(false)}>
                  Cancel
                </button>
                <button
                  className="btn btn-primary"
                  onClick={() => {
                    if (selectedPlaylist && selectedPickerIds.size > 0) {
                      addWallpapersToPlaylist(selectedPlaylist.id, Array.from(selectedPickerIds))
                      setTimeout(() => syncPlaylistTimersToRust(), 50)
                      showToast(`Added ${selectedPickerIds.size} wallpaper(s)`)
                    }
                    setIsAddPickerOpen(false)
                  }}
                  disabled={selectedPickerIds.size === 0}
                >
                  <Plus size={14} /> Add Selected ({selectedPickerIds.size})
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
