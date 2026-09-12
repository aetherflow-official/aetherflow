import React, { useState, useEffect } from 'react'
import {
  Moon, Sparkles, Clock, Shield, ShieldCheck, Volume2, VolumeX,
  Play, Check, AlertCircle, Laptop, Sliders, Zap, Eye, RotateCcw
} from 'lucide-react'
import { useStore } from '../store/useStore.js'
import { ENGINES } from '../engines/index.js'
import WallpaperPlayer from '../components/WallpaperPlayer/index.jsx'

export default function Screensaver() {
  const screensaverEnabled = useStore(s => s.screensaverEnabled)
  const toggleScreensaverEnabled = useStore(s => s.toggleScreensaverEnabled)
  const screensaverTimeoutMins = useStore(s => s.screensaverTimeoutMins)
  const setScreensaverTimeoutMins = useStore(s => s.setScreensaverTimeoutMins)
  const screensaverMode = useStore(s => s.screensaverMode) || 'current'
  const setScreensaverMode = useStore(s => s.setScreensaverMode)
  const screensaverSpecificEngine = useStore(s => s.screensaverSpecificEngine)
  const setScreensaverSpecificEngine = useStore(s => s.setScreensaverSpecificEngine)
  const screensaverFadeInSecs = useStore(s => s.screensaverFadeInSecs) || 1.0
  const setScreensaverFadeInSecs = useStore(s => s.setScreensaverFadeInSecs)
  const screensaverLockOnResume = useStore(s => s.screensaverLockOnResume) || false
  const toggleScreensaverLockOnResume = useStore(s => s.toggleScreensaverLockOnResume)
  const screensaverGracePeriodSecs = useStore(s => s.screensaverGracePeriodSecs) || 5
  const setScreensaverGracePeriodSecs = useStore(s => s.setScreensaverGracePeriodSecs)
  const screensaverMuteAudio = useStore(s => s.screensaverMuteAudio) ?? true
  const toggleScreensaverMuteAudio = useStore(s => s.toggleScreensaverMuteAudio)
  const activeWallpaper = useStore(s => s.activeWallpaper)
  const currentDesktopWallpaper = useStore(s => s.currentDesktopWallpaper)

  // Real-time clock for the HUD simulation preview
  const [currentTime, setCurrentTime] = useState(new Date())
  const [testingLaunch, setTestingLaunch] = useState(false)

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000)
    return () => clearInterval(timer)
  }, [])

  // Auto-sync screensaver settings to Rust backend whenever any configuration changes
  useEffect(() => {
    import('@tauri-apps/api/core').then(({ invoke }) => {
      invoke('sync_screensaver_settings', {
        settings: {
          enabled: screensaverEnabled,
          idle_timeout_mins: screensaverTimeoutMins,
          mode: screensaverMode,
          specific_engine: screensaverSpecificEngine,
          specific_config: null,
          fade_in_secs: screensaverFadeInSecs,
          lock_on_resume: screensaverLockOnResume,
          grace_period_secs: screensaverGracePeriodSecs,
          mute_audio: screensaverMuteAudio,
        }
      }).catch(() => {})
    }).catch(() => {})
  }, [
    screensaverEnabled,
    screensaverTimeoutMins,
    screensaverMode,
    screensaverSpecificEngine,
    screensaverFadeInSecs,
    screensaverLockOnResume,
    screensaverGracePeriodSecs,
    screensaverMuteAudio,
  ])

  const timeString = currentTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })
  const dateString = currentTime.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' })

  // Determine which engine and config to preview on the live stage
  const { previewEngineId, previewConfig, isBlackoutMode } = (() => {
    if (screensaverMode === 'blackout') {
      return { previewEngineId: null, previewConfig: {}, isBlackoutMode: true }
    }
    if (screensaverMode === 'specific') {
      const eng = screensaverSpecificEngine || 'matrix-rain'
      const desc = ENGINES[eng]
      return { previewEngineId: eng, previewConfig: desc?.defaultConfig || {}, isBlackoutMode: false }
    }
    if (screensaverMode === 'random') {
      return { previewEngineId: 'synthwave-grid', previewConfig: ENGINES['synthwave-grid']?.defaultConfig || {} }
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
  })()

  const handleLaunchScreensaver = async () => {
    if (testingLaunch) return
    setTestingLaunch(true)

    // Fail-safe safety guard: unconditionally release button lock after 2000ms
    const safetyTimer = setTimeout(() => {
      setTestingLaunch(false)
    }, 2000)

    try {
      const { invoke } = await import('@tauri-apps/api/core')
      // Ensure backend settings are fully up-to-date before launching
      await invoke('sync_screensaver_settings', {
        settings: {
          enabled: screensaverEnabled,
          idle_timeout_mins: screensaverTimeoutMins,
          mode: screensaverMode,
          specific_engine: screensaverSpecificEngine,
          specific_config: null,
          fade_in_secs: screensaverFadeInSecs,
          lock_on_resume: screensaverLockOnResume,
          grace_period_secs: screensaverGracePeriodSecs,
          mute_audio: screensaverMuteAudio,
        }
      }).catch((e) => console.warn('[Screensaver] sync error:', e))

      // Trigger screensaver with timeout protection so IPC never blocks UI
      const triggerPromise = invoke('trigger_screensaver', { isPreview: true, is_preview: true })
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Screensaver launch timeout')), 1500)
      )
      await Promise.race([triggerPromise, timeoutPromise])
    } catch (err) {
      console.warn('[Screensaver] Launch warning/error:', err)
    } finally {
      clearTimeout(safetyTimer)
      setTimeout(() => setTestingLaunch(false), 800)
    }
  }

  const PROCEDURAL_ENGINES = [
    { id: 'matrix-rain', name: 'Matrix Rain', desc: 'Cascading digital katakana rain' },
    { id: 'deep-space', name: 'Deep Space', desc: 'Parallax starfield & cosmic nebula' },
    { id: 'tokyo-rain', name: 'Tokyo Rain', desc: 'Cyberpunk rainy neon metropolis' },
    { id: 'aurora', name: 'Aurora Borealis', desc: 'Harmonic northern lights waves' },
    { id: 'synthwave-grid', name: 'Synthwave Grid', desc: 'Retro 80s neon horizon' },
    { id: 'cyber-particles', name: 'Cyber Particles', desc: 'Constellation network nodes' },
  ]

  return (
    <div className="animate-fadeIn" style={{ maxWidth: 880, margin: '0 auto', paddingBottom: 48 }}>
      {/* Top Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 className="font-display font-bold text-2xl" style={{ letterSpacing: '-0.5px' }}>
            Screensaver Studio
          </h1>
          <p className="text-muted text-sm" style={{ marginTop: 4 }}>
            Automate ambient visuals, luxury OLED clock HUDs, and display burn-in protection when your PC is idle
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className={`badge ${screensaverEnabled ? 'badge-emerald' : ''}`} style={{ fontSize: 11, padding: '4px 10px' }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: screensaverEnabled ? 'var(--color-emerald)' : 'var(--text-subtle)' }} />
            {screensaverEnabled ? 'Screensaver Active' : 'Screensaver Disabled'}
          </span>
          <button
            type="button"
            className="btn btn-primary"
            style={{ fontSize: 12, padding: '5px 14px', height: 32 }}
            onClick={handleLaunchScreensaver}
            disabled={testingLaunch}
          >
            <Sparkles size={14} /> {testingLaunch ? 'Launching...' : 'Preview Fullscreen'}
          </button>
        </div>
      </div>

      {/* Interactive Widescreen Simulator Stage */}
      <div
        className="screensaver-preview-card"
        onClick={handleLaunchScreensaver}
        title="Click to launch fullscreen screensaver preview"
        role="button"
        tabIndex={0}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') handleLaunchScreensaver() }}
      >
        {/* Live Wallpaper Animation Layer */}
        {previewEngineId ? (
          <div style={{ position: 'absolute', inset: 0, zIndex: 0, pointerEvents: 'none', overflow: 'hidden' }}>
            <WallpaperPlayer
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

        {/* Play Overlay on Hover */}
        <div className="screensaver-play-overlay">
          <div style={{
            width: 46, height: 46, borderRadius: '50%',
            background: 'var(--color-brand)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: '0 0 24px var(--color-glow)',
            color: '#fff',
            marginBottom: 8,
          }}>
            <Play size={22} fill="#fff" style={{ marginLeft: 3 }} />
          </div>
          <span style={{ fontSize: 13, fontWeight: 600, color: '#fff', letterSpacing: '0.02em', textShadow: '0 2px 10px rgba(0,0,0,0.8)' }}>
            {testingLaunch ? 'Launching Screensaver…' : 'Click Stage to Preview Fullscreen'}
          </span>
          <span style={{ fontSize: 10.5, color: 'rgba(255,255,255,0.7)', marginTop: 3 }}>
            Move mouse or press any key to wake
          </span>
        </div>

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
          <span>Mode: <strong style={{ color: 'var(--color-brand)', textTransform: 'capitalize' }}>{screensaverMode}</strong></span>
          <span>Fade Duration: <strong style={{ color: 'var(--text-main)' }}>{screensaverFadeInSecs}s</strong></span>
        </div>
      </div>

      {/* Setting Card 1: Activation & Timing */}
      <div className="setting-card">
        <div className="setting-card-header">
          <div className="flex items-center gap-2.5">
            <Clock size={16} style={{ color: 'var(--color-brand)' }} />
            <span className="text-sm font-semibold">Activation & Timing</span>
          </div>
          <span className="badge font-mono" style={{ fontSize: 10 }}>Win32 IdleHook</span>
        </div>

        {/* Master Toggle */}
        <div className="setting-row">
          <div style={{ flex: 1, minWidth: 0, paddingRight: 16 }}>
            <div className="text-sm font-semibold" style={{ color: 'var(--text-main)' }}>Enable Screensaver Automation</div>
            <div className="text-xs text-muted" style={{ marginTop: 3 }}>
              Automatically engages the screensaver across all connected displays when no user input is detected
            </div>
          </div>
          <label className="toggle">
            <input
              type="checkbox"
              checked={screensaverEnabled}
              onChange={toggleScreensaverEnabled}
            />
            <div className="toggle-track" />
            <div className="toggle-thumb" />
          </label>
        </div>

        {/* Inactivity Timeout Slider */}
        <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--border-subtle)' }}>
          <div className="flex items-center justify-between" style={{ marginBottom: 6 }}>
            <div>
              <div className="text-sm font-semibold" style={{ color: 'var(--text-main)' }}>Idle Activation Timeout</div>
              <div className="text-xs text-muted" style={{ marginTop: 2 }}>
                Minutes of system inactivity before screensaver activates
              </div>
            </div>
            <span className="telemetry-chip font-mono" style={{ color: 'var(--color-brand)' }}>
              {screensaverTimeoutMins} min{screensaverTimeoutMins > 1 ? 's' : ''}
            </span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginTop: 10 }}>
            <input
              type="range"
              min={1}
              max={60}
              step={1}
              value={screensaverTimeoutMins}
              onChange={e => setScreensaverTimeoutMins(Number(e.target.value))}
              style={{ flex: 1 }}
            />
            <div style={{ display: 'flex', gap: 4 }}>
              {[1, 5, 10, 15, 30].map(mins => (
                <button
                  key={mins}
                  type="button"
                  className="btn btn-ghost"
                  style={{
                    padding: '2px 8px',
                    fontSize: 10.5,
                    height: 22,
                    background: screensaverTimeoutMins === mins ? 'color-mix(in srgb, var(--color-brand) 18%, transparent)' : 'transparent',
                    color: screensaverTimeoutMins === mins ? 'var(--color-brand)' : 'var(--text-muted)',
                    border: screensaverTimeoutMins === mins ? '1px solid var(--color-brand)' : '1px solid var(--border-subtle)',
                  }}
                  onClick={() => setScreensaverTimeoutMins(mins)}
                >
                  {mins}m
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Launch Grace Period */}
        <div style={{ padding: '14px 18px' }}>
          <div className="flex items-center justify-between" style={{ marginBottom: 6 }}>
            <div>
              <div className="text-sm font-semibold" style={{ color: 'var(--text-main)' }}>Activation Grace Period</div>
              <div className="text-xs text-muted" style={{ marginTop: 2 }}>
                Initial immunity duration to prevent accidental tray launch clicks or micro-jitters from instantly dismissing the screensaver
              </div>
            </div>
            <span className="telemetry-chip font-mono" style={{ color: 'var(--color-brand)' }}>
              {screensaverGracePeriodSecs}s
            </span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginTop: 10 }}>
            <input
              type="range"
              min={1}
              max={10}
              step={1}
              value={screensaverGracePeriodSecs}
              onChange={e => setScreensaverGracePeriodSecs(Number(e.target.value))}
              style={{ flex: 1 }}
            />
          </div>
        </div>
      </div>

      {/* Setting Card 2: Visual Engine & Mode */}
      <div className="setting-card">
        <div className="setting-card-header">
          <div className="flex items-center gap-2.5">
            <Sparkles size={16} style={{ color: 'var(--color-purple)' }} />
            <span className="text-sm font-semibold">Visual Engine & Presentation</span>
          </div>
          <span className="badge font-mono" style={{ fontSize: 10 }}>Display Modes</span>
        </div>

        <div style={{ padding: '16px 18px' }}>
          <div className="text-xs text-muted" style={{ marginBottom: 14 }}>
            Choose whether the screensaver mirrors your active desktop wallpaper or runs a specialized procedural Canvas 2D engine.
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12, marginBottom: 16 }}>
            {[
              {
                id: 'current',
                label: 'Mirror Active Wallpaper',
                desc: activeWallpaper ? `Smoothly mirrors "${activeWallpaper.name}" across all screens` : 'Mirrors current desktop wallpaper',
                tag: 'Seamless',
              },
              {
                id: 'specific',
                label: 'Dedicated Procedural Engine',
                desc: 'Runs a lightweight procedural Canvas 2D ambient engine with luxury HUD clock',
                tag: 'Canvas 2D',
              },
              {
                id: 'blackout',
                label: 'Blackout (OLED Sleep)',
                desc: 'Pure pitch-black #000000 display with minimal zero-burn digital clock',
                tag: 'OLED Safe',
              },
            ].map(mode => {
              const isSelected = screensaverMode === mode.id
              return (
                <div
                  key={mode.id}
                  className={`option-card ${isSelected ? 'selected' : ''}`}
                  onClick={() => setScreensaverMode(mode.id)}
                >
                  <div className="flex items-center justify-between" style={{ marginBottom: 6 }}>
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

          {/* Specific Engine Grid (Shown when screensaverMode === 'specific') */}
          {screensaverMode === 'specific' && (
            <div style={{ marginTop: 16, paddingTop: 16, borderTop: '1px solid var(--border-subtle)' }}>
              <div className="text-xs font-semibold" style={{ marginBottom: 10, color: 'var(--text-main)' }}>
                Select Procedural Ambient Engine
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 10 }}>
                {PROCEDURAL_ENGINES.map(eng => {
                  const isSelected = (screensaverSpecificEngine || 'matrix-rain') === eng.id
                  return (
                    <div
                      key={eng.id}
                      className={`option-card ${isSelected ? 'selected' : ''}`}
                      style={{ padding: '10px 12px' }}
                      onClick={() => {
                        setScreensaverMode('specific')
                        setScreensaverSpecificEngine(eng.id)
                      }}
                    >
                      <div className="flex items-center justify-between" style={{ marginBottom: 4 }}>
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

        {/* Fade-in Transition Duration */}
        <div style={{ padding: '14px 18px', borderTop: '1px solid var(--border-subtle)' }}>
          <div className="flex items-center justify-between" style={{ marginBottom: 6 }}>
            <div>
              <div className="text-sm font-semibold" style={{ color: 'var(--text-main)' }}>Fade-In Transition Duration</div>
              <div className="text-xs text-muted" style={{ marginTop: 2 }}>
                Duration of cinematic crossfade when screensaver engages
              </div>
            </div>
            <span className="telemetry-chip font-mono" style={{ color: 'var(--color-brand)' }}>
              {screensaverFadeInSecs}s
            </span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginTop: 10 }}>
            <input
              type="range"
              min={0.2}
              max={4.0}
              step={0.2}
              value={screensaverFadeInSecs}
              onChange={e => setScreensaverFadeInSecs(Number(e.target.value))}
              style={{ flex: 1 }}
            />
          </div>
        </div>
      </div>

      {/* Setting Card 3: Security & Audio Policies */}
      <div className="setting-card">
        <div className="setting-card-header">
          <div className="flex items-center gap-2.5">
            <ShieldCheck size={16} style={{ color: 'var(--color-emerald)' }} />
            <span className="text-sm font-semibold">Security & Audio Policies</span>
          </div>
          <span className="badge font-mono" style={{ fontSize: 10 }}>Protection</span>
        </div>

        {/* Lock on Resume */}
        <div className="setting-row">
          <div style={{ flex: 1, minWidth: 0, paddingRight: 16 }}>
            <div className="text-sm font-semibold flex items-center gap-2" style={{ color: 'var(--text-main)' }}>
              <span>Lock Windows on Resume</span>
              <span className="badge font-mono" style={{ fontSize: 9 }}>Win+L Secure</span>
            </div>
            <div className="text-xs text-muted" style={{ marginTop: 3 }}>
              Automatically locks the Windows workstation when user input wakes the display from screensaver
            </div>
          </div>
          <label className="toggle">
            <input
              type="checkbox"
              checked={screensaverLockOnResume}
              onChange={toggleScreensaverLockOnResume}
            />
            <div className="toggle-track" />
            <div className="toggle-thumb" />
          </label>
        </div>

        {/* Mute Audio on Screensaver */}
        <div className="setting-row">
          <div style={{ flex: 1, minWidth: 0, paddingRight: 16 }}>
            <div className="text-sm font-semibold flex items-center gap-2" style={{ color: 'var(--text-main)' }}>
              <span>Mute Audio during Screensaver</span>
              <span className="badge font-mono" style={{ fontSize: 9 }}>Silent Sleep</span>
            </div>
            <div className="text-xs text-muted" style={{ marginTop: 3 }}>
              Immediately mutes all wallpaper and media playback while the screensaver is engaged
            </div>
          </div>
          <label className="toggle">
            <input
              type="checkbox"
              checked={screensaverMuteAudio}
              onChange={toggleScreensaverMuteAudio}
            />
            <div className="toggle-track" />
            <div className="toggle-thumb" />
          </label>
        </div>
      </div>
    </div>
  )
}
