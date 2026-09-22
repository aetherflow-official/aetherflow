import React, { useRef, useState, useEffect, useCallback } from 'react'
import { ENGINES } from '../../engines/index.js'
import {
  Video, Image as ImageIcon, Globe, Terminal, Sparkles,
  Waves, Compass, Flame, CloudRain, Activity, Code
} from 'lucide-react'
import { safeConvertFileSrc, tauriInvoke, getOrCreateMediaThumbnail } from '../../lib/wallpaperActions.js'
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
    bg: 'linear-gradient(135deg, #0b1528 0%, #102447 50%, #162b55 100%)',
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
export function resolveWallpaperThumbnail(wallpaper, skipThumbnail = false) {
  if (!wallpaper) return null

  // 1. Explicit preview, thumbnail, poster, or artwork URL/path across all supported data shapes
  if (!skipThumbnail) {
    const explicitCandidate =
      wallpaper.preview ||
      wallpaper.thumbnail ||
      wallpaper.poster ||
      wallpaper.posterPath ||
      wallpaper.thumbnailPath ||
      wallpaper.previewUrl ||
      wallpaper.thumbnailUrl ||
      wallpaper.cover ||
      wallpaper.coverUrl ||
      wallpaper.coverPath ||
      wallpaper.image ||
      wallpaper.imageUrl ||
      wallpaper.config?.preview ||
      wallpaper.config?.thumbnail ||
      wallpaper.config?.poster ||
      wallpaper.config?.posterPath ||
      wallpaper.config?.thumbnailPath ||
      wallpaper.config?.previewUrl ||
      wallpaper.config?.thumbnailUrl ||
      wallpaper.config?.cover ||
      wallpaper.config?.coverUrl ||
      wallpaper.config?.coverPath ||
      wallpaper.config?.image ||
      wallpaper.defaultConfig?.preview ||
      wallpaper.defaultConfig?.thumbnail ||
      wallpaper.defaultConfig?.poster ||
      wallpaper.defaultConfig?.posterPath ||
      wallpaper.defaultConfig?.cover ||
      wallpaper.communityMeta?.preview ||
      wallpaper.communityMeta?.thumbnail ||
      wallpaper.communityMeta?.poster ||
      wallpaper.communityMeta?.cover ||
      (typeof wallpaper.communityMeta?.source === 'string' && /\.(png|jpe?g|webp|bmp|gif|svg)$/i.test(wallpaper.communityMeta.source) ? wallpaper.communityMeta.source : null)

    if (explicitCandidate) {
      let candidateStr = ''
      if (typeof explicitCandidate === 'string') {
        candidateStr = explicitCandidate.trim()
      } else if (typeof explicitCandidate === 'object' && explicitCandidate !== null) {
        candidateStr = (explicitCandidate.url || explicitCandidate.src || explicitCandidate.path || '').trim()
      }

      if (candidateStr) {
        if (
          candidateStr.startsWith('http://') ||
          candidateStr.startsWith('https://') ||
          candidateStr.startsWith('data:') ||
          candidateStr.startsWith('blob:') ||
          candidateStr.startsWith('/')
        ) {
          return candidateStr
        }
        return safeConvertFileSrc(candidateStr)
      }
    }
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
    if (trimmed.startsWith('http://') || trimmed.startsWith('https://') || trimmed.startsWith('data:') || trimmed.startsWith('blob:') || trimmed.startsWith('/')) {
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
 * VideoPosterFrame — Clean video preview renderer.
 * Handles live hover playback with previewManager registration.
 * Enforces strict hardware decoder cleanup on unmount.
 * Smoothly fades in once frame data is ready (eliminates black flash).
 */
function VideoPosterFrame({ videoSrc }) {
  const [hasLoaded, setHasLoaded] = useState(false)
  const videoRef = useRef(null)

  useEffect(() => {
    const v = videoRef.current
    if (!v) return
    previewManager.registerVideoElement(v)
    v.play().catch(() => {})
  }, [])

  useEffect(() => {
    return () => {
      const v = videoRef.current
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
        if (videoRef.current) {
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
        transition: 'opacity 0.22s ease',
        pointerEvents: 'none',
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
  const urlOrPath = wallpaper.remoteUrl || wallpaper.localPath || wallpaper.source || imgPath || ''
  const hasImageExt = /\.(png|jpg|jpeg|webp|bmp|gif|avif)$/i.test(urlOrPath) || urlOrPath.includes('images.unsplash.com') || ['image', 'jpg', 'jpeg', 'png', 'webp', 'avif'].includes(String(wallpaper.communityMeta?.mediaFormat || '').toLowerCase())
  const isImage = engineId === 'image-player' || 
                  wallpaper.mediaType === 'image' || 
                  wallpaper.type === 'image' ||
                  hasImageExt ||
                  Boolean(imgPath && !wallpaper.config?.videoPath) ||
                  Boolean(wallpaper.tags && wallpaper.tags.includes('image'))

  const streamUrl = wallpaper.config?.streamUrl || wallpaper.config?.url || ''
  const ytId = wallpaper.config?.youtubeId || extractYouTubeId(streamUrl)
  const isStream = engineId === 'web-stream' ||
                   wallpaper.mediaType === 'stream' ||
                   Boolean(streamUrl) ||
                   Boolean(ytId)

  const isVideo = !isImage && !isStream && (wallpaper.isCustom || engineId === 'video-player' || wallpaper.mediaType === 'video')

  const rawVideoPath = isVideo
    ? (wallpaper.config?.videoPath ||
       wallpaper.videoPath ||
       wallpaper.source ||
       wallpaper.path ||
       wallpaper.config?.path ||
       wallpaper.config?.url ||
       wallpaper.defaultConfig?.videoPath ||
       '')
    : ''
  const videoSrc = rawVideoPath
    ? (rawVideoPath.startsWith('http') || rawVideoPath.startsWith('data:') ? rawVideoPath : safeConvertFileSrc(rawVideoPath))
    : ''

  const [activePreview, setActivePreview] = useState(previewManager.getState())
  const [imgLoadError, setImgLoadError] = useState(false)
  const [thumbFailed, setThumbFailed] = useState(false)
  const [generatedThumb, setGeneratedThumb] = useState(null)
  const containerRef = useRef(null)

  // Reset errors whenever wallpaper identity changes
  useEffect(() => {
    setImgLoadError(false)
    setThumbFailed(false)
    setGeneratedThumb(null)
  }, [wallpaper?.id, wallpaper?.thumbnail])

  // On-demand thumbnail generation for local images missing a thumbnail
  useEffect(() => {
    let isCancelled = false
    const isLocalImage = isImage && imgPath && !imgPath.startsWith('http') && !imgPath.startsWith('data:')
    const hasThumb = Boolean(wallpaper?.thumbnail || generatedThumb)

    if (isLocalImage && !hasThumb && wallpaper?.id) {
      getOrCreateMediaThumbnail(wallpaper.id, imgPath, 'image')
        .then(thumbPath => {
          if (!isCancelled && thumbPath) {
            setGeneratedThumb(thumbPath)
          }
        })
        .catch(err => {
          console.warn(`[WallpaperThumbnail] On-demand thumbnail failed for ${wallpaper.id}:`, err)
        })
    }

    return () => {
      isCancelled = true
    }
  }, [isImage, wallpaper?.id, wallpaper?.thumbnail, generatedThumb, imgPath])

  // Subscribe to previewManager singleton
  useEffect(() => {
    return previewManager.subscribe(setActivePreview)
  }, [])

  const isThisPreviewActive = activePreview.activeId === wallpaper.id

  // Single-player hover management: request preview on hover, cancel on leave
  useEffect(() => {
    // If preview mode is off, hover never triggers decoders or live previews
    if (currentMode === 'off') return

    if (isHovered && isVideo) {
      if (videoSrc) {
        previewManager.requestPreview(wallpaper.id, videoSrc, 'video')
      }
    } else {
      previewManager.cancelPreview(wallpaper.id)
    }

    return () => {
      previewManager.cancelPreview(wallpaper.id)
    }
  }, [isHovered, isVideo, currentMode, wallpaper.id, videoSrc])

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

  // Determine static thumbnail URL to display:
  // Priority 1: dedicated thumbnail (wallpaper.thumbnail or on-demand generatedThumb)
  // Priority 2: fallback to resolveWallpaperThumbnail (original source image or remote stream/SVG)
  const effectiveThumbnail = (!thumbFailed && (wallpaper?.thumbnail || generatedThumb))
    ? (wallpaper?.thumbnail || generatedThumb)
    : null

  // If a dedicated thumbnail exists, use it. Otherwise fall back to resolveWallpaperThumbnail (original source image or remote stream/SVG)
  const staticThumbUrl = effectiveThumbnail
    ? safeConvertFileSrc(effectiveThumbnail)
    : resolveWallpaperThumbnail(wallpaper, thumbFailed)

  const handleImageError = () => {
    if (effectiveThumbnail && !thumbFailed) {
      // Downsampled thumbnail failed to decode; gracefully fall back to original image
      console.warn(`[WallpaperThumbnail] Thumbnail decode failed for ${wallpaper?.id} (${effectiveThumbnail}), falling back to source asset`)
      setThumbFailed(true)
    } else {
      // Original asset also failed (e.g. file deleted from disk)
      console.warn(`[WallpaperThumbnail] Image load failed permanently for ${wallpaper?.id}`)
      setImgLoadError(true)
    }
  }

  // STATIC THUMBNAIL: Visible at rest whenever genuine artwork/thumbnail exists (lightweight <img>, zero video decoders)
  let staticMedia = null
  if (staticThumbUrl && !imgLoadError) {
    staticMedia = (
      <img
        src={staticThumbUrl}
        alt={wallpaper.name}
        loading="lazy"
        decoding="async"
        width="320"
        height="180"
        onError={handleImageError}
        style={{
          position: 'absolute',
          inset: 0,
          width: '100%',
          height: '100%',
          objectFit: 'cover',
          display: 'block',
          zIndex: 1,
          animation: 'fadeIn 0.22s ease forwards',
        }}
      />
    )
  }

  // LIVE PREVIEW: Only active when hover requested and PreviewManager grants the single preview slot
  const isPreviewActive = currentMode !== 'off' && isVideo && isThisPreviewActive && Boolean(activePreview.activeSrc) && isHovered

  let videoMedia = null
  if (isPreviewActive && videoSrc) {
    videoMedia = (
      <VideoPosterFrame
        videoSrc={videoSrc}
      />
    )
  }

  const previewMedia = (staticMedia || videoMedia) ? (
    <>
      {staticMedia}
      {videoMedia}
    </>
  ) : null

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
          background: `radial-gradient(circle at 50% 45%, ${accentColor}25 0%, transparent 70%)`,
          pointerEvents: 'none',
        }}
      />

      {/* Center Icon Badge */}
      <div
        style={{
          width: 46,
          height: 46,
          borderRadius: 13,
          background: `${accentColor}1e`,
          border: `1px solid ${accentColor}40`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          boxShadow: `0 4px 18px ${accentColor}22`,
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

      {/* Persistent Pill Badge Overlay (Only rendered in vector badge mode) */}
      {!previewMedia && (
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
      )}
    </div>
  )
}
