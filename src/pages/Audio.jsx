import React, { useState, useEffect, useRef } from 'react'
import {
  Volume2, VolumeX, Mic, Monitor, Music, Shield, Play, Square, Check
} from 'lucide-react'
import { useStore } from '../store/useStore.js'
import { SettingRow, SliderRow } from '../components/Settings/SettingRow.jsx'

export default function AudioPage() {
  const audioVolume = useStore(s => s.audioVolume) ?? 50
  const setAudioVolume = useStore(s => s.setAudioVolume)
  const audioMuted = useStore(s => s.audioMuted) || false
  const toggleAudioMuted = useStore(s => s.toggleAudioMuted)
  const audioReactive = useStore(s => s.audioReactive) || false
  const toggleAudioReactive = useStore(s => s.toggleAudioReactive)
  const audioSource = useStore(s => s.audioSource) || 'mic'
  const setAudioSource = useStore(s => s.setAudioSource)
  const preferredAudioMonitor = useStore(s => s.preferredAudioMonitor) || 'auto'
  const setPreferredAudioMonitor = useStore(s => s.setPreferredAudioMonitor)
  const audioPlaybackRule = useStore(s => s.audioPlaybackRule) || 'always'
  const setAudioPlaybackRule = useStore(s => s.setAudioPlaybackRule)

  const pauseOnBattery = useStore(s => s.pauseOnBattery) || false
  const pauseOnFullscreen = useStore(s => s.pauseOnFullscreen) ?? true
  const pauseOnMaximized = useStore(s => s.pauseOnMaximized) ?? true
  const multiMonitorPauseMode = useStore(s => s.multiMonitorPauseMode) || 'isolated'

  const visualizerAudioDeviceId = useStore(s => s.visualizerAudioDeviceId) || 'default'
  const setVisualizerAudioDeviceId = useStore(s => s.setVisualizerAudioDeviceId)
  const [audioInputDevices, setAudioInputDevices] = useState([
    { deviceId: 'default', label: 'Default (Follows Windows System Default)' }
  ])
  const [isTestingAudio, setIsTestingAudio] = useState(false)
  const [testAudioLevel, setTestAudioLevel] = useState(0)
  const audioTestStreamRef = useRef(null)
  const audioTestAnimRef = useRef(null)

  const [monitors, setMonitors] = useState([])

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
    let active = true
    async function scanAudioDevices() {
      if (typeof navigator === 'undefined' || !navigator.mediaDevices?.enumerateDevices) return
      try {
        const devs = await navigator.mediaDevices.enumerateDevices()
        if (!active) return
        const inputs = devs.filter(d => d.kind === 'audioinput')
        const list = [
          { deviceId: 'default', label: 'Default (Follows Windows System Default)' }
        ]
        inputs.forEach((d, idx) => {
          if (d.deviceId && d.deviceId !== 'default') {
            list.push({
              deviceId: d.deviceId,
              label: d.label || `Audio Device ${idx + 1}`
            })
          }
        })
        setAudioInputDevices(list)
      } catch (e) {
        console.warn('[AetherFlow] Could not enumerate audio devices:', e)
      }
    }
    scanAudioDevices()
    if (navigator.mediaDevices?.addEventListener) {
      navigator.mediaDevices.addEventListener('devicechange', scanAudioDevices)
      return () => {
        active = false
        navigator.mediaDevices.removeEventListener('devicechange', scanAudioDevices)
      }
    }
  }, [])

  async function toggleAudioTest() {
    if (isTestingAudio) {
      setIsTestingAudio(false)
      if (audioTestAnimRef.current) cancelAnimationFrame(audioTestAnimRef.current)
      if (audioTestStreamRef.current) {
        audioTestStreamRef.current.getTracks().forEach(t => t.stop())
        audioTestStreamRef.current = null
      }
      setTestAudioLevel(0)
      return
    }

    try {
      setIsTestingAudio(true)
      const constraints = {
        audio: (visualizerAudioDeviceId && visualizerAudioDeviceId !== 'default')
          ? { deviceId: { exact: visualizerAudioDeviceId } }
          : true,
        video: false
      }
      const stream = await navigator.mediaDevices.getUserMedia(constraints)
      audioTestStreamRef.current = stream

      const audioCtx = new (window.AudioContext || window.webkitAudioContext)()
      const analyser = audioCtx.createAnalyser()
      analyser.fftSize = 64
      const src = audioCtx.createMediaStreamSource(stream)
      src.connect(analyser)
      const data = new Uint8Array(analyser.frequencyBinCount)

      function pump() {
        if (!audioTestStreamRef.current) return
        analyser.getByteFrequencyData(data)
        let sum = 0
        for (let i = 0; i < data.length; i++) sum += data[i]
        const avg = sum / (data.length || 1)
        setTestAudioLevel(Math.min(100, Math.round((avg / 128) * 100)))
        audioTestAnimRef.current = requestAnimationFrame(pump)
      }
      pump()

      setTimeout(() => {
        if (audioTestStreamRef.current) {
          setIsTestingAudio(false)
          if (audioTestAnimRef.current) cancelAnimationFrame(audioTestAnimRef.current)
          audioTestStreamRef.current.getTracks().forEach(t => t.stop())
          audioTestStreamRef.current = null
          setTestAudioLevel(0)
        }
      }, 10000)
    } catch (err) {
      console.warn('[AetherFlow] Audio test failed:', err)
      setIsTestingAudio(false)
      setTestAudioLevel(0)
    }
  }

  useEffect(() => {
    return () => {
      if (audioTestAnimRef.current) cancelAnimationFrame(audioTestAnimRef.current)
      if (audioTestStreamRef.current) {
        audioTestStreamRef.current.getTracks().forEach(t => t.stop())
      }
    }
  }, [])

  const handleVisualizerDeviceSelect = (devId) => {
    setVisualizerAudioDeviceId(devId)
    if (isTestingAudio) {
      toggleAudioTest()
    }
    const activeWp = useStore.getState().activeWallpaper
    if (activeWp?.engine === 'audio-spectrum' || activeWp?.id === 'audio-spectrum') {
      useStore.getState().updateWallpaperConfig({ audioDeviceId: devId })
      if (useStore.getState().isWallpaperRunning) {
        import('@tauri-apps/api/core').then(({ invoke }) => {
          invoke('update_wallpaper_config', {
            config: { audioDeviceId: devId },
            monitorLabel: null,
          }).catch(() => {})
        }).catch(() => {})
      }
    }
  }

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
        preferredAudioMonitor: pAudioMon || 'auto',
      }).catch(() => {})
    }).catch(() => {})
  }

  const handleVolumeChange = (v) => {
    setAudioVolume(v)
    const nextMuted = v <= 0
    if (audioMuted && v > 0) {
      useStore.setState({ audioMuted: false })
    }
    import('@tauri-apps/api/core').then(({ invoke }) => {
      invoke('set_mpv_volume', { monitorLabel: null, volume: v }).catch(() => {})
      invoke('set_mpv_mute', { monitorLabel: null, muted: nextMuted }).catch(() => {})
      invoke('update_wallpaper_config', { config: { volume: v, muted: nextMuted }, monitorLabel: null }).catch(() => {})
    }).catch(() => {})
  }

  const handleMuteToggle = () => {
    const nextMuted = !audioMuted
    toggleAudioMuted()
    import('@tauri-apps/api/core').then(({ invoke }) => {
      invoke('set_mpv_mute', { monitorLabel: null, muted: nextMuted }).catch(() => {})
      invoke('update_wallpaper_config', { config: { muted: nextMuted }, monitorLabel: null }).catch(() => {})
    }).catch(() => {})
  }

  const handlePreferredAudioMonitorChange = (monLabel) => {
    setPreferredAudioMonitor(monLabel)
    syncAllPerformance({ preferredAudioMonitor: monLabel })
  }

  const handleAudioPlaybackRuleChange = (rule) => {
    setAudioPlaybackRule(rule)
    syncAllPerformance({ audioPlaybackRule: rule })
  }

  return (
    <div className="animate-fadeIn" style={{ maxWidth: 880, margin: '0 auto', paddingBottom: 48 }}>
      {/* Top Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 className="font-display font-bold text-2xl" style={{ letterSpacing: '-0.5px' }}>
            Audio & Spectrum
          </h1>
          <p className="text-muted text-sm" style={{ marginTop: 4 }}>
            Master volume output, audio-reactive frequency analysis, hardware input devices, and per-display sound routing
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="telemetry-chip font-mono" style={{ color: audioMuted ? 'var(--color-rose)' : 'var(--color-emerald)' }}>
            {audioMuted ? 'SOUND MUTED' : `VOLUME: ${audioVolume}%`}
          </span>
        </div>
      </div>

      {/* Card 1: Master Volume & Audio Reactivity */}
      <div className="setting-card">
        <div className="setting-card-header">
          <div className="flex items-center gap-2.5">
            <Mic size={16} style={{ color: 'var(--color-rose)' }} />
            <span className="text-sm font-semibold">Audio & Reactive Engine</span>
          </div>
          <span className="telemetry-chip font-mono" style={{ color: audioMuted ? 'var(--color-rose)' : 'var(--color-emerald)' }}>
            {audioMuted ? 'MUTED' : `${audioVolume}%`}
          </span>
        </div>

        <SliderRow
          label="Master Wallpaper Volume"
          desc="Controls audio output across all active video and YouTube wallpapers"
          value={audioVolume}
          set={handleVolumeChange}
          min={0}
          max={100}
          step={1}
          fmt={v => `${v}%`}
          presets={[
            { label: '0%', val: 0 },
            { label: '50%', val: 50 },
            { label: '100%', val: 100 },
          ]}
        />

        <SettingRow
          label="Mute All Wallpapers"
          desc="Silences all audio immediately without changing slider level"
        >
          <label className="toggle">
            <input type="checkbox" checked={audioMuted} onChange={handleMuteToggle} />
            <div className="toggle-track" />
            <div className="toggle-thumb" />
          </label>
        </SettingRow>

        <SettingRow
          label="Audio Reactive Mode"
          desc="Enables visual pulses and particle reactions synchronized to real-time audio input"
        >
          <label className="toggle">
            <input type="checkbox" checked={audioReactive} onChange={toggleAudioReactive} />
            <div className="toggle-track" />
            <div className="toggle-thumb" />
          </label>
        </SettingRow>

        {audioReactive && (
          <div style={{ padding: '14px 18px', background: 'rgba(255,255,255,0.02)' }}>
            <div className="text-sm font-semibold" style={{ marginBottom: 4 }}>Reactive Audio Source</div>
            <div className="text-xs text-muted" style={{ marginBottom: 10 }}>
              Choose which input stream drives audio reactive visual effects
            </div>
            <div className="segmented-control">
              <button
                type="button"
                className={`segmented-item ${audioSource === 'mic' ? 'active-brand' : ''}`}
                onClick={() => setAudioSource('mic')}
              >
                Microphone
              </button>
              <button
                type="button"
                className={`segmented-item ${audioSource === 'system' ? 'active-brand' : ''}`}
                onClick={() => setAudioSource('system')}
              >
                System Audio (CAVA)
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Card 2: Audio Hardware Input Device & Live VU Meter */}
      <div className="setting-card">
        <div className="setting-card-header">
          <div className="flex items-center gap-2.5">
            <Music size={16} style={{ color: 'var(--color-cyan)' }} />
            <span className="text-sm font-semibold">Visualizer Audio Source Device</span>
          </div>
          <span className="badge font-mono" style={{ fontSize: 10 }}>Hardware Input</span>
        </div>

        <div style={{ padding: '16px 18px' }}>
          <div className="text-xs text-muted" style={{ marginBottom: 14 }}>
            Select the specific audio recording device or virtual loopback interface used by audio visualizers.
          </div>

          <div style={{ marginBottom: 16 }}>
            <label className="text-xs font-semibold" style={{ display: 'block', marginBottom: 6, color: 'var(--text-main)' }}>
              Hardware Input Device
            </label>
            <select
              className="select-input"
              value={visualizerAudioDeviceId}
              onChange={e => handleVisualizerDeviceSelect(e.target.value)}
              style={{ width: '100%', maxWidth: 460 }}
            >
              {audioInputDevices.map(dev => (
                <option key={dev.deviceId} value={dev.deviceId}>
                  {dev.label}
                </option>
              ))}
            </select>
          </div>

          {/* Real-time Hardware Audio VU Meter */}
          <div style={{
            padding: '12px 14px',
            borderRadius: 8,
            background: 'color-mix(in srgb, var(--border-main) 20%, var(--bg-card))',
            border: '1px solid var(--border-subtle)',
            display: 'flex',
            flexDirection: 'column',
            gap: 10
          }}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold" style={{ color: 'var(--text-main)' }}>Hardware Signal Decibel Meter</span>
                <span className="text-xs text-muted">({isTestingAudio ? 'Testing Signal' : 'Standby'})</span>
              </div>
              <button
                type="button"
                className="btn btn-ghost"
                style={{ fontSize: 11, padding: '3px 10px', height: 24, display: 'inline-flex', alignItems: 'center', gap: 5 }}
                onClick={toggleAudioTest}
              >
                {isTestingAudio ? <Square size={11} /> : <Play size={11} />}
                {isTestingAudio ? 'Stop 10s Test' : 'Test Audio Input'}
              </button>
            </div>

            <div style={{
              width: '100%',
              height: 10,
              background: '#000000',
              borderRadius: 5,
              overflow: 'hidden',
              position: 'relative',
              border: '1px solid var(--border-main)'
            }}>
              <div
                style={{
                  height: '100%',
                  width: `${testAudioLevel}%`,
                  background: testAudioLevel > 80
                    ? 'linear-gradient(90deg, #10b981, #f59e0b, #ef4444)'
                    : testAudioLevel > 50
                    ? 'linear-gradient(90deg, #10b981, #f59e0b)'
                    : 'var(--color-brand)',
                  borderRadius: 4,
                  transition: 'width 0.08s ease',
                  boxShadow: isTestingAudio ? '0 0 10px var(--color-brand)' : 'none'
                }}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Card 3: Multi-Monitor Audio Routing by Display */}
      <div className="setting-card">
        <div className="setting-card-header">
          <div className="flex items-center gap-2.5">
            <Volume2 size={16} style={{ color: 'var(--color-brand)' }} />
            <span className="text-sm font-semibold">Audio Output by Display</span>
          </div>
          <span className="badge font-mono" style={{ fontSize: 10 }}>
            {preferredAudioMonitor === 'auto'
              ? 'Auto (Primary)'
              : (monitors.find(m => m.label === preferredAudioMonitor)?.displayName || monitors.find(m => m.label === preferredAudioMonitor)?.name || 'Custom Display')}
          </span>
        </div>

        <div style={{ padding: '16px 18px' }}>
          <div className="text-xs text-muted" style={{ marginBottom: 14, lineHeight: 1.5 }}>
            Select which monitor's wallpaper outputs sound. In multi-monitor setups, other displays are automatically muted to prevent audio desync and echo.
          </div>

          <div className="segmented-control" style={{ marginBottom: 16 }}>
            <button
              type="button"
              className={`segmented-item ${preferredAudioMonitor === 'auto' ? 'active-brand' : ''}`}
              onClick={() => handlePreferredAudioMonitorChange('auto')}
            >
              Auto (Primary Screen)
            </button>
            <button
              type="button"
              className={`segmented-item ${preferredAudioMonitor !== 'auto' ? 'active-brand' : ''}`}
              onClick={() => {
                const first = monitors[0]?.label || 'wallpaper_0'
                handlePreferredAudioMonitorChange(first)
              }}
            >
              Specific Display ({monitors.length > 1 ? `${monitors.length} Displays` : 'Per-Screen'})
            </button>
          </div>

          <div style={{
            display: 'grid',
            gridTemplateColumns: `repeat(auto-fit, minmax(200px, 1fr))`,
            gap: 12,
            marginBottom: 16,
          }}>
            {(monitors.length > 0 ? monitors : [
              { label: 'wallpaper_0', name: '\\\\.\\DISPLAY1', width: 1920, height: 1080, isPrimary: true }
            ]).map((m, idx) => {
              const isSelected = preferredAudioMonitor === 'auto'
                ? (m.isPrimary || idx === 0)
                : preferredAudioMonitor === m.label

              return (
                <div
                  key={m.label || idx}
                  onClick={() => handlePreferredAudioMonitorChange(m.label)}
                  className={`option-card ${isSelected ? 'selected' : ''}`}
                  style={{
                    padding: '14px 16px',
                    cursor: 'pointer',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                    minHeight: 100,
                    position: 'relative',
                    background: isSelected
                      ? 'color-mix(in srgb, var(--color-brand) 12%, var(--bg-card))'
                      : 'var(--bg-card)',
                    borderColor: isSelected ? 'var(--color-brand)' : 'var(--border-subtle)',
                    boxShadow: isSelected ? '0 0 16px -4px var(--color-brand)' : 'none',
                    transition: 'all 0.2s ease',
                  }}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                      <Monitor size={14} style={{ color: isSelected ? 'var(--color-brand)' : 'var(--text-muted)' }} />
                      <span className="font-semibold text-xs" style={{ color: isSelected ? 'var(--color-brand)' : 'var(--text-main)' }}>
                        {m.displayName || `Display ${m.displayNumber || idx + 1}`}
                      </span>
                    </div>
                    {m.isPrimary && (
                      <span className="badge" style={{ fontSize: 9, padding: '1px 5px' }}>Primary</span>
                    )}
                  </div>

                  <div style={{ margin: '10px 0' }}>
                    <div className="text-xs font-mono" style={{ color: 'var(--text-main)', fontWeight: 600 }}>
                      {m.width} × {m.height}
                    </div>
                    <div className="text-xs text-muted" style={{ fontSize: 10, marginTop: 2 }}>
                      {m.name || m.label}
                    </div>
                  </div>

                  <div className="flex items-center justify-between" style={{ marginTop: 'auto', paddingTop: 8, borderTop: '1px solid var(--border-subtle)' }}>
                    <span style={{ fontSize: 10.5, color: isSelected ? 'var(--color-brand)' : 'var(--text-muted)', fontWeight: isSelected ? 600 : 400 }}>
                      {isSelected ? 'Sound Active' : 'Muted'}
                    </span>
                    {isSelected ? (
                      <span
                        style={{
                          width: 22, height: 22, borderRadius: '50%',
                          background: 'var(--color-brand)',
                          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                          color: '#fff',
                        }}
                        title="Active sound emitter"
                      >
                        <Volume2 size={12} strokeWidth={2.5} />
                      </span>
                    ) : (
                      <span style={{ color: 'var(--text-muted)', opacity: 0.4 }}>
                        <VolumeX size={14} />
                      </span>
                    )}
                  </div>
                </div>
              )
            })}
          </div>

          <div className="flex items-center justify-between" style={{
            padding: '12px 14px',
            background: 'rgba(255,255,255,0.02)',
            borderRadius: 8,
            border: '1px solid var(--border-subtle)',
            marginBottom: 12,
          }}>
            <div className="flex flex-col">
              <span className="text-xs font-medium" style={{ color: 'var(--text-main)' }}>
                Play audio only when desktop is focused
              </span>
              <span className="text-xs text-muted" style={{ fontSize: 10.5, marginTop: 2 }}>
                Mutes wallpaper audio as soon as another window or game is active
              </span>
            </div>
            <label className="toggle" style={{ margin: 0 }}>
              <input
                type="checkbox"
                checked={audioPlaybackRule === 'mute-focused'}
                onChange={() => {
                  const nextRule = audioPlaybackRule === 'mute-focused' ? 'mute-covered' : 'mute-focused'
                  handleAudioPlaybackRuleChange(nextRule)
                }}
              />
              <div className="toggle-track" />
              <div className="toggle-thumb" />
            </label>
          </div>

          <div>
            <div className="text-xs font-semibold uppercase tracking-wider text-muted" style={{ marginBottom: 6 }}>
              Audio Playback Policy
            </div>
            <div className="segmented-control" style={{ width: '100%' }}>
              {[
                { id: 'always',       label: 'Always Active (Recommended)' },
                { id: 'mute-covered', label: 'Mute When Covered' },
                { id: 'mute-focused', label: 'Mute When Focused' },
              ].map(opt => (
                <button
                  key={opt.id}
                  type="button"
                  className={`segmented-item ${audioPlaybackRule === opt.id ? 'active-brand' : ''}`}
                  onClick={() => handleAudioPlaybackRuleChange(opt.id)}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
