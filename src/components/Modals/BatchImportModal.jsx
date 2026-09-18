import React, { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { X, Check, FolderUp, HardDrive, Link, Pin, ListPlus, Loader2, Sparkles } from 'lucide-react'
import { batchImportMediaFiles } from '../../lib/storageManager.js'
import { useStore } from '../../store/useStore.js'
import { syncPlaylistTimersToRust } from '../../lib/playlistManager.js'

export function BatchImportModal({ isOpen, filePaths = [], onClose, onSuccess }) {
  const storeStorageMode = useStore(s => s.storageMode) || 'hybrid'
  const storeThresholdMb = useStore(s => s.storageThresholdMb) || 50
  const createPlaylist = useStore(s => s.createPlaylist)

  const [storageMode, setStorageMode] = useState('hybrid')
  const [pinToHome, setPinToHome] = useState(true)
  const [makePlaylist, setMakePlaylist] = useState(false)
  const [playlistName, setPlaylistName] = useState('')

  const [isProcessing, setIsProcessing] = useState(false)
  const [progress, setProgress] = useState({ current: 0, total: 0, currentName: '' })
  const [summary, setSummary] = useState(null) // { total, copied, referenced, playlistCreated }

  useEffect(() => {
    if (isOpen) {
      setStorageMode(storeStorageMode)
      setPinToHome(true)
      setMakePlaylist(false)
      const dateStr = new Date().toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
      setPlaylistName(`Imported Pack (${dateStr})`)
      setIsProcessing(false)
      setProgress({ current: 0, total: filePaths.length, currentName: '' })
      setSummary(null)
    }
  }, [isOpen, filePaths, storeStorageMode])

  if (!isOpen || !filePaths || filePaths.length === 0) return null

  const handleStartImport = async () => {
    setIsProcessing(true)
    setProgress({ current: 0, total: filePaths.length, currentName: 'Analyzing files...' })

    try {
      const importedWallpapers = await batchImportMediaFiles(filePaths, {
        storageMode,
        copyThresholdMb: storeThresholdMb,
        pinToHome,
        onProgress: (current, total, item) => {
          setProgress({ current, total, currentName: item?.name || '' })
        }
      })

      let playlistCreated = false
      if (makePlaylist && playlistName.trim() && importedWallpapers.length > 0) {
        createPlaylist(playlistName.trim(), {
          wallpaperIds: importedWallpapers.map(w => w.id),
          order: 'shuffle',
          intervalMins: 15,
        })
        syncPlaylistTimersToRust()
        playlistCreated = true
      }

      const copied = importedWallpapers.filter(w => w.storageType === 'copy').length
      const referenced = importedWallpapers.filter(w => w.storageType === 'reference').length

      setSummary({
        total: importedWallpapers.length,
        copied,
        referenced,
        playlistCreated,
      })

      if (onSuccess) {
        onSuccess(importedWallpapers)
      }
    } catch (err) {
      console.error('[BatchImportModal] Import failed:', err)
    } finally {
      setIsProcessing(false)
    }
  }

  const percent = progress.total > 0 ? Math.round((progress.current / progress.total) * 100) : 0

  return createPortal(
    <div style={{
      position: 'fixed',
      inset: 0,
      background: 'rgba(0, 0, 0, 0.78)',
      backdropFilter: 'blur(10px)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 9999,
      padding: 16,
    }}>
      <div className="card animate-fadeIn" style={{
        width: '100%',
        maxWidth: 520,
        padding: 24,
        background: 'var(--bg-card)',
        border: '1px solid var(--border-main)',
        borderRadius: 14,
        boxShadow: '0 20px 50px rgba(0,0,0,0.7), 0 0 0 1px rgba(255,255,255,0.06)',
      }}>
        {/* Header */}
        <div className="flex items-center justify-between" style={{ marginBottom: 18, borderBottom: '1px solid var(--border-subtle)', paddingBottom: 12 }}>
          <div className="flex items-center gap-2.5">
            <div style={{
              width: 34,
              height: 34,
              borderRadius: 8,
              background: 'rgba(var(--rgb-brand), 0.15)',
              border: '1px solid var(--border-accent)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--color-brand)',
            }}>
              <FolderUp size={18} />
            </div>
            <div>
              <h3 className="font-semibold text-base" style={{ margin: 0, color: 'var(--text-main)' }}>
                Batch Wallpaper Import
              </h3>
              <p className="text-xs text-muted" style={{ margin: 0 }}>
                {filePaths.length} items selected for ingestion
              </p>
            </div>
          </div>
          {!isProcessing && (
            <button className="btn-icon" onClick={onClose}><X size={15} /></button>
          )}
        </div>

        {/* Completion Summary State */}
        {summary ? (
          <div>
            <div style={{
              padding: '16px 20px',
              borderRadius: 10,
              background: 'rgba(16, 185, 129, 0.08)',
              border: '1px solid rgba(16, 185, 129, 0.25)',
              marginBottom: 20,
              display: 'flex',
              alignItems: 'center',
              gap: 12,
            }}>
              <div style={{
                width: 32,
                height: 32,
                borderRadius: '50%',
                background: 'rgba(16, 185, 129, 0.2)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#10b981',
                flexShrink: 0,
              }}>
                <Check size={18} />
              </div>
              <div>
                <div className="text-sm font-semibold" style={{ color: 'var(--text-main)' }}>
                  Successfully Imported {summary.total} Wallpapers!
                </div>
                <div className="text-xs text-muted" style={{ marginTop: 2 }}>
                  {summary.copied} copied to library • {summary.referenced} linked in-place
                  {summary.playlistCreated ? ` • Added to "${playlistName}"` : ''}
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-2">
              <button className="btn btn-primary" onClick={onClose} style={{ minWidth: 120 }}>
                <Check size={14} /> Done
              </button>
            </div>
          </div>
        ) : isProcessing ? (
          /* Processing Progress State */
          <div>
            <div style={{ marginBottom: 16 }}>
              <div className="flex items-center justify-between text-xs font-semibold" style={{ marginBottom: 6 }}>
                <span className="text-muted">Importing media...</span>
                <span className="text-brand">{progress.current} of {progress.total} ({percent}%)</span>
              </div>
              <div style={{
                width: '100%',
                height: 8,
                background: 'rgba(255,255,255,0.06)',
                borderRadius: 999,
                overflow: 'hidden',
              }}>
                <div style={{
                  width: `${percent}%`,
                  height: '100%',
                  background: 'var(--color-brand)',
                  borderRadius: 999,
                  transition: 'width 0.2s ease',
                  boxShadow: '0 0 12px var(--color-brand)',
                }} />
              </div>
              <div className="text-xs text-muted truncate" style={{ marginTop: 8 }}>
                Processing: <span className="font-mono text-main">{progress.currentName || 'Preparing...'}</span>
              </div>
            </div>

            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '10px 14px',
              borderRadius: 8,
              background: 'rgba(0,0,0,0.25)',
              border: '1px solid var(--border-subtle)',
              fontSize: 12,
              color: 'var(--text-muted)',
              marginBottom: 16,
            }}>
              <Loader2 size={14} className="animate-spin text-brand" />
              <span>Copying files & generating video poster frames in background...</span>
            </div>
          </div>
        ) : (
          /* Pre-Import Configuration State */
          <div>
            {/* Storage Strategy Option */}
            <div style={{ marginBottom: 18 }}>
              <label className="text-xs font-semibold text-muted uppercase tracking-wider" style={{ display: 'block', marginBottom: 8 }}>
                Storage Strategy
              </label>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                <button
                  type="button"
                  onClick={() => setStorageMode('hybrid')}
                  style={{
                    padding: '10px 12px',
                    borderRadius: 8,
                    border: storageMode === 'hybrid' ? '1px solid var(--color-brand)' : '1px solid var(--border-main)',
                    background: storageMode === 'hybrid' ? 'rgba(var(--rgb-brand), 0.12)' : 'rgba(0,0,0,0.2)',
                    textAlign: 'left',
                    cursor: 'pointer',
                  }}
                >
                  <div className="flex items-center gap-1.5 text-xs font-semibold" style={{ color: storageMode === 'hybrid' ? 'var(--color-brand)' : 'var(--text-main)' }}>
                    <Sparkles size={13} /> Smart Hybrid (Recommended)
                  </div>
                  <div className="text-xs text-muted" style={{ marginTop: 4, fontSize: 11, lineHeight: 1.3 }}>
                    Copies &lt; {storeThresholdMb}MB; links large 4K files in-place to save disk
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => setStorageMode('always-copy')}
                  style={{
                    padding: '10px 12px',
                    borderRadius: 8,
                    border: storageMode === 'always-copy' ? '1px solid var(--color-brand)' : '1px solid var(--border-main)',
                    background: storageMode === 'always-copy' ? 'rgba(var(--rgb-brand), 0.12)' : 'rgba(0,0,0,0.2)',
                    textAlign: 'left',
                    cursor: 'pointer',
                  }}
                >
                  <div className="flex items-center gap-1.5 text-xs font-semibold" style={{ color: storageMode === 'always-copy' ? 'var(--color-brand)' : 'var(--text-main)' }}>
                    <HardDrive size={13} /> Full Library Copy
                  </div>
                  <div className="text-xs text-muted" style={{ marginTop: 4, fontSize: 11, lineHeight: 1.3 }}>
                    Copies 100% of files to AppData (self-contained, uses more space)
                  </div>
                </button>
              </div>
            </div>

            {/* Create Playlist Checkbox & Field */}
            <div style={{
              padding: '12px 14px',
              borderRadius: 8,
              background: 'rgba(0,0,0,0.2)',
              border: '1px solid var(--border-subtle)',
              marginBottom: 16,
            }}>
              <div className="flex items-center justify-between" style={{ cursor: 'pointer' }} onClick={() => setMakePlaylist(!makePlaylist)}>
                <div className="flex items-center gap-2">
                  <ListPlus size={15} className="text-brand" />
                  <div>
                    <div className="text-xs font-semibold" style={{ color: 'var(--text-main)' }}>
                      Automatically Create New Playlist
                    </div>
                    <div className="text-xs text-muted">
                      Add all {filePaths.length} wallpapers into a rotating playlist
                    </div>
                  </div>
                </div>
                <label className="toggle" style={{ pointerEvents: 'none' }}>
                  <input type="checkbox" checked={makePlaylist} readOnly />
                  <div className="toggle-track" />
                  <div className="toggle-thumb" />
                </label>
              </div>

              {makePlaylist && (
                <div style={{ marginTop: 12 }}>
                  <input
                    type="text"
                    className="w-full"
                    placeholder="Playlist name"
                    value={playlistName}
                    onChange={e => setPlaylistName(e.target.value)}
                    style={{
                      padding: '8px 12px',
                      background: 'rgba(0,0,0,0.4)',
                      border: '1px solid var(--border-main)',
                      borderRadius: 6,
                      color: 'var(--text-main)',
                      fontSize: 12,
                      outline: 'none',
                    }}
                  />
                </div>
              )}
            </div>

            {/* Pin to Home Option */}
            <div className="flex items-center justify-between" style={{ marginBottom: 24, padding: '6px 0' }}>
              <div>
                <div className="text-xs font-medium flex items-center gap-1.5" style={{ color: 'var(--text-main)' }}>
                  <Pin size={12} className="text-brand" /> Pin All to Home Screen
                </div>
                <div className="text-xs text-muted">Make items immediately accessible on your Home dashboard</div>
              </div>
              <label className="toggle" style={{ cursor: 'pointer' }}>
                <input type="checkbox" checked={pinToHome} onChange={e => setPinToHome(e.target.checked)} />
                <div className="toggle-track" />
                <div className="toggle-thumb" />
              </label>
            </div>

            {/* Action Buttons */}
            <div className="flex justify-end gap-2">
              <button type="button" className="btn btn-ghost" onClick={onClose}>
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-primary"
                onClick={handleStartImport}
                disabled={makePlaylist && !playlistName.trim()}
              >
                <FolderUp size={14} /> Import All ({filePaths.length})
              </button>
            </div>
          </div>
        )}
      </div>
    </div>,
    document.body
  )
}
