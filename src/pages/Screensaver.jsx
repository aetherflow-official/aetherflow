import React, { useState, useEffect } from 'react'
import {
  Moon, Sparkles, Clock, Shield, ShieldCheck, Volume2, VolumeX,
  Play, Check, AlertCircle, Laptop, Sliders, Zap, Eye, RotateCcw,
  Film, Maximize2
} from 'lucide-react'
import { useStore } from '../store/useStore.js'
import { ENGINES } from '../engines/index.js'
import WallpaperPlayer from '../components/WallpaperPlayer/index.jsx'
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

  // Real-time clock for the HUD simulation preview
  const [currentTime, setCurrentTime] = useState(new Date())

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

  const PROCEDURAL_ENGINES = [
    { id: 'matrix-rain', name: 'Matrix Rain', desc: 'Cascading digital katakana rain' },
    { id: 'deep-space', name: 'Deep Space', desc: 'Parallax starfield & cosmic nebula' },
    { id: 'tokyo-rain', name: 'Tokyo Rain', desc: 'Cyberpunk rainy neon metropolis' },
    { id: 'aurora', name: 'Aurora Borealis', desc: 'Harmonic northern lights waves' },
    { id: 'synthwave-grid', name: 'Synthwave Grid', desc: 'Retro 80s neon horizon' },
    { id: 'cyber-particles', name: 'Cyber Particles', desc: 'Constellation network nodes' },
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
          <span>Mode: <strong style={{ color: 'var(--color-brand)', textTransform: 'capitalize' }}>{screensaverMode}</strong></span>
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
                  className={`display-card-compact ${isSelected ? 'selected' : ''}`}
                  onClick={() => setScreensaverMode(mode.id)}
                  style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 6 }}
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
                      style={{ padding: '10px 12px', display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 4 }}
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
    </div>
  )
}
