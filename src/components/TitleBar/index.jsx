import React, { useState, useEffect, useRef } from 'react'
import { Search, Plus, Bell, Minus, Square, X } from 'lucide-react'
import { isTauri } from '../../lib/wallpaperActions.js'

export default function TitleBar({ onOpenImport, onSearch, searchQuery = '' }) {
  const [isMaximized, setIsMaximized] = useState(false)
  const [localSearch, setLocalSearch] = useState(searchQuery)
  const inputRef = useRef(null)

  useEffect(() => {
    setLocalSearch(searchQuery)
  }, [searchQuery])

  useEffect(() => {
    let unlistenResize = null
    async function checkMax() {
      if (isTauri()) {
        try {
          const { getCurrentWindow } = await import('@tauri-apps/api/window')
          const win = getCurrentWindow()
          const max = await win.isMaximized()
          setIsMaximized(max)
          unlistenResize = await win.onResized(async () => {
            const m = await win.isMaximized()
            setIsMaximized(m)
          })
        } catch {}
      }
    }
    checkMax()
    return () => {
      if (unlistenResize) unlistenResize()
    }
  }, [])

  // Global '/' keyboard shortcut to focus search
  useEffect(() => {
    const handleKey = (e) => {
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target?.tagName)) return
      if (e.key === '/' || (e.ctrlKey && e.key.toLowerCase() === 'f')) {
        e.preventDefault()
        inputRef.current?.focus()
        inputRef.current?.select()
      }
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [])

  const handleMinimize = async () => {
    if (isTauri()) {
      try {
        const { getCurrentWindow } = await import('@tauri-apps/api/window')
        await getCurrentWindow().minimize()
      } catch {}
    }
  }

  const handleToggleMaximize = async () => {
    if (isTauri()) {
      try {
        const { getCurrentWindow } = await import('@tauri-apps/api/window')
        await getCurrentWindow().toggleMaximize()
        const max = await getCurrentWindow().isMaximized()
        setIsMaximized(max)
      } catch {}
    } else {
      setIsMaximized(prev => !prev)
    }
  }

  const handleClose = async () => {
    if (isTauri()) {
      try {
        const { getCurrentWindow } = await import('@tauri-apps/api/window')
        // Close event will be intercepted by close-to-tray in Rust
        await getCurrentWindow().close()
      } catch {}
    }
  }

  const handleSearchChange = (e) => {
    const val = e.target.value
    setLocalSearch(val)
    if (onSearch) onSearch(val)
  }

  const handleSearchClear = () => {
    setLocalSearch('')
    if (onSearch) onSearch('')
    inputRef.current?.focus()
  }

  return (
    <header
      data-tauri-drag-region
      className="aether-titlebar"
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        height: 44,
        padding: '0 12px 0 16px',
        background: 'var(--bg-sidebar)',
        borderBottom: '1px solid var(--border-subtle)',
        userSelect: 'none',
        zIndex: 100,
        position: 'relative',
      }}
    >
      {/* Left Spacer / Branding alignment */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, pointerEvents: 'none' }}>
        <div style={{ width: 4, height: 16, borderRadius: 2, background: 'var(--border-strong)', opacity: 0.3 }} />
      </div>

      {/* Center: Global Search Bar */}
      <div
        style={{
          flex: 1,
          maxWidth: 480,
          margin: '0 20px',
          position: 'relative',
        }}
      >
        <div
          style={{
            position: 'relative',
            display: 'flex',
            alignItems: 'center',
            background: 'color-mix(in srgb, var(--bg-card) 75%, transparent)',
            borderRadius: 9,
            border: '1px solid var(--border-subtle)',
            boxShadow: '0 2px 8px rgba(0, 0, 0, 0.2)',
            transition: 'border-color 0.15s ease, box-shadow 0.15s ease',
          }}
        >
          <Search
            size={14}
            style={{
              marginLeft: 12,
              color: 'var(--text-muted)',
              flexShrink: 0,
              pointerEvents: 'none',
            }}
          />
          <input
            ref={inputRef}
            type="text"
            placeholder="Search wallpapers, creators, tags... (Press '/' to focus)"
            value={localSearch}
            onChange={handleSearchChange}
            style={{
              width: '100%',
              height: 32,
              padding: '0 32px 0 10px',
              background: 'transparent',
              border: 'none',
              outline: 'none',
              color: 'var(--text-main)',
              fontSize: 12,
              fontFamily: 'inherit',
            }}
          />
          {localSearch ? (
            <button
              type="button"
              onClick={handleSearchClear}
              className="btn-icon"
              style={{
                position: 'absolute',
                right: 8,
                padding: 2,
                borderRadius: 4,
                color: 'var(--text-muted)',
              }}
              title="Clear search"
            >
              <X size={12} />
            </button>
          ) : (
            <kbd
              style={{
                position: 'absolute',
                right: 10,
                fontSize: 10,
                padding: '1px 5px',
                borderRadius: 4,
                background: 'rgba(255, 255, 255, 0.08)',
                color: 'var(--text-subtle)',
                border: '1px solid var(--border-subtle)',
                pointerEvents: 'none',
                fontFamily: 'var(--font-mono)',
              }}
            >
              /
            </kbd>
          )}
        </div>
      </div>

      {/* Right: Actions, Notifications & Window Controls */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
        }}
      >
        {/* + Create Action Button */}
        <button
          type="button"
          onClick={onOpenImport}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            padding: '5px 12px',
            borderRadius: 7,
            background: 'color-mix(in srgb, var(--color-brand) 18%, transparent)',
            border: '1px solid color-mix(in srgb, var(--color-brand) 40%, transparent)',
            color: 'var(--color-brand)',
            fontSize: 12,
            fontWeight: 600,
            cursor: 'pointer',
            transition: 'all 0.15s ease',
            boxShadow: '0 0 10px rgba(6, 182, 212, 0.15)',
          }}
          onMouseEnter={e => {
            e.currentTarget.style.background = 'color-mix(in srgb, var(--color-brand) 28%, transparent)'
            e.currentTarget.style.borderColor = 'var(--color-brand)'
          }}
          onMouseLeave={e => {
            e.currentTarget.style.background = 'color-mix(in srgb, var(--color-brand) 18%, transparent)'
            e.currentTarget.style.borderColor = 'color-mix(in srgb, var(--color-brand) 40%, transparent)'
          }}
          title="Import custom video or picture wallpaper"
        >
          <Plus size={13} strokeWidth={2.5} />
          <span>Create</span>
        </button>

        {/* Notification Bell with Badge */}
        <div style={{ position: 'relative' }}>
          <button
            type="button"
            className="btn-icon"
            style={{
              width: 30,
              height: 30,
              borderRadius: 6,
              background: 'transparent',
              color: 'var(--text-muted)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
            title="Notifications (1 unread)"
          >
            <Bell size={15} />
            <span
              style={{
                position: 'absolute',
                top: 5,
                right: 5,
                width: 7,
                height: 7,
                borderRadius: '50%',
                background: '#ef4444',
                boxShadow: '0 0 6px rgba(239, 68, 68, 0.8)',
              }}
            />
          </button>
        </div>

        {/* Divider */}
        <div style={{ width: 1, height: 16, background: 'var(--border-subtle)', margin: '0 2px' }} />

        {/* Windows Caption Controls */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          <button
            type="button"
            onClick={handleMinimize}
            className="titlebar-caption-btn"
            title="Minimize"
          >
            <Minus size={13} />
          </button>

          <button
            type="button"
            onClick={handleToggleMaximize}
            className="titlebar-caption-btn"
            title={isMaximized ? 'Restore' : 'Maximize'}
          >
            <Square size={11} />
          </button>

          <button
            type="button"
            onClick={handleClose}
            className="titlebar-caption-btn titlebar-close-btn"
            title="Close to tray"
          >
            <X size={13} />
          </button>
        </div>
      </div>
    </header>
  )
}
