import React, { useState, useEffect, useMemo } from 'react'
import {
  ListMusic,
  Plus,
  Play,
  Pause,
  Shuffle,
  Repeat,
  Monitor,
  Trash2,
  Check,
  X,
  Sparkles,
  SkipForward,
  SkipBack,
  Search,
  MoreHorizontal,
  Pencil,
  GripVertical,
  Heart,
  Volume2,
  RefreshCw,
  ChevronDown,
  CheckCircle2,
  Copy,
  AlertTriangle,
} from 'lucide-react'
import { useStore } from '../store/useStore.js'
import { rotateNext, rotatePrev, syncPlaylistTimersToRust } from '../lib/playlistManager.js'
import { tauriInvoke, applyWallpaperToDesktop } from '../lib/wallpaperActions.js'
import { WALLPAPER_LIST } from '../engines/index.js'
import WallpaperThumbnail from '../components/WallpaperThumbnail/index.jsx'
import { getCardBadges } from '../components/WallpaperCard/index.jsx'

const INTERVAL_PRESETS = [
  { label: '1 min', value: 1 },
  { label: '5 min', value: 5 },
  { label: '10 min', value: 10 },
  { label: '15 min', value: 15 },
  { label: '30 min', value: 30 },
  { label: '1 hour', value: 60 },
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

  // One-time cleanup for any legacy mockup playlists that had invalid fake IDs
  useEffect(() => {
    const existing = useStore.getState().playlists || []
    let needsUpdate = false
    const cleaned = existing.map(p => {
      if (p.wallpaperIds && p.wallpaperIds.some(id => id.startsWith('wp-'))) {
        needsUpdate = true
        return {
          ...p,
          wallpaperIds: p.wallpaperIds.filter(id => !id.startsWith('wp-')),
        }
      }
      return p
    })
    if (needsUpdate) {
      useStore.setState({ playlists: cleaned })
    }
  }, [])

  const playlists = storePlaylists

  const [selectedId, setSelectedId] = useState(() => playlists[0]?.id || null)
  const [monitors, setMonitors] = useState([])
  const [isAddPickerOpen, setIsAddPickerOpen] = useState(false)
  const [isEditModalOpen, setIsEditModalOpen] = useState(false)
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false)
  const [deleteConfirmId, setDeleteConfirmId] = useState(null)
  const [pickerSearch, setPickerSearch] = useState('')
  const [pickerTab, setPickerTab] = useState('all')
  const [selectedPickerIds, setSelectedPickerIds] = useState(new Set())
  const [isRotatingNow, setIsRotatingNow] = useState(false)
  const [sidebarSearch, setSidebarSearch] = useState('')
  const [draggedIndex, setDraggedIndex] = useState(null)
  const [dragOverIndex, setDragOverIndex] = useState(null)
  const [toastMessage, setToastMessage] = useState(null)

  // Create Playlist form state
  const [newPlaylistName, setNewPlaylistName] = useState('')
  const [newPlaylistInterval, setNewPlaylistInterval] = useState(15)
  const [newPlaylistOrder, setNewPlaylistOrder] = useState('shuffle')

  // Edit Playlist form state
  const [editName, setEditName] = useState('')
  const [editDesc, setEditDesc] = useState('')
  const [editTags, setEditTags] = useState('')

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
    } else if (selectedId && !playlists.some(p => p.id === selectedId)) {
      setSelectedId(playlists[0]?.id || null)
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

  // Apply individual wallpaper directly to desktop
  const handleApplyWallpaperNow = async (wp) => {
    try {
      const targetMonitor = currentMonitorScope === '*' ? null : currentMonitorScope
      await applyWallpaperToDesktop(wp, { targetMonitor })
      showToast(`Applied "${wp.name}" to desktop`)
    } catch (e) {
      console.error('[Playlist] Failed to apply wallpaper:', e)
    }
  }

  // Open Create Modal
  const handleOpenCreateModal = () => {
    setNewPlaylistName(`Playlist ${playlists.length + 1}`)
    setNewPlaylistInterval(15)
    setNewPlaylistOrder('shuffle')
    setIsCreateModalOpen(true)
  }

  // Confirm Create Playlist
  const handleConfirmCreate = () => {
    const name = newPlaylistName.trim() || `Playlist ${playlists.length + 1}`
    createPlaylist(name, {
      wallpaperIds: [],
      order: newPlaylistOrder,
      intervalMins: newPlaylistInterval,
      targetMonitor: '*',
    })
    setIsCreateModalOpen(false)
    setTimeout(() => {
      const updated = useStore.getState().playlists || []
      const latest = updated[updated.length - 1]
      if (latest) {
        setSelectedId(latest.id)
        showToast(`Created "${name}"`)
        // Prompt user immediately to add wallpapers
        setSelectedPickerIds(new Set())
        setPickerSearch('')
        setIsAddPickerOpen(true)
      }
    }, 50)
  }

  // Quick-Start: Create a starter playlist with real procedural engines
  const handleCreateStarterPlaylist = () => {
    const name = 'Procedural Showcase'
    const starterIds = ['matrix-rain', 'cyber-particles', 'synthwave-grid', 'deep-space']
    createPlaylist(name, {
      wallpaperIds: starterIds,
      order: 'shuffle',
      intervalMins: 15,
      targetMonitor: '*',
      tags: ['#procedural', '#60fps', '#minimal'],
    })
    setTimeout(() => {
      const updated = useStore.getState().playlists || []
      const latest = updated[updated.length - 1]
      if (latest) {
        setSelectedId(latest.id)
        showToast(`Created "${name}" with 4 procedural engines`)
      }
    }, 50)
  }

  // Delete Playlist (supports deleting ANY playlist)
  const handleDeletePlaylist = (playlistId) => {
    const pl = playlists.find(p => p.id === playlistId)
    const name = pl?.name || 'this playlist'
    deletePlaylist(playlistId)
    setDeleteConfirmId(null)
    setTimeout(() => syncPlaylistTimersToRust(), 50)
    showToast(`Deleted playlist "${name}"`)
    const remaining = (useStore.getState().playlists || []).filter(p => p.id !== playlistId)
    if (remaining.length > 0) {
      setSelectedId(remaining[0].id)
    } else {
      setSelectedId(null)
    }
  }

  // Duplicate current playlist
  const handleDuplicate = () => {
    if (!selectedPlaylist) return
    const dupName = `${selectedPlaylist.name} (Copy)`
    createPlaylist(dupName, {
      wallpaperIds: [...(selectedPlaylist.wallpaperIds || [])],
      order: selectedPlaylist.order || 'shuffle',
      intervalMins: selectedPlaylist.intervalMins || 15,
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

  // Native HTML5 Drag and Drop for Wallpaper Cards
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

  // Real wallpapers only: built-in procedural engines + user-installed media
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
      author: 'AetherFlow Core',
    }))

    const customs = (installed || [])
      .filter(i => i && i.type === 'wallpaper')
      .map(i => ({
        ...i,
        name: names[i.id] || i.name,
        engine: i.engine || (i.config?.videoPath ? 'video-player' : 'image-player'),
        isCustom: true,
        mediaType: i.mediaType || (i.config?.videoPath ? 'video' : 'image'),
        source: i.source || 'local',
        author: i.author || 'Local User',
        tags: Array.isArray(i.tags) ? i.tags.map(t => t.startsWith('#') ? t : `#${t}`) : ['#wallpaper'],
      }))

    return [...customs, ...builtins]
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
      if (pickerTab === 'image') return w.mediaType === 'image' || w.engine === 'image-player'
      if (pickerTab === 'video') return w.mediaType === 'video' || w.engine === 'video-player'
      if (pickerTab === 'stream') return w.engine === 'web-stream' || w.source === 'youtube'
      if (pickerTab === 'procedural') return w.builtin || (w.engine && !['video-player', 'image-player', 'web-stream'].includes(w.engine))
      return true
    })
  }, [availableWallpapers, pickerSearch, pickerTab])

  // Filtered sidebar playlists
  const filteredPlaylists = useMemo(() => {
    if (!sidebarSearch) return playlists
    const q = sidebarSearch.toLowerCase()
    return playlists.filter(p => p.name?.toLowerCase().includes(q))
  }, [playlists, sidebarSearch])

  // Open Edit Modal
  const handleOpenEditModal = () => {
    if (!selectedPlaylist) return
    setEditName(selectedPlaylist.name || '')
    setEditDesc(selectedPlaylist.description || '')
    setEditTags(Array.isArray(selectedPlaylist.tags) ? selectedPlaylist.tags.join(' ') : '')
    setIsEditModalOpen(true)
  }

  // Save Edit Modal
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
      <div style={{ marginBottom: 22, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 700, margin: 0, color: '#ffffff', letterSpacing: '-0.02em' }}>
            Wallpaper Playlists
          </h1>
          <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: '4px 0 0 0' }}>
            Create, organize, and enjoy wallpaper collections that cycle smoothly across your displays.
          </p>
        </div>
        <button
          type="button"
          onClick={handleOpenCreateModal}
          className="btn btn-primary"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 7,
            padding: '8px 16px',
            fontSize: 12.5,
            fontWeight: 700,
            borderRadius: 8,
          }}
        >
          <Plus size={15} /> New Playlist
        </button>
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
              onClick={handleOpenCreateModal}
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
            {filteredPlaylists.length === 0 ? (
              <div style={{ padding: '24px 12px', textAlign: 'center', color: 'var(--text-muted)', fontSize: 12 }}>
                {playlists.length === 0 ? 'No playlists yet. Click + to create one.' : 'No playlists match your search.'}
              </div>
            ) : (
              filteredPlaylists.map(pl => {
                const isSel = pl.id === selectedId
                const count = pl.wallpaperIds?.length || 0
                const intervalText = pl.intervalMins >= 60 ? `${pl.intervalMins / 60} hour` : `${pl.intervalMins || 15} min`
                const firstWp = allWallpapers.find(w => w.id === pl.wallpaperIds?.[0])

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
                      position: 'relative',
                    }}
                  >
                    {/* Thumbnail: Render genuine wallpaper preview or ListMusic icon */}
                    <div style={{
                      width: 44,
                      height: 44,
                      borderRadius: 8,
                      overflow: 'hidden',
                      background: '#070b14',
                      border: '1px solid rgba(255, 255, 255, 0.1)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0,
                      position: 'relative',
                    }}>
                      {firstWp ? (
                        <WallpaperThumbnail wallpaper={firstWp} mode="off" style={{ width: '100%', height: '100%' }} />
                      ) : (
                        <ListMusic size={18} style={{ color: 'var(--text-muted)' }} />
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
                        <span>{count} wallpaper{count === 1 ? '' : 's'}</span>
                        <span>•</span>
                        <span>{intervalText}</span>
                        <Monitor size={11} style={{ marginLeft: 2, opacity: 0.7 }} />
                      </div>
                    </div>

                    {/* Quick Delete button in sidebar */}
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation()
                        setDeleteConfirmId(pl.id)
                      }}
                      title="Delete playlist"
                      style={{
                        background: 'transparent',
                        border: 'none',
                        color: 'rgba(239, 68, 68, 0.65)',
                        cursor: 'pointer',
                        padding: 4,
                        borderRadius: 4,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                      onMouseEnter={e => e.currentTarget.style.color = '#ef4444'}
                      onMouseLeave={e => e.currentTarget.style.color = 'rgba(239, 68, 68, 0.65)'}
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                )
              })
            )}
          </div>
        </div>

        {/* Right Main Column */}
        {playlists.length === 0 ? (
          /* Empty State when no playlists exist */
          <div style={{
            background: 'rgba(13, 17, 28, 0.75)',
            border: '1px solid rgba(255, 255, 255, 0.08)',
            borderRadius: 16,
            padding: '60px 24px',
            textAlign: 'center',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 16,
            boxShadow: 'var(--shadow-card)',
          }}>
            <div style={{
              width: 64,
              height: 64,
              borderRadius: '50%',
              background: 'rgba(37, 99, 235, 0.15)',
              border: '1px solid rgba(37, 99, 235, 0.35)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#60a5fa',
              marginBottom: 4,
            }}>
              <ListMusic size={30} />
            </div>
            <div>
              <h3 style={{ fontSize: 19, fontWeight: 700, color: '#f8fafc', margin: '0 0 8px 0' }}>
                No Playlists Yet
              </h3>
              <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: 0, maxWidth: 440, lineHeight: 1.5 }}>
                Create custom playlists to automatically cycle your favorite wallpapers, video loops, and procedural engines across your displays.
              </p>
            </div>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', justifyContent: 'center', marginTop: 12 }}>
              <button
                type="button"
                onClick={handleOpenCreateModal}
                className="btn btn-primary"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: '10px 22px',
                  borderRadius: 8,
                  fontWeight: 700,
                  fontSize: 13,
                }}
              >
                <Plus size={16} /> Create Custom Playlist
              </button>
              <button
                type="button"
                onClick={handleCreateStarterPlaylist}
                className="btn btn-secondary"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: '10px 20px',
                  borderRadius: 8,
                  fontWeight: 600,
                  fontSize: 13,
                }}
              >
                <Sparkles size={16} /> Quick-Start with Procedural Engines
              </button>
            </div>
          </div>
        ) : selectedPlaylist ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
            
            {/* 1. Panoramic Hero Banner */}
            <div className="playlist-hero-panoramic" style={{ background: '#090e1a' }}>
              <div className="playlist-hero-panoramic-scrim" />

              {/* Background ambient thumbnail preview if available */}
              {playlistWallpapers[0] && (
                <div style={{
                  position: 'absolute',
                  inset: 0,
                  opacity: 0.25,
                  filter: 'blur(32px) saturate(1.4)',
                  pointerEvents: 'none',
                  zIndex: 0,
                  overflow: 'hidden',
                }}>
                  <WallpaperThumbnail wallpaper={playlistWallpapers[0]} mode="off" style={{ width: '100%', height: '100%' }} />
                </div>
              )}

              {/* Top Row: Edit and Options */}
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

                {/* Delete button directly accessible */}
                <button
                  type="button"
                  onClick={() => setDeleteConfirmId(selectedPlaylist.id)}
                  title="Delete playlist"
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    padding: '6px 12px',
                    borderRadius: 8,
                    background: 'rgba(239, 68, 68, 0.15)',
                    border: '1px solid rgba(239, 68, 68, 0.4)',
                    color: '#f87171',
                    fontSize: 12,
                    fontWeight: 600,
                    cursor: 'pointer',
                    backdropFilter: 'blur(10px)',
                  }}
                >
                  <Trash2 size={13} /> Delete
                </button>
              </div>

              {/* Bottom Main Content & Media Controls */}
              <div style={{ position: 'relative', zIndex: 1, display: 'flex', alignItems: 'center', gap: 20 }}>
                {/* Artwork Thumbnail using WallpaperThumbnail */}
                <div style={{
                  width: 86,
                  height: 86,
                  borderRadius: 12,
                  overflow: 'hidden',
                  background: '#070b14',
                  border: '1.5px solid rgba(255, 255, 255, 0.2)',
                  boxShadow: '0 8px 24px rgba(0, 0, 0, 0.6)',
                  flexShrink: 0,
                  position: 'relative',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}>
                  {playlistWallpapers[0] ? (
                    <WallpaperThumbnail wallpaper={playlistWallpapers[0]} mode="off" style={{ width: '100%', height: '100%' }} />
                  ) : (
                    <ListMusic size={32} style={{ color: 'var(--text-muted)' }} />
                  )}
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

                  {/* Dynamic Description */}
                  <div style={{ fontSize: 12.5, color: 'rgba(255, 255, 255, 0.7)' }}>
                    {selectedPlaylist.description || `${playlistWallpapers.length} wallpaper${playlistWallpapers.length === 1 ? '' : 's'} in ${selectedPlaylist.order === 'shuffle' ? 'dynamic shuffle' : 'sequential rotation'}.`}
                  </div>

                  {/* Tags */}
                  {selectedPlaylist.tags && selectedPlaylist.tags.length > 0 && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 2 }}>
                      {selectedPlaylist.tags.map((tag, idx) => (
                        <span key={idx} style={{ fontSize: 11.5, color: 'rgba(255, 255, 255, 0.55)' }}>
                          {tag}
                        </span>
                      ))}
                    </div>
                  )}

                  {/* Action Controls Row */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 8 }}>
                    {/* Big Play / Pause Button */}
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
                    <button
                      type="button"
                      onClick={() => setDeleteConfirmId(selectedPlaylist.id)}
                      className="playlist-media-ctrl-btn"
                      title="Delete playlist"
                      style={{ color: '#f87171' }}
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* 2. Control Deck Panel */}
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
                    <option value="*">🖥️ All Displays (Mirrored or Global)</option>
                    {monitors.map(m => (
                      <option key={m.id || m.name} value={m.name || m.id}>
                        📺 Display: {m.name || m.id} {m.is_primary ? '(Primary)' : ''}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Rotation Interval Pills */}
                <div>
                  <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 6 }}>
                    Rotation Interval
                  </div>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    {INTERVAL_PRESETS.map(preset => {
                      const isSel = (selectedPlaylist.intervalMins || 15) === preset.value
                      return (
                        <button
                          key={preset.value}
                          type="button"
                          onClick={() => {
                            updatePlaylist(selectedPlaylist.id, { intervalMins: preset.value })
                            setTimeout(() => syncPlaylistTimersToRust(), 50)
                            showToast(`Interval set to ${preset.label}`)
                          }}
                          style={{
                            padding: '6px 12px',
                            borderRadius: 7,
                            fontSize: 12,
                            fontWeight: 600,
                            border: isSel ? '1px solid #2563eb' : '1px solid rgba(255, 255, 255, 0.08)',
                            background: isSel ? '#2563eb' : 'rgba(0, 0, 0, 0.35)',
                            color: '#ffffff',
                            cursor: 'pointer',
                            transition: 'all 0.15s ease',
                          }}
                        >
                          {preset.label}
                        </button>
                      )
                    })}
                  </div>
                </div>
              </div>

              {/* Row 2: Play Order & Transitions */}
              <div style={{
                display: 'grid',
                gridTemplateColumns: '1.2fr 1fr 1fr',
                gap: 20,
                alignItems: 'center',
                paddingTop: 12,
                borderTop: '1px solid rgba(255, 255, 255, 0.06)',
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
                    ].map(ord => {
                      const isSel = (selectedPlaylist.order || 'shuffle') === ord.id
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
                    Drag to reorder • Each wallpaper will display for {selectedPlaylist.intervalMins || 15} minutes
                  </span>
                </div>

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
              </div>

              {/* Grid of Cards */}
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
                gap: 16,
              }}>
                {playlistWallpapers.map((wp, index) => {
                  const { typeBadge, originBadge } = getCardBadges(wp)

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
                      {/* Wallpaper Thumbnail preview using WallpaperThumbnail component */}
                      <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
                        <WallpaperThumbnail wallpaper={wp} style={{ width: '100%', height: '100%' }} />
                      </div>

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
                        zIndex: 3,
                      }}>
                        #{index + 1}
                      </div>

                      {/* Top Right: Drag Grip & Remove Button */}
                      <div style={{
                        position: 'absolute',
                        top: 6,
                        right: 6,
                        display: 'flex',
                        alignItems: 'center',
                        gap: 4,
                        zIndex: 3,
                      }}>
                        <div
                          className="playlist-drag-handle"
                          style={{
                            background: 'rgba(0, 0, 0, 0.65)',
                            borderRadius: 5,
                            padding: 3,
                            color: '#fff',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                          }}
                          title="Drag to reorder"
                        >
                          <GripVertical size={14} />
                        </div>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation()
                            removeWallpaperFromPlaylist(selectedPlaylist.id, wp.id)
                            setTimeout(() => syncPlaylistTimersToRust(), 50)
                            showToast(`Removed "${wp.name}"`)
                          }}
                          title="Remove from playlist"
                          style={{
                            background: 'rgba(0, 0, 0, 0.65)',
                            border: 'none',
                            color: '#f87171',
                            borderRadius: 5,
                            padding: 4,
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                          }}
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>

                      {/* Scrim Overlay */}
                      <div style={{
                        position: 'absolute',
                        inset: 0,
                        background: 'linear-gradient(to top, rgba(7, 11, 20, 0.95) 0%, rgba(7, 11, 20, 0.35) 45%, transparent 100%)',
                        pointerEvents: 'none',
                        zIndex: 1,
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
                          <span className={`wp-badge-pill ${typeBadge.className}`} style={{ fontSize: 9 }}>
                            {typeBadge.label}
                          </span>
                          <span className={`wp-badge-pill ${originBadge.className}`} style={{ fontSize: 9 }}>
                            {originBadge.label}
                          </span>
                        </div>

                        {/* Title & Apply Now Button */}
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}>
                          <div style={{ minWidth: 0, flex: 1 }}>
                            <div style={{ fontSize: 12.5, fontWeight: 700, color: '#f8fafc', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                              {wp.name}
                            </div>
                            <div style={{ fontSize: 10.5, color: 'var(--text-muted)' }}>
                              by {wp.author || 'AetherFlow'}
                            </div>
                          </div>

                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation()
                              handleApplyWallpaperNow(wp)
                            }}
                            title="Apply this wallpaper now"
                            style={{
                              padding: '4px 8px',
                              borderRadius: 6,
                              background: 'rgba(37, 99, 235, 0.25)',
                              border: '1px solid rgba(59, 130, 246, 0.4)',
                              color: '#60a5fa',
                              fontSize: 10.5,
                              fontWeight: 700,
                              cursor: 'pointer',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: 4,
                              flexShrink: 0,
                            }}
                          >
                            <Play size={10} fill="currentColor" /> Apply
                          </button>
                        </div>
                      </div>
                    </div>
                  )
                })}

                {/* Add More Wallpapers Dropzone Card */}
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
                    Click to browse and add
                  </div>
                </div>
              </div>
            </div>
          </div>
        ) : null}
      </div>

      {/* Delete Confirmation Modal */}
      {deleteConfirmId && (
        <div style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0,0,0,0.85)',
          backdropFilter: 'blur(12px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 10000,
          padding: 20,
        }}>
          <div style={{
            width: '100%',
            maxWidth: 420,
            background: 'var(--bg-card, #0f172a)',
            border: '1px solid rgba(239, 68, 68, 0.3)',
            borderRadius: 14,
            padding: 24,
            boxShadow: '0 24px 64px rgba(0,0,0,0.7)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
              <div style={{
                width: 40,
                height: 40,
                borderRadius: '50%',
                background: 'rgba(239, 68, 68, 0.15)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#ef4444',
                flexShrink: 0,
              }}>
                <AlertTriangle size={20} />
              </div>
              <div>
                <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: '#fff' }}>
                  Delete Playlist?
                </h3>
                <p style={{ margin: '3px 0 0', fontSize: 12, color: 'var(--text-muted)' }}>
                  Are you sure you want to delete "{playlists.find(p => p.id === deleteConfirmId)?.name}"? This action cannot be undone.
                </p>
              </div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 20 }}>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setDeleteConfirmId(null)}
                style={{ padding: '8px 16px', fontSize: 12.5 }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => handleDeletePlaylist(deleteConfirmId)}
                style={{
                  padding: '8px 18px',
                  fontSize: 12.5,
                  fontWeight: 700,
                  borderRadius: 8,
                  background: '#ef4444',
                  color: '#fff',
                  border: 'none',
                  cursor: 'pointer',
                }}
              >
                Delete Playlist
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Create New Playlist Modal */}
      {isCreateModalOpen && (
        <div style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0,0,0,0.85)',
          backdropFilter: 'blur(12px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 9999,
          padding: 20,
        }}>
          <div style={{
            width: '100%',
            maxWidth: 480,
            background: 'var(--bg-card, #0f172a)',
            border: '1px solid var(--border-main, rgba(255,255,255,0.12))',
            borderRadius: 14,
            padding: 24,
            boxShadow: '0 24px 64px rgba(0,0,0,0.7)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
              <h3 style={{ margin: 0, fontSize: 17, fontWeight: 700, color: '#fff' }}>
                Create New Playlist
              </h3>
              <button
                type="button"
                onClick={() => setIsCreateModalOpen(false)}
                style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}
              >
                <X size={18} />
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 6 }}>
                  Playlist Name
                </label>
                <input
                  type="text"
                  placeholder="e.g. Synthwave Night, Anime Chill..."
                  value={newPlaylistName}
                  onChange={e => setNewPlaylistName(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '9px 12px',
                    borderRadius: 8,
                    background: 'rgba(0, 0, 0, 0.4)',
                    border: '1px solid rgba(255, 255, 255, 0.12)',
                    color: '#fff',
                    fontSize: 13,
                    outline: 'none',
                    boxSizing: 'border-box',
                  }}
                  autoFocus
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 6 }}>
                  Rotation Interval
                </label>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {INTERVAL_PRESETS.map(p => (
                    <button
                      key={p.value}
                      type="button"
                      onClick={() => setNewPlaylistInterval(p.value)}
                      style={{
                        padding: '6px 12px',
                        borderRadius: 7,
                        fontSize: 12,
                        fontWeight: 600,
                        border: newPlaylistInterval === p.value ? '1px solid #2563eb' : '1px solid rgba(255, 255, 255, 0.08)',
                        background: newPlaylistInterval === p.value ? '#2563eb' : 'rgba(0, 0, 0, 0.35)',
                        color: '#ffffff',
                        cursor: 'pointer',
                      }}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 6 }}>
                  Playback Order
                </label>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button
                    type="button"
                    onClick={() => setNewPlaylistOrder('shuffle')}
                    style={{
                      flex: 1,
                      padding: '8px',
                      borderRadius: 8,
                      fontSize: 12,
                      fontWeight: 600,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 6,
                      border: newPlaylistOrder === 'shuffle' ? '1px solid #2563eb' : '1px solid rgba(255, 255, 255, 0.08)',
                      background: newPlaylistOrder === 'shuffle' ? 'rgba(37, 99, 235, 0.25)' : 'rgba(0, 0, 0, 0.3)',
                      color: newPlaylistOrder === 'shuffle' ? '#60a5fa' : 'var(--text-muted)',
                      cursor: 'pointer',
                    }}
                  >
                    <Shuffle size={13} /> Shuffle
                  </button>
                  <button
                    type="button"
                    onClick={() => setNewPlaylistOrder('linear')}
                    style={{
                      flex: 1,
                      padding: '8px',
                      borderRadius: 8,
                      fontSize: 12,
                      fontWeight: 600,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 6,
                      border: newPlaylistOrder === 'linear' ? '1px solid #2563eb' : '1px solid rgba(255, 255, 255, 0.08)',
                      background: newPlaylistOrder === 'linear' ? 'rgba(37, 99, 235, 0.25)' : 'rgba(0, 0, 0, 0.3)',
                      color: newPlaylistOrder === 'linear' ? '#60a5fa' : 'var(--text-muted)',
                      cursor: 'pointer',
                    }}
                  >
                    <Repeat size={13} /> Sequential
                  </button>
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 22 }}>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setIsCreateModalOpen(false)}
                style={{ padding: '8px 16px', fontSize: 12.5 }}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-primary"
                onClick={handleConfirmCreate}
                style={{ padding: '8px 20px', fontSize: 12.5, fontWeight: 700 }}
              >
                Create Playlist
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Playlist Modal */}
      {isEditModalOpen && selectedPlaylist && (
        <div style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0,0,0,0.85)',
          backdropFilter: 'blur(12px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 9999,
          padding: 20,
        }}>
          <div style={{
            width: '100%',
            maxWidth: 480,
            background: 'var(--bg-card, #0f172a)',
            border: '1px solid var(--border-main, rgba(255,255,255,0.12))',
            borderRadius: 14,
            padding: 24,
            boxShadow: '0 24px 64px rgba(0,0,0,0.7)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
              <h3 style={{ margin: 0, fontSize: 17, fontWeight: 700, color: '#fff' }}>
                Edit Playlist Details
              </h3>
              <button
                type="button"
                onClick={() => setIsEditModalOpen(false)}
                style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}
              >
                <X size={18} />
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 6 }}>
                  Playlist Name
                </label>
                <input
                  type="text"
                  value={editName}
                  onChange={e => setEditName(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '9px 12px',
                    borderRadius: 8,
                    background: 'rgba(0, 0, 0, 0.4)',
                    border: '1px solid rgba(255, 255, 255, 0.12)',
                    color: '#fff',
                    fontSize: 13,
                    outline: 'none',
                    boxSizing: 'border-box',
                  }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 6 }}>
                  Description
                </label>
                <textarea
                  rows={3}
                  value={editDesc}
                  onChange={e => setEditDesc(e.target.value)}
                  placeholder="Optional description for this playlist rotation..."
                  style={{
                    width: '100%',
                    padding: '9px 12px',
                    borderRadius: 8,
                    background: 'rgba(0, 0, 0, 0.4)',
                    border: '1px solid rgba(255, 255, 255, 0.12)',
                    color: '#fff',
                    fontSize: 13,
                    outline: 'none',
                    resize: 'none',
                    boxSizing: 'border-box',
                  }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 6 }}>
                  Hashtags (separated by spaces)
                </label>
                <input
                  type="text"
                  placeholder="#nature #dark #ambient"
                  value={editTags}
                  onChange={e => setEditTags(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '9px 12px',
                    borderRadius: 8,
                    background: 'rgba(0, 0, 0, 0.4)',
                    border: '1px solid rgba(255, 255, 255, 0.12)',
                    color: '#fff',
                    fontSize: 13,
                    outline: 'none',
                    boxSizing: 'border-box',
                  }}
                />
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 22 }}>
              <button
                type="button"
                onClick={() => {
                  setIsEditModalOpen(false)
                  setDeleteConfirmId(selectedPlaylist.id)
                }}
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#ef4444',
                  fontSize: 12.5,
                  fontWeight: 600,
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                }}
              >
                <Trash2 size={13} /> Delete Playlist
              </button>

              <div style={{ display: 'flex', gap: 10 }}>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setIsEditModalOpen(false)}
                  style={{ padding: '8px 16px', fontSize: 12.5 }}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={handleSaveEditModal}
                  style={{ padding: '8px 20px', fontSize: 12.5, fontWeight: 700 }}
                >
                  Save Changes
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Add Wallpapers Picker Modal */}
      {isAddPickerOpen && selectedPlaylist && (
        <div style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0,0,0,0.85)',
          backdropFilter: 'blur(12px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 9999,
          padding: 20,
        }}>
          <div style={{
            width: '100%',
            maxWidth: 960,
            height: '86vh',
            maxHeight: 740,
            background: 'var(--bg-card, #0f172a)',
            border: '1px solid var(--border-main, rgba(255,255,255,0.12))',
            borderRadius: 16,
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
            boxShadow: '0 24px 64px rgba(0,0,0,0.65)',
          }}>
            {/* Header */}
            <div style={{
              padding: '16px 22px',
              borderBottom: '1px solid var(--border-subtle, rgba(255,255,255,0.08))',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: 'var(--text-main, #fff)' }}>
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
              <button
                type="button"
                className="btn-icon"
                onClick={() => setIsAddPickerOpen(false)}
                style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}
              >
                <X size={18} />
              </button>
            </div>

            {/* Filter toolbar */}
            <div style={{
              padding: '12px 22px',
              borderBottom: '1px solid var(--border-subtle, rgba(255,255,255,0.08))',
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              background: 'rgba(0,0,0,0.18)',
              flexWrap: 'wrap',
            }}>
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                background: 'rgba(0,0,0,0.35)',
                border: '1px solid var(--border-main, rgba(255,255,255,0.12))',
                borderRadius: 8,
                padding: '6px 12px',
                flex: 1,
                minWidth: 220,
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
                    color: '#fff',
                    fontSize: 12.5,
                    width: '100%',
                  }}
                />
              </div>

              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {[
                  { id: 'all', label: 'All' },
                  { id: 'procedural', label: 'Procedural' },
                  { id: 'video', label: 'Videos' },
                  { id: 'image', label: 'Pictures' },
                  { id: 'stream', label: 'Streams' },
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

            {/* Grid of Candidates using WallpaperThumbnail */}
            <div style={{
              padding: '18px 22px',
              overflowY: 'auto',
              flex: 1,
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
              gridAutoRows: 'max-content',
              gap: 14,
            }}>
              {pickerCandidates.length === 0 ? (
                <div style={{ gridColumn: '1 / -1', padding: '40px 20px', textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
                  No available wallpapers match this filter.
                </div>
              ) : (
                pickerCandidates.map(wp => {
                  const isChecked = selectedPickerIds.has(wp.id)
                  const { typeBadge } = getCardBadges(wp)
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
                        border: isChecked ? '2px solid #2563eb' : '1px solid rgba(255, 255, 255, 0.1)',
                        boxShadow: isChecked ? '0 0 14px rgba(37, 99, 235, 0.45)' : 'none',
                        background: '#070b14',
                      }}
                    >
                      {/* Thumbnail via WallpaperThumbnail */}
                      <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
                        <WallpaperThumbnail wallpaper={wp} style={{ width: '100%', height: '100%' }} />
                      </div>

                      {/* Scrim Overlay */}
                      <div style={{
                        position: 'absolute',
                        inset: 0,
                        background: 'linear-gradient(to top, rgba(0,0,0,0.85) 0%, transparent 60%)',
                        pointerEvents: 'none',
                      }} />

                      {/* Badge in top left */}
                      <div style={{ position: 'absolute', top: 6, left: 6, zIndex: 2 }}>
                        <span className={`wp-badge-pill ${typeBadge.className}`} style={{ fontSize: 8.5, padding: '1px 5px' }}>
                          {typeBadge.label}
                        </span>
                      </div>

                      {/* Title at bottom */}
                      <div style={{
                        position: 'absolute',
                        bottom: 6,
                        left: 8,
                        right: 8,
                        fontSize: 11,
                        fontWeight: 600,
                        color: '#fff',
                        zIndex: 2,
                      }} className="truncate">
                        {wp.name}
                      </div>

                      {/* Selection Checkbox */}
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
                          boxShadow: '0 2px 8px rgba(0,0,0,0.5)',
                          zIndex: 2,
                        }}>
                          <Check size={13} strokeWidth={3} />
                        </div>
                      )}
                    </div>
                  )
                })
              )}
            </div>

            {/* Footer Actions */}
            <div style={{
              padding: '14px 22px',
              borderTop: '1px solid var(--border-subtle, rgba(255,255,255,0.08))',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              background: 'rgba(0,0,0,0.25)',
            }}>
              <span style={{ fontSize: 12.5, color: 'var(--text-muted)' }}>
                {selectedPickerIds.size} wallpaper{selectedPickerIds.size === 1 ? '' : 's'} selected
              </span>
              <div style={{ display: 'flex', gap: 10 }}>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setIsAddPickerOpen(false)}
                  style={{ padding: '8px 16px', fontSize: 12.5 }}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="btn btn-primary"
                  disabled={selectedPickerIds.size === 0}
                  onClick={() => {
                    const toAdd = Array.from(selectedPickerIds)
                    addWallpapersToPlaylist(selectedPlaylist.id, toAdd)
                    setIsAddPickerOpen(false)
                    setTimeout(() => syncPlaylistTimersToRust(), 50)
                    showToast(`Added ${toAdd.length} wallpaper${toAdd.length === 1 ? '' : 's'} to playlist`)
                  }}
                  style={{ padding: '8px 20px', fontSize: 12.5, fontWeight: 700 }}
                >
                  Add to Playlist
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
