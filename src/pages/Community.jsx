import React, { useState, useEffect, useCallback, useRef } from 'react'
import { createPortal } from 'react-dom'
import {
  Search, Download, Globe, Image, MonitorPlay, Upload, Users, Palette,
  LogIn, Play, Check, Heart, Clock, CheckCircle, XCircle, FileText,
  Award, Eye, X, FolderPlus, Shield, ShieldCheck, ShieldAlert, Trash2,
  Star, Lock, Unlock, AlertTriangle, RefreshCw, Filter, Sparkles,
  LayoutGrid, List, SlidersHorizontal, ShieldX, Volume2, VolumeX
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
  verifyAdminPasscode,
  clearCatalogCache,
} from '../lib/community.js'
import { useStore } from '../store/useStore.js'
import { applyWallpaperToDesktop } from '../lib/wallpaperActions.js'
import { parseYouTubeId } from '../engines/web-stream.js'
import UserAvatar from '../components/UserAvatar/index.jsx'

const TAGS = ['anime', 'nature', 'city', 'space', 'minimal', 'retro', 'lofi', 'abstract', '4K', 'dark', 'neon', 'cyberpunk']

const TYPE_FILTERS = [
  { id: '',        label: 'All',        icon: null },
  { id: 'youtube', label: 'YouTube',    icon: MonitorPlay },
  { id: 'stream',  label: 'Web Stream', icon: Globe },
  { id: 'image',   label: 'Image',      icon: Image },
]

const TYPE_BADGES = {
  youtube: { label: 'YouTube', color: 'var(--color-rose)' },
  stream:  { label: 'Stream',  color: 'var(--color-cyan)' },
  image:   { label: 'Image',   color: 'var(--color-emerald)' },
  video:   { label: 'Video',   color: 'var(--color-purple)' },
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
  const [selectedTags, setSelectedTags] = useState([])
  const [typeFilter, setTypeFilter] = useState('')
  const [filterMode, setFilterMode] = useState('all') // 'all' | 'featured' | 'community'
  const [sortMode, setSortMode] = useState('popular') // 'popular' | 'newest' | 'likes' | 'name'
  const [results, setResults] = useState([])
  const [loading, setLoading] = useState(true)
  const [stats, setStats] = useState({ totalWallpapers: 0, activeUsers: 0 })

  // Likes & Downloads state
  const [likedIds, setLikedIds] = useState(new Set())
  const [likeCounts, setLikeCounts] = useState({}) // wallpaperId -> count
  const [likingId, setLikingId] = useState(null)
  const [downloadCounts, setDownloadCounts] = useState({}) // wallpaperId -> count
  const [addingLibraryId, setAddingLibraryId] = useState(null)

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

  // Manage Catalog tab state
  const [manageSearch, setManageSearch] = useState('')
  const [quickTakedownInput, setQuickTakedownInput] = useState('')

  // Admin passcode modal & status
  const [showAdminModal, setShowAdminModal] = useState(false)
  const [passcodeInput, setPasscodeInput] = useState('')
  const [passcodeError, setPasscodeError] = useState(false)

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

  // Admin store persistence
  const communityAdminUnlocked = useStore(s => s.communityAdminUnlocked)
  const setCommunityAdminUnlocked = useStore(s => s.setCommunityAdminUnlocked)
  const isAdmin = checkIsAdmin(authUser, communityAdminUnlocked)

  // Submit form state
  const [submitForm, setSubmitForm] = useState({
    title: '', description: '', type: 'youtube', source: '', tags: [], authorName: '',
  })
  const [submitting, setSubmitting] = useState(false)
  const [submitResult, setSubmitResult] = useState(null)

  // Toast notification helper
  const showNotice = (msg, type = 'success') => {
    setActionNotice({ msg, type })
    setTimeout(() => setActionNotice(null), 4000)
  }

  // Fetch wallpapers
  const doSearch = useCallback(async (forceRefresh = false) => {
    setLoading(true)
    const data = await searchCatalog({
      query,
      tags: selectedTags,
      type: typeFilter,
      filterMode,
      sortMode,
    })
    setResults(data)
    setLoading(false)
  }, [query, selectedTags, typeFilter, filterMode, sortMode])

  useEffect(() => {
    const timer = setTimeout(doSearch, 200)
    return () => clearTimeout(timer)
  }, [doSearch])

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

  // Fetch user likes when authenticated
  useEffect(() => {
    if (isAuthenticated) {
      getUserLikes().then(ids => setLikedIds(new Set(ids))).catch(() => {})
    } else {
      setLikedIds(new Set())
    }
  }, [isAuthenticated])

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

  const toggleTag = (tag) => setSelectedTags(prev =>
    prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag]
  )

  const handleLike = async (wallpaperId) => {
    if (!isAuthenticated) {
      setShowAuthModal(true)
      return
    }
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
    setLikingId(wallpaperId)
    const result = await toggleLike(wallpaperId)
    if (result) {
      setLikedIds(prev => {
        const next = new Set(prev)
        result.liked ? next.add(wallpaperId) : next.delete(wallpaperId)
        return next
      })
      setLikeCounts(prev => ({ ...prev, [wallpaperId]: result.totalLikes }))
    }
    setLikingId(null)
  }

  const handleAddToLibrary = async (wallpaper) => {
    setAddingLibraryId(wallpaper.id)
    try {
      const isVideo = wallpaper.type === 'video' || /\.(mp4|webm|mkv|avi|mov)$/i.test(wallpaper.source || '')
      const isStream = !isVideo && (wallpaper.type === 'youtube' || wallpaper.type === 'stream' || Boolean(parseYouTubeId(wallpaper.source)))
      const resolvedEngine = isVideo ? 'video-player' : (isStream ? 'web-stream' : 'image-player')
      const targetVolume = audioVolume > 0 ? audioVolume : 50
      const item = {
        id: `community-${wallpaper.id}`,
        name: wallpaper.name,
        engine: resolvedEngine,
        type: 'wallpaper',
        isCustom: true,
        installedAt: Date.now(),
        preview: wallpaper.preview,
        tags: wallpaper.tags || ['community'],
        config: {
          ...(isVideo
            ? { videoPath: wallpaper.source, speedMultiplier: 1, volume: targetVolume, muted: false }
            : isStream
            ? {
                streamUrl: wallpaper.source,
                url: wallpaper.source,
                streamType: wallpaper.type === 'youtube' ? 'youtube' : 'web',
                muted: false,
                volume: targetVolume,
                speedMultiplier: 1,
              }
            : { imagePath: wallpaper.source, url: wallpaper.source, fit: 'cover' }
          ),
        },
        communityMeta: {
          author: wallpaper.author,
          originalId: wallpaper.id,
          source: wallpaper.source,
        },
      }

      installItem(item)
      setWallpaperAudio(item.id, { volume: targetVolume, muted: false })

      setDownloadCounts(prev => {
        const base = prev[wallpaper.id] ?? wallpaper.downloads ?? 0
        return { ...prev, [wallpaper.id]: base + 1 }
      })

      const serverTotal = await trackInstall(wallpaper.id)
      if (serverTotal !== null && serverTotal !== undefined) {
        setDownloadCounts(prev => ({ ...prev, [wallpaper.id]: serverTotal }))
      }
      showNotice(`Added "${wallpaper.name}" to your Library!`)
    } catch (err) {
      console.error('Failed to add wallpaper to library:', err)
    } finally {
      setAddingLibraryId(null)
    }
  }

  const handleInstall = async (wallpaper) => {
    setApplyingId(wallpaper.id)
    try {
      const isVideo = wallpaper.type === 'video' || /\.(mp4|webm|mkv|avi|mov)$/i.test(wallpaper.source || '')
      const isStream = !isVideo && (wallpaper.type === 'youtube' || wallpaper.type === 'stream' || Boolean(parseYouTubeId(wallpaper.source)))
      const resolvedEngine = isVideo ? 'video-player' : (isStream ? 'web-stream' : 'image-player')
      const targetVolume = audioVolume > 0 ? audioVolume : 50
      const item = {
        id: `community-${wallpaper.id}`,
        name: wallpaper.name,
        engine: resolvedEngine,
        type: 'wallpaper',
        isCustom: true,
        installedAt: Date.now(),
        preview: wallpaper.preview,
        tags: wallpaper.tags || ['community'],
        config: {
          ...(isVideo
            ? { videoPath: wallpaper.source, speedMultiplier: 1, volume: targetVolume, muted: false }
            : isStream
            ? {
                streamUrl: wallpaper.source,
                url: wallpaper.source,
                streamType: wallpaper.type === 'youtube' ? 'youtube' : 'web',
                muted: false,
                volume: targetVolume,
                speedMultiplier: 1,
              }
            : { imagePath: wallpaper.source, url: wallpaper.source, fit: 'cover' }
          ),
        },
        communityMeta: {
          author: wallpaper.author,
          originalId: wallpaper.id,
          source: wallpaper.source,
        },
      }

      installItem(item)
      pinToHome(item.id)
      setWallpaperAudio(item.id, { volume: targetVolume, muted: false })
      setActiveWallpaper(item)
      await applyWallpaperToDesktop(item, { forceVolume: targetVolume, forceMuted: false })

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

  const handleUnlockAdmin = (e) => {
    e.preventDefault()
    if (verifyAdminPasscode(passcodeInput)) {
      setCommunityAdminUnlocked(true)
      setShowAdminModal(false)
      setPasscodeInput('')
      setPasscodeError(false)
      showNotice('Admin Mode unlocked! Moderation tools are now active.')
    } else {
      setPasscodeError(true)
    }
  }

  const handleLockAdmin = () => {
    setCommunityAdminUnlocked(false)
    showNotice('Admin Mode locked.')
    if (tab === 'moderation' || tab === 'manage') setTab('browse')
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setSubmitting(true)
    setSubmitResult(null)
    try {
      await submitWallpaper({
        ...submitForm,
        authorName: submitForm.authorName || authUser?.user_metadata?.full_name || authUser?.email?.split('@')[0],
      })
      setSubmitResult({ success: true, message: 'Submitted! Your wallpaper is queued for review and will appear once approved by moderators.' })
      setSubmitForm({ title: '', description: '', type: 'youtube', source: '', tags: [], authorName: '' })
      if (isAdmin) loadPendingQueue()
    } catch (err) {
      setSubmitResult({ success: false, message: err.message })
    } finally {
      setSubmitting(false)
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

          {isAdmin ? (
            <div className="flex items-center gap-1.5">
              <div className="admin-badge-pill" style={{ height: 26, fontSize: 11 }}>
                <ShieldCheck size={11} />
                <span>Admin</span>
              </div>
              <button
                className="btn btn-ghost"
                style={{ padding: '3px 8px', fontSize: 11, height: 26, display: 'flex', alignItems: 'center', gap: 4 }}
                title="Lock Admin Mode"
                onClick={handleLockAdmin}
              >
                <Unlock size={11} />
                <span>Lock</span>
              </button>
            </div>
          ) : (
            <button
              className="btn btn-ghost"
              style={{ padding: '4px 10px', fontSize: 11, height: 28, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 4 }}
              title="Enter Admin Passcode"
              onClick={() => {
                setPasscodeError(false)
                setShowAdminModal(true)
              }}
            >
              <Lock size={11} />
              <span>Moderator Access</span>
            </button>
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
          {/* Discovery Toolbar: Structured into Levels */}
          <div style={{ marginBottom: 20, display: 'flex', flexDirection: 'column', gap: 10 }}>
            {/* Level 1: Primary Search + Sort Dropdown */}
            <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
              <div style={{ position: 'relative', flex: 1, minWidth: 260 }}>
                <Search size={14} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                <input
                  value={query}
                  onChange={e => setQuery(e.target.value)}
                  placeholder="Search live wallpapers by title, creator, or keywords…"
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

              {/* Sort Selector */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span className="text-xs text-muted">Sort:</span>
                <select
                  value={sortMode}
                  onChange={e => setSortMode(e.target.value)}
                  style={{
                    background: 'var(--bg-card)',
                    border: '1px solid var(--border-subtle)',
                    borderRadius: 6,
                    padding: '6px 10px',
                    fontSize: 11.5,
                    color: 'var(--text-main)',
                    outline: 'none',
                    cursor: 'pointer',
                  }}
                >
                  <option value="popular">Most Popular</option>
                  <option value="newest">Newest First</option>
                  <option value="likes">Most Liked</option>
                  <option value="name">Alphabetical</option>
                </select>
              </div>
            </div>

            {/* Level 2: Content Type Filters & Curation & View Mode */}
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                {/* Content Type Filter */}
                <div className="flex gap-1">
                  {TYPE_FILTERS.map(f => (
                    <button
                      key={f.id}
                      className={`btn ${typeFilter === f.id ? 'btn-primary' : 'btn-ghost'}`}
                      style={{ padding: '4px 10px', fontSize: 11, height: 28, display: 'flex', alignItems: 'center', gap: 4 }}
                      onClick={() => setTypeFilter(f.id)}
                    >
                      {f.icon && <f.icon size={11} />}
                      {f.label}
                    </button>
                  ))}
                </div>

                {/* Curation Filter: All, Featured, Community Added */}
                <div className="flex gap-1" style={{ borderLeft: '1px solid var(--border-subtle)', paddingLeft: 8 }}>
                  {[
                    { id: 'all', label: 'All' },
                    { id: 'featured', label: 'Featured', icon: Star },
                    { id: 'community', label: 'Community Added', icon: Sparkles },
                  ].map(m => (
                    <button
                      key={m.id}
                      className={`btn ${filterMode === m.id ? 'btn-secondary' : 'btn-ghost'}`}
                      style={{ padding: '4px 10px', fontSize: 11, height: 28, display: 'flex', alignItems: 'center', gap: 4 }}
                      onClick={() => setFilterMode(m.id)}
                    >
                      {m.icon && <m.icon size={11} style={{ color: m.id === 'featured' ? 'var(--color-amber)' : 'var(--color-cyan)' }} />}
                      {m.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* View Mode Switcher */}
              <div className="segmented-control">
                <button
                  type="button"
                  className={`segmented-item ${browseView === 'grid' ? 'active' : ''}`}
                  onClick={() => setBrowseView('grid')}
                  title="Grid Cards View"
                  style={{ fontSize: 11, padding: '3px 8px' }}
                >
                  <LayoutGrid size={11} style={{ display: 'inline', marginRight: 4 }} />
                  <span>Cards</span>
                </button>
                <button
                  type="button"
                  className={`segmented-item ${browseView === 'compact' ? 'active' : ''}`}
                  onClick={() => setBrowseView('compact')}
                  title="Compact List View"
                  style={{ fontSize: 11, padding: '3px 8px' }}
                >
                  <List size={11} style={{ display: 'inline', marginRight: 4 }} />
                  <span>List</span>
                </button>
              </div>
            </div>

            {/* Level 3: Curated Tags (Quiet row) */}
            <div className="flex gap-1.5" style={{ flexWrap: 'wrap', alignItems: 'center', paddingTop: 2 }}>
              <span className="text-xs text-subtle" style={{ marginRight: 2 }}>Tags:</span>
              {TAGS.map(tag => (
                <button
                  key={tag}
                  onClick={() => toggleTag(tag)}
                  className={`badge ${selectedTags.includes(tag) ? 'badge-brand' : ''}`}
                  style={{ cursor: 'pointer', border: '1px solid var(--border-subtle)', fontSize: 10.5, padding: '2px 8px' }}
                >
                  #{tag}
                </button>
              ))}
              {selectedTags.length > 0 && (
                <button
                  className="btn btn-ghost"
                  style={{ fontSize: 10, padding: '2px 6px', height: 22, color: 'var(--text-muted)' }}
                  onClick={() => setSelectedTags([])}
                >
                  Clear tags
                </button>
              )}
            </div>
          </div>

          {/* Results Display */}
          {loading ? (
            <div className="flex items-center justify-center" style={{ height: 240, color: 'var(--text-muted)' }}>
              <div className="animate-spin" style={{ width: 28, height: 28, border: '2px solid var(--border-subtle)', borderTopColor: 'var(--color-brand)', borderRadius: '50%' }} />
            </div>
          ) : results.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '60px 20px', color: 'var(--text-muted)' }}>
              <Palette size={44} style={{ margin: '0 auto 16px', opacity: 0.3 }} />
              <div className="text-base font-semibold" style={{ marginBottom: 6, color: 'var(--text-main)' }}>
                {query || selectedTags.length ? 'No wallpapers match your criteria' : 'No community wallpapers available'}
              </div>
              <div className="text-xs text-subtle" style={{ maxWidth: 360, margin: '0 auto 16px' }}>
                {query || selectedTags.length
                  ? 'Try clearing some tags or search with broader terms.'
                  : 'Be the first creator to share a wallpaper with the community!'}
              </div>
              <button
                className="btn btn-primary"
                style={{ fontSize: 12 }}
                onClick={() => {
                  setQuery('')
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
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {results.map(item => {
                const badge = TYPE_BADGES[item.type] || {}
                const currentDownloads = Math.max(item.downloads || 0, downloadCounts[item.id] ?? 0)
                const currentLikes = likeCounts[item.id] ?? item.likes ?? 0
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
                          {badge.label || item.type}
                        </span>
                      </div>
                      <div className="text-xs text-muted" style={{ marginTop: 2 }}>
                        by <span style={{ color: 'var(--text-main)', fontWeight: 500 }}>{item.author || 'Anonymous'}</span>
                        <span style={{ marginLeft: 8, color: 'var(--text-subtle)' }}>
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
                          <Play size={11} />
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
            /* ── GRID CARDS VIEW (Editorial Experience) ── */
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 18 }}>
              {results.map(item => {
                const badge = TYPE_BADGES[item.type] || {}
                const isLiked = likedIds.has(item.id)
                const currentDownloads = Math.max(item.downloads || 0, downloadCounts[item.id] ?? 0)
                const currentLikes = likeCounts[item.id] ?? item.likes ?? 0

                const targetId = `community-${item.id}`
                const isInstalled = (installed || []).some(i => i?.id === targetId || i?.communityMeta?.originalId === item.id)
                const isCurrentlyApplied = isWallpaperRunning && (currentDesktopWallpaper?.id === targetId || activeWallpaper?.id === targetId)
                const isApplying = applyingId === item.id
                const isAddingLib = addingLibraryId === item.id

                return (
                  <div key={item.id} className="mp-card" style={{ position: 'relative' }}>
                    {/* Thumbnail with overlay & preview trigger */}
                    <div
                      className="mp-thumb-container"
                      onClick={() => setPreviewItem(item)}
                      title={`Click to preview ${item.name}`}
                    >
                      {item.preview ? (
                        <img
                          src={item.preview}
                          alt={item.name}
                          className="mp-thumb-img"
                          loading="lazy"
                        />
                      ) : (
                        <div className="flex items-center justify-center w-full h-full text-subtle text-xs">
                          No preview available
                        </div>
                      )}

                      {/* Top-Left: Featured Curated Badge */}
                      {item.featured && (
                        <div className="mp-badge-top-left">
                          <div
                            className="mp-pill-badge"
                            style={{
                              background: 'rgba(234, 179, 8, 0.9)',
                              color: '#000',
                              border: '1px solid rgba(255, 255, 255, 0.4)',
                              fontWeight: 700,
                              fontSize: 9.5,
                            }}
                          >
                            <Star size={10} fill="#000" />
                            <span>Featured</span>
                          </div>
                        </div>
                      )}

                      {/* Top-Right: Media Type Badge & Instant Admin Takedown */}
                      <div className="mp-badge-top-right" style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                        {isAdmin && (
                          <button
                            type="button"
                            className="btn btn-danger"
                            style={{
                              padding: '2px 7px',
                              height: 22,
                              fontSize: 10,
                              fontWeight: 600,
                              borderRadius: 4,
                              display: 'flex',
                              alignItems: 'center',
                              gap: 3,
                              background: 'rgba(239, 68, 68, 0.88)',
                              backdropFilter: 'blur(6px)',
                              border: '1px solid rgba(255, 255, 255, 0.3)',
                              color: '#ffffff',
                              cursor: 'pointer',
                              zIndex: 10,
                            }}
                            onClick={(e) => {
                              e.stopPropagation()
                              setTakedownTarget(item)
                              setTakedownReason('')
                            }}
                            title="Instant Takedown"
                          >
                            <Trash2 size={11} />
                            <span>Takedown</span>
                          </button>
                        )}
                        <div
                          className="mp-pill-badge"
                          style={{
                            background: 'rgba(15, 15, 20, 0.85)',
                            color: badge.color || 'var(--text-main)',
                            border: '1px solid rgba(255, 255, 255, 0.15)',
                            fontSize: 10,
                          }}
                        >
                          {badge.label || item.type}
                        </div>
                      </div>

                      {/* Hover Center Overlay */}
                      <div className="mp-thumb-overlay">
                        <span className="mp-preview-pill">
                          <Eye size={13} />
                          <span>Live Preview</span>
                        </span>
                      </div>
                    </div>

                    {/* Card Body */}
                    <div style={{ padding: '14px 14px 12px', display: 'flex', flexDirection: 'column', flex: 1 }}>
                      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8, marginBottom: 4 }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <h3
                            className="font-semibold text-sm"
                            style={{
                              whiteSpace: 'nowrap',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              color: 'var(--text-main)',
                            }}
                            title={item.name}
                          >
                            {item.name}
                          </h3>
                          <div className="text-xs text-muted" style={{ marginTop: 2 }}>
                            by <span style={{ color: 'var(--text-main)', fontWeight: 500 }}>{item.author || 'Anonymous'}</span>
                            {item.isCommunitySubmission && (
                              <span style={{ marginLeft: 6, color: 'var(--color-cyan)', fontSize: 10, fontWeight: 600 }}>• Community</span>
                            )}
                          </div>
                        </div>

                        <button
                          className={`mp-like-btn ${isLiked ? 'liked' : ''}`}
                          onClick={(e) => {
                            e.stopPropagation()
                            handleLike(item.id)
                          }}
                          disabled={likingId === item.id}
                          title={isLiked ? 'Unlike' : 'Like'}
                        >
                          <Heart size={11} fill={isLiked ? 'currentColor' : 'none'} />
                          <span>{currentLikes}</span>
                        </button>
                      </div>

                      {item.description && (
                        <p
                          className="text-xs text-muted"
                          style={{
                            margin: '4px 0 8px',
                            lineHeight: 1.4,
                            display: '-webkit-box',
                            WebkitLineClamp: 2,
                            WebkitBoxOrient: 'vertical',
                            overflow: 'hidden',
                          }}
                        >
                          {item.description}
                        </p>
                      )}

                      {/* Tags & Downloads Row */}
                      <div className="flex items-center justify-between gap-2" style={{ marginTop: 'auto', marginBottom: 10 }}>
                        <div className="flex gap-1 truncate" style={{ maxWidth: '65%' }}>
                          {item.tags?.slice(0, 2).map(t => (
                            <span
                              key={t}
                              style={{
                                fontSize: 9.5,
                                padding: '1px 5px',
                                borderRadius: 4,
                                background: 'var(--bg-card-hover)',
                                border: '1px solid var(--border-subtle)',
                                color: 'var(--text-muted)',
                              }}
                            >
                              #{t}
                            </span>
                          ))}
                        </div>
                        <span className="text-xs text-subtle" style={{ fontSize: 10.5 }}>
                          {currentDownloads} downloads
                        </span>
                      </div>

                      {/* Card Action Buttons: Library status & Apply status */}
                      <div className="flex items-center gap-2" style={{ marginTop: 2 }}>
                        {/* 1. Library Status / Add Button */}
                        {isInstalled ? (
                          <div
                            className="btn btn-ghost mp-btn-action"
                            style={{
                              flex: 1,
                              padding: '0 6px',
                              fontSize: 11,
                              height: 32,
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              gap: 4,
                              color: 'var(--color-emerald)',
                              border: '1px solid color-mix(in srgb, var(--color-emerald) 35%, transparent)',
                              background: 'color-mix(in srgb, var(--color-emerald) 8%, transparent)',
                              cursor: 'default',
                            }}
                            title="Installed in your permanent Library"
                          >
                            <Check size={12} />
                            <span>In Library</span>
                          </div>
                        ) : (
                          <button
                            className="btn btn-secondary mp-btn-action"
                            style={{ flex: 1, padding: '0 6px', fontSize: 11, height: 32 }}
                            disabled={isAddingLib || isApplying}
                            onClick={() => handleAddToLibrary(item)}
                            title="Add to your permanent Library"
                          >
                            <FolderPlus size={12} />
                            <span>{isAddingLib ? 'Adding…' : '+ Library'}</span>
                          </button>
                        )}

                        {/* 2. Desktop Apply Status / Button */}
                        {isCurrentlyApplied ? (
                          <div
                            className="btn btn-success mp-btn-action"
                            style={{
                              flex: 1.2,
                              cursor: 'default',
                              fontSize: 11,
                              height: 32,
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              gap: 4,
                            }}
                          >
                            <Check size={12} /> Active
                          </div>
                        ) : (
                          <button
                            className="btn btn-primary mp-btn-action"
                            style={{ flex: 1.2, padding: '0 6px', fontSize: 11, height: 32 }}
                            disabled={isApplying || isAddingLib}
                            onClick={() => handleInstall(item)}
                            title="Apply directly to desktop"
                          >
                            {isApplying ? 'Applying…' : <><Play size={11} fill="currentColor" /> Apply</>}
                          </button>
                        )}
                      </div>

                      {/* Admin Superpowers Footer */}
                      {isAdmin && (
                        <div
                          style={{
                            marginTop: 10,
                            paddingTop: 8,
                            borderTop: '1px dashed color-mix(in srgb, var(--color-amber) 30%, var(--border-subtle))',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                          }}
                        >
                          <span style={{ fontSize: 9.5, fontWeight: 600, color: 'var(--color-amber)', textTransform: 'uppercase' }}>
                            Admin
                          </span>
                          <div className="flex items-center gap-1.5">
                            <button
                              className="admin-action-btn"
                              style={{
                                background: item.featured ? 'color-mix(in srgb, var(--color-amber) 20%, transparent)' : 'rgba(255,255,255,0.06)',
                                color: item.featured ? 'var(--color-amber)' : 'var(--text-muted)',
                                padding: '3px 6px',
                                fontSize: 10,
                              }}
                              onClick={() => handleToggleFeature(item)}
                              title={item.featured ? 'Remove from Featured' : 'Feature this wallpaper'}
                            >
                              <Star size={10} fill={item.featured ? 'currentColor' : 'none'} />
                              <span>{item.featured ? 'Featured' : 'Feature'}</span>
                            </button>

                            <button
                              className="admin-action-btn"
                              style={{
                                background: 'color-mix(in srgb, var(--color-rose) 12%, transparent)',
                                color: 'var(--color-rose)',
                                border: '1px solid color-mix(in srgb, var(--color-rose) 30%, transparent)',
                                padding: '3px 6px',
                                fontSize: 10,
                              }}
                              onClick={() => {
                                setTakedownTarget(item)
                                setTakedownReason('')
                              }}
                              title="Immediately remove wallpaper from community feed"
                            >
                              <Trash2 size={10} />
                              <span>Take Down</span>
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
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
                      onClick={() => setPreviewItem({
                        id: sub.id,
                        name: sub.title,
                        description: sub.description,
                        author: sub.author,
                        type: sub.type,
                        source: sub.source,
                        preview: sub.preview,
                        tags: sub.tags,
                        downloads: 0,
                        likes: 0,
                      })}
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
                      <div className="flex items-center gap-2">
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
                        onClick={() => setPreviewItem({
                          id: sub.id,
                          name: sub.title,
                          description: sub.description,
                          author: sub.author,
                          type: sub.type,
                          source: sub.source,
                          preview: sub.preview,
                          tags: sub.tags,
                          downloads: 0,
                          likes: 0,
                        })}
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
        <div className="animate-fadeIn" style={{ maxWidth: 640, margin: '0 auto' }}>
          <div className="card" style={{ padding: '24px 28px' }}>
            <h2 className="font-semibold text-lg" style={{ marginBottom: 4 }}>
              Submit a Wallpaper to the Community
            </h2>
            <p className="text-xs text-muted" style={{ marginBottom: 20 }}>
              Share your favorite animated loops, YouTube streams, or digital art with everyone. All community contributions are free.
            </p>

            {submitResult && (
              <div
                className={`card ${submitResult.success ? 'border-emerald' : 'border-rose'}`}
                style={{
                  padding: '12px 16px',
                  marginBottom: 20,
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

            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
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

              {/* Author Display Name */}
              <div>
                <label className="text-xs font-semibold text-muted" style={{ display: 'block', marginBottom: 6 }}>
                  Your Creator / Display Name
                </label>
                <input
                  type="text"
                  placeholder={authUser?.user_metadata?.full_name || authUser?.email?.split('@')[0] || 'e.g. Neo'}
                  value={submitForm.authorName}
                  onChange={e => setSubmitForm(f => ({ ...f, authorName: e.target.value }))}
                  style={{
                    width: '100%', padding: '9px 12px',
                    background: 'var(--bg-base)', border: '1px solid var(--border-main)',
                    borderRadius: 8, color: 'var(--text-main)', fontSize: 13,
                  }}
                />
              </div>

              {/* Type */}
              <div>
                <label className="text-xs font-semibold text-muted" style={{ display: 'block', marginBottom: 6 }}>
                  Wallpaper Type *
                </label>
                <div className="flex gap-2">
                  {[
                    { id: 'youtube', label: 'YouTube Video / Stream', icon: MonitorPlay },
                    { id: 'stream', label: 'Direct Video URL (.mp4)', icon: Globe },
                    { id: 'image', label: 'Image URL', icon: Image },
                  ].map(t => (
                    <button
                      key={t.id}
                      type="button"
                      className={`btn ${submitForm.type === t.id ? 'btn-primary' : 'btn-ghost'}`}
                      style={{ flex: 1, padding: '8px 10px', fontSize: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
                      onClick={() => setSubmitForm(f => ({ ...f, type: t.id }))}
                    >
                      <t.icon size={13} />
                      {t.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Source URL */}
              <div>
                <label className="text-xs font-semibold text-muted" style={{ display: 'block', marginBottom: 6 }}>
                  {submitForm.type === 'youtube' ? 'YouTube URL or Video ID *' : 'Direct Media URL *'}
                </label>
                <input
                  type="text"
                  required
                  placeholder={submitForm.type === 'youtube' ? 'https://www.youtube.com/watch?v=...' : 'https://example.com/wallpaper.mp4'}
                  value={submitForm.source}
                  onChange={e => setSubmitForm(f => ({ ...f, source: e.target.value }))}
                  style={{
                    width: '100%', padding: '9px 12px',
                    background: 'var(--bg-base)', border: '1px solid var(--border-main)',
                    borderRadius: 8, color: 'var(--text-main)', fontSize: 13,
                  }}
                />
              </div>

              {/* Description */}
              <div>
                <label className="text-xs font-semibold text-muted" style={{ display: 'block', marginBottom: 6 }}>
                  Description
                </label>
                <textarea
                  rows={3}
                  placeholder="Tell people about this wallpaper, creator credits, mood, loop specs…"
                  value={submitForm.description}
                  onChange={e => setSubmitForm(f => ({ ...f, description: e.target.value }))}
                  style={{
                    width: '100%', padding: '9px 12px',
                    background: 'var(--bg-base)', border: '1px solid var(--border-main)',
                    borderRadius: 8, color: 'var(--text-main)', fontSize: 13, resize: 'vertical',
                  }}
                />
              </div>

              {/* Tags */}
              <div>
                <label className="text-xs font-semibold text-muted" style={{ display: 'block', marginBottom: 6 }}>
                  Select Relevant Tags
                </label>
                <div className="flex gap-1.5" style={{ flexWrap: 'wrap' }}>
                  {TAGS.map(tag => {
                    const isSelected = submitForm.tags.includes(tag)
                    return (
                      <button
                        key={tag}
                        type="button"
                        className={`badge ${isSelected ? 'badge-brand' : ''}`}
                        style={{ cursor: 'pointer', border: '1px solid var(--border-main)', fontSize: 11 }}
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

              <div style={{ marginTop: 8 }}>
                <button
                  type="submit"
                  className="btn btn-primary w-full"
                  disabled={submitting}
                  style={{ padding: '10px 16px', fontSize: 13, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
                >
                  <Upload size={14} />
                  <span>{submitting ? 'Submitting to Moderation…' : 'Submit for Review'}</span>
                </button>
                <div className="text-center text-subtle text-xs" style={{ marginTop: 8 }}>
                  Submissions appear in the Community Hub once approved by moderators.
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── MY SUBMISSIONS TAB ── */}
      {tab === 'submissions' && (
        <div className="animate-fadeIn">
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
                      <div className="flex items-center gap-2">
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
        </div>
      )}

      {/* ── ADMIN PASSCODE UNLOCK MODAL ── */}
      {showAdminModal && createPortal(
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 999999,
            background: 'rgba(0, 0, 0, 0.7)',
            backdropFilter: 'blur(8px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 16,
          }}
          onClick={() => setShowAdminModal(false)}
        >
          <div
            className="card"
            style={{
              width: '100%',
              maxWidth: 400,
              padding: '24px 28px',
              borderRadius: 14,
              boxShadow: '0 24px 60px rgba(0,0,0,0.8)',
            }}
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between" style={{ marginBottom: 16 }}>
              <div className="flex items-center gap-2.5">
                <div
                  style={{
                    width: 32,
                    height: 32,
                    borderRadius: 8,
                    background: 'color-mix(in srgb, var(--color-amber) 15%, transparent)',
                    color: 'var(--color-amber)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Lock size={16} />
                </div>
                <div>
                  <h3 className="font-semibold text-sm">Moderator Unlock</h3>
                  <div className="text-xs text-muted">AetherFlow Administrator Access</div>
                </div>
              </div>
              <button
                onClick={() => setShowAdminModal(false)}
                className="btn btn-ghost"
                style={{ padding: 4, height: 28, width: 28 }}
              >
                <X size={14} />
              </button>
            </div>

            <p className="text-xs text-muted" style={{ lineHeight: 1.5, marginBottom: 16 }}>
              Enter the admin secret key to unlock the in-app Moderation Queue and instant takedown tools.
            </p>

            <form onSubmit={handleUnlockAdmin}>
              <input
                type="password"
                autoFocus
                placeholder="Enter admin passcode…"
                value={passcodeInput}
                onChange={e => {
                  setPasscodeInput(e.target.value)
                  setPasscodeError(false)
                }}
                style={{
                  width: '100%',
                  padding: '9px 12px',
                  borderRadius: 8,
                  background: 'var(--bg-base)',
                  border: passcodeError ? '1px solid var(--color-rose)' : '1px solid var(--border-main)',
                  color: 'var(--text-main)',
                  fontSize: 13,
                  outline: 'none',
                  marginBottom: passcodeError ? 6 : 14,
                }}
              />

              {passcodeError && (
                <div className="text-xs" style={{ color: 'var(--color-rose)', marginBottom: 12 }}>
                  Incorrect passcode. Please verify your admin credentials.
                </div>
              )}

              <div className="flex gap-2">
                <button
                  type="button"
                  className="btn btn-ghost"
                  style={{ flex: 1, fontSize: 12 }}
                  onClick={() => setShowAdminModal(false)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  style={{ flex: 1.5, fontSize: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
                >
                  <Unlock size={13} />
                  <span>Unlock Admin</span>
                </button>
              </div>
            </form>
          </div>
        </div>,
        document.body
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
          onApply={(item) => handleInstall(item)}
          onLike={(id) => handleLike(id)}
          onTakedown={(item) => {
            setTakedownTarget(item)
            setTakedownReason('')
          }}
          isLiked={likedIds.has(previewItem.id)}
          likeCount={likeCounts[previewItem.id] ?? previewItem.likes ?? 0}
          liking={likingId === previewItem.id}
          downloadCount={Math.max(previewItem.downloads || 0, downloadCounts[previewItem.id] ?? 0)}
          isInstalled={(installed || []).some(i => i?.id === `community-${previewItem.id}` || i?.communityMeta?.originalId === previewItem.id)}
          isCurrentlyApplied={isWallpaperRunning && (currentDesktopWallpaper?.id === `community-${previewItem.id}` || activeWallpaper?.id === `community-${previewItem.id}`)}
          isApplying={applyingId === previewItem.id}
          isAddingLib={addingLibraryId === previewItem.id}
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
 * Clean Video Preview with decoder destruction on unmount
 */
function CleanVideoPreview({ source }) {
  const videoRef = useRef(null)

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
      }}
    >
      <video
        ref={videoRef}
        src={source}
        autoPlay
        loop
        muted
        playsInline
        style={{ width: '100%', height: '100%', objectFit: 'cover' }}
      />
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
  onApply,
  onLike,
  onTakedown,
  isLiked,
  likeCount,
  liking,
  downloadCount,
  isInstalled,
  isCurrentlyApplied,
  isApplying,
  isAddingLib,
}) {
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

  if (!item) return null

  const badge = TYPE_BADGES[item.type] || {}

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
              <div className="text-xs text-muted" style={{ fontSize: 12, marginTop: 2 }}>
                by <span style={{ color: 'var(--text-main)', fontWeight: 500 }}>{item.author || 'Anonymous'}</span>
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
          {item.type === 'youtube' ? (
            <CleanYouTubePreview source={item.source} title={item.name} />
          ) : item.type === 'stream' && (item.source.endsWith('.mp4') || item.source.endsWith('.webm')) ? (
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
          </div>
        </div>

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

          {/* Right Buttons: Add to Library & Apply & Take Down */}
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

            {/* 1. Library Status / Add Button */}
            {isInstalled ? (
              <span
                className="badge badge-emerald"
                style={{ padding: '6px 11px', fontSize: 12, display: 'inline-flex', alignItems: 'center', gap: 5 }}
              >
                <Check size={13} /> In Library
              </span>
            ) : (
              <button
                className="btn btn-secondary"
                style={{ padding: '6px 12px', fontSize: 12, display: 'flex', alignItems: 'center', gap: 5 }}
                disabled={isAddingLib || isApplying}
                onClick={() => onAddToLibrary(item)}
              >
                <FolderPlus size={13} />
                <span>{isAddingLib ? 'Adding…' : '+ Add to Library'}</span>
              </button>
            )}

            {/* 2. Desktop Active / Apply Button */}
            {isCurrentlyApplied ? (
              <span
                className="btn btn-success"
                style={{ padding: '6px 14px', fontSize: 12, cursor: 'default', display: 'flex', alignItems: 'center', gap: 5 }}
              >
                <Check size={13} /> Active on Desktop
              </span>
            ) : (
              <button
                className="btn btn-primary"
                style={{ padding: '6px 14px', fontSize: 12, display: 'flex', alignItems: 'center', gap: 5 }}
                disabled={isApplying || isAddingLib}
                onClick={() => onApply(item)}
              >
                {isApplying ? 'Applying…' : <><Play size={12} /> Apply to Desktop</>}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>,
    document.body
  )
}
