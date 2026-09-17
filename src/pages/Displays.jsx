import React, { useState, useEffect } from 'react'
import {
  Monitor, Zap, Battery, LayoutTemplate, RefreshCw,
  ExternalLink, CheckCircle2, Check, Layers
} from 'lucide-react'
import { useStore } from '../store/useStore.js'
import {
  SettingSection,
  SettingRow,
  SliderRow,
  AetherToggle,
  AetherSegmented,
} from '../components/Settings/SettingsUI.jsx'

function TaskbarWireframeIllustration({ styleId, isSelected }) {
  return (
    <div
      style={{
        width: '100%',
        height: 52,
        borderRadius: 5,
        position: 'relative',
        overflow: 'hidden',
        border: `1px solid ${isSelected ? 'var(--color-brand)' : 'var(--border-subtle)'}`,
        background: 'linear-gradient(135deg, #070e1d 0%, #120a22 50%, #0a1b20 100%)',
        marginBottom: 8,
        pointerEvents: 'none',
      }}
    >
      {/* Subtle simulated desktop ambient colors */}
      <div
        style={{
          position: 'absolute',
          top: 4,
          left: 10,
          width: 24,
          height: 24,
          borderRadius: '50%',
          background: 'radial-gradient(circle, #38bdf8 0%, rgba(56,189,248,0) 70%)',
          filter: 'blur(3px)',
          opacity: 0.5,
        }}
      />
      <div
        style={{
          position: 'absolute',
          top: 8,
          right: 14,
          width: 28,
          height: 28,
          borderRadius: '50%',
          background: 'radial-gradient(circle, #ec4899 0%, rgba(236,72,153,0) 70%)',
          filter: 'blur(4px)',
          opacity: 0.4,
        }}
      />

      {/* Taskbar shelf at bottom */}
      <div
        style={{
          position: 'absolute',
          bottom: 0,
          left: 0,
          right: 0,
          height: 16,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 3,
          padding: '0 6px',
          ...(styleId === 'default' && {
            background: 'rgba(15, 18, 26, 0.95)',
            borderTop: '1px solid rgba(255, 255, 255, 0.1)',
          }),
          ...(styleId === 'clear' && {
            background: 'transparent',
            borderTop: '1px solid transparent',
          }),
          ...(styleId === 'acrylic' && {
            background: 'rgba(25, 30, 45, 0.45)',
            backdropFilter: 'blur(8px)',
            borderTop: '1px solid rgba(255, 255, 255, 0.25)',
          }),
          ...(styleId === 'blur' && {
            background: 'rgba(20, 24, 36, 0.65)',
            backdropFilter: 'blur(12px)',
            borderTop: '1px solid rgba(255, 255, 255, 0.08)',
          }),
        }}
      >
        <div style={{ width: 5, height: 5, borderRadius: 1, background: '#0ea5e9' }} />
        <div style={{ width: 5, height: 5, borderRadius: 1, background: '#f59e0b' }} />
        <div style={{ width: 5, height: 5, borderRadius: 1, background: 'var(--color-brand)' }} />
        <div style={{ width: 5, height: 5, borderRadius: 1, background: '#10b981' }} />
        <div style={{ width: 5, height: 5, borderRadius: 1, background: 'rgba(255,255,255,0.7)' }} />

        <div
          style={{
            position: 'absolute',
            right: 6,
            display: 'flex',
            alignItems: 'center',
            gap: 2,
          }}
        >
          <div style={{ width: 2.5, height: 2.5, borderRadius: '50%', background: 'rgba(255,255,255,0.4)' }} />
          <div style={{ width: 8, height: 2, borderRadius: 1, background: 'rgba(255,255,255,0.3)' }} />
        </div>
      </div>
    </div>
  )
}

export default function DisplaysPage() {
  const fps = useStore(s => s.fps) ?? 60
  const setFps = useStore(s => s.setFps)
  const screenArrangement = useStore(s => s.screenArrangement) || 'duplicate'
  const setScreenArrangement = useStore(s => s.setScreenArrangement)
  const pauseOnBattery = useStore(s => s.pauseOnBattery) || false
  const togglePauseOnBattery = useStore(s => s.togglePauseOnBattery)
  const pauseOnFullscreen = useStore(s => s.pauseOnFullscreen) ?? true
  const togglePauseOnFullscreen = useStore(s => s.togglePauseOnFullscreen)
  const pauseOnMaximized = useStore(s => s.pauseOnMaximized) ?? true
  const togglePauseOnMaximized = useStore(s => s.togglePauseOnMaximized)
  const multiMonitorPauseMode = useStore(s => s.multiMonitorPauseMode) || 'isolated'
  const setMultiMonitorPauseMode = useStore(s => s.setMultiMonitorPauseMode)
  const wallpaperSyncOnResume = useStore(s => s.wallpaperSyncOnResume) ?? true
  const setWallpaperSyncOnResume = useStore(s => s.setWallpaperSyncOnResume)
  const audioPlaybackRule = useStore(s => s.audioPlaybackRule) || 'always'
  const preferredAudioMonitor = useStore(s => s.preferredAudioMonitor) || 'auto'

  const taskbarStyle = useStore(s => s.taskbarStyle) || 'default'
  const setTaskbarStyle = useStore(s => s.setTaskbarStyle)
  const taskbarBorder = useStore(s => s.taskbarBorder) || false
  const setTaskbarBorder = useStore(s => s.setTaskbarBorder)
  const translucentTbInstalled = useStore(s => s.translucentTbInstalled)
  const translucentTbRunning = useStore(s => s.translucentTbRunning)
  const syncTaskbarState = useStore(s => s.syncTaskbarState)
  const restartTaskbar = useStore(s => s.restartTaskbar)
  const [restartingTaskbar, setRestartingTaskbar] = useState(false)

  const [monitors, setMonitors] = useState([])
  const [gridReports, setGridReports] = useState([])

  useEffect(() => {
    let unlistenMonitors = null
    const loadMonitors = () => {
      import('@tauri-apps/api/core').then(({ invoke }) => {
        invoke('get_monitors').then(list => {
          if (Array.isArray(list)) {
            const sorted = [...list].sort((a, b) => {
              if (a.isPrimary && !b.isPrimary) return -1
              if (!a.isPrimary && b.isPrimary) return 1
              return 0
            })
            const enriched = sorted.map((m, idx) => ({
              ...m,
              displayNumber: idx + 1,
              displayName: m.isPrimary ? `Display ${idx + 1} (Primary)` : `Display ${idx + 1}`
            }))
            setMonitors(enriched)
          }
        }).catch(() => {})
      }).catch(() => {})
    }
    loadMonitors()
    import('@tauri-apps/api/event').then(({ listen }) => {
      listen('aether:monitors-changed', () => loadMonitors()).then(u => { unlistenMonitors = u })
      listen('aura:monitors-changed', () => loadMonitors())
    }).catch(() => {})
    window.addEventListener('focus', loadMonitors)
    return () => {
      if (unlistenMonitors) unlistenMonitors()
      window.removeEventListener('focus', loadMonitors)
    }
  }, [])

  useEffect(() => {
    syncTaskbarState?.().catch(() => {})
  }, [syncTaskbarState])

  // Polling for 16x8 diagnostic grid
  useEffect(() => {
    let mounted = true
    const fetchGrid = async () => {
      try {
        const { invoke } = await import('@tauri-apps/api/core')
        const reports = await invoke('get_grid_detection_state')
        if (mounted && Array.isArray(reports)) {
          setGridReports(reports)
        }
      } catch (e) {}
    }
    fetchGrid()
    const interval = setInterval(fetchGrid, 750)
    return () => {
      mounted = false
      clearInterval(interval)
    }
  }, [])

  const syncAllPerformance = (overrides = {}) => {
    const pBattery = overrides.pauseOnBattery !== undefined ? overrides.pauseOnBattery : pauseOnBattery
    const pFullscreen = overrides.pauseOnFullscreen !== undefined ? overrides.pauseOnFullscreen : pauseOnFullscreen
    const pMaximized = overrides.pauseOnMaximized !== undefined ? overrides.pauseOnMaximized : pauseOnMaximized
    const mMode = overrides.multiMonitorPauseMode !== undefined ? overrides.multiMonitorPauseMode : multiMonitorPauseMode
    const aRule = overrides.audioPlaybackRule !== undefined ? overrides.audioPlaybackRule : audioPlaybackRule
    const pAudioMon = overrides.preferredAudioMonitor !== undefined ? overrides.preferredAudioMonitor : preferredAudioMonitor
    const wSync = overrides.wallpaperSyncOnResume !== undefined ? overrides.wallpaperSyncOnResume : wallpaperSyncOnResume
    import('@tauri-apps/api/core').then(({ invoke }) => {
      invoke('sync_performance_settings', {
        pauseOnBattery: pBattery,
        pauseOnFullscreen: pFullscreen,
        pauseOnMaximized: pMaximized,
        multiMonitorPauseMode: mMode,
        audioPlaybackRule: aRule,
        preferredAudioMonitor: pAudioMon || 'auto',
        wallpaperSyncOnResume: wSync,
      }).catch(() => {})
    }).catch(() => {})
  }

  const handleFpsChange = (v) => {
    setFps(v)
    import('@tauri-apps/api/core').then(({ invoke }) => {
      invoke('update_wallpaper_config', { config: { fps: v }, monitorLabel: null }).catch(() => {})
    }).catch(() => {})
  }

  const handleTogglePauseOnBattery = () => {
    const nextVal = !pauseOnBattery
    togglePauseOnBattery()
    syncAllPerformance({ pauseOnBattery: nextVal })
  }

  const handleTogglePauseOnFullscreen = () => {
    const nextVal = !pauseOnFullscreen
    togglePauseOnFullscreen()
    syncAllPerformance({ pauseOnFullscreen: nextVal })
  }

  const handleTogglePauseOnMaximized = () => {
    const nextVal = !pauseOnMaximized
    togglePauseOnMaximized()
    syncAllPerformance({ pauseOnMaximized: nextVal })
  }

  const handleMultiMonitorPauseModeChange = (mode) => {
    setMultiMonitorPauseMode(mode)
    syncAllPerformance({ multiMonitorPauseMode: mode })
  }

  const handleWallpaperSyncChange = (val) => {
    setWallpaperSyncOnResume(val)
    syncAllPerformance({ wallpaperSyncOnResume: val })
  }

  return (
    <div className="settings-page-container animate-fadeIn">
      {/* Page Header */}
      <header className="settings-page-header">
        <h1 className="settings-page-title">Displays & Workspace</h1>
        <p className="settings-page-desc">
          Multi-monitor arrangement, rendering frame rate limits, intelligent window occlusion, and Windows Taskbar styling.
        </p>
      </header>

      {/* SECTION 1: OVERVIEW */}
      <SettingSection title="Overview">
        <SettingRow
          label="Displays detected"
          desc="Connected hardware displays recognized by the system compositor"
        >
          <span style={{
            fontFamily: 'var(--font-mono, monospace)',
            fontSize: 12,
            fontWeight: 600,
            color: 'var(--text-main)',
            background: 'color-mix(in srgb, var(--border-main) 30%, var(--bg-base))',
            padding: '2px 8px',
            borderRadius: 4,
            border: '1px solid var(--border-subtle)',
          }}>
            {monitors.length > 0 ? `${monitors.length} Display${monitors.length > 1 ? 's' : ''}` : '1 Display'}
          </span>
        </SettingRow>
      </SettingSection>

      {/* SECTION 2: MULTI-DISPLAY */}
      <SettingSection title="Multi-display">
        <SettingRow
          label="Display arrangement"
          desc={screenArrangement === 'duplicate'
            ? 'Duplicate across all: Mirrors the active wallpaper across all connected displays with synchronous timing.'
            : 'Distinct per screen: Unlocks independent wallpaper assignment for each screen on Home and Library.'}
        >
          <AetherSegmented
            items={[
              { id: 'duplicate', label: 'Duplicate across all' },
              { id: 'per-screen', label: 'Distinct per screen' },
            ]}
            value={screenArrangement}
            onChange={setScreenArrangement}
          />
        </SettingRow>

        {screenArrangement === 'per-screen' && (
          <div style={{
            padding: '10px 16px',
            borderBottom: '1px solid var(--border-subtle)',
            background: 'color-mix(in srgb, var(--color-brand) 5%, transparent)',
            fontSize: 12,
            color: 'var(--text-muted)',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
          }}>
            <CheckCircle2 size={14} style={{ color: 'var(--color-brand)', flexShrink: 0 }} />
            <span>
              Per-screen mode active. Target monitor selectors are unlocked on <strong>Home</strong> and <strong>Library</strong>.
            </span>
          </div>
        )}
      </SettingSection>

      {/* SECTION 3: PLAYBACK */}
      <SettingSection title="Playback">
        <SliderRow
          label="Frame rate"
          desc="Rendering frame limit for Canvas 2D engines & video players"
          value={fps <= 0 ? 240 : fps}
          set={v => handleFpsChange(v >= 240 ? 0 : v)}
          min={15}
          max={240}
          step={15}
          fmt={v => (v <= 0 || v >= 240) ? 'Unlimited (Native Hz)' : `${v} FPS`}
          presets={[
            { label: '30', val: 30 },
            { label: '60', val: 60 },
            { label: '120', val: 120 },
            { label: '144', val: 144 },
            { label: 'Unlimited', val: 240 },
          ]}
        />

        <SettingRow
          label="Pause on battery"
          desc="Suspends animations and video decoding when unplugged to conserve power"
        >
          <AetherToggle
            checked={pauseOnBattery}
            onChange={handleTogglePauseOnBattery}
            ariaLabel="Pause on battery"
          />
        </SettingRow>

        <SettingRow
          label="Pause on fullscreen"
          desc="Halts rendering when games or fullscreen applications are active"
        >
          <AetherToggle
            checked={pauseOnFullscreen}
            onChange={handleTogglePauseOnFullscreen}
            ariaLabel="Pause on fullscreen"
          />
        </SettingRow>

        <SettingRow
          label="Pause on maximized windows"
          desc="Suspends rendering when normal desktop applications are maximized"
        >
          <AetherToggle
            checked={pauseOnMaximized}
            onChange={handleTogglePauseOnMaximized}
            ariaLabel="Pause on maximized windows"
          />
        </SettingRow>

        <SettingRow
          label="Multi-monitor playback"
          desc={multiMonitorPauseMode === 'isolated'
            ? 'Isolated: Only the monitor covered by a window pauses. Other displays stay active.'
            : 'Global: When any display is covered, all connected monitors pause together.'}
        >
          <AetherSegmented
            items={[
              { id: 'isolated', label: 'Isolated per display' },
              { id: 'global',   label: 'Global' },
            ]}
            value={multiMonitorPauseMode}
            onChange={handleMultiMonitorPauseModeChange}
          />
        </SettingRow>
      </SettingSection>

      {/* SECTION 4: SYNCHRONIZATION */}
      <SettingSection title="Synchronization">
        <SettingRow
          label="Wallpaper synchronization"
          desc="Synchronize compatible wallpapers when starting or resuming playback after being covered."
        >
          <AetherToggle
            checked={wallpaperSyncOnResume}
            onChange={() => handleWallpaperSyncChange(!wallpaperSyncOnResume)}
            ariaLabel="Wallpaper synchronization"
          />
        </SettingRow>
      </SettingSection>

      {/* SECTION 5: WINDOWS TASKBAR */}
      <SettingSection title="Windows taskbar">
        <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--border-subtle)' }}>
          <div className="settings-item-label" style={{ marginBottom: 3 }}>
            Taskbar appearance
          </div>
          <div className="settings-item-desc" style={{ marginBottom: 12 }}>
            Native Win32 transparency and frosted acrylic styling for the Windows taskbar.
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 10 }}>
            {[
              { id: 'default', label: 'Default', desc: 'Windows standard' },
              { id: 'clear',   label: 'Clear (100%)', desc: 'Transparent glass' },
              { id: 'acrylic', label: 'Acrylic Blur', desc: 'Frosted acrylic' },
              { id: 'blur',    label: 'Soft Blur', desc: 'Gaussian blur' },
            ].map(style => {
              const isSelected = taskbarStyle === style.id
              return (
                <div
                  key={style.id}
                  className={`display-card-compact ${isSelected ? 'selected' : ''}`}
                  style={{ flexDirection: 'column', alignItems: 'stretch', cursor: 'pointer', padding: '10px 12px' }}
                  onClick={() => setTaskbarStyle(style.id)}
                >
                  <TaskbarWireframeIllustration styleId={style.id} isSelected={isSelected} />
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 2 }}>
                    <span style={{ fontSize: 12.5, fontWeight: 500, color: isSelected ? 'var(--color-brand)' : 'var(--text-main)' }}>
                      {style.label}
                    </span>
                    {isSelected && (
                      <span style={{
                        width: 16, height: 16, borderRadius: '50%',
                        background: 'var(--color-brand)',
                        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                        color: '#fff', flexShrink: 0
                      }}>
                        <Check size={10} strokeWidth={3} />
                      </span>
                    )}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
                    {style.desc}
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        <SettingRow
          label="Taskbar top border line"
          desc={taskbarBorder ? '1px subtle top border line visible' : 'Clean borderless edge with zero top line'}
        >
          <AetherToggle
            checked={taskbarBorder}
            onChange={() => setTaskbarBorder(!taskbarBorder)}
            ariaLabel="Taskbar top border line"
          />
        </SettingRow>

        {/* TranslucentTB helper status & recovery row */}
        <div style={{
          padding: '12px 16px',
          background: 'color-mix(in srgb, var(--border-main) 12%, var(--bg-card))',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 12,
          flexWrap: 'wrap'
        }}>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', flex: 1, minWidth: 240, lineHeight: 1.45 }}>
            <span style={{ color: 'var(--text-main)', fontWeight: 500 }}>Windows 11 Glass: </span>
            For 100% invisible glass on Windows 11 22H2+, install TranslucentTB.
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <button
              type="button"
              className="preset-btn"
              style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '5px 10px' }}
              onClick={() => {
                import('@tauri-apps/api/core').then(({ invoke }) => {
                  invoke('open_url', { url: 'ms-windows-store://pdp/?ProductId=9PF4KZ2VN4W9' })
                    .catch(() => {
                      invoke('open_url', { url: 'https://apps.microsoft.com/detail/9pf4kz2vn4w9' }).catch(() => {})
                    })
                }).catch(() => {
                  window.open('https://apps.microsoft.com/detail/9pf4kz2vn4w9', '_blank')
                })
              }}
            >
              <ExternalLink size={12} />
              <span>Microsoft Store</span>
            </button>
            <button
              type="button"
              className="preset-btn"
              disabled={restartingTaskbar}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '5px 10px' }}
              onClick={async () => {
                setRestartingTaskbar(true)
                await restartTaskbar()
                setTimeout(() => setRestartingTaskbar(false), 1200)
              }}
            >
              <RefreshCw size={11} className={restartingTaskbar ? 'animate-spin' : ''} />
              <span>{restartingTaskbar ? 'Recovering…' : 'Recover'}</span>
            </button>
            <span style={{
              fontSize: 11,
              fontFamily: 'var(--font-mono, monospace)',
              color: translucentTbInstalled && translucentTbRunning ? 'var(--color-emerald)' : 'var(--text-muted)',
              padding: '2px 6px',
              borderRadius: 4,
              background: 'color-mix(in srgb, var(--border-main) 30%, var(--bg-base))',
              border: '1px solid var(--border-subtle)',
            }}>
              {translucentTbInstalled && translucentTbRunning ? 'SYNCED' : 'STANDALONE'}
            </span>
          </div>
        </div>
      </SettingSection>

      {/* SECTION 6: OCCLUSION DIAGNOSTICS (if available) */}
      {gridReports && gridReports.length > 0 && (
        <SettingSection title="Occlusion diagnostics">
          <div style={{ padding: '14px 16px' }}>
            <div className="settings-item-desc" style={{ marginBottom: 14 }}>
              Real-time hardware window occlusion telemetry. Displays are divided into 128 sampling cells (16×8) to detect desktop obscuration.
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: `repeat(auto-fit, minmax(260px, 1fr))`, gap: 12 }}>
              {gridReports.map((rep, rIdx) => {
                const matchedMon = monitors.find(m => m.label === rep.label)
                const monTitle = matchedMon?.displayName || rep.label || `Display ${rIdx + 1}`
                const isOccluded = Boolean(rep.is_occluded)
                const coveragePct = typeof rep.coverage_percent === 'number' ? rep.coverage_percent.toFixed(0) : '0'
                const coveredCount = rep.covered_tiles ?? 0
                const tiles = Array.isArray(rep.tiles) ? rep.tiles : []

                return (
                  <div
                    key={rep.label || rIdx}
                    style={{
                      background: 'color-mix(in srgb, var(--border-main) 20%, var(--bg-base))',
                      borderRadius: 6,
                      padding: 12,
                      border: '1px solid var(--border-subtle)',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                      <div>
                        <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-main)' }}>{monTitle}</div>
                        <div style={{ fontSize: 10.5, color: 'var(--text-muted)', fontFamily: 'var(--font-mono, monospace)', marginTop: 2 }}>
                          {coveredCount}/128 Cells ({coveragePct}%)
                        </div>
                      </div>
                      <span style={{
                        fontSize: 10,
                        fontWeight: 600,
                        padding: '2px 6px',
                        borderRadius: 3,
                        color: isOccluded ? '#f59e0b' : '#10b981',
                        background: isOccluded ? 'rgba(245, 158, 11, 0.12)' : 'rgba(16, 185, 129, 0.12)',
                      }}>
                        {isOccluded ? 'OCCLUDED' : 'ACTIVE'}
                      </span>
                    </div>

                    <div style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(16, 1fr)',
                      gap: 1.5,
                      background: '#090a0f',
                      padding: 4,
                      borderRadius: 4,
                      border: '1px solid var(--border-subtle)',
                      aspectRatio: '16 / 8',
                    }}>
                      {Array.from({ length: 128 }).map((_, cellIdx) => {
                        const isCovered = Boolean(tiles[cellIdx])
                        return (
                          <div
                            key={cellIdx}
                            title={`Cell ${cellIdx + 1}: ${isCovered ? 'Covered' : 'Clear'}`}
                            style={{
                              borderRadius: 1,
                              background: isCovered
                                ? 'rgba(239, 68, 68, 0.85)'
                                : 'rgba(16, 185, 129, 0.4)',
                              transition: 'background 0.15s ease',
                            }}
                          />
                        )
                      })}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </SettingSection>
      )}
    </div>
  )
}
