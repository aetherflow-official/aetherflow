import React, { useState, useEffect, useMemo } from 'react'
import {
  Moon, Sparkles, Clock, Shield, ShieldCheck, Volume2, VolumeX,
  Play, Check, AlertCircle, Laptop, Sliders, Zap, Eye, RotateCcw,
  Film, Maximize2, FolderPlus, Shuffle, Search, Image as ImageIcon,
  Globe, X, Layers
} from 'lucide-react'
import { useStore } from '../store/useStore.js'
import { ENGINES, WALLPAPER_LIST } from '../engines/index.js'
import WallpaperPlayer from '../components/WallpaperPlayer/index.jsx'
import WallpaperThumbnail from '../components/WallpaperThumbnail/index.jsx'
import { importWallpaperDialog } from '../lib/wallpaperActions.js'
import {
  SettingSection,
  SettingRow,
  SliderRow,
  AetherToggle,
  AetherSegmented,
} from '../components/Settings/SettingsUI.jsx'

export default function Screensaver() {
  const screensaverEnabled = useStore(s => s.screensaverEnabled)
  const toggleScreensaverEnabled = useStore(s => s.toggleScreensaverEnabled)
  const screensaverTimeoutMins = useStore(s => s.screensaverTimeoutMins)
  const setScreensaverTimeoutMins = useStore(s => s.setScreensaverTimeoutMins)
  const screensaverMode = useStore(s => s.screensaverMode) || 'current'
  const setScreensaverMode = useStore(s => s.setScreensaverMode)
  const screensaverSpecificEngine = useStore(s => s.screensaverSpecificEngine)
  const setScreensaverSpecificEngine = useStore(s => s.setScreensaverSpecificEngine)
  const screensaverCustomWallpaper = useStore(s => s.screensaverCustomWallpaper)
  const setScreensaverCustomWallpaper = useStore(s => s.setScreensaverCustomWallpaper)
  const screensaverFadeInSecs = useStore(s => s.screensaverFadeInSecs) || 1.0
  const setScreensaverFadeInSecs = useStore(s => s.setScreensaverFadeInSecs)
  const screensaverLockOnResume = useStore(s => s.screensaverLockOnResume) || false
  const toggleScreensaverLockOnResume = useStore(s => s.toggleScreensaverLockOnResume)
  const screensaverGracePeriodSecs = useStore(s => s.screensaverGracePeriodSecs) || 5
  const setScreensaverGracePeriodSecs = useStore(s => s.setScreensaverGracePeriodSecs)
  const screensaverMuteAudio = useStore(s => s.screensaverMuteAudio) ?? true
  const toggleScreensaverMuteAudio = useStore(s => s.toggleScreensaverMuteAudio)
  const screensaverInhibitFullscreen = useStore(s => s.screensaverInhibitFullscreen) ?? true
  const toggleScreensaverInhibitFullscreen = useStore(s => s.toggleScreensaverInhibitFullscreen)
  const screensaverInhibitMaximized = useStore(s => s.screensaverInhibitMaximized) ?? true
  const toggleScreensaverInhibitMaximized = useStore(s => s.toggleScreensaverInhibitMaximized)
  const screensaverInhibitMediaPlayback = useStore(s => s.screensaverInhibitMediaPlayback) ?? true
  const toggleScreensaverInhibitMediaPlayback = useStore(s => s.toggleScreensaverInhibitMediaPlayback)
  const activeWallpaper = useStore(s => s.activeWallpaper)
  const currentDesktopWallpaper = useStore(s => s.currentDesktopWallpaper)
  const installed = useStore(s => s.installed) || []
  const customNames = useStore(s => s.customNames) || {}

  // Picker and Random seed states
  const [isCustomPickerOpen, setIsCustomPickerOpen] = useState(false)
  const [pickerSearch, setPickerSearch] = useState('')
  const [pickerCategory, setPickerCategory] = useState('all')
  const [randomSeed, setRandomSeed] = useState(0)

  // Real-time clock for the HUD simulation preview
  const [currentTime, setCurrentTime] = useState(new Date())

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000)
    return () => clearInterval(timer)
  }, [])

  const PROCEDURAL_ENGINES = useMemo(() => [
    { id: 'matrix-rain', name: 'Matrix Rain', desc: 'Cascading digital katakana rain' },
    { id: 'deep-space', name: 'Deep Space', desc: 'Parallax starfield & cosmic nebula' },
    { id: 'tokyo-rain', name: 'Tokyo Rain', desc: 'Cyberpunk rainy neon metropolis' },
    { id: 'aurora', name: 'Aurora Borealis', desc: 'Harmonic northern lights waves' },
    { id: 'synthwave-grid', name: 'Synthwave Grid', desc: 'Retro 80s neon horizon' },
    { id: 'cyber-particles', name: 'Cyber Particles', desc: 'Constellation network nodes' },
  ], [])

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
      .filter(i => i && (i.type === 'wallpaper' || i.videoPath || i.imagePath || i.streamUrl))
      .map(i => {
        let eng = i.engine
        if (!eng || !ENGINES[eng]) {
          if (i.config?.videoPath || i.videoPath) eng = 'video-player'
          else if (i.config?.imagePath || i.imagePath) eng = 'image-player'
          else if (i.config?.streamUrl || i.streamUrl) eng = 'web-stream'
          else eng = 'video-player'
        }
        return {
          ...i,
          name: names[i.id] || i.name,
          engine: eng,
          isCustom: true,
        }
      })

    return [...customs, ...builtins]
  }, [installed, customNames])

  // Filtered candidates for custom wallpaper picker modal
  const pickerCandidates = useMemo(() => {
    return allWallpapers.filter(w => {
      if (pickerCategory === 'video') {
        if (w.engine !== 'video-player') return false
      } else if (pickerCategory === 'image') {
        if (w.engine !== 'image-player') return false
      } else if (pickerCategory === 'stream') {
        if (w.engine !== 'web-stream') return false
      } else if (pickerCategory === 'canvas') {
        if (w.engine === 'video-player' || w.engine === 'image-player' || w.engine === 'web-stream') return false
      }

      if (pickerSearch) {
        const query = pickerSearch.toLowerCase()
        const nameMatches = w.name?.toLowerCase().includes(query)
        const tagMatches = Array.isArray(w.tags) && w.tags.some(t => t.toLowerCase().includes(query))
        if (!nameMatches && !tagMatches) return false
      }

      return true
    })
  }, [allWallpapers, pickerCategory, pickerSearch])

  // Auto-sync screensaver settings to Rust backend whenever any configuration changes
  useEffect(() => {
    let specificEngine = null
    let specificConfig = null

    if (screensaverMode === 'custom' && screensaverCustomWallpaper) {
      specificEngine = screensaverCustomWallpaper.engine || (screensaverCustomWallpaper.config?.videoPath ? 'video-player' : (screensaverCustomWallpaper.config?.imagePath ? 'image-player' : (screensaverCustomWallpaper.config?.streamUrl ? 'web-stream' : (screensaverCustomWallpaper.id || 'aurora'))))
      specificConfig = screensaverCustomWallpaper.config || {}
    } else if (screensaverMode === 'specific') {
      specificEngine = screensaverSpecificEngine || 'matrix-rain'
      specificConfig = ENGINES[screensaverSpecificEngine || 'matrix-rain']?.defaultConfig || {}
    }

    import('@tauri-apps/api/core').then(({ invoke }) => {
      invoke('sync_screensaver_settings', {
        settings: {
          enabled: screensaverEnabled,
          idle_timeout_mins: screensaverTimeoutMins,
          mode: screensaverMode,
          specific_engine: specificEngine,
          specific_config: specificConfig,
          fade_in_secs: screensaverFadeInSecs,
          lock_on_resume: screensaverLockOnResume,
          grace_period_secs: screensaverGracePeriodSecs,
          mute_audio: screensaverMuteAudio,
          inhibit_fullscreen: screensaverInhibitFullscreen,
          inhibit_maximized: screensaverInhibitMaximized,
          inhibit_audio: screensaverInhibitMediaPlayback,
        }
      }).catch(() => {})
    }).catch(() => {})
  }, [
    screensaverEnabled,
    screensaverTimeoutMins,
    screensaverMode,
    screensaverSpecificEngine,
    screensaverCustomWallpaper,
    screensaverFadeInSecs,
    screensaverLockOnResume,
    screensaverGracePeriodSecs,
    screensaverMuteAudio,
    screensaverInhibitFullscreen,
    screensaverInhibitMaximized,
    screensaverInhibitMediaPlayback,
  ])

  const timeString = currentTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })
  const dateString = currentTime.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' })

  // Determine which engine and config to preview on the live stage
  const { previewEngineId, previewConfig, isBlackoutMode } = useMemo(() => {
    if (screensaverMode === 'blackout') {
      return { previewEngineId: null, previewConfig: {}, isBlackoutMode: true }
    }
    if (screensaverMode === 'specific') {
      const eng = screensaverSpecificEngine || 'matrix-rain'
      const desc = ENGINES[eng]
      return { previewEngineId: eng, previewConfig: desc?.defaultConfig || {}, isBlackoutMode: false }
    }
    if (screensaverMode === 'custom') {
      if (screensaverCustomWallpaper) {
        let eng = screensaverCustomWallpaper.engine || screensaverCustomWallpaper.id
        const cfg = { ...(screensaverCustomWallpaper.config || {}) }
        if (!ENGINES[eng]) {
          if (cfg.videoPath) eng = 'video-player'
          else if (cfg.imagePath) eng = 'image-player'
          else if (cfg.streamUrl) eng = 'web-stream'
          else eng = 'aurora'
        }
        return {
          previewEngineId: eng,
          previewConfig: cfg,
          isBlackoutMode: false,
        }
      }
      // If no custom wallpaper chosen yet, fall back to first installed custom wallpaper or deep-space
      const firstCustom = (installed || []).find(i => i && i.type === 'wallpaper')
      if (firstCustom) {
        let eng = firstCustom.engine || (firstCustom.config?.videoPath ? 'video-player' : 'aurora')
        return {
          previewEngineId: eng,
          previewConfig: firstCustom.config || {},
          isBlackoutMode: false,
        }
      }
      return { previewEngineId: 'deep-space', previewConfig: ENGINES['deep-space']?.defaultConfig || {}, isBlackoutMode: false }
    }
    if (screensaverMode === 'random') {
      const candidates = allWallpapers.length > 0 ? allWallpapers : PROCEDURAL_ENGINES
      const pick = candidates[(randomSeed) % candidates.length]
      let eng = pick?.engine || pick?.id || 'synthwave-grid'
      if (!ENGINES[eng]) {
        if (pick?.config?.videoPath) eng = 'video-player'
        else if (pick?.config?.imagePath) eng = 'image-player'
        else if (pick?.config?.streamUrl) eng = 'web-stream'
        else eng = 'synthwave-grid'
      }
      return {
        previewEngineId: eng,
        previewConfig: pick?.config || ENGINES[eng]?.defaultConfig || {},
        isBlackoutMode: false,
      }
    }
    // 'current' mode: extract engine from currentDesktopWallpaper or activeWallpaper
    const targetWp = currentDesktopWallpaper || activeWallpaper
    if (targetWp) {
      const eng = typeof targetWp === 'string' ? targetWp : (targetWp.engine || targetWp.id)
      const resolvedEng = ENGINES[eng] ? eng : 'aurora'
      return {
        previewEngineId: resolvedEng,
        previewConfig: targetWp?.config || ENGINES[resolvedEng]?.defaultConfig || {},
        isBlackoutMode: false,
      }
    }
    return { previewEngineId: 'aurora', previewConfig: ENGINES['aurora']?.defaultConfig || {}, isBlackoutMode: false }
  }, [
    screensaverMode,
    screensaverSpecificEngine,
    screensaverCustomWallpaper,
    currentDesktopWallpaper,
    activeWallpaper,
    allWallpapers,
    randomSeed,
    installed,
    PROCEDURAL_ENGINES
  ])

  // Native file dialog import for screensaver
  const handleBrowseLocalFile = async () => {
    try {
      const res = await importWallpaperDialog()
      if (res) {
        setScreensaverCustomWallpaper(res)
        setScreensaverMode('custom')
        setIsCustomPickerOpen(false)
      }
    } catch (err) {
      console.warn('[Screensaver] browse local file failed:', err)
    }
  }

  const handleShuffleRandom = () => {
    setRandomSeed(s => s + 1)
  }

  const PRESENTATION_MODES = [
    {
      id: 'current',
      label: 'Mirror Active Wallpaper',
      desc: activeWallpaper ? `Smoothly mirrors "${activeWallpaper.name}" across all screens` : 'Mirrors current desktop wallpaper',
      tag: 'Seamless',
    },
    {
      id: 'custom',
      label: 'Custom Screensaver',
      desc: screensaverCustomWallpaper ? `Selected: "${screensaverCustomWallpaper.name}"` : 'Select any wallpaper from Library or browse local video/image',
      tag: 'Personalized',
    },
    {
      id: 'specific',
      label: 'Procedural Engine',
      desc: 'Runs a lightweight procedural Canvas 2D ambient engine',
      tag: 'Canvas 2D',
    },
    {
      id: 'random',
      label: 'Random Wallpaper',
      desc: 'Randomly cycles between your library wallpapers and procedural engines on activation',
      tag: 'Shuffle',
    },
    {
      id: 'blackout',
      label: 'Blackout (OLED Sleep)',
      desc: 'Pure pitch-black #000000 display with minimal zero-burn digital clock',
      tag: 'OLED Safe',
    },
  ]

  return (
    <div className="settings-page-container animate-fadeIn">
      {/* Top Header */}
      <header className="settings-page-header">
        <div>
          <h1 className="settings-page-title">Screensaver</h1>
          <p className="settings-page-desc">
            Automate ambient visuals, luxury OLED clock HUDs, and display burn-in protection when your PC is idle
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="telemetry-chip">
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: screensaverEnabled ? 'var(--color-emerald)' : 'var(--text-subtle)' }} />
            <span>{screensaverEnabled ? 'Automation Active' : 'Automation Off'}</span>
          </span>
        </div>
      </header>

      {/* Information Tip Banner */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: '10px 14px',
        borderRadius: 8,
        background: 'rgba(255, 255, 255, 0.03)',
        border: '1px solid var(--border-main)',
        marginBottom: 18,
        fontSize: 12,
        color: 'var(--text-muted)',
      }}>
        <Sparkles size={15} style={{ color: 'var(--color-brand)', flexShrink: 0 }} />
        <span>
          <strong>Live Preview Stage:</strong> The stage below simulates your real-time clock HUD and active screensaver engine. To test fullscreen screensaver anytime, right-click the <strong>AetherFlow Tray Icon → Screensaver</strong>.
        </span>
      </div>

      {/* Interactive Widescreen Simulator Stage */}
      <div className="screensaver-preview-card">
        {/* Live Wallpaper Animation Layer */}
        {previewEngineId ? (
          <div style={{ position: 'absolute', inset: 0, zIndex: 0, pointerEvents: 'none', overflow: 'hidden' }}>
            <WallpaperPlayer
              key={`${previewEngineId}-${previewConfig?.videoPath || previewConfig?.imagePath || previewConfig?.streamUrl || ''}-${randomSeed}`}
              engineId={previewEngineId}
              config={previewConfig}
              preview={true}
              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
            />
          </div>
        ) : (
          <div
            style={{
              position: 'absolute',
              inset: 0,
              background: '#000000',
              zIndex: 0,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              overflow: 'hidden',
            }}
          >
            {/* Ambient Starry Constellation for OLED Sleep Mode */}
            <div style={{
              position: 'absolute',
              inset: 0,
              backgroundImage: 'radial-gradient(circle at 20% 30%, rgba(255,255,255,0.15) 1px, transparent 1px), radial-gradient(circle at 80% 70%, rgba(255,255,255,0.18) 1px, transparent 1px), radial-gradient(circle at 50% 50%, rgba(255,255,255,0.1) 1.5px, transparent 1.5px), radial-gradient(circle at 35% 80%, rgba(255,255,255,0.12) 1px, transparent 1px)',
              backgroundSize: '160px 160px, 220px 220px, 110px 110px, 190px 190px',
              opacity: 0.7,
            }} />
            <div style={{
              position: 'absolute',
              top: 18,
              left: 20,
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              fontSize: 10.5,
              fontWeight: 600,
              textTransform: 'uppercase',
              letterSpacing: '0.08em',
              padding: '4px 10px',
              borderRadius: 20,
              background: 'rgba(255, 255, 255, 0.06)',
              border: '1px solid rgba(255, 255, 255, 0.12)',
              color: 'var(--color-brand)',
            }}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--color-brand)' }} />
              OLED Deep Blackout • Pure Display Sleep
            </div>
          </div>
        )}

        {/* Ambient Dark Scrim for High-Contrast HUD Readability */}
        <div
          style={{
            position: 'absolute',
            inset: 0,
            background: 'linear-gradient(to bottom, rgba(0,0,0,0.35) 0%, rgba(0,0,0,0.65) 100%)',
            pointerEvents: 'none',
            zIndex: 1,
          }}
        />

        {/* HUD Centerpiece Clock & Date */}
        <div style={{ position: 'relative', zIndex: 2, textAlign: 'center', userSelect: 'none' }}>
          <div className="screensaver-hud-clock font-mono">
            {timeString}
          </div>
          <div className="screensaver-hud-date">
            {dateString}
          </div>
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              marginTop: 16,
              padding: '3px 10px',
              borderRadius: 20,
              background: 'rgba(255, 255, 255, 0.08)',
              border: '1px solid rgba(255, 255, 255, 0.12)',
              fontSize: 10,
              letterSpacing: '0.06em',
              color: 'rgba(255, 255, 255, 0.7)',
              textTransform: 'uppercase',
            }}
          >
            <Eye size={11} />
            <span>Interactive Simulator • Press Esc or Move Mouse to Exit</span>
          </div>
        </div>

        {/* Bottom Bar Info */}
        <div
          style={{
            position: 'absolute',
            bottom: 12,
            left: 18,
            right: 18,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            zIndex: 3,
            fontSize: 11,
            color: 'var(--text-subtle)',
          }}
        >
          <span>Timeout: <strong style={{ color: 'var(--text-main)' }}>{screensaverTimeoutMins}m</strong></span>
          <span>Mode: <strong style={{ color: 'var(--color-brand)', textTransform: 'capitalize' }}>
            {screensaverMode === 'custom' && screensaverCustomWallpaper ? `Custom (${screensaverCustomWallpaper.name})` : screensaverMode}
          </strong></span>
          <span>Fade Duration: <strong style={{ color: 'var(--text-main)' }}>{screensaverFadeInSecs}s</strong></span>
        </div>
      </div>

      {/* Section 1: Activation & Timing */}
      <SettingSection title="Activation & timing">
        <SettingRow
          label="Enable screensaver automation"
          desc="Automatically engages the screensaver across all connected displays when no user input is detected"
        >
          <AetherToggle
            checked={screensaverEnabled}
            onChange={toggleScreensaverEnabled}
            ariaLabel="Enable screensaver automation"
          />
        </SettingRow>

        <SliderRow
          label="Idle activation timeout"
          desc="Minutes of system inactivity before screensaver engages"
          value={screensaverTimeoutMins}
          set={setScreensaverTimeoutMins}
          min={1}
          max={60}
          step={1}
          fmt={v => `${v} min${v > 1 ? 's' : ''}`}
          presets={[
            { label: '1m', val: 1 },
            { label: '5m', val: 5 },
            { label: '10m', val: 10 },
            { label: '15m', val: 15 },
            { label: '30m', val: 30 },
          ]}
        />

        <SliderRow
          label="Activation grace period"
          desc="Initial immunity duration to prevent accidental tray launch clicks or micro-jitters from dismissing screensaver"
          value={screensaverGracePeriodSecs}
          set={setScreensaverGracePeriodSecs}
          min={1}
          max={10}
          step={1}
          fmt={v => `${v}s`}
          presets={[
            { label: '2s', val: 2 },
            { label: '5s', val: 5 },
            { label: '10s', val: 10 },
          ]}
        />
      </SettingSection>

      {/* Section 2: Smart Trigger & Media Suppression */}
      <SettingSection title="Smart trigger & media suppression">
        <SettingRow
          label="Do not activate when fullscreen app is running"
          desc="Prevents screensaver engagement while watching full-screen movies, video streams, or playing games"
        >
          <AetherToggle
            checked={screensaverInhibitFullscreen}
            onChange={toggleScreensaverInhibitFullscreen}
            ariaLabel="Inhibit on fullscreen"
          />
        </SettingRow>

        <SettingRow
          label="Do not activate when window is maximized"
          desc="Suppresses screensaver when any active application window is maximized on your workspace"
        >
          <AetherToggle
            checked={screensaverInhibitMaximized}
            onChange={toggleScreensaverInhibitMaximized}
            ariaLabel="Inhibit on maximized"
          />
        </SettingRow>

        <SettingRow
          label="Do not activate during media & audio playback"
          desc="Suppresses screensaver while audio or video dialogue is playing through your default audio output"
        >
          <AetherToggle
            checked={screensaverInhibitMediaPlayback}
            onChange={toggleScreensaverInhibitMediaPlayback}
            ariaLabel="Inhibit on audio playback"
          />
        </SettingRow>
      </SettingSection>

      {/* Section 3: Visual Engine & Presentation */}
      <SettingSection title="Visual engine & presentation">
        <div style={{ padding: '16px 18px', borderBottom: '1px solid var(--border-subtle)' }}>
          <div className="settings-item-label" style={{ marginBottom: 4 }}>Screensaver presentation mode</div>
          <div className="settings-item-desc" style={{ marginBottom: 14 }}>
            Choose whether the screensaver mirrors your active desktop wallpaper, runs a custom wallpaper, or executes a procedural engine.
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: 12, marginBottom: 16 }}>
            {PRESENTATION_MODES.map(mode => {
              const isSelected = screensaverMode === mode.id
              return (
                <div
                  key={mode.id}
                  className={`display-card-compact ${isSelected ? 'selected' : ''}`}
                  onClick={() => setScreensaverMode(mode.id)}
                  style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 6, cursor: 'pointer' }}
                >
                  <div className="flex items-center justify-between" style={{ width: '100%' }}>
                    <span className="font-semibold text-sm" style={{ color: isSelected ? 'var(--color-brand)' : 'var(--text-main)' }}>
                      {mode.label}
                    </span>
                    {isSelected ? (
                      <span
                        style={{
                          width: 18, height: 18, borderRadius: '50%',
                          background: 'var(--color-brand)',
                          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                          color: '#fff', flexShrink: 0
                        }}
                      >
                        <Check size={11} strokeWidth={3} />
                      </span>
                    ) : (
                      <span className="badge" style={{ fontSize: 10 }}>{mode.tag}</span>
                    )}
                  </div>
                  <div className="text-xs text-muted" style={{ lineHeight: 1.45 }}>
                    {mode.desc}
                  </div>
                </div>
              )
            })}
          </div>

          {/* Custom Wallpaper Configuration Section */}
          {screensaverMode === 'custom' && (
            <div style={{ marginTop: 18, paddingTop: 18, borderTop: '1px solid var(--border-subtle)' }}>
              <div className="flex items-center justify-between" style={{ marginBottom: 12 }}>
                <div>
                  <div className="settings-item-label">Selected Custom Screensaver</div>
                  <div className="settings-item-desc" style={{ marginTop: 2 }}>
                    This wallpaper will play across all displays whenever your screensaver activates.
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    className="btn btn-secondary"
                    onClick={() => setIsCustomPickerOpen(true)}
                    style={{ fontSize: 12, padding: '6px 12px', display: 'inline-flex', alignItems: 'center', gap: 6 }}
                  >
                    <Layers size={13} />
                    <span>Choose from Library</span>
                  </button>
                  <button
                    className="btn btn-secondary"
                    onClick={handleBrowseLocalFile}
                    style={{ fontSize: 12, padding: '6px 12px', display: 'inline-flex', alignItems: 'center', gap: 6 }}
                  >
                    <FolderPlus size={13} />
                    <span>Browse File...</span>
                  </button>
                </div>
              </div>

              {screensaverCustomWallpaper ? (
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 16,
                    padding: 14,
                    borderRadius: 10,
                    background: 'rgba(255, 255, 255, 0.03)',
                    border: '1px solid var(--border-main)',
                  }}
                >
                  {/* Thumbnail */}
                  <div
                    style={{
                      width: 140,
                      aspectRatio: '16/9',
                      borderRadius: 8,
                      overflow: 'hidden',
                      position: 'relative',
                      flexShrink: 0,
                      background: '#000',
                      border: '1px solid var(--border-subtle)',
                    }}
                  >
                    <WallpaperThumbnail wallpaper={screensaverCustomWallpaper} />
                  </div>

                  {/* Info */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-main)', marginBottom: 4 }} className="truncate">
                      {screensaverCustomWallpaper.name || 'Custom Wallpaper'}
                    </div>
                    <div className="flex items-center gap-2" style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                      <span className="badge" style={{ fontSize: 10, textTransform: 'uppercase' }}>
                        {screensaverCustomWallpaper.engine === 'video-player' || screensaverCustomWallpaper.config?.videoPath
                          ? 'Video'
                          : screensaverCustomWallpaper.engine === 'image-player' || screensaverCustomWallpaper.config?.imagePath
                          ? 'Picture'
                          : screensaverCustomWallpaper.engine === 'web-stream' || screensaverCustomWallpaper.config?.streamUrl
                          ? 'Web Stream'
                          : 'Procedural'}
                      </span>
                      {screensaverCustomWallpaper.config?.videoPath && (
                        <span className="truncate" style={{ maxWidth: 280, opacity: 0.7 }}>
                          {screensaverCustomWallpaper.config.videoPath.split('\\').pop()}
                        </span>
                      )}
                      {screensaverCustomWallpaper.config?.imagePath && (
                        <span className="truncate" style={{ maxWidth: 280, opacity: 0.7 }}>
                          {screensaverCustomWallpaper.config.imagePath.split('\\').pop()}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-2">
                    <button
                      className="btn btn-secondary"
                      onClick={() => setIsCustomPickerOpen(true)}
                      style={{ fontSize: 12, padding: '6px 12px' }}
                    >
                      Change
                    </button>
                  </div>
                </div>
              ) : (
                <div
                  style={{
                    padding: '24px 20px',
                    borderRadius: 10,
                    background: 'rgba(255, 255, 255, 0.02)',
                    border: '1px dashed var(--border-main)',
                    textAlign: 'center',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: 12,
                  }}
                >
                  <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>
                    No custom screensaver selected yet. Choose any wallpaper from your library or import a local video/image.
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      className="btn btn-primary"
                      onClick={() => setIsCustomPickerOpen(true)}
                      style={{ fontSize: 12, padding: '7px 14px', display: 'inline-flex', alignItems: 'center', gap: 6 }}
                    >
                      <Layers size={14} />
                      <span>Choose from Library</span>
                    </button>
                    <button
                      className="btn btn-secondary"
                      onClick={handleBrowseLocalFile}
                      style={{ fontSize: 12, padding: '7px 14px', display: 'inline-flex', alignItems: 'center', gap: 6 }}
                    >
                      <FolderPlus size={14} />
                      <span>Browse Local Media...</span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Random Mode Explanation & Shuffle Preview */}
          {screensaverMode === 'random' && (
            <div
              style={{
                marginTop: 18,
                paddingTop: 18,
                borderTop: '1px solid var(--border-subtle)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 16,
              }}
            >
              <div className="flex items-center gap-3">
                <div
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: '50%',
                    background: 'rgba(255, 255, 255, 0.05)',
                    border: '1px solid var(--border-subtle)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: 'var(--color-brand)',
                    flexShrink: 0,
                  }}
                >
                  <Shuffle size={16} />
                </div>
                <div>
                  <div className="settings-item-label">Dynamic Random Cycle</div>
                  <div className="settings-item-desc" style={{ marginTop: 2 }}>
                    Each time your PC goes idle, a random wallpaper from your installed library and procedural engines will be selected.
                  </div>
                </div>
              </div>
              <button
                className="btn btn-secondary"
                onClick={handleShuffleRandom}
                style={{ fontSize: 12, padding: '6px 12px', display: 'inline-flex', alignItems: 'center', gap: 6, flexShrink: 0 }}
              >
                <Shuffle size={13} />
                <span>Shuffle Preview Stage</span>
              </button>
            </div>
          )}

          {/* Specific Engine Grid */}
          {screensaverMode === 'specific' && (
            <div style={{ marginTop: 16, paddingTop: 16, borderTop: '1px solid var(--border-subtle)' }}>
              <div className="settings-item-label" style={{ marginBottom: 10 }}>
                Select Procedural Ambient Engine
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 10 }}>
                {PROCEDURAL_ENGINES.map(eng => {
                  const isSelected = (screensaverSpecificEngine || 'matrix-rain') === eng.id
                  return (
                    <div
                      key={eng.id}
                      className={`display-card-compact ${isSelected ? 'selected' : ''}`}
                      style={{ padding: '10px 12px', display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 4, cursor: 'pointer' }}
                      onClick={() => {
                        setScreensaverMode('specific')
                        setScreensaverSpecificEngine(eng.id)
                      }}
                    >
                      <div className="flex items-center justify-between" style={{ width: '100%' }}>
                        <span className="font-semibold text-xs" style={{ color: isSelected ? 'var(--color-brand)' : 'var(--text-main)' }}>
                          {eng.name}
                        </span>
                        {isSelected && <Check size={11} strokeWidth={3} style={{ color: 'var(--color-brand)' }} />}
                      </div>
                      <div className="text-xs text-muted" style={{ fontSize: 11 }}>
                        {eng.desc}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </div>

        <SliderRow
          label="Fade-in transition duration"
          desc="Duration of cinematic crossfade when screensaver engages"
          value={screensaverFadeInSecs}
          set={setScreensaverFadeInSecs}
          min={0.2}
          max={4.0}
          step={0.2}
          fmt={v => `${v}s`}
          presets={[
            { label: '0.5s', val: 0.5 },
            { label: '1s', val: 1.0 },
            { label: '2s', val: 2.0 },
            { label: '3s', val: 3.0 },
          ]}
        />
      </SettingSection>

      {/* Section 4: Security & Audio Policies */}
      <SettingSection title="Security & audio policies">
        <SettingRow
          label="Lock Windows on resume"
          desc="Automatically locks the Windows workstation when user input wakes the display from screensaver"
        >
          <AetherToggle
            checked={screensaverLockOnResume}
            onChange={toggleScreensaverLockOnResume}
            ariaLabel="Lock Windows on resume"
          />
        </SettingRow>

        <SettingRow
          label="Mute audio during screensaver"
          desc="Immediately mutes all wallpaper and media playback while the screensaver is engaged"
        >
          <AetherToggle
            checked={screensaverMuteAudio}
            onChange={toggleScreensaverMuteAudio}
            ariaLabel="Mute audio during screensaver"
          />
        </SettingRow>
      </SettingSection>

      {/* Custom Wallpaper Picker Modal */}
      {isCustomPickerOpen && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 10000,
            background: 'rgba(0, 0, 0, 0.75)',
            backdropFilter: 'blur(10px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 20,
          }}
          onClick={(e) => {
            if (e.target === e.currentTarget) setIsCustomPickerOpen(false)
          }}
        >
          <div
            style={{
              width: '100%',
              maxWidth: 820,
              maxHeight: '85vh',
              borderRadius: 14,
              background: 'var(--bg-card, #12141a)',
              border: '1px solid var(--border-main)',
              boxShadow: '0 24px 60px rgba(0, 0, 0, 0.8)',
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden',
              animation: 'scaleIn 0.15s ease-out',
            }}
          >
            {/* Modal Header */}
            <div
              style={{
                padding: '16px 20px',
                borderBottom: '1px solid var(--border-subtle)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}
            >
              <div>
                <h2 style={{ fontSize: 16, fontWeight: 600, color: 'var(--text-main)', margin: 0 }}>
                  Select Custom Screensaver
                </h2>
                <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '3px 0 0 0' }}>
                  Choose any installed video, picture, web stream, or procedural engine
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  className="btn btn-secondary"
                  onClick={handleBrowseLocalFile}
                  style={{ fontSize: 12, padding: '5px 10px', display: 'inline-flex', alignItems: 'center', gap: 5 }}
                >
                  <FolderPlus size={13} />
                  <span>Browse File...</span>
                </button>
                <button
                  onClick={() => setIsCustomPickerOpen(false)}
                  style={{
                    background: 'transparent',
                    border: 'none',
                    color: 'var(--text-muted)',
                    cursor: 'pointer',
                    padding: 4,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    borderRadius: 6,
                  }}
                  aria-label="Close modal"
                >
                  <X size={18} />
                </button>
              </div>
            </div>

            {/* Modal Toolbar: Search & Filter Chips */}
            <div
              style={{
                padding: '12px 20px',
                borderBottom: '1px solid var(--border-subtle)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 14,
                flexWrap: 'wrap',
                background: 'rgba(0, 0, 0, 0.15)',
              }}
            >
              {/* Search Bar */}
              <div
                style={{
                  position: 'relative',
                  flex: '1 1 220px',
                  minWidth: 180,
                }}
              >
                <Search
                  size={14}
                  style={{
                    position: 'absolute',
                    left: 10,
                    top: '50%',
                    transform: 'translateY(-50%)',
                    color: 'var(--text-muted)',
                    pointerEvents: 'none',
                  }}
                />
                <input
                  type="text"
                  className="input-search"
                  placeholder="Search wallpapers..."
                  value={pickerSearch}
                  onChange={(e) => setPickerSearch(e.target.value)}
                  style={{
                    width: '100%',
                    paddingLeft: 32,
                    paddingRight: 10,
                    height: 32,
                    fontSize: 12,
                    background: 'rgba(255, 255, 255, 0.04)',
                    border: '1px solid var(--border-main)',
                    borderRadius: 6,
                    color: 'var(--text-main)',
                  }}
                />
              </div>

              {/* Category Filter Chips */}
              <div className="flex items-center gap-1.5" style={{ overflowX: 'auto' }}>
                {[
                  { id: 'all', label: 'All' },
                  { id: 'video', label: 'Videos' },
                  { id: 'image', label: 'Pictures' },
                  { id: 'stream', label: 'Streams' },
                  { id: 'canvas', label: 'Procedural' },
                ].map((cat) => {
                  const isActive = pickerCategory === cat.id
                  return (
                    <button
                      key={cat.id}
                      onClick={() => setPickerCategory(cat.id)}
                      style={{
                        padding: '4px 10px',
                        borderRadius: 20,
                        fontSize: 11,
                        fontWeight: 600,
                        cursor: 'pointer',
                        background: isActive ? 'var(--color-brand)' : 'rgba(255, 255, 255, 0.05)',
                        color: isActive ? '#fff' : 'var(--text-muted)',
                        border: '1px solid',
                        borderColor: isActive ? 'var(--color-brand)' : 'var(--border-subtle)',
                        transition: 'all 0.15s ease',
                      }}
                    >
                      {cat.label}
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Wallpaper Grid */}
            <div
              style={{
                flex: 1,
                overflowY: 'auto',
                padding: 20,
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
                gap: 12,
              }}
            >
              {pickerCandidates.length === 0 ? (
                <div
                  style={{
                    gridColumn: '1 / -1',
                    textAlign: 'center',
                    padding: '40px 0',
                    color: 'var(--text-muted)',
                    fontSize: 13,
                  }}
                >
                  No matching wallpapers found.
                </div>
              ) : (
                pickerCandidates.map((wp) => {
                  const isSelected = screensaverCustomWallpaper?.id === wp.id
                  return (
                    <div
                      key={wp.id}
                      className="screensaver-picker-item"
                      data-id={wp.id}
                      onClick={() => {
                        setScreensaverCustomWallpaper(wp)
                        setScreensaverMode('custom')
                        setIsCustomPickerOpen(false)
                      }}
                      style={{
                        position: 'relative',
                        borderRadius: 8,
                        overflow: 'hidden',
                        aspectRatio: '16/9',
                        cursor: 'pointer',
                        border: isSelected ? '2px solid var(--color-brand)' : '1px solid var(--border-main)',
                        boxShadow: isSelected ? '0 0 14px var(--color-brand)' : 'none',
                        transition: 'all 0.15s ease',
                      }}
                    >
                      <div style={{ width: '100%', height: '100%', pointerEvents: 'none' }}>
                        <WallpaperThumbnail wallpaper={wp} />
                      </div>
                      <div
                        style={{
                          position: 'absolute',
                          inset: 0,
                          background: 'linear-gradient(to top, rgba(0,0,0,0.85) 0%, transparent 60%)',
                          pointerEvents: 'none',
                        }}
                      />
                      <div
                        style={{
                          position: 'absolute',
                          bottom: 6,
                          left: 8,
                          right: 28,
                          fontSize: 11,
                          fontWeight: 600,
                          color: '#fff',
                          pointerEvents: 'none',
                        }}
                        className="truncate"
                      >
                        {wp.name}
                      </div>
                      <div
                        style={{
                          position: 'absolute',
                          top: 6,
                          right: 6,
                          width: 18,
                          height: 18,
                          borderRadius: 4,
                          background: isSelected ? 'var(--color-brand)' : 'rgba(0,0,0,0.6)',
                          border: '1px solid rgba(255,255,255,0.2)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          color: '#fff',
                          pointerEvents: 'none',
                        }}
                      >
                        {isSelected && <Check size={12} strokeWidth={3} />}
                      </div>
                    </div>
                  )
                })
              )}
            </div>

            {/* Modal Footer */}
            <div
              style={{
                padding: '12px 20px',
                borderTop: '1px solid var(--border-subtle)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                background: 'rgba(0,0,0,0.2)',
              }}
            >
              <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                {pickerCandidates.length} wallpaper{pickerCandidates.length === 1 ? '' : 's'} available
              </span>
              <button
                className="btn btn-secondary"
                onClick={() => setIsCustomPickerOpen(false)}
                style={{ fontSize: 12, padding: '5px 14px' }}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
