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
      tauriInvoke('set_mpv_brightness', { monitorLabel: selectedMonitorLabel, brightness: 1.0 }).catch(() => {})
      tauriInvoke('set_mpv_speed', { monitorLabel: selectedMonitorLabel, speed: 1.0 }).catch(() => {})
      tauriInvoke('set_mpv_volume', { monitorLabel: selectedMonitorLabel, volume: 50 }).catch(() => {})
    }
  }

  // Live adjustments with debounced IPC
  const handleOpacityChange = (val) => {
    setWallpaperOpacity(val)
  }

  const handleBrightnessChange = (val) => {
    setWallpaperBrightness(val)
    if (isTauri()) {
      tauriInvoke('set_mpv_brightness', { monitorLabel: selectedMonitorLabel, brightness: val }).catch(() => {})
    }
  }

  const handleContrastChange = (val) => {
    setWallpaperContrast(val)
  }

  const handleSaturationChange = (val) => {
    setWallpaperSaturation(val)
  }

  const handleSpeedChange = (val) => {
    setWallpaperSpeed(val)
    if (isTauri()) {
      tauriInvoke('set_mpv_speed', { monitorLabel: selectedMonitorLabel, speed: val }).catch(() => {})
    }
  }

  const handleVolumeChange = (val) => {
    setAudioVolume(val)
    if (activeWallpaper) {
      setWallpaperAudio(activeWallpaper.id, { volume: val, muted: false })
    }
    if (isTauri()) {
      tauriInvoke('set_mpv_volume', { monitorLabel: selectedMonitorLabel, volume: val }).catch(() => {})
    }
  }

  return (
    <div className="sovereign-settings-panel">
      {/* ── Header: Title, Display Selector & Reset ───────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14, flexWrap: 'wrap', gap: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <SlidersHorizontal size={14} style={{ color: 'var(--color-brand)' }} />
          <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-main)', letterSpacing: '-0.2px' }}>
            Wallpaper Settings
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {/* Display Dropdown */}
          <div style={{ position: 'relative', minWidth: 130 }}>
            <select
              value={selectedMonitorLabel || ''}
              onChange={e => onSelectMonitor && onSelectMonitor(e.target.value)}
              style={{
                width: '100%',
                height: 26,
                padding: '0 22px 0 8px',
                borderRadius: 6,
                background: 'rgba(255, 255, 255, 0.06)',
                border: '1px solid var(--border-subtle)',
                color: 'var(--text-main)',
                fontSize: 11,
                fontWeight: 500,
                outline: 'none',
                cursor: 'pointer',
                appearance: 'none',
                WebkitAppearance: 'none',
              }}
            >
              {monitors.length > 0 ? (
                monitors.map((m, idx) => (
                  <option key={m.label} value={m.label} style={{ background: '#0d111a', color: '#fff' }}>
                    {m.displayName || `Screen ${idx + 1}`} {m.isPrimary ? '(Primary)' : ''}
                  </option>
                ))
              ) : (
                <option value="" style={{ background: '#0d111a', color: '#fff' }}>
                  Screen 1 (Primary)
                </option>
              )}
            </select>
            <div style={{ position: 'absolute', right: 7, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none', opacity: 0.5, fontSize: 8 }}>
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
              fontSize: 11,
              fontWeight: 500,
              cursor: 'pointer',
              padding: '2px 6px',
              borderRadius: 4,
              transition: 'all 0.15s ease',
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
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginBottom: 3, userSelect: 'none' }}>
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
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginBottom: 3, userSelect: 'none' }}>
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
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginBottom: 3, userSelect: 'none' }}>
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
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginBottom: 3, userSelect: 'none' }}>
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
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginBottom: 3, userSelect: 'none' }}>
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
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 11, marginBottom: 3, userSelect: 'none' }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 5, color: 'var(--text-muted)' }}>
              <button
                type="button"
                onClick={toggleAudioMuted}
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
