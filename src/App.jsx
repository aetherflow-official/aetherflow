import React from 'react'
import { BrowserRouter, Routes, Route, NavLink } from 'react-router-dom'
import { Home, Users, Library, Settings, Zap, Sparkles, X as CloseIcon, LogOut, User, ChevronUp, LogIn, Moon, Monitor, Palette, Volume2, ListMusic } from 'lucide-react'
import { checkForUpdate, APP_VERSION } from './lib/updater.js'
import { useStore, syncCustomWallpapersFromDisk } from './store/useStore.js'
import { applyWallpaperToDesktop, safeListen, isTauri } from './lib/wallpaperActions.js'
import { supabase, onAuthStateChange, signOut, processOAuthCallback } from './lib/supabase.js'
import AuthModal from './components/AuthModal/index.jsx'
import UserAvatar from './components/UserAvatar/index.jsx'
import HomePage from './pages/Home.jsx'
import CommunityPage from './pages/Community.jsx'
import LibraryPage from './pages/Library.jsx'
import PlaylistsPage from './pages/Playlists.jsx'
import DisplaysPage from './pages/Displays.jsx'
import PersonalizationPage from './pages/Personalization.jsx'
import AudioPage from './pages/Audio.jsx'
import ScreensaverPage from './pages/Screensaver.jsx'
import SettingsPage from './pages/Settings.jsx'

// NOTE: WallpaperPlayer is NO LONGER rendered in the control panel.
// The canvas lives in a completely separate window (wallpaper.html / wallpaper.jsx)
// that is pinned into the Windows WorkerW desktop layer via the PROGMAN trick.
// The control panel communicates with it via Tauri IPC (invoke → Rust → emit).

const NAV = [
  { to: '/',                icon: Home,        label: 'Home' },
  { to: '/library',         icon: Library,     label: 'Library' },
  { to: '/playlists',       icon: ListMusic,   label: 'Playlists' },
  { to: '/community',       icon: Users,       label: 'Community' },
  { to: '/displays',        icon: Monitor,     label: 'Displays & Workspace' },
  { to: '/personalization', icon: Palette,     label: 'Personalization' },
  { to: '/audio',           icon: Volume2,     label: 'Audio' },
  { to: '/screensaver',     icon: Moon,        label: 'Screensaver' },
  { to: '/settings',        icon: Settings,    label: 'Settings' },
]

export default function App() {
  const sidebarCollapsed = useStore(s => s.sidebarCollapsed)
  const toggleSidebar    = useStore(s => s.toggleSidebar)
  const audioVolume      = useStore(s => s.audioVolume)
  const audioMuted       = useStore(s => s.audioMuted)
  const pauseOnBattery   = useStore(s => s.pauseOnBattery)
  const pauseOnFullscreen = useStore(s => s.pauseOnFullscreen)
  const pauseOnMaximized = useStore(s => s.pauseOnMaximized) ?? true
  const multiMonitorPauseMode = useStore(s => s.multiMonitorPauseMode) || 'per-display'
  const audioPlaybackRule = useStore(s => s.audioPlaybackRule) || 'mute-covered'
  const preferredAudioMonitor = useStore(s => s.preferredAudioMonitor) || 'auto'
  const wallpaperSyncOnResume = useStore(s => s.wallpaperSyncOnResume) ?? true
  const screensaverEnabled = useStore(s => s.screensaverEnabled)
  const screensaverTimeoutMins = useStore(s => s.screensaverTimeoutMins)
  const screensaverMode = useStore(s => s.screensaverMode)
  const screensaverSpecificEngine = useStore(s => s.screensaverSpecificEngine)
  const screensaverCustomWallpaper = useStore(s => s.screensaverCustomWallpaper)
  const screensaverFadeInSecs = useStore(s => s.screensaverFadeInSecs)
  const screensaverLockOnResume = useStore(s => s.screensaverLockOnResume)
  const screensaverGracePeriodSecs = useStore(s => s.screensaverGracePeriodSecs)
  const screensaverMuteAudio = useStore(s => s.screensaverMuteAudio)
  const screensaverInhibitFullscreen = useStore(s => s.screensaverInhibitFullscreen)
  const screensaverInhibitMaximized = useStore(s => s.screensaverInhibitMaximized)
  const screensaverInhibitMediaPlayback = useStore(s => s.screensaverInhibitMediaPlayback)
  const authUser         = useStore(s => s.authUser)
  const isAuthenticated  = useStore(s => s.isAuthenticated)
  const glowAmbience     = useStore(s => s.glowAmbience) || 'balanced'
  const reducedMotion    = useStore(s => s.reducedMotion) || false
  const uiDensity        = useStore(s => s.uiDensity) || 'comfortable'
  const setAuthUser      = useStore(s => s.setAuthUser)
  const clearAuth        = useStore(s => s.clearAuth)
  const setShowAuthModal = useStore(s => s.setShowAuthModal)
  const [updateToast, setUpdateToast] = React.useState(null)
  const [showUserMenu, setShowUserMenu] = React.useState(false)
  const [signingOut, setSigningOut] = React.useState(false)
  const userMenuRef = React.useRef(null)

  // Sync ambience, density & reduced motion attributes to root document
  React.useEffect(() => {
    const mult = glowAmbience === 'vivid' ? '1.5' : glowAmbience === 'balanced' ? '1' : glowAmbience === 'subtle' ? '0.4' : '0'
    document.documentElement.style.setProperty('--glow-multiplier', mult)
    document.documentElement.setAttribute('data-density', uiDensity)
    if (reducedMotion) {
      document.documentElement.classList.add('reduced-motion')
    } else {
      document.documentElement.classList.remove('reduced-motion')
    }
  }, [glowAmbience, reducedMotion, uiDensity])

  // Close user menu on outside click
  React.useEffect(() => {
    function handleClickOutside(e) {
      if (userMenuRef.current && !userMenuRef.current.contains(e.target)) {
        setShowUserMenu(false)
      }
    }
    if (showUserMenu) {
      document.addEventListener('mousedown', handleClickOutside)
    }
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [showUserMenu])

  const handleSignOut = async () => {
    try {
      setSigningOut(true)
      await signOut()
      clearAuth()
      setShowUserMenu(false)
      await syncCustomWallpapersFromDisk()
    } catch (err) {
      console.error('Sign out error:', err)
      clearAuth()
      setShowUserMenu(false)
      await syncCustomWallpapersFromDisk()
    } finally {
      setSigningOut(false)
    }
  }

  // Listen for native OAuth popup callback from Tauri backend
  React.useEffect(() => {
    let unlistenApp
    let unlistenWindow

    const handleOAuthCallback = async (event) => {
      const urlStr = event.payload
      if (!urlStr) return
      console.log('[AetherFlow] Intercepted OAuth callback URL:', urlStr)
      const res = await processOAuthCallback(urlStr)
      if (res.success && res.user) {
        setAuthUser(res.user, res.session)
        setShowAuthModal(false)
        await syncCustomWallpapersFromDisk()
      }
    }

    safeListen('aether:oauth-callback', handleOAuthCallback)
      .then(u => { unlistenApp = u })
      .catch(() => {})
    safeListen('aura:oauth-callback', handleOAuthCallback)
      .catch(() => {})

    if (isTauri()) {
      import('@tauri-apps/api/webviewWindow').then(({ getCurrentWebviewWindow }) => {
        const win = getCurrentWebviewWindow()
        win.listen('aether:oauth-callback', handleOAuthCallback)
          .then(u => { unlistenWindow = u })
          .catch(() => {})
        win.listen('aura:oauth-callback', handleOAuthCallback)
          .catch(() => {})
      }).catch(() => {})
    }

    return () => {
      if (unlistenApp) unlistenApp()
      if (unlistenWindow) unlistenWindow()
    }
  }, [setAuthUser, setShowAuthModal])

  // Listen for Supabase auth state changes (login, logout, token refresh)
  React.useEffect(() => {
    const unsubscribe = onAuthStateChange(async (event, session) => {
      if (session?.user) {
        setAuthUser(session.user, session)
        setShowAuthModal(false)
        await syncCustomWallpapersFromDisk()
      } else if (event === 'SIGNED_OUT') {
        clearAuth()
      }
    })
    return unsubscribe
  }, [setAuthUser, clearAuth, setShowAuthModal])

  // One-time startup check for newer AetherFlow releases
  React.useEffect(() => {
    const timer = setTimeout(async () => {
      const res = await checkForUpdate()
      if (res && res.hasUpdate) {
        setUpdateToast(res)
      }
    }, 3500)
    return () => clearTimeout(timer)
  }, [])

  // Sync native Windows video thumbnails on App startup (Wallpaper Engine style)
  React.useEffect(() => {
    let unlisten = null
    async function initNativeThumbnails() {
      try {
        const { invoke } = await import('@tauri-apps/api/core')
        const { listen } = await import('@tauri-apps/api/event')

        unlisten = await listen('custom_thumbnails_updated', (event) => {
          if (Array.isArray(event.payload)) {
            const state = useStore.getState()
            const currentInstalled = state.installed || []
            const currentMap = new Map(currentInstalled.map(i => [i.id, i]))
            for (const item of event.payload) {
              if (currentMap.has(item.id)) {
                currentMap.set(item.id, { ...currentMap.get(item.id), ...item })
              }
            }
            useStore.setState({ installed: Array.from(currentMap.values()) })
          }
        })

        await invoke('sync_all_custom_video_thumbnails').catch(() => {})
      } catch {
        // Outside Tauri
      }
    }
    initNativeThumbnails()
    return () => {
      if (unlisten) unlisten()
    }
  }, [])

  // Broadcast global volume/mute changes to all active wallpaper windows & MPV
  React.useEffect(() => {
    async function broadcastAudio() {
      try {
        const { invoke } = await import('@tauri-apps/api/core')
        await invoke('set_mpv_volume', { monitorLabel: null, volume: audioVolume }).catch(() => {})
        await invoke('set_mpv_mute', { monitorLabel: null, muted: audioMuted }).catch(() => {})
        await invoke('update_wallpaper_config', { 
          config: { volume: audioVolume, muted: audioMuted },
          monitorLabel: null // broadcast to all
        }).catch(() => {})
      } catch (err) {
        // Not in Tauri
      }
    }
    broadcastAudio()
  }, [audioVolume, audioMuted])

  // Sync battery, fullscreen, maximized & multi-monitor power management settings with native Rust monitor
  React.useEffect(() => {
    async function syncPerformance() {
      try {
        const { invoke } = await import('@tauri-apps/api/core')
        await invoke('sync_performance_settings', {
          pauseOnBattery: !!pauseOnBattery,
          pauseOnFullscreen: !!pauseOnFullscreen,
          pauseOnMaximized: pauseOnMaximized !== false,
          multiMonitorPauseMode: multiMonitorPauseMode,
          audioPlaybackRule: audioPlaybackRule,
          preferredAudioMonitor: preferredAudioMonitor || 'auto',
          wallpaperSyncOnResume: !!wallpaperSyncOnResume,
        }).catch(() => {})
      } catch (err) {}
    }
    syncPerformance()
  }, [pauseOnBattery, pauseOnFullscreen, pauseOnMaximized, multiMonitorPauseMode, audioPlaybackRule, preferredAudioMonitor, wallpaperSyncOnResume])

  // Sync screensaver settings with native Rust background idle monitor
  React.useEffect(() => {
    async function syncScreensaver() {
      try {
        const { invoke } = await import('@tauri-apps/api/core')
        let specificEngine = null
        let specificConfig = null

        if (screensaverMode === 'custom' && screensaverCustomWallpaper) {
          specificEngine = screensaverCustomWallpaper.engine || (screensaverCustomWallpaper.config?.videoPath ? 'video-player' : (screensaverCustomWallpaper.config?.imagePath ? 'image-player' : (screensaverCustomWallpaper.config?.streamUrl ? 'web-stream' : (screensaverCustomWallpaper.id || 'aurora'))))
          specificConfig = screensaverCustomWallpaper.config || {}
        } else if (screensaverMode === 'specific') {
          specificEngine = screensaverSpecificEngine || 'matrix-rain'
          specificConfig = {}
        }

        await invoke('sync_screensaver_settings', {
          settings: {
            enabled: !!screensaverEnabled,
            idle_timeout_mins: Number(screensaverTimeoutMins) || 5,
            mode: screensaverMode || 'current',
            specific_engine: specificEngine,
            specific_config: specificConfig,
            fade_in_secs: Number(screensaverFadeInSecs) || 1.0,
            lock_on_resume: !!screensaverLockOnResume,
            grace_period_secs: Number(screensaverGracePeriodSecs) || 5,
            mute_audio: screensaverMuteAudio !== false,
            inhibit_fullscreen: screensaverInhibitFullscreen !== false,
            inhibit_maximized: screensaverInhibitMaximized !== false,
            inhibit_audio: screensaverInhibitMediaPlayback !== false,
          }
        }).catch(() => {})
      } catch (err) {}
    }
    syncScreensaver()
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

  // Ensure window is visible and focused on mount unless launched minimized at startup
  React.useEffect(() => {
    async function initWindow() {
      try {
        const { invoke } = await import('@tauri-apps/api/core')
        const isMinimized = await invoke('is_minimized_boot').catch(() => false)
        if (!isMinimized) {
          const { getCurrentWindow } = await import('@tauri-apps/api/window')
          const win = getCurrentWindow()
          await win.unminimize().catch(() => {})
          await win.show().catch(() => {})
          await win.setFocus().catch(() => {})
        }
      } catch {}
    }
    initWindow()
  }, [])

  // Auto-restore wallpaper & sync custom wallpapers on startup/cold boot
  React.useEffect(() => {
    let timer = null
    async function restoreStartup() {
      try {
        await syncCustomWallpapersFromDisk()
        const state = useStore.getState()
        if (state.isWallpaperRunning) {
          timer = setTimeout(async () => {
            if (state.screenArrangement === 'per-screen' && state.monitorWallpapers && Object.keys(state.monitorWallpapers).length > 0) {
              console.log('[AetherFlow] Restoring per-screen wallpapers on startup:', state.monitorWallpapers)
              for (const [monLabel, wp] of Object.entries(state.monitorWallpapers)) {
                if (wp) {
                  await applyWallpaperToDesktop(wp, { targetMonitor: monLabel })
                }
              }
            } else if (state.activeWallpaper) {
              console.log('[AetherFlow] Restoring active wallpaper on startup:', state.activeWallpaper)
              await applyWallpaperToDesktop(state.activeWallpaper)
            }
            if (isTauri()) {
              const { getCurrentWindow } = await import('@tauri-apps/api/window')
              const win = getCurrentWindow()
              await win.unminimize().catch(() => {})
              await win.show().catch(() => {})
              await win.setFocus().catch(() => {})
            }
          }, 600)
        }
      } catch (e) {
        console.error('[AetherFlow] Startup restoration failed:', e)
      }
    }
    restoreStartup()
    return () => {
      if (timer) clearTimeout(timer)
    }
  }, [])

  // ── Global Hotkeys, System Tray & Shell Context Menu Listeners ─────────────
  React.useEffect(() => {
    let unlistens = []

    async function setupListeners() {
      // 1. Next Wallpaper
      const u1 = await safeListen('aether:shortcut:next', async () => {
        try {
          const { rotateNext, cycleLibraryWallpaper } = await import('./lib/playlistManager.js')
          const activePlaylists = useStore.getState().activePlaylists || {}
          if (Object.keys(activePlaylists).length > 0) {
            await rotateNext(undefined, undefined, true)
          } else {
            await cycleLibraryWallpaper(1)
          }
        } catch (e) {
          console.warn('[Shortcut] next failed:', e)
        }
      })
      if (u1) unlistens.push(u1)

      // 2. Previous Wallpaper
      const u2 = await safeListen('aether:shortcut:prev', async () => {
        try {
          const { rotatePrev, cycleLibraryWallpaper } = await import('./lib/playlistManager.js')
          const activePlaylists = useStore.getState().activePlaylists || {}
          if (Object.keys(activePlaylists).length > 0) {
            await rotatePrev(undefined, undefined, true)
          } else {
            await cycleLibraryWallpaper(-1)
          }
        } catch (e) {
          console.warn('[Shortcut] prev failed:', e)
        }
      })
      if (u2) unlistens.push(u2)

      // 3. Toggle Mute
      const u3 = await safeListen('aether:shortcut:toggle-mute', (event) => {
        const payloadMuted = event?.payload?.muted
        if (typeof payloadMuted === 'boolean') {
          useStore.setState({ audioMuted: payloadMuted })
        } else {
          const cur = useStore.getState().audioMuted
          useStore.setState({ audioMuted: !cur })
        }
      })
      if (u3) unlistens.push(u3)

      // 4. Toggle Desktop Icons
      const u4 = await safeListen('aether:shortcut:toggle-icons', (event) => {
        const payloadHide = event?.payload?.hideDesktopIcons
        if (typeof payloadHide === 'boolean') {
          useStore.setState({ hideDesktopIcons: payloadHide })
        } else {
          const cur = useStore.getState().hideDesktopIcons || false
          useStore.setState({ hideDesktopIcons: !cur })
        }
      })
      if (u4) unlistens.push(u4)

      // 4b. Toggle Pause
      const u4b = await safeListen('aether:shortcut:toggle-pause', (event) => {
        const isPaused = event?.payload?.isPaused
        console.log('[Shortcut] Wallpaper pause toggled:', isPaused)
      })
      if (u4b) unlistens.push(u4b)

      // 4c. Tray Quick Adjustments: Volume, Brightness, Playback Speed, Opacity
      const uVol = await safeListen('aether:tray:set-volume', (event) => {
        const vol = event?.payload?.volume
        const muted = event?.payload?.muted
        if (typeof vol === 'number') {
          useStore.setState({ audioVolume: vol })
          const activeWp = useStore.getState().activeWallpaper
          if (activeWp) {
            useStore.getState().setWallpaperAudio(activeWp.id, { volume: vol, muted: Boolean(muted) })
          }
        }
        if (typeof muted === 'boolean') {
          useStore.setState({ audioMuted: muted })
        }
      })
      if (uVol) unlistens.push(uVol)

      const uBr = await safeListen('aether:tray:set-brightness', (event) => {
        const br = event?.payload?.brightness
        if (typeof br === 'number') {
          useStore.getState().setWallpaperBrightness(br)
        }
      })
      if (uBr) unlistens.push(uBr)

      const uSpd = await safeListen('aether:tray:set-speed', (event) => {
        const spd = event?.payload?.speed
        if (typeof spd === 'number') {
          useStore.getState().setWallpaperSpeed(spd)
        }
      })
      if (uSpd) unlistens.push(uSpd)

      const uOp = await safeListen('aether:tray:set-opacity', (event) => {
        const op = event?.payload?.opacity
        if (typeof op === 'number') {
          useStore.getState().setWallpaperOpacity(op)
        }
      })
      if (uOp) unlistens.push(uOp)

      // 4d. Window Lifecycle: Hidden to tray / Restored
      const uWinHidden = await safeListen('aether:window-hidden', () => {
        console.log('[Lifecycle] Main window hidden to tray — suspending UI render loops')
        useStore.getState().setIsWindowHidden?.(true)
      })
      if (uWinHidden) unlistens.push(uWinHidden)

      const uWinVisible = await safeListen('aether:window-visible', () => {
        console.log('[Lifecycle] Main window restored — resuming UI render loops')
        useStore.getState().setIsWindowHidden?.(false)
      })
      if (uWinVisible) unlistens.push(uWinVisible)

      // 5. File Explorer Context Menu: Set as AetherFlow Wallpaper
      const u5 = await safeListen('aether:cli:apply-file', async (event) => {
        const filePath = event?.payload?.filePath
        if (!filePath) return
        try {
          const ext = filePath.split('.').pop()?.toLowerCase()
          const isVideo = ['mp4', 'webm', 'mkv', 'mov', 'avi'].includes(ext)
          const name = filePath.split(/[/\\]/).pop().replace(/\.[^/.]+$/, '')
          const id = `custom-${Date.now()}`
          const item = {
            id,
            name,
            engine: isVideo ? 'video-player' : 'image-player',
            config: isVideo ? { videoPath: filePath, speedMultiplier: 1 } : { imagePath: filePath, scaleMode: 'cover' },
            tags: [isVideo ? 'video' : 'picture', 'custom'],
            isCustom: true,
            createdAt: Date.now(),
          }

          const currentInstalled = useStore.getState().installed || []
          useStore.setState({ installed: [item, ...currentInstalled.filter(x => x.id !== id)] })
          await applyWallpaperToDesktop(item)
          console.log('[Shell Context Menu] Successfully applied wallpaper from file:', filePath)
        } catch (e) {
          console.error('[Shell Context Menu] Failed to apply file:', e)
        }
      })
      if (u5) unlistens.push(u5)
    }

    setupListeners()

    // Sync registered hotkeys and context menus with backend on startup
    if (isTauri()) {
      import('@tauri-apps/api/core').then(({ invoke }) => {
        const state = useStore.getState()
        if (state.hotkeys?.enabled && state.hotkeys?.bindings) {
          invoke('update_registered_hotkeys', { bindings: state.hotkeys.bindings }).catch(() => {})
        }
        state.syncContextMenuState?.()
      }).catch(() => {})
    }

    return () => {
      unlistens.forEach(fn => {
        if (typeof fn === 'function') fn()
      })
    }
  }, [])

  // ── In-App Keyboard Shortcuts (Focus Search, Nav, Modal Escape) ────────────
  React.useEffect(() => {
    const handleKeyDown = (e) => {
      // Ignore if user is currently typing in a text field
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target?.tagName)) {
        if (e.key === 'Escape') {
          e.target.blur()
        }
        return
      }

      // '/' or 'Ctrl+F' -> Focus Search Bar
      if (e.key === '/' || (e.ctrlKey && e.key.toLowerCase() === 'f')) {
        e.preventDefault()
        const searchInput = document.querySelector('input[placeholder*="Search" i], input[type="search"]')
        if (searchInput) {
          searchInput.focus()
          searchInput.select()
        }
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  return (
    <BrowserRouter>
      {/* Control panel shell */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: sidebarCollapsed ? '64px 1fr' : '210px 1fr',
        gridTemplateRows: '1fr',
        height: '100vh',
        overflow: 'hidden',
        background: 'var(--bg-base)',
        transition: 'grid-template-columns 0.25s var(--ease-smooth)',
      }}>
        {/* Sidebar */}
        <aside style={{
          background: 'var(--bg-sidebar)',
          backdropFilter: 'blur(24px)',
          WebkitBackdropFilter: 'blur(24px)',
          borderRight: '1px solid var(--border-subtle)',
          display: 'flex',
          flexDirection: 'column',
          padding: '12px 8px',
          overflow: 'visible',
          zIndex: 50,
          position: 'relative',
        }}>
            {/* Logo */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 11,
                padding: '8px 8px 16px',
                overflow: 'hidden',
                cursor: 'pointer',
              }}
              onClick={toggleSidebar}
            >
              <div style={{
                width: 34, height: 34, borderRadius: 10, flexShrink: 0,
                background: 'radial-gradient(circle, rgba(6, 182, 212, 0.18) 0%, rgba(168, 85, 247, 0.12) 100%)',
                border: '1px solid rgba(255, 255, 255, 0.1)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                boxShadow: '0 0 16px rgba(6, 182, 212, 0.25), inset 0 1px 0 rgba(255, 255, 255, 0.15)',
                overflow: 'hidden',
                padding: 2,
              }}>
                <img
                  src="/logo.png"
                  alt="AetherFlow"
                  style={{
                    width: '100%',
                    height: '100%',
                    objectFit: 'contain',
                    filter: 'drop-shadow(0 2px 6px rgba(6, 182, 212, 0.35))'
                  }}
                />
              </div>
              {!sidebarCollapsed && (
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                  <span className="font-display font-bold text-lg" style={{ letterSpacing: '-0.5px', lineHeight: 1.2 }}>
                    AetherFlow
                  </span>
                  <span style={{ fontSize: 9.5, color: 'var(--text-subtle)', fontFamily: 'var(--font-mono)', letterSpacing: '0.05em' }}>
                    v{APP_VERSION} AETHER
                  </span>
                </div>
              )}
            </div>

            {/* Nav */}
            <nav style={{ display: 'flex', flexDirection: 'column', gap: 3, flex: 1, overflowY: 'auto', overflowX: 'hidden' }}>
            {NAV.map(({ to, icon: Icon, label }) => (
              <NavLink key={to} to={to} end={to === '/'} style={{ textDecoration: 'none' }}>
                {({ isActive }) => (
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    padding: '9px 10px',
                    borderRadius: 8,
                    color: isActive ? 'var(--color-brand)' : 'var(--text-muted)',
                    background: isActive ? 'color-mix(in srgb, var(--color-brand) 12%, transparent)' : 'transparent',
                    border: isActive ? '1px solid color-mix(in srgb, var(--color-brand) 28%, transparent)' : '1px solid transparent',
                    boxShadow: isActive ? '0 1px 3px rgba(0, 0, 0, 0.08)' : 'none',
                    fontWeight: isActive ? 600 : 500,
                    transition: 'all 0.15s ease',
                    cursor: 'pointer',
                    overflow: 'hidden',
                    whiteSpace: 'nowrap',
                  }}
                  onMouseEnter={e => { if (!isActive) { e.currentTarget.style.background = 'color-mix(in srgb, var(--text-main) 6%, transparent)'; e.currentTarget.style.color = 'var(--text-main)' }}}
                  onMouseLeave={e => { if (!isActive) { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--text-muted)' }}}
                  >
                    <Icon size={17} style={{ flexShrink: 0 }} />
                    {!sidebarCollapsed && <span className="text-sm">{label}</span>}
                  </div>
                )}
              </NavLink>
            ))}
          </nav>

          {/* Ambient Motivational Quote Widget (Matching Sovereign Mockup) */}
          {!sidebarCollapsed && (
            <div className="sidebar-quote-card">
              <div className="sidebar-quote-text">
                “A more beautiful desktop, every day.”
              </div>
              <div className="sidebar-quote-author">
                — AetherFlow
              </div>
            </div>
          )}

          {/* User profile pill matching concept design */}
          <div ref={userMenuRef} style={{
            position: 'relative',
            padding: '6px 4px',
            borderTop: '1px solid var(--border-subtle)',
            marginTop: sidebarCollapsed ? 'auto' : 0,
          }}>
            {isAuthenticated && authUser ? (
              <>
                {/* Account Menu Popover */}
                {showUserMenu && (
                  <div style={{
                    position: 'absolute',
                    bottom: 'calc(100% + 8px)',
                    left: sidebarCollapsed ? 'calc(100% + 8px)' : 8,
                    right: sidebarCollapsed ? 'auto' : 8,
                    width: sidebarCollapsed ? 230 : 'auto',
                    boxSizing: 'border-box',
                    background: 'var(--bg-card)',
                    backdropFilter: 'blur(24px)',
                    WebkitBackdropFilter: 'blur(24px)',
                    border: '1px solid var(--border-main)',
                    borderRadius: 12,
                    padding: '12px',
                    boxShadow: '0 12px 32px rgba(0, 0, 0, 0.25), 0 0 0 1px var(--border-subtle)',
                    zIndex: 1000,
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                      <UserAvatar user={authUser} size={36} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{
                          fontSize: 13,
                          fontWeight: 600,
                          color: 'var(--text-main)',
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                        }}>
                          {authUser.user_metadata?.full_name || authUser.user_metadata?.name || 'Yashpreet'}
                        </div>
                        <div style={{
                          fontSize: 10,
                          color: 'var(--text-muted)',
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                        }}>
                          {authUser.email || ''}
                        </div>
                      </div>
                    </div>

                    <div style={{ borderTop: '1px solid var(--border-main)', marginBottom: 10 }} />

                    <button
                      type="button"
                      onClick={handleSignOut}
                      disabled={signingOut}
                      style={{
                        width: '100%',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: 8,
                        padding: '8px 12px',
                        borderRadius: 8,
                        background: 'rgba(239, 68, 68, 0.12)',
                        border: '1px solid rgba(239, 68, 68, 0.25)',
                        color: '#f87171',
                        fontSize: 12,
                        fontWeight: 600,
                        cursor: signingOut ? 'wait' : 'pointer',
                        transition: 'all 0.15s ease',
                      }}
                    >
                      <LogOut size={13} />
                      <span>{signingOut ? 'Signing out...' : 'Sign Out'}</span>
                    </button>
                  </div>
                )}

                {/* Profile Pill */}
                <button
                  type="button"
                  onClick={() => setShowUserMenu(v => !v)}
                  className="sidebar-profile-pill"
                  title="Account settings & Sign out"
                >
                  <div style={{
                    width: 28, height: 28, borderRadius: '50%',
                    background: 'linear-gradient(135deg, #f97316 0%, #ea580c 100%)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    color: '#fff', fontWeight: 700, fontSize: 12, flexShrink: 0,
                    boxShadow: '0 2px 6px rgba(249, 115, 22, 0.35)'
                  }}>
                    {(authUser.user_metadata?.full_name || authUser.email || 'Y')[0].toUpperCase()}
                  </div>
                  {!sidebarCollapsed && (
                    <>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{
                          fontSize: 12, fontWeight: 600, color: 'var(--text-main)',
                          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis'
                        }}>
                          {authUser.user_metadata?.full_name || 'Yashpreet'}
                        </div>
                        <div style={{ fontSize: 10, color: 'var(--text-subtle)' }}>
                          Free User
                        </div>
                      </div>
                      <NavLink to="/settings" onClick={e => e.stopPropagation()} style={{ color: 'var(--text-muted)', display: 'flex' }} title="Settings">
                        <Settings size={14} />
                      </NavLink>
                    </>
                  )}
                </button>
              </>
            ) : (
              <div
                className="sidebar-profile-pill"
                onClick={() => setShowAuthModal(true)}
                title="Sign in or manage local profile"
              >
                <div style={{
                  width: 28, height: 28, borderRadius: '50%',
                  background: 'linear-gradient(135deg, #f97316 0%, #ea580c 100%)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  color: '#fff', fontWeight: 700, fontSize: 12, flexShrink: 0,
                  boxShadow: '0 2px 6px rgba(249, 115, 22, 0.35)'
                }}>
                  Y
                </div>
                {!sidebarCollapsed && (
                  <>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{
                        fontSize: 12, fontWeight: 600, color: 'var(--text-main)',
                        whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis'
                      }}>
                        Yashpreet
                      </div>
                      <div style={{ fontSize: 10, color: 'var(--text-subtle)' }}>
                        Free User
                      </div>
                    </div>
                    <NavLink to="/settings" onClick={e => e.stopPropagation()} style={{ color: 'var(--text-muted)', display: 'flex' }} title="Settings">
                      <Settings size={14} />
                    </NavLink>
                  </>
                )}
              </div>
            )}
          </div>
        </aside>

        {/* Main content */}
        <main style={{
          overflow: 'auto',
          background: 'var(--bg-base)',
          padding: 0,
        }}>
          {!isTauri() && (
            <div
              style={{
                position: 'fixed',
                bottom: 20,
                right: 20,
                zIndex: 9000,
                background: 'color-mix(in srgb, var(--bg-card) 90%, transparent)',
                backdropFilter: 'blur(8px)',
                border: '1px solid var(--border-subtle)',
                borderRadius: 6,
                padding: '3px 9px',
                fontSize: 10,
                color: 'var(--text-muted)',
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                pointerEvents: 'none',
                boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
              }}
              title="Running in browser dev preview. Launch AetherFlow.exe for native Windows desktop pinning."
            >
              <span style={{ width: 5, height: 5, borderRadius: '50%', background: 'var(--color-brand)' }} />
              <span>Browser Preview</span>
            </div>
          )}

          <Routes>
            <Route path="/"                element={<HomePage />} />
            <Route path="/library"         element={<LibraryPage />} />
            <Route path="/playlists"       element={<PlaylistsPage />} />
            <Route path="/community"       element={<CommunityPage />} />
            <Route path="/marketplace"     element={<CommunityPage />} />
            <Route path="/displays"        element={<DisplaysPage />} />
            <Route path="/personalization" element={<PersonalizationPage />} />
            <Route path="/audio"           element={<AudioPage />} />
            <Route path="/screensaver"     element={<ScreensaverPage />} />
            <Route path="/settings"        element={<SettingsPage />} />
          </Routes>
        </main>
      </div>

        {/* Floating Update Notification Toast */}
        {updateToast && (
          <div style={{
            position: 'fixed',
            bottom: 38,
            right: 20,
            zIndex: 9999,
            background: 'var(--bg-card)',
            border: '1px solid var(--border-accent)',
            boxShadow: '0 8px 30px rgba(0,0,0,0.5)',
            borderRadius: 10,
            padding: '12px 16px',
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            backdropFilter: 'blur(16px)',
            animation: 'fadeIn 0.3s ease',
          }}>
            <div style={{
              width: 32, height: 32, borderRadius: 8,
              background: 'color-mix(in srgb, var(--color-brand) 20%, transparent)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              flexShrink: 0,
            }}>
              <Sparkles size={16} className="text-brand" />
            </div>
            <div>
              <div className="text-xs font-bold" style={{ color: 'var(--text-main)' }}>
                New Version Available: {updateToast.latestTag}
              </div>
              <div className="text-xs text-muted" style={{ marginTop: 2 }}>
                Enhancements and new features are ready to install.
              </div>
            </div>
            <div className="flex items-center gap-2" style={{ marginLeft: 8 }}>
              <NavLink to="/settings" style={{ textDecoration: 'none' }} onClick={() => setUpdateToast(null)}>
                <button className="btn btn-primary" style={{ fontSize: 11, padding: '4px 10px', height: 'auto' }}>
                  Update
                </button>
              </NavLink>
              <button className="btn-icon" onClick={() => setUpdateToast(null)} title="Dismiss">
                <CloseIcon size={13} />
              </button>
            </div>
          </div>
        )}

        {/* Auth Modal (rendered at root so it floats above everything) */}
        <AuthModal />
    </BrowserRouter>
  )
}
