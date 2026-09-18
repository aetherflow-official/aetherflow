import React, { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import {
  Power, DownloadCloud, CheckCircle2, AlertCircle, ExternalLink,
  User, LogIn, LogOut, Shield, Globe, FolderOpen, RefreshCw,
  Monitor, Palette, Volume2, ArrowRight, Sparkles
} from 'lucide-react'
import { useStore } from '../store/useStore.js'
import { checkForUpdate, openReleaseUrl, APP_VERSION } from '../lib/updater.js'
import UserAvatar from '../components/UserAvatar/index.jsx'
import { signOut, isOnline } from '../lib/supabase.js'
import { getLibraryStorageStats, scanWatchFolder } from '../lib/storageManager.js'
import {
  SettingSection,
  SettingRow,
  AetherToggle,
  AetherSegmented
} from '../components/Settings/SettingsUI.jsx'

export default function SettingsPage() {
  const autoStart = useStore(s => s.autoStart) || false
  const hideDesktopIcons = useStore(s => s.hideDesktopIcons) || false
  const toggleHideDesktopIcons = useStore(s => s.toggleHideDesktopIcons)
  const youtubeBackend = useStore(s => s.youtubeBackend) || 'mpv'
  const setYoutubeBackend = useStore(s => s.setYoutubeBackend)
  const authUser = useStore(s => s.authUser)
  const isAuthenticated = useStore(s => s.isAuthenticated)
  const setShowAuthModal = useStore(s => s.setShowAuthModal)
  const clearAuth = useStore(s => s.clearAuth)

  const [checkingUpdate, setCheckingUpdate] = useState(false)
  const [updateResult, setUpdateResult] = useState(null)
  const [signingOut, setSigningOut] = useState(false)
  const [wallpaperDirectory, setWallpaperDirectory] = useState('')

  const storageThresholdMb = useStore(s => s.storageThresholdMb) || 50
  const setStorageThresholdMb = useStore(s => s.setStorageThresholdMb)
  const storageMode = useStore(s => s.storageMode) || 'hybrid'
  const setStorageMode = useStore(s => s.setStorageMode)
  const watchFolderPath = useStore(s => s.watchFolderPath)
  const watchFolderEnabled = useStore(s => s.watchFolderEnabled) || false
  const setWatchFolder = useStore(s => s.setWatchFolder)

  const [storageStats, setStorageStats] = useState({ total_files: 0, total_bytes: 0 })
  const [isScanningWatch, setIsScanningWatch] = useState(false)
  const [scanFeedback, setScanFeedback] = useState(null)

  useEffect(() => {
    getLibraryStorageStats().then(stats => {
      if (stats) setStorageStats(stats)
    })
  }, [])

  const handlePickWatchFolder = async () => {
    try {
      const { open } = await import('@tauri-apps/plugin-dialog')
      const selected = await open({ directory: true, multiple: false })
      if (selected) {
        const path = typeof selected === 'string' ? selected : selected[0]
        if (path) {
          setWatchFolder(path, true)
        }
      }
    } catch (err) {
      console.error('Failed to pick watch folder:', err)
    }
  }

  const handleScanNow = async () => {
    setIsScanningWatch(true)
    setScanFeedback(null)
    try {
      const found = await scanWatchFolder()
      setScanFeedback(`Scan complete: ${found?.length || 0} new media files detected.`)
      getLibraryStorageStats().then(stats => {
        if (stats) setStorageStats(stats)
      })
    } catch (err) {
      setScanFeedback('Scan failed: ' + err)
    } finally {
      setIsScanningWatch(false)
    }
  }

  const formatBytes = (bytes) => {
    if (!bytes || bytes === 0) return '0 MB'
    const mb = bytes / (1024 * 1024)
    if (mb < 1024) return `${mb.toFixed(1)} MB`
    return `${(mb / 1024).toFixed(2)} GB`
  }

  useEffect(() => {
    import('@tauri-apps/api/core').then(({ invoke }) => {
      invoke('get_wallpaper_directory').then(dir => {
        if (dir) setWallpaperDirectory(dir)
      }).catch(() => {})
    }).catch(() => {})
  }, [])

  useEffect(() => {
    async function checkAutostart() {
      try {
        const { invoke } = await import('@tauri-apps/api/core')
        const enabled = await invoke('is_autostart_enabled')
        useStore.setState({ autoStart: !!enabled })
      } catch {
        try {
          const { isEnabled } = await import('@tauri-apps/plugin-autostart')
          const enabled = await isEnabled()
          useStore.setState({ autoStart: !!enabled })
        } catch {}
      }
    }
    checkAutostart()
  }, [])

  const handleToggleAutoStart = async () => {
    const nextVal = !autoStart
    useStore.setState({ autoStart: nextVal })
    try {
      const { invoke } = await import('@tauri-apps/api/core')
      const res = await invoke('set_autostart', { enabled: nextVal })
      useStore.setState({ autoStart: !!res })
    } catch (err) {
      try {
        const { enable, disable, isEnabled } = await import('@tauri-apps/plugin-autostart')
        if (nextVal) await enable()
        else await disable()
        const verified = await isEnabled()
        useStore.setState({ autoStart: verified })
      } catch {}
    }
  }

  const handleCheckUpdate = async () => {
    setCheckingUpdate(true)
    setUpdateResult(null)
    const result = await checkForUpdate()
    setUpdateResult(result)
    setCheckingUpdate(false)
  }

  const handleSignOut = async () => {
    setSigningOut(true)
    try {
      await signOut()
    } catch (err) {
      console.warn('Sign out error:', err)
    } finally {
      clearAuth()
      setSigningOut(false)
    }
  }

  return (
    <div className="settings-page-container animate-fadeIn">
      {/* Top Header */}
      <header className="settings-page-header">
        <div>
          <h1 className="settings-page-title">
            System & Preferences
          </h1>
          <p className="settings-page-subtitle">
            Manage Windows startup, desktop shell behavior, software updates, and cloud account synchronization
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="telemetry-chip">
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--color-emerald)', display: 'inline-block' }} />
            <span>v{APP_VERSION}</span>
          </span>
        </div>
      </header>

      {/* Quick Navigation Cards to Specialized Settings Subsystems */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
        gap: 12,
        marginBottom: 32,
      }}>
        <Link to="/displays" style={{ textDecoration: 'none', color: 'inherit' }}>
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)',
            borderRadius: 10, padding: '14px 16px', cursor: 'pointer', transition: 'all 0.15s ease',
          }}
          onMouseEnter={e => {
            e.currentTarget.style.borderColor = 'var(--color-brand)'
            e.currentTarget.style.background = 'var(--bg-hover)'
          }}
          onMouseLeave={e => {
            e.currentTarget.style.borderColor = 'var(--border-subtle)'
            e.currentTarget.style.background = 'var(--bg-surface)'
          }}
          >
            <div className="flex items-center gap-3">
              <div style={{
                width: 34, height: 34, borderRadius: 8,
                background: 'color-mix(in srgb, var(--color-brand) 14%, transparent)',
                display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0
              }}>
                <Monitor size={17} style={{ color: 'var(--color-brand)' }} />
              </div>
              <div>
                <div className="font-semibold text-xs" style={{ color: 'var(--text-main)' }}>Displays & Workspace</div>
                <div className="text-muted" style={{ fontSize: 11 }}>Taskbar Glass, Multi-monitor & Occlusion</div>
              </div>
            </div>
            <ArrowRight size={14} className="text-muted" />
          </div>
        </Link>

        <Link to="/personalization" style={{ textDecoration: 'none', color: 'inherit' }}>
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)',
            borderRadius: 10, padding: '14px 16px', cursor: 'pointer', transition: 'all 0.15s ease',
          }}
          onMouseEnter={e => {
            e.currentTarget.style.borderColor = 'var(--color-accent)'
            e.currentTarget.style.background = 'var(--bg-hover)'
          }}
          onMouseLeave={e => {
            e.currentTarget.style.borderColor = 'var(--border-subtle)'
            e.currentTarget.style.background = 'var(--bg-surface)'
          }}
          >
            <div className="flex items-center gap-3">
              <div style={{
                width: 34, height: 34, borderRadius: 8,
                background: 'color-mix(in srgb, var(--color-accent) 14%, transparent)',
                display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0
              }}>
                <Palette size={17} style={{ color: 'var(--color-accent)' }} />
              </div>
              <div>
                <div className="font-semibold text-xs" style={{ color: 'var(--text-main)' }}>Personalization</div>
                <div className="text-muted" style={{ fontSize: 11 }}>Dark, Light, Presets & Custom Studio</div>
              </div>
            </div>
            <ArrowRight size={14} className="text-muted" />
          </div>
        </Link>

        <Link to="/audio" style={{ textDecoration: 'none', color: 'inherit' }}>
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)',
            borderRadius: 10, padding: '14px 16px', cursor: 'pointer', transition: 'all 0.15s ease',
          }}
          onMouseEnter={e => {
            e.currentTarget.style.borderColor = 'var(--color-emerald)'
            e.currentTarget.style.background = 'var(--bg-hover)'
          }}
          onMouseLeave={e => {
            e.currentTarget.style.borderColor = 'var(--border-subtle)'
            e.currentTarget.style.background = 'var(--bg-surface)'
          }}
          >
            <div className="flex items-center gap-3">
              <div style={{
                width: 34, height: 34, borderRadius: 8,
                background: 'color-mix(in srgb, var(--color-emerald) 14%, transparent)',
                display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0
              }}>
                <Volume2 size={17} style={{ color: 'var(--color-emerald)' }} />
              </div>
              <div>
                <div className="font-semibold text-xs" style={{ color: 'var(--text-main)' }}>Audio & Reactivity</div>
                <div className="text-muted" style={{ fontSize: 11 }}>Master Volume, VU Meter & Inputs</div>
              </div>
            </div>
            <ArrowRight size={14} className="text-muted" />
          </div>
        </Link>
      </div>

      {/* Section 1: Startup & Windows Integration */}
      <SettingSection
        title="Startup & Windows Integration"
        badge="OS Level"
      >
        <SettingRow
          label="Launch AetherFlow on System Startup"
          desc="Automatically start AetherFlow minimized to system tray when you log in to Windows"
        >
          <AetherToggle checked={autoStart} onChange={handleToggleAutoStart} />
        </SettingRow>

        <SettingRow
          label="Hide Windows Desktop Icons"
          desc="Keep desktop workspace pristine by concealing desktop shortcuts while live wallpapers are playing"
        >
          <AetherToggle
            checked={hideDesktopIcons}
            onChange={() => {
              const nextVal = !hideDesktopIcons
              toggleHideDesktopIcons()
              import('@tauri-apps/api/core').then(({ invoke }) => {
                invoke('set_desktop_icons_visible', { visible: !nextVal }).catch(() => {})
              }).catch(() => {})
            }}
          />
        </SettingRow>

        <SettingRow
          label="YouTube Wallpaper Playback Engine"
          desc="Choose between native MPV hardware decoding (Zero YouTube UI, no Windows SMTC) or legacy WebView2 browser player"
        >
          <AetherSegmented
            options={[
              { value: 'mpv', label: 'Native MPV' },
              { value: 'webview2', label: 'WebView2' }
            ]}
            value={youtubeBackend}
            onChange={val => setYoutubeBackend(val)}
          />
        </SettingRow>

        {wallpaperDirectory && (
          <SettingRow
            label="Local Wallpaper Cache Directory"
            desc={`Stored on disk at: ${wallpaperDirectory}`}
          >
            <button
              type="button"
              className="btn btn-ghost"
              style={{
                fontSize: 12,
                padding: '6px 14px',
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                border: '1px solid var(--border-subtle)',
                background: 'var(--bg-surface)'
              }}
              onClick={() => {
                import('@tauri-apps/api/core').then(({ invoke }) => {
                  invoke('open_url', { url: wallpaperDirectory }).catch(() => {})
                }).catch(() => {})
              }}
            >
              <FolderOpen size={14} /> Open Folder
            </button>
          </SettingRow>
        )}
      </SettingSection>

      {/* Section: Storage & Watch Folder */}
      <SettingSection
        title="Storage & Watch Folder"
        badge={storageMode === 'hybrid' ? 'Smart Hybrid' : storageMode === 'always-copy' ? 'Full Copy' : 'In-Place'}
      >
        <SettingRow
          label="Media Ingestion Strategy"
          desc="Control whether imported wallpapers are copied to AppData or referenced in-place on disk"
        >
          <AetherSegmented
            options={[
              { value: 'hybrid', label: 'Smart Hybrid' },
              { value: 'always-copy', label: 'Always Copy' },
              { value: 'always-reference', label: 'In-Place Reference' },
            ]}
            value={storageMode}
            onChange={val => setStorageMode(val)}
          />
        </SettingRow>

        {storageMode === 'hybrid' && (
          <SettingRow
            label="In-Place Reference Threshold"
            desc={`Wallpapers smaller than ${storageThresholdMb}MB are safely copied to AppData; files larger than ${storageThresholdMb}MB (e.g. 4K/60fps videos) are linked in-place to save disk space`}
          >
            <AetherSegmented
              options={[
                { value: '25', label: '25 MB' },
                { value: '50', label: '50 MB' },
                { value: '100', label: '100 MB' },
                { value: '200', label: '200 MB' },
              ]}
              value={String(storageThresholdMb)}
              onChange={val => setStorageThresholdMb(Number(val))}
            />
          </SettingRow>
        )}

        <SettingRow
          label="Auto-Ingest Watch Folder"
          desc="Designate a directory (e.g. Downloads or Pictures). Any video or picture dropped inside will be automatically detected and added to your AetherFlow library"
        >
          <AetherToggle
            checked={watchFolderEnabled && Boolean(watchFolderPath)}
            disabled={!watchFolderPath}
            onChange={() => {
              if (watchFolderPath) {
                setWatchFolder(watchFolderPath, !watchFolderEnabled)
              }
            }}
          />
        </SettingRow>

        <SettingRow
          label="Designated Folder Path"
          desc={watchFolderPath ? `Active watch directory: ${watchFolderPath}` : 'No watch directory currently chosen'}
        >
          <div className="flex items-center gap-2">
            <button
              type="button"
              className="btn btn-ghost"
              style={{
                fontSize: 12,
                padding: '6px 14px',
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                border: '1px solid var(--border-subtle)',
                background: 'var(--bg-surface)'
              }}
              onClick={handlePickWatchFolder}
            >
              <FolderOpen size={14} /> {watchFolderPath ? 'Change Folder...' : 'Select Folder...'}
            </button>
            {watchFolderPath && (
              <button
                type="button"
                className="btn btn-ghost"
                disabled={isScanningWatch}
                style={{
                  fontSize: 12,
                  padding: '6px 14px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  border: '1px solid var(--border-subtle)',
                  background: 'var(--bg-surface)'
                }}
                onClick={handleScanNow}
              >
                <RefreshCw size={13} className={isScanningWatch ? 'animate-spin' : ''} />
                <span>Scan Now</span>
              </button>
            )}
          </div>
        </SettingRow>

        {scanFeedback && (
          <div style={{
            fontSize: 12,
            padding: '8px 12px',
            borderRadius: 6,
            background: 'rgba(var(--rgb-brand), 0.1)',
            border: '1px solid var(--border-accent)',
            color: 'var(--color-brand)',
            marginBottom: 8,
          }}>
            {scanFeedback}
          </div>
        )}

        <SettingRow
          label="Library Storage Consumption"
          desc={`Copied library currently holds ${storageStats.total_files} files using ${formatBytes(storageStats.total_bytes)} of disk space`}
        >
          {wallpaperDirectory && (
            <button
              type="button"
              className="btn btn-ghost"
              style={{
                fontSize: 12,
                padding: '6px 14px',
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                border: '1px solid var(--border-subtle)',
                background: 'var(--bg-surface)'
              }}
              onClick={() => {
                import('@tauri-apps/api/core').then(({ invoke }) => {
                  invoke('open_url', { url: wallpaperDirectory }).catch(() => {})
                }).catch(() => {})
              }}
            >
              <FolderOpen size={14} /> Open AppData Library
            </button>
          )}
        </SettingRow>
      </SettingSection>

      {/* Section 2: Software Updates & Releases */}
      <SettingSection
        title="Software Updates & Releases"
        badge={`v${APP_VERSION}`}
      >
        <SettingRow
          label="Check for Updates"
          desc="Query GitHub Releases for newer binary builds, security patches, and engine enhancements"
        >
          <button
            type="button"
            className="btn btn-ghost"
            disabled={checkingUpdate}
            style={{
              fontSize: 12,
              padding: '6px 14px',
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              border: '1px solid var(--border-subtle)',
              borderRadius: 8,
              background: 'var(--bg-surface)'
            }}
            onClick={handleCheckUpdate}
          >
            <RefreshCw size={13} className={checkingUpdate ? 'animate-spin' : ''} />
            {checkingUpdate ? 'Checking…' : 'Check Now'}
          </button>
        </SettingRow>

        {updateResult && (
          <div
            className="animate-fadeIn"
            style={{
              padding: '14px 18px',
              borderRadius: 8,
              margin: '8px 0',
              background: updateResult.hasUpdate
                ? 'color-mix(in srgb, var(--color-brand) 10%, transparent)'
                : updateResult.error
                ? 'color-mix(in srgb, var(--color-rose) 10%, transparent)'
                : 'color-mix(in srgb, var(--color-emerald) 10%, transparent)',
              border: `1px solid ${
                updateResult.hasUpdate
                  ? 'var(--color-brand)'
                  : updateResult.error
                  ? 'var(--color-rose)'
                  : 'var(--color-emerald)'
              }`,
            }}
          >
            {updateResult.hasUpdate ? (
              <div>
                <div className="flex items-center gap-2" style={{ marginBottom: 6 }}>
                  <Sparkles size={14} style={{ color: 'var(--color-brand)' }} />
                  <span className="text-xs font-semibold" style={{ color: 'var(--color-brand)' }}>
                    Update Available: v{updateResult.latestVersion}
                  </span>
                </div>
                <div className="text-xs text-muted" style={{ marginBottom: 10 }}>
                  {updateResult.releaseName || `AetherFlow v${updateResult.latestVersion} is ready to install.`}
                </div>
                <button
                  type="button"
                  className="btn btn-primary"
                  style={{ fontSize: 12, padding: '5px 14px', display: 'inline-flex', alignItems: 'center', gap: 6 }}
                  onClick={() => openReleaseUrl(updateResult.downloadUrl)}
                >
                  <DownloadCloud size={13} /> Download Installer
                </button>
              </div>
            ) : updateResult.error ? (
              <div className="flex items-center gap-2 text-xs" style={{ color: 'var(--color-rose)' }}>
                <AlertCircle size={14} />
                <span>Unable to check updates: {updateResult.error}</span>
              </div>
            ) : (
              <div className="flex items-center gap-2 text-xs" style={{ color: 'var(--color-emerald)' }}>
                <CheckCircle2 size={14} />
                <span>You are running the latest version of AetherFlow (v{APP_VERSION})</span>
              </div>
            )}
          </div>
        )}
      </SettingSection>

      {/* Section 3: Account & Community Identity */}
      <SettingSection
        title="Account & Community Identity"
        badge={isAuthenticated ? 'Authenticated' : 'Guest Mode'}
      >
        <div style={{ padding: '16px 20px' }}>
          {isAuthenticated && authUser ? (
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 16 }}>
                <UserAvatar user={authUser} size={48} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="text-sm font-bold" style={{ color: 'var(--text-main)' }}>
                    {authUser.user_metadata?.full_name || authUser.user_metadata?.name || authUser.email?.split('@')[0] || 'AetherFlow Creator'}
                  </div>
                  <div className="text-xs text-muted" style={{ marginTop: 2 }}>
                    {authUser.email || 'OAuth Verified Account'}
                  </div>
                  <div className="flex items-center gap-2" style={{ marginTop: 6 }}>
                    <span className="badge badge-brand font-mono" style={{ fontSize: 10 }}>
                      Verified Member
                    </span>
                    <span className="text-xs text-muted">
                      Provider: {authUser.app_metadata?.provider || 'Email/OAuth'}
                    </span>
                  </div>
                </div>
                <button
                  type="button"
                  className="btn btn-ghost"
                  disabled={signingOut}
                  style={{
                    fontSize: 12,
                    padding: '6px 14px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    color: 'var(--color-rose)',
                    borderColor: 'color-mix(in srgb, var(--color-rose) 30%, transparent)'
                  }}
                  onClick={handleSignOut}
                >
                  <LogOut size={13} />
                  {signingOut ? 'Signing out…' : 'Sign Out'}
                </button>
              </div>

              <div className="text-xs text-muted" style={{ lineHeight: 1.5 }}>
                Your account synchronizes your liked wallpapers, community ratings, and published creations across devices.
              </div>
            </div>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 16 }}>
              <div style={{ maxWidth: 540 }}>
                <div className="text-sm font-semibold" style={{ color: 'var(--text-main)', marginBottom: 4 }}>
                  Connect Your Creator Account
                </div>
                <div className="text-xs text-muted" style={{ lineHeight: 1.5 }}>
                  Sign in with your Google or GitHub account to publish creations to the Community Hub, sync liked wallpapers, and build your creator profile.
                </div>
              </div>
              <button
                type="button"
                className="btn btn-primary"
                style={{ fontSize: 12, padding: '7px 18px', display: 'inline-flex', alignItems: 'center', gap: 8 }}
                onClick={() => setShowAuthModal(true)}
              >
                <LogIn size={14} /> Sign In to AetherFlow
              </button>
            </div>
          )}
        </div>
      </SettingSection>

      {/* Section 4: Backend Infrastructure & Diagnostics */}
      <SettingSection
        title="Backend Infrastructure & Diagnostics"
        badge="Diagnostics"
      >
        <SettingRow
          label="Supabase Cloud Connectivity"
          desc="Required for Community Hub browsing, publishing, and OAuth session synchronization"
        >
          <span
            className="telemetry-chip"
            style={{
              fontSize: 11,
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              color: isOnline() ? 'var(--color-emerald)' : 'var(--text-muted)'
            }}
          >
            <span
              style={{
                width: 6,
                height: 6,
                borderRadius: '50%',
                background: isOnline() ? 'var(--color-emerald)' : 'var(--text-muted)'
              }}
            />
            {isOnline() ? 'Online · Connected' : 'Offline / Standalone Mode'}
          </span>
        </SettingRow>

        <SettingRow
          label="Local Storage Persistence"
          desc="Installed wallpapers, customized themes, audio presets, and favorites are safely preserved"
        >
          <span className="telemetry-chip font-mono">
            Persisted (LocalStorage)
          </span>
        </SettingRow>
      </SettingSection>

      {/* Footer credits */}
      <div className="text-xs text-muted" style={{ textAlign: 'center', marginTop: 32, paddingBottom: 16 }}>
        AetherFlow v{APP_VERSION} · Sovereign Desktop Visual Engine · Lightweight & Fast (~30MB RAM)
      </div>
    </div>
  )
}
