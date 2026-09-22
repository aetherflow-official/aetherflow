import React, { useState, useEffect, useMemo } from 'react'
import {
  ListMusic,
  Plus,
  Play,
  Pause,
  Shuffle,
  Repeat,
  Clock,
  Monitor,
  Trash2,
  Check,
  X,
  Layers,
  Sparkles,
  SkipForward,
  FolderPlus,
  Search,
  ExternalLink,
  Image as ImageIcon,
  Video,
  Globe,
} from 'lucide-react'
import { useStore } from '../store/useStore.js'
import { rotateNext, syncPlaylistTimersToRust } from '../lib/playlistManager.js'
import { tauriInvoke, safeConvertFileSrc } from '../lib/wallpaperActions.js'
import { WALLPAPER_LIST } from '../engines/index.js'
import WallpaperThumbnail from '../components/WallpaperThumbnail/index.jsx'

const INTERVAL_PRESETS = [
  { label: '1 min', value: 1 },
  { label: '5 min', value: 5 },
  { label: '10 min', value: 10 },
  { label: '15 min', value: 15 },
  { label: '30 min', value: 30 },
  { label: '1 hour', value: 60 },
  { label: '2 hours', value: 120 },
  { label: '24 hours', value: 1440 },
]

export default function PlaylistsPage() {
  const playlists = useStore(s => s.playlists) || []
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

  const [selectedId, setSelectedId] = useState(playlists[0]?.id || null)
  const [monitors, setMonitors] = useState([])
  const [isAddPickerOpen, setIsAddPickerOpen] = useState(false)
  const [pickerSearch, setPickerSearch] = useState('')
  const [pickerTab, setPickerTab] = useState('all') // 'all' | 'selected' | 'image' | 'video' | 'stream' | 'procedural'
  const [selectedPickerIds, setSelectedPickerIds] = useState(new Set())
  const [isRotatingNow, setIsRotatingNow] = useState(false)

  // Fetch monitors
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

  const selectedPlaylist = playlists.find(p => p.id === selectedId) || null

  // Target monitor scope directly bound to selected playlist (never resets on pause!)
  const currentMonitorScope = selectedPlaylist?.targetMonitor || '*'

  const isPlaylistActive = Boolean(selectedPlaylist?.enabled)

  // Toggle active rotation with mutual exclusion & immediate visual confirmation
  const handleToggleActive = async (active) => {
    if (!selectedPlaylist) return
    const scope = selectedPlaylist.targetMonitor || '*'
    if (active) {
      activatePlaylist(selectedPlaylist.id, scope)
      setTimeout(() => syncPlaylistTimersToRust(), 50)
      // Immediate visual confirmation on desktop
      setIsRotatingNow(true)
      try {
        await rotateNext(scope, selectedPlaylist.id, true)
      } catch (err) {
        console.warn('[Playlist] Failed to apply initial wallpaper on start:', err)
      } finally {
        setTimeout(() => setIsRotatingNow(false), 400)
      }
    } else {
      deactivatePlaylist(selectedPlaylist.id)
      setTimeout(() => syncPlaylistTimersToRust(), 50)
    }
  }

  // Monitor scope change
  const handleScopeChange = (newScope) => {
    if (!selectedPlaylist) return
    updatePlaylist(selectedPlaylist.id, { targetMonitor: newScope })
    if (selectedPlaylist.enabled) {
      activatePlaylist(selectedPlaylist.id, newScope)
      setTimeout(() => syncPlaylistTimersToRust(), 50)
      // Immediately reflect rotation on newly assigned scope
      rotateNext(newScope, selectedPlaylist.id, true)
    }
  }

  // Manual trigger next
  const handleSkipNext = async () => {
    if (!selectedPlaylist) return
    setIsRotatingNow(true)
    try {
      await rotateNext(currentMonitorScope, selectedPlaylist.id, true)
    } finally {
      setTimeout(() => setIsRotatingNow(false), 400)
    }
  }

  // Create new playlist
  const handleCreateNew = () => {
    const name = `Playlist ${playlists.length + 1}`
    createPlaylist(name, {
      wallpaperIds: [],
      order: 'shuffle',
      intervalMins: 15,
    })
    setTimeout(() => {
      const updated = useStore.getState().playlists || []
      const latest = updated[updated.length - 1]
      if (latest) setSelectedId(latest.id)
    }, 50)
  }

  // Open wallpaper picker
  const handleOpenPicker = () => {
    setSelectedPickerIds(new Set())
    setPickerSearch('')
    setPickerTab('all')
    setIsAddPickerOpen(true)
  }

  // Confirm picker addition
  const handleConfirmPicker = () => {
    if (selectedPlaylist && selectedPickerIds.size > 0) {
      addWallpapersToPlaylist(selectedPlaylist.id, Array.from(selectedPickerIds))
      setTimeout(() => syncPlaylistTimersToRust(), 50)
    }
    setIsAddPickerOpen(false)
  }

  // Combine built-in canvas engines and installed custom wallpapers
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

  // All available wallpapers not yet in current playlist
  const availableWallpapers = useMemo(() => {
    if (!selectedPlaylist) return []
    const existing = new Set(selectedPlaylist.wallpaperIds || [])
    return allWallpapers.filter(w => !existing.has(w.id))
  }, [allWallpapers, selectedPlaylist])

  // Filtered wallpapers for picker
  const pickerCandidates = useMemo(() => {
    return availableWallpapers.filter(w => {
      if (pickerSearch) {
        const q = pickerSearch.toLowerCase()
        const matchesName = w.name?.toLowerCase().includes(q)
        const matchesAuthor = w.author?.toLowerCase().includes(q)
        const matchesTag = Array.isArray(w.tags) && w.tags.some(t => t.toLowerCase().includes(q))
        if (!matchesName && !matchesAuthor && !matchesTag) return false
      }
      if (pickerTab === 'selected') {
        return selectedPickerIds.has(w.id)
      }
      if (pickerTab === 'image') {
        return w.engine === 'image-player' || w.mediaType === 'image' || Boolean(w.config?.imagePath && !w.config?.videoPath)
      }
      if (pickerTab === 'video') {
        return w.engine === 'video-player' || w.mediaType === 'video' || Boolean(w.config?.videoPath)
      }
      if (pickerTab === 'stream') {
        return Boolean(w.config?.streamUrl || w.engine === 'web-stream')
      }
      if (pickerTab === 'procedural') {
        return w.engine && w.engine !== 'video-player' && w.engine !== 'image-player' && w.engine !== 'web-stream'
      }
      return true
    })
  }, [availableWallpapers, pickerSearch, pickerTab, selectedPickerIds])

  // Wallpapers in current playlist
  const playlistWallpapers = useMemo(() => {
    if (!selectedPlaylist) return []
    const ids = selectedPlaylist.wallpaperIds || []
    const idMap = new Map(allWallpapers.map(w => [w.id, w]))
    return ids.map(id => idMap.get(id)).filter(Boolean)
  }, [selectedPlaylist, allWallpapers])

  return (
    <div className="content-page-container" style={{ padding: '24px 32px', height: '100%', overflowY: 'auto' }}>
      {/* Page Header */}
      <div style={{ marginBottom: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0, color: 'var(--text-main)', letterSpacing: '-0.02em' }}>
              Wallpaper Playlists & Auto-Rotation
            </h1>
            <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: '4px 0 0 0' }}>
              Organize your wallpapers into collections that automatically rotate throughout the day.
            </p>
          </div>
          <button className="btn btn-primary" onClick={handleCreateNew} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <Plus size={15} /> New Playlist
          </button>
        </div>
      </div>

      {/* Main Two-Column Layout */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: '290px 1fr',
        gap: 24,
        alignItems: 'start',
        minHeight: 520,
      }}>
        {/* Left Column: Playlists List */}
        <div style={{
          background: 'var(--bg-card)',
          border: '1px solid var(--border-main)',
          borderRadius: 12,
          padding: 14,
          display: 'flex',
          flexDirection: 'column',
          gap: 8,
        }}>
          <div style={{
            fontSize: 11,
            fontWeight: 700,
            textTransform: 'uppercase',
            letterSpacing: '0.06em',
            color: 'var(--text-muted)',
            padding: '4px 8px 8px 8px',
            borderBottom: '1px solid var(--border-subtle)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}>
            <span>Playlists ({playlists.length})</span>
            <Layers size={13} />
          </div>

          {playlists.map(pl => {
            const isSel = pl.id === selectedId
            const isActive = Boolean(pl.enabled)
            const count = pl.wallpaperIds?.length || 0

            return (
              <div
                key={pl.id}
                onClick={() => setSelectedId(pl.id)}
                style={{
                  padding: '10px 12px',
                  borderRadius: 8,
                  cursor: 'pointer',
                  border: isSel ? '1px solid var(--color-brand)' : '1px solid transparent',
                  background: isSel ? 'rgba(var(--rgb-brand), 0.12)' : 'rgba(0,0,0,0.15)',
                  transition: 'all 0.15s ease',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div style={{ fontWeight: 600, fontSize: 13, color: isSel ? 'var(--color-brand)' : 'var(--text-main)' }} className="truncate">
                    {pl.name}
                  </div>
                  {isActive ? (
                    <span style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 4,
                      fontSize: 10,
                      fontWeight: 700,
                      padding: '2px 6px',
                      borderRadius: 4,
                      background: 'rgba(16, 185, 129, 0.2)',
                      color: '#10b981',
                      border: '1px solid rgba(16, 185, 129, 0.3)',
                    }}>
                      <Play size={9} fill="currentColor" /> ACTIVE
                    </span>
                  ) : (
                    <span style={{ fontSize: 10, color: 'var(--text-subtle)', textTransform: 'uppercase' }}>
                      PAUSED
                    </span>
                  )}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4, fontSize: 11, color: 'var(--text-muted)' }}>
                  <span>{count} {count === 1 ? 'item' : 'items'}</span>
                  <span>•</span>
                  <span>⏱ {pl.intervalMins || 15}m</span>
                  <span>•</span>
                  <span>{pl.order === 'shuffle' ? '🔀' : '🔁'}</span>
                  <span>•</span>
                  <span style={{
                    fontSize: 9.5,
                    padding: '1px 5px',
                    borderRadius: 3,
                    background: isActive ? 'rgba(16, 185, 129, 0.12)' : 'rgba(255,255,255,0.06)',
                    color: isActive ? '#10b981' : 'var(--text-subtle)',
                    border: '1px solid rgba(255,255,255,0.06)',
                    fontWeight: 500,
                  }}>
                    {pl.targetMonitor === '*' || !pl.targetMonitor
                      ? 'All Displays'
                      : (monitors.find(m => m.label === pl.targetMonitor)?.displayName || 'Single Display')}
                  </span>
                </div>
              </div>
            )
          })}
        </div>

        {/* Right Column: Selected Playlist Detail */}
        {selectedPlaylist ? (
          <div style={{
            background: 'var(--bg-card)',
            border: '1px solid var(--border-main)',
            borderRadius: 12,
            padding: 24,
            display: 'flex',
            flexDirection: 'column',
            gap: 20,
          }}>
            {/* Header / Cockpit Controls */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 16,
              borderBottom: '1px solid var(--border-subtle)',
              paddingBottom: 18,
            }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <input
                  type="text"
                  value={selectedPlaylist.name}
                  onChange={e => updatePlaylist(selectedPlaylist.id, { name: e.target.value })}
                  style={{
                    fontSize: 18,
                    fontWeight: 700,
                    background: 'transparent',
                    border: 'none',
                    outline: 'none',
                    color: 'var(--text-main)',
                    width: '100%',
                    padding: 0,
                  }}
                  placeholder="Playlist Name"
                />
                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
                  {playlistWallpapers.length} wallpapers in rotation sequence
                </div>
              </div>

              {/* Action Buttons */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
                <button
                  className="btn btn-ghost"
                  onClick={handleSkipNext}
                  disabled={playlistWallpapers.length === 0}
                  title="Force advance to the next wallpaper right now"
                  style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12 }}
                >
                  <SkipForward size={14} className={isRotatingNow ? 'animate-spin' : ''} />
                  <span>Skip to Next</span>
                </button>

                <button
                  type="button"
                  className={`btn ${isPlaylistActive ? 'btn-ghost' : 'btn-primary'}`}
                  onClick={() => handleToggleActive(!isPlaylistActive)}
                  disabled={playlistWallpapers.length === 0}
                  style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 100 }}
                >
                  {isPlaylistActive ? <Pause size={14} /> : <Play size={14} fill="currentColor" />}
                  <span>{isPlaylistActive ? 'Pause' : 'Activate'}</span>
                </button>

                {playlists.length > 1 && (
                  <button
                    className="btn-icon"
                    onClick={() => deletePlaylist(selectedPlaylist.id)}
                    title="Delete this playlist"
                    style={{ color: 'var(--color-rose)', opacity: 0.8 }}
                  >
                    <Trash2 size={15} />
                  </button>
                )}
              </div>
            </div>

            {/* Rotation Configuration Bar */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr 1fr',
              gap: 16,
              background: 'rgba(0,0,0,0.2)',
              border: '1px solid var(--border-subtle)',
              borderRadius: 10,
              padding: 16,
            }}>
              {/* Target Monitor Scope */}
              <div>
                <label className="text-xs font-semibold text-muted uppercase tracking-wider" style={{ display: 'block', marginBottom: 6 }}>
                  Target Display
                </label>
                <select
                  value={currentMonitorScope}
                  onChange={e => handleScopeChange(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '8px 10px',
                    borderRadius: 6,
                    background: 'var(--bg-card)',
                    border: '1px solid var(--border-main)',
                    color: 'var(--text-main)',
                    fontSize: 12,
                    outline: 'none',
                  }}
                >
                  <option value="*">All Displays (Duplicate / Global)</option>
                  {monitors.map((m, idx) => (
                    <option key={m.label} value={m.label}>
                      {m.isPrimary ? `Display ${idx + 1} (Primary)` : `Display ${idx + 1}`}
                    </option>
                  ))}
                </select>
              </div>

              {/* Interval Preset */}
              <div>
                <label className="text-xs font-semibold text-muted uppercase tracking-wider" style={{ display: 'block', marginBottom: 6 }}>
                  Rotation Interval
                </label>
                <select
                  value={selectedPlaylist.intervalMins || 15}
                  onChange={e => {
                    updatePlaylist(selectedPlaylist.id, { intervalMins: Number(e.target.value) })
                    setTimeout(() => syncPlaylistTimersToRust(), 50)
                  }}
                  style={{
                    width: '100%',
                    padding: '8px 10px',
                    borderRadius: 6,
                    background: 'var(--bg-card)',
                    border: '1px solid var(--border-main)',
                    color: 'var(--text-main)',
                    fontSize: 12,
                    outline: 'none',
                  }}
                >
                  {INTERVAL_PRESETS.map(p => (
                    <option key={p.value} value={p.value}>{p.label}</option>
                  ))}
                </select>
              </div>

              {/* Order Mode */}
              <div>
                <label className="text-xs font-semibold text-muted uppercase tracking-wider" style={{ display: 'block', marginBottom: 6 }}>
                  Order Mode
                </label>
                <div style={{ display: 'flex', gap: 4 }}>
                  <button
                    type="button"
                    onClick={() => updatePlaylist(selectedPlaylist.id, { order: 'shuffle' })}
                    style={{
                      flex: 1,
                      padding: '7px 8px',
                      borderRadius: 6,
                      fontSize: 12,
                      fontWeight: 600,
                      border: selectedPlaylist.order === 'shuffle' ? '1px solid var(--color-brand)' : '1px solid var(--border-main)',
                      background: selectedPlaylist.order === 'shuffle' ? 'rgba(var(--rgb-brand), 0.15)' : 'transparent',
                      color: selectedPlaylist.order === 'shuffle' ? 'var(--color-brand)' : 'var(--text-muted)',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 4,
                    }}
                  >
                    <Shuffle size={13} /> Shuffle
                  </button>
                  <button
                    type="button"
                    onClick={() => updatePlaylist(selectedPlaylist.id, { order: 'linear' })}
                    style={{
                      flex: 1,
                      padding: '7px 8px',
                      borderRadius: 6,
                      fontSize: 12,
                      fontWeight: 600,
                      border: selectedPlaylist.order === 'linear' ? '1px solid var(--color-brand)' : '1px solid var(--border-main)',
                      background: selectedPlaylist.order === 'linear' ? 'rgba(var(--rgb-brand), 0.15)' : 'transparent',
                      color: selectedPlaylist.order === 'linear' ? 'var(--color-brand)' : 'var(--text-muted)',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 4,
                    }}
                  >
                    <Repeat size={13} /> Sequential
                  </button>
                </div>
              </div>
            </div>

            {/* Playlist Wallpaper Grid Header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-main)' }}>
                Wallpapers in this Playlist ({playlistWallpapers.length})
              </div>
              <button className="btn btn-ghost" onClick={handleOpenPicker} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
                <Plus size={13} /> Add Wallpapers
              </button>
            </div>

            {/* Wallpapers Grid */}
            {playlistWallpapers.length === 0 ? (
              <div style={{
                padding: '40px 20px',
                textAlign: 'center',
                border: '1px dashed var(--border-subtle)',
                borderRadius: 10,
                color: 'var(--text-muted)',
              }}>
                <ListMusic size={32} style={{ margin: '0 auto 10px', opacity: 0.5 }} />
                <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-main)' }}>No Wallpapers Added Yet</div>
                <div style={{ fontSize: 12, marginTop: 4 }}>Click below to choose wallpapers from your Library</div>
                <button className="btn btn-primary" onClick={handleOpenPicker} style={{ marginTop: 14 }}>
                  <Plus size={14} /> Add From Library
                </button>
              </div>
            ) : (
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
                gap: 14,
              }}>
                {playlistWallpapers.map(wp => (
                  <div
                    key={wp.id}
                    className="card group"
                    style={{
                      position: 'relative',
                      borderRadius: 8,
                      overflow: 'hidden',
                      background: 'var(--bg-base)',
                      border: '1px solid var(--border-main)',
                      boxShadow: 'var(--shadow-card)',
                      aspectRatio: '16/9',
                    }}
                  >
                    <div style={{ width: '100%', height: '100%' }}>
                      <WallpaperThumbnail wallpaper={wp} />
                    </div>

                    {/* Gradient scrim */}
                    <div style={{
                      position: 'absolute',
                      inset: 0,
                      background: 'linear-gradient(to top, rgba(0,0,0,0.85) 0%, rgba(0,0,0,0.2) 60%, transparent 100%)',
                      pointerEvents: 'none',
                    }} />

                    {/* Title */}
                    <div style={{
                      position: 'absolute',
                      bottom: 8,
                      left: 8,
                      right: 28,
                      fontSize: 11,
                      fontWeight: 600,
                      color: '#ffffff',
                      textShadow: '0 1px 3px rgba(0,0,0,0.8)',
                    }} className="truncate">
                      {wp.name}
                    </div>

                    {/* Remove button */}
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation()
                        removeWallpaperFromPlaylist(selectedPlaylist.id, wp.id)
                        setTimeout(() => syncPlaylistTimersToRust(), 50)
                      }}
                      title="Remove from playlist"
                      style={{
                        position: 'absolute',
                        top: 6,
                        right: 6,
                        width: 22,
                        height: 22,
                        borderRadius: 4,
                        background: 'rgba(0,0,0,0.7)',
                        border: '1px solid rgba(255,255,255,0.15)',
                        color: '#ff4d6d',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        cursor: 'pointer',
                      }}
                    >
                      <X size={13} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : (
          <div style={{
            background: 'var(--bg-card)',
            border: '1px solid var(--border-main)',
            borderRadius: 12,
            padding: 40,
            textAlign: 'center',
            color: 'var(--text-muted)',
          }}>
            Select or create a playlist to view details.
          </div>
        )}
      </div>

      {/* Add Wallpapers to Playlist Picker Modal */}
      {isAddPickerOpen && (
        <div style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0,0,0,0.84)',
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
            borderRadius: 14,
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
            boxShadow: '0 24px 64px rgba(0,0,0,0.65)',
          }}>
            {/* Modal Header */}
            <div style={{
              padding: '16px 22px',
              borderBottom: '1px solid var(--border-subtle)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              background: 'rgba(255, 255, 255, 0.02)',
            }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: 'var(--text-main)', letterSpacing: '-0.2px' }}>
                    Add Wallpapers to "{selectedPlaylist?.name}"
                  </h3>
                  <span className="badge font-mono" style={{ fontSize: 11 }}>
                    {availableWallpapers.length} available
                  </span>
                </div>
                <p style={{ margin: '3px 0 0', fontSize: 12, color: 'var(--text-muted)' }}>
                  Select one or more wallpapers from your library to add to this playlist rotation
                </p>
              </div>
              <button className="btn-icon" onClick={() => setIsAddPickerOpen(false)} title="Close (Esc)"><X size={16} /></button>
            </div>

            {/* Search & Filter Ribbon Toolbar */}
            <div style={{
              padding: '12px 22px',
              borderBottom: '1px solid var(--border-subtle)',
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              background: 'rgba(0,0,0,0.18)',
              flexWrap: 'wrap',
            }}>
              {/* Search Bar */}
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                background: 'rgba(0,0,0,0.35)',
                border: '1px solid var(--border-main)',
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
                    color: 'var(--text-main)',
                    fontSize: 12.5,
                    width: '100%',
                  }}
                />
                {pickerSearch && (
                  <button className="btn-icon" style={{ padding: 2 }} onClick={() => setPickerSearch('')}>
                    <X size={12} />
                  </button>
                )}
              </div>

              {/* Filter Pills */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                {[
                  { id: 'all', label: 'All', count: availableWallpapers.length },
                  { id: 'selected', label: 'Selected', count: selectedPickerIds.size, highlight: selectedPickerIds.size > 0 },
                  { id: 'image', label: 'Pictures' },
                  { id: 'video', label: 'Videos' },
                  { id: 'stream', label: 'Streams' },
                  { id: 'procedural', label: 'Procedural' },
                ].map(tab => {
                  const isActive = pickerTab === tab.id
                  return (
                    <button
                      key={tab.id}
                      type="button"
                      className={`aether-filter-chip ${isActive ? 'active' : ''}`}
                      style={{
                        fontSize: 11,
                        padding: '4px 10px',
                        ...(tab.highlight && !isActive ? { borderColor: 'rgba(56, 189, 248, 0.45)', color: 'var(--color-brand)' } : {}),
                      }}
                      onClick={() => setPickerTab(tab.id)}
                    >
                      <span>{tab.label}</span>
                      {typeof tab.count === 'number' && (
                        <span style={{
                          fontSize: 10,
                          fontFamily: 'var(--font-mono)',
                          opacity: 0.85,
                          background: tab.highlight ? 'rgba(56, 189, 248, 0.28)' : 'rgba(255,255,255,0.08)',
                          padding: '1px 5px',
                          borderRadius: 4,
                        }}>
                          {tab.count}
                        </span>
                      )}
                    </button>
                  )
                })}
              </div>

              {/* Quick Bulk Actions */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginLeft: 'auto' }}>
                <button
                  type="button"
                  className="btn btn-ghost"
                  style={{ fontSize: 11, padding: '4px 8px', height: 'auto' }}
                  onClick={() => {
                    const allIds = new Set(selectedPickerIds)
                    pickerCandidates.forEach(w => allIds.add(w.id))
                    setSelectedPickerIds(allIds)
                  }}
                  title="Select all matching wallpapers"
                >
                  Select All
                </button>
                {selectedPickerIds.size > 0 && (
                  <button
                    type="button"
                    className="btn btn-ghost"
                    style={{ fontSize: 11, padding: '4px 8px', height: 'auto', color: 'var(--color-rose)' }}
                    onClick={() => setSelectedPickerIds(new Set())}
                    title="Clear selection"
                  >
                    Clear ({selectedPickerIds.size})
                  </button>
                )}
              </div>
            </div>

            {/* Wallpapers Selection Grid (With gridAutoRows: max-content to prevent overlapping!) */}
            <div style={{
              padding: '18px 22px',
              overflowY: 'auto',
              flex: 1,
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
              gridAutoRows: 'max-content',
              alignItems: 'start',
              gap: 14,
            }}>
              {pickerCandidates.length === 0 ? (
                <div style={{ gridColumn: '1/-1', textAlign: 'center', padding: '50px 0', color: 'var(--text-muted)', fontSize: 13 }}>
                  {pickerTab === 'selected'
                    ? 'No wallpapers selected yet. Switch to "All" to select wallpapers.'
                    : 'No wallpapers found matching your search.'}
                </div>
              ) : (
                pickerCandidates.map(wp => {
                  const isChecked = selectedPickerIds.has(wp.id)
                  const isImage = wp.engine === 'image-player' || wp.mediaType === 'image' || Boolean(wp.config?.imagePath && !wp.config?.videoPath)
                  const isStream = Boolean(wp.config?.streamUrl || wp.engine === 'web-stream')
                  const isEngine = !isImage && !isStream && wp.engine && wp.engine !== 'video-player' && wp.engine !== 'image-player' && wp.engine !== 'web-stream'
                  const isVideo = !isImage && !isStream && !isEngine

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
                        border: isChecked ? '2px solid var(--color-brand)' : '1px solid var(--border-subtle)',
                        boxShadow: isChecked ? '0 0 14px rgba(56, 189, 248, 0.45)' : 'none',
                        transition: 'transform 0.15s ease, border-color 0.15s ease, box-shadow 0.15s ease',
                        background: '#070b14',
                      }}
                      onMouseEnter={e => {
                        e.currentTarget.style.transform = 'translateY(-2px)'
                      }}
                      onMouseLeave={e => {
                        e.currentTarget.style.transform = 'translateY(0)'
                      }}
                    >
                      {/* Wallpaper Thumbnail Surface */}
                      <div style={{ width: '100%', height: '100%', pointerEvents: 'none' }}>
                        <WallpaperThumbnail wallpaper={wp} />
                      </div>

                      {/* Readability Gradient Scrim */}
                      <div style={{
                        position: 'absolute',
                        inset: 0,
                        background: 'linear-gradient(to top, rgba(5,8,15,0.92) 0%, rgba(5,8,15,0.2) 50%, rgba(0,0,0,0.4) 100%)',
                        pointerEvents: 'none',
                      }} />

                      {/* Media Type Badge Pill (Top-Left) */}
                      <div style={{
                        position: 'absolute',
                        top: 6,
                        left: 6,
                        fontSize: 9,
                        fontWeight: 700,
                        padding: '2px 6px',
                        borderRadius: 4,
                        letterSpacing: '0.04em',
                        background: isImage
                          ? 'rgba(16, 185, 129, 0.28)'
                          : isVideo
                          ? 'rgba(168, 85, 247, 0.28)'
                          : isStream
                          ? 'rgba(6, 182, 212, 0.28)'
                          : 'rgba(59, 130, 246, 0.28)',
                        color: isImage
                          ? '#34d399'
                          : isVideo
                          ? '#c084fc'
                          : isStream
                          ? '#22d3ee'
                          : 'var(--color-brand)',
                        border: '1px solid rgba(255,255,255,0.14)',
                        backdropFilter: 'blur(6px)',
                        pointerEvents: 'none',
                      }}>
                        {isImage ? 'IMAGE' : isVideo ? 'VIDEO' : isStream ? 'STREAM' : 'CANVAS'}
                      </div>

                      {/* Selection Checkmark Box (Top-Right) */}
                      <div style={{
                        position: 'absolute',
                        top: 6,
                        right: 6,
                        width: 20,
                        height: 20,
                        borderRadius: 5,
                        background: isChecked ? 'var(--color-brand)' : 'rgba(0,0,0,0.65)',
                        border: isChecked ? '1px solid var(--color-brand)' : '1px solid rgba(255,255,255,0.3)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: '#fff',
                        transition: 'all 0.15s ease',
                        boxShadow: isChecked ? '0 2px 6px rgba(56, 189, 248, 0.4)' : 'none',
                      }}>
                        {isChecked && <Check size={13} strokeWidth={3} />}
                      </div>

                      {/* Wallpaper Title (Bottom-Left) */}
                      <div style={{
                        position: 'absolute',
                        bottom: 6,
                        left: 8,
                        right: 8,
                        fontSize: 11,
                        fontWeight: 600,
                        color: '#ffffff',
                        textShadow: '0 1px 3px rgba(0,0,0,0.8)',
                        pointerEvents: 'none',
                      }} className="truncate" title={wp.name}>
                        {wp.name}
                      </div>
                    </div>
                  )
                })
              )}
            </div>

            {/* Modal Footer */}
            <div style={{
              padding: '14px 22px',
              borderTop: '1px solid var(--border-subtle)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              background: 'rgba(0,0,0,0.25)',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span className="text-xs text-muted">
                  <strong style={{ color: 'var(--text-main)' }}>{selectedPickerIds.size}</strong> of {availableWallpapers.length} selected
                </span>
                {selectedPickerIds.size > 0 && (
                  <button
                    type="button"
                    className="btn btn-ghost"
                    style={{ fontSize: 11, padding: '2px 8px', height: 'auto', color: 'var(--text-muted)' }}
                    onClick={() => setPickerTab('selected')}
                  >
                    View Selected Only →
                  </button>
                )}
              </div>

              <div className="flex gap-2">
                <button className="btn btn-ghost" onClick={() => setIsAddPickerOpen(false)}>
                  Cancel
                </button>
                <button
                  className="btn btn-primary"
                  onClick={handleConfirmPicker}
                  disabled={selectedPickerIds.size === 0}
                  style={{
                    boxShadow: selectedPickerIds.size > 0 ? '0 2px 12px rgba(56, 189, 248, 0.35)' : 'none',
                  }}
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
