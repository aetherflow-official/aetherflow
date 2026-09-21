/**
 * AetherFlow Community Hub — Hybrid GitHub + Supabase + Admin Moderation Backend
 *
 * Catalog data: merged from yashpreeto7/aetherflow-community GitHub repo + approved Supabase submissions
 * User actions: submit, like, install tracking via Supabase RPC + tables
 * Admin Moderation: in-app review queue, instant approval, takedown/removal without touching GitHub
 */

import { supabase, isOnline } from './supabase.js'
import { parseYouTubeId } from '../engines/web-stream.js'
import { CURATED_CATALOG } from './curatedCatalog.js'
import { isTauri, tauriInvoke, safeConvertFileSrc, safeListen } from './wallpaperActions.js'

const env = (typeof import.meta !== 'undefined' && import.meta.env) ? import.meta.env : {}

// ── GitHub Catalog CDN ────────────────────────────────────────────────────────

const PRIMARY_CATALOG_URL = 'https://raw.githubusercontent.com/yashpreeto7/aetherflow-community/main/index.json'
const FALLBACK_CATALOG_URL = 'https://cdn.jsdelivr.net/gh/yashpreeto7/aetherflow-community@main/index.json'

let catalogCache = null
let catalogETag = null
let lastFetchTime = 0
const CACHE_TTL = 3 * 60 * 1000 // 3 minutes

export function clearCatalogCache() {
  catalogCache = null
  catalogETag = null
  lastFetchTime = 0
}

/**
 * Cleanly formats byte sizes into KB/MB without inventing false numbers
 */
export function formatBytes(bytes) {
  if (!bytes || bytes <= 0 || isNaN(bytes)) return ''
  if (bytes < 1024 * 1024) {
    return `${Math.round(bytes / 1024)} KB`
  }
  const mb = bytes / (1024 * 1024)
  return mb < 10 ? `${mb.toFixed(1)} MB` : `${Math.round(mb)} MB`
}

// ── Verified Working Stream Healing Map ───────────────────────────────────────
export const YOUTUBE_HEAL_MAP = {
  'jfKfPfyJRdk': {
    id: 'TURbeWK2wwg',
    name: 'Lofi Cafe & Gentle Rain',
    source: 'https://www.youtube.com/watch?v=TURbeWK2wwg',
    preview: 'https://img.youtube.com/vi/TURbeWK2wwg/hqdefault.jpg'
  },
  '1zxD9O4b1oY': {
    id: 'uD4izuDMUQA',
    name: 'Deep Space Cosmic Nebula',
    source: 'https://www.youtube.com/watch?v=uD4izuDMUQA',
    preview: 'https://img.youtube.com/vi/uD4izuDMUQA/hqdefault.jpg'
  },
  '7uK_Z2Q2R2E': {
    id: '21qNxnCS8WU',
    name: 'Synthwave Sunset Highway',
    source: 'https://www.youtube.com/watch?v=21qNxnCS8WU',
    preview: 'https://img.youtube.com/vi/21qNxnCS8WU/hqdefault.jpg'
  },
  'aXYKRAdrfEo': {
    id: 'eZe4Q_58UTU',
    name: 'Tokyo Night Drive POV',
    source: 'https://www.youtube.com/watch?v=eZe4Q_58UTU',
    preview: 'https://img.youtube.com/vi/eZe4Q_58UTU/hqdefault.jpg'
  },
  'nz1cEO01LzE': {
    id: 'WJ3-F02-F_Y',
    name: 'Milky Way Timelapse',
    source: 'https://www.youtube.com/watch?v=WJ3-F02-F_Y',
    preview: 'https://img.youtube.com/vi/WJ3-F02-F_Y/hqdefault.jpg'
  }
}

// ── Local Storage Helpers for Instant Admin Takedowns & Feature Overrides ─────

const TAKEDOWN_STORAGE_KEY = 'aetherflow_takedowns'
const FEATURED_STORAGE_KEY = 'aetherflow_featured_overrides'
const LOCAL_SUBMISSIONS_KEY = 'aetherflow_local_submissions'

export function getLocalTakedowns() {
  try {
    const raw = localStorage.getItem(TAKEDOWN_STORAGE_KEY)
    return new Set(raw ? JSON.parse(raw) : [])
  } catch {
    return new Set()
  }
}

export function addLocalTakedown(id) {
  try {
    const current = getLocalTakedowns()
    current.add(id)
    localStorage.setItem(TAKEDOWN_STORAGE_KEY, JSON.stringify(Array.from(current)))
  } catch (e) {
    console.warn('[Community] Failed to store local takedown:', e)
  }
}

export function removeLocalTakedown(id) {
  try {
    const current = getLocalTakedowns()
    current.delete(id)
    localStorage.setItem(TAKEDOWN_STORAGE_KEY, JSON.stringify(Array.from(current)))
  } catch (e) {
    console.warn('[Community] Failed to remove local takedown:', e)
  }
}

export function getLocalFeaturedOverrides() {
  try {
    const raw = localStorage.getItem(FEATURED_STORAGE_KEY)
    return raw ? JSON.parse(raw) : {}
  } catch {
    return {}
  }
}

export function setLocalFeaturedOverride(id, isFeatured) {
  try {
    const current = getLocalFeaturedOverrides()
    current[id] = Boolean(isFeatured)
    localStorage.setItem(FEATURED_STORAGE_KEY, JSON.stringify(current))
  } catch (e) {
    console.warn('[Community] Failed to save featured override:', e)
  }
}

function getLocalSubmissions() {
  try {
    const raw = localStorage.getItem(LOCAL_SUBMISSIONS_KEY)
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}

function saveLocalSubmissions(list) {
  try {
    localStorage.setItem(LOCAL_SUBMISSIONS_KEY, JSON.stringify(list))
  } catch (e) {
    console.warn('[Community] Failed to save local submissions:', e)
  }
}

const APPROVED_STORAGE_KEY = 'aetherflow_approved_overrides'
const REJECTED_STORAGE_KEY = 'aetherflow_rejected_overrides'

export function getLocalApprovedMap() {
  try {
    const raw = localStorage.getItem(APPROVED_STORAGE_KEY)
    return raw ? JSON.parse(raw) : {}
  } catch {
    return {}
  }
}

export function saveLocalApprovedMap(map) {
  try {
    localStorage.setItem(APPROVED_STORAGE_KEY, JSON.stringify(map))
  } catch (e) {
    console.warn('[Community] Failed to save approved map:', e)
  }
}

export function removeLocalApprovedOverride(id) {
  try {
    const map = getLocalApprovedMap()
    if (map[id]) {
      delete map[id]
      saveLocalApprovedMap(map)
    }
  } catch (e) {
    console.warn('[Community] Failed to remove approved override:', e)
  }
}

export function getLocalRejectedOverrides() {
  try {
    const raw = localStorage.getItem(REJECTED_STORAGE_KEY)
    return new Set(raw ? JSON.parse(raw) : [])
  } catch {
    return new Set()
  }
}

export function addLocalRejectedOverride(id) {
  try {
    const current = getLocalRejectedOverrides()
    current.add(id)
    localStorage.setItem(REJECTED_STORAGE_KEY, JSON.stringify(Array.from(current)))
    removeLocalApprovedOverride(id)
  } catch (e) {
    console.warn('[Community] Failed to save rejected override:', e)
  }
}

export function removeLocalRejectedOverride(id) {
  try {
    const current = getLocalRejectedOverrides()
    current.delete(id)
    localStorage.setItem(REJECTED_STORAGE_KEY, JSON.stringify(Array.from(current)))
  } catch (e) {
    console.warn('[Community] Failed to remove rejected override:', e)
  }
}

// ── Admin Authorization Checks ────────────────────────────────────────────────

let dynamicAdminsCache = null
let dynamicAdminsFetchTime = 0
const DYNAMIC_ADMINS_TTL = 60 * 1000 // 1 minute
export const ROOT_OWNER_EMAIL = 'yash09preet@gmail.com'

/**
 * Checks if the user is recognized as an Admin.
 * Requires an authenticated user — no passcode bypass.
 * Admin is granted if:
 *   1. authUser metadata role is 'admin' or is_admin is true
 *   2. authUser email matches root owner or VITE_ADMIN_EMAILS
 *   3. authUser email is present in public.community_admins table in Supabase
 */
export function checkIsAdmin(user) {
  if (!user) return false
  if (user.user_metadata?.role === 'admin' || user.user_metadata?.is_admin === true) return true
  if (user.app_metadata?.role === 'admin') return true

  const email = (user.email || user.user_metadata?.email || '').toLowerCase().trim()
  if (!email) return false

  // 1. Root owner account
  if (email === ROOT_OWNER_EMAIL) return true

  // 2. Env variable fallback
  const adminEmailsEnv = (env.VITE_ADMIN_EMAILS || '')
  const adminEmails = adminEmailsEnv.split(',').map(s => s.trim().toLowerCase()).filter(Boolean)
  if (adminEmails.includes(email)) return true

  // 3. Dynamically loaded moderator emails from database
  if (dynamicAdminsCache && dynamicAdminsCache.some(a => a.email?.toLowerCase() === email)) {
    return true
  }

  // 4. Username match
  const username = (user.user_metadata?.user_name || user.user_metadata?.preferred_username || '').toLowerCase().trim()
  if (username && (username === 'yashpreeto7' || username === 'yash09preet')) {
    return true
  }

  return false
}

/**
 * Internal helper: resolves the current authenticated user and verifies admin status.
 * Throws if not authenticated or not admin.
 */
async function requireAdmin() {
  if (!isOnline()) throw new Error('Admin actions require an online connection')
  const { data } = await supabase.auth.getUser()
  const user = data?.user
  if (!user) throw new Error('You must be signed in to perform admin actions')
  if (!checkIsAdmin(user)) throw new Error('You do not have admin privileges')
  return user
}

// ── Fetch & Search Catalog ───────────────────────────────────────────────────

/**
 * Fetches the community wallpaper catalog by merging:
 * 1. Static GitHub catalog
 * 2. Approved Supabase submissions
 * 3. Locally approved submissions
 * And filters out any removed/taken-down wallpapers.
 */
export async function fetchCatalog(forceRefresh = false) {
  const now = Date.now()

  // Return cached data if fresh enough
  if (!forceRefresh && catalogCache && (now - lastFetchTime) < CACHE_TTL) {
    return catalogCache
  }

  const takedowns = getLocalTakedowns()
  const featuredOverrides = getLocalFeaturedOverrides()

  let baseWallpapers = []
  let staticVersion = 1
  let updatedAt = new Date().toISOString()

  // 1. Fetch static GitHub catalog
  try {
    const headers = {}
    if (catalogETag && !forceRefresh) {
      headers['If-None-Match'] = catalogETag
    }

    let response
    try {
      response = await fetch(PRIMARY_CATALOG_URL, { headers })
      if (!response.ok) throw new Error(`Primary CDN returned ${response.status}`)
    } catch {
      response = await fetch(FALLBACK_CATALOG_URL, { headers })
    }

    if (response.ok) {
      const etag = response.headers.get('ETag')
      if (etag) catalogETag = etag
      const data = await response.json()
      baseWallpapers = data.wallpapers || []
      staticVersion = data.version || 1
      updatedAt = data.updatedAt || updatedAt
    }
  } catch (err) {
    console.warn('[Community] Failed to fetch static GitHub catalog:', err.message)
    if (catalogCache) {
      baseWallpapers = catalogCache.wallpapers || []
    }
  }

  // 2. Fetch approved submissions from Supabase if online
  let approvedSubmissions = []
  if (isOnline()) {
    try {
      const { data, error } = await supabase
        .from('submissions')
        .select('*')
        .eq('status', 'approved')
        .order('created_at', { ascending: false })

      if (!error && Array.isArray(data)) {
        approvedSubmissions = data.map(sub => {
          let preview = sub.preview || sub.preview_url || ''
          if (!preview && sub.type === 'youtube') {
            const ytid = parseYouTubeId(sub.source)
            if (ytid) preview = `https://img.youtube.com/vi/${ytid}/hqdefault.jpg`
          } else if (!preview && sub.type === 'image') {
            preview = sub.source
          }

          const resolvedSource = sub.github_asset_url || sub.source || ''

          return {
            id: sub.id,
            name: sub.title || 'Untitled Wallpaper',
            description: sub.description || '',
            author: sub.author_name || sub.author || 'Community Creator',
            type: sub.type || 'youtube',
            source: resolvedSource,
            preview,
            tags: Array.isArray(sub.tags) ? sub.tags : (sub.tags ? [sub.tags] : ['community']),
            downloads: sub.downloads || 0,
            likes: sub.likes || 0,
            featured: Boolean(sub.is_featured),
            isCommunitySubmission: true,
            createdAt: sub.created_at,
            hasAudio: Boolean(sub.has_audio),
            fileSize: sub.file_size || 0,
            mediaFormat: sub.media_format || '',
            duration: sub.duration || 0,
            dimensions: sub.dimensions || '',
            stagingPath: sub.staging_path || '',
            githubAssetUrl: sub.github_asset_url || '',
            authorPortfolio: sub.author_portfolio || sub.authorPortfolio || '',
            license: sub.license || 'CC BY-NC-ND 4.0',
          }
        })
      }

      // Also fetch any Supabase submissions marked as removed or rejected
      const { data: removedRows } = await supabase
        .from('submissions')
        .select('id')
        .in('status', ['removed', 'rejected'])

      if (Array.isArray(removedRows)) {
        for (const row of removedRows) {
          takedowns.add(row.id)
        }
      }
    } catch (err) {
      console.warn('[Community] Supabase approved submissions query skipped:', err.message)
    }
  }

  // 3. Merge local mock submissions and approved map overrides
  const approvedMap = getLocalApprovedMap()
  const localApprovedFromMap = Object.values(approvedMap).map(sub => ({
    id: sub.id,
    name: sub.name || sub.title || 'Community Wallpaper',
    description: sub.description || '',
    author: sub.author || 'Community Creator',
    authorPortfolio: sub.authorPortfolio || sub.author_portfolio || '',
    license: sub.license || 'CC BY-NC-ND 4.0',
    type: sub.type || 'youtube',
    source: sub.source,
    preview: sub.preview || sub.source,
    tags: Array.isArray(sub.tags) ? sub.tags : ['community'],
    downloads: sub.downloads || 0,
    likes: sub.likes || 0,
    featured: Boolean(sub.featured),
    isCommunitySubmission: true,
    createdAt: sub.createdAt || sub.reviewed_at || new Date().toISOString(),
    hasAudio: Boolean(sub.hasAudio || sub.has_audio),
    fileSize: sub.fileSize || sub.file_size || 0,
    mediaFormat: sub.mediaFormat || sub.media_format || '',
    duration: sub.duration || 0,
    dimensions: sub.dimensions || '',
    githubAssetUrl: sub.githubAssetUrl || sub.github_asset_url || '',
  }))

  const localSubs = getLocalSubmissions()
  const localApproved = localSubs
    .filter(s => s.status === 'approved' && !approvedSubmissions.some(a => a.id === s.id) && !localApprovedFromMap.some(a => a.id === s.id))
    .map(sub => ({
      id: sub.id,
      name: sub.title,
      description: sub.description,
      author: sub.author || 'You (Local)',
      authorPortfolio: sub.authorPortfolio || sub.author_portfolio || '',
      license: sub.license || 'CC BY-NC-ND 4.0',
      type: sub.type,
      source: sub.source,
      preview: sub.preview || sub.source,
      tags: sub.tags || ['community'],
      downloads: sub.downloads || 0,
      likes: sub.likes || 0,
      featured: Boolean(sub.is_featured),
      isCommunitySubmission: true,
      createdAt: sub.created_at,
      hasAudio: Boolean(sub.hasAudio || sub.has_audio),
      fileSize: sub.fileSize || sub.file_size || 0,
      mediaFormat: sub.mediaFormat || sub.media_format || '',
      duration: sub.duration || 0,
      dimensions: sub.dimensions || '',
      githubAssetUrl: sub.githubAssetUrl || sub.github_asset_url || '',
    }))

  // 4. Combine and deduplicate
  const seenIds = new Set()
  const combined = []

  // Put community approved submissions first for fresh engagement
  for (const rawItem of [...localApprovedFromMap, ...approvedSubmissions, ...localApproved, ...CURATED_CATALOG, ...baseWallpapers]) {
    if (!rawItem?.id || seenIds.has(rawItem.id)) continue
    if (takedowns.has(rawItem.id)) continue // Exclude taken down items!

    const item = { ...rawItem }
    if (item.type === 'youtube' || item.source?.includes('youtube') || item.source?.includes('youtu.be')) {
      const parsedYt = parseYouTubeId(item.source)
      if (parsedYt && YOUTUBE_HEAL_MAP[parsedYt]) {
        const healed = YOUTUBE_HEAL_MAP[parsedYt]
        item.source = healed.source
        item.preview = healed.preview
      } else if (parsedYt && (!item.preview || item.preview.includes(parsedYt) || item.preview.includes('hqdefault.jpg'))) {
        item.preview = `https://img.youtube.com/vi/${parsedYt}/hqdefault.jpg`
      }
    }

    seenIds.add(item.id)

    // Apply any local featured overrides
    const isFeatured = featuredOverrides[item.id] !== undefined
      ? featuredOverrides[item.id]
      : Boolean(item.featured)

    combined.push({
      ...item,
      featured: isFeatured,
    })
  }

  const catalog = {
    version: staticVersion,
    updatedAt,
    totalWallpapers: combined.length,
    wallpapers: combined,
  }

  catalogCache = catalog
  lastFetchTime = now
  return catalog
}

export const CATEGORY_SYNONYMS = {
  anime: ['anime', 'manga', 'ghibli', 'sakura', 'japanese', 'otaku'],
  cyberpunk: ['cyberpunk', 'cyber', 'neon', 'matrix', 'hacker', 'futuristic', 'blade runner', 'terminal', 'glitch'],
  space: ['space', 'cosmic', 'stars', 'galaxy', 'nebula', 'orbit', 'black hole', 'singularity', 'astronomy', 'planet', 'milky way'],
  nature: ['nature', 'forest', 'mountain', 'ocean', 'sea', 'water', 'waves', 'rain', 'mist', 'aurora', 'alpine', 'flora', 'landscape', 'jellyfish'],
  retro: ['retro', 'synthwave', 'retrowave', '80s', 'vaporwave', 'neon horizon', 'sunset highway'],
  city: ['city', 'urban', 'tokyo', 'shinjuku', 'street', 'night drive', 'alley', 'metropolis'],
  lofi: ['lofi', 'chill', 'cozy', 'study', 'cafe', 'rain on window', 'fireplace', 'relax'],
  abstract: ['abstract', 'math', 'geometry', 'fractal', 'gradient', 'flow', 'fluid', 'quantum', 'hex', 'particle'],
  gaming: ['gaming', 'pixel', 'game', 'arcade', '8bit', 'playstation', 'controller', 'retro wave'],
  minimal: ['minimal', 'clean', 'simple', 'monochrome', 'dark', 'zen', 'geometric']
}

/**
 * Search and filter wallpapers from the combined catalog.
 */
export async function searchCatalog({
  query = '',
  category = '',
  tags = [],
  type = '',
  filterMode = 'all', // 'all' | 'featured' | 'community' | 'popular' | 'liked'
  sortMode = 'popular', // 'popular' | 'newest' | 'likes' | 'name'
  likeCounts = {},
  downloadCounts = {},
  likedIds = new Set(),
  installedIds = new Set(),
} = {}) {
  const catalog = await fetchCatalog()
  let results = [...(catalog.wallpapers || [])]

  // Helper to check if an item is liked by the current user
  const isItemLikedByUser = (item) => {
    if (!item) return false
    const rawId = item.id || ''
    const altId = rawId.startsWith('community-') ? rawId.replace('community-', '') : `community-${rawId}`
    const origId = item.communityMeta?.originalId
    if (likedIds instanceof Set) {
      return likedIds.has(rawId) || likedIds.has(altId) || (Boolean(origId) && likedIds.has(origId))
    }
    if (Array.isArray(likedIds)) {
      return likedIds.includes(rawId) || likedIds.includes(altId) || (Boolean(origId) && likedIds.includes(origId))
    }
    return false
  }

  // Helper to compute effective likes and downloads for an item
  const getLikes = (item) => {
    const rawId = item.id || ''
    const altId = rawId.startsWith('community-') ? rawId.replace('community-', '') : `community-${rawId}`
    const origId = item.communityMeta?.originalId

    const isUserLiked = isItemLikedByUser(item)

    const hasExplicit =
      (rawId in likeCounts) ||
      (altId in likeCounts) ||
      (Boolean(origId) && origId in likeCounts)

    if (hasExplicit) {
      return Number(likeCounts[rawId] ?? likeCounts[altId] ?? (origId ? likeCounts[origId] : 0))
    }

    return Number(item.likes || 0) + (isUserLiked ? 1 : 0)
  }

  const getDownloads = (item) => {
    const rawId = item.id || ''
    const altId = rawId.startsWith('community-') ? rawId.replace('community-', '') : `community-${rawId}`
    const origId = item.communityMeta?.originalId

    const isInstalled = (installedIds instanceof Set ? (
      installedIds.has(rawId) ||
      installedIds.has(altId) ||
      (Boolean(origId) && installedIds.has(origId))
    ) : (Array.isArray(installedIds) ? (
      installedIds.includes(rawId) ||
      installedIds.includes(altId) ||
      (Boolean(origId) && installedIds.includes(origId))
    ) : false)) ? 1 : 0

    const hasExplicit =
      (rawId in downloadCounts) ||
      (altId in downloadCounts) ||
      (Boolean(origId) && origId in downloadCounts)

    if (hasExplicit) {
      return Number(downloadCounts[rawId] ?? downloadCounts[altId] ?? (origId ? downloadCounts[origId] : 0))
    }

    return Number(item.downloads || 0) + isInstalled
  }

  // Filter mode
  if (filterMode === 'featured') {
    results = results.filter(w => Boolean(w.featured || w.is_featured))
  } else if (filterMode === 'community') {
    results = results.filter(w => Boolean(w.isCommunitySubmission || w.id?.startsWith('comm-') || (w.author && w.author !== 'AetherFlow Core')))
  } else if (filterMode === 'popular') {
    results = results.filter(w => getDownloads(w) > 0 || getLikes(w) > 0 || Boolean(w.featured || w.is_featured))
  } else if (filterMode === 'liked') {
    results = results.filter(w => isItemLikedByUser(w) || getLikes(w) > 0)
  }

  // Category filter
  if (category && category !== 'all') {
    const catLower = category.toLowerCase().trim()
    const synonyms = CATEGORY_SYNONYMS[catLower] || [catLower]
    results = results.filter(w => {
      const inCat = w.category?.toLowerCase() === catLower
      const wTags = Array.isArray(w.tags) ? w.tags.map(t => t.toLowerCase()) : []
      const inTags = wTags.some(t => synonyms.some(syn => t === syn || t.includes(syn)))
      const nameLower = (w.name || '').toLowerCase()
      const descLower = (w.description || '').toLowerCase()
      const inText = synonyms.some(syn => nameLower.includes(syn) || descLower.includes(syn))
      return inCat || inTags || inText
    })
  }

  // Text search (title, description, author, category, tags, type, engine)
  if (query) {
    const q = query.toLowerCase().trim().replace(/^#/, '')
    results = results.filter(w => {
      const inName = w.name?.toLowerCase().includes(q)
      const inDesc = w.description?.toLowerCase().includes(q)
      const inAuthor = w.author?.toLowerCase().includes(q)
      const inCategory = w.category?.toLowerCase().includes(q)
      const inType = w.type?.toLowerCase().includes(q)
      const inEngine = w.engine?.toLowerCase().includes(q)
      const inTags = Array.isArray(w.tags) && w.tags.some(t => {
        const cleanTag = t.toLowerCase().replace(/^#/, '')
        return cleanTag.includes(q) || q.includes(cleanTag)
      })
      return Boolean(inName || inDesc || inAuthor || inCategory || inType || inEngine || inTags)
    })
  }

  // Tag filter
  if (tags.length > 0) {
    results = results.filter(w =>
      tags.some(tag => (w.tags || []).some(t => t.toLowerCase() === tag.toLowerCase()))
    )
  }

  // Type filter
  if (type) {
    results = results.filter(w => {
      if (type === 'engine') {
        return w.type === 'engine' || Boolean(w.engine) || w.source?.startsWith('engine:')
      }
      if (type === 'video') {
        return w.type === 'video' || /\.(mp4|webm|mkv|mov)$/i.test(w.source || '')
      }
      if (type === 'youtube') {
        return w.type === 'youtube' || w.source?.includes('youtube') || w.source?.includes('youtu.be')
      }
      if (type === 'stream') {
        return w.type === 'stream' || w.type === 'youtube' || Boolean(w.streamUrl || w.config?.streamUrl || w.source?.includes('youtube') || w.source?.includes('youtu.be'))
      }
      if (type === 'image') {
        return w.type === 'image' || /\.(png|jpg|jpeg|webp|bmp)$/i.test(w.source || '')
      }
      return w.type === type
    })
  }

  // Sorting
  results.sort((a, b) => {
    const likesA = getLikes(a)
    const likesB = getLikes(b)
    const dlA = getDownloads(a)
    const dlB = getDownloads(b)

    if (sortMode === 'likes') {
      // Prioritize items the user has explicitly liked
      const userLikedA = isItemLikedByUser(a) ? 1 : 0
      const userLikedB = isItemLikedByUser(b) ? 1 : 0
      if (userLikedB !== userLikedA) return userLikedB - userLikedA

      // 1. Highest likes count first
      if (likesB !== likesA) return likesB - likesA
      // 2. Highest downloads count
      if (dlB !== dlA) return dlB - dlA
      // 3. Featured items
      if (Boolean(b.featured) !== Boolean(a.featured)) return (b.featured ? 1 : 0) - (a.featured ? 1 : 0)
      // 4. Newest
      const timeA = a.createdAt ? new Date(a.createdAt).getTime() : 0
      const timeB = b.createdAt ? new Date(b.createdAt).getTime() : 0
      if (timeB !== timeA) return timeB - timeA
      return (a.name || '').localeCompare(b.name || '')
    }

    if (sortMode === 'popular') {
      // 1. Highest downloads count first
      if (dlB !== dlA) return dlB - dlA
      // 2. Highest likes count
      if (likesB !== likesA) return likesB - likesA
      // 3. Featured items as popular picks
      if (Boolean(b.featured) !== Boolean(a.featured)) return (b.featured ? 1 : 0) - (a.featured ? 1 : 0)
      // 4. Quality rank: procedural engines and 4K videos
      const rankA = a.type === 'engine' ? 3 : (a.type === 'video' ? 2 : 1)
      const rankB = b.type === 'engine' ? 3 : (b.type === 'video' ? 2 : 1)
      if (rankB !== rankA) return rankB - rankA
      // 5. Newest
      const timeA = a.createdAt ? new Date(a.createdAt).getTime() : 0
      const timeB = b.createdAt ? new Date(b.createdAt).getTime() : 0
      return timeB - timeA
    }

    if (sortMode === 'newest') {
      const timeA = a.createdAt ? new Date(a.createdAt).getTime() : 0
      const timeB = b.createdAt ? new Date(b.createdAt).getTime() : 0
      if (timeB !== timeA) return timeB - timeA
      return (b.featured ? 1 : 0) - (a.featured ? 1 : 0)
    }

    if (sortMode === 'name') {
      return (a.name || '').localeCompare(b.name || '')
    }

    return 0
  })

  return results
}

/**
 * Universal metrics resolver: returns effective likes and downloads counts
 * ensuring catalog cards, previews, and sorting reflect identical, authentic numbers.
 */
export function getWallpaperMetrics(item, likeCounts = {}, downloadCounts = {}, isLiked = false) {
  if (!item) return { likes: 0, downloads: 0 }
  const rawId = item.id || ''
  const altId = rawId.startsWith('community-') ? rawId.replace('community-', '') : `community-${rawId}`
  const origId = item.communityMeta?.originalId

  const hasExplicitLikes =
    (rawId in likeCounts) ||
    (altId in likeCounts) ||
    (Boolean(origId) && origId in likeCounts)

  let finalLikes = 0
  if (hasExplicitLikes) {
    finalLikes = Number(likeCounts[rawId] ?? likeCounts[altId] ?? (origId ? likeCounts[origId] : 0))
  } else {
    finalLikes = Number(item.likes || 0) + (isLiked ? 1 : 0)
  }

  const hasExplicitDownloads =
    (rawId in downloadCounts) ||
    (altId in downloadCounts) ||
    (Boolean(origId) && origId in downloadCounts)

  let finalDownloads = 0
  if (hasExplicitDownloads) {
    finalDownloads = Number(downloadCounts[rawId] ?? downloadCounts[altId] ?? (origId ? downloadCounts[origId] : 0))
  } else {
    finalDownloads = Number(item.downloads || 0)
  }

  return {
    likes: Math.max(0, finalLikes),
    downloads: Math.max(0, finalDownloads),
  }
}


// ── Install Tracking & Likes ──────────────────────────────────────────────────

export async function trackInstall(wallpaperId) {
  if (!isOnline()) return null
  try {
    const { data, error } = await supabase.rpc('track_install', { p_wallpaper_id: wallpaperId })
    if (error) throw error
    return typeof data === 'number' ? data : Number(data)
  } catch (err) {
    console.warn('[Community] Failed to track install:', err.message)
    return null
  }
}

export async function fetchCommunityCounts() {
  if (!isOnline()) return { downloadCounts: {}, likeCounts: {} }
  try {
    const [installsRes, likesRes] = await Promise.all([
      supabase.from('installs').select('wallpaper_id'),
      supabase.from('likes').select('wallpaper_id'),
    ])

    const downloadCounts = {}
    for (const row of installsRes.data || []) {
      if (row.wallpaper_id) {
        downloadCounts[row.wallpaper_id] = (downloadCounts[row.wallpaper_id] || 0) + 1
      }
    }

    const likeCounts = {}
    for (const row of likesRes.data || []) {
      if (row.wallpaper_id) {
        likeCounts[row.wallpaper_id] = (likeCounts[row.wallpaper_id] || 0) + 1
      }
    }

    return { downloadCounts, likeCounts }
  } catch (err) {
    console.warn('[Community] Failed to fetch aggregate counts:', err.message)
    return { downloadCounts: {}, likeCounts: {} }
  }
}

export const fetchMarketplaceCounts = fetchCommunityCounts

export async function toggleLike(wallpaperId) {
  if (!isOnline()) return null
  try {
    const { data, error } = await supabase.rpc('toggle_like', { p_wallpaper_id: wallpaperId })
    if (error) throw error
    return data
  } catch (err) {
    console.warn('[Community] Failed to toggle like:', err.message)
    return null
  }
}

export async function getUserLikes() {
  if (!isOnline()) return []
  try {
    const { data, error } = await supabase.rpc('get_user_likes')
    if (error) throw error
    return data || []
  } catch (err) {
    console.warn('[Community] Failed to fetch likes:', err.message)
    return []
  }
}

// ── Submissions & Media Uploads ─────────────────────────────────────────────

export const COMMUNITY_MEDIA_LIMITS = {
  MAX_VIDEO_SIZE: 150 * 1024 * 1024, // 150 MB (Hosted on GitHub Releases CDN)
  MAX_IMAGE_SIZE: 50 * 1024 * 1024,  // 50 MB (Hosted on GitHub Releases CDN)
  ALLOWED_VIDEO_EXTS: ['mp4', 'webm'],
  ALLOWED_IMAGE_EXTS: ['png', 'jpg', 'jpeg', 'webp'],
}

export const LICENSE_OPTIONS = [
  { id: 'CC BY-NC-ND 4.0', label: 'CC BY-NC-ND 4.0 (Recommended for Artists)', badge: 'CC BY-NC-ND', desc: 'Free personal use. Attribution required. Non-commercial, no derivatives.' },
  { id: 'CC BY-NC-SA 4.0', label: 'CC BY-NC-SA 4.0 (Non-Commercial, ShareAlike)', badge: 'CC BY-NC-SA', desc: 'Free personal use. Attribution required. Adaptations must share alike.' },
  { id: 'CC BY 4.0', label: 'CC BY 4.0 (Attribution Only)', badge: 'CC BY', desc: 'Free use with creator attribution.' },
  { id: 'CC0 1.0', label: 'CC0 1.0 (Public Domain)', badge: 'CC0', desc: 'Completely free for any use without restriction.' },
  { id: 'Custom / Permissive', label: 'Custom / Featured with Permission', badge: 'Permissive', desc: 'Featured with explicit creator permission.' },
]

/**
 * Inspect a local media file (video or image).
 * Extracts resolution dimensions, duration, format, audio track presence,
 * and automatically captures a 640x360 JPEG thumbnail at 0.5s via Canvas.
 */
/**
 * Inspect a local media file (video or image).
 * Accepts either a File object, a native filesystem path string, or { path, name, size }.
 * Extracts resolution dimensions, duration, format, audio track presence,
 * and automatically captures a 640x360 JPEG thumbnail at 0.5s via Canvas.
 */
export async function inspectMediaFile(input) {
  if (!input) throw new Error('No media file provided')

  let rawPath = null
  let fileName = ''
  let fileSize = 0
  let mediaUrl = ''
  let isBlobUrl = false

  if (typeof input === 'string') {
    rawPath = input
    fileName = input.split(/[/\\]/).pop() || 'media'
    mediaUrl = safeConvertFileSrc(input)
  } else if (input instanceof File) {
    fileName = input.name
    fileSize = input.size
    rawPath = input.path || null
    mediaUrl = URL.createObjectURL(input)
    isBlobUrl = true
  } else if (input && typeof input === 'object') {
    rawPath = input.path || null
    fileName = input.name || (rawPath ? rawPath.split(/[/\\]/).pop() : 'media')
    fileSize = input.size || input.sizeBytes || 0
    mediaUrl = input.url || (rawPath ? safeConvertFileSrc(rawPath) : '')
  }

  // If size is 0 and we have a path in Tauri, query file metadata directly
  if (!fileSize && rawPath && isTauri()) {
    try {
      const meta = await tauriInvoke('get_file_metadata', { path: rawPath })
      if (meta?.size_bytes) fileSize = meta.size_bytes
    } catch {}
  }

  const ext = fileName.split('.').pop()?.toLowerCase() || ''
  const isVideo = COMMUNITY_MEDIA_LIMITS.ALLOWED_VIDEO_EXTS.includes(ext)
  const isImage = COMMUNITY_MEDIA_LIMITS.ALLOWED_IMAGE_EXTS.includes(ext)

  if (!isVideo && !isImage) {
    if (isBlobUrl) URL.revokeObjectURL(mediaUrl)
    throw new Error('Unsupported format. Please choose an MP4, WebM, PNG, JPG, or WebP file.')
  }

  if (isVideo && fileSize > COMMUNITY_MEDIA_LIMITS.MAX_VIDEO_SIZE) {
    if (isBlobUrl) URL.revokeObjectURL(mediaUrl)
    const mb = (fileSize / (1024 * 1024)).toFixed(1)
    throw new Error(`Video file is ${mb} MB, which exceeds the 150 MB community limit. Please trim or compress your loop.`)
  }

  if (isImage && fileSize > COMMUNITY_MEDIA_LIMITS.MAX_IMAGE_SIZE) {
    if (isBlobUrl) URL.revokeObjectURL(mediaUrl)
    const mb = (fileSize / (1024 * 1024)).toFixed(1)
    throw new Error(`Image file is ${mb} MB, which exceeds the 50 MB community limit.`)
  }

  if (isVideo) {
    return new Promise((resolve, reject) => {
      const video = document.createElement('video')
      video.preload = 'metadata'
      video.muted = true
      video.playsInline = true
      video.crossOrigin = 'anonymous'
      video.src = mediaUrl

      const timeout = setTimeout(() => {
        if (isBlobUrl) URL.revokeObjectURL(mediaUrl)
        reject(new Error('Timed out reading video stream metadata.'))
      }, 15000)

      video.onloadedmetadata = () => {
        const duration = video.duration || 0
        const width = video.videoWidth || 1920
        const height = video.videoHeight || 1080
        const seekTime = Math.min(0.5, duration > 0 ? duration / 2 : 0)

        // Detect if video contains audio
        let hasAudio = false
        if (typeof video.mozHasAudio !== 'undefined') {
          hasAudio = Boolean(video.mozHasAudio)
        } else if (typeof video.webkitAudioDecodedByteCount !== 'undefined') {
          hasAudio = video.webkitAudioDecodedByteCount > 0
        } else if (video.audioTracks && video.audioTracks.length > 0) {
          hasAudio = true
        } else {
          hasAudio = true
        }

        video.currentTime = seekTime
        video.onseeked = () => {
          clearTimeout(timeout)
          try {
            const canvas = document.createElement('canvas')
            const maxW = 640
            const maxH = 360
            const scale = Math.min(maxW / width, maxH / height, 1)
            canvas.width = Math.round(width * scale)
            canvas.height = Math.round(height * scale)
            const ctx = canvas.getContext('2d')
            ctx.drawImage(video, 0, 0, canvas.width, canvas.height)

            canvas.toBlob((blob) => {
              const previewDataUrl = canvas.toDataURL('image/jpeg', 0.85)
              if (isBlobUrl) URL.revokeObjectURL(mediaUrl)
              resolve({
                type: 'video',
                name: fileName,
                format: ext,
                filePath: rawPath,
                fileSize,
                dimensions: `${width}x${height}`,
                width,
                height,
                duration: Math.round(duration),
                hasAudio,
                thumbnailBlob: blob,
                previewDataUrl,
              })
            }, 'image/jpeg', 0.85)
          } catch (e) {
            if (isBlobUrl) URL.revokeObjectURL(mediaUrl)
            reject(e)
          }
        }
      }

      video.onerror = () => {
        clearTimeout(timeout)
        if (isBlobUrl) URL.revokeObjectURL(mediaUrl)
        reject(new Error('Failed to read or decode video file. Ensure it is a valid MP4 or WebM video.'))
      }
    })
  }

  // Picture inspection
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.src = mediaUrl

    img.onload = () => {
      const width = img.naturalWidth || 1920
      const height = img.naturalHeight || 1080
      const canvas = document.createElement('canvas')
      const maxW = 640
      const maxH = 360
      const scale = Math.min(maxW / width, maxH / height, 1)
      canvas.width = Math.round(width * scale)
      canvas.height = Math.round(height * scale)
      const ctx = canvas.getContext('2d')
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height)

      canvas.toBlob((blob) => {
        const previewDataUrl = canvas.toDataURL('image/jpeg', 0.85)
        if (isBlobUrl) URL.revokeObjectURL(mediaUrl)
        resolve({
          type: 'image',
          name: fileName,
          format: ext,
          filePath: rawPath,
          fileSize,
          dimensions: `${width}x${height}`,
          width,
          height,
          duration: 0,
          hasAudio: false,
          thumbnailBlob: blob,
          previewDataUrl,
        })
      }, 'image/jpeg', 0.85)
    }

    img.onerror = () => {
      if (isBlobUrl) URL.revokeObjectURL(mediaUrl)
      reject(new Error('Failed to load image. Ensure it is a valid PNG, JPG, or WebP picture.'))
    }
  })
}

export const GITHUB_COMMUNITY_REPO = env.VITE_GITHUB_REPO || 'yashpreeto7/aetherflow-community'
export const GITHUB_RELEASE_TAG = env.VITE_GITHUB_RELEASE_TAG || 'wallpapers-v1'

/**
 * Upload a media binary file directly to GitHub Releases on yashpreeto7/aetherflow-community.
 * 
 * In Desktop (Tauri): Executes via native Rust command, bypassing all browser CORS / header restrictions.
 * In Web Browser: Uses local dev proxy /gh-uploads or direct XHR.
 * 
 * 100% bypasses Supabase Storage — ZERO bytes stored in Supabase!
 * Files are hosted globally on GitHub's Fastly/Azure CDN (objects.githubusercontent.com)
 * with support for up to 2 GB per asset and range requests.
 */
export async function uploadToGitHubRelease({
  file,
  filePath,
  token,
  repo = GITHUB_COMMUNITY_REPO,
  tag = GITHUB_RELEASE_TAG,
  onProgress,
}) {
  if (!file && !filePath) throw new Error('No media file provided.')

  const ghToken = token || env.VITE_GITHUB_TOKEN || localStorage.getItem('aetherflow_github_token')
  if (!ghToken) {
    throw new Error(
      'A GitHub Personal Access Token (PAT) is required to publish media directly to GitHub Releases. ' +
      'Please ensure VITE_GITHUB_TOKEN is configured in .env or set in settings.'
    )
  }

  // 1. Prepare safe filename
  const rawName = file?.name || filePath?.split(/[/\\]/).pop() || 'wallpaper.mp4'
  const ext = rawName.split('.').pop()?.toLowerCase() || 'mp4'
  const cleanBase = rawName.replace(/\.[^/.]+$/, '').replace(/[^a-zA-Z0-9_-]/g, '_').substring(0, 36)
  const timestamp = Date.now()
  const randomSuffix = Math.random().toString(36).substring(2, 7)
  const assetName = `${timestamp}_${cleanBase}_${randomSuffix}.${ext}`
  const contentType = (file?.type) || (ext === 'mp4' ? 'video/mp4' : ext === 'webm' ? 'video/webm' : ext === 'png' ? 'image/png' : ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg' : 'application/octet-stream')

  const resolvedPath = filePath || file?.path || null

  // 2. Native Tauri Desktop Flow (100% CORS-free via Rust backend)
  if (isTauri()) {
    try {
      if (typeof onProgress === 'function') onProgress({ stage: 'uploading_github', progress: 15 })

      let fileBytes = null
      if (!resolvedPath && file) {
        const buf = await file.arrayBuffer()
        fileBytes = Array.from(new Uint8Array(buf))
      }

      if (typeof onProgress === 'function') onProgress({ stage: 'uploading_github', progress: 40 })

      const res = await tauriInvoke('upload_release_asset', {
        token: ghToken,
        repo,
        tag,
        filePath: resolvedPath,
        fileBytes,
        assetName,
        contentType,
      })

      if (typeof onProgress === 'function') onProgress({ stage: 'uploading_github', progress: 100 })

      if (res && res.downloadUrl) {
        return res
      }
      throw new Error('Native GitHub release asset upload returned incomplete response')
    } catch (rustErr) {
      console.error('[Community] Tauri native upload error:', rustErr)
      throw new Error(rustErr?.message || String(rustErr) || 'Native GitHub release asset upload failed.')
    }
  }

  // 3. Web Browser Dev Mode Flow (uses Vite dev proxy to bypass CORS)
  const [owner, repoName] = repo.split('/')
  const isLocalDev = typeof window !== 'undefined' && (window.location?.hostname === 'localhost' || window.location?.hostname === '127.0.0.1')
  const apiBase = isLocalDev ? '/gh-api' : 'https://api.github.com'
  const uploadBase = isLocalDev ? '/gh-uploads' : 'https://uploads.github.com'

  const releaseRes = await fetch(`${apiBase}/repos/${owner}/${repoName}/releases/tags/${tag}`, {
    headers: {
      Authorization: `token ${ghToken}`,
      Accept: 'application/vnd.github.v3+json',
    },
  })

  if (!releaseRes.ok) {
    throw new Error(`Failed to locate GitHub Release "${tag}" on ${repo} (${releaseRes.status}).`)
  }

  const releaseData = await releaseRes.json()
  const releaseId = releaseData.id

  const uploadUrl = `${uploadBase}/repos/${owner}/${repoName}/releases/${releaseId}/assets?name=${encodeURIComponent(assetName)}`

  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open('POST', uploadUrl, true)
    xhr.setRequestHeader('Authorization', `token ${ghToken}`)
    xhr.setRequestHeader('Content-Type', contentType)
    xhr.setRequestHeader('Accept', 'application/vnd.github.v3+json')
    // Note: User-Agent header is omitted in browser XHR to prevent restricted header errors

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && typeof onProgress === 'function') {
        const percent = Math.round((e.loaded / e.total) * 100)
        onProgress({ stage: 'uploading_github', progress: percent, loaded: e.loaded, total: e.total })
      }
    }

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          const resp = JSON.parse(xhr.responseText)
          const downloadUrl = resp.browser_download_url || `https://github.com/${owner}/${repoName}/releases/download/${tag}/${assetName}`
          resolve({
            assetName,
            downloadUrl,
            size: resp.size || file?.size || 0,
            releaseId,
            assetId: resp.id,
          })
        } catch {
          resolve({
            assetName,
            downloadUrl: `https://github.com/${owner}/${repoName}/releases/download/${tag}/${assetName}`,
            size: file?.size || 0,
            releaseId,
          })
        }
      } else {
        let errMsg = `GitHub upload failed with HTTP ${xhr.status}`
        try {
          const errObj = JSON.parse(xhr.responseText)
          if (errObj.message) errMsg = `GitHub: ${errObj.message}`
        } catch {}
        reject(new Error(errMsg))
      }
    }

    xhr.onerror = () => reject(new Error('Network error while uploading asset to GitHub Releases. Please check your internet connection.'))
    xhr.ontimeout = () => reject(new Error('Upload to GitHub Releases timed out.'))
    xhr.timeout = 15 * 60 * 1000

    xhr.send(file)
  })
}

/**
 * Delete an asset from GitHub Releases
 */
export async function deleteGitHubReleaseAsset({ assetName, assetUrl, token }) {
  const ghToken = token || env.VITE_GITHUB_TOKEN || localStorage.getItem('aetherflow_github_token')
  if (!ghToken) return false

  const [owner, repoName] = GITHUB_COMMUNITY_REPO.split('/')
  try {
    const isLocalDev = typeof window !== 'undefined' && (window.location?.hostname === 'localhost' || window.location?.hostname === '127.0.0.1')
    const apiBase = isLocalDev ? '/gh-api' : 'https://api.github.com'

    const releaseRes = await fetch(`${apiBase}/repos/${owner}/${repoName}/releases/tags/${GITHUB_RELEASE_TAG}`, {
      headers: {
        Authorization: `token ${ghToken}`,
        Accept: 'application/vnd.github.v3+json',
      },
    })
    if (!releaseRes.ok) return false
    const releaseData = await releaseRes.json()
    const targetName = assetName || (assetUrl ? assetUrl.split('/').pop() : null)
    if (!targetName) return false

    const asset = releaseData.assets?.find(a => a.name === targetName)
    if (!asset) return false

    if (isTauri()) {
      try {
        const ok = await tauriInvoke('delete_release_asset', {
          token: ghToken,
          repo: GITHUB_COMMUNITY_REPO,
          assetId: asset.id,
        })
        if (typeof ok === 'boolean') return ok
      } catch {}
    }

    const delRes = await fetch(`${apiBase}/repos/${owner}/${repoName}/releases/assets/${asset.id}`, {
      method: 'DELETE',
      headers: {
        Authorization: `token ${ghToken}`,
      },
    })
    return delRes.ok
  } catch (err) {
    console.warn('[Community] Failed to delete asset from GitHub Releases:', err.message)
    return false
  }
}

// Backward-compat export (no-op as we store 0 bytes in Supabase Storage)
export async function deleteStagingMedia(paths = []) {
  return Promise.resolve()
}

/**
 * Submit a wallpaper for community review.
 * Supports both URL streams and native uploaded video/image files.
 * Requires an authenticated user.
 */
export async function submitWallpaper({
  title,
  description,
  tags,
  type,
  source,
  authorName,
  authorPortfolio,
  license = 'CC BY-NC-ND 4.0',
  previewUrl,
  mediaFile,
  mediaFilePath,
  thumbnailBlob,
  mediaMetadata = {},
  onProgress,
}) {
  if (!isOnline()) throw new Error('You must be online to submit wallpapers')

  const { data: authData } = await supabase.auth.getUser()
  const user = authData?.user
  if (!user) throw new Error('You must be signed in to submit wallpapers')

  let finalSource = (source || '').trim()
  let finalPreview = previewUrl || ''
  let stagingPath = null
  let stagingThumbPath = null
  let fileSize = mediaMetadata.fileSize || mediaFile?.size || 0
  let mediaFormat = mediaMetadata.format || (mediaFile?.name ? mediaFile.name.split('.').pop()?.toLowerCase() : '') || ''
  let hasAudio = Boolean(mediaMetadata.hasAudio)
  let duration = mediaMetadata.duration || 0
  let dimensions = mediaMetadata.dimensions || ''

  // If a local media file or path was provided, upload directly to GitHub Releases (ZERO bytes in Supabase Storage!)
  if (mediaFile || mediaFilePath || mediaMetadata.filePath) {
    if (typeof onProgress === 'function') onProgress({ stage: 'uploading_github', progress: 5 })
    const uploaded = await uploadToGitHubRelease({
      file: mediaFile,
      filePath: mediaFilePath || mediaMetadata.filePath || mediaFile?.path || null,
      onProgress,
    })
    finalSource = uploaded.downloadUrl
    fileSize = uploaded.size || fileSize
    mediaFormat = mediaMetadata.format || uploaded.assetName.split('.').pop()?.toLowerCase() || ''

    if (thumbnailBlob) {
      try {
        if (typeof onProgress === 'function') onProgress({ stage: 'uploading_thumb', progress: 92 })
        const thumbName = `${uploaded.assetName.replace(/\.[^/.]+$/, '')}_thumb.jpg`
        const thumbFile = new File([thumbnailBlob], thumbName, { type: 'image/jpeg' })
        const uploadedThumb = await uploadToGitHubRelease({
          file: thumbFile,
        })
        finalPreview = uploadedThumb.downloadUrl
      } catch (thumbErr) {
        console.warn('[Community] Could not upload thumb to GitHub Releases, using dataUrl fallback:', thumbErr.message)
        finalPreview = mediaMetadata.previewDataUrl || ''
      }
    } else {
      finalPreview = mediaMetadata.previewDataUrl || ''
    }
  } else {
    // External link fallback (e.g. YouTube stream, web stream, or direct GitHub Release asset URL)
    if (!finalPreview && type === 'youtube') {
      const ytid = parseYouTubeId(finalSource)
      if (ytid) finalPreview = `https://img.youtube.com/vi/${ytid}/hqdefault.jpg`
    } else if (!finalPreview && type === 'image') {
      finalPreview = finalSource
    }
  }

  const generatedId = 'sub_' + Math.random().toString(36).substring(2, 11)

  const cleanPortfolio = (authorPortfolio || '').trim()
  const cleanLicense = (license || 'CC BY-NC-ND 4.0').trim()

  const submissionPayload = {
    id: generatedId,
    title: title.trim(),
    description: (description || '').trim(),
    type,
    source: finalSource,
    preview: finalPreview,
    tags: tags || [],
    author: authorName || user.user_metadata?.full_name || user.email?.split('@')[0] || 'Community Contributor',
    author_portfolio: cleanPortfolio,
    authorPortfolio: cleanPortfolio,
    license: cleanLicense,
    status: 'pending',
    created_at: new Date().toISOString(),
    file_size: fileSize,
    fileSize: fileSize,
    media_format: mediaFormat,
    mediaFormat: mediaFormat,
    has_audio: hasAudio,
    duration,
    dimensions,
    staging_path: null,
    staging_thumb_path: null,
    github_asset_url: finalSource,
  }

  try {
    const { data, error } = await supabase
      .from('submissions')
      .insert({
        author_id: user.id,
        author_name: submissionPayload.author,
        author_portfolio: cleanPortfolio,
        license: cleanLicense,
        title: submissionPayload.title,
        description: submissionPayload.description,
        type: submissionPayload.type,
        source: submissionPayload.source,
        preview_url: finalPreview,
        tags: submissionPayload.tags,
        status: 'pending',
        file_size: fileSize,
        media_format: mediaFormat,
        has_audio: hasAudio,
        duration,
        dimensions,
        staging_path: null,
        staging_thumb_path: null,
        github_asset_url: finalSource,
      })
      .select()
      .single()

    if (!error && data) {
      submissionPayload.id = data.id
    }
  } catch (err) {
    console.warn('[Community] Supabase insert failed, saving locally:', err.message)
  }

  // Save locally so the author sees it in their "My Submissions"
  const localList = getLocalSubmissions()
  localList.unshift(submissionPayload)
  saveLocalSubmissions(localList)

  return submissionPayload
}

/**
 * Get the current user's submissions.
 * Requires authentication — returns only the signed-in user's submissions.
 */
export async function getUserSubmissions() {
  if (!isOnline()) return []

  const { data: authData } = await supabase.auth.getUser()
  const user = authData?.user
  if (!user) return []

  const approvedMap = getLocalApprovedMap()
  const rejectedSet = getLocalRejectedOverrides()
  const takedowns = getLocalTakedowns()

  let merged = []

  try {
    const { data, error } = await supabase
      .from('submissions')
      .select('*')
      .eq('author_id', user.id)
      .order('created_at', { ascending: false })

    if (!error && data) {
      merged = data.map(row => ({
        id: row.id,
        title: row.title,
        description: row.description,
        type: row.type,
        source: row.source,
        preview: row.preview_url || row.preview || '',
        tags: row.tags || [],
        author: row.author_name || 'You',
        status: row.status || 'pending',
        created_at: row.created_at,
        rejection_reason: row.rejection_reason,
        hasAudio: Boolean(row.has_audio),
        fileSize: row.file_size || 0,
        mediaFormat: row.media_format || '',
        duration: row.duration || 0,
        dimensions: row.dimensions || '',
        stagingPath: row.staging_path || '',
        stagingThumbPath: row.staging_thumb_path || '',
      }))
    }
  } catch (err) {
    console.warn('[Community] Failed to fetch submissions from Supabase:', err.message)
  }

  // Also include local submissions that match this session (e.g. just submitted)
  const localList = getLocalSubmissions()
  const serverIds = new Set(merged.map(s => s.id))
  const localMatches = localList.filter(l => !serverIds.has(l.id))
  merged = [...merged, ...localMatches]

  return merged
    .map(s => {
      if (approvedMap[s.id]) return { ...s, status: 'approved' }
      if (rejectedSet.has(s.id)) return { ...s, status: 'rejected' }
      return s
    })
    .filter(s => s.status !== 'removed' && !takedowns.has(s.id))
}

/**
 * Allow a creator to withdraw / delete their own submission.
 * Automatically cleans up staging assets from Supabase Storage.
 */
export async function deleteUserSubmission(submissionId) {
  // 1. Locate submission to get staging paths
  const localList = getLocalSubmissions()
  const target = localList.find(s => s.id === submissionId)
  saveLocalSubmissions(localList.filter(s => s.id !== submissionId))

  // 2. Remove from approved map and add to takedowns so it disappears from community feed
  removeLocalApprovedOverride(submissionId)
  addLocalTakedown(submissionId)

  // 3. Delete from GitHub Releases if asset was uploaded there
  const assetUrl = target?.github_asset_url || target?.source || ''
  if (assetUrl && assetUrl.includes('github.com') && assetUrl.includes('/releases/download/')) {
    await deleteGitHubReleaseAsset({ assetUrl })
  }

  // 4. Delete from Supabase if online
  if (isOnline()) {
    try {
      const { data: subData } = await supabase
        .from('submissions')
        .select('github_asset_url, source')
        .eq('id', submissionId)
        .single()

      const remoteAssetUrl = subData?.github_asset_url || subData?.source
      if (remoteAssetUrl?.includes('/releases/download/')) {
        await deleteGitHubReleaseAsset({ assetUrl: remoteAssetUrl })
      }

      const { error } = await supabase
        .from('submissions')
        .delete()
        .eq('id', submissionId)

      if (error) {
        await supabase
          .from('submissions')
          .update({ status: 'removed', rejection_reason: 'Withdrawn by creator' })
          .eq('id', submissionId)
      }
    } catch (e) {
      console.warn('[Community] Supabase delete submission error:', e)
    }
  }

  clearCatalogCache()
  return { success: true }
}

// ── Admin Moderation APIs ─────────────────────────────────────────────────────

/**
 * Fetches all wallpapers awaiting review.
 * Only accessible to admins.
 */
export async function fetchPendingSubmissions() {
  await requireAdmin()
  const approvedMap = getLocalApprovedMap()
  const rejectedSet = getLocalRejectedOverrides()
  const takedowns = getLocalTakedowns()

  const isExcluded = (id) => Boolean(approvedMap[id] || rejectedSet.has(id) || takedowns.has(id))

  const localSubs = getLocalSubmissions().filter(s => s.status === 'pending' && !isExcluded(s.id))

  if (!isOnline()) return localSubs

  try {
    const { data, error } = await supabase
      .from('submissions')
      .select('*')
      .eq('status', 'pending')
      .order('created_at', { ascending: false })

    if (error) {
      console.warn('[Community] Supabase pending query error:', error.message)
      return localSubs
    }

    const serverSubs = (data || [])
      .filter(row => !isExcluded(row.id))
      .map(row => {
        let preview = row.preview_url || row.preview || ''
        if (!preview && row.type === 'youtube') {
          const ytid = parseYouTubeId(row.source)
          if (ytid) preview = `https://img.youtube.com/vi/${ytid}/hqdefault.jpg`
        } else if (!preview && row.type === 'image') {
          preview = row.source
        }

        return {
          id: row.id,
          title: row.title,
          description: row.description,
          type: row.type,
          source: row.source,
          preview,
          tags: row.tags || [],
          author: row.author_name || 'Community Member',
          status: 'pending',
          created_at: row.created_at,
          hasAudio: Boolean(row.has_audio),
          fileSize: row.file_size || 0,
          mediaFormat: row.media_format || '',
          duration: row.duration || 0,
          dimensions: row.dimensions || '',
          stagingPath: row.staging_path || '',
          stagingThumbPath: row.staging_thumb_path || '',
        }
      })

    const serverIds = new Set(serverSubs.map(s => s.id))
    return [...serverSubs, ...localSubs.filter(l => !serverIds.has(l.id))]
  } catch (err) {
    console.warn('[Community] Failed to fetch pending submissions:', err.message)
    return localSubs
  }
}

/**
 * Approve a pending submission.
 * Immediately marks status = 'approved' and clears cache so it becomes visible to all users.
 */
export async function approveSubmission(submissionId, submissionObj = null) {
  await requireAdmin()
  // 1. Store in local approved overrides map with full metadata
  const existingMap = getLocalApprovedMap()
  const localList = getLocalSubmissions()
  const localItem = localList.find(s => s.id === submissionId)
  const meta = submissionObj || localItem || {}

  let preview = meta.preview || meta.preview_url || meta.source || ''
  if (!preview && meta.type === 'youtube') {
    const ytid = parseYouTubeId(meta.source)
    if (ytid) preview = `https://img.youtube.com/vi/${ytid}/hqdefault.jpg`
  }

  existingMap[submissionId] = {
    id: submissionId,
    name: meta.title || meta.name || 'Community Wallpaper',
    description: meta.description || '',
    author: meta.author || meta.author_name || 'Community Creator',
    authorPortfolio: meta.authorPortfolio || meta.author_portfolio || '',
    license: meta.license || 'CC BY-NC-ND 4.0',
    type: meta.type || 'youtube',
    source: meta.githubAssetUrl || meta.source || '',
    preview,
    tags: Array.isArray(meta.tags) ? meta.tags : ['community'],
    status: 'approved',
    reviewed_at: new Date().toISOString(),
    isCommunitySubmission: true,
    hasAudio: Boolean(meta.hasAudio || meta.has_audio),
    fileSize: meta.fileSize || meta.file_size || 0,
    mediaFormat: meta.mediaFormat || meta.media_format || '',
    duration: meta.duration || 0,
    dimensions: meta.dimensions || '',
    githubAssetUrl: meta.githubAssetUrl || meta.github_asset_url || '',
  }
  saveLocalApprovedMap(existingMap)

  // 2. Remove from rejected & takedowns
  removeLocalRejectedOverride(submissionId)
  removeLocalTakedown(submissionId)

  // 3. Update local storage submissions if present
  const localIndex = localList.findIndex(s => s.id === submissionId)
  if (localIndex !== -1) {
    localList[localIndex].status = 'approved'
    localList[localIndex].reviewed_at = new Date().toISOString()
    saveLocalSubmissions(localList)
  }

  // 4. Update Supabase
  if (isOnline()) {
    try {
      let { error } = await supabase
        .from('submissions')
        .update({
          status: 'approved',
          reviewed_at: new Date().toISOString(),
        })
        .eq('id', submissionId)

      if (error && error.message?.includes('column')) {
        const fallback = await supabase
          .from('submissions')
          .update({ status: 'approved' })
          .eq('id', submissionId)
        error = fallback.error
      }

      if (error) console.warn('[Community] Supabase approve error:', error.message)
    } catch (e) {
      console.warn('[Community] Supabase approve error:', e)
    }
  }

  // Clear cache so it appears immediately in the Browse feed
  clearCatalogCache()
  return { success: true }
}

/**
 * Reject a pending submission with an optional reason.
 */
export async function rejectSubmission(submissionId, reason = '') {
  await requireAdmin()
  // 1. Store in rejected overrides map
  addLocalRejectedOverride(submissionId)
  removeLocalApprovedOverride(submissionId)

  // 2. Update local storage if present
  const localList = getLocalSubmissions()
  const localIndex = localList.findIndex(s => s.id === submissionId)
  if (localIndex !== -1) {
    localList[localIndex].status = 'rejected'
    localList[localIndex].rejection_reason = reason
    localList[localIndex].reviewed_at = new Date().toISOString()
    saveLocalSubmissions(localList)
  }

  // 3. Delete GitHub Release asset if present
  if (isOnline()) {
    try {
      const { data: subData } = await supabase
        .from('submissions')
        .select('github_asset_url, source')
        .eq('id', submissionId)
        .single()

      const remoteAssetUrl = subData?.github_asset_url || subData?.source
      if (remoteAssetUrl?.includes('/releases/download/')) {
        await deleteGitHubReleaseAsset({ assetUrl: remoteAssetUrl })
      }

      let { error } = await supabase
        .from('submissions')
        .update({
          status: 'rejected',
          rejection_reason: reason || 'Does not meet guidelines',
          reviewed_at: new Date().toISOString(),
        })
        .eq('id', submissionId)

      if (error && error.message?.includes('column')) {
        const fallback = await supabase
          .from('submissions')
          .update({ status: 'rejected' })
          .eq('id', submissionId)
        error = fallback.error
      }

      if (error) console.warn('[Community] Supabase reject error:', error.message)
    } catch (e) {
      console.warn('[Community] Supabase reject error:', e)
    }
  }

  clearCatalogCache()
  return { success: true }
}

/**
 * Remove/Takedown a published wallpaper.
 * Works for both community submissions and GitHub catalog items.
 * Marks status as 'removed' and adds to local takedown filter.
 */
export async function removeCommunityWallpaper(wallpaperId, reason = 'Removed by admin') {
  await requireAdmin()
  // 1. Immediately record in local takedown filter
  addLocalTakedown(wallpaperId)

  // 2. Update local submissions if present
  const localList = getLocalSubmissions()
  const localIndex = localList.findIndex(s => s.id === wallpaperId)
  if (localIndex !== -1) {
    localList[localIndex].status = 'removed'
    localList[localIndex].rejection_reason = reason
    saveLocalSubmissions(localList)
  }

  // 3. Update Supabase if online
  if (isOnline()) {
    try {
      // If it's in the submissions table, mark status = 'removed'
      await supabase
        .from('submissions')
        .update({
          status: 'removed',
          rejection_reason: reason,
        })
        .eq('id', wallpaperId)

      // Try inserting into takedowns table (if table exists)
      await supabase
        .from('takedowns')
        .insert({
          wallpaper_id: wallpaperId,
          reason,
          removed_at: new Date().toISOString(),
        })
        .select()
    } catch (e) {
      // Harmless if takedowns table doesn't exist yet
    }
  }

  clearCatalogCache()
  return { success: true }
}

/**
 * Toggle featured / staff pick status for a wallpaper.
 */
export async function toggleFeaturedWallpaper(wallpaperId, currentFeatured = false) {
  await requireAdmin()
  const nextFeatured = !currentFeatured

  // Save to local overrides
  setLocalFeaturedOverride(wallpaperId, nextFeatured)

  // Update Supabase if online
  if (isOnline()) {
    try {
      await supabase
        .from('submissions')
        .update({ is_featured: nextFeatured })
        .eq('id', wallpaperId)
    } catch (e) {
      console.warn('[Community] Supabase toggle feature error:', e)
    }
  }

  clearCatalogCache()
  return { success: true, featured: nextFeatured }
}

// ── In-App Moderator & Team Management ────────────────────────────────────────

/**
 * Fetches the list of all approved community admins & moderators from Supabase.
 * Returns an array of admin objects: [{ id, email, role, added_by, created_at }]
 */
export async function fetchCommunityAdmins(forceRefresh = false) {
  const now = Date.now()
  if (!forceRefresh && dynamicAdminsCache && (now - dynamicAdminsFetchTime) < DYNAMIC_ADMINS_TTL) {
    return dynamicAdminsCache
  }

  const defaultList = [
    {
      id: 'root-owner',
      email: ROOT_OWNER_EMAIL,
      role: 'owner',
      added_by: 'system',
      created_at: new Date().toISOString(),
    }
  ]

  if (!isOnline()) {
    dynamicAdminsCache = defaultList
    dynamicAdminsFetchTime = now
    return defaultList
  }

  try {
    const { data, error } = await supabase
      .from('community_admins')
      .select('*')
      .order('created_at', { ascending: true })

    if (error) {
      console.warn('[Community] community_admins query error:', error.message)
      dynamicAdminsCache = defaultList
      return defaultList
    }

    // Ensure root owner is always present in list
    const hasOwner = (data || []).some(a => a.email?.toLowerCase() === ROOT_OWNER_EMAIL.toLowerCase())
    const list = hasOwner ? data : [...defaultList, ...(data || [])]

    dynamicAdminsCache = list
    dynamicAdminsFetchTime = now
    return list
  } catch (err) {
    console.warn('[Community] Failed to fetch community_admins:', err)
    dynamicAdminsCache = defaultList
    return defaultList
  }
}

/**
 * Grants moderator rights to an email address.
 * Caller must already be an admin.
 */
export async function addCommunityAdmin(email) {
  await requireAdmin()
  const cleanEmail = (email || '').toLowerCase().trim()

  if (!cleanEmail || !cleanEmail.includes('@') || !cleanEmail.includes('.')) {
    throw new Error('Please provide a valid email address.')
  }

  if (cleanEmail === ROOT_OWNER_EMAIL.toLowerCase()) {
    throw new Error(`${cleanEmail} is already the permanent primary owner.`)
  }

  if (!isOnline()) {
    throw new Error('Cannot add moderator while offline. Database connection required.')
  }

  let addedBy = 'admin'
  try {
    const { data } = await supabase.auth.getUser()
    if (data?.user?.email) addedBy = data.user.email
  } catch {}

  const { error } = await supabase
    .from('community_admins')
    .insert({
      email: cleanEmail,
      role: 'moderator',
      added_by: addedBy,
    })

  if (error) {
    if (error.code === '23505') {
      throw new Error(`${cleanEmail} is already registered as an admin/moderator.`)
    }
    throw new Error(error.message || 'Failed to add moderator.')
  }

  return await fetchCommunityAdmins(true)
}

/**
 * Revokes moderator rights from an email address.
 * Primary owner cannot be revoked.
 */
export async function removeCommunityAdmin(email) {
  await requireAdmin()
  const cleanEmail = (email || '').toLowerCase().trim()

  if (cleanEmail === ROOT_OWNER_EMAIL.toLowerCase()) {
    throw new Error('Cannot revoke rights from the primary owner account.')
  }

  if (!isOnline()) {
    throw new Error('Cannot revoke moderator while offline. Database connection required.')
  }

  const { error } = await supabase
    .from('community_admins')
    .delete()
    .eq('email', cleanEmail)

  if (error) {
    throw new Error(error.message || 'Failed to revoke moderator.')
  }

  return await fetchCommunityAdmins(true)
}

// Automatically prime dynamic admins in background
if (typeof window !== 'undefined' && isOnline()) {
  fetchCommunityAdmins().catch(() => {})
}


// ── Stats & Profiles ──────────────────────────────────────────────────────────

export async function fetchCommunityStats() {
  const catalog = await fetchCatalog()
  const stats = {
    totalWallpapers: catalog.totalWallpapers || 0,
    activeUsers: 0,
    totalInstalls: 0,
  }

  if (isOnline()) {
    try {
      const { data, error } = await supabase.rpc('marketplace_stats')
      if (!error && data) {
        stats.activeUsers = data.activeUsers || 0
        stats.totalInstalls = data.totalInstalls || 0
        if (data.approvedWallpapers > 0) {
          stats.totalWallpapers = Math.max(stats.totalWallpapers, data.approvedWallpapers)
        }
      }
    } catch {
      // RPC may not exist
    }
  }

  return stats
}

export const fetchStats = fetchCommunityStats

export async function getUserProfile() {
  if (!isOnline()) return null
  try {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return null

    const { data, error } = await supabase
      .from('user_profiles')
      .select('*')
      .eq('id', user.id)
      .single()

    if (error) {
      if (error.code === 'PGRST116') {
        const { data: newProfile } = await supabase
          .from('user_profiles')
          .insert({
            id: user.id,
            display_name: user.user_metadata?.full_name || user.user_metadata?.name || 'User',
            avatar_url: user.user_metadata?.avatar_url || '',
          })
          .select()
          .single()
        return newProfile
      }
      throw error
    }
    return data
  } catch (err) {
    console.warn('[Community] Failed to fetch profile:', err.message)
    return null
  }
}

export async function updateUserProfile({ bio }) {
  if (!isOnline()) return null
  try {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return null

    const { data, error } = await supabase
      .from('user_profiles')
      .update({ bio, updated_at: new Date().toISOString() })
      .eq('id', user.id)
      .select()
      .single()

    if (error) throw error
    return data
  } catch (err) {
    console.warn('[Community] Failed to update profile:', err.message)
    return null
  }
}

/**
 * Downloads and caches a community wallpaper (video loop or media) to local disk via Rust backend.
 * Streams chunks, reports progress via callback, and returns { localPath, fileSize, cached }.
 */
export async function downloadCommunityWallpaper(wallpaper, onProgress = null) {
  if (!wallpaper) return null
  const sourceUrl = wallpaper.source || wallpaper.config?.videoPath || wallpaper.url
  if (!sourceUrl || (!sourceUrl.startsWith('http://') && !sourceUrl.startsWith('https://'))) {
    // Already local or invalid
    return { localPath: sourceUrl, cached: true }
  }

  // Determine file extension
  let ext = wallpaper.format || 'mp4'
  try {
    const urlObj = new URL(sourceUrl)
    const pathname = urlObj.pathname
    const lastDot = pathname.lastIndexOf('.')
    if (lastDot !== -1) {
      ext = pathname.slice(lastDot + 1).toLowerCase()
    }
  } catch {}

  let unlisten = null
  if (typeof onProgress === 'function') {
    unlisten = await safeListen('aether:community-download-progress', (event) => {
      const payload = event?.payload
      if (payload && (payload.wallpaperId === wallpaper.id || payload.wallpaperId === String(wallpaper.id))) {
        const percent = typeof payload.percent === 'number'
          ? payload.percent
          : (typeof payload.progress === 'number' ? payload.progress : 0)
        onProgress({
          ...payload,
          percent,
          progress: percent,
          downloaded: payload.downloaded || 0,
          total: payload.total || 0,
        })
      }
    })
  }

  try {
    const result = await tauriInvoke('cache_community_wallpaper', {
      url: sourceUrl,
      wallpaperId: String(wallpaper.id),
      ext: ext || 'mp4',
    })
    return result
  } catch (err) {
    console.error('[Community] cache_community_wallpaper error:', err)
    throw err
  } finally {
    if (typeof unlisten === 'function') {
      unlisten()
    }
  }
}

/**
 * Removes local physical file copy of a community wallpaper while leaving the item in Library as Cloud.
 */
export async function deleteLocalCommunityWallpaper(localPath) {
  if (!localPath) return false
  try {
    const res = await tauriInvoke('remove_local_community_wallpaper', { localPath })
    return Boolean(res)
  } catch (err) {
    console.warn('[Community] remove_local_community_wallpaper error:', err)
    return false
  }
}

