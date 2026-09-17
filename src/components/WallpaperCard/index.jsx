import React, { useState } from 'react'
import {
  Heart, MoreHorizontal, Play, Check, Eye, Pin, Pencil, Trash2,
  Video, Image as ImageIcon, Globe, Sparkles
} from 'lucide-react'
import { safeConvertFileSrc } from '../../lib/wallpaperActions.js'
import WallpaperThumbnail, { videoPosterMemoryCache } from '../WallpaperThumbnail/index.jsx'

export function getCardTypeInfo(wallpaper) {
  if (!wallpaper) return { label: 'Canvas', color: 'var(--color-brand)', icon: Sparkles, type: 'canvas' }
  const engineId = wallpaper.engine || wallpaper.id
  const isStream = engineId === 'web-stream' || Boolean(wallpaper.config?.streamUrl)
  const isImage = engineId === 'image-player' || wallpaper.mediaType === 'image' || Boolean(wallpaper.config?.imagePath && !wallpaper.config?.videoPath)
  const isVideo = !isImage && !isStream && (wallpaper.isCustom || engineId === 'video-player' || wallpaper.mediaType === 'video')

  if (isStream) {
    const streamUrl = wallpaper.config?.streamUrl || wallpaper.config?.url || ''
    const isYt = /(?:youtu\.be\/|youtube\.com)/.test(streamUrl)
    return {
      label: isYt ? 'YouTube' : 'Web',
      color: isYt ? 'var(--color-rose)' : 'var(--color-cyan)',
      icon: Globe,
      type: isYt ? 'youtube' : 'stream',
    }
  }
  if (isImage) {
    return { label: 'Image', color: 'var(--color-emerald)', icon: ImageIcon, type: 'image' }
  }
  if (isVideo) {
    return { label: 'Video', color: 'var(--color-brand)', icon: Video, type: 'video' }
  }
  return { label: 'Canvas', color: 'var(--color-brand)', icon: Sparkles, type: 'canvas' }
}

/**
 * WallpaperCard — Unified Continuous-Artwork Wallpaper Card
 * 
 * CORE PRINCIPLE: The wallpaper image IS the entire card surface.
 * Metadata, tags, and action buttons float naturally on top of the artwork
 * over a subtle bottom readability gradient. No separate lower panel.
 * 
 * HOVER PRINCIPLE: Subtle. Never cover the artwork with a giant dark box
 * or two huge centered buttons. The artwork remains the hero at all times.
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
  const creatorText = wallpaper.author
    ? `by ${wallpaper.author}`
    : wallpaper.communityMeta?.author
    ? `by ${wallpaper.communityMeta.author}`
    : wallpaper.isCustom
    ? `Custom ${typeInfo.label}`
    : `by AetherFlow`

  const hasPoster = Boolean(
    wallpaper.thumbnail ||
    wallpaper.preview ||
    wallpaper.cover ||
    wallpaper.image ||
    wallpaper.config?.imagePath ||
    wallpaper.config?.youtubeId ||
    wallpaper.config?.streamUrl ||
    (wallpaper.engine && wallpaper.engine !== 'video-player') ||
    (wallpaper.id && videoPosterMemoryCache.has(wallpaper.id))
  )

  return (
    <div
      className={`wp-overlay-card ${isFeatured ? 'featured' : ''} ${isLive ? 'is-live' : ''} ${isSelected ? 'selected' : ''}`}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => {
        setIsHovered(false)
        setIsMenuOpen(false)
      }}
      onClick={() => {
        if (onPreview) onPreview(wallpaper)
        else if (onSelect) onSelect(wallpaper)
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

      {/* ── 2. Top-Left: Media Type Indicator (Small, Restrained) ───────────── */}
      <div className="wp-overlay-badge-tl">
        <div className="wp-type-indicator">
          <TypeIcon size={10} style={{ color: typeInfo.color }} />
          <span>{typeInfo.label.toUpperCase()}</span>
        </div>
      </div>

      {/* ── 3. Top-Right: Heart, Pin indicator & Context Menu ───────────────── */}
      <div className="wp-overlay-badge-tr" onClick={(e) => e.stopPropagation()}>
        {isPinned && onTogglePin && (
          <button
            className="wp-glass-icon-btn active"
            title="Pinned to Home (click to unpin)"
            onClick={() => onTogglePin(wallpaper.id)}
            style={{ color: 'var(--color-brand)' }}
          >
            <Pin size={12} />
          </button>
        )}

        {onToggleLike && (
          <button
            className={`wp-glass-icon-btn ${isLiked ? 'active' : ''}`}
            title={isLiked ? 'Unlike wallpaper' : 'Like wallpaper'}
            onClick={() => onToggleLike(wallpaper.id)}
            style={{ color: isLiked ? 'var(--color-rose)' : 'inherit' }}
          >
            <Heart size={12} fill={isLiked ? 'currentColor' : 'none'} />
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

      {/* ── 4. Bottom Readability Scrim & Metadata Overlay ──────────────────── */}
      <div className={`wp-overlay-scrim ${!hasPoster ? 'is-fallback' : ''}`}>
        <div className="wp-overlay-content">
          <div className="wp-overlay-info">
            <h3 className="wp-overlay-title" title={wallpaper.name}>
              {wallpaper.name}
            </h3>

            <div className="wp-overlay-creator">
              {creatorText}
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

          {/* Action Cluster in Bottom-Right: Preview on hover + Floating Apply */}
          <div className="wp-overlay-actions-row" onClick={(e) => e.stopPropagation()}>
            {onPreview && (
              <button
                className="wp-pill-preview"
                onClick={() => onPreview(wallpaper)}
                title="Quick preview"
              >
                <Eye size={11} /> Preview
              </button>
            )}

            {isLive ? (
              <div className="wp-live-badge" title="Currently running on desktop">
                <span className="wp-live-dot" /> Active
              </div>
            ) : (
              <button
                className="wp-pill-apply"
                onClick={() => onApply && onApply(wallpaper)}
                disabled={isApplying}
                title="Apply to desktop"
              >
                <Play size={10} fill="currentColor" /> {isApplying ? '…' : 'Apply'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
