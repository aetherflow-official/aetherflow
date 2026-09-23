import React from 'react'
import { SlidersHorizontal, Volume2, VolumeX } from 'lucide-react'
import { useStore } from '../../store/useStore.js'
import { isTauri, tauriInvoke } from '../../lib/wallpaperActions.js'

export default function WallpaperSettingsPanel({
  monitors = [],
  selectedMonitorLabel,
  onSelectMonitor,
}) {
  const wallpaperOpacity        = useStore(s => s.wallpaperOpacity)
  const setWallpaperOpacity     = useStore(s => s.setWallpaperOpacity)
  const wallpaperBrightness     = useStore(s => s.wallpaperBrightness)
  const setWallpaperBrightness   = useStore(s => s.setWallpaperBrightness)
  const wallpaperContrast       = useStore(s => s.wallpaperContrast) ?? 1.0
  const setWallpaperContrast     = useStore(s => s.setWallpaperContrast)
  const wallpaperSaturation     = useStore(s => s.wallpaperSaturation) ?? 1.1
  const setWallpaperSaturation   = useStore(s => s.setWallpaperSaturation)
  const wallpaperSpeed          = useStore(s => s.wallpaperSpeed)
  const setWallpaperSpeed       = useStore(s => s.setWallpaperSpeed)
  const audioVolume             = useStore(s => s.audioVolume)
  const setAudioVolume          = useStore(s => s.setAudioVolume)
  const audioMuted              = useStore(s => s.audioMuted)
  const toggleAudioMuted         = useStore(s => s.toggleAudioMuted)
  const activeWallpaper         = useStore(s => s.activeWallpaper)
  const setWallpaperAudio       = useStore(s => s.setWallpaperAudio)

  const ipcTimersRef = React.useRef({})

  const debouncedInvoke = (key, fn, delay = 25) => {
    if (ipcTimersRef.current[key]) {
      clearTimeout(ipcTimersRef.current[key])
    }
    ipcTimersRef.current[key] = setTimeout(() => {
      fn()
      delete ipcTimersRef.current[key]
    }, delay)
  }

  const getTargetMonitor = () => {
    if (!selectedMonitorLabel || selectedMonitorLabel === 'all') return null
    return selectedMonitorLabel
  }

  // Reset to default balanced parameters
  const handleReset = () => {
    setWallpaperOpacity(1.0)
    setWallpaperBrightness(1.0)
    setWallpaperContrast(1.0)
    setWallpaperSaturation(1.0)
    setWallpaperSpeed(1.0)
    setAudioVolume(50)
    if (activeWallpaper) {
      setWallpaperAudio(activeWallpaper.id, { volume: 50, muted: false })
    }
    if (isTauri()) {
      const mon = getTargetMonitor()
      tauriInvoke('set_wallpaper_opacity', { monitorLabel: mon, opacity: 1.0 }).catch(() => {})
      tauriInvoke('set_wallpaper_brightness', { monitorLabel: mon, brightness: 1.0 }).catch(() => {})
      tauriInvoke('set_wallpaper_contrast', { monitorLabel: mon, contrast: 1.0 }).catch(() => {})
      tauriInvoke('set_wallpaper_saturation', { monitorLabel: mon, saturation: 1.0 }).catch(() => {})
      tauriInvoke('set_wallpaper_speed', { monitorLabel: mon, speed: 1.0 }).catch(() => {})
      tauriInvoke('set_mpv_brightness', { monitorLabel: mon, brightness: 1.0 }).catch(() => {})
      tauriInvoke('set_mpv_speed', { monitorLabel: mon, speed: 1.0 }).catch(() => {})
      tauriInvoke('set_mpv_volume', { monitorLabel: mon, volume: 50 }).catch(() => {})
      tauriInvoke('set_mpv_mute', { monitorLabel: mon, muted: false }).catch(() => {})
      tauriInvoke('update_wallpaper_config', {
        config: {
          opacity: 1.0,
          brightness: 1.0,
          contrast: 1.0,
          saturation: 1.0,
          speedMultiplier: 1.0,
          speed: 1.0,
          volume: 50,
          muted: false,
        },
        monitorLabel: mon,
      }).catch(() => {})
    }
  }

  // Live adjustments with debounced IPC
  const handleOpacityChange = (val) => {
    setWallpaperOpacity(val)
    if (isTauri()) {
      debouncedInvoke('opacity', () => {
        const mon = getTargetMonitor()
        tauriInvoke('set_wallpaper_opacity', { monitorLabel: mon, opacity: val }).catch(() => {})
        tauriInvoke('update_wallpaper_config', {
          config: { opacity: val },
          monitorLabel: mon,
        }).catch(() => {})
      }, 20)
    }
  }

  const handleBrightnessChange = (val) => {
    setWallpaperBrightness(val)
    if (isTauri()) {
      debouncedInvoke('brightness', () => {
        const mon = getTargetMonitor()
        tauriInvoke('set_wallpaper_brightness', { monitorLabel: mon, brightness: val }).catch(() => {})
        tauriInvoke('set_mpv_brightness', { monitorLabel: mon, brightness: val }).catch(() => {})
        tauriInvoke('update_wallpaper_config', {
          config: { brightness: val },
          monitorLabel: mon,
        }).catch(() => {})
      }, 20)
    }
  }

  const handleContrastChange = (val) => {
    setWallpaperContrast(val)
    if (isTauri()) {
      debouncedInvoke('contrast', () => {
        const mon = getTargetMonitor()
        tauriInvoke('set_wallpaper_contrast', { monitorLabel: mon, contrast: val }).catch(() => {})
        tauriInvoke('update_wallpaper_config', {
          config: { contrast: val },
          monitorLabel: mon,
        }).catch(() => {})
      }, 20)
    }
  }

  const handleSaturationChange = (val) => {
    setWallpaperSaturation(val)
    if (isTauri()) {
      debouncedInvoke('saturation', () => {
        const mon = getTargetMonitor()
        tauriInvoke('set_wallpaper_saturation', { monitorLabel: mon, saturation: val }).catch(() => {})
        tauriInvoke('update_wallpaper_config', {
          config: { saturation: val },
          monitorLabel: mon,
        }).catch(() => {})
      }, 20)
    }
  }

  const handleSpeedChange = (val) => {
    setWallpaperSpeed(val)
    if (isTauri()) {
      debouncedInvoke('speed', () => {
        const mon = getTargetMonitor()
        tauriInvoke('set_wallpaper_speed', { monitorLabel: mon, speed: val }).catch(() => {})
        tauriInvoke('set_mpv_speed', { monitorLabel: mon, speed: val }).catch(() => {})
        tauriInvoke('update_wallpaper_config', {
          config: { speedMultiplier: val, speed: val },
          monitorLabel: mon,
        }).catch(() => {})
      }, 20)
    }
  }

  const handleVolumeChange = (val) => {
    setAudioVolume(val)
    if (activeWallpaper) {
      setWallpaperAudio(activeWallpaper.id, { volume: val, muted: false })
    }
    if (isTauri()) {
      debouncedInvoke('volume', () => {
        const mon = getTargetMonitor()
        tauriInvoke('set_mpv_volume', { monitorLabel: mon, volume: val }).catch(() => {})
        tauriInvoke('update_wallpaper_config', {
          config: { volume: val, muted: false },
          monitorLabel: mon,
        }).catch(() => {})
      }, 20)
    }
  }

  const handleToggleAudioMuted = () => {
    const nextMuted = !audioMuted
    toggleAudioMuted()
    if (activeWallpaper) {
      setWallpaperAudio(activeWallpaper.id, { volume: audioVolume, muted: nextMuted })
    }
    if (isTauri()) {
      const mon = getTargetMonitor()
      tauriInvoke('set_mpv_mute', { monitorLabel: mon, muted: nextMuted }).catch(() => {})
      tauriInvoke('update_wallpaper_config', {
        config: { muted: nextMuted },
        monitorLabel: mon,
      }).catch(() => {})
    }
  }

  return (
    <div className="sovereign-settings-panel">
      {/* ── Header: Title, Display Selector & Reset ───────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10, flexWrap: 'nowrap', gap: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7, flexShrink: 0 }}>
          <SlidersHorizontal size={14} style={{ color: 'var(--color-brand)' }} />
          <span style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--text-main)', letterSpacing: '-0.2px', whiteSpace: 'nowrap' }}>
            Wallpaper Settings
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
          {/* Display Dropdown */}
          <div style={{ position: 'relative', width: 116, maxWidth: 120 }}>
            <select
              value={selectedMonitorLabel || 'all'}
              onChange={e => onSelectMonitor && onSelectMonitor(e.target.value)}
              style={{
                width: '100%',
                height: 25,
                padding: '0 20px 0 7px',
                borderRadius: 6,
                background: 'rgba(255, 255, 255, 0.06)',
                border: '1px solid var(--border-subtle)',
                color: 'var(--text-main)',
                fontSize: 10.5,
                fontWeight: 500,
                outline: 'none',
                cursor: 'pointer',
                appearance: 'none',
                WebkitAppearance: 'none',
                textOverflow: 'ellipsis',
                overflow: 'hidden',
                whiteSpace: 'nowrap',
              }}
            >
              <option value="all" style={{ background: '#0d111a', color: '#fff' }}>
                All Displays
              </option>
              {monitors.map((m, idx) => (
                <option key={m.label} value={m.label} style={{ background: '#0d111a', color: '#fff' }}>
                  {m.displayName || `Screen ${idx + 1}`} {m.isPrimary ? '(Primary)' : ''}
                </option>
              ))}
            </select>
            <div style={{ position: 'absolute', right: 6, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none', opacity: 0.5, fontSize: 8 }}>
              ▼
            </div>
          </div>

          <button
            type="button"
            onClick={handleReset}
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--text-muted)',
              fontSize: 10.5,
              fontWeight: 500,
              cursor: 'pointer',
              padding: '2px 5px',
              borderRadius: 4,
              transition: 'all 0.15s ease',
              whiteSpace: 'nowrap',
            }}
            onMouseEnter={e => { e.currentTarget.style.color = 'var(--text-main)' }}
            onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-muted)' }}
            title="Reset sliders to defaults"
          >
            Reset
          </button>
        </div>
      </div>

      {/* ── Main Panel Body: Sliders in responsive grid ───────────────────── */}
      <div className="sovereign-settings-grid">

        {/* Slider: Opacity */}
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginBottom: 2, userSelect: 'none' }}>
            <span style={{ color: 'var(--text-muted)' }}>Opacity</span>
            <span style={{ color: 'var(--color-brand)', fontFamily: 'var(--font-mono)', fontSize: 10.5, fontWeight: 600 }}>
              {Math.round(wallpaperOpacity * 100)}%
            </span>
          </div>
          <input
            type="range"
            min={0.1}
            max={1.0}
            step={0.05}
            value={wallpaperOpacity}
            onChange={e => handleOpacityChange(parseFloat(e.target.value))}
            className="sovereign-slider-track"
          />
        </div>

        {/* Slider: Brightness */}
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginBottom: 2, userSelect: 'none' }}>
            <span style={{ color: 'var(--text-muted)' }}>Brightness</span>
            <span style={{ color: 'var(--color-brand)', fontFamily: 'var(--font-mono)', fontSize: 10.5, fontWeight: 600 }}>
              {Math.round(wallpaperBrightness * 100)}%
            </span>
          </div>
          <input
            type="range"
            min={0.2}
            max={1.5}
            step={0.05}
            value={wallpaperBrightness}
            onChange={e => handleBrightnessChange(parseFloat(e.target.value))}
            className="sovereign-slider-track"
          />
        </div>

        {/* Slider: Contrast */}
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginBottom: 2, userSelect: 'none' }}>
            <span style={{ color: 'var(--text-muted)' }}>Contrast</span>
            <span style={{ color: 'var(--color-brand)', fontFamily: 'var(--font-mono)', fontSize: 10.5, fontWeight: 600 }}>
              {Math.round(wallpaperContrast * 100)}%
            </span>
          </div>
          <input
            type="range"
            min={0.5}
            max={1.5}
            step={0.05}
            value={wallpaperContrast}
            onChange={e => handleContrastChange(parseFloat(e.target.value))}
            className="sovereign-slider-track"
          />
        </div>

        {/* Slider: Saturation */}
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginBottom: 2, userSelect: 'none' }}>
            <span style={{ color: 'var(--text-muted)' }}>Saturation</span>
            <span style={{ color: 'var(--color-brand)', fontFamily: 'var(--font-mono)', fontSize: 10.5, fontWeight: 600 }}>
              {Math.round(wallpaperSaturation * 100)}%
            </span>
          </div>
          <input
            type="range"
            min={0.0}
            max={2.0}
            step={0.05}
            value={wallpaperSaturation}
            onChange={e => handleSaturationChange(parseFloat(e.target.value))}
            className="sovereign-slider-track"
          />
        </div>

        {/* Slider: Speed */}
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginBottom: 2, userSelect: 'none' }}>
            <span style={{ color: 'var(--text-muted)' }}>Speed</span>
            <span style={{ color: 'var(--color-brand)', fontFamily: 'var(--font-mono)', fontSize: 10.5, fontWeight: 600 }}>
              {parseFloat(wallpaperSpeed).toFixed(1)}x
            </span>
          </div>
          <input
            type="range"
            min={0.2}
            max={2.5}
            step={0.1}
            value={wallpaperSpeed}
            onChange={e => handleSpeedChange(parseFloat(e.target.value))}
            className="sovereign-slider-track"
          />
        </div>

        {/* Slider: Volume */}
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 11, marginBottom: 2, userSelect: 'none' }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 5, color: 'var(--text-muted)' }}>
              <button
                type="button"
                onClick={handleToggleAudioMuted}
                style={{ background: 'none', border: 'none', padding: 0, color: audioMuted ? 'var(--color-rose)' : 'var(--color-brand)', cursor: 'pointer', display: 'flex' }}
                title={audioMuted ? 'Unmute' : 'Mute'}
              >
                {audioMuted ? <VolumeX size={12} /> : <Volume2 size={12} />}
              </button>
              <span>Volume</span>
            </span>
            <span style={{ color: audioMuted ? 'var(--color-rose)' : 'var(--color-brand)', fontFamily: 'var(--font-mono)', fontSize: 10.5, fontWeight: 600 }}>
              {audioMuted ? 'Muted' : `${audioVolume}%`}
            </span>
          </div>
          <input
            type="range"
            min={0}
            max={100}
            step={1}
            value={audioMuted ? 0 : audioVolume}
            onChange={e => handleVolumeChange(parseInt(e.target.value, 10))}
            className="sovereign-slider-track"
          />
        </div>
      </div>
    </div>
  )
}
