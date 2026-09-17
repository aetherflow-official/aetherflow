import React, { useRef, useState, useEffect, useCallback } from 'react'
import { ENGINES } from '../../engines/index.js'
import {
  Video, Image as ImageIcon, Globe, Terminal, Sparkles,
  Waves, Compass, Flame, CloudRain, Activity, Code
} from 'lucide-react'
import { safeConvertFileSrc, tauriInvoke } from '../../lib/wallpaperActions.js'
import { useStore } from '../../store/useStore.js'
import { parseYouTubeId } from '../../engines/web-stream.js'
import { previewManager } from '../../lib/previewManager.js'

/**
 * WallpaperThumbnail — Supports Always On, On Hover, and Off modes.
 * Enforces single active preview slot via previewManager to eliminate RAM spikes.
 */

export const ENGINE_THEMES = {
  'matrix-rain': {
    icon: Terminal,
    color: '#00ff41',
    bg: 'linear-gradient(135deg, #031308 0%, #062211 100%)',
    badge: 'MATRIX',
    label: 'Matrix Rain'
  },
  'cyber-particles': {
    icon: Sparkles,
    color: '#00d4ff',
    bg: 'linear-gradient(135deg, #041424 0%, #082640 100%)',
    badge: 'PARTICLES',
    label: 'Cyber Particles'
  },
  'synthwave-grid': {
    icon: Waves,
    color: '#ff2d78',
    bg: 'linear-gradient(135deg, #1d051c 0%, #36072f 100%)',
    badge: 'SYNTHWAVE',
    label: 'Synthwave Grid'
  },
  'deep-space': {
    icon: Compass,
    color: '#a855f7',
    bg: 'linear-gradient(135deg, #0e0622 0%, #1c0e3a 100%)',
    badge: 'COSMOS',
    label: 'Deep Space'
  },
  'tokyo-rain': {
    icon: CloudRain,
    color: '#ec4899',
    bg: 'linear-gradient(135deg, #180918 0%, #2b0e27 100%)',
    badge: 'TOKYO',
    label: 'Tokyo Rain'
  },
  'aurora': {
    icon: Flame,
    color: '#10b981',
    bg: 'linear-gradient(135deg, #031416 0%, #062725 100%)',
    badge: 'AURORA',
    label: 'Aurora Borealis'
  },
  'audio-spectrum': {
    icon: Activity,
    color: '#f59e0b',
    bg: 'linear-gradient(135deg, #181003 0%, #301f05 100%)',
    badge: 'SPECTRUM',
    label: 'Audio Spectrum'
  },
  'web-stream': {
    icon: Globe,
    color: '#ef4444',
    bg: 'linear-gradient(135deg, #1b0808 0%, #301010 100%)',
    badge: 'STREAM',
    label: 'Web Stream'
  },
  'video-player': {
    icon: Video,
    color: '#3b82f6',
    bg: 'linear-gradient(135deg, #07101f 0%, #0c1e3a 100%)',
    badge: 'VIDEO',
    label: 'Video Wallpaper'
  },
  'image-player': {
    icon: ImageIcon,
    color: '#10b981',
    bg: 'linear-gradient(135deg, #061510 0%, #0b261d 100%)',
    badge: 'IMAGE',
    label: 'Picture Wallpaper'
  },
}

/**
 * Extracts a 11-char YouTube ID from any YouTube URL format with auto-healing.
 */
export function extractYouTubeId(url) {
  const id = parseYouTubeId(url)
  if (id === 'jfKfPfyJRdk') return 'TURbeWK2wwg'
  if (id === '1zxD9O4b1oY') return 'uD4izuDMUQA'
  if (id === '7uK_Z2Q2R2E') return '21qNxnCS8WU'
  if (id === 'aXYKRAdrfEo') return 'eZe4Q_58UTU'
  if (id === 'nz1cEO01LzE') return 'WJ3-F02-F_Y'
  return id
}

/**
 * Resolves the best available static thumbnail URL for any wallpaper.
 */
export function resolveWallpaperThumbnail(wallpaper) {
  if (!wallpaper) return null

  // 1. Explicit preview or thumbnail image URL
  const explicitPreview = wallpaper.preview || wallpaper.thumbnail
  if (explicitPreview && typeof explicitPreview === 'string' && explicitPreview.trim()) {
    const trimmed = explicitPreview.trim()
    if (trimmed.startsWith('http://') || trimmed.startsWith('https://') || trimmed.startsWith('data:') || trimmed.startsWith('/')) {
      return trimmed
    }
    return safeConvertFileSrc(trimmed)
  }

  // 2. YouTube ID from config
  const streamUrl = wallpaper.config?.streamUrl || wallpaper.config?.url || ''
  const ytId = wallpaper.config?.youtubeId || extractYouTubeId(streamUrl)
  if (ytId) {
    return `https://img.youtube.com/vi/${ytId}/hqdefault.jpg`
  }

  // 3. Picture Wallpaper imagePath
  const imgPath = wallpaper.config?.imagePath || (wallpaper.engine === 'image-player' ? wallpaper.config?.url : '')
  if (imgPath && typeof imgPath === 'string' && imgPath.trim()) {
    const trimmed = imgPath.trim()
    if (trimmed.startsWith('http://') || trimmed.startsWith('https://') || trimmed.startsWith('data:')) {
      return trimmed
    }
    return safeConvertFileSrc(trimmed)
  }

  // 4. Built-in Canvas Engine SVGs
  const engineId = wallpaper.engine || wallpaper.id
  const builtinPreviews = {
    'matrix-rain': '/previews/matrix-rain.svg',
    'cyber-particles': '/previews/cyber-particles.svg',
    'synthwave-grid': '/previews/synthwave-grid.svg',
    'deep-space': '/previews/deep-space.svg',
    'aurora': '/previews/aurora.svg',
    'tokyo-rain': '/previews/tokyo-rain.svg',
    'audio-spectrum': '/previews/audio-spectrum.svg',
    'fps-meter': '/previews/fps-meter.svg',
  }
  if (builtinPreviews[engineId]) {
    return builtinPreviews[engineId]
  }

  return null
}

/**
 * VideoPosterFrame — Single-slot video preview renderer managed by previewManager.
 * Enforces strict hardware decoder cleanup on unmount or pause.
 */
function VideoPosterFrame({ videoSrc, isHovered }) {
  const [hasLoaded, setHasLoaded] = useState(false)
  const videoRef = useRef(null)

  useEffect(() => {
    const v = videoRef.current
    if (v) {
      previewManager.registerVideoElement(v)
    }
    return () => {
      if (v) {
        try {
          v.pause()
          v.removeAttribute('src')
          v.load()
        } catch (e) {}
        previewManager.unregisterVideoElement(v)
      }
    }
  }, [])

  useEffect(() => {
    const v = videoRef.current
    if (!v) return
    if (isHovered) {
      v.play().catch(() => {})
    } else {
      v.pause()
    }
  }, [isHovered])

  return (
    <video
      ref={(el) => {
        videoRef.current = el
      }}
      src={videoSrc}
      preload="auto"
      muted
      loop
      playsInline
      onLoadedData={() => setHasLoaded(true)}
      onCanPlay={() => {
        setHasLoaded(true)
        if (isHovered && videoRef.current) {
          videoRef.current.play().catch(() => {})
        }
      }}
      onError={() => {
        if (videoRef.current) {
          try {
            videoRef.current.pause()
            videoRef.current.removeAttribute('src')
            videoRef.current.load()
          } catch (e) {}
        }
      }}
      style={{
        position: 'absolute',
        inset: 0,
        width: '100%',
        height: '100%',
        objectFit: 'cover',
        display: 'block',
        zIndex: 2,
        opacity: hasLoaded ? 1 : 0,
        transition: 'opacity 0.25s ease',
      }}
    />
  )
}

export default function WallpaperThumbnail({ wallpaper, isHovered = false, mode }) {
  const storeThumbnailMode = useStore(s => s.thumbnailMode) || 'hover'
  const currentMode = mode || storeThumbnailMode // 'always' | 'hover' | 'off'

  const engineId = wallpaper.engine || wallpaper.id
  const descriptor = ENGINES[engineId]

  const imgPath = wallpaper.config?.imagePath || wallpaper.defaultConfig?.imagePath || ''
  const isImage = engineId === 'image-player' || 
                  wallpaper.mediaType === 'image' || 
                  Boolean(imgPath && !wallpaper.config?.videoPath) ||
                  Boolean(wallpaper.tags && wallpaper.tags.includes('image'))

  const streamUrl = wallpaper.config?.streamUrl || wallpaper.config?.url || ''
  const ytId = wallpaper.config?.youtubeId || extractYouTubeId(streamUrl)
  const isStream = engineId === 'web-stream' ||
                   wallpaper.mediaType === 'stream' ||
                   Boolean(streamUrl) ||
                   Boolean(ytId)

  const isVideo = !isImage && !isStream && (wallpaper.isCustom || engineId === 'video-player' || wallpaper.mediaType === 'video')

  const [activePreview, setActivePreview] = useState(previewManager.getState())
  const [imgLoadError, setImgLoadError] = useState(false)
  const [isInView, setIsInView] = useState(false)
  const containerRef = useRef(null)

  // Subscribe to previewManager singleton
  useEffect(() => {
    return previewManager.subscribe(setActivePreview)
  }, [])

  const isThisPreviewActive = activePreview.activeId === wallpaper.id

  // Viewport lazy loader for 'always' mode
  useEffect(() => {
    if (currentMode !== 'always') {
      setIsInView(false)
      return
    }

    const el = containerRef.current
    if (!el) return

    if (typeof IntersectionObserver === 'undefined') {
      setIsInView(true)
      return
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        setIsInView(entry.isIntersecting)
      },
      {
        root: null,
        rootMargin: '140px 0px',
        threshold: 0.01,
      }
    )

    observer.observe(el)
    return () => {
      observer.disconnect()
    }
  }, [currentMode])

  // Single-player hover management: request preview on hover, cancel on leave
  useEffect(() => {
    if (currentMode !== 'hover') return

    if (isHovered && isVideo) {
      const videoPath = wallpaper.config?.videoPath || wallpaper.defaultConfig?.videoPath || ''
      const videoSrc = videoPath
        ? (videoPath.startsWith('http') || videoPath.startsWith('data:') ? videoPath : safeConvertFileSrc(videoPath))
        : ''
      if (videoSrc) {
        previewManager.requestPreview(wallpaper.id, videoSrc, 'video')
      }
    } else {
      if (activePreview.activeId === wallpaper.id || previewManager.pendingId === wallpaper.id) {
        previewManager.cancelPreview(wallpaper.id)
      }
    }

    return () => {
      previewManager.cancelPreview(wallpaper.id)
    }
  }, [isHovered, isVideo, currentMode, wallpaper.id, wallpaper.config, activePreview.activeId])

  // Resolve Theme & Badges
  let theme = null
  const isYouTube = Boolean(ytId)

  if (isStream) {
    theme = ENGINE_THEMES['web-stream']
  } else if (isImage) {
    theme = ENGINE_THEMES['image-player']
  } else if (isVideo) {
    theme = ENGINE_THEMES['video-player']
  } else {
    theme = ENGINE_THEMES[engineId] || {
      icon: Code,
      color: 'var(--color-brand)',
      bg: 'linear-gradient(135deg, #0b0f19 0%, #151d2f 100%)',
      badge: 'CANVAS',
      label: wallpaper.name || 'Live Engine'
    }
  }

  const IconComponent = theme.icon || Sparkles
  const accentColor = isYouTube ? '#ef4444' : theme.color
  const badgeText = isYouTube ? 'YOUTUBE' : theme.badge

  // Resolve static thumbnail (works for images, streams, YouTube, canvas SVGs, community wallpapers)
  const staticThumbUrl = resolveWallpaperThumbnail(wallpaper)

  // Compute media preview based on thumbnailMode:
  // - Static image thumbnail is ALWAYS rendered as baseline (zero decoders)
  // - Video preview ONLY mounts if previewManager granted this card the single active preview slot
  let previewMedia = null

  if (currentMode !== 'off' && !imgLoadError) {
    if (staticThumbUrl) {
      previewMedia = (
        <img
          src={staticThumbUrl}
          alt={wallpaper.name}
          onError={() => setImgLoadError(true)}
          style={{
            position: 'absolute',
            inset: 0,
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            display: 'block',
            zIndex: 1,
            animation: 'fadeIn 0.2s ease forwards',
          }}
        />
      )
    }

    // Overlay single active video preview when granted
    if (isVideo && isThisPreviewActive && activePreview.activeSrc) {
      previewMedia = (
        <>
          {previewMedia}
          <VideoPosterFrame
            videoSrc={activePreview.activeSrc}
            isHovered={isHovered}
          />
        </>
      )
    }
  }

  return (
    <div
      ref={containerRef}
      style={{
        width: '100%',
        height: '100%',
        position: 'relative',
        background: theme.bg,
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        transition: 'transform 0.25s ease, filter 0.25s ease',
        transform: isHovered ? 'scale(1.02)' : 'scale(1)',
      }}
    >
      {/* Base Zero-RAM Vector Badge (Always rendered as backdrop & fallback) */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background: `radial-gradient(circle at 50% 45%, ${accentColor}18 0%, transparent 70%)`,
          pointerEvents: 'none',
        }}
      />

      {/* Center Icon Badge */}
      <div
        style={{
          width: 46,
          height: 46,
          borderRadius: 13,
          background: `${accentColor}15`,
          border: `1px solid ${accentColor}35`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          boxShadow: `0 4px 16px ${accentColor}1a`,
          marginBottom: 8,
          zIndex: 0,
          transition: 'transform 0.25s ease',
          transform: isHovered ? 'scale(1.08)' : 'scale(1)',
        }}
      >
        <IconComponent size={23} style={{ color: accentColor, opacity: 0.95 }} />
      </div>

      {/* Type Subtitle */}
      <span
        style={{
          fontSize: 10.5,
          fontWeight: 600,
          letterSpacing: 0.8,
          textTransform: 'uppercase',
          color: 'var(--text-muted)',
          zIndex: 0,
          maxWidth: '85%',
          textAlign: 'center',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
      >
        {isYouTube ? 'YouTube Loop' : theme.label}
      </span>

      {/* Dynamic Preview Media Layer (Static image, YouTube thumb, or clean VideoPosterFrame) */}
      {previewMedia}

      {/* Persistent Pill Badge Overlay */}
      <div
        style={{
          position: 'absolute',
          bottom: 8,
          left: 8,
          background: 'rgba(5, 7, 12, 0.85)',
          backdropFilter: 'blur(6px)',
          borderRadius: 4,
          padding: '2px 7px',
          fontSize: 9.5,
          fontWeight: 700,
          letterSpacing: 0.5,
          color: accentColor,
          border: `1px solid ${accentColor}35`,
          display: 'flex',
          alignItems: 'center',
          gap: 5,
          zIndex: 3,
        }}
      >
        <span
          style={{
            width: 5,
            height: 5,
            borderRadius: '50%',
            background: accentColor,
            boxShadow: `0 0 6px ${accentColor}`,
          }}
        />
        {badgeText}
      </div>
    </div>
  )
}
