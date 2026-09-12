import React, { useState, useEffect } from 'react'
import {
  Monitor, Zap, Battery, LayoutTemplate, RefreshCw,
  ExternalLink, CheckCircle2, Check, Layers, AlertCircle, Eye
} from 'lucide-react'
import { useStore } from '../store/useStore.js'
import { SettingRow, SliderRow } from '../components/Settings/SettingRow.jsx'

function TaskbarWireframeIllustration({ styleId, isSelected }) {
  return (
    <div
      style={{
        width: '100%',
        height: 64,
        borderRadius: 6,
        position: 'relative',
        overflow: 'hidden',
        border: `1px solid ${isSelected ? 'var(--color-brand)' : 'rgba(255,255,255,0.08)'}`,
        boxShadow: isSelected ? '0 0 14px rgba(var(--rgb-brand), 0.25)' : 'none',
        background: 'linear-gradient(135deg, #070e1d 0%, #150a26 50%, #0a1f24 100%)',
        marginBottom: 8,
        pointerEvents: 'none',
      }}
    >
      {/* Desktop Wallpaper simulated glow elements */}
      <div
        style={{
          position: 'absolute',
          top: 6,
          left: 12,
          width: 32,
          height: 32,
          borderRadius: '50%',
          background: 'radial-gradient(circle, #38bdf8 0%, rgba(56,189,248,0) 70%)',
          filter: 'blur(4px)',
          opacity: 0.7,
        }}
      />
      <div
        style={{
          position: 'absolute',
          top: 10,
          right: 16,
          width: 38,
          height: 38,
          borderRadius: '50%',
          background: 'radial-gradient(circle, #ec4899 0%, rgba(236,72,153,0) 70%)',
          filter: 'blur(5px)',
          opacity: 0.5,
        }}
      />

      {/* Taskbar shelf at bottom */}
      <div
        style={{
          position: 'absolute',
          bottom: 0,
          left: 0,
          right: 0,
          height: 18,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 3.5,
          padding: '0 8px',
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
        <div style={{ width: 6, height: 6, borderRadius: 1.5, background: '#0ea5e9' }} />
        <div style={{ width: 6, height: 6, borderRadius: 1.5, background: '#f59e0b' }} />
        <div style={{ width: 6, height: 6, borderRadius: 1.5, background: 'var(--color-brand)' }} />
        <div style={{ width: 6, height: 6, borderRadius: 1.5, background: '#10b981' }} />
        <div style={{ width: 6, height: 6, borderRadius: 1.5, background: 'rgba(255,255,255,0.7)' }} />

        <div
          style={{
            position: 'absolute',
            right: 6,
            display: 'flex',
            alignItems: 'center',
            gap: 2,
          }}
        >
          <div style={{ width: 3, height: 3, borderRadius: '50%', background: 'rgba(255,255,255,0.4)' }} />
          <div style={{ width: 10, height: 2.5, borderRadius: 1.5, background: 'rgba(255,255,255,0.3)' }} />
        </div>
      </div>
    </div>
  )
}

export default function DisplaysPage() {
  const fps = useStore(s => s.fps) || 60
  const setFps = useStore(s => s.setFps)
  const pauseOnBattery = useStore(s => s.pauseOnBattery) || false
  const togglePauseOnBattery = useStore(s => s.togglePauseOnBattery)
  const pauseOnFullscreen = useStore(s => s.pauseOnFullscreen) ?? true
  const togglePauseOnFullscreen = useStore(s => s.togglePauseOnFullscreen)
  const pauseOnMaximized = useStore(s => s.pauseOnMaximized) ?? true
  const togglePauseOnMaximized = useStore(s => s.togglePauseOnMaximized)
  const multiMonitorPauseMode = useStore(s => s.multiMonitorPauseMode) || 'isolated'
  const setMultiMonitorPauseMode = useStore(s => s.setMultiMonitorPauseMode)
  const audioPlaybackRule = useStore(s => s.audioPlaybackRule) || 'mute-covered'
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
      listen('aura:monitors-changed', () => loadMonitors()).then(u => { unlistenMonitors = u })
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
    const interval = setInterval(fetchGrid, 1200)
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
    import('@tauri-apps/api/core').then(({ invoke }) => {
      invoke('sync_performance_settings', {
        pauseOnBattery: pBattery,
        pauseOnFullscreen: pFullscreen,
        pauseOnMaximized: pMaximized,
        multiMonitorPauseMode: mMode,
        audioPlaybackRule: aRule,
        preferredAudioMonitor: pAudioMon === 'auto' ? null : pAudioMon,
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

  return (
    <div className="animate-fadeIn" style={{ maxWidth: 880, margin: '0 auto', paddingBottom: 48 }}>
      {/* Top Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 className="font-display font-bold text-2xl" style={{ letterSpacing: '-0.5px' }}>
            Displays & Workspace
          </h1>
          <p className="text-muted text-sm" style={{ marginTop: 4 }}>
            Multi-monitor hardware detection, refresh rate limits, intelligent window occlusion, and Windows Taskbar glass styling
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="telemetry-chip">
            <Monitor size={14} style={{ color: 'var(--color-brand)' }} />
            <span>{monitors.length > 0 ? `${monitors.length} Display${monitors.length > 1 ? 's' : ''} Detected` : '1 Display'}</span>
          </span>
        </div>
      </div>

      {/* Card 1: Engine Performance & Occlusion Rules */}
      <div className="setting-card">
        <div className="setting-card-header">
          <div className="flex items-center gap-2.5">
            <Zap size={16} style={{ color: 'var(--color-brand)' }} />
            <span className="text-sm font-semibold">Engine & Display Performance</span>
          </div>
          <span className="badge font-mono" style={{ fontSize: 10 }}>Active</span>
        </div>

        <SliderRow
          label="Rendering Frame Cap"
          desc="Target frame rate limit for Canvas 2D engines & video renderers"
          value={fps}
          set={handleFpsChange}
          min={10}
          max={120}
          step={10}
          fmt={v => v >= 120 ? '120 FPS (Max)' : `${v} FPS`}
          presets={[
            { label: '30 FPS', val: 30 },
            { label: '60 FPS', val: 60 },
            { label: '120 FPS', val: 120 },
          ]}
        />

        <SettingRow
          label="Pause on Battery Power"
          desc="Automatically suspends live animation and hardware video decoding when unplugged to conserve battery life"
        >
          <label className="toggle">
            <input type="checkbox" checked={pauseOnBattery} onChange={handleTogglePauseOnBattery} />
            <div className="toggle-track" />
            <div className="toggle-thumb" />
          </label>
        </SettingRow>

        <SettingRow
          label="Pause on Fullscreen Applications"
          desc="Halt wallpaper rendering while 3D games or fullscreen applications are active to maximize GPU resources"
        >
          <label className="toggle">
            <input type="checkbox" checked={pauseOnFullscreen} onChange={handleTogglePauseOnFullscreen} />
            <div className="toggle-track" />
            <div className="toggle-thumb" />
          </label>
        </SettingRow>

        <SettingRow
          label="Pause on Maximized Windows"
          desc="Suspend wallpaper rendering when standard desktop applications (Brave, Chrome, VS Code) are maximized to save power"
        >
          <label className="toggle">
            <input type="checkbox" checked={pauseOnMaximized} onChange={handleTogglePauseOnMaximized} />
            <div className="toggle-track" />
            <div className="toggle-thumb" />
          </label>
        </SettingRow>

        <SettingRow
          label="Multi-Monitor Playback Behavior"
          desc={multiMonitorPauseMode === 'isolated'
            ? 'Isolated (Per-Display): Only the monitor covered by a fullscreen or maximized window pauses. Other monitors continue animating.'
            : 'Global (All Displays): When any single monitor is covered, all connected monitors pause rendering simultaneously.'}
        >
          <div className="segmented-control">
            <button
              type="button"
              className={`segmented-item ${multiMonitorPauseMode === 'isolated' ? 'active-brand' : ''}`}
              onClick={() => handleMultiMonitorPauseModeChange('isolated')}
            >
              Isolated (Per-Display)
            </button>
            <button
              type="button"
              className={`segmented-item ${multiMonitorPauseMode === 'global' ? 'active-brand' : ''}`}
              onClick={() => handleMultiMonitorPauseModeChange('global')}
            >
              Global (All Displays)
            </button>
          </div>
        </SettingRow>
      </div>

      {/* Card 2: Desktop Occlusion Diagnostics (16x8 Grid Visualizer) */}
      {gridReports && gridReports.length > 0 && (
        <div className="setting-card">
          <div className="setting-card-header">
            <div className="flex items-center gap-2.5">
              <Layers size={16} style={{ color: 'var(--color-accent)' }} />
              <span className="text-sm font-semibold">16×8 Grid Desktop Coverage Diagnostic</span>
            </div>
            <span className="badge font-mono" style={{ fontSize: 10 }}>Live Occlusion</span>
          </div>

          <div style={{ padding: '16px 18px' }}>
            <div className="text-xs text-muted" style={{ marginBottom: 14 }}>
              Real-time hardware window occlusion telemetry. Each screen is divided into 128 sampling cells (16 columns × 8 rows) to accurately detect when desktop surface is obscured.
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: `repeat(auto-fit, minmax(280px, 1fr))`, gap: 16 }}>
              {gridReports.map((rep, rIdx) => {
                const matchedMon = monitors.find(m => m.label === rep.monitor_label)
                const monTitle = matchedMon?.displayName || `Display ${rIdx + 1}`
                const bitmask = rep.bitmask || [0, 0, 0, 0]
                const isPaused = rep.is_paused

                return (
                  <div
                    key={rep.monitor_label || rIdx}
                    style={{
                      background: 'color-mix(in srgb, var(--border-main) 20%, var(--bg-card))',
                      borderRadius: 10,
                      padding: 14,
                      border: '1px solid var(--border-subtle)',
                    }}
                  >
                    <div className="flex items-center justify-between" style={{ marginBottom: 10 }}>
                      <span className="text-xs font-semibold" style={{ color: 'var(--text-main)' }}>{monTitle}</span>
                      <span className={`badge ${isPaused ? 'badge-amber' : 'badge-emerald'}`} style={{ fontSize: 10 }}>
                        {isPaused ? 'PAUSED' : 'ACTIVE'}
                      </span>
                    </div>

                    <div style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(16, 1fr)',
                      gap: 2,
                      background: '#000000',
                      padding: 6,
                      borderRadius: 6,
                      border: '1px solid var(--border-main)',
                      aspectRatio: '16 / 8',
                    }}>
                      {Array.from({ length: 128 }).map((_, cellIdx) => {
                        const u32Idx = Math.floor(cellIdx / 32)
                        const bitIdx = cellIdx % 32
                        const isCovered = (bitmask[u32Idx] & (1 << bitIdx)) !== 0
                        return (
                          <div
                            key={cellIdx}
                            style={{
                              borderRadius: 1.5,
                              background: isCovered
                                ? 'rgba(239, 68, 68, 0.7)'
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
        </div>
      )}

      {/* Card 3: Windows Taskbar Customization & TranslucentTB */}
      <div className="setting-card">
        <div className="setting-card-header">
          <div className="flex items-center gap-2.5">
            <LayoutTemplate size={16} style={{ color: 'var(--color-brand)' }} />
            <span className="text-sm font-semibold">Windows Taskbar Customization</span>
          </div>
          <span className="badge font-mono" style={{ fontSize: 10 }}>Win32 Hook</span>
        </div>

        <div style={{ padding: '16px 18px' }}>
          <div className="text-xs text-muted" style={{ marginBottom: 14 }}>
            Apply high-performance native transparency or frosted acrylic blur to Windows taskbars on all connected displays.
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
            {[
              { id: 'default', label: 'Default', desc: 'Windows standard style' },
              { id: 'clear',   label: 'Clear (100%)', desc: '100% transparent glass' },
              { id: 'acrylic', label: 'Acrylic Blur', desc: 'Frosted acrylic with noise' },
              { id: 'blur',    label: 'Soft Blur', desc: 'Smooth Gaussian blur' },
            ].map(style => {
              const isSelected = taskbarStyle === style.id
              return (
                <div
                  key={style.id}
                  className={`option-card ${isSelected ? 'selected' : ''}`}
                  onClick={() => setTaskbarStyle(style.id)}
                >
                  <TaskbarWireframeIllustration styleId={style.id} isSelected={isSelected} />
                  <div className="flex items-center justify-between" style={{ marginBottom: 6 }}>
                    <span className="font-semibold text-sm" style={{ color: isSelected ? 'var(--color-brand)' : 'var(--text-main)' }}>
                      {style.label}
                    </span>
                    {isSelected && (
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
                    )}
                  </div>
                  <div className="text-xs text-muted">
                    {style.desc}
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {/* Taskbar Top Border Separator */}
        <SettingRow
          label="Taskbar Top Border Separator"
          desc={taskbarBorder ? 'Showing thin 1px top border line' : 'Clean borderless edge with zero top separator line'}
        >
          <button
            type="button"
            className={`btn ${taskbarBorder ? 'btn-ghost' : 'btn-primary'}`}
            style={{ fontSize: 12, padding: '6px 14px', height: 'auto', display: 'flex', alignItems: 'center', gap: 6 }}
            onClick={() => setTaskbarBorder(!taskbarBorder)}
          >
            {!taskbarBorder && <CheckCircle2 size={13} />}
            {taskbarBorder ? 'Border: Visible' : 'Borderless Edge'}
          </button>
        </SettingRow>

        {/* Prominent TranslucentTB Notice and Microsoft Store Integration */}
        <div style={{
          margin: '14px 18px 18px',
          padding: '16px 18px',
          background: 'color-mix(in srgb, var(--border-main) 22%, var(--bg-card))',
          borderRadius: 10,
          border: '1px solid var(--border-subtle)',
        }}>
          <div style={{ marginBottom: 10, fontSize: 12.5, color: 'var(--text-main)', lineHeight: 1.55 }}>
            💡 <strong>Windows 11 Notice & Transparency Requirement:</strong> On recent Windows 11 builds (22H2 / 23H2 / 24H2), Microsoft draws an opaque XAML brush over the taskbar. While AetherFlow's native Win32 API tints the taskbar, <strong>100% invisible crystal-clear glass</strong> requires the free Microsoft Store utility <strong>TranslucentTB</strong>. When installed, AetherFlow automatically synchronizes with it without conflicts.
          </div>

          <div className="flex items-center gap-3 flex-wrap" style={{ marginTop: 12 }}>
            <button
              type="button"
              className="btn btn-primary"
              style={{ padding: '7px 16px', fontSize: 12, display: 'inline-flex', alignItems: 'center', gap: 7, borderRadius: 8 }}
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
              <ExternalLink size={13} /> Get TranslucentTB on Microsoft Store (Free)
            </button>

            <button
              type="button"
              className="btn btn-ghost"
              disabled={restartingTaskbar}
              style={{ padding: '7px 14px', fontSize: 12, display: 'inline-flex', alignItems: 'center', gap: 6, border: '1px solid var(--border-main)', borderRadius: 8 }}
              onClick={async () => {
                setRestartingTaskbar(true)
                await restartTaskbar()
                setTimeout(() => setRestartingTaskbar(false), 1200)
              }}
            >
              <RefreshCw size={12} className={restartingTaskbar ? 'animate-spin' : ''} />
              {restartingTaskbar ? 'Recovering…' : 'Recover Taskbar'}
            </button>

            <span className={`badge ${translucentTbInstalled && translucentTbRunning ? 'badge-brand' : translucentTbInstalled ? 'badge-amber' : 'badge-ghost'}`} style={{ fontSize: 11, padding: '4px 10px' }}>
              {translucentTbInstalled && translucentTbRunning ? 'TranslucentTB: Active & Synced' : translucentTbInstalled ? 'TranslucentTB: Installed (Stopped)' : 'TranslucentTB: Not Installed'}
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}
