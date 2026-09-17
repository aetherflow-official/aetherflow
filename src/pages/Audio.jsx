import React, { useState, useEffect, useRef } from 'react'
import { Monitor, Play, Square } from 'lucide-react'
import { useStore } from '../store/useStore.js'
import {
  SettingSection,
  SettingRow,
  SliderRow,
  AetherToggle,
  AetherSelect,
  AetherSegmented,
} from '../components/Settings/SettingsUI.jsx'

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
    { deviceId: 'default', label: 'Windows Default' }
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
          { deviceId: 'default', label: 'Windows Default' }
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
    <div className="settings-page-container animate-fadeIn">
      {/* Page Header */}
      <header className="settings-page-header">
        <h1 className="settings-page-title">Audio</h1>
        <p className="settings-page-desc">
          Master playback volume, reactive visualizer input, and per-display sound routing.
        </p>
      </header>

      {/* SECTION 1: MASTER PLAYBACK */}
      <SettingSection title="Master playback">
        <SliderRow
          label="Wallpaper volume"
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
          label="Mute all wallpapers"
          desc="Silences all audio immediately without changing the volume level"
        >
          <AetherToggle
            checked={audioMuted}
            onChange={handleMuteToggle}
            ariaLabel="Mute all wallpapers"
          />
        </SettingRow>

        <SettingRow
          label="Audio reactive"
          desc="Enables visual pulses and particle reactions synchronized to real-time audio input"
        >
          <AetherToggle
            checked={audioReactive}
            onChange={toggleAudioReactive}
            ariaLabel="Audio reactive mode"
          />
        </SettingRow>

        {audioReactive && (
          <SettingRow
            label="Reactive audio source"
            desc="Choose which input stream drives audio reactive visual effects"
          >
            <AetherSegmented
              items={[
                { id: 'mic', label: 'Microphone' },
                { id: 'system', label: 'System Audio (CAVA)' },
              ]}
              value={audioSource}
              onChange={setAudioSource}
            />
          </SettingRow>
        )}
      </SettingSection>

      {/* SECTION 2: VISUALIZER INPUT */}
      <SettingSection title="Visualizer input">
        <SettingRow
          label="Input device"
          desc="Select the specific recording device or virtual loopback interface used by audio visualizers"
        >
          <AetherSelect
            value={visualizerAudioDeviceId}
            onChange={e => handleVisualizerDeviceSelect(e.target.value)}
            options={audioInputDevices.map(dev => ({ value: dev.deviceId, label: dev.label }))}
            style={{ width: '100%', maxWidth: 360 }}
          />
        </SettingRow>

        <SettingRow
          label="Signal level"
          desc={`Real-time hardware input level · ${isTestingAudio ? 'Testing Signal (10s)' : 'Standby'}`}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 260, justifyContent: 'flex-end' }}>
            <div
              style={{
                width: 130,
                height: 6,
                background: 'var(--control-bg)',
                borderRadius: 3,
                overflow: 'hidden',
                border: '1px solid var(--border-subtle)',
              }}
            >
              <div
                style={{
                  height: '100%',
                  width: '100%',
                  transform: `scaleX(${testAudioLevel / 100})`,
                  transformOrigin: 'left center',
                  background: testAudioLevel > 80
                    ? 'linear-gradient(90deg, var(--color-emerald), var(--color-amber), var(--color-rose))'
                    : testAudioLevel > 50
                    ? 'linear-gradient(90deg, var(--color-emerald), var(--color-amber))'
                    : 'var(--color-brand)',
                  borderRadius: 3,
                  transition: 'transform 0.08s ease',
                }}
              />
            </div>
            <button
              type="button"
              className="aether-preset-btn"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 5,
                padding: '4px 10px',
                fontSize: 11.5,
              }}
              onClick={toggleAudioTest}
            >
              {isTestingAudio ? <Square size={11} /> : <Play size={11} />}
              <span>{isTestingAudio ? 'Stop Test' : 'Test Audio Input'}</span>
            </button>
          </div>
        </SettingRow>
      </SettingSection>

      {/* SECTION 3: AUDIO OUTPUT */}
      <SettingSection title="Audio output">
        <SettingRow
          label="Audio output mode"
          desc="Choose whether audio follows the primary display or is assigned to a specific screen"
        >
          <AetherSegmented
            items={[
              { id: 'auto', label: 'Auto (Primary Screen)' },
              { id: 'specific', label: 'Specific Display' },
            ]}
            value={preferredAudioMonitor === 'auto' ? 'auto' : 'specific'}
            onChange={mode => {
              if (mode === 'auto') {
                handlePreferredAudioMonitorChange('auto')
              } else {
                const first = monitors[0]?.label || 'wallpaper_0'
                handlePreferredAudioMonitorChange(first)
              }
            }}
          />
        </SettingRow>

        <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--border-subtle)' }}>
          <div className="settings-item-label" style={{ marginBottom: 3 }}>
            Audio output display
          </div>
          <div className="settings-item-desc" style={{ marginBottom: 12 }}>
            Select which display provides wallpaper audio. In multi-monitor setups, other displays are automatically muted to prevent audio desync and echo.
          </div>

          <div style={{
            display: 'grid',
            gridTemplateColumns: `repeat(auto-fit, minmax(220px, 1fr))`,
            gap: 10,
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
                  className={`display-card-compact ${isSelected ? 'selected' : ''}`}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <Monitor size={15} style={{ color: isSelected ? 'var(--color-brand)' : 'var(--text-muted)' }} />
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span style={{ fontSize: 12.5, fontWeight: 500, color: isSelected ? 'var(--color-brand)' : 'var(--text-main)' }}>
                          {m.displayName || `Display ${m.displayNumber || idx + 1}`}
                        </span>
                        {m.isPrimary && (
                          <span style={{
                            fontSize: 9,
                            fontWeight: 600,
                            letterSpacing: '0.04em',
                            padding: '1px 5px',
                            borderRadius: 3,
                            background: 'color-mix(in srgb, var(--color-brand) 18%, transparent)',
                            color: 'var(--color-brand)',
                          }}>
                            PRIMARY
                          </span>
                        )}
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2, fontFamily: 'var(--font-mono, monospace)' }}>
                        {m.width} × {m.height}
                      </div>
                    </div>
                  </div>

                  <div>
                    <span style={{
                      fontSize: 11,
                      fontWeight: 500,
                      color: isSelected ? 'var(--color-brand)' : 'var(--text-muted)'
                    }}>
                      {isSelected ? 'Active' : 'Muted'}
                    </span>
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        <SettingRow
          label="Play audio only when desktop is focused"
          desc="Mutes wallpaper audio as soon as another window or game is active"
        >
          <AetherToggle
            checked={audioPlaybackRule === 'mute-focused'}
            onChange={() => {
              const nextRule = audioPlaybackRule === 'mute-focused' ? 'mute-covered' : 'mute-focused'
              handleAudioPlaybackRuleChange(nextRule)
            }}
            ariaLabel="Play audio only when desktop is focused"
          />
        </SettingRow>

        <SettingRow
          label="Audio playback policy"
          desc="Behavior when windows cover the wallpaper or lose focus"
        >
          <AetherSegmented
            items={[
              { id: 'always', label: 'Always Active' },
              { id: 'mute-covered', label: 'Mute When Covered' },
              { id: 'mute-focused', label: 'Mute When Focused' },
            ]}
            value={audioPlaybackRule}
            onChange={handleAudioPlaybackRuleChange}
          />
        </SettingRow>
      </SettingSection>
    </div>
  )
}
