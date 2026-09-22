import React, { useState, useEffect, useCallback, useRef } from 'react'
import { createPortal } from 'react-dom'
import {
  Search, Download, Globe, Image, MonitorPlay, Upload, Users, Palette,
  LogIn, Play, Check, Heart, Clock, CheckCircle, XCircle, FileText,
  Award, Eye, X, FolderPlus, Shield, ShieldCheck, ShieldAlert, Trash2,
  Star, AlertTriangle, RefreshCw, Filter, Sparkles,
  LayoutGrid, List, SlidersHorizontal, ShieldX, Volume2, VolumeX, UserPlus,
  Video, FileUp, Music, FolderOpen, ExternalLink, Plus,
  Cloud, HardDrive, DownloadCloud
} from 'lucide-react'
import {
  searchCatalog,
  fetchCommunityStats,
  submitWallpaper,
  trackInstall,
  toggleLike,
  getUserLikes,
  getUserSubmissions,
  fetchCommunityCounts,
  fetchPendingSubmissions,
  approveSubmission,
  rejectSubmission,
  deleteUserSubmission,
  removeCommunityWallpaper,
  toggleFeaturedWallpaper,
  checkIsAdmin,
  clearCatalogCache,
  fetchCommunityAdmins,
  addCommunityAdmin,
  removeCommunityAdmin,
  ROOT_OWNER_EMAIL,
  COMMUNITY_MEDIA_LIMITS,
  inspectMediaFile,
  LICENSE_OPTIONS,
  downloadCommunityWallpaper,
  getWallpaperMetrics,
  formatBytes,
} from '../lib/community.js'
import { useStore } from '../store/useStore.js'
import { applyWallpaperToDesktop, isTauri, openExternalUrl } from '../lib/wallpaperActions.js'
import { parseYouTubeId } from '../engines/web-stream.js'
import WallpaperPlayer from '../components/WallpaperPlayer/index.jsx'
import UserAvatar from '../components/UserAvatar/index.jsx'

const TAGS = ['anime', 'nature', 'city', 'space', 'minimal', 'retro', 'lofi', 'abstract', '4K', 'dark', 'neon', 'cyberpunk']

const CATEGORIES = [
  { id: 'all',       label: 'All Categories',  icon: Sparkles,          emoji: '✨' },
  { id: 'anime',     label: 'Anime & Manga',   icon: Sparkles,          emoji: '🌸' },
  { id: 'cyberpunk', label: 'Cyberpunk',       icon: Video,             emoji: '🌆' },
  { id: 'space',     label: 'Space & Cosmos',  icon: Globe,             emoji: '🌌' },
  { id: 'nature',    label: 'Nature',          icon: Image,             emoji: '🌿' },
  { id: 'retro',     label: 'Retro Synth',     icon: MonitorPlay,       emoji: '🕹️' },
  { id: 'city',      label: 'City & Urban',    icon: Globe,             emoji: '🏙️' },
  { id: 'lofi',      label: 'Lofi & Chill',    icon: Music,             emoji: '🎧' },
  { id: 'abstract',  label: 'Abstract & Math', icon: Palette,           emoji: '🔮' },
  { id: 'gaming',    label: 'Gaming & Pixel',  icon: LayoutGrid,        emoji: '🎮' },
  { id: 'minimal',   label: 'Minimal',         icon: SlidersHorizontal, emoji: '🕊️' },
]

const TYPE_FILTERS = [
  { id: '',        label: 'All',        icon: null },
  { id: 'video',   label: 'Video Loop', icon: Video },
  { id: 'engine',  label: 'Procedural', icon: Sparkles },
  { id: 'youtube', label: 'YouTube',    icon: MonitorPlay },
  { id: 'stream',  label: 'Web Stream', icon: Globe },
  { id: 'image',   label: 'Image',      icon: Image },
]

const TYPE_BADGES = {
  youtube: { label: 'YouTube',    color: 'var(--color-rose)' },
  stream:  { label: 'Stream',     color: 'var(--color-cyan)' },
  image:   { label: 'Image',      color: 'var(--color-emerald)' },
  video:   { label: 'Video',      color: 'var(--color-purple)' },
  engine:  { label: 'Procedural', color: 'var(--color-brand)' },
}

const STATUS_BADGES = {
  pending:  { label: 'Pending Review', color: 'var(--color-amber)', icon: Clock },
  approved: { label: 'Approved',       color: 'var(--color-emerald)', icon: CheckCircle },
  rejected: { label: 'Rejected',       color: 'var(--color-rose)',    icon: XCircle },
  removed:  { label: 'Taken Down',     color: 'var(--color-rose)',    icon: Trash2 },
}

export default function CommunityPage() {
  const [tab, setTab] = useState('browse')
  const [browseView, setBrowseView] = useState('grid') // 'grid' | 'compact'
  const [query, setQuery] = useState('')
  const [selectedCategory, setSelectedCategory] = useState('all')
  const [selectedTags, setSelectedTags] = useState([])
  const [typeFilter, setTypeFilter] = useState('')
  const [filterMode, setFilterMode] = useState('all') // 'all' | 'featured' | 'community'
  const [sortMode, setSortMode] = useState('popular') // 'popular' | 'newest' | 'likes' | 'name'
  const [results, setResults] = useState([])
  const [loading, setLoading] = useState(true)
  const [stats, setStats] = useState({ totalWallpapers: 0, activeUsers: 0 })

  // Likes & Downloads state
  const storeLikedIds = useStore(s => s.likedWallpaperIds) || []
  const [likedIds, setLikedIds] = useState(() => new Set(storeLikedIds))
  const [likeCounts, setLikeCounts] = useState({}) // wallpaperId -> count
  const [likingId, setLikingId] = useState(null)
  const [downloadCounts, setDownloadCounts] = useState({}) // wallpaperId -> count
  const [addingLibraryId, setAddingLibraryId] = useState(null)
  const [downloadingIds, setDownloadingIds] = useState(() => new Set())
  const [downloadProgress, setDownloadProgress] = useState({}) // wallpaperId -> percent

  // Live Preview Modal state
  const [previewItem, setPreviewItem] = useState(null)

  // My Submissions state
  const [mySubmissions, setMySubmissions] = useState([])
  const [loadingSubmissions, setLoadingSubmissions] = useState(false)

  // Moderation Queue state
  const [pendingQueue, setPendingQueue] = useState([])
  const [loadingQueue, setLoadingQueue] = useState(false)
  const [moderatingId, setModeratingId] = useState(null)
  const [actionNotice, setActionNotice] = useState(null)

  // Team & Moderator Management state
  const [adminsList, setAdminsList] = useState([])
  const [loadingAdmins, setLoadingAdmins] = useState(false)
  const [newAdminEmail, setNewAdminEmail] = useState('')
  const [addingAdmin, setAddingAdmin] = useState(false)
  const [adminError, setAdminError] = useState(null)
  const [revokingAdminEmail, setRevokingAdminEmail] = useState(null)

  // Manage Catalog tab state
  const [manageSearch, setManageSearch] = useState('')
  const [quickTakedownInput, setQuickTakedownInput] = useState('')

  // Takedown confirm modal
  const [takedownTarget, setTakedownTarget] = useState(null)
  const [takedownReason, setTakedownReason] = useState('')
  const [isTakingDown, setIsTakingDown] = useState(false)

  // Auth & Library state
  const isAuthenticated = useStore(s => s.isAuthenticated)
  const authUser = useStore(s => s.authUser)
  const setShowAuthModal = useStore(s => s.setShowAuthModal)
  const installed = useStore(s => s.installed) || []
  const activeWallpaper = useStore(s => s.activeWallpaper)
  const currentDesktopWallpaper = useStore(s => s.currentDesktopWallpaper)
  const isWallpaperRunning = useStore(s => s.isWallpaperRunning)
  const setActiveWallpaper = useStore(s => s.setActiveWallpaper)
  const installItem = useStore(s => s.installItem)
  const pinToHome = useStore(s => s.pinToHome)
  const setWallpaperAudio = useStore(s => s.setWallpaperAudio)
  const audioVolume = useStore(s => s.audioVolume) ?? 50
  const [applyingId, setApplyingId] = useState(null)

  const isAdmin = checkIsAdmin(authUser)

  // Submit form state
  const [submitForm, setSubmitForm] = useState({
    title: '', description: '', type: 'video', source: '', tags: [], authorName: '',
    authorPortfolio: '', license: 'CC BY-NC-ND 4.0',
  })
  const [customTagInput, setCustomTagInput] = useState('')
  const [selectedMediaFile, setSelectedMediaFile] = useState(null)
  const [mediaInspection, setMediaInspection] = useState(null)
  const [inspectingMedia, setInspectingMedia] = useState(false)
  const [inspectError, setInspectError] = useState(null)
  const [uploadProgress, setUploadProgress] = useState(null)
  const [isDragOver, setIsDragOver] = useState(false)
  const fileInputRef = useRef(null)
  const isBrowsingRef = useRef(false)
  const [submitting, setSubmitting] = useState(false)
  const [submitResult, setSubmitResult] = useState(null)

  const handleAddCustomTag = (raw) => {
    const val = (typeof raw === 'string' ? raw : customTagInput).trim().replace(/^#+/, '')
    if (!val) return
    const tagsToAdd = val.split(/[,\s]+/).map(t => t.trim().replace(/^#+/, '').toLowerCase()).filter(Boolean)
    if (tagsToAdd.length === 0) return
    setSubmitForm(f => {
      const existing = f.tags || []
      const merged = [...existing]
      for (const t of tagsToAdd) {
        if (!merged.includes(t)) merged.push(t)
      }
      return { ...f, tags: merged }
    })
    setCustomTagInput('')
  }

  const handleRemoveCustomTag = (tagToRemove) => {
    setSubmitForm(f => ({
      ...f,
      tags: (f.tags || []).filter(t => t !== tagToRemove)
    }))
  }

  const handleMediaSelection = async (fileOrPath) => {
    if (!fileOrPath) return
    setInspectingMedia(true)
    setInspectError(null)
    setSelectedMediaFile(fileOrPath)
    try {
      const inspection = await inspectMediaFile(fileOrPath)
      setMediaInspection(inspection)
      setSubmitForm(f => {
        const rawName = inspection.name || (fileOrPath?.name || (typeof fileOrPath === 'string' ? fileOrPath.split(/[/\\]/).pop() : ''))
        const autoTitle = rawName.replace(/\.[^/.]+$/, '').replace(/[-_]/g, ' ').trim()
        return {
          ...f,
          title: f.title.trim() ? f.title : autoTitle,
          type: inspection.type,
        }
      })
    } catch (err) {
      console.warn('Media inspection error:', err)
      setInspectError(err.message || 'Failed to inspect file')
      setSelectedMediaFile(null)
      setMediaInspection(null)
    } finally {
      setInspectingMedia(false)
    }
  }

  const handleBrowseComputer = async () => {
    if (isBrowsingRef.current) return
    isBrowsingRef.current = true
    try {
      if (isTauri()) {
        try {
          const { open } = await import('@tauri-apps/plugin-dialog')
          const isVid = submitForm.type === 'video'
          const selected = await open({
            multiple: false,
            filters: isVid
              ? [{ name: 'Video Loops (*.mp4, *.webm)', extensions: ['mp4', 'webm', 'mov', 'mkv'] }]
              : [{ name: 'Pictures (*.png, *.jpg, *.webp)', extensions: ['png', 'jpg', 'jpeg', 'webp', 'bmp'] }]
          })
          if (selected && typeof selected === 'string') {
            await handleMediaSelection(selected)
          }
          // In Tauri, whether a file was chosen or the dialog was closed/cancelled,
          // we must return immediately so it NEVER falls through to triggering
          // the hidden HTML file input (which causes a second dialog to open).
          return
        } catch (err) {
          console.warn('[Community] Native file picker error:', err)
        }
      }
      fileInputRef.current?.click()
    } finally {
      setTimeout(() => {
        isBrowsingRef.current = false
      }, 300)
    }
  }

  const handleDropMedia = (e) => {
    e.preventDefault()
    setIsDragOver(false)
    const file = e.dataTransfer?.files?.[0]
    if (file) handleMediaSelection(file)
  }

  // Native Tauri drag-and-drop support: captures absolute Windows path directly
  useEffect(() => {
    if (!isTauri()) return
    let unlisten = null
    import('@tauri-apps/api/webviewWindow')
      .then(({ getCurrentWebviewWindow }) => {
        const appWindow = getCurrentWebviewWindow()
        return appWindow.onDragDropEvent((event) => {
          if (event.payload.type === 'drop') {
            setIsDragOver(false)
            const paths = event.payload.paths
            if (paths && paths.length > 0) {
              handleMediaSelection(paths[0])
            }
          } else if (event.payload.type === 'over') {
            setIsDragOver(true)
          } else if (event.payload.type === 'leave') {
            setIsDragOver(false)
          }
        })
      })
      .then(fn => { unlisten = fn })
      .catch(() => {})

    return () => {
      if (typeof unlisten === 'function') unlisten()
    }
  }, [])

  // Toast notification helper
  const showNotice = (msg, type = 'success') => {
    setActionNotice({ msg, type })
    setTimeout(() => setActionNotice(null), 4000)
  }

  const [isSearching, setIsSearching] = useState(false)

  const likeCountsRef = useRef(likeCounts)
  likeCountsRef.current = likeCounts
  const downloadCountsRef = useRef(downloadCounts)
  downloadCountsRef.current = downloadCounts
  const likedIdsRef = useRef(likedIds)
  likedIdsRef.current = likedIds
  const installedRef = useRef(installed)
  installedRef.current = installed
  const resultsRef = useRef(results)
  resultsRef.current = results

  // Fetch wallpapers
  const doSearch = useCallback(async (forceRefresh = false) => {
    // Only show full loading spinner if we don't have results yet to prevent container collapse and scroll jumping
    if (resultsRef.current.length === 0) {
      setLoading(true)
    }
    setIsSearching(true)
    try {
      const installedSet = new Set((installedRef.current || []).map(i => i?.id || i?.communityMeta?.originalId).filter(Boolean))
      const data = await searchCatalog({
        query,
        category: selectedCategory,
        tags: selectedTags,
        type: typeFilter,
        filterMode,
        sortMode,
        likeCounts: likeCountsRef.current,
        downloadCounts: downloadCountsRef.current,
        likedIds: likedIdsRef.current,
        installedIds: installedSet,
        forceRefresh,
      })
      setResults(data)
    } catch (err) {
      console.error('[Community] Search error:', err)
    } finally {
      setLoading(false)
      setIsSearching(false)
    }
  }, [query, selectedCategory, selectedTags, typeFilter, filterMode, sortMode])

  useEffect(() => {
    const timer = setTimeout(doSearch, 200)
    return () => clearTimeout(timer)
  }, [doSearch])

  // When browsing in 'liked' filter, sync when user likes/unlikes
  useEffect(() => {
    if (filterMode === 'liked') {
      doSearch()
    }
  }, [likedIds, filterMode])

  // Load community stats + like/download counts
  const loadStatsAndCounts = useCallback(() => {
    fetchCommunityStats().then(setStats).catch(() => {})
    fetchCommunityCounts().then(({ downloadCounts: dc, likeCounts: lc }) => {
      if (dc) setDownloadCounts(dc)
      if (lc) setLikeCounts(prev => ({ ...lc, ...prev }))
    }).catch(() => {})
  }, [])

  useEffect(() => {
    loadStatsAndCounts()
  }, [loadStatsAndCounts])

  // Fetch user likes when authenticated or sync from local store
  useEffect(() => {
    if (isAuthenticated) {
      getUserLikes().then(ids => {
        setLikedIds(new Set([...(ids || []), ...(storeLikedIds || [])]))
      }).catch(() => {})
    } else {
      setLikedIds(new Set(storeLikedIds || []))
    }
  }, [isAuthenticated, storeLikedIds])

  // Fetch my submissions when tab switches
  useEffect(() => {
    if (tab === 'submissions') {
      setLoadingSubmissions(true)
      getUserSubmissions()
        .then(setMySubmissions)
        .catch(() => {})
        .finally(() => setLoadingSubmissions(false))
    }
  }, [tab, isAuthenticated])

  // Fetch moderation queue if admin or tab switches
  const loadPendingQueue = useCallback(async () => {
    if (!isAdmin) return
    setLoadingQueue(true)
    try {
      const items = await fetchPendingSubmissions()
      setPendingQueue(items)
    } catch (e) {
      console.warn('Failed to load pending moderation queue:', e)
    } finally {
      setLoadingQueue(false)
    }
  }, [isAdmin])

  useEffect(() => {
    if (isAdmin) {
      loadPendingQueue()
    }
  }, [isAdmin, loadPendingQueue])

  // Fetch team & moderators list
  const loadAdminsList = useCallback(async (force = false) => {
    if (!isAdmin) return
    setLoadingAdmins(true)
    setAdminError(null)
    try {
      const list = await fetchCommunityAdmins(force)
      setAdminsList(list || [])
    } catch (e) {
      console.warn('Failed to load admins list:', e)
    } finally {
      setLoadingAdmins(false)
    }
  }, [isAdmin])

  useEffect(() => {
    if (isAdmin && tab === 'manage') {
      loadAdminsList()
    }
  }, [isAdmin, tab, loadAdminsList])

  const toggleTag = (tag) => setSelectedTags(prev =>
    prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag]
  )

  const isItemLikedByUser = useCallback((item) => {
    if (!item) return false
    const rawId = item.id || ''
    const altId = rawId.startsWith('community-') ? rawId.replace('community-', '') : `community-${rawId}`
    const origId = item.communityMeta?.originalId
    return likedIds.has(rawId) || likedIds.has(altId) || (Boolean(origId) && likedIds.has(origId))
  }, [likedIds])

  const handleLike = async (wallpaperId) => {
    // 1. Instantly toggle in global Zustand store for Library, Home, and local persistence
    useStore.getState().toggleLikeWallpaper(wallpaperId)

    const wasLiked = likedIds.has(wallpaperId)
    setLikedIds(prev => {
      const next = new Set(prev)
      wasLiked ? next.delete(wallpaperId) : next.add(wallpaperId)
      return next
    })
    setLikeCounts(prev => {
      const base = prev[wallpaperId] ?? results.find(r => r.id === wallpaperId)?.likes ?? 0
      return {
        ...prev,
        [wallpaperId]: Math.max(0, base + (wasLiked ? -1 : 1)),
      }
    })

    // 2. Sync to Supabase if authenticated (liking does NOT auto-add to Library)
    if (!isAuthenticated) return
    setLikingId(wallpaperId)
    try {
      const result = await toggleLike(wallpaperId)
      if (result) {
        setLikedIds(prev => {
          const next = new Set(prev)
          result.liked ? next.add(wallpaperId) : next.delete(wallpaperId)
          return next
        })
        setLikeCounts(prev => ({ ...prev, [wallpaperId]: result.totalLikes }))
      }
    } catch (err) {
      console.warn('[Community] Sync like to server skipped:', err)
    } finally {
      setLikingId(null)
    }
  }

  const handleAddToLibrary = async (wallpaper) => {
    setAddingLibraryId(wallpaper.id)
    try {
      const urlOrSource = wallpaper.source || ''
      const hasImageExt = /\.(png|jpg|jpeg|webp|bmp|gif|avif)$/i.test(urlOrSource) || urlOrSource.includes('images.unsplash.com') || ['image', 'jpg', 'jpeg', 'png', 'webp', 'avif'].includes(String(wallpaper.mediaFormat || '').toLowerCase())
      const isImage = wallpaper.type === 'image' || hasImageExt
      const isEngine = !isImage && (wallpaper.type === 'engine' || Boolean(wallpaper.engine))
      const isStream = !isImage && !isEngine && (wallpaper.type === 'youtube' || wallpaper.type === 'stream' || Boolean(parseYouTubeId(wallpaper.source)))
      const isVideo = !isImage && !isEngine && !isStream && (wallpaper.type === 'video' || /\.(mp4|webm|mkv|avi|mov)$/i.test(urlOrSource))
      const resolvedEngine = isEngine ? (wallpaper.engine || wallpaper.source.replace('engine:', '')) : (isImage ? 'image-player' : (isStream ? 'web-stream' : 'video-player'))
      const targetVolume = audioVolume > 0 ? audioVolume : 50
      const cleanAuthor = wallpaper.author || 'Community Contributor'
      const cleanPortfolio = wallpaper.authorPortfolio || wallpaper.author_portfolio || ''
      const cleanLicense = wallpaper.license || 'CC BY-NC-ND 4.0'
      const storageMode = useStore.getState().communityStorageMode || 'stream_and_cache'

      const item = {
        id: `community-${wallpaper.id}`,
        name: wallpaper.name,
        engine: resolvedEngine,
        type: 'wallpaper',
        isCustom: true,
        installedAt: Date.now(),
        preview: wallpaper.preview,
        tags: wallpaper.tags || ['community'],
        remoteUrl: wallpaper.source,
        localPath: isEngine ? 'builtin:canvas' : null,
        storageStatus: isEngine ? 'downloaded' : 'cloud',
        author: cleanAuthor,
        authorPortfolio: cleanPortfolio,
        license: cleanLicense,
        mediaType: isEngine ? 'canvas' : (isImage ? 'image' : (isStream ? 'stream' : 'video')),
        config: {
          ...(isEngine
            ? { speedMultiplier: 1, ...(wallpaper.config || {}) }
            : isImage
            ? { imagePath: wallpaper.source, url: wallpaper.source, fit: 'cover' }
            : isStream
            ? {
                streamUrl: wallpaper.source,
                url: wallpaper.source,
                streamType: wallpaper.type === 'youtube' ? 'youtube' : 'web',
                muted: false,
                volume: targetVolume,
                speedMultiplier: 1,
              }
            : { videoPath: wallpaper.source, speedMultiplier: 1, volume: targetVolume, muted: false }
          ),
        },
        communityMeta: {
          author: cleanAuthor,
          authorPortfolio: cleanPortfolio,
          license: cleanLicense,
          originalId: wallpaper.id,
          source: wallpaper.source,
          hasAudio: Boolean(wallpaper.hasAudio || wallpaper.has_audio),
          fileSize: wallpaper.fileSize || wallpaper.file_size || 0,
          dimensions: wallpaper.dimensions || '',
          mediaFormat: wallpaper.mediaFormat || wallpaper.media_format || '',
          duration: wallpaper.duration || 0,
        },
      }

      installItem(item)
      setWallpaperAudio(item.id, { volume: targetVolume, muted: false })

      if ((isVideo || isImage) && storageMode === 'always_download') {
        downloadCommunityWallpaper(wallpaper).then(res => {
          if (res?.localPath) {
            useStore.getState().updateInstalledStorage(item.id, {
              localPath: res.localPath,
              storageStatus: 'downloaded',
              fileSize: res.fileSize,
            })
            if (isImage) {
              item.config.imagePath = res.localPath
            } else {
              item.config.videoPath = res.localPath
            }
          }
        }).catch(err => console.warn('[Community] Download failed:', err))
      }

      setDownloadCounts(prev => {
        const base = prev[wallpaper.id] ?? wallpaper.downloads ?? 0
        return { ...prev, [wallpaper.id]: base + 1 }
      })

      const serverTotal = await trackInstall(wallpaper.id)
      if (serverTotal !== null && serverTotal !== undefined) {
        setDownloadCounts(prev => ({ ...prev, [wallpaper.id]: serverTotal }))
      }
      showNotice(`Saved "${wallpaper.name}" to Library!`)
    } catch (err) {
      console.error('Failed to add wallpaper to library:', err)
    } finally {
      setAddingLibraryId(null)
    }
  }

  const handleDownloadOffline = async (wallpaper) => {
    if (!wallpaper) return
    const urlOrSource = wallpaper.source || ''
    const hasImageExt = /\.(png|jpg|jpeg|webp|bmp|gif|avif)$/i.test(urlOrSource) || urlOrSource.includes('images.unsplash.com') || ['image', 'jpg', 'jpeg', 'png', 'webp', 'avif'].includes(String(wallpaper.mediaFormat || '').toLowerCase())
    const isImage = wallpaper.type === 'image' || hasImageExt
    const isEngine = !isImage && (wallpaper.type === 'engine' || Boolean(wallpaper.engine))
    const isStream = !isImage && !isEngine && (wallpaper.type === 'youtube' || wallpaper.type === 'stream' || Boolean(parseYouTubeId(wallpaper.source)))
    const isVideo = !isImage && !isEngine && !isStream
    
    if (isStream) {
      showNotice(`"${wallpaper.name}" is an external live stream and does not support local offline file saving.`, 'info')
      return
    }

    const targetId = `community-${wallpaper.id}`

    // Procedural engines run natively: save to library and mark as 100% downloaded offline
    if (isEngine) {
      await handleAddToLibrary(wallpaper)
      useStore.getState().updateInstalledStorage(targetId, {
        storageStatus: 'downloaded',
        localPath: 'builtin:canvas',
        fileSize: 0,
      })
      setDownloadCounts(prev => {
        const base = prev[wallpaper.id] ?? wallpaper.downloads ?? 0
        return { ...prev, [wallpaper.id]: base + 1 }
      })
      trackInstall(wallpaper.id).catch(() => {})
      showNotice(`Downloaded "${wallpaper.name}" for 100% offline playback!`)
      return
    }

    const resolvedEngine = isImage ? 'image-player' : 'video-player'
    const targetVolume = audioVolume > 0 ? audioVolume : 50
    const cleanAuthor = wallpaper.author || 'Community Contributor'
    const cleanPortfolio = wallpaper.authorPortfolio || wallpaper.author_portfolio || ''
    const cleanLicense = wallpaper.license || 'CC BY-NC-ND 4.0'

    // 1. Ensure item exists in Library
    let existingItem = (installed || []).find(i => i?.id === targetId || i?.communityMeta?.originalId === wallpaper.id)
    if (!existingItem) {
      const item = {
        id: targetId,
        name: wallpaper.name,
        engine: resolvedEngine,
        type: 'wallpaper',
        isCustom: true,
        installedAt: Date.now(),
        preview: wallpaper.preview,
        tags: wallpaper.tags || ['community'],
        remoteUrl: wallpaper.source,
        localPath: null,
        storageStatus: 'cloud',
        author: cleanAuthor,
        authorPortfolio: cleanPortfolio,
        license: cleanLicense,
        mediaType: isImage ? 'image' : 'video',
        config: {
          ...(isImage
            ? { imagePath: wallpaper.source, url: wallpaper.source, fit: 'cover' }
            : { videoPath: wallpaper.source, speedMultiplier: 1, volume: targetVolume, muted: false }
          ),
        },
        communityMeta: {
          author: cleanAuthor,
          authorPortfolio: cleanPortfolio,
          license: cleanLicense,
          originalId: wallpaper.id,
          source: wallpaper.source,
          hasAudio: Boolean(wallpaper.hasAudio || wallpaper.has_audio),
          fileSize: wallpaper.fileSize || wallpaper.file_size || 0,
          dimensions: wallpaper.dimensions || '',
          mediaFormat: wallpaper.mediaFormat || wallpaper.media_format || '',
          duration: wallpaper.duration || 0,
        },
      }
      installItem(item)
      setWallpaperAudio(item.id, { volume: targetVolume, muted: false })
    }

    setDownloadingIds(prev => new Set(prev).add(wallpaper.id))
    setDownloadProgress(prev => ({ ...prev, [wallpaper.id]: { percent: 0, downloaded: 0, total: 0 } }))
    showNotice(`Downloading "${wallpaper.name}" for offline playback…`)

    try {
      const res = await downloadCommunityWallpaper(wallpaper, (progress) => {
        if (progress) {
          const pct = typeof progress.percent === 'number'
            ? progress.percent
            : (typeof progress.progress === 'number' ? progress.progress : 0)
          setDownloadProgress(prev => ({
            ...prev,
            [wallpaper.id]: {
              percent: Math.round(pct),
              downloaded: progress.downloaded || 0,
              total: progress.total || 0,
            }
          }))
        }
      })

      if (res?.localPath) {
        useStore.getState().updateInstalledStorage(targetId, {
          localPath: res.localPath,
          storageStatus: res.cached ? 'cached' : 'downloaded',
          fileSize: res.fileSize,
        })
        const curInstalled = useStore.getState().installed || []
        const currentItem = curInstalled.find(i => i.id === targetId)
        if (currentItem) {
          if (isImage) {
            currentItem.config.imagePath = res.localPath
          } else {
            currentItem.config.videoPath = res.localPath
          }
        }
        showNotice(`Downloaded "${wallpaper.name}" to local disk for offline playback!`)
      }

      setDownloadCounts(prev => {
        const base = prev[wallpaper.id] ?? wallpaper.downloads ?? 0
        return { ...prev, [wallpaper.id]: base + 1 }
      })
      trackInstall(wallpaper.id).then(total => {
        if (total !== null && total !== undefined) {
          setDownloadCounts(prev => ({ ...prev, [wallpaper.id]: total }))
        }
      }).catch(() => {})
    } catch (err) {
      console.error('[Community] Download offline error:', err)
      showNotice(`Failed to download "${wallpaper.name}". It is still accessible via cloud stream.`, 'error')
    } finally {
      setDownloadingIds(prev => {
        const next = new Set(prev)
        next.delete(wallpaper.id)
        return next
      })
      setDownloadProgress(prev => {
        const next = { ...prev }
        delete next[wallpaper.id]
        return next
      })
    }
  }

  const handleInstall = async (wallpaper) => {
    setApplyingId(wallpaper.id)
    try {
      const urlOrSource = wallpaper.source || ''
      const hasImageExt = /\.(png|jpg|jpeg|webp|bmp|gif|avif)$/i.test(urlOrSource) || urlOrSource.includes('images.unsplash.com') || ['image', 'jpg', 'jpeg', 'png', 'webp', 'avif'].includes(String(wallpaper.mediaFormat || '').toLowerCase())
      const isImage = wallpaper.type === 'image' || hasImageExt
      const isEngine = !isImage && (wallpaper.type === 'engine' || Boolean(wallpaper.engine))
      const isStream = !isImage && !isEngine && (wallpaper.type === 'youtube' || wallpaper.type === 'stream' || Boolean(parseYouTubeId(wallpaper.source)))
      const isVideo = !isImage && !isEngine && !isStream && (wallpaper.type === 'video' || /\.(mp4|webm|mkv|avi|mov)$/i.test(urlOrSource))
      const resolvedEngine = isEngine ? (wallpaper.engine || wallpaper.source.replace('engine:', '')) : (isImage ? 'image-player' : (isStream ? 'web-stream' : 'video-player'))
      const targetVolume = audioVolume > 0 ? audioVolume : 50
      const cleanAuthor = wallpaper.author || 'Community Contributor'
      const cleanPortfolio = wallpaper.authorPortfolio || wallpaper.author_portfolio || ''
      const cleanLicense = wallpaper.license || 'CC BY-NC-ND 4.0'
      const storageMode = useStore.getState().communityStorageMode || 'stream_and_cache'

      const item = {
        id: `community-${wallpaper.id}`,
        name: wallpaper.name,
        engine: resolvedEngine,
        type: 'wallpaper',
        isCustom: true,
        installedAt: Date.now(),
        preview: wallpaper.preview,
        tags: wallpaper.tags || ['community'],
        remoteUrl: wallpaper.source,
        localPath: null,
        storageStatus: 'cloud',
        author: cleanAuthor,
        authorPortfolio: cleanPortfolio,
        license: cleanLicense,
        mediaType: isEngine ? 'canvas' : (isImage ? 'image' : (isStream ? 'stream' : 'video')),
        config: {
          ...(isEngine
            ? { speedMultiplier: 1, ...(wallpaper.config || {}) }
            : isImage
            ? { imagePath: wallpaper.source, url: wallpaper.source, fit: 'cover' }
            : isStream
            ? {
                streamUrl: wallpaper.source,
                url: wallpaper.source,
                streamType: wallpaper.type === 'youtube' ? 'youtube' : 'web',
                muted: false,
                volume: targetVolume,
                speedMultiplier: 1,
              }
            : { videoPath: wallpaper.source, speedMultiplier: 1, volume: targetVolume, muted: false }
          ),
        },
        communityMeta: {
          author: cleanAuthor,
          authorPortfolio: cleanPortfolio,
          license: cleanLicense,
          originalId: wallpaper.id,
          source: wallpaper.source,
          hasAudio: Boolean(wallpaper.hasAudio || wallpaper.has_audio),
          fileSize: wallpaper.fileSize || wallpaper.file_size || 0,
          dimensions: wallpaper.dimensions || '',
          mediaFormat: wallpaper.mediaFormat || wallpaper.media_format || '',
          duration: wallpaper.duration || 0,
        },
      }

      if ((isVideo || isImage) && storageMode === 'always_download') {
        showNotice(`Downloading "${wallpaper.name}" for offline playback…`)
        try {
          const res = await downloadCommunityWallpaper(wallpaper)
          if (res?.localPath) {
            item.localPath = res.localPath
            item.storageStatus = res.cached ? 'cached' : 'downloaded'
            if (isImage) {
              item.config.imagePath = res.localPath
            } else {
              item.config.videoPath = res.localPath
            }
          }
        } catch (dlErr) {
          console.warn('[Community] Pre-download error, falling back to stream:', dlErr)
        }
      }

      // Applying from Community directly applies to Windows desktop without cluttering the user's Library
      setWallpaperAudio(item.id, { volume: targetVolume, muted: false })
      setActiveWallpaper(item)
      await applyWallpaperToDesktop(item, { forceVolume: targetVolume, forceMuted: false })

      if ((isVideo || isImage) && storageMode === 'stream_and_cache' && !item.localPath) {
        downloadCommunityWallpaper(wallpaper).then(res => {
          if (res?.localPath) {
            const isInstalled = (useStore.getState().installed || []).some(i => i.id === item.id)
            if (isInstalled) {
              useStore.getState().updateInstalledStorage(item.id, {
                localPath: res.localPath,
                storageStatus: 'cached',
                fileSize: res.fileSize,
              })
            }
            const curDesk = useStore.getState().currentDesktopWallpaper
            if (curDesk?.id === item.id) {
              useStore.setState({
                currentDesktopWallpaper: {
                  ...curDesk,
                  localPath: res.localPath,
                  storageStatus: 'cached',
                  config: {
                    ...curDesk.config,
                    ...(isImage ? { imagePath: res.localPath } : { videoPath: res.localPath })
                  },
                }
              })
            }
          }
        }).catch(err => console.warn('[Community] Background caching failed:', err))
      }

      setDownloadCounts(prev => {
        const base = prev[wallpaper.id] ?? wallpaper.downloads ?? 0
        return { ...prev, [wallpaper.id]: base + 1 }
      })

      const serverTotal = await trackInstall(wallpaper.id)
      if (serverTotal !== null && serverTotal !== undefined) {
        setDownloadCounts(prev => ({ ...prev, [wallpaper.id]: serverTotal }))
      }
      showNotice(`Applied "${wallpaper.name}" to your Windows desktop!`)
    } catch (err) {
      console.error('Failed to install/apply wallpaper:', err)
    } finally {
      setApplyingId(null)
    }
  }

  // ── Moderation Handlers ───────────────────────────────────────────────────

  const handleApprove = async (sub) => {
    setModeratingId(sub.id)
    try {
      await approveSubmission(sub.id, sub)
      setPendingQueue(prev => prev.filter(item => item.id !== sub.id))
      showNotice(`Approved "${sub.title || 'wallpaper'}"! It is now live in the Community Hub.`)
      doSearch(true)
      loadStatsAndCounts()
    } catch (err) {
      showNotice(`Failed to approve: ${err.message}`, 'error')
    } finally {
      setModeratingId(null)
    }
  }

  const handleWithdrawSubmission = async (sub) => {
    if (!window.confirm(`Are you sure you want to withdraw and delete "${sub.title || 'this submission'}"?`)) {
      return
    }
    try {
      await deleteUserSubmission(sub.id)
      setMySubmissions(prev => prev.filter(item => item.id !== sub.id))
      setPendingQueue(prev => prev.filter(item => item.id !== sub.id))
      showNotice(`Withdrew "${sub.title || 'submission'}" successfully.`)
      doSearch(true)
      loadStatsAndCounts()
    } catch (err) {
      showNotice(`Failed to withdraw submission: ${err.message}`, 'error')
    }
  }

  const handleReject = async (sub, reason = '') => {
    setModeratingId(sub.id)
    try {
      await rejectSubmission(sub.id, reason)
      setPendingQueue(prev => prev.filter(item => item.id !== sub.id))
      showNotice(`Rejected submission "${sub.title || 'wallpaper'}".`)
    } catch (err) {
      showNotice(`Failed to reject: ${err.message}`, 'error')
    } finally {
      setModeratingId(null)
    }
  }

  const handleConfirmTakedown = async () => {
    if (!takedownTarget) return
    setIsTakingDown(true)
    try {
      await removeCommunityWallpaper(takedownTarget.id, takedownReason)
      setResults(prev => prev.filter(item => item.id !== takedownTarget.id))
      showNotice(`Removed "${takedownTarget.name}" from the Community Hub.`)
      setTakedownTarget(null)
      setTakedownReason('')
      loadStatsAndCounts()
    } catch (err) {
      showNotice(`Failed to remove wallpaper: ${err.message}`, 'error')
    } finally {
      setIsTakingDown(false)
    }
  }

  const handleQuickTakedownByUrlOrId = () => {
    if (!quickTakedownInput.trim()) return
    const input = quickTakedownInput.trim()
    const target = results.find(w =>
      w.id === input ||
      w.source === input ||
      (w.source && input.includes(w.source)) ||
      (parseYouTubeId(w.source) && input.includes(parseYouTubeId(w.source)))
    )

    if (target) {
      setTakedownTarget(target)
      setTakedownReason('Quick Takedown via URL/ID')
      setQuickTakedownInput('')
    } else {
      showNotice('No published wallpaper matches that URL or ID.', 'error')
    }
  }

  const handleToggleFeature = async (wallpaper) => {
    try {
      const res = await toggleFeaturedWallpaper(wallpaper.id, wallpaper.featured)
      setResults(prev => prev.map(item =>
        item.id === wallpaper.id ? { ...item, featured: res.featured } : item
      ))
      showNotice(`${res.featured ? 'Featured' : 'Unfeatured'} "${wallpaper.name}"!`)
    } catch (err) {
      showNotice(`Failed to update feature status: ${err.message}`, 'error')
    }
  }

  const handleAddModerator = async (e) => {
    e?.preventDefault?.()
    const targetEmail = newAdminEmail.trim().toLowerCase()
    if (!targetEmail) return
    setAddingAdmin(true)
    setAdminError(null)
    try {
      const updated = await addCommunityAdmin(targetEmail)
      setAdminsList(updated || [])
      setNewAdminEmail('')
      showNotice(`Granted moderator permissions to "${targetEmail}"!`)
    } catch (err) {
      setAdminError(err.message || 'Failed to add moderator.')
      showNotice(err.message || 'Failed to add moderator.', 'error')
    } finally {
      setAddingAdmin(false)
    }
  }

  const handleRevokeModerator = async (admin) => {
    if (!admin?.email) return
    if (!window.confirm(`Are you sure you want to revoke moderator privileges from ${admin.email}?`)) {
      return
    }
    setRevokingAdminEmail(admin.email)
    setAdminError(null)
    try {
      const updated = await removeCommunityAdmin(admin.email)
      setAdminsList(updated || [])
      showNotice(`Revoked moderator privileges for "${admin.email}".`)
    } catch (err) {
      setAdminError(err.message || 'Failed to revoke moderator.')
      showNotice(err.message || 'Failed to revoke moderator.', 'error')
    } finally {
      setRevokingAdminEmail(null)
    }
  }




  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!isAuthenticated) {
      setShowAuthModal(true)
      showNotice('Please sign in to submit your wallpaper to the community catalog.', 'error')
      return
    }
    setSubmitting(true)
    setSubmitResult(null)
    setUploadProgress(null)

    const isUploadType = submitForm.type === 'video' || submitForm.type === 'image'
    if (isUploadType && !selectedMediaFile && !mediaInspection && !submitForm.source.trim()) {
      setSubmitResult({ success: false, message: 'Please select or drag & drop a media file to upload.' })
      setSubmitting(false)
      return
    }

    try {
      const rawPortfolio = (submitForm.authorPortfolio || '').trim()
      const normalizedPortfolio = rawPortfolio
        ? (/^https?:\/\//i.test(rawPortfolio) ? rawPortfolio : `https://${rawPortfolio}`)
        : ''

      await submitWallpaper({
        ...submitForm,
        authorPortfolio: normalizedPortfolio,
        authorName: submitForm.authorName || authUser?.user_metadata?.full_name || authUser?.email?.split('@')[0],
        mediaFile: selectedMediaFile instanceof File ? selectedMediaFile : null,
        mediaFilePath: mediaInspection?.filePath || (typeof selectedMediaFile === 'string' ? selectedMediaFile : null),
        thumbnailBlob: mediaInspection?.thumbnailBlob,
        mediaMetadata: mediaInspection || {},
        onProgress: (prog) => setUploadProgress(prog),
      })
      setSubmitResult({
        success: true,
        message: 'Wallpaper uploaded & submitted! It is now queued in the Moderator Review Queue and will appear in the catalog once approved.',
      })
      setSubmitForm({
        title: '', description: '', type: 'video', source: '', tags: [], authorName: '',
        authorPortfolio: '', license: 'CC BY-NC-ND 4.0',
      })
      setCustomTagInput('')
      setSelectedMediaFile(null)
      setMediaInspection(null)
      setUploadProgress(null)
      if (isAdmin) loadPendingQueue()
    } catch (err) {
      setSubmitResult({ success: false, message: err.message || 'Submission failed' })
    } finally {
      setSubmitting(false)
      setUploadProgress(null)
    }
  }

  // Filter for Manage tab
  const manageFilteredWallpapers = results.filter(w => {
    if (!manageSearch) return true
    const q = manageSearch.toLowerCase()
    return (
      w.name?.toLowerCase().includes(q) ||
      w.author?.toLowerCase().includes(q) ||
      w.id?.toLowerCase().includes(q) ||
      w.source?.toLowerCase().includes(q)
    )
  })

  const hasActiveFilters = Boolean(
    (selectedCategory && selectedCategory !== 'all') ||
    Boolean(typeFilter) ||
    (filterMode && filterMode !== 'all') ||
    Boolean(query && query.trim()) ||
    (selectedTags && selectedTags.length > 0)
  )

  return (
    <div className="content-page-container animate-fadeIn">
      {/* ── Action Notice Toast (Portaled to document.body for true viewport anchoring) ── */}
      {actionNotice && createPortal(
        <div
          style={{
            position: 'fixed',
            bottom: 24,
            right: 24,
            zIndex: 999999,
            padding: '10px 18px',
            borderRadius: 8,
            background: actionNotice.type === 'error' ? 'var(--color-rose)' : 'var(--color-emerald)',
            color: '#fff',
            fontWeight: 600,
            fontSize: 13,
            boxShadow: '0 10px 30px rgba(0,0,0,0.5)',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            animation: 'fadeIn 0.2s ease-out',
          }}
        >
          {actionNotice.type === 'error' ? <AlertTriangle size={16} /> : <CheckCircle size={16} />}
          <span>{actionNotice.msg}</span>
        </div>,
        document.body
      )}

      {/* ── Top Header with Stats & Admin Controls ── */}
      <div className="content-page-header">
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
            <h1 className="content-page-title">Community Hub</h1>
            <span className="telemetry-chip" style={{ fontSize: 10.5, padding: '2px 8px' }}>
              OPEN CATALOG
            </span>
          </div>
          <p className="content-page-subtitle">
            Discover, preview, and apply animated wallpapers curated and shared by creators worldwide
          </p>
        </div>

        {/* Right Stats & Admin Controls */}
        <div className="flex items-center gap-2.5 flex-wrap">
          {stats.activeUsers > 0 && (
            <div className="telemetry-chip" style={{ gap: 5 }}>
              <Users size={12} style={{ color: 'var(--color-cyan)' }} />
              <span>{stats.activeUsers.toLocaleString()} creators</span>
            </div>
          )}
          {stats.totalWallpapers > 0 && (
            <div className="telemetry-chip" style={{ gap: 5 }}>
              <Palette size={12} style={{ color: 'var(--color-brand)' }} />
              <span>{stats.totalWallpapers} wallpapers</span>
            </div>
          )}

          {isAdmin && (
            <div className="admin-badge-pill" style={{ height: 26, fontSize: 11 }}>
              <ShieldCheck size={11} />
              <span>Admin</span>
            </div>
          )}
        </div>
      </div>

      {/* ── Main Navigation Tabs ── */}
      <div className="flex gap-2" style={{ marginBottom: 18, borderBottom: '1px solid var(--border-subtle)', paddingBottom: 10, overflowX: 'auto' }}>
        {[
          { id: 'browse', label: 'Browse', icon: Search },
          { id: 'submit', label: 'Submit Wallpaper', icon: Upload },
          { id: 'submissions', label: 'My Submissions', icon: FileText },
          ...(isAdmin ? [
            {
              id: 'moderation',
              label: 'Moderation Queue',
              icon: ShieldAlert,
              badge: pendingQueue.length,
            },
            {
              id: 'manage',
              label: 'Manage & Takedowns',
              icon: ShieldX,
            },
          ] : []),
        ].map(t => (
          <button
            key={t.id}
            className={`btn ${tab === t.id ? 'btn-primary' : 'btn-ghost'}`}
            style={{ display: 'flex', alignItems: 'center', gap: 6, position: 'relative', height: 32, fontSize: 12 }}
            onClick={() => setTab(t.id)}
          >
            <t.icon size={13} />
            <span>{t.label}</span>
            {Boolean(t.badge) && (
              <span className="mod-queue-count" style={{ marginLeft: 2 }}>
                {t.badge}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* ── BROWSE TAB ── */}
      {tab === 'browse' && (
        <>
          {/* Unified Discovery Toolbar */}
          <div style={{ marginBottom: 18, display: 'flex', flexDirection: 'column', gap: 10 }}>
            {/* Row 1: Search + Category + Format + Curation + Sort + View Mode */}
            <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
              {/* Search Box */}
              <div style={{ position: 'relative', flex: 1, minWidth: 220 }}>
                <Search size={14} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                <input
                  value={query}
                  onChange={e => setQuery(e.target.value)}
                  placeholder="Search wallpapers by title, tags, or creator…"
                  style={{
                    width: '100%', padding: '8px 12px 8px 36px',
                    background: 'var(--bg-card)', border: '1px solid var(--border-subtle)',
                    borderRadius: 8, color: 'var(--text-main)', fontSize: 12.5, outline: 'none',
                  }}
                />
                {query && (
                  <button
                    onClick={() => setQuery('')}
                    style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}
                  >
                    <X size={13} />
                  </button>
                )}
              </div>

              {/* Category Dropdown */}
              <select
                value={selectedCategory}
                onChange={e => setSelectedCategory(e.target.value)}
                style={{
                  background: 'var(--bg-card)',
                  border: selectedCategory !== 'all' ? '1px solid var(--color-brand)' : '1px solid var(--border-subtle)',
                  borderRadius: 7,
                  padding: '7px 11px',
                  fontSize: 12,
                  color: selectedCategory !== 'all' ? 'var(--color-brand)' : 'var(--text-main)',
                  fontWeight: selectedCategory !== 'all' ? 600 : 400,
                  outline: 'none',
                  cursor: 'pointer',
                  height: 36,
                }}
                title="Filter by category"
              >
                {CATEGORIES.map(cat => (
                  <option key={cat.id} value={cat.id}>
                    {cat.emoji || '✨'} {cat.label}
                  </option>
                ))}
              </select>

              {/* Format / Type Dropdown */}
              <select
                value={typeFilter}
                onChange={e => setTypeFilter(e.target.value)}
                style={{
                  background: 'var(--bg-card)',
                  border: typeFilter ? '1px solid var(--color-brand)' : '1px solid var(--border-subtle)',
                  borderRadius: 7,
                  padding: '7px 11px',
                  fontSize: 12,
                  color: typeFilter ? 'var(--color-brand)' : 'var(--text-main)',
                  fontWeight: typeFilter ? 600 : 400,
                  outline: 'none',
                  cursor: 'pointer',
                  height: 36,
                }}
                title="Filter by content format"
              >
                <option value="">All Formats</option>
                <option value="engine">⚡ Procedural Engines</option>
                <option value="video">🎬 Video Loops</option>
                <option value="youtube">📺 YouTube Live</option>
                <option value="stream">🌐 Web Streams</option>
                <option value="image">🖼️ Pictures / Art</option>
              </select>

              {/* Curation Filter Dropdown */}
              <select
                value={filterMode}
                onChange={e => setFilterMode(e.target.value)}
                style={{
                  background: 'var(--bg-card)',
                  border: filterMode !== 'all' ? '1px solid var(--color-brand)' : '1px solid var(--border-subtle)',
                  borderRadius: 7,
                  padding: '7px 11px',
                  fontSize: 12,
                  color: filterMode !== 'all' ? 'var(--color-brand)' : 'var(--text-main)',
                  fontWeight: filterMode !== 'all' ? 600 : 400,
                  outline: 'none',
                  cursor: 'pointer',
                  height: 36,
                }}
                title="Filter curation"
              >
                <option value="all">All Wallpapers</option>
                <option value="popular">🔥 Most Popular</option>
                <option value="liked">❤️ Most Liked</option>
                <option value="featured">⭐ Featured Only</option>
                <option value="community">✨ Community Added</option>
              </select>

              {/* Sort Selector */}
              <select
                value={sortMode}
                onChange={e => setSortMode(e.target.value)}
                style={{
                  background: 'var(--bg-card)',
                  border: '1px solid var(--border-subtle)',
                  borderRadius: 7,
                  padding: '7px 11px',
                  fontSize: 12,
                  color: 'var(--text-main)',
                  outline: 'none',
                  cursor: 'pointer',
                  height: 36,
                }}
                title="Sort order"
              >
                <option value="popular">Sort: Most Popular</option>
                <option value="likes">Sort: Most Liked</option>
                <option value="newest">Sort: Newest First</option>
                <option value="name">Sort: Alphabetical</option>
              </select>

              {/* View Mode Switcher */}
              <div className="segmented-control" style={{ height: 36 }}>
                <button
                  type="button"
                  className={`segmented-item ${browseView === 'grid' ? 'active' : ''}`}
                  onClick={() => setBrowseView('grid')}
                  title="Grid Cards View"
                  style={{ fontSize: 11.5, padding: '4px 10px' }}
                >
                  <LayoutGrid size={12} style={{ display: 'inline', marginRight: 4 }} />
                  <span>Cards</span>
                </button>
                <button
                  type="button"
                  className={`segmented-item ${browseView === 'compact' ? 'active' : ''}`}
                  onClick={() => setBrowseView('compact')}
                  title="Compact List View"
                  style={{ fontSize: 11.5, padding: '4px 10px' }}
                >
                  <List size={12} style={{ display: 'inline', marginRight: 4 }} />
                  <span>List</span>
                </button>
              </div>
            </div>

            {/* Active Filters Bar: Appears only when filtering, zero vertical clutter otherwise */}
            {hasActiveFilters && (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  flexWrap: 'wrap',
                  padding: '2px 0',
                }}
              >
                <span style={{ fontSize: 11.5, color: 'var(--text-muted)', fontWeight: 500 }}>
                  Active Filters:
                </span>

                {selectedCategory !== 'all' && (
                  <span
                    style={{
                      background: 'rgba(var(--rgb-brand, 59, 130, 246), 0.15)',
                      color: 'var(--color-brand)',
                      border: '1px solid var(--color-brand)',
                      borderRadius: 14,
                      padding: '3px 9px',
                      fontSize: 11.5,
                      fontWeight: 500,
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 5,
                    }}
                  >
                    <span>{CATEGORIES.find(c => c.id === selectedCategory)?.emoji} {CATEGORIES.find(c => c.id === selectedCategory)?.label || selectedCategory}</span>
                    <button
                      type="button"
                      onClick={() => setSelectedCategory('all')}
                      style={{
                        background: 'none', border: 'none', padding: 0,
                        cursor: 'pointer', color: 'inherit', display: 'flex', alignItems: 'center'
                      }}
                      title="Clear category filter"
                    >
                      <X size={11.5} />
                    </button>
                  </span>
                )}

                {typeFilter && (
                  <span
                    style={{
                      background: 'rgba(255,255,255,0.08)',
                      color: 'var(--text-main)',
                      border: '1px solid var(--border-subtle)',
                      borderRadius: 14,
                      padding: '3px 9px',
                      fontSize: 11.5,
                      fontWeight: 500,
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 5,
                    }}
                  >
                    <span>Format: {TYPE_FILTERS.find(t => t.id === typeFilter)?.label || typeFilter}</span>
                    <button
                      type="button"
                      onClick={() => setTypeFilter('')}
                      style={{
                        background: 'none', border: 'none', padding: 0,
                        cursor: 'pointer', color: 'inherit', display: 'flex', alignItems: 'center'
                      }}
                      title="Clear format filter"
                    >
                      <X size={11.5} />
                    </button>
                  </span>
                )}

                {filterMode !== 'all' && (
                  <span
                    style={{
                      background: 'rgba(255,255,255,0.08)',
                      color: 'var(--text-main)',
                      border: '1px solid var(--border-subtle)',
                      borderRadius: 14,
                      padding: '3px 9px',
                      fontSize: 11.5,
                      fontWeight: 500,
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 5,
                    }}
                  >
                    <span>
                      {filterMode === 'popular' ? '🔥 Most Popular' :
                       filterMode === 'liked' ? '❤️ Most Liked' :
                       filterMode === 'featured' ? '⭐ Featured' : '✨ Community Added'}
                    </span>
                    <button
                      type="button"
                      onClick={() => setFilterMode('all')}
                      style={{
                        background: 'none', border: 'none', padding: 0,
                        cursor: 'pointer', color: 'inherit', display: 'flex', alignItems: 'center'
                      }}
                      title="Clear curation filter"
                    >
                      <X size={11.5} />
                    </button>
                  </span>
                )}

                {query && (
                  <span
                    style={{
                      background: 'rgba(255,255,255,0.08)',
                      color: 'var(--text-main)',
                      border: '1px solid var(--border-subtle)',
                      borderRadius: 14,
                      padding: '3px 9px',
                      fontSize: 11.5,
                      fontWeight: 500,
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 5,
                    }}
                  >
                    <span>"{query}"</span>
                    <button
                      type="button"
                      onClick={() => setQuery('')}
                      style={{
                        background: 'none', border: 'none', padding: 0,
                        cursor: 'pointer', color: 'inherit', display: 'flex', alignItems: 'center'
                      }}
                      title="Clear search query"
                    >
                      <X size={11.5} />
                    </button>
                  </span>
                )}

                <button
                  type="button"
                  onClick={() => {
                    setSelectedCategory('all')
                    setTypeFilter('')
                    setFilterMode('all')
                    setQuery('')
                    setSelectedTags([])
                  }}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: 'var(--color-brand)',
                    fontSize: 11.5,
                    fontWeight: 600,
                    cursor: 'pointer',
                    textDecoration: 'underline',
                    padding: '2px 6px',
                  }}
                >
                  Reset all filters
                </button>
              </div>
            )}
          </div>

          {/* Results Display */}
          {(loading && results.length === 0) ? (
            <div className="flex items-center justify-center" style={{ height: 240, color: 'var(--text-muted)' }}>
              <div className="animate-spin" style={{ width: 28, height: 28, border: '2px solid var(--border-subtle)', borderTopColor: 'var(--color-brand)', borderRadius: '50%' }} />
            </div>
          ) : results.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '60px 20px', color: 'var(--text-muted)' }}>
              {filterMode === 'liked' ? (
                <Heart size={44} style={{ margin: '0 auto 16px', opacity: 0.35, color: 'var(--color-rose, #f43f5e)' }} />
              ) : (
                <Palette size={44} style={{ margin: '0 auto 16px', opacity: 0.3 }} />
              )}
              <div className="text-base font-semibold" style={{ marginBottom: 6, color: 'var(--text-main)' }}>
                {filterMode === 'liked'
                  ? 'No liked wallpapers yet'
                  : (query || selectedTags.length || filterMode !== 'all' || selectedCategory !== 'all' || typeFilter ? 'No wallpapers match your criteria' : 'No community wallpapers available')}
              </div>
              <div className="text-xs text-subtle" style={{ maxWidth: 360, margin: '0 auto 16px' }}>
                {filterMode === 'liked'
                  ? 'Click the heart icon on any wallpaper card to save it to your favorites.'
                  : (query || selectedTags.length || filterMode !== 'all' || selectedCategory !== 'all' || typeFilter
                      ? 'Try clearing some filters or search with broader terms.'
                      : 'Be the first creator to share a wallpaper with the community!')}
              </div>
              <button
                className="btn btn-primary"
                style={{ fontSize: 12 }}
                onClick={() => {
                  setQuery('')
                  setSelectedCategory('all')
                  setSelectedTags([])
                  setTypeFilter('')
                  setFilterMode('all')
                }}
              >
                Reset Filters
              </button>
            </div>
          ) : browseView === 'compact' ? (
            /* ── COMPACT LIST VIEW ── */
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, opacity: isSearching ? 0.75 : 1, transition: 'opacity 0.15s ease' }}>
              {results.map(item => {
                const urlOrSource = item.source || ''
                const hasImageExt = /\.(png|jpg|jpeg|webp|bmp|gif|avif)$/i.test(urlOrSource) || urlOrSource.includes('images.unsplash.com') || ['image', 'jpg', 'jpeg', 'png', 'webp', 'avif'].includes(String(item.mediaFormat || '').toLowerCase())
                const isItemImage = item.type === 'image' || hasImageExt
                const badge = (isItemImage ? TYPE_BADGES.image : TYPE_BADGES[item.type]) || {}
                const rowLiked = isItemLikedByUser(item)
                const { likes: currentLikes, downloads: currentDownloads } = getWallpaperMetrics(item, likeCounts, downloadCounts, rowLiked)
                const targetId = `community-${item.id}`
                const isInstalled = (installed || []).some(i => i?.id === targetId || i?.communityMeta?.originalId === item.id)
                const isCurrentlyApplied = isWallpaperRunning && (currentDesktopWallpaper?.id === targetId || activeWallpaper?.id === targetId)
                const isApplying = applyingId === item.id

                return (
                  <div key={item.id} className="community-list-row">
                    {/* Thumbnail */}
                    <div
                      style={{
                        width: 72,
                        height: 44,
                        borderRadius: 6,
                        overflow: 'hidden',
                        background: '#000',
                        cursor: 'pointer',
                        flexShrink: 0,
                        position: 'relative',
                      }}
                      onClick={() => setPreviewItem(item)}
                      title="Click to preview"
                    >
                      {item.preview ? (
                        <img src={item.preview} alt={item.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                      ) : (
                        <div className="flex items-center justify-center w-full h-full text-subtle text-xs">
                          {item.type}
                        </div>
                      )}
                    </div>

                    {/* Info */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div className="flex items-center gap-2">
                        <span
                          className="font-semibold text-sm truncate"
                          style={{ color: 'var(--text-main)', cursor: 'pointer' }}
                          onClick={() => setPreviewItem(item)}
                          title={item.name}
                        >
                          {item.name}
                        </span>
                        {item.featured && (
                          <span className="badge badge-amber" style={{ fontSize: 9, padding: '1px 5px' }}>
                            Featured
                          </span>
                        )}
                        <span
                          style={{
                            fontSize: 10,
                            fontWeight: 600,
                            color: badge.color || 'var(--text-muted)',
                            background: 'rgba(255,255,255,0.05)',
                            padding: '1px 6px',
                            borderRadius: 4,
                          }}
                        >
                          {badge.label || (isItemImage ? 'Image' : item.type)}
                        </span>
                        {item.hasAudio && (
                          <span
                            className="badge"
                            style={{
                              fontSize: 9.5,
                              padding: '1px 5px',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: 3,
                              background: 'rgba(168,85,247,0.15)',
                              color: 'var(--color-purple, #a855f7)',
                              border: '1px solid rgba(168,85,247,0.3)',
                            }}
                          >
                            <Music size={9} /> Audio
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-muted" style={{ marginTop: 2, display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                        <span>by</span>
                        {item.authorPortfolio ? (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation()
                              openExternalUrl(item.authorPortfolio)
                            }}
                            title={`Open ${item.author}'s portfolio (${item.authorPortfolio})`}
                            style={{
                              background: 'none', border: 'none', padding: 0,
                              color: 'var(--color-brand)', fontWeight: 600, cursor: 'pointer',
                              display: 'inline-flex', alignItems: 'center', gap: 3,
                              textDecoration: 'underline', textUnderlineOffset: 2,
                              fontSize: 'inherit'
                            }}
                          >
                            {item.author || 'Anonymous'} <ExternalLink size={10} />
                          </button>
                        ) : (
                          <span style={{ color: 'var(--text-main)', fontWeight: 500 }}>{item.author || 'Anonymous'}</span>
                        )}
                        {item.license && (
                          <span
                            className="badge"
                            title={LICENSE_OPTIONS.find(o => o.id === item.license)?.desc || item.license}
                            style={{
                              fontSize: 9.5, padding: '1px 5px', borderRadius: 4,
                              background: 'rgba(255,255,255,0.06)', color: 'var(--text-muted)',
                              border: '1px solid var(--border-subtle)', fontWeight: 600
                            }}
                          >
                            {LICENSE_OPTIONS.find(o => o.id === item.license)?.badge || item.license}
                          </span>
                        )}
                        <span style={{ color: 'var(--text-subtle)' }}>
                          • {currentDownloads} downloads • {currentLikes} likes
                        </span>
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-1.5" style={{ flexShrink: 0 }}>
                      <button
                        className="btn btn-ghost"
                        style={{ padding: '4px 8px', fontSize: 11, display: 'flex', alignItems: 'center', gap: 4 }}
                        onClick={() => setPreviewItem(item)}
                        title="Live Preview"
                      >
                        <Eye size={12} />
                        <span>Preview</span>
                      </button>

                      {isInstalled ? (
                        <span
                          className="badge badge-emerald"
                          style={{ padding: '4px 8px', fontSize: 11, display: 'flex', alignItems: 'center', gap: 3 }}
                          title="In Library"
                        >
                          <Check size={10} /> Library
                        </span>
                      ) : (
                        <button
                          className="btn btn-ghost"
                          style={{ padding: '4px 8px', fontSize: 11, display: 'flex', alignItems: 'center', gap: 4 }}
                          disabled={addingLibraryId === item.id || isApplying}
                          onClick={() => handleAddToLibrary(item)}
                          title="Add to Library"
                        >
                          <FolderPlus size={11} />
                          <span>{addingLibraryId === item.id ? '…' : '+ Library'}</span>
                        </button>
                      )}

                      {isCurrentlyApplied ? (
                        <span
                          className="badge badge-emerald"
                          style={{ padding: '4px 9px', fontSize: 11, display: 'flex', alignItems: 'center', gap: 3 }}
                        >
                          <Check size={11} /> Active
                        </span>
                      ) : (
                        <button
                          className="btn btn-secondary"
                          style={{ padding: '4px 10px', fontSize: 11, display: 'flex', alignItems: 'center', gap: 4 }}
                          disabled={isApplying}
                          onClick={() => handleInstall(item)}
                        >
                          {isItemImage ? <Image size={11} /> : <Play size={11} />}
                          <span>{isApplying ? 'Applying…' : 'Apply'}</span>
                        </button>
                      )}

                      {/* Admin Superpowers in Compact Mode */}
                      {isAdmin && (
                        <>
                          <button
                            className="admin-action-btn"
                            style={{
                              background: item.featured ? 'color-mix(in srgb, var(--color-amber) 20%, transparent)' : 'rgba(255,255,255,0.06)',
                              color: item.featured ? 'var(--color-amber)' : 'var(--text-muted)',
                              padding: '4px 7px',
                            }}
                            onClick={() => handleToggleFeature(item)}
                            title={item.featured ? 'Unfeature' : 'Feature'}
                          >
                            <Star size={11} fill={item.featured ? 'currentColor' : 'none'} />
                          </button>

                          <button
                            className="btn btn-danger"
                            style={{ padding: '4px 8px', fontSize: 11, display: 'flex', alignItems: 'center', gap: 4 }}
                            onClick={() => {
                              setTakedownTarget(item)
                              setTakedownReason('')
                            }}
                            title="Immediately remove wallpaper"
                          >
                            <Trash2 size={11} />
                            <span>Take Down</span>
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          ) : (
            /* ── GRID CARDS VIEW (Concept 7: The Translucent Floating Hub) ── */
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(420px, 1fr))', gap: 24, opacity: isSearching ? 0.75 : 1, transition: 'opacity 0.15s ease' }}>
              {results.map(item => {
                const isLiked = isItemLikedByUser(item)
                const { likes: currentLikes, downloads: currentDownloads } = getWallpaperMetrics(item, likeCounts, downloadCounts, isLiked)

                const targetId = `community-${item.id}`
                const libraryItem = (installed || []).find(i => i?.id === targetId || i?.communityMeta?.originalId === item.id)
                const isInstalledInLibrary = Boolean(libraryItem)

                const urlOrSource = item.source || ''
                const hasImageExt = /\.(png|jpg|jpeg|webp|bmp|gif|avif)$/i.test(urlOrSource) || urlOrSource.includes('images.unsplash.com') || ['image', 'jpg', 'jpeg', 'png', 'webp', 'avif'].includes(String(item.mediaFormat || '').toLowerCase())
                const isImage = item.type === 'image' || hasImageExt
                const isEngine = !isImage && (item.type === 'engine' || Boolean(item.engine))
                const isStreamItem = !isImage && !isEngine && (item.type === 'youtube' || item.type === 'stream' || Boolean(parseYouTubeId(item.source)))
                const isVideo = !isImage && !isEngine && !isStreamItem

                const isLocallyCached = Boolean(libraryItem && (libraryItem.storageStatus === 'cached' || libraryItem.storageStatus === 'downloaded' || libraryItem.localPath || (isEngine && isInstalledInLibrary)))
                const isCurrentlyApplied = isWallpaperRunning && (currentDesktopWallpaper?.id === targetId || activeWallpaper?.id === targetId)
                const isApplying = applyingId === item.id
                const isAddingLib = addingLibraryId === item.id
                const isDownloading = downloadingIds.has(item.id)
                const rawProg = downloadProgress[item.id]
                const downloadInfo = typeof rawProg === 'object' && rawProg !== null
                  ? rawProg
                  : { percent: typeof rawProg === 'number' ? rawProg : 0, downloaded: 0, total: 0 }
                const downloadPercent = downloadInfo.percent || 0
                const isNoDownload = isStreamItem

                // Spec calculations
                const formatLabel = item.dimensions?.includes('3840') || item.tags?.includes('4K') || item.tags?.includes('4k')
                  ? '4K UHD'
                  : (item.dimensions ? item.dimensions : (isImage ? 'HD PHOTO' : (item.type === 'video' ? '1080P FHD' : 'HD ART')))
                const fpsOrDuration = item.duration ? `${item.duration}s • 60 FPS` : '60 FPS'
                const rawBytes = item.fileSize || item.file_size || 0
                const formattedSize = formatBytes(rawBytes)

                const cleanAuthor = item.author || 'Community Artist'
                const authorPortfolio = item.authorPortfolio || item.author_portfolio || item.communityMeta?.authorPortfolio || ''

                return (
                  <div key={item.id} className="hub-card">
                    {/* 16:9 Artwork Background */}
                    <div className="hub-card-media">
                      {item.preview ? (
                        <img
                          src={item.preview}
                          alt={item.name}
                          className="hub-card-img"
                          loading="lazy"
                        />
                      ) : (
                        <div className="flex items-center justify-center w-full h-full text-subtle text-xs">
                          No preview available
                        </div>
                      )}
                    </div>

                    {/* Cinematic Scrim */}
                    <div className="hub-card-scrim" />

                    {/* Left-Side Vertical Spec Stack */}
                    <div className="hub-specs-stack">
                      {item.category && (
                        <span
                          className="hub-spec-pill"
                          style={{
                            textTransform: 'uppercase',
                            color: 'var(--color-brand)',
                            borderColor: 'rgba(59, 130, 246, 0.4)',
                            fontWeight: 700,
                            letterSpacing: '0.04em',
                          }}
                        >
                          {item.category}
                        </span>
                      )}
                      <span className="hub-spec-pill">
                        {formatLabel}
                      </span>
                      <span className="hub-spec-pill">
                        {isImage ? 'Static Artwork' : (isEngine ? 'Procedural Engine' : (isStreamItem ? 'Live Stream' : fpsOrDuration))}
                      </span>
                      {item.hasAudio && (
                        <span
                          className="hub-spec-pill"
                          style={{
                            color: '#c084fc',
                            borderColor: 'rgba(192, 132, 252, 0.35)',
                            background: 'rgba(35, 18, 50, 0.65)',
                          }}
                        >
                          <Music size={9.5} />
                          <span>Audio Track</span>
                        </span>
                      )}
                      {!isNoDownload && formattedSize && (
                        <span className="hub-spec-pill">
                          {formattedSize}
                        </span>
                      )}
                    </div>

                    {/* Top-Right Badges & Controls */}
                    <div className="hub-top-right">
                      {item.featured && (
                        <div
                          className="hub-top-badge"
                          style={{
                            background: 'rgba(234, 179, 8, 0.92)',
                            color: '#000',
                            fontWeight: 700,
                            boxShadow: '0 2px 8px rgba(234, 179, 8, 0.4)',
                          }}
                        >
                          <Star size={9.5} fill="#000" />
                          <span>Featured</span>
                        </div>
                      )}

                      {isAdmin && (
                        <button
                          type="button"
                          style={{
                            padding: '2px 8px',
                            height: 22,
                            fontSize: 9.5,
                            fontWeight: 600,
                            borderRadius: 999,
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 3,
                            background: 'rgba(239, 68, 68, 0.88)',
                            backdropFilter: 'blur(8px)',
                            WebkitBackdropFilter: 'blur(8px)',
                            border: '1px solid rgba(255, 255, 255, 0.25)',
                            color: '#ffffff',
                            cursor: 'pointer',
                          }}
                          onClick={(e) => {
                            e.stopPropagation()
                            setTakedownTarget(item)
                            setTakedownReason('')
                          }}
                          title="Instant Admin Takedown"
                        >
                          <Trash2 size={10} />
                          <span>Takedown</span>
                        </button>
                      )}

                      <button
                        type="button"
                        className={`hub-like-btn ${isLiked ? 'liked' : ''}`}
                        onClick={(e) => {
                          e.stopPropagation()
                          handleLike(item.id)
                        }}
                        disabled={likingId === item.id}
                        title={isLiked ? 'Unlike' : 'Like'}
                      >
                        <Heart size={10.5} fill={isLiked ? 'currentColor' : 'none'} />
                        <span>{currentLikes}</span>
                      </button>
                    </div>

                    {/* Center Frosted Glass Play/Preview Trigger */}
                    <button
                      type="button"
                      className="hub-center-play"
                      onClick={() => setPreviewItem(item)}
                      title={`Preview ${item.name}`}
                      aria-label={`Preview ${item.name}`}
                    >
                      {isImage ? (
                        <Eye size={20} color="#ffffff" />
                      ) : (
                        <Play size={20} fill="#ffffff" />
                      )}
                    </button>

                    {/* Bottom Row: Title Lockup & Translucent Floating Hub */}
                    <div className="hub-bottom-row">
                      {/* Bottom-Left Title Lockup */}
                      <div className="hub-title-lockup">
                        <h3 className="hub-title-text" title={item.name}>
                          {item.name}
                        </h3>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'nowrap' }}>
                          {authorPortfolio ? (
                            <button
                              type="button"
                              className="hub-author-link"
                              onClick={(e) => {
                                e.stopPropagation()
                                openExternalUrl(authorPortfolio)
                              }}
                              title={`Open ${cleanAuthor}'s portfolio (${authorPortfolio})`}
                            >
                              <span>by {cleanAuthor}</span>
                              <ExternalLink size={9.5} />
                            </button>
                          ) : (
                            <span className="hub-author-link" style={{ cursor: 'default' }}>
                              by {cleanAuthor}
                            </span>
                          )}
                          {item.license && (
                            <span
                              className="hub-spec-pill"
                              style={{
                                padding: '1px 5px',
                                fontSize: '8.5px',
                                background: 'rgba(255, 255, 255, 0.08)',
                                border: '1px solid rgba(255, 255, 255, 0.18)',
                                borderRadius: 4,
                                color: 'rgba(255, 255, 255, 0.75)',
                                boxShadow: 'none',
                              }}
                              title={LICENSE_OPTIONS.find(o => o.id === item.license)?.desc || item.license}
                            >
                              {LICENSE_OPTIONS.find(o => o.id === item.license)?.badge || item.license}
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Bottom-Right Translucent Floating Hub */}
                      <div className="hub-floating-dock" onClick={(e) => e.stopPropagation()}>
                        <div className="hub-artist-header" style={{ display: 'flex', alignItems: 'center', gap: '4px', justifyContent: 'flex-start' }}>
                          <span style={{ fontSize: '8px', opacity: 0.65, flexShrink: 0 }}>BY</span>
                          {authorPortfolio ? (
                            <button
                              type="button"
                              className="hub-artist-header-link"
                              onClick={(e) => {
                                e.stopPropagation()
                                openExternalUrl(authorPortfolio)
                              }}
                              title={`Portfolio / Source: ${authorPortfolio}`}
                              style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }}
                            >
                              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{cleanAuthor}</span>
                              <ExternalLink size={7.5} style={{ flexShrink: 0 }} />
                            </button>
                          ) : (
                            <span style={{ color: 'rgba(255,255,255,0.9)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }}>
                              {cleanAuthor}
                            </span>
                          )}
                        </div>

                        {/* 1. ▶ Apply */}
                        {isCurrentlyApplied ? (
                          <div className="hub-dock-btn hub-btn-apply active" title="Active live wallpaper on desktop">
                            <Check size={11} />
                            <span>Active</span>
                          </div>
                        ) : (
                          <button
                            type="button"
                            className="hub-dock-btn hub-btn-apply"
                            disabled={isApplying || isDownloading}
                            onClick={() => handleInstall(item)}
                            title="Apply directly to desktop"
                          >
                            {isApplying ? (
                              <>
                                <RefreshCw size={10.5} className="spin" />
                                <span>Applying…</span>
                              </>
                            ) : (
                              <>
                                {isImage ? <Image size={10} /> : <Play size={10} fill="currentColor" />}
                                <span>Apply</span>
                              </>
                            )}
                          </button>
                        )}

                        {/* 2. 📁 Add to Library */}
                        {isInstalledInLibrary ? (
                          <div className="hub-dock-btn hub-btn-cloud saved" title="Saved to your Library">
                            <Check size={11} />
                            <span>In Library</span>
                          </div>
                        ) : (
                          <button
                            type="button"
                            className="hub-dock-btn hub-btn-cloud"
                            disabled={isAddingLib || isApplying}
                            onClick={() => handleAddToLibrary(item)}
                            title="Save to Library"
                          >
                            {isAddingLib ? (
                              <>
                                <RefreshCw size={10.5} className="spin" />
                                <span>Saving…</span>
                              </>
                            ) : (
                              <>
                                <FolderPlus size={11} />
                                <span>+ Library</span>
                              </>
                            )}
                          </button>
                        )}

                        {/* 3. ⬇ Download Offline (Only for downloadable files, NOT YouTube / Web Streams) */}
                        {!isNoDownload && (
                          isLocallyCached ? (
                            <div className="hub-dock-btn hub-btn-download cached" title="Media downloaded to disk — ready for 100% offline playback">
                              <Check size={11} />
                              <span>Downloaded</span>
                            </div>
                          ) : (
                            <button
                              type="button"
                              className="hub-dock-btn hub-btn-download"
                              disabled={isDownloading || isApplying}
                              onClick={() => handleDownloadOffline(item)}
                              title={isEngine ? 'Download engine for 100% offline playback' : (formattedSize ? `Download media file (${formattedSize}) for offline playback` : 'Download for offline playback')}
                            >
                              {isDownloading ? (
                                <>
                                  <RefreshCw size={10.5} className="spin" />
                                  <span>{downloadPercent > 0 ? `${downloadPercent}%` : 'Downloading…'}</span>
                                </>
                              ) : (
                                <>
                                  <Download size={11} />
                                  <span>Download {isEngine ? 'Offline' : (formattedSize ? `(${formattedSize})` : 'Offline')}</span>
                                </>
                              )}
                            </button>
                          )
                        )}
                      </div>
                    </div>

                    {/* Active Download Progress Bar on Card */}
                    {isDownloading && (
                      <div style={{ padding: '0 14px 10px', marginTop: -4 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: 'var(--color-brand)', marginBottom: 3, fontWeight: 600 }}>
                          <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                            <RefreshCw size={9} className="spin" />
                            <span>Downloading…</span>
                          </span>
                          <span>
                            {downloadPercent > 0 ? `${downloadPercent}%` : ''}
                            {downloadInfo.total > 0 ? ` (${formatBytes(downloadInfo.downloaded)} / ${formatBytes(downloadInfo.total)})` : ''}
                          </span>
                        </div>
                        <div style={{ width: '100%', height: 4, background: 'rgba(255,255,255,0.12)', borderRadius: 2, overflow: 'hidden' }}>
                          <div
                            style={{
                              width: `${Math.max(4, downloadPercent)}%`,
                              height: '100%',
                              background: 'linear-gradient(90deg, var(--color-brand), #a855f7)',
                              borderRadius: 2,
                              transition: 'width 0.2s ease',
                            }}
                          />
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </>
      )}

      {/* ── MANAGE & TAKEDOWNS TAB (Admin Only) ── */}
      {tab === 'manage' && isAdmin && (
        <div className="animate-fadeIn">
          {/* ── Team & Moderators Management Card ── */}
          <div
            className="card"
            style={{
              padding: '20px 24px',
              borderRadius: 12,
              background: 'var(--bg-card)',
              border: '1px solid var(--border-main)',
              marginBottom: 20,
            }}
          >
            <div className="flex items-center justify-between" style={{ marginBottom: 8 }}>
              <div className="flex items-center gap-2">
                <Users size={18} style={{ color: 'var(--color-brand)' }} />
                <h2 className="font-semibold text-base" style={{ color: 'var(--text-main)' }}>
                  Team & Community Moderators
                </h2>
                <span className="badge badge-brand" style={{ fontSize: 11, padding: '2px 8px' }}>
                  {adminsList.length} active
                </span>
              </div>
              <button
                type="button"
                className="btn btn-ghost"
                style={{ height: 28, width: 28, padding: 4 }}
                onClick={() => loadAdminsList(true)}
                title="Refresh moderators list"
                disabled={loadingAdmins}
              >
                <RefreshCw size={13} className={loadingAdmins ? 'animate-spin' : ''} />
              </button>
            </div>

            <p className="text-xs text-muted" style={{ marginBottom: 16, lineHeight: 1.5 }}>
              Moderators have full authority to review pending submissions, approve wallpapers into the live catalog, and take down reported items. You can grant or revoke rights at any time without editing code.
            </p>

            {/* Add Moderator Bar */}
            <form onSubmit={handleAddModerator} className="flex gap-2" style={{ marginBottom: 16 }}>
              <div style={{ position: 'relative', flex: 1 }}>
                <UserPlus size={14} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                <input
                  type="email"
                  placeholder="Enter team member's email (e.g. colleague@gmail.com)..."
                  value={newAdminEmail}
                  onChange={e => {
                    setNewAdminEmail(e.target.value)
                    if (adminError) setAdminError(null)
                  }}
                  disabled={addingAdmin}
                  style={{
                    width: '100%',
                    padding: '9px 12px 9px 34px',
                    borderRadius: 8,
                    background: 'var(--bg-base)',
                    border: adminError ? '1px solid var(--color-rose)' : '1px solid var(--border-main)',
                    color: 'var(--text-main)',
                    fontSize: 13,
                    outline: 'none',
                  }}
                />
              </div>
              <button
                type="submit"
                className="btn btn-primary"
                disabled={addingAdmin || !newAdminEmail.trim()}
                style={{ padding: '8px 18px', fontSize: 12, display: 'flex', alignItems: 'center', gap: 6 }}
              >
                <UserPlus size={13} />
                <span>{addingAdmin ? 'Granting…' : 'Grant Moderator Rights'}</span>
              </button>
            </form>

            {adminError && (
              <div className="text-xs" style={{ color: 'var(--color-rose)', marginBottom: 14 }}>
                {adminError}
              </div>
            )}

            {/* Moderators List */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {adminsList.map(admin => {
                const isOwner = admin.role === 'owner' || admin.email?.toLowerCase() === ROOT_OWNER_EMAIL.toLowerCase()
                const isRevoking = revokingAdminEmail === admin.email
                return (
                  <div
                    key={admin.email || admin.id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '10px 14px',
                      borderRadius: 8,
                      background: 'color-mix(in srgb, var(--bg-base) 60%, transparent)',
                      border: '1px solid var(--border-subtle)',
                    }}
                  >
                    <div className="flex items-center gap-2.5" style={{ minWidth: 0, flex: 1 }}>
                      <div
                        style={{
                          width: 28,
                          height: 28,
                          borderRadius: '50%',
                          background: isOwner
                            ? 'color-mix(in srgb, var(--color-amber) 20%, transparent)'
                            : 'color-mix(in srgb, var(--color-brand) 20%, transparent)',
                          color: isOwner ? 'var(--color-amber)' : 'var(--color-brand)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontSize: 11,
                          fontWeight: 700,
                          flexShrink: 0,
                        }}
                      >
                        {isOwner ? <ShieldCheck size={14} /> : <Shield size={14} />}
                      </div>

                      <div style={{ minWidth: 0, flex: 1 }}>
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-semibold text-xs text-main" style={{ wordBreak: 'break-all' }}>
                            {admin.email}
                          </span>
                          {isOwner ? (
                            <span
                              style={{
                                fontSize: 10,
                                padding: '1px 6px',
                                borderRadius: 4,
                                background: 'color-mix(in srgb, var(--color-amber) 15%, transparent)',
                                color: 'var(--color-amber)',
                                border: '1px solid color-mix(in srgb, var(--color-amber) 30%, transparent)',
                                fontWeight: 600,
                              }}
                            >
                              Owner / Super Admin
                            </span>
                          ) : (
                            <span
                              style={{
                                fontSize: 10,
                                padding: '1px 6px',
                                borderRadius: 4,
                                background: 'color-mix(in srgb, var(--color-brand) 15%, transparent)',
                                color: 'var(--color-brand)',
                                border: '1px solid color-mix(in srgb, var(--color-brand) 30%, transparent)',
                                fontWeight: 600,
                              }}
                            >
                              Moderator
                            </span>
                          )}
                        </div>
                        {admin.added_by && (
                          <div className="text-xs text-muted" style={{ fontSize: 11, marginTop: 1 }}>
                            Added by: {admin.added_by}
                          </div>
                        )}
                      </div>
                    </div>

                    <div style={{ flexShrink: 0, marginLeft: 12 }}>
                      {isOwner ? (
                        <span className="text-xs text-muted" style={{ fontSize: 11 }}>
                          Permanent
                        </span>
                      ) : (
                        <button
                          type="button"
                          className="btn btn-ghost"
                          disabled={isRevoking}
                          onClick={() => handleRevokeModerator(admin)}
                          style={{
                            color: 'var(--color-rose)',
                            fontSize: 11,
                            padding: '4px 10px',
                            height: 26,
                            display: 'flex',
                            alignItems: 'center',
                            gap: 4,
                          }}
                        >
                          <Trash2 size={12} />
                          <span>{isRevoking ? 'Revoking…' : 'Revoke'}</span>
                        </button>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Quick Takedown Input Banner */}
          <div
            className="card"
            style={{
              padding: '18px 22px',
              borderRadius: 12,
              background: 'color-mix(in srgb, var(--color-rose) 6%, var(--bg-card))',
              border: '1px solid color-mix(in srgb, var(--color-rose) 25%, var(--border-main))',
              marginBottom: 20,
            }}
          >
            <div className="flex items-center gap-2" style={{ marginBottom: 6 }}>
              <ShieldX size={18} style={{ color: 'var(--color-rose)' }} />
              <h2 className="font-semibold text-base" style={{ color: 'var(--text-main)' }}>
                Fast Takedown by URL or Wallpaper ID
              </h2>
            </div>
            <p className="text-xs text-muted" style={{ marginBottom: 12 }}>
              Paste any YouTube URL, stream link, or wallpaper ID to locate and remove it instantly without scrolling through the catalog.
            </p>

            <div className="flex gap-2">
              <input
                type="text"
                placeholder="Paste YouTube link or ID (e.g. https://www.youtube.com/watch?v=... or sub_abc123)"
                value={quickTakedownInput}
                onChange={e => setQuickTakedownInput(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter') handleQuickTakedownByUrlOrId()
                }}
                style={{
                  flex: 1,
                  padding: '9px 12px',
                  borderRadius: 8,
                  background: 'var(--bg-base)',
                  border: '1px solid var(--border-main)',
                  color: 'var(--text-main)',
                  fontSize: 13,
                  outline: 'none',
                }}
              />
              <button
                type="button"
                className="btn btn-danger"
                style={{ padding: '8px 18px', fontSize: 12, display: 'flex', alignItems: 'center', gap: 6 }}
                onClick={handleQuickTakedownByUrlOrId}
              >
                <Trash2 size={13} />
                <span>Locate & Take Down</span>
              </button>
            </div>
          </div>

          {/* Full Catalog Table with Search Filter */}
          <div className="flex items-center justify-between" style={{ marginBottom: 14 }}>
            <div className="flex items-center gap-2">
              <h3 className="font-semibold text-sm">Published Wallpapers Catalog</h3>
              <span className="badge" style={{ fontSize: 11 }}>{manageFilteredWallpapers.length} total</span>
            </div>

            <div style={{ position: 'relative', width: 260 }}>
              <Search size={13} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
              <input
                type="text"
                placeholder="Filter by title, author, ID…"
                value={manageSearch}
                onChange={e => setManageSearch(e.target.value)}
                style={{
                  width: '100%',
                  padding: '6px 10px 6px 30px',
                  fontSize: 12,
                  borderRadius: 6,
                  background: 'var(--bg-card)',
                  border: '1px solid var(--border-main)',
                  color: 'var(--text-main)',
                  outline: 'none',
                }}
              />
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {manageFilteredWallpapers.map(item => {
              const badge = TYPE_BADGES[item.type] || {}
              const currentDownloads = Math.max(item.downloads || 0, downloadCounts[item.id] ?? 0)
              const currentLikes = likeCounts[item.id] ?? item.likes ?? 0

              return (
                <div key={item.id} className="community-list-row" style={{ padding: '8px 12px' }}>
                  {/* Thumbnail */}
                  <div
                    style={{
                      width: 58,
                      height: 36,
                      borderRadius: 6,
                      overflow: 'hidden',
                      background: '#000',
                      cursor: 'pointer',
                      flexShrink: 0,
                    }}
                    onClick={() => setPreviewItem(item)}
                    title="Preview wallpaper"
                  >
                    {item.preview ? (
                      <img src={item.preview} alt={item.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    ) : (
                      <div className="flex items-center justify-center w-full h-full text-subtle text-xs">
                        {item.type}
                      </div>
                    )}
                  </div>

                  {/* Name, Author, Type */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="flex items-center gap-2">
                      <span
                        className="font-semibold text-sm truncate"
                        style={{ color: 'var(--text-main)', cursor: 'pointer' }}
                        onClick={() => setPreviewItem(item)}
                        title={item.name}
                      >
                        {item.name}
                      </span>
                      {item.featured && <span className="badge badge-amber" style={{ fontSize: 9 }}>Featured</span>}
                      <span style={{ fontSize: 10, color: badge.color, fontWeight: 600 }}>{badge.label || item.type}</span>
                    </div>
                    <div className="text-xs text-muted" style={{ fontSize: 11 }}>
                      by {item.author || 'Anonymous'} • <span className="text-subtle font-mono">{item.id}</span>
                    </div>
                  </div>

                  {/* Stats */}
                  <div className="text-xs text-muted" style={{ minWidth: 120, textAlign: 'right', fontSize: 11 }}>
                    {currentDownloads} dl • {currentLikes} likes
                  </div>

                  {/* Action Buttons */}
                  <div className="flex items-center gap-1.5" style={{ flexShrink: 0 }}>
                    <button
                      className="btn btn-ghost"
                      style={{ padding: '5px 8px', fontSize: 11, display: 'flex', alignItems: 'center', gap: 4 }}
                      onClick={() => setPreviewItem(item)}
                      title="Preview"
                    >
                      <Eye size={12} />
                      <span>Preview</span>
                    </button>

                    <button
                      className="admin-action-btn"
                      style={{
                        background: item.featured ? 'color-mix(in srgb, var(--color-amber) 20%, transparent)' : 'rgba(255,255,255,0.06)',
                        color: item.featured ? 'var(--color-amber)' : 'var(--text-muted)',
                        padding: '5px 8px',
                        fontSize: 11,
                      }}
                      onClick={() => handleToggleFeature(item)}
                      title={item.featured ? 'Remove from Featured' : 'Feature this wallpaper'}
                    >
                      <Star size={11} fill={item.featured ? 'currentColor' : 'none'} />
                      <span>{item.featured ? 'Featured' : 'Feature'}</span>
                    </button>

                    <button
                      className="btn btn-danger"
                      style={{ padding: '5px 10px', fontSize: 11, display: 'flex', alignItems: 'center', gap: 4 }}
                      onClick={() => {
                        setTakedownTarget(item)
                        setTakedownReason('')
                      }}
                      title="Take Down this wallpaper"
                    >
                      <Trash2 size={11} />
                      <span>Take Down</span>
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* ── MODERATION QUEUE TAB (Admin Only) ── */}
      {tab === 'moderation' && isAdmin && (
        <div className="animate-fadeIn">
          <div
            style={{
              padding: '16px 20px',
              borderRadius: 10,
              background: 'color-mix(in srgb, var(--color-amber) 8%, var(--bg-card))',
              border: '1px solid color-mix(in srgb, var(--color-amber) 30%, var(--border-main))',
              marginBottom: 20,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              gap: 12,
            }}
          >
            <div>
              <div className="flex items-center gap-2">
                <ShieldCheck size={18} style={{ color: 'var(--color-amber)' }} />
                <h2 className="font-semibold text-base" style={{ color: 'var(--text-main)' }}>
                  Moderator Review Queue
                </h2>
                <span className="badge badge-amber" style={{ fontSize: 11 }}>
                  {pendingQueue.length} pending
                </span>
              </div>
              <p className="text-xs text-muted" style={{ marginTop: 4 }}>
                Review community submissions. Approving makes a wallpaper live in the feed immediately. No GitHub commits required.
              </p>
            </div>
            <button
              className="btn btn-ghost"
              style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 6 }}
              onClick={loadPendingQueue}
              disabled={loadingQueue}
            >
              <RefreshCw size={13} className={loadingQueue ? 'animate-spin' : ''} />
              <span>Refresh Queue</span>
            </button>
          </div>

          {loadingQueue ? (
            <div className="flex items-center justify-center" style={{ height: 200, color: 'var(--text-muted)' }}>
              <div className="animate-spin" style={{ width: 28, height: 28, border: '2px solid var(--border-main)', borderTopColor: 'var(--color-brand)', borderRadius: '50%' }} />
            </div>
          ) : pendingQueue.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '60px 20px', color: 'var(--text-muted)' }}>
              <CheckCircle size={44} style={{ margin: '0 auto 16px', color: 'var(--color-emerald)', opacity: 0.8 }} />
              <div className="text-base font-semibold" style={{ color: 'var(--text-main)', marginBottom: 6 }}>
                All Caught Up!
              </div>
              <p className="text-xs text-subtle" style={{ maxWidth: 360, margin: '0 auto' }}>
                There are no pending submissions awaiting review. New community submissions will appear here automatically.
              </p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {pendingQueue.map(sub => {
                const isWorking = moderatingId === sub.id
                const subPreviewData = {
                  id: sub.id,
                  name: sub.title,
                  description: sub.description,
                  author: sub.author,
                  authorPortfolio: sub.authorPortfolio || sub.author_portfolio || '',
                  license: sub.license || 'CC BY-NC-ND 4.0',
                  type: sub.type,
                  source: sub.source,
                  preview: sub.preview,
                  tags: sub.tags,
                  downloads: 0,
                  likes: 0,
                  hasAudio: Boolean(sub.hasAudio || sub.has_audio),
                  fileSize: sub.fileSize || sub.file_size || 0,
                  dimensions: sub.dimensions || '',
                  mediaFormat: sub.mediaFormat || sub.media_format || '',
                  duration: sub.duration || 0,
                  stagingPath: sub.stagingPath || sub.staging_path || '',
                  githubAssetUrl: sub.githubAssetUrl || sub.github_asset_url || '',
                }

                return (
                  <div
                    key={sub.id}
                    className="card"
                    style={{
                      padding: '16px 20px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 18,
                      flexWrap: 'wrap',
                      background: 'var(--bg-card)',
                      border: '1px solid var(--border-main)',
                      borderRadius: 12,
                    }}
                  >
                    {/* Thumbnail preview */}
                    <div
                      style={{
                        width: 140,
                        height: 84,
                        borderRadius: 8,
                        overflow: 'hidden',
                        background: '#000',
                        position: 'relative',
                        flexShrink: 0,
                        cursor: 'pointer',
                      }}
                      onClick={() => setPreviewItem(subPreviewData)}
                      title="Click to live preview"
                    >
                      {sub.preview ? (
                        <img src={sub.preview} alt={sub.title} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                      ) : (
                        <div className="flex items-center justify-center w-full h-full text-subtle text-xs">
                          {sub.type}
                        </div>
                      )}
                      <div
                        style={{
                          position: 'absolute',
                          inset: 0,
                          background: 'rgba(0,0,0,0.4)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          opacity: 0.8,
                        }}
                      >
                        <Eye size={16} color="#fff" />
                      </div>
                    </div>

                    {/* Information */}
                    <div style={{ flex: 1, minWidth: 240 }}>
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="font-semibold text-sm" style={{ color: 'var(--text-main)' }}>
                          {sub.title}
                        </h3>
                        <span
                          className="badge"
                          style={{
                            fontSize: 10,
                            textTransform: 'uppercase',
                            background: 'rgba(255,255,255,0.06)',
                            border: '1px solid var(--border-main)',
                          }}
                        >
                          {sub.type}
                        </span>
                        {sub.hasAudio && (
                          <span
                            className="badge"
                            style={{
                              fontSize: 10,
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: 3,
                              background: 'rgba(168,85,247,0.15)',
                              color: 'var(--color-purple, #a855f7)',
                              border: '1px solid rgba(168,85,247,0.3)',
                            }}
                          >
                            <Music size={10} /> Has Audio
                          </span>
                        )}
                        {sub.fileSize > 0 && (
                          <span className="badge" style={{ fontSize: 10, background: 'rgba(255,255,255,0.06)', border: '1px solid var(--border-main)' }}>
                            {(sub.fileSize / (1024 * 1024)).toFixed(1)} MB
                          </span>
                        )}
                        {sub.dimensions && (
                          <span className="badge" style={{ fontSize: 10, background: 'rgba(255,255,255,0.06)', border: '1px solid var(--border-main)' }}>
                            {sub.dimensions}
                          </span>
                        )}
                        {sub.duration > 0 && (
                          <span className="badge" style={{ fontSize: 10, background: 'rgba(255,255,255,0.06)', border: '1px solid var(--border-main)' }}>
                            {Math.round(sub.duration)}s
                          </span>
                        )}
                      </div>

                      <div className="text-xs text-muted" style={{ marginTop: 4 }}>
                        Submitted by <span style={{ color: 'var(--text-main)', fontWeight: 500 }}>{sub.author}</span>
                        {sub.created_at && (
                          <span style={{ marginLeft: 8, color: 'var(--text-subtle)' }}>
                            • {new Date(sub.created_at).toLocaleDateString()}
                          </span>
                        )}
                      </div>

                      {sub.description && (
                        <p className="text-xs text-muted" style={{ marginTop: 6, lineHeight: 1.4 }}>
                          {sub.description}
                        </p>
                      )}

                      <div className="text-xs text-subtle" style={{ marginTop: 6, wordBreak: 'break-all' }}>
                        Source: <span style={{ color: 'var(--text-muted)' }}>{sub.source}</span>
                      </div>
                    </div>

                    {/* Actions: Live Preview, Approve, Reject */}
                    <div className="flex items-center gap-2" style={{ flexShrink: 0 }}>
                      <button
                        className="btn btn-secondary"
                        style={{ padding: '7px 12px', fontSize: 12, display: 'flex', alignItems: 'center', gap: 5 }}
                        onClick={() => setPreviewItem(subPreviewData)}
                      >
                        <Eye size={13} />
                        <span>Preview</span>
                      </button>

                      <button
                        className="btn btn-danger"
                        style={{ padding: '7px 12px', fontSize: 12, display: 'flex', alignItems: 'center', gap: 5 }}
                        disabled={isWorking}
                        onClick={() => handleReject(sub)}
                      >
                        <XCircle size={13} />
                        <span>Reject</span>
                      </button>

                      <button
                        className="btn btn-success"
                        style={{ padding: '7px 14px', fontSize: 12, display: 'flex', alignItems: 'center', gap: 5 }}
                        disabled={isWorking}
                        onClick={() => handleApprove(sub)}
                      >
                        <CheckCircle size={13} />
                        <span>Approve & Publish</span>
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* ── SUBMIT TAB ── */}
      {tab === 'submit' && (
        <div className="animate-fadeIn" style={{ maxWidth: 1060, margin: '0 auto' }}>
          {/* Guest notification banner if not authenticated */}
          {!isAuthenticated && (
            <div
              className="card"
              style={{
                padding: '12px 18px',
                marginBottom: 16,
                borderRadius: 10,
                background: 'color-mix(in srgb, var(--color-brand) 8%, var(--bg-card))',
                border: '1px solid color-mix(in srgb, var(--color-brand) 25%, transparent)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 12,
                flexWrap: 'wrap',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <LogIn size={18} style={{ color: 'var(--color-brand)', flexShrink: 0 }} />
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-main)' }}>
                    Browsing as Guest
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                    You can pick, preview, and configure your wallpaper now. You'll be prompted to sign in when you submit.
                  </div>
                </div>
              </div>
              <button
                type="button"
                className="btn btn-primary"
                style={{ fontSize: 12, padding: '6px 14px', display: 'inline-flex', alignItems: 'center', gap: 6 }}
                onClick={() => setShowAuthModal(true)}
              >
                <LogIn size={13} />
                <span>Sign In</span>
              </button>
            </div>
          )}

          <div className="card" style={{ padding: '22px 26px', width: '100%', margin: '0 auto' }}>
            {/* Header with Title + Hosting Badge */}
            <div className="flex items-center justify-between flex-wrap gap-2" style={{ marginBottom: 16 }}>
              <div>
                <h2 className="font-semibold text-lg" style={{ marginBottom: 2 }}>
                  Submit a Wallpaper to the Community
                </h2>
                <p className="text-xs text-muted">
                  Share animated loops, 4K digital art, or streams with the AetherFlow community.
                </p>
              </div>
              <div
                style={{
                  padding: '4px 10px',
                  borderRadius: 20,
                  fontSize: 11,
                  fontWeight: 500,
                  background: 'color-mix(in srgb, var(--color-brand) 12%, transparent)',
                  border: '1px solid color-mix(in srgb, var(--color-brand) 28%, transparent)',
                  color: 'var(--color-brand)',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 5,
                }}
              >
                <Sparkles size={11} />
                <span>Hosted on GitHub Releases CDN · 0 MB Supabase</span>
              </div>
            </div>

            {submitResult && (
              <div
                className={`card ${submitResult.success ? 'border-emerald' : 'border-rose'}`}
                style={{
                  padding: '12px 16px',
                  marginBottom: 16,
                  fontSize: 13,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  color: submitResult.success ? 'var(--color-emerald)' : 'var(--color-rose)',
                  background: submitResult.success ? 'color-mix(in srgb, var(--color-emerald) 10%, transparent)' : 'color-mix(in srgb, var(--color-rose) 10%, transparent)',
                }}
              >
                {submitResult.success ? <CheckCircle size={16} /> : <XCircle size={16} />}
                <span>{submitResult.message}</span>
              </div>
            )}

            {/* Streamlined Source & Type Segmented Switch */}
            <div
              style={{
                display: 'flex',
                background: 'var(--bg-base)',
                padding: 4,
                borderRadius: 10,
                border: '1px solid var(--border-main)',
                marginBottom: 18,
                gap: 4,
              }}
            >
              {[
                { id: 'video', label: 'Video Loop', sub: 'max 150 MB', icon: Video },
                { id: 'image', label: 'Picture / Art', sub: 'max 50 MB', icon: Image },
                { id: 'youtube', label: 'YouTube Stream', sub: 'Direct Link', icon: MonitorPlay },
                { id: 'stream', label: 'Web Stream URL', sub: 'Direct URL', icon: Globe },
              ].map(t => {
                const isSelected = submitForm.type === t.id
                return (
                  <button
                    key={t.id}
                    type="button"
                    className={`btn ${isSelected ? 'btn-primary' : 'btn-ghost'}`}
                    style={{
                      flex: 1,
                      padding: '8px 10px',
                      borderRadius: 8,
                      fontSize: 12,
                      fontWeight: isSelected ? 600 : 500,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 6,
                    }}
                    onClick={() => {
                      setSubmitForm(f => ({ ...f, type: t.id }))
                      if (t.id === 'youtube' || t.id === 'stream') {
                        setSelectedMediaFile(null)
                        setMediaInspection(null)
                      }
                    }}
                  >
                    <t.icon size={13} />
                    <span>{t.label}</span>
                    <span style={{ fontSize: 10, opacity: 0.65, fontWeight: 400 }}>({t.sub})</span>
                  </button>
                )
              })}
            </div>

            <form onSubmit={handleSubmit}>
              {/* 2-Column Responsive Layout */}
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'minmax(320px, 1.15fr) minmax(320px, 1fr)',
                  gap: 20,
                  alignItems: 'start',
                }}
              >
                {/* ── LEFT COLUMN: Media Asset & Live Preview ── */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                  <input
                    ref={fileInputRef}
                    type="file"
                    style={{ display: 'none' }}
                    accept={submitForm.type === 'video' ? '.mp4,.webm,video/mp4,video/webm' : '.png,.jpg,.jpeg,.webp,image/*'}
                    onChange={(e) => {
                      const file = e.target.files?.[0]
                      if (file) handleMediaSelection(file)
                      e.target.value = ''
                    }}
                  />

                  {(submitForm.type === 'video' || submitForm.type === 'image') ? (
                    <div>
                      {!mediaInspection ? (
                        <div
                          onDragOver={(e) => { e.preventDefault(); setIsDragOver(true) }}
                          onDragLeave={() => setIsDragOver(false)}
                          onDrop={handleDropMedia}
                          onClick={handleBrowseComputer}
                          style={{
                            border: `2px dashed ${isDragOver ? 'var(--color-brand)' : 'var(--border-main)'}`,
                            background: isDragOver ? 'color-mix(in srgb, var(--color-brand) 10%, var(--bg-base))' : 'var(--bg-base)',
                            borderRadius: 12,
                            padding: '36px 20px',
                            textAlign: 'center',
                            cursor: 'pointer',
                            transition: 'all 0.2s ease',
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'center',
                            justifyContent: 'center',
                            minHeight: 230,
                          }}
                        >
                          <div
                            style={{
                              width: 46,
                              height: 46,
                              borderRadius: 23,
                              background: 'color-mix(in srgb, var(--color-brand) 12%, transparent)',
                              color: 'var(--color-brand)',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              marginBottom: 12,
                            }}
                          >
                            <FileUp size={22} />
                          </div>
                          <div className="font-semibold text-sm mb-1" style={{ color: 'var(--text-main)' }}>
                            {inspectingMedia ? 'Inspecting media file…' : isDragOver ? 'Drop file here' : 'Click or Drag & Drop to Upload'}
                          </div>
                          <p className="text-xs text-muted" style={{ maxWidth: 280, margin: '0 auto 16px', lineHeight: 1.5 }}>
                            {submitForm.type === 'video'
                              ? 'Supports seamless .mp4 and .webm loops up to 150 MB. Resolution & audio detected.'
                              : 'Supports .png, .jpg, and .webp artwork up to 50 MB.'}
                          </p>
                          <button
                            type="button"
                            className="btn btn-secondary"
                            disabled={inspectingMedia}
                            onClick={(e) => {
                              e.stopPropagation()
                              handleBrowseComputer()
                            }}
                            style={{ fontSize: 12, padding: '7px 16px', display: 'inline-flex', alignItems: 'center', gap: 6 }}
                          >
                            <FolderOpen size={13} />
                            <span>Browse Computer</span>
                          </button>
                        </div>
                      ) : (
                        /* Selected Media Preview Showcase */
                        <div
                          className="card"
                          style={{
                            padding: 14,
                            borderRadius: 12,
                            background: 'var(--bg-base)',
                            border: '1px solid var(--border-accent, var(--border-main))',
                          }}
                        >
                          {/* 16:9 Thumbnail Header */}
                          <div
                            style={{
                              width: '100%',
                              aspectRatio: '16/9',
                              borderRadius: 8,
                              overflow: 'hidden',
                              background: '#000',
                              position: 'relative',
                              marginBottom: 12,
                            }}
                          >
                            <img
                              src={mediaInspection.previewDataUrl}
                              alt="Cover"
                              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                            />
                            {/* Overlay Badges */}
                            <div
                              style={{
                                position: 'absolute',
                                top: 8,
                                left: 8,
                                display: 'flex',
                                gap: 6,
                              }}
                            >
                              <span
                                style={{
                                  background: 'rgba(0,0,0,0.75)',
                                  backdropFilter: 'blur(6px)',
                                  borderRadius: 4,
                                  padding: '2px 6px',
                                  fontSize: 10,
                                  fontWeight: 600,
                                  color: '#fff',
                                  textTransform: 'uppercase',
                                }}
                              >
                                {mediaInspection.format}
                              </span>
                              {mediaInspection.dimensions && (
                                <span
                                  style={{
                                    background: 'rgba(0,0,0,0.75)',
                                    backdropFilter: 'blur(6px)',
                                    borderRadius: 4,
                                    padding: '2px 6px',
                                    fontSize: 10,
                                    fontWeight: 600,
                                    color: '#fff',
                                  }}
                                >
                                  {mediaInspection.dimensions}
                                </span>
                              )}
                            </div>

                            {mediaInspection.type === 'video' && (
                              <div
                                style={{
                                  position: 'absolute',
                                  bottom: 8,
                                  right: 8,
                                  background: 'rgba(0,0,0,0.85)',
                                  backdropFilter: 'blur(6px)',
                                  borderRadius: 5,
                                  padding: '2px 8px',
                                  fontSize: 10.5,
                                  color: '#fff',
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: 5,
                                  fontWeight: 500,
                                }}
                              >
                                {mediaInspection.hasAudio ? <Volume2 size={11} color="var(--color-emerald)" /> : <VolumeX size={11} color="var(--text-muted)" />}
                                <span>{mediaInspection.hasAudio ? 'Sound Included' : 'Muted Loop'} · {mediaInspection.duration}s</span>
                              </div>
                            )}
                          </div>

                          {/* File Details Bar */}
                          <div className="flex items-center justify-between gap-2">
                            <div style={{ minWidth: 0, flex: 1 }}>
                              <div className="font-semibold text-sm truncate" style={{ color: 'var(--text-main)' }}>
                                {mediaInspection.name || selectedMediaFile?.name || 'wallpaper'}
                              </div>
                              <div className="text-xs text-muted" style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 2 }}>
                                <span>{((mediaInspection.fileSize || 0) / (1024 * 1024)).toFixed(1)} MB</span>
                                <span>•</span>
                                <span style={{ color: 'var(--color-cyan)', display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                                  <Sparkles size={10} /> GitHub Releases CDN
                                </span>
                              </div>
                            </div>
                            <button
                              type="button"
                              className="btn btn-ghost"
                              style={{ fontSize: 11, padding: '5px 10px', flexShrink: 0 }}
                              onClick={() => {
                                setSelectedMediaFile(null)
                                setMediaInspection(null)
                                if (fileInputRef.current) fileInputRef.current.value = ''
                              }}
                            >
                              Change File
                            </button>
                          </div>
                        </div>
                      )}

                      {inspectError && (
                        <div className="text-xs" style={{ color: 'var(--color-rose)', marginTop: 8 }}>
                          ⚠️ {inspectError}
                        </div>
                      )}
                    </div>
                  ) : (
                    /* Stream URL Input */
                    <div>
                      <label className="text-xs font-semibold text-muted" style={{ display: 'block', marginBottom: 6 }}>
                        {submitForm.type === 'youtube' ? 'YouTube Stream or Video URL *' : 'Direct Video Stream URL *'}
                      </label>
                      <input
                        type="text"
                        required
                        placeholder={submitForm.type === 'youtube' ? 'https://www.youtube.com/watch?v=...' : 'https://example.com/loop.mp4'}
                        value={submitForm.source}
                        onChange={e => setSubmitForm(f => ({ ...f, source: e.target.value }))}
                        style={{
                          width: '100%', padding: '10px 12px',
                          background: 'var(--bg-base)', border: '1px solid var(--border-main)',
                          borderRadius: 8, color: 'var(--text-main)', fontSize: 13,
                        }}
                      />
                      <p className="text-xs text-muted" style={{ marginTop: 6 }}>
                        {submitForm.type === 'youtube'
                          ? 'Paste any live stream or video link. Cover thumbnail is automatically loaded.'
                          : 'Enter a publicly reachable MP4/HLS direct video URL.'}
                      </p>
                    </div>
                  )}
                </div>

                {/* ── RIGHT COLUMN: Metadata & Submit Action ── */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                  {/* Title */}
                  <div>
                    <label className="text-xs font-semibold text-muted" style={{ display: 'block', marginBottom: 6 }}>
                      Title *
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. Cyberpunk Alley Rain (1080p)"
                      value={submitForm.title}
                      onChange={e => setSubmitForm(f => ({ ...f, title: e.target.value }))}
                      style={{
                        width: '100%', padding: '9px 12px',
                        background: 'var(--bg-base)', border: '1px solid var(--border-main)',
                        borderRadius: 8, color: 'var(--text-main)', fontSize: 13,
                      }}
                    />
                  </div>

                  {/* Author Name */}
                  <div>
                    <label className="text-xs font-semibold text-muted" style={{ display: 'block', marginBottom: 6 }}>
                      Your Creator / Display Name
                    </label>
                    <input
                      type="text"
                      placeholder={authUser?.user_metadata?.full_name || authUser?.email?.split('@')[0] || 'e.g. Fextro'}
                      value={submitForm.authorName}
                      onChange={e => setSubmitForm(f => ({ ...f, authorName: e.target.value }))}
                      style={{
                        width: '100%', padding: '9px 12px',
                        background: 'var(--bg-base)', border: '1px solid var(--border-main)',
                        borderRadius: 8, color: 'var(--text-main)', fontSize: 13,
                      }}
                    />
                  </div>

                  {/* Artist Portfolio / Social Link */}
                  <div>
                    <label className="text-xs font-semibold text-muted" style={{ display: 'block', marginBottom: 6 }}>
                      Artist Portfolio / Social Link (Optional)
                    </label>
                    <input
                      type="text"
                      inputMode="url"
                      placeholder="e.g. mihirkumar.artstation.com or https://artstation.com/artist"
                      value={submitForm.authorPortfolio}
                      onChange={e => setSubmitForm(f => ({ ...f, authorPortfolio: e.target.value }))}
                      onBlur={e => {
                        const val = e.target.value.trim()
                        if (val && !/^https?:\/\//i.test(val)) {
                          setSubmitForm(f => ({ ...f, authorPortfolio: `https://${val}` }))
                        }
                      }}
                      style={{
                        width: '100%', padding: '9px 12px',
                        background: 'var(--bg-base)', border: '1px solid var(--border-main)',
                        borderRadius: 8, color: 'var(--text-main)', fontSize: 13,
                      }}
                    />
                  </div>

                  {/* License */}
                  <div>
                    <label className="text-xs font-semibold text-muted" style={{ display: 'block', marginBottom: 6 }}>
                      License
                    </label>
                    <select
                      value={submitForm.license}
                      onChange={e => setSubmitForm(f => ({ ...f, license: e.target.value }))}
                      style={{
                        width: '100%', padding: '9px 12px',
                        background: 'var(--bg-base)', border: '1px solid var(--border-main)',
                        borderRadius: 8, color: 'var(--text-main)', fontSize: 13,
                      }}
                    >
                      {LICENSE_OPTIONS.map(opt => (
                        <option key={opt.id} value={opt.id}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                    <p className="text-xs text-muted" style={{ marginTop: 5, lineHeight: 1.4 }}>
                      {LICENSE_OPTIONS.find(o => o.id === submitForm.license)?.desc}
                    </p>
                  </div>

                  {/* Tags */}
                  <div>
                    <label className="text-xs font-semibold text-muted" style={{ display: 'block', marginBottom: 6 }}>
                      Tags
                    </label>
                    {/* Selected Tags Badge List */}
                    {submitForm.tags.length > 0 && (
                      <div className="flex gap-1.5" style={{ flexWrap: 'wrap', marginBottom: 8 }}>
                        {submitForm.tags.map(tag => (
                          <span
                            key={tag}
                            className="badge badge-brand"
                            style={{
                              fontSize: 11,
                              padding: '3px 8px',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: 5,
                            }}
                          >
                            #{tag}
                            <button
                              type="button"
                              onClick={() => {
                                setSubmitForm(f => ({ ...f, tags: f.tags.filter(t => t !== tag) }))
                              }}
                              style={{
                                background: 'none',
                                border: 'none',
                                padding: 0,
                                cursor: 'pointer',
                                color: 'inherit',
                                display: 'inline-flex',
                                alignItems: 'center',
                              }}
                              title={`Remove #${tag}`}
                            >
                              <X size={10} />
                            </button>
                          </span>
                        ))}
                      </div>
                    )}

                    {/* Custom Tag Input */}
                    <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
                      <input
                        type="text"
                        placeholder="Add custom tag (e.g. sci-fi, synthwave) — press Enter or comma…"
                        value={customTagInput}
                        onChange={e => setCustomTagInput(e.target.value)}
                        onKeyDown={e => {
                          if (e.key === 'Enter' || e.key === ',') {
                            e.preventDefault()
                            handleAddCustomTag()
                          }
                        }}
                        style={{
                          flex: 1,
                          padding: '7px 11px',
                          background: 'var(--bg-base)',
                          border: '1px solid var(--border-main)',
                          borderRadius: 7,
                          color: 'var(--text-main)',
                          fontSize: 12,
                        }}
                      />
                      <button
                        type="button"
                        className="btn btn-secondary"
                        onClick={() => handleAddCustomTag()}
                        disabled={!customTagInput.trim()}
                        style={{ padding: '6px 12px', fontSize: 11, fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 4 }}
                      >
                        <Plus size={12} /> Add
                      </button>
                    </div>

                    {/* Popular / Suggested Tags */}
                    <div className="flex items-center gap-1.5" style={{ flexWrap: 'wrap' }}>
                      <span className="text-xs text-subtle" style={{ fontSize: 10, marginRight: 2 }}>Popular:</span>
                      {TAGS.map(tag => {
                        const isSelected = submitForm.tags.includes(tag)
                        return (
                          <button
                            key={tag}
                            type="button"
                            className={`badge ${isSelected ? 'badge-brand' : ''}`}
                            style={{
                              cursor: 'pointer',
                              border: '1px solid var(--border-main)',
                              fontSize: 10.5,
                              padding: '2px 7px',
                              opacity: isSelected ? 1 : 0.75,
                            }}
                            onClick={() => {
                              setSubmitForm(f => ({
                                ...f,
                                tags: isSelected ? f.tags.filter(t => t !== tag) : [...f.tags, tag],
                              }))
                            }}
                          >
                            #{tag}
                          </button>
                        )
                      })}
                    </div>
                  </div>

                  {/* Description */}
                  <div>
                    <label className="text-xs font-semibold text-muted" style={{ display: 'block', marginBottom: 6 }}>
                      Description (Optional)
                    </label>
                    <textarea
                      rows={2}
                      placeholder="Loop specs, creator credits, mood notes…"
                      value={submitForm.description}
                      onChange={e => setSubmitForm(f => ({ ...f, description: e.target.value }))}
                      style={{
                        width: '100%', padding: '8px 12px',
                        background: 'var(--bg-base)', border: '1px solid var(--border-main)',
                        borderRadius: 8, color: 'var(--text-main)', fontSize: 13, resize: 'vertical',
                      }}
                    />
                  </div>

                  {/* Upload Progress Bar */}
                  {submitting && uploadProgress && (
                    <div
                      style={{
                        padding: '10px 14px',
                        borderRadius: 8,
                        background: 'color-mix(in srgb, var(--color-brand) 10%, var(--bg-base))',
                        border: '1px solid color-mix(in srgb, var(--color-brand) 30%, transparent)',
                      }}
                    >
                      <div className="flex items-center justify-between text-xs mb-1.5 font-medium">
                        <span style={{ color: 'var(--text-main)' }}>
                          {uploadProgress.stage === 'uploading_github'
                            ? `Uploading to GitHub CDN (${uploadProgress.progress}%)…`
                            : uploadProgress.stage === 'uploading_thumb'
                            ? 'Uploading cover preview…'
                            : 'Submitting to review queue…'}
                        </span>
                        <span style={{ color: 'var(--color-brand)', fontWeight: 700 }}>{uploadProgress.progress}%</span>
                      </div>
                      <div style={{ height: 5, borderRadius: 3, background: 'var(--bg-base)', overflow: 'hidden' }}>
                        <div
                          style={{
                            height: '100%',
                            width: `${uploadProgress.progress}%`,
                            background: 'var(--color-brand)',
                            transition: 'width 0.2s ease',
                          }}
                        />
                      </div>
                    </div>
                  )}

                  {/* Submit Button */}
                  <button
                    type="submit"
                    className="btn btn-primary"
                    disabled={submitting || inspectingMedia || ((submitForm.type === 'video' || submitForm.type === 'image') && !selectedMediaFile && !mediaInspection && !submitForm.source.trim())}
                    style={{
                      padding: '11px 20px',
                      fontSize: 13,
                      fontWeight: 600,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 8,
                      borderRadius: 9,
                      marginTop: 4,
                    }}
                  >
                    {submitting ? (
                      <>
                        <RefreshCw size={14} className="animate-spin" />
                        <span>Uploading & Submitting…</span>
                      </>
                    ) : (
                      <>
                        <Upload size={14} />
                        <span>Submit for Review</span>
                      </>
                    )}
                  </button>
                  <span className="text-muted text-center" style={{ fontSize: 11 }}>
                    All community wallpapers are free to install after moderation.
                  </span>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── MY SUBMISSIONS TAB ── */}
      {tab === 'submissions' && (
        <div className="animate-fadeIn">
          {!isAuthenticated ? (
            <div className="card" style={{ padding: '48px 28px', textAlign: 'center' }}>
              <FileText size={40} style={{ margin: '0 auto 16px', opacity: 0.3, color: 'var(--color-brand)' }} />
              <h2 className="font-semibold text-lg" style={{ marginBottom: 8 }}>
                Sign In to View Your Submissions
              </h2>
              <p className="text-xs text-muted" style={{ maxWidth: 360, margin: '0 auto 20px', lineHeight: 1.6 }}>
                Sign in to track wallpapers you've submitted to the community and see their review status.
              </p>
              <button
                className="btn btn-primary"
                style={{ fontSize: 13, padding: '10px 24px', display: 'inline-flex', alignItems: 'center', gap: 7 }}
                onClick={() => setShowAuthModal(true)}
              >
                <LogIn size={14} />
                <span>Sign In</span>
              </button>
            </div>
          ) : (
          <>
          <div className="flex items-center justify-between" style={{ marginBottom: 16 }}>
            <div>
              <h2 className="font-semibold text-lg">My Submissions</h2>
              <p className="text-xs text-muted">Track the status of wallpapers you've submitted</p>
            </div>
            <button
              className="btn btn-primary"
              style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 5 }}
              onClick={() => setTab('submit')}
            >
              <Upload size={12} />
              Submit Another
            </button>
          </div>

          {loadingSubmissions ? (
            <div className="flex items-center justify-center" style={{ height: 160, color: 'var(--text-muted)' }}>
              <div className="animate-spin" style={{ width: 24, height: 24, border: '2px solid var(--border-main)', borderTopColor: 'var(--color-brand)', borderRadius: '50%' }} />
            </div>
          ) : mySubmissions.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '50px 20px', color: 'var(--text-muted)' }}>
              <FileText size={40} style={{ margin: '0 auto 12px', opacity: 0.3 }} />
              <div className="text-sm font-medium">You haven't submitted any wallpapers yet</div>
              <p className="text-xs text-subtle" style={{ marginTop: 4 }}>
                Share your favorite live wallpapers with the AetherFlow community!
              </p>
              <button
                className="btn btn-primary"
                style={{ marginTop: 16, fontSize: 12 }}
                onClick={() => setTab('submit')}
              >
                <Upload size={13} /> Submit a Wallpaper
              </button>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {mySubmissions.map(sub => {
                const statusMeta = STATUS_BADGES[sub.status] || STATUS_BADGES.pending
                const StatusIcon = statusMeta.icon || Clock
                const subPreviewData = {
                  id: sub.id,
                  name: sub.title,
                  description: sub.description,
                  author: sub.author,
                  authorPortfolio: sub.authorPortfolio || sub.author_portfolio || '',
                  license: sub.license || 'CC BY-NC-ND 4.0',
                  type: sub.type,
                  source: sub.source,
                  preview: sub.preview,
                  tags: sub.tags,
                  downloads: 0,
                  likes: 0,
                  hasAudio: Boolean(sub.hasAudio || sub.has_audio),
                  fileSize: sub.fileSize || sub.file_size || 0,
                  dimensions: sub.dimensions || '',
                  mediaFormat: sub.mediaFormat || sub.media_format || '',
                  duration: sub.duration || 0,
                  stagingPath: sub.stagingPath || sub.staging_path || '',
                  githubAssetUrl: sub.githubAssetUrl || sub.github_asset_url || '',
                }

                return (
                  <div
                    key={sub.id}
                    className="card"
                    style={{
                      padding: '14px 18px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      flexWrap: 'wrap',
                      gap: 12,
                    }}
                  >
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <h4 className="font-semibold text-sm">{sub.title}</h4>
                        <span
                          style={{
                            fontSize: 10,
                            padding: '2px 7px',
                            borderRadius: 4,
                            background: 'rgba(255,255,255,0.06)',
                            color: 'var(--text-subtle)',
                            textTransform: 'uppercase',
                          }}
                        >
                          {sub.type}
                        </span>
                        {sub.hasAudio && (
                          <span
                            className="badge"
                            style={{
                              fontSize: 10,
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: 3,
                              background: 'rgba(168,85,247,0.15)',
                              color: 'var(--color-purple, #a855f7)',
                              border: '1px solid rgba(168,85,247,0.3)',
                            }}
                          >
                            <Music size={10} /> Has Audio
                          </span>
                        )}
                        {sub.fileSize > 0 && (
                          <span className="badge" style={{ fontSize: 10, background: 'rgba(255,255,255,0.06)', border: '1px solid var(--border-main)' }}>
                            {(sub.fileSize / (1024 * 1024)).toFixed(1)} MB
                          </span>
                        )}
                        {sub.dimensions && (
                          <span className="badge" style={{ fontSize: 10, background: 'rgba(255,255,255,0.06)', border: '1px solid var(--border-main)' }}>
                            {sub.dimensions}
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-subtle" style={{ marginTop: 3 }}>
                        {sub.source}
                      </div>
                      {sub.rejection_reason && (
                        <div className="text-xs" style={{ color: 'var(--color-rose)', marginTop: 4 }}>
                          Note: {sub.rejection_reason}
                        </div>
                      )}
                    </div>

                    <div className="flex items-center gap-2.5">
                      <button
                        type="button"
                        className="btn btn-ghost"
                        style={{
                          padding: '5px 10px',
                          fontSize: 11,
                          display: 'flex',
                          alignItems: 'center',
                          gap: 4,
                          borderRadius: 6,
                          border: '1px solid var(--border-main)',
                          background: 'rgba(255,255,255,0.04)',
                          cursor: 'pointer',
                        }}
                        onClick={() => setPreviewItem(subPreviewData)}
                        title="Live Preview"
                      >
                        <Eye size={12} />
                        <span>Preview</span>
                      </button>

                      <div
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 5,
                          padding: '4px 10px',
                          borderRadius: 999,
                          fontSize: 11,
                          fontWeight: 600,
                          background: `color-mix(in srgb, ${statusMeta.color} 15%, transparent)`,
                          color: statusMeta.color,
                          border: `1px solid color-mix(in srgb, ${statusMeta.color} 30%, transparent)`,
                        }}
                      >
                        <StatusIcon size={12} />
                        <span>{statusMeta.label}</span>
                      </div>

                      <button
                        type="button"
                        className="btn btn-ghost"
                        style={{
                          padding: '5px 10px',
                          fontSize: 11,
                          color: 'var(--color-rose)',
                          display: 'flex',
                          alignItems: 'center',
                          gap: 4,
                          borderRadius: 6,
                          border: '1px solid color-mix(in srgb, var(--color-rose) 35%, transparent)',
                          background: 'color-mix(in srgb, var(--color-rose) 6%, transparent)',
                          cursor: 'pointer',
                        }}
                        onClick={() => handleWithdrawSubmission(sub)}
                        title="Withdraw and delete this submission"
                      >
                        <Trash2 size={12} />
                        <span>Withdraw</span>
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
          </>
          )}
        </div>
      )}



      {/* ── TAKEDOWN CONFIRMATION MODAL ── */}
      {takedownTarget && createPortal(
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 999999,
            background: 'rgba(0, 0, 0, 0.75)',
            backdropFilter: 'blur(8px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 16,
          }}
          onClick={() => setTakedownTarget(null)}
        >
          <div
            className="card"
            style={{
              width: '100%',
              maxWidth: 440,
              padding: '24px 28px',
              borderRadius: 14,
              border: '1px solid color-mix(in srgb, var(--color-rose) 30%, var(--border-main))',
              boxShadow: '0 24px 60px rgba(0, 0, 0, 0.8), 0 0 0 1px rgba(255,255,255,0.08)',
            }}
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center gap-2.5" style={{ marginBottom: 14 }}>
              <div
                style={{
                  width: 34,
                  height: 34,
                  borderRadius: 8,
                  background: 'color-mix(in srgb, var(--color-rose) 15%, transparent)',
                  color: 'var(--color-rose)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Trash2 size={16} />
              </div>
              <div>
                <h3 className="font-semibold text-sm">Take Down Wallpaper</h3>
                <div className="text-xs text-muted">Immediate community removal</div>
              </div>
            </div>

            <p className="text-xs text-muted" style={{ lineHeight: 1.5, marginBottom: 14 }}>
              Are you sure you want to remove <strong style={{ color: 'var(--text-main)' }}>"{takedownTarget.name}"</strong>?
              It will be immediately hidden from the public feed on all client installations.
            </p>

            <div style={{ marginBottom: 16 }}>
              <label className="text-xs font-semibold text-muted" style={{ display: 'block', marginBottom: 6 }}>
                Reason for Takedown (Optional)
              </label>
              <input
                type="text"
                placeholder="e.g. Broken video link, copyright request, quality guidelines"
                value={takedownReason}
                onChange={e => setTakedownReason(e.target.value)}
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  borderRadius: 8,
                  background: 'var(--bg-base)',
                  border: '1px solid var(--border-main)',
                  color: 'var(--text-main)',
                  fontSize: 12,
                  outline: 'none',
                }}
              />
            </div>

            <div className="flex gap-2 justify-end">
              <button
                className="btn btn-ghost"
                style={{ fontSize: 12 }}
                disabled={isTakingDown}
                onClick={() => setTakedownTarget(null)}
              >
                Cancel
              </button>
              <button
                className="btn btn-danger"
                style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 6 }}
                disabled={isTakingDown}
                onClick={handleConfirmTakedown}
              >
                <Trash2 size={13} />
                <span>{isTakingDown ? 'Taking Down…' : 'Confirm Takedown'}</span>
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* ── ZERO-MEMORY-LEAK LIVE PREVIEW MODAL ── */}
      {previewItem && (
        <CommunityPreviewModal
          item={previewItem}
          isAdmin={isAdmin}
          onClose={() => setPreviewItem(null)}
          onAddToLibrary={(item) => handleAddToLibrary(item)}
          onDownloadOffline={(item) => handleDownloadOffline(item)}
          onApply={(item) => handleInstall(item)}
          onLike={(id) => handleLike(id)}
          onTakedown={(item) => {
            setTakedownTarget(item)
            setTakedownReason('')
          }}
          isLiked={isItemLikedByUser(previewItem)}
          likeCount={getWallpaperMetrics(previewItem, likeCounts, downloadCounts, isItemLikedByUser(previewItem)).likes}
          liking={likingId === previewItem.id}
          downloadCount={getWallpaperMetrics(previewItem, likeCounts, downloadCounts, isItemLikedByUser(previewItem)).downloads}
          isInstalled={(installed || []).some(i => i?.id === `community-${previewItem.id}` || i?.communityMeta?.originalId === previewItem.id)}
          isLocallyCached={(installed || []).some(i => (i?.id === `community-${previewItem.id}` || i?.communityMeta?.originalId === previewItem.id) && (i?.storageStatus === 'cached' || i?.storageStatus === 'downloaded' || i?.localPath))}
          isCurrentlyApplied={isWallpaperRunning && (currentDesktopWallpaper?.id === `community-${previewItem.id}` || activeWallpaper?.id === `community-${previewItem.id}`)}
          isApplying={applyingId === previewItem.id}
          isAddingLib={addingLibraryId === previewItem.id}
          isDownloading={downloadingIds.has(previewItem.id)}
          downloadPercent={(typeof downloadProgress[previewItem.id] === 'object' && downloadProgress[previewItem.id] !== null ? downloadProgress[previewItem.id].percent : downloadProgress[previewItem.id]) || 0}
          downloadInfo={typeof downloadProgress[previewItem.id] === 'object' && downloadProgress[previewItem.id] !== null ? downloadProgress[previewItem.id] : { percent: downloadProgress[previewItem.id] || 0, downloaded: 0, total: 0 }}
        />
      )}
    </div>
  )
}

/**
 * Clean YouTube Preview with iframe cleanup on unmount and audio preview toggle
 */
function CleanYouTubePreview({ source, title }) {
  const containerRef = useRef(null)
  const iframeRef = useRef(null)
  let rawId = parseYouTubeId(source) || source
  if (rawId === 'jfKfPfyJRdk') rawId = 'TURbeWK2wwg'
  else if (rawId === '1zxD9O4b1oY') rawId = 'uD4izuDMUQA'
  else if (rawId === '7uK_Z2Q2R2E') rawId = '21qNxnCS8WU'
  else if (rawId === 'aXYKRAdrfEo') rawId = 'eZe4Q_58UTU'
  else if (rawId === 'nz1cEO01LzE') rawId = 'WJ3-F02-F_Y'
  const videoId = rawId

  const [isMuted, setIsMuted] = useState(true)

  useEffect(() => {
    const container = containerRef.current
    if (!container || !videoId) return

    const iframe = document.createElement('iframe')
    const originParam = encodeURIComponent(window.location.origin || 'http://localhost:1420')
    iframe.src = `https://www.youtube-nocookie.com/embed/${videoId}?autoplay=1&mute=1&controls=0&disablekb=1&fs=0&rel=0&iv_load_policy=3&modestbranding=1&playsinline=1&enablejsapi=1&origin=${originParam}`
    iframe.title = title || 'Live Wallpaper Preview'
    iframe.setAttribute('allow', 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share')
    iframe.style.width = '100%'
    iframe.style.height = '100%'
    iframe.style.border = 'none'
    iframe.style.display = 'block'
    iframe.style.pointerEvents = 'none'
    iframe.tabIndex = -1
    iframe.setAttribute('tabindex', '-1')
    iframe.setAttribute('aria-hidden', 'true')

    function injectIframeHideUI() {
      try {
        const fDoc = iframe.contentDocument || (iframe.contentWindow && iframe.contentWindow.document)
        if (fDoc && !fDoc.getElementById('aether-yt-preview-hide-ui')) {
          const s = fDoc.createElement('style')
          s.id = 'aether-yt-preview-hide-ui'
          s.textContent = `
            .ytp-bezel, .ytp-bezel-icon, .ytp-bezel-text, .ytp-large-play-button, .ytp-large-play-button-bg,
            .ytp-pause-overlay, .ytp-endscreen-content, .ytp-ce-element, .ytp-chrome-top, .ytp-chrome-bottom,
            .ytp-gradient-top, .ytp-gradient-bottom, .ytp-spinner {
              display: none !important; opacity: 0 !important; visibility: hidden !important; pointer-events: none !important;
            }
          `
          ;(fDoc.head || fDoc.documentElement).appendChild(s)
        }
      } catch (e) {}
    }
    iframe.addEventListener('load', injectIframeHideUI)
    const injectInterval = setInterval(injectIframeHideUI, 500)

    container.appendChild(iframe)
    iframeRef.current = iframe

    return () => {
      clearInterval(injectInterval)
      try {
        iframe.src = 'about:blank'
      } catch {}
      if (container.contains(iframe)) {
        container.removeChild(iframe)
      }
      iframeRef.current = null
    }
  }, [videoId, title])

  const toggleMute = () => {
    const nextMuted = !isMuted
    setIsMuted(nextMuted)
    const frame = iframeRef.current
    if (frame?.contentWindow) {
      frame.contentWindow.postMessage(JSON.stringify({
        event: 'command',
        func: nextMuted ? 'mute' : 'unMute',
        args: []
      }), '*')
      if (!nextMuted) {
        frame.contentWindow.postMessage(JSON.stringify({
          event: 'command',
          func: 'setVolume',
          args: [85]
        }), '*')
        frame.contentWindow.postMessage(JSON.stringify({
          event: 'command',
          func: 'playVideo',
          args: []
        }), '*')
      }
    }
  }

  return (
    <div
      style={{
        width: '100%',
        aspectRatio: '16/9',
        maxHeight: '52vh',
        background: '#050505',
        borderRadius: 8,
        overflow: 'hidden',
        position: 'relative',
        boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.08)',
      }}
    >
      <div ref={containerRef} style={{ width: '100%', height: '100%', pointerEvents: 'none' }} />
      {/* Invisible overlay absorbing all pointer interaction so YouTube UI cannot be triggered */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          zIndex: 2,
          background: 'transparent',
          pointerEvents: 'auto',
          cursor: 'default',
        }}
        onClick={(e) => {
          e.preventDefault()
          e.stopPropagation()
        }}
        onPointerDown={(e) => {
          e.preventDefault()
          e.stopPropagation()
        }}
        onContextMenu={(e) => {
          e.preventDefault()
          e.stopPropagation()
        }}
      />
      <button
        onClick={toggleMute}
        style={{
          position: 'absolute',
          bottom: 12,
          right: 12,
          zIndex: 10,
          background: 'rgba(0,0,0,0.75)',
          backdropFilter: 'blur(8px)',
          WebkitBackdropFilter: 'blur(8px)',
          border: '1px solid rgba(255,255,255,0.2)',
          borderRadius: 6,
          padding: '6px 10px',
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          color: '#ffffff',
          fontSize: 12,
          fontWeight: 600,
          cursor: 'pointer',
          transition: 'all 0.15s',
        }}
        title={isMuted ? 'Click to enable preview sound' : 'Mute preview sound'}
      >
        {isMuted ? <VolumeX size={14} color="var(--color-rose, #f43f5e)" /> : <Volume2 size={14} color="var(--color-emerald, #10b981)" />}
        <span>{isMuted ? 'Sound Muted' : 'Sound Playing'}</span>
      </button>
    </div>
  )
}

/**
 * Clean Video Preview with decoder destruction on unmount and live audio toggle
 */
function CleanVideoPreview({ source }) {
  const videoRef = useRef(null)
  const [isMuted, setIsMuted] = useState(true)

  useEffect(() => {
    const video = videoRef.current
    return () => {
      if (video) {
        try {
          video.pause()
          video.removeAttribute('src')
          video.load()
        } catch {}
      }
    }
  }, [source])

  const toggleMute = () => {
    if (videoRef.current) {
      videoRef.current.muted = !isMuted
      setIsMuted(!isMuted)
    }
  }

  return (
    <div
      style={{
        width: '100%',
        aspectRatio: '16/9',
        maxHeight: '52vh',
        background: '#050505',
        borderRadius: 8,
        overflow: 'hidden',
        position: 'relative',
        boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.08)',
      }}
    >
      <video
        ref={videoRef}
        src={source}
        autoPlay
        loop
        muted={isMuted}
        playsInline
        style={{ width: '100%', height: '100%', objectFit: 'cover' }}
      />
      {/* Audio toggle button overlay */}
      <button
        type="button"
        onClick={toggleMute}
        style={{
          position: 'absolute',
          bottom: 12,
          right: 12,
          zIndex: 10,
          background: 'rgba(0, 0, 0, 0.72)',
          backdropFilter: 'blur(8px)',
          border: '1px solid rgba(255, 255, 255, 0.15)',
          borderRadius: 6,
          padding: '6px 12px',
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          color: '#ffffff',
          fontSize: 12,
          fontWeight: 600,
          cursor: 'pointer',
          transition: 'all 0.15s',
        }}
        title={isMuted ? 'Click to enable preview sound' : 'Mute preview sound'}
      >
        {isMuted ? <VolumeX size={14} color="var(--color-rose, #f43f5e)" /> : <Volume2 size={14} color="var(--color-emerald, #10b981)" />}
        <span>{isMuted ? 'Sound Muted' : 'Sound Playing'}</span>
      </button>
    </div>
  )
}

/**
 * Clean Image Preview
 */
function CleanImagePreview({ source, title }) {
  return (
    <div
      style={{
        width: '100%',
        aspectRatio: '16/9',
        maxHeight: '52vh',
        background: '#050505',
        borderRadius: 8,
        overflow: 'hidden',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <img
        src={source}
        alt={title}
        style={{ width: '100%', height: '100%', objectFit: 'cover' }}
      />
    </div>
  )
}

/**
 * Full Live Preview Modal Window with Admin Takedown Button
 */
function CommunityPreviewModal({
  item,
  isAdmin,
  onClose,
  onAddToLibrary,
  onDownloadOffline,
  onApply,
  onLike,
  onTakedown,
  isLiked,
  likeCount,
  liking,
  downloadCount,
  isInstalled,
  isLocallyCached,
  isCurrentlyApplied,
  isApplying,
  isAddingLib,
  isDownloading,
  downloadPercent,
  downloadInfo = null,
}) {
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

  if (!item) return null

  const urlOrSource = item.source || ''
  const hasImageExt = /\.(png|jpg|jpeg|webp|bmp|gif|avif)$/i.test(urlOrSource) || urlOrSource.includes('images.unsplash.com') || ['image', 'jpg', 'jpeg', 'png', 'webp', 'avif'].includes(String(item.mediaFormat || '').toLowerCase())
  const isImage = item.type === 'image' || hasImageExt
  const badge = (isImage ? TYPE_BADGES.image : TYPE_BADGES[item.type]) || {}
  const isEngine = !isImage && (item.type === 'engine' || Boolean(item.engine))
  const isStream = !isImage && !isEngine && (item.type === 'youtube' || item.type === 'stream' || Boolean(parseYouTubeId(item.source)))
  const isVideo = !isImage && !isEngine && !isStream
  const isNoDownload = isStream
  const authorPortfolio = item.authorPortfolio || item.author_portfolio || item.communityMeta?.authorPortfolio || ''
  const rawBytes = item.fileSize || item.file_size || 0
  const formattedSize = formatBytes(rawBytes)
  const info = downloadInfo || { percent: downloadPercent || 0, downloaded: 0, total: 0 }

  return createPortal(
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 99999,
        background: 'rgba(0, 0, 0, 0.78)',
        backdropFilter: 'blur(12px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '24px 16px',
        animation: 'fadeIn 0.18s ease-out',
      }}
      onClick={onClose}
    >
      <div
        className="card"
        style={{
          width: '100%',
          maxWidth: 720,
          background: 'var(--bg-card)',
          border: '1px solid var(--border-main)',
          borderRadius: 14,
          boxShadow: '0 24px 60px rgba(0, 0, 0, 0.7), 0 0 0 1px rgba(255,255,255,0.08)',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          maxHeight: '92vh',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Top Header */}
        <div
          className="flex items-center justify-between"
          style={{
            padding: '14px 20px',
            borderBottom: '1px solid var(--border-main)',
            background: 'rgba(var(--rgb-card), 0.5)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, minWidth: 0, flex: 1 }}>
            <span
              style={{
                padding: '4px 10px',
                borderRadius: 6,
                fontSize: 11,
                fontWeight: 600,
                background: 'rgba(0,0,0,0.6)',
                color: badge.color || 'var(--text-main)',
                border: '1px solid rgba(255,255,255,0.12)',
                flexShrink: 0,
                display: 'inline-flex',
                alignItems: 'center',
                letterSpacing: '0.2px',
              }}
            >
              {badge.label || item.type}
            </span>
            <div style={{ minWidth: 0, flex: 1 }}>
              <div
                className="font-semibold text-base"
                style={{
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  maxWidth: 460,
                  color: 'var(--text-main)',
                }}
                title={item.name}
              >
                {item.name}
              </div>
              <div className="flex items-center gap-2 flex-wrap" style={{ marginTop: 2 }}>
                <span className="text-xs text-muted" style={{ fontSize: 12, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                  by
                  {authorPortfolio ? (
                    <button
                      type="button"
                      onClick={() => openExternalUrl(authorPortfolio)}
                      title={`Visit ${item.author}'s portfolio (${authorPortfolio})`}
                      style={{
                        background: 'none', border: 'none', padding: 0,
                        color: 'var(--color-brand)', fontWeight: 600, cursor: 'pointer',
                        display: 'inline-flex', alignItems: 'center', gap: 3,
                        textDecoration: 'underline', textUnderlineOffset: 2,
                        fontSize: 'inherit'
                      }}
                    >
                      {item.author || 'Anonymous'} <ExternalLink size={11} />
                    </button>
                  ) : (
                    <span style={{ color: 'var(--text-main)', fontWeight: 500 }}>{item.author || 'Anonymous'}</span>
                  )}
                </span>
                {item.license && (
                  <span
                    className="badge"
                    title={LICENSE_OPTIONS.find(o => o.id === item.license)?.desc || item.license}
                    style={{
                      fontSize: 10, padding: '1px 6px',
                      background: 'rgba(255,255,255,0.06)', color: 'var(--text-muted)',
                      border: '1px solid var(--border-subtle)', fontWeight: 600
                    }}
                  >
                    {LICENSE_OPTIONS.find(o => o.id === item.license)?.badge || item.license}
                  </span>
                )}
                {item.hasAudio && (
                  <span className="badge badge-emerald" style={{ fontSize: 10, padding: '1px 6px', display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                    <Volume2 size={10} /> Has Audio
                  </span>
                )}
                {formattedSize && (
                  <span className="badge" style={{ fontSize: 10, padding: '1px 6px' }}>
                    {formattedSize}
                  </span>
                )}
                {item.dimensions && (
                  <span className="badge" style={{ fontSize: 10, padding: '1px 6px' }}>
                    {item.dimensions}
                  </span>
                )}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Quick Takedown in modal header */}
            {isAdmin && onTakedown && (
              <button
                type="button"
                className="btn btn-danger"
                style={{ padding: '4px 10px', fontSize: 11, height: 28, display: 'flex', alignItems: 'center', gap: 4 }}
                onClick={() => {
                  onClose()
                  onTakedown(item)
                }}
                title="Take down this wallpaper"
              >
                <Trash2 size={12} />
                <span>Take Down</span>
              </button>
            )}

            <button
              onClick={onClose}
              style={{
                background: 'rgba(255,255,255,0.05)',
                border: '1px solid var(--border-main)',
                borderRadius: 8,
                padding: 6,
                cursor: 'pointer',
                color: 'var(--text-muted)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                transition: 'all 0.15s',
              }}
              title="Close preview (Esc)"
            >
              <X size={16} />
            </button>
          </div>
        </div>

        {/* Live Media Preview (Zero-Leak) */}
        <div style={{ padding: '16px 20px 10px', flex: 1, overflowY: 'auto' }}>
          {item.type === 'engine' ? (
            <div style={{ position: 'relative', width: '100%', aspectRatio: '16/9', borderRadius: 10, overflow: 'hidden', background: '#05070e' }}>
              <WallpaperPlayer engineId={item.engine || item.source.replace('engine:', '')} preview={true} style={{ width: '100%', height: '100%', position: 'absolute', inset: 0 }} />
            </div>
          ) : item.type === 'youtube' ? (
            <CleanYouTubePreview source={item.source} title={item.name} />
          ) : isVideo ? (
            <CleanVideoPreview source={item.source} />
          ) : (
            <CleanImagePreview source={item.preview || item.source} title={item.name} />
          )}

          {/* Description & Tags */}
          <div style={{ marginTop: 14 }}>
            {item.description && (
              <p className="text-xs text-muted" style={{ lineHeight: 1.5, marginBottom: 8 }}>
                {item.description}
              </p>
            )}
            {item.tags?.length > 0 && (
              <div className="flex items-center gap-1.5 flex-wrap">
                {item.tags.map(t => (
                  <span
                    key={t}
                    style={{
                      padding: '2px 7px',
                      borderRadius: 4,
                      fontSize: 10,
                      background: 'rgba(255,255,255,0.05)',
                      color: 'var(--text-subtle)',
                    }}
                  >
                    #{t}
                  </span>
                ))}
              </div>
            )}

            {/* Prominent Creator Portfolio Link Section */}
            {authorPortfolio && (
              <div
                style={{
                  marginTop: 12,
                  padding: '9px 13px',
                  borderRadius: 8,
                  background: 'rgba(255, 255, 255, 0.03)',
                  border: '1px solid var(--border-main)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 12,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 9, minWidth: 0, flex: 1 }}>
                  <Globe size={15} style={{ color: 'var(--color-brand)', flexShrink: 0 }} />
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 10.5, textTransform: 'uppercase', letterSpacing: '0.4px', color: 'var(--text-subtle)', fontWeight: 600 }}>
                      Artist Portfolio / Source
                    </div>
                    <div
                      style={{
                        fontSize: 12,
                        color: 'var(--text-muted)',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                      title={authorPortfolio}
                    >
                      {authorPortfolio}
                    </div>
                  </div>
                </div>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => openExternalUrl(authorPortfolio)}
                  style={{
                    padding: '5px 12px',
                    fontSize: 11,
                    fontWeight: 600,
                    color: 'var(--color-brand)',
                    borderColor: 'color-mix(in srgb, var(--color-brand) 30%, transparent)',
                    background: 'color-mix(in srgb, var(--color-brand) 10%, transparent)',
                    borderRadius: 6,
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 5,
                    flexShrink: 0,
                    cursor: 'pointer',
                  }}
                  title={`Open ${item.author || 'creator'}'s portfolio in browser`}
                >
                  <span>Visit Portfolio</span>
                  <ExternalLink size={11} />
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Live Download Progress Bar in Modal */}
        {isDownloading && (
          <div
            style={{
              padding: '10px 20px',
              background: 'color-mix(in srgb, var(--color-brand) 8%, var(--bg-card))',
              borderTop: '1px solid var(--border-main)',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--color-brand)', marginBottom: 5, fontWeight: 600 }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <RefreshCw size={12} className="spin" />
                Downloading for offline playback…
              </span>
              <span>
                {downloadPercent > 0 ? `${downloadPercent}%` : 'Connecting…'}
                {info.total > 0 ? ` • ${formatBytes(info.downloaded)} / ${formatBytes(info.total)}` : ''}
              </span>
            </div>
            <div style={{ width: '100%', height: 6, background: 'rgba(255,255,255,0.12)', borderRadius: 3, overflow: 'hidden' }}>
              <div
                style={{
                  width: `${Math.max(4, downloadPercent)}%`,
                  height: '100%',
                  background: 'linear-gradient(90deg, var(--color-brand), #a855f7)',
                  borderRadius: 3,
                  transition: 'width 0.2s ease',
                }}
              />
            </div>
          </div>
        )}

        {/* Bottom Actions Bar */}
        <div
          className="flex items-center justify-between"
          style={{
            padding: '12px 20px',
            borderTop: '1px solid var(--border-main)',
            background: 'rgba(var(--rgb-card), 0.3)',
          }}
        >
          {/* Left Stats: Likes + Installs */}
          <div className="flex items-center gap-3">
            <button
              onClick={() => onLike(item.id)}
              disabled={liking}
              style={{
                background: 'rgba(255,255,255,0.05)',
                border: '1px solid var(--border-main)',
                borderRadius: 6,
                padding: '5px 9px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 4,
                color: isLiked ? 'var(--color-rose)' : 'var(--text-muted)',
                fontSize: 11,
                fontWeight: 600,
                transition: 'all 0.15s',
              }}
            >
              <Heart size={13} fill={isLiked ? 'var(--color-rose)' : 'none'} />
              <span>{likeCount}</span>
            </button>

            <div className="flex items-center gap-1.5 text-xs text-muted">
              <Download size={12} />
              <span>{downloadCount.toLocaleString()} downloads</span>
            </div>
          </div>

          {/* Right Buttons: Add to Cloud (0MB) & Download Offline & Apply & Take Down */}
          <div className="flex items-center gap-2">
            {isAdmin && onTakedown && (
              <button
                type="button"
                className="btn btn-danger"
                style={{ padding: '6px 12px', fontSize: 12, display: 'flex', alignItems: 'center', gap: 5 }}
                onClick={() => {
                  onClose()
                  onTakedown(item)
                }}
                title="Immediately remove wallpaper from community feed"
              >
                <Trash2 size={13} />
                <span>Take Down</span>
              </button>
            )}

            {/* 1. Add to Library */}
            {isInstalled ? (
              <span
                className="badge badge-emerald"
                style={{ padding: '6px 11px', fontSize: 12, display: 'inline-flex', alignItems: 'center', gap: 5 }}
                title="Saved to Library"
              >
                <Check size={13} /> In Library
              </span>
            ) : (
              <button
                type="button"
                className="btn btn-secondary"
                style={{ padding: '6px 12px', fontSize: 12, display: 'flex', alignItems: 'center', gap: 5 }}
                disabled={isAddingLib || isApplying}
                onClick={() => onAddToLibrary(item)}
                title="Save to Library"
              >
                {isAddingLib ? (
                  <>
                    <RefreshCw size={13} className="spin" />
                    <span>Saving…</span>
                  </>
                ) : (
                  <>
                    <FolderPlus size={13} />
                    <span>+ Add to Library</span>
                  </>
                )}
              </button>
            )}

            {/* 2. Download Offline (Only for downloadable files, NOT YouTube / Web Streams) */}
            {!isNoDownload && (
              (isLocallyCached || (isEngine && isInstalled)) ? (
                <span
                  className="badge"
                  style={{
                    padding: '6px 11px',
                    fontSize: 12,
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 5,
                    background: 'rgba(16, 185, 129, 0.16)',
                    color: 'var(--color-emerald)',
                    border: '1px solid rgba(16, 185, 129, 0.35)',
                  }}
                  title="Media downloaded to disk — ready for 100% offline playback"
                >
                  <Check size={13} /> Offline Ready
                </span>
              ) : (
                <button
                  type="button"
                  className="btn btn-secondary"
                  style={{ padding: '6px 12px', fontSize: 12, display: 'flex', alignItems: 'center', gap: 5 }}
                  disabled={isDownloading || isApplying}
                  onClick={() => onDownloadOffline && onDownloadOffline(item)}
                  title="Download media to disk for offline playback"
                >
                  {isDownloading ? (
                    <>
                      <RefreshCw size={13} className="spin" />
                      <span>{downloadPercent > 0 ? `${downloadPercent}%` : 'Downloading…'}</span>
                    </>
                  ) : (
                    <>
                      <Download size={13} />
                      <span>Download Offline</span>
                    </>
                  )}
                </button>
              )
            )}

            {/* 3. Apply to Desktop */}
            {isCurrentlyApplied ? (
              <span
                className="btn btn-success"
                style={{ padding: '6px 14px', fontSize: 12, cursor: 'default', display: 'flex', alignItems: 'center', gap: 5 }}
              >
                <Check size={13} /> Active on Desktop
              </span>
            ) : (
              <button
                type="button"
                className="btn btn-primary"
                style={{ padding: '6px 14px', fontSize: 12, display: 'flex', alignItems: 'center', gap: 5 }}
                disabled={isApplying || isAddingLib}
                onClick={() => onApply(item)}
              >
                {isApplying ? (
                  <>
                    <RefreshCw size={12} className="spin" />
                    <span>Applying…</span>
                  </>
                ) : (
                  <>
                    {isImage ? <Image size={12} /> : <Play size={12} fill="currentColor" />}
                    <span>Apply to Desktop</span>
                  </>
                )}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>,
    document.body
  )
}
