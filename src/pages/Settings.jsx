import React, { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import {
  Power, DownloadCloud, CheckCircle2, AlertCircle, ExternalLink,
  User, LogIn, LogOut, Shield, Globe, FolderOpen, RefreshCw,
  Monitor, Palette, Volume2, ArrowRight
} from 'lucide-react'
import { useStore } from '../store/useStore.js'
import { checkForUpdate, openReleaseUrl, APP_VERSION } from '../lib/updater.js'
import UserAvatar from '../components/UserAvatar/index.jsx'
import { signOut, isOnline } from '../lib/supabase.js'
import { SettingRow } from '../components/Settings/SettingRow.jsx'

export default function SettingsPage() {
  const autoStart = useStore(s => s.autoStart) || false
  const hideDesktopIcons = useStore(s => s.hideDesktopIcons) || false
  const toggleHideDesktopIcons = useStore(s => s.toggleHideDesktopIcons)
  const authUser = useStore(s => s.authUser)
  const isAuthenticated = useStore(s => s.isAuthenticated)
  const setShowAuthModal = useStore(s => s.setShowAuthModal)
  const clearAuth = useStore(s => s.clearAuth)

  const [checkingUpdate, setCheckingUpdate] = useState(false)
  const [updateResult, setUpdateResult] = useState(null)
  const [signingOut, setSigningOut] = useState(false)
  const [wallpaperDirectory, setWallpaperDirectory] = useState('')

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
    <div className="animate-fadeIn" style={{ maxWidth: 880, margin: '0 auto', paddingBottom: 48 }}>
      {/* Top Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 className="font-display font-bold text-2xl" style={{ letterSpacing: '-0.5px' }}>
            System & Preferences
          </h1>
          <p className="text-muted text-sm" style={{ marginTop: 4 }}>
            Manage Windows startup, desktop shell behavior, software updates, and cloud account synchronization
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="telemetry-chip">
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--color-emerald)', display: 'inline-block' }} />
            <span>v{APP_VERSION}</span>
          </span>
        </div>
      </div>

      {/* Quick Navigation Cards to Dedicated Sidebar Pages */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
        gap: 12,
        marginBottom: 24,
      }}>
        <Link to="/displays" style={{ textDecoration: 'none', color: 'inherit' }}>
          <div className="card p-3" style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            background: 'var(--bg-card)', border: '1px solid var(--border-subtle)',
            borderRadius: 10, cursor: 'pointer', transition: 'all 0.15s ease',
          }}
          onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--color-brand)'}
          onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--border-subtle)'}
          >
            <div className="flex items-center gap-2.5">
              <div style={{
                width: 32, height: 32, borderRadius: 8,
                background: 'color-mix(in srgb, var(--color-brand) 15%, transparent)',
                display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0
              }}>
                <Monitor size={16} style={{ color: 'var(--color-brand)' }} />
              </div>
              <div>
                <div className="font-semibold text-xs" style={{ color: 'var(--text-main)' }}>Displays & Workspace</div>
                <div className="text-muted" style={{ fontSize: 10.5 }}>Taskbar Glass, TranslucentTB & Occlusion</div>
              </div>
            </div>
            <ArrowRight size={14} className="text-muted" />
          </div>
        </Link>

        <Link to="/personalization" style={{ textDecoration: 'none', color: 'inherit' }}>
          <div className="card p-3" style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            background: 'var(--bg-card)', border: '1px solid var(--border-subtle)',
            borderRadius: 10, cursor: 'pointer', transition: 'all 0.15s ease',
          }}
          onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--color-accent)'}
          onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--border-subtle)'}
          >
            <div className="flex items-center gap-2.5">
              <div style={{
                width: 32, height: 32, borderRadius: 8,
                background: 'color-mix(in srgb, var(--color-accent) 15%, transparent)',
                display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0
              }}>
                <Palette size={16} style={{ color: 'var(--color-accent)' }} />
              </div>
              <div>
                <div className="font-semibold text-xs" style={{ color: 'var(--text-main)' }}>Personalization</div>
                <div className="text-muted" style={{ fontSize: 10.5 }}>Themes, Colors & Custom Studio</div>
              </div>
            </div>
            <ArrowRight size={14} className="text-muted" />
          </div>
        </Link>

        <Link to="/audio" style={{ textDecoration: 'none', color: 'inherit' }}>
          <div className="card p-3" style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            background: 'var(--bg-card)', border: '1px solid var(--border-subtle)',
            borderRadius: 10, cursor: 'pointer', transition: 'all 0.15s ease',
          }}
          onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--color-emerald)'}
          onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--border-subtle)'}
          >
            <div className="flex items-center gap-2.5">
              <div style={{
                width: 32, height: 32, borderRadius: 8,
                background: 'color-mix(in srgb, var(--color-emerald) 15%, transparent)',
                display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0
              }}>
                <Volume2 size={16} style={{ color: 'var(--color-emerald)' }} />
              </div>
              <div>
                <div className="font-semibold text-xs" style={{ color: 'var(--text-main)' }}>Audio & Reactivity</div>
                <div className="text-muted" style={{ fontSize: 10.5 }}>Master Volume, VU Meter & Inputs</div>
              </div>
            </div>
            <ArrowRight size={14} className="text-muted" />
          </div>
        </Link>
      </div>

      {/* Card 1: System Startup & Desktop Shell */}
      <div className="setting-card">
        <div className="setting-card-header">
          <div className="flex items-center gap-2.5">
            <Power size={16} style={{ color: 'var(--color-brand)' }} />
            <span className="text-sm font-semibold">Startup & Windows Integration</span>
          </div>
          <span className="badge font-mono" style={{ fontSize: 10 }}>OS Level</span>
        </div>

        <SettingRow
          label="Launch AetherFlow on System Startup"
          desc="Automatically start AetherFlow minimized to system tray when you log in to Windows"
        >
          <label className="toggle">
            <input type="checkbox" checked={autoStart} onChange={handleToggleAutoStart} />
            <div className="toggle-track" />
            <div className="toggle-thumb" />
          </label>
        </SettingRow>

        <SettingRow
          label="Hide Windows Desktop Icons"
          desc="Keep desktop workspace pristine by concealing desktop shortcuts while live wallpapers are playing"
        >
          <label className="toggle">
            <input
              type="checkbox"
              checked={hideDesktopIcons}
              onChange={() => {
                const nextVal = !hideDesktopIcons
                toggleHideDesktopIcons()
                import('@tauri-apps/api/core').then(({ invoke }) => {
                  invoke('set_desktop_icons_visible', { visible: !nextVal }).catch(() => {})
                }).catch(() => {})
              }}
            />
            <div className="toggle-track" />
            <div className="toggle-thumb" />
          </label>
        </SettingRow>

        {wallpaperDirectory && (
          <SettingRow
            label="Local Wallpaper Cache Directory"
            desc={`Stored on disk at: ${wallpaperDirectory}`}
          >
            <button
              type="button"
              className="btn btn-ghost"
              style={{ fontSize: 12, padding: '5px 12px', display: 'flex', alignItems: 'center', gap: 6, border: '1px solid var(--border-main)' }}
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
      </div>

      {/* Card 2: Software Updates & GitHub Releases */}
      <div className="setting-card">
        <div className="setting-card-header">
          <div className="flex items-center gap-2.5">
            <DownloadCloud size={16} style={{ color: 'var(--color-cyan)' }} />
            <span className="text-sm font-semibold">Software Updates & Releases</span>
          </div>
          <span className="badge badge-brand font-mono" style={{ fontSize: 10 }}>v{APP_VERSION}</span>
        </div>

        <div style={{ padding: '16px 18px' }}>
          <div className="flex items-center justify-between" style={{ marginBottom: 12 }}>
            <div>
              <div className="text-sm font-semibold" style={{ color: 'var(--text-main)' }}>Check for Updates</div>
              <div className="text-xs text-muted" style={{ marginTop: 2 }}>
                Query GitHub Releases for newer binary builds, security patches, and engine enhancements
              </div>
            </div>
            <button
              type="button"
              className="btn btn-ghost"
              disabled={checkingUpdate}
              style={{ fontSize: 12, padding: '6px 14px', display: 'flex', alignItems: 'center', gap: 6, border: '1px solid var(--border-main)', borderRadius: 8 }}
              onClick={handleCheckUpdate}
            >
              <RefreshCw size={13} className={checkingUpdate ? 'animate-spin' : ''} />
              {checkingUpdate ? 'Checking…' : 'Check Now'}
            </button>
          </div>

          {updateResult && (
            <div
              className="animate-fadeIn"
              style={{
                marginTop: 14,
                padding: '12px 14px',
                borderRadius: 8,
                background: updateResult.hasUpdate
                  ? 'color-mix(in srgb, var(--color-brand) 12%, transparent)'
                  : updateResult.error
                  ? 'color-mix(in srgb, var(--color-rose) 12%, transparent)'
                  : 'color-mix(in srgb, var(--color-emerald) 12%, transparent)',
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
        </div>
      </div>

      {/* Card 3: Account & Identity */}
      <div className="setting-card">
        <div className="setting-card-header">
          <div className="flex items-center gap-2.5">
            <User size={16} style={{ color: 'var(--color-brand)' }} />
            <span className="text-sm font-semibold">Account & Community Identity</span>
          </div>
          <span className={`badge ${isAuthenticated ? 'badge-brand' : ''}`} style={{ fontSize: 10 }}>
            {isAuthenticated ? 'Authenticated' : 'Guest Mode'}
          </span>
        </div>

        <div style={{ padding: '16px 18px' }}>
          {isAuthenticated && authUser ? (
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 16 }}>
                <UserAvatar user={authUser} size={52} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="text-base font-bold" style={{ color: 'var(--text-main)' }}>
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
                Your account synchronizes your liked wallpapers, community ratings, and published marketplace creations across devices.
              </div>
            </div>
          ) : (
            <div>
              <div className="text-xs text-muted" style={{ marginBottom: 14, lineHeight: 1.6 }}>
                Sign in with your Google or GitHub account to publish creations to the Community Marketplace, sync liked wallpapers, and build your creator profile.
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
      </div>

      {/* Card 4: Backend Infrastructure & Persistence */}
      <div className="setting-card">
        <div className="setting-card-header">
          <div className="flex items-center gap-2.5">
            <Globe size={16} style={{ color: 'var(--color-accent)' }} />
            <span className="text-sm font-semibold">Backend Infrastructure & Diagnostics</span>
          </div>
          <span className="badge font-mono" style={{ fontSize: 10 }}>Diagnostics</span>
        </div>

        <SettingRow
          label="Supabase Cloud Connectivity"
          desc="Required for Community Marketplace browsing, publishing, and OAuth session synchronization"
        >
          <span
            className={`badge ${isOnline() ? 'badge-emerald' : ''}`}
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
      </div>

      {/* Footer credits */}
      <div className="text-xs text-muted" style={{ textAlign: 'center', marginTop: 24 }}>
        AetherFlow v{APP_VERSION} · Sovereign Desktop Visual Engine · Lightweight & Fast (~30MB RAM)
      </div>
    </div>
  )
}
