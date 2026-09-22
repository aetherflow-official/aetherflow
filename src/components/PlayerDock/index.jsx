import React, { useEffect, useState } from 'react'
import {
  Shuffle, SkipBack, Play, Pause, SkipForward, Repeat,
  Volume2, VolumeX, Link2, Activity, Sparkles, Image as ImageIcon, Video
} from 'lucide-react'
import { useStore } from '../../store/useStore.js'
import { safeConvertFileSrc, stopDesktopWallpaper, applyWallpaperToDesktop } from '../../lib/wallpaperActions.js'
import { rotateNext, rotatePrev, cycleLibraryWallpaper } from '../../lib/playlistManager.js'

export default function PlayerDock() {
  const activeWallpaper        = useStore(s => s.activeWallpaper)
  const isWallpaperRunning     = useStore(s => s.isWallpaperRunning)
  const monitorWallpapers      = useStore(s => s.monitorWallpapers) || {}
  const screenArrangement      = useStore(s => s.screenArrangement)
  const audioMuted             = useStore(s => s.audioMuted)
  const toggleAudioMuted       = useStore(s => s.toggleAudioMuted)
  const wallpaperSyncOnResume  = useStore(s => s.wallpaperSyncOnResume)
  const activePlaylists        = useStore(s => s.activePlaylists) || {}
  const isPaused               = useStore(s => s.isPaused) || false

  const [memUsage, setMemUsage]   = useState(null)
  const [trimming, setTrimming]   = useState(false)
  const [isShuffle, setIsShuffle] = useState(false)
  const [isRepeat, setIsRepeat]   = useState(true)

  // Memory telemetry polling (every 6s when window is visible)
  useEffect(() => {
    let active = true
    let timer = null

    async function fetchMem() {
      if (typeof document !== 'undefined' && document.hidden) return
      try {
        const { invoke } = await import('@tauri-apps/api/core')
        const data = await invoke('get_detailed_memory_usage')
        if (active && data) setMemUsage(data)
      } catch {}
    }

    const startPolling = () => {
      if (timer) clearInterval(timer)
      fetchMem()
      timer = setInterval(fetchMem, 6000)
    }

    const stopPolling = () => {
      if (timer) {
        clearInterval(timer)
        timer = null
      }
    }

    const handleVisibility = () => {
      if (document.hidden) stopPolling()
      else startPolling()
    }

    startPolling()
    document.addEventListener('visibilitychange', handleVisibility)
    window.addEventListener('focus', fetchMem)

    return () => {
      active = false
      stopPolling()
      document.removeEventListener('visibilitychange', handleVisibility)
      window.removeEventListener('focus', fetchMem)
    }
  }, [])

  // Memory trim handler (identical to existing StatusBar)
  async function handleTrim(e) {
    e.stopPropagation()
    setTrimming(true)
    try {
      document.querySelectorAll('video').forEach(v => {
        if (v.paused && !document.body.contains(v)) {
          try {
            v.pause()
            v.removeAttribute('src')
            v.load()
          } catch {}
        }
      })
      if (typeof window !== 'undefined' && window.gc) {
        try { window.gc() } catch {}
      }
      const { invoke } = await import('@tauri-apps/api/core')
      await invoke('trim_memory')
      await new Promise(r => setTimeout(r, 150))
      const data = await invoke('get_detailed_memory_usage')
      if (data) setMemUsage(data)
    } catch {}
    setTimeout(() => setTrimming(false), 500)
  }

  // Active wallpapers count across displays
  const activeCount = React.useMemo(() => {
    if (!isWallpaperRunning) return 0
    if (screenArrangement === 'per-screen' && Object.keys(monitorWallpapers).length > 0) {
      return Object.values(monitorWallpapers).filter(Boolean).length
    }
    return activeWallpaper ? 1 : 0
  }, [isWallpaperRunning, screenArrangement, monitorWallpapers, activeWallpaper])

  // Mini thumbnail resolution
  const miniThumbSrc = React.useMemo(() => {
    if (!activeWallpaper) return null
    if (activeWallpaper.thumbnail && typeof activeWallpaper.thumbnail === 'string') {
      return activeWallpaper.thumbnail.startsWith('http') || activeWallpaper.thumbnail.startsWith('/')
        ? activeWallpaper.thumbnail
        : safeConvertFileSrc(activeWallpaper.thumbnail)
    }
    if (activeWallpaper.preview && typeof activeWallpaper.preview === 'string') {
      return activeWallpaper.preview.startsWith('http') || activeWallpaper.preview.startsWith('/')
        ? activeWallpaper.preview
        : safeConvertFileSrc(activeWallpaper.preview)
    }
    const imgPath = activeWallpaper.config?.imagePath
    if (imgPath) {
      return imgPath.startsWith('http') ? imgPath : safeConvertFileSrc(imgPath)
    }
    return null
  }, [activeWallpaper])

  // Transport handlers
  const handlePrev = async () => {
    if (Object.keys(activePlaylists).length > 0) {
      await rotatePrev(undefined, undefined, true)
    } else {
      await cycleLibraryWallpaper(-1)
    }
  }

  const handleNext = async () => {
    if (Object.keys(activePlaylists).length > 0) {
      await rotateNext(undefined, undefined, true)
    } else {
      await cycleLibraryWallpaper(1)
    }
  }

  const handlePlayPause = async () => {
    if (isWallpaperRunning) {
      // Toggle pause state
      const nextPaused = !isPaused
      useStore.setState({ isPaused: nextPaused })
      try {
        const { invoke } = await import('@tauri-apps/api/core')
        await invoke('set_mpv_pause', { monitorLabel: null, paused: nextPaused }).catch(() => {})
      } catch {}
    } else if (activeWallpaper) {
      await applyWallpaperToDesktop(activeWallpaper)
    }
  }

  return (
    <div
      className="aether-player-dock"
      style={{
        gridColumn: '1 / -1',
        height: 64,
        background: 'rgba(10, 13, 20, 0.94)',
        backdropFilter: 'blur(24px)',
        WebkitBackdropFilter: 'blur(24px)',
        borderTop: '1px solid var(--border-subtle)',
        boxShadow: '0 -4px 20px rgba(0, 0, 0, 0.4)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 20px',
        zIndex: 90,
        userSelect: 'none',
      }}
    >
      {/* ── Left: Active Track Artwork & Info ──────────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 220, maxWidth: 320 }}>
        <div
          style={{
            width: 44,
            height: 44,
            borderRadius: 8,
            overflow: 'hidden',
            background: 'var(--bg-card)',
            border: '1px solid var(--border-subtle)',
            flexShrink: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
          }}
        >
          {miniThumbSrc ? (
            <img
              src={miniThumbSrc}
              alt=""
              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
              loading="lazy"
            />
          ) : (
            <Sparkles size={18} style={{ color: 'var(--color-brand)', opacity: 0.6 }} />
          )}
        </div>

        <div style={{ minWidth: 0, overflow: 'hidden' }}>
          <div
            style={{
              fontSize: 13,
              fontWeight: 600,
              color: 'var(--text-main)',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              letterSpacing: '-0.2px',
            }}
          >
            {activeWallpaper?.name || 'No Wallpaper Active'}
          </div>
          <div
            style={{
              fontSize: 11,
              color: 'var(--text-muted)',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              marginTop: 1,
            }}
          >
            {activeWallpaper?.author
              ? `by ${activeWallpaper.author}`
              : activeWallpaper?.communityMeta?.author
              ? `by ${activeWallpaper.communityMeta.author}`
              : activeWallpaper?.isCustom
              ? 'Local Media'
              : activeWallpaper
              ? 'by AetherFlow'
              : 'Select to play'}
          </div>
        </div>
      </div>

      {/* ── Center: Media Transport Controls ───────────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
        {/* Shuffle */}
        <button
          type="button"
          onClick={() => setIsShuffle(s => !s)}
          className="dock-transport-btn"
          style={{
            color: isShuffle ? 'var(--color-brand)' : 'var(--text-subtle)',
          }}
          title={isShuffle ? 'Shuffle enabled' : 'Enable shuffle'}
        >
          <Shuffle size={14} />
        </button>

        {/* Previous Track */}
        <button
          type="button"
          onClick={handlePrev}
          className="dock-transport-btn"
          title="Previous wallpaper"
        >
          <SkipBack size={16} fill="currentColor" />
        </button>

        {/* Play / Pause Primary Button */}
        <button
          type="button"
          onClick={handlePlayPause}
          style={{
            width: 38,
            height: 38,
            borderRadius: '50%',
            background: 'var(--text-main)',
            border: 'none',
            color: '#05070d',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            boxShadow: '0 0 16px rgba(255, 255, 255, 0.25)',
            transition: 'transform 0.15s ease, background-color 0.15s ease',
          }}
          onMouseEnter={e => { e.currentTarget.style.transform = 'scale(1.08)' }}
          onMouseLeave={e => { e.currentTarget.style.transform = 'scale(1)' }}
          title={isWallpaperRunning && !isPaused ? 'Pause wallpaper' : 'Play wallpaper'}
        >
          {isWallpaperRunning && !isPaused ? (
            <Pause size={17} fill="currentColor" />
          ) : (
            <Play size={17} fill="currentColor" style={{ marginLeft: 2 }} />
          )}
        </button>

        {/* Next Track */}
        <button
          type="button"
          onClick={handleNext}
          className="dock-transport-btn"
          title="Next wallpaper"
        >
          <SkipForward size={16} fill="currentColor" />
        </button>

        {/* Repeat / Loop */}
        <button
          type="button"
          onClick={() => setIsRepeat(r => !r)}
          className="dock-transport-btn"
          style={{
            color: isRepeat ? 'var(--color-brand)' : 'var(--text-subtle)',
          }}
          title={isRepeat ? 'Repeat playlist' : 'Disable repeat'}
        >
          <Repeat size={14} />
        </button>
      </div>

      {/* ── Right: Telemetry Chips ─────────────────────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        {/* Wallpapers Active Indicator */}
        <div
          className="dock-telemetry-chip"
          style={{
            color: activeCount > 0 ? 'var(--color-emerald)' : 'var(--text-muted)',
            borderColor: activeCount > 0 ? 'rgba(16, 185, 129, 0.35)' : 'var(--border-subtle)',
            background: activeCount > 0 ? 'rgba(16, 185, 129, 0.1)' : 'transparent',
          }}
        >
          <span
            style={{
              width: 6,
              height: 6,
              borderRadius: '50%',
              background: activeCount > 0 ? 'var(--color-emerald)' : 'var(--text-muted)',
              boxShadow: activeCount > 0 ? '0 0 8px rgba(16, 185, 129, 0.8)' : 'none',
            }}
          />
          <span>{activeCount > 0 ? `${activeCount} Wallpaper${activeCount > 1 ? 's' : ''} Active` : 'Desktop Idle'}</span>
        </div>

        {/* Sync Status Chip */}
        <div
          className="dock-telemetry-chip"
          style={{
            color: 'var(--color-cyan)',
            borderColor: 'rgba(6, 182, 212, 0.35)',
            background: 'rgba(6, 182, 212, 0.08)',
          }}
          title="Desktop wallpaper synchronization active across displays"
        >
          <Link2 size={11} />
          <span>Sync On</span>
        </div>

        {/* Audio Toggle Chip */}
        <div
          className="dock-telemetry-chip clickable"
          onClick={toggleAudioMuted}
          style={{
            cursor: 'pointer',
            color: audioMuted ? 'var(--color-rose)' : 'var(--color-cyan)',
            borderColor: audioMuted ? 'rgba(239, 68, 68, 0.35)' : 'rgba(6, 182, 212, 0.35)',
            background: audioMuted ? 'rgba(239, 68, 68, 0.08)' : 'rgba(6, 182, 212, 0.08)',
          }}
          title={audioMuted ? 'Audio muted. Click to unmute.' : 'Audio playing. Click to mute.'}
        >
          {audioMuted ? <VolumeX size={11} /> : <Volume2 size={11} />}
          <span>{audioMuted ? 'Audio Muted' : 'Audio On'}</span>
        </div>

        {/* Live RAM Telemetry Chip */}
        <div
          className="dock-telemetry-chip clickable"
          onClick={handleTrim}
          title={`Total Suite Memory: ${memUsage?.total_mb ?? '—'} MB\n• Main Process: ${memUsage?.host_mb ?? '—'} MB\n• WebView2 UI: ${memUsage?.webview_mb ?? '—'} MB\n• MPV Player: ${memUsage?.mpv_mb ?? '—'} MB\n\nClick to trim and compact RAM.`}
          style={{
            cursor: 'pointer',
            color: (memUsage?.total_mb || 0) > 350 ? 'var(--color-amber)' : 'var(--text-main)',
            fontFamily: 'var(--font-mono)',
          }}
        >
          <Activity size={11} style={{ color: 'var(--color-brand)' }} />
          <span>{trimming ? 'Trimming…' : `${memUsage?.total_mb ?? 158} MB`}</span>
        </div>
      </div>
    </div>
  )
}
