import React, { useState } from 'react'
import {
  Heart, MoreHorizontal, Play, Check, Eye, Pin, Pencil, Trash2,
  Video, Image as ImageIcon, Globe, Sparkles, HardDrive, Cloud, DownloadCloud, ExternalLink
} from 'lucide-react'
import WallpaperThumbnail from '../WallpaperThumbnail/index.jsx'
import { openExternalUrl } from '../../lib/wallpaperActions.js'

export function getCardBadges(wallpaper) {
  if (!wallpaper) return { typeBadge: { label: 'PROCEDURAL', className: 'wp-badge-procedural' }, originBadge: { label: 'BUILT-IN', className: 'wp-badge-origin' } }

  const engineId = wallpaper.engine || wallpaper.id
  const streamUrl = wallpaper.config?.streamUrl || wallpaper.config?.url || ''
  const isYt = /(?:youtu\.be\/|youtube\.com)/.test(streamUrl)
  const isStream = engineId === 'web-stream' || Boolean(streamUrl)
  const isImage = engineId === 'image-player' || wallpaper.mediaType === 'image' || Boolean(wallpaper.config?.imagePath && !wallpaper.config?.videoPath)
  const isBuiltin = wallpaper.builtin || !wallpaper.isCustom
  const isVideo = !isImage && !isStream && (wallpaper.isCustom || engineId === 'video-player' || wallpaper.mediaType === 'video')
  const isCommunity = Boolean(wallpaper.id?.startsWith('community-') || wallpaper.communityMeta || wallpaper.remoteUrl)

  // Type Badge
  let typeBadge = { label: 'PROCEDURAL', className: 'wp-badge-procedural' }
  if (isImage) {
    typeBadge = { label: 'IMAGE', className: 'wp-badge-image' }
  } else if (isVideo || isStream) {
    typeBadge = { label: 'VIDEO', className: 'wp-badge-video' }
  }

  // Origin Badge
  let originBadge = { label: 'LOCAL', className: 'wp-badge-origin' }
  if (isYt) {
    originBadge = { label: 'YOUTUBE', className: 'wp-badge-youtube' }
  } else if (isCommunity && !wallpaper.localPath) {
    originBadge = { label: 'CLOUD', className: 'wp-badge-origin' }
  } else if (isBuiltin) {
    originBadge = { label: 'BUILT-IN', className: 'wp-badge-origin' }
  } else {
    originBadge = { label: 'LOCAL', className: 'wp-badge-origin' }
  }

  return { typeBadge, originBadge }
}

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
  onDownloadOffline,
  onFreeSpace,
}) {
  const [isHovered, setIsHovered] = useState(false)
  const [isMenuOpen, setIsMenuOpen] = useState(false)

  if (!wallpaper) return null

  const typeInfo = getCardTypeInfo(wallpaper)
  const TypeIcon = typeInfo.icon
  const isCommunity = Boolean(
    wallpaper.id?.startsWith('community-') ||
    wallpaper.communityMeta ||
    wallpaper.remoteUrl ||
    (wallpaper.tags && wallpaper.tags.includes('community'))
  )
  const isLocal = Boolean(
    wallpaper.localPath && !wallpaper.localPath.startsWith('http')
  ) || (!isCommunity && !wallpaper.config?.streamUrl)
  const authorPortfolio = wallpaper.authorPortfolio || wallpaper.communityMeta?.authorPortfolio || wallpaper.author_portfolio || ''
  const license = wallpaper.license || wallpaper.communityMeta?.license || ''

  const creatorText = wallpaper.author
    ? `by ${wallpaper.author}`
    : wallpaper.communityMeta?.author
    ? `by ${wallpaper.communityMeta.author}`
    : wallpaper.isCustom
    ? `Custom ${typeInfo.label}`
    : `by AetherFlow`

  const hasArtwork = Boolean(
    wallpaper.thumbnail ||
    wallpaper.preview ||
    wallpaper.cover ||
    wallpaper.image ||
    wallpaper.config?.imagePath ||
    wallpaper.config?.youtubeId ||
    wallpaper.config?.streamUrl ||
    (wallpaper.engine && wallpaper.engine !== 'video-player')
  )

  const badges = getCardBadges(wallpaper)

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

      {/* ── 2. Top-Left: Sovereign Dual Badges ───────────────────────────── */}
      <div className="wp-overlay-badge-tl" style={{ display: 'flex', gap: 5, alignItems: 'center' }}>
        <div className={`wp-badge-pill ${badges.typeBadge.className}`}>
          {badges.typeBadge.label}
        </div>
        <div className={`wp-badge-pill ${badges.originBadge.className}`}>
          {badges.originBadge.label}
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

        {(onTogglePin || onRename || onDelete || (isCommunity && (onDownloadOffline || onFreeSpace))) && (
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
                {isCommunity && !isLocal && onDownloadOffline && (
                  <button
                    className="library-context-item"
                    onClick={() => {
                      onDownloadOffline(wallpaper)
                      setIsMenuOpen(false)
                    }}
                  >
                    <DownloadCloud size={12} /> Download Offline
                  </button>
                )}
                {isCommunity && isLocal && onFreeSpace && (
                  <button
                    className="library-context-item"
                    onClick={() => {
                      onFreeSpace(wallpaper.id)
                      setIsMenuOpen(false)
                    }}
                    title="Remove local file from disk while keeping in Library"
                  >
                    <Cloud size={12} /> Free Up Space
                  </button>
                )}
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
      <div className={`wp-overlay-scrim ${!hasArtwork ? 'is-fallback' : ''}`}>
        <div className="wp-overlay-content">
          <div className="wp-overlay-info">
            <h3 className="wp-overlay-title" title={wallpaper.name}>
              {wallpaper.name}
            </h3>

            <div className="wp-overlay-creator" style={{ display: 'flex', alignItems: 'center', gap: 5, flexWrap: 'wrap' }}>
              {authorPortfolio ? (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation()
                    openExternalUrl(authorPortfolio)
                  }}
                  title={`Open portfolio (${authorPortfolio})`}
                  style={{
                    background: 'none', border: 'none', padding: 0,
                    color: 'var(--color-brand)', cursor: 'pointer',
                    display: 'inline-flex', alignItems: 'center', gap: 3,
                    fontSize: 'inherit', textDecoration: 'underline', textUnderlineOffset: 2
                  }}
                >
                  {creatorText} <ExternalLink size={10} />
                </button>
              ) : (
                <span>{creatorText}</span>
              )}

              {/* Blue Verified Badge */}
              <span
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: 12,
                  height: 12,
                  borderRadius: '50%',
                  background: '#38bdf8',
                  color: '#05070d',
                }}
                title="Verified Creator"
              >
                <Check size={8} strokeWidth={3} />
              </span>

              {license && (
                <span
                  className="wp-overlay-tag-chip"
                  style={{ background: 'rgba(255,255,255,0.08)', fontSize: 9.5, padding: '1px 5px' }}
                  title={license}
                >
                  {license.replace(/ 4\.0| 1\.0/g, '')}
                </span>
              )}
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

          {/* Action Cluster in Bottom-Right: Sovereign Apply Button */}
          <div className="wp-overlay-actions-row" onClick={(e) => e.stopPropagation()}>
            {isLive ? (
              <div className="wp-pill-apply-btn active" title="Currently running on desktop">
                <Check size={10} strokeWidth={2.5} />
                <span>Active</span>
              </div>
            ) : (
              <button
                type="button"
                className="wp-pill-apply-btn"
                onClick={() => onApply && onApply(wallpaper)}
                disabled={isApplying}
                title="Apply to desktop"
              >
                <Play size={10} fill="currentColor" />
                <span>{isApplying ? '…' : 'Apply'}</span>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
