import React, { useState } from 'react'
import {
  Heart, MoreHorizontal, Play, Check, Eye, Pin, Pencil, Trash2,
  Video, Image as ImageIcon, Globe, Sparkles, Code
} from 'lucide-react'
import WallpaperThumbnail from '../WallpaperThumbnail/index.jsx'

export function getCardTypeInfo(wallpaper) {
  if (!wallpaper) return { label: 'Canvas 2D', color: 'var(--color-purple)', icon: Sparkles, type: 'canvas' }
  const engineId = wallpaper.engine || wallpaper.id
  const isStream = engineId === 'web-stream' || Boolean(wallpaper.config?.streamUrl)
  const isImage = engineId === 'image-player' || wallpaper.mediaType === 'image' || Boolean(wallpaper.config?.imagePath && !wallpaper.config?.videoPath)
  const isVideo = !isImage && !isStream && (wallpaper.isCustom || engineId === 'video-player' || wallpaper.mediaType === 'video')

  if (isStream) {
    const streamUrl = wallpaper.config?.streamUrl || wallpaper.config?.url || ''
    const isYt = /(?:youtu\.be\/|youtube\.com)/.test(streamUrl)
    return {
      label: isYt ? 'YouTube' : 'Web Stream',
      color: isYt ? 'var(--color-rose)' : 'var(--color-cyan)',
      icon: Globe,
      type: isYt ? 'youtube' : 'stream',
    }
  }
  if (isImage) {
    return { label: 'Picture', color: 'var(--color-emerald)', icon: ImageIcon, type: 'image' }
  }
  if (isVideo) {
    return { label: 'Video', color: 'var(--color-brand)', icon: Video, type: 'video' }
  }
  return { label: 'Canvas 2D', color: 'var(--color-purple)', icon: Sparkles, type: 'canvas' }
}

/**
 * WallpaperCard — Unified Continuous-Artwork Wallpaper Card
 * 
 * CORE PRINCIPLE: The wallpaper image IS the entire card surface.
 * Metadata, tags, and action buttons float seamlessly on top of the artwork
 * over a subtle bottom readability gradient. No separate lower panel.
 */
export default function WallpaperCard({
  wallpaper,
  isFeatured = false,
  isLive = false,
  isSelected = false,
  isLiked = false,
  isPinned = false,
  isApplying = false,
  thumbnailMode = 'hover',
  onSelect,
  onApply,
  onPreview,
  onToggleLike,
  onTogglePin,
  onRename,
  onDelete,
}) {
  const [isHovered, setIsHovered] = useState(false)
  const [isMenuOpen, setIsMenuOpen] = useState(false)

  if (!wallpaper) return null

  const typeInfo = getCardTypeInfo(wallpaper)
  const TypeIcon = typeInfo.icon

  return (
    <div
      className={`wp-overlay-card ${isFeatured ? 'featured' : ''} ${isLive ? 'is-live' : ''} ${isSelected ? 'selected' : ''}`}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => {
        setIsHovered(false)
        setIsMenuOpen(false)
      }}
      onClick={() => {
        if (onSelect) onSelect(wallpaper)
        else if (onPreview) onPreview(wallpaper)
      }}
    >
      {/* ── 1. The Wallpaper Surface (Fills 100% of the card) ───────────────── */}
      <div className="wp-overlay-thumb">
        <WallpaperThumbnail
          wallpaper={wallpaper}
          isHovered={isHovered}
          mode={thumbnailMode}
        />
      </div>

      {/* ── 2. Top-Left: Media Type Badge ───────────────────────────────────── */}
      <div className="wp-overlay-badge-tl">
        <div className="wp-glass-pill" style={{ color: typeInfo.color }}>
          <TypeIcon size={10.5} />
          <span>{typeInfo.label.toUpperCase()}</span>
        </div>
      </div>

      {/* ── 3. Top-Right: Heart & Context Menu ──────────────────────────────── */}
      <div className="wp-overlay-badge-tr" onClick={(e) => e.stopPropagation()}>
        {onToggleLike && (
          <button
            className={`wp-glass-icon-btn ${isLiked ? 'active' : ''}`}
            title={isLiked ? 'Unlike wallpaper' : 'Like wallpaper'}
            onClick={() => onToggleLike(wallpaper.id)}
            style={{ color: isLiked ? 'var(--color-rose)' : 'inherit' }}
          >
            <Heart size={12.5} fill={isLiked ? 'currentColor' : 'none'} />
          </button>
        )}

        {(onTogglePin || onRename || onDelete) && (
          <div style={{ position: 'relative' }}>
            <button
              className="wp-glass-icon-btn"
              title="More options"
              onClick={() => setIsMenuOpen(!isMenuOpen)}
            >
              <MoreHorizontal size={13} />
            </button>

            {isMenuOpen && (
              <div
                className="library-context-menu"
                style={{ top: 'calc(100% + 6px)', right: 0 }}
                onClick={(e) => e.stopPropagation()}
              >
                {onTogglePin && (
                  <button
                    className="library-context-item"
                    onClick={() => {
                      onTogglePin(wallpaper.id)
                      setIsMenuOpen(false)
                    }}
                  >
                    <Pin size={12} /> {isPinned ? 'Unpin from Home' : 'Pin to Home'}
                  </button>
                )}
                {onRename && (
                  <button
                    className="library-context-item"
                    onClick={() => {
                      onRename(wallpaper.id, wallpaper.name)
                      setIsMenuOpen(false)
                    }}
                  >
                    <Pencil size={12} /> Rename
                  </button>
                )}
                {onDelete && wallpaper.isCustom && (
                  <button
                    className="library-context-item danger"
                    onClick={() => {
                      onDelete(wallpaper.id)
                      setIsMenuOpen(false)
                    }}
                  >
                    <Trash2 size={12} /> Delete
                  </button>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── 4. Subtle Hover Action Cluster (Quietly appears on hover) ──────── */}
      <div className={`wp-overlay-hover-actions ${isHovered ? 'visible' : ''}`} onClick={(e) => e.stopPropagation()}>
        {onPreview && (
          <button
            className="wp-hover-btn-preview"
            onClick={() => onPreview(wallpaper)}
            title="Open high-definition preview"
          >
            <Play size={11} fill="currentColor" /> Preview
          </button>
        )}

        {isLive ? (
          <div className="wp-hover-btn-active">
            <Check size={12} /> Active on Desktop
          </div>
        ) : (
          <button
            className="wp-hover-btn-apply"
            onClick={() => onApply && onApply(wallpaper)}
            disabled={isApplying}
            title="Apply to Windows desktop"
          >
            <Play size={12} fill="currentColor" /> {isApplying ? 'Applying…' : 'Apply to Desktop'}
          </button>
        )}
      </div>

      {/* ── 5. Bottom Readability Scrim & Metadata Overlay ──────────────────── */}
      <div className="wp-overlay-scrim">
        <div className="wp-overlay-content">
          <div className="wp-overlay-info">
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <h3 className="wp-overlay-title" title={wallpaper.name}>
                {wallpaper.name}
              </h3>
              {isLive && (
                <span className="wp-live-indicator">
                  <span className="status-dot-live" style={{ width: 5, height: 5 }} />
                  ACTIVE
                </span>
              )}
            </div>

            <div className="wp-overlay-creator">
              {wallpaper.communityMeta?.author
                ? `by ${wallpaper.communityMeta.author}`
                : wallpaper.isCustom
                ? `Custom ${typeInfo.label}`
                : `Built-in Engine`}
            </div>

            {wallpaper.tags && wallpaper.tags.length > 0 && (
              <div className="wp-overlay-tags">
                {wallpaper.tags.slice(0, 3).map(t => (
                  <span key={t} className="wp-overlay-tag-chip">
                    #{t}
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* Floating Apply Action (Visible on normal resting state) */}
          <div className="wp-overlay-resting-action" onClick={(e) => e.stopPropagation()}>
            {isLive ? (
              <div className="wp-pill-active-resting" title="Currently running on desktop">
                <Check size={11} /> Active
              </div>
            ) : (
              <button
                className="wp-pill-apply-resting"
                onClick={() => onApply && onApply(wallpaper)}
                disabled={isApplying}
                title="Apply to desktop"
              >
                <Play size={10.5} fill="currentColor" /> {isApplying ? '…' : 'Apply'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
