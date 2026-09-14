/**
 * AetherFlow Community Hub — Hybrid GitHub + Supabase + Admin Moderation Backend
 *
 * Catalog data: merged from yashpreeto7/aetherflow-community GitHub repo + approved Supabase submissions
 * User actions: submit, like, install tracking via Supabase RPC + tables
 * Admin Moderation: in-app review queue, instant approval, takedown/removal without touching GitHub
 */

import { supabase, isOnline } from './supabase.js'
import { parseYouTubeId } from '../engines/web-stream.js'

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

// ── Admin Authorization Checks ────────────────────────────────────────────────

const DEFAULT_ADMIN_PASSCODES = ['aether-admin', 'aetherflow-admin', 'aetherflow', 'admin123']

/**
 * Checks if the user is recognized as an Admin:
 * 1. If in-app admin mode is unlocked via passcode
 * 2. If authUser metadata role is 'admin' or is_admin is true
 * 3. If authUser email matches known admin emails
 */
export function checkIsAdmin(user, adminUnlocked = false) {
  if (adminUnlocked) return true
  if (!user) return false
  if (user.user_metadata?.role === 'admin' || user.user_metadata?.is_admin === true) return true

  const adminEmailsEnv = (import.meta.env.VITE_ADMIN_EMAILS || 'yashpreeto7@gmail.com,yashpreet_o7@live.com')
  const adminEmails = adminEmailsEnv.split(',').map(s => s.trim().toLowerCase()).filter(Boolean)

  if (user.email && adminEmails.includes(user.email.toLowerCase())) {
    return true
  }

  return false
}

/**
 * Validates the entered admin passcode.
 */
export function verifyAdminPasscode(passcode) {
  if (!passcode) return false
  const trimmed = passcode.trim()
  const customKey = import.meta.env.VITE_COMMUNITY_ADMIN_KEY
  if (customKey && trimmed === customKey.trim()) return true
  return DEFAULT_ADMIN_PASSCODES.includes(trimmed.toLowerCase())
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

          return {
            id: sub.id,
            name: sub.title || 'Untitled Wallpaper',
            description: sub.description || '',
            author: sub.author_name || sub.author || 'Community Creator',
            type: sub.type || 'youtube',
            source: sub.source,
            preview,
            tags: Array.isArray(sub.tags) ? sub.tags : (sub.tags ? [sub.tags] : ['community']),
            downloads: sub.downloads || 0,
            likes: sub.likes || 0,
            featured: Boolean(sub.is_featured),
            isCommunitySubmission: true,
            createdAt: sub.created_at,
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

  // 3. Merge local mock submissions (for offline testing & local approvals)
  const localSubs = getLocalSubmissions()
  const localApproved = localSubs
    .filter(s => s.status === 'approved' && !approvedSubmissions.some(a => a.id === s.id))
    .map(sub => ({
      id: sub.id,
      name: sub.title,
      description: sub.description,
      author: sub.author || 'You (Local)',
      type: sub.type,
      source: sub.source,
      preview: sub.preview || sub.source,
      tags: sub.tags || ['community'],
      downloads: sub.downloads || 0,
      likes: sub.likes || 0,
      featured: Boolean(sub.is_featured),
      isCommunitySubmission: true,
      createdAt: sub.created_at,
    }))

  // 4. Combine and deduplicate
  const seenIds = new Set()
  const combined = []

  // Put community approved submissions first for fresh engagement
  for (const item of [...approvedSubmissions, ...localApproved, ...baseWallpapers]) {
    if (!item?.id || seenIds.has(item.id)) continue
    if (takedowns.has(item.id)) continue // Exclude taken down items!

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

/**
 * Search and filter wallpapers from the combined catalog.
 */
export async function searchCatalog({
  query = '',
  tags = [],
  type = '',
  filterMode = 'all', // 'all' | 'featured' | 'community'
  sortMode = 'popular', // 'popular' | 'newest' | 'likes' | 'name'
} = {}) {
  const catalog = await fetchCatalog()
  let results = [...(catalog.wallpapers || [])]

  // Filter mode
  if (filterMode === 'featured') {
    results = results.filter(w => w.featured)
  } else if (filterMode === 'community') {
    results = results.filter(w => w.isCommunitySubmission)
  }

  // Text search (title, description, author)
  if (query) {
    const q = query.toLowerCase().trim()
    results = results.filter(w =>
      w.name?.toLowerCase().includes(q) ||
      w.description?.toLowerCase().includes(q) ||
      w.author?.toLowerCase().includes(q)
    )
  }

  // Tag filter
  if (tags.length > 0) {
    results = results.filter(w =>
      tags.some(tag => (w.tags || []).includes(tag))
    )
  }

  // Type filter
  if (type) {
    results = results.filter(w => w.type === type)
  }

  // Sorting
  results.sort((a, b) => {
    if (sortMode === 'newest') {
      const timeA = a.createdAt ? new Date(a.createdAt).getTime() : 0
      const timeB = b.createdAt ? new Date(b.createdAt).getTime() : 0
      return timeB - timeA
    }
    if (sortMode === 'likes') {
      return (b.likes || 0) - (a.likes || 0)
    }
    if (sortMode === 'name') {
      return (a.name || '').localeCompare(b.name || '')
    }
    // Default: 'popular' (downloads descending)
    return (b.downloads || 0) - (a.downloads || 0)
  })

  return results
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

// ── Submissions ───────────────────────────────────────────────────────────────

/**
 * Submit a wallpaper for community review.
 */
export async function submitWallpaper({ title, description, tags, type, source, authorName, previewUrl }) {
  let user = null
  if (isOnline()) {
    try {
      const { data } = await supabase.auth.getUser()
      user = data?.user || null
    } catch {}
  }

  const generatedId = 'sub_' + Math.random().toString(36).substring(2, 11)
  let preview = previewUrl || ''
  if (!preview && type === 'youtube') {
    const ytid = parseYouTubeId(source)
    if (ytid) preview = `https://img.youtube.com/vi/${ytid}/hqdefault.jpg`
  } else if (!preview && type === 'image') {
    preview = source
  }

  const submissionPayload = {
    id: generatedId,
    title: title.trim(),
    description: (description || '').trim(),
    type,
    source: source.trim(),
    preview,
    tags: tags || [],
    author: authorName || user?.user_metadata?.full_name || user?.email?.split('@')[0] || 'Community Contributor',
    status: 'pending',
    created_at: new Date().toISOString(),
  }

  if (isOnline() && user) {
    try {
      const { data, error } = await supabase
        .from('submissions')
        .insert({
          author_id: user.id,
          author_name: submissionPayload.author,
          title: submissionPayload.title,
          description: submissionPayload.description,
          type: submissionPayload.type,
          source: submissionPayload.source,
          preview_url: preview,
          tags: submissionPayload.tags,
          status: 'pending',
        })
        .select()
        .single()

      if (!error && data) {
        submissionPayload.id = data.id
      }
    } catch (err) {
      console.warn('[Community] Supabase insert failed, saving locally:', err.message)
    }
  }

  // Always save locally so the author sees it in their "My Submissions"
  const localList = getLocalSubmissions()
  localList.unshift(submissionPayload)
  saveLocalSubmissions(localList)

  return submissionPayload
}

/**
 * Get the current user's submissions.
 */
export async function getUserSubmissions() {
  const localList = getLocalSubmissions()

  if (!isOnline()) return localList

  try {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return localList

    const { data, error } = await supabase
      .from('submissions')
      .select('*')
      .eq('author_id', user.id)
      .order('created_at', { ascending: false })

    if (error) throw error

    const serverList = (data || []).map(row => ({
      id: row.id,
      title: row.title,
      description: row.description,
      type: row.type,
      source: row.source,
      tags: row.tags || [],
      author: row.author_name || 'You',
      status: row.status || 'pending',
      created_at: row.created_at,
      rejection_reason: row.rejection_reason,
    }))

    // Merge server and local list
    const serverIds = new Set(serverList.map(s => s.id))
    const merged = [...serverList, ...localList.filter(l => !serverIds.has(l.id))]
    return merged
  } catch (err) {
    console.warn('[Community] Failed to fetch submissions from Supabase:', err.message)
    return localList
  }
}

// ── Admin Moderation APIs ─────────────────────────────────────────────────────

/**
 * Fetches all wallpapers awaiting review.
 * Only accessible to admins.
 */
export async function fetchPendingSubmissions() {
  const localSubs = getLocalSubmissions().filter(s => s.status === 'pending')

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

    const serverSubs = (data || []).map(row => {
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
export async function approveSubmission(submissionId) {
  // Update local storage if present
  const localList = getLocalSubmissions()
  const localIndex = localList.findIndex(s => s.id === submissionId)
  if (localIndex !== -1) {
    localList[localIndex].status = 'approved'
    localList[localIndex].reviewed_at = new Date().toISOString()
    saveLocalSubmissions(localList)
  }

  // Update Supabase
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
        // Fallback: update status without reviewed_at column
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

  // Remove from takedowns if it was previously there
  removeLocalTakedown(submissionId)

  // Clear cache so it appears immediately
  clearCatalogCache()
  return { success: true }
}

/**
 * Reject a pending submission with an optional reason.
 */
export async function rejectSubmission(submissionId, reason = '') {
  // Update local storage if present
  const localList = getLocalSubmissions()
  const localIndex = localList.findIndex(s => s.id === submissionId)
  if (localIndex !== -1) {
    localList[localIndex].status = 'rejected'
    localList[localIndex].rejection_reason = reason
    localList[localIndex].reviewed_at = new Date().toISOString()
    saveLocalSubmissions(localList)
  }

  // Update Supabase
  if (isOnline()) {
    try {
      let { error } = await supabase
        .from('submissions')
        .update({
          status: 'rejected',
          rejection_reason: reason || 'Does not meet guidelines',
          reviewed_at: new Date().toISOString(),
        })
        .eq('id', submissionId)

      if (error && error.message?.includes('column')) {
        // Fallback: update status without extra columns
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
