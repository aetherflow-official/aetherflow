import React, { useState, useEffect, useRef } from 'react'
import {
  Palette, Check, Trash2, Plus, RotateCcw, Upload, Download,
  Copy, Save, Sparkles, Eye, AlertCircle, CheckCircle2, Paintbrush,
  ChevronLeft, Edit2, X, Sliders, Layers, Sun, Moon
} from 'lucide-react'
import { useStore } from '../store/useStore.js'
import { BUILTIN_THEMES } from '../engines/index.js'
import {
  SettingSection,
  SettingRow,
  AetherToggle,
  AetherSegmented
} from '../components/Settings/SettingsUI.jsx'

const hexToRgbTuple = (hex) => {
  if (!hex || !hex.startsWith('#')) return hex
  const r = parseInt(hex.slice(1, 3), 16) || 0
  const g = parseInt(hex.slice(3, 5), 16) || 0
  const b = parseInt(hex.slice(5, 7), 16) || 0
  return `${r}, ${g}, ${b}`
}

const rgbTupleToHex = (tuple) => {
  if (!tuple) return '#000000'
  if (typeof tuple === 'string' && tuple.startsWith('#')) return tuple
  const parts = String(tuple).split(',').map(s => parseInt(s.trim(), 10) || 0)
  if (parts.length < 3) return '#000000'
  const toHex = (n) => Math.max(0, Math.min(255, n)).toString(16).padStart(2, '0')
  return `#${toHex(parts[0])}${toHex(parts[1])}${toHex(parts[2])}`
}

const BUILTIN_THEME_TOKENS = {
  'aether-dark': {
    '--rgb-base': '13, 15, 20',
    '--rgb-sidebar': '17, 20, 27',
    '--rgb-card': '22, 26, 35',
    '--color-brand': '#3b82f6',
    '--color-brand-hover': '#2563eb',
    '--color-accent': '#60a5fa',
    '--text-main': '#f3f4f6',
    '--text-muted': '#9ca3af',
    '--border-main': '#242a38',
    '--border-accent': '#3b82f6',
  },
  'aether-light': {
    '--rgb-base': '246, 248, 250',
    '--rgb-sidebar': '238, 242, 246',
    '--rgb-card': '255, 255, 255',
    '--color-brand': '#2563eb',
    '--color-brand-hover': '#1d4ed8',
    '--color-accent': '#0284c7',
    '--text-main': '#111827',
    '--text-muted': '#4b5563',
    '--border-main': '#d0d7de',
    '--border-accent': '#2563eb',
  },
  'sovereign-onyx': {
    '--rgb-base': '9, 9, 11',
    '--rgb-sidebar': '17, 17, 20',
    '--rgb-card': '26, 26, 32',
    '--color-brand': '#3b82f6',
    '--color-brand-hover': '#2563eb',
    '--color-accent': '#60a5fa',
    '--text-main': '#fafafa',
    '--text-muted': '#a1a1aa',
    '--border-main': '#27272a',
    '--border-accent': '#3b82f6',
  },
  'sovereign-slate': {
    '--rgb-base': '12, 15, 23',
    '--rgb-sidebar': '18, 23, 34',
    '--rgb-card': '24, 32, 48',
    '--color-brand': '#6366f1',
    '--color-brand-hover': '#4f46e5',
    '--color-accent': '#38bdf8',
    '--text-main': '#f1f5f9',
    '--text-muted': '#94a3b8',
    '--border-main': '#1e2d4a',
    '--border-accent': '#6366f1',
  },
  'sovereign-studio': {
    '--rgb-base': '10, 14, 15',
    '--rgb-sidebar': '17, 24, 26',
    '--rgb-card': '23, 34, 37',
    '--color-brand': '#10b981',
    '--color-brand-hover': '#059669',
    '--color-accent': '#2dd4bf',
    '--text-main': '#ecfdf5',
    '--text-muted': '#94a3b8',
    '--border-main': '#1e3040',
    '--border-accent': '#10b981',
  },
  'sovereign-obsidian': {
    '--rgb-base': '14, 11, 8',
    '--rgb-sidebar': '23, 19, 14',
    '--rgb-card': '34, 28, 21',
    '--color-brand': '#f59e0b',
    '--color-brand-hover': '#d97706',
    '--color-accent': '#fbbf24',
    '--text-main': '#fef3c7',
    '--text-muted': '#a8a29e',
    '--border-main': '#3d2e1e',
    '--border-accent': '#f59e0b',
  },
  'sovereign-manifesto': {
    '--rgb-base': '245, 240, 232',
    '--rgb-sidebar': '234, 228, 216',
    '--rgb-card': '252, 251, 250',
    '--color-brand': '#d42b2b',
    '--color-brand-hover': '#b91c1c',
    '--color-accent': '#1a3dc4',
    '--text-main': '#0a0a0a',
    '--text-muted': '#525252',
    '--border-main': '#0a0a0a',
    '--border-accent': '#d42b2b',
  },
  'sovereign-light': {
    '--rgb-base': '248, 250, 252',
    '--rgb-sidebar': '241, 245, 249',
    '--rgb-card': '255, 255, 255',
    '--color-brand': '#2563eb',
    '--color-brand-hover': '#1d4ed8',
    '--color-accent': '#0ea5e9',
    '--text-main': '#0f172a',
    '--text-muted': '#64748b',
    '--border-main': '#cbd5e1',
    '--border-accent': '#2563eb',
  },
}

const STARTER_PRESETS = [
  {
    name: 'Cyber Neon',
    tokens: {
      '--rgb-base': '#0b0816',
      '--rgb-sidebar': '#130d24',
      '--rgb-card': '#1b1233',
      '--color-brand': '#8b5cf6',
      '--color-brand-hover': '#7c3aed',
      '--color-accent': '#06b6d4',
      '--text-main': '#f5f3ff',
      '--text-muted': '#a78bfa',
      '--border-main': '#2e1f54',
      '--border-accent': '#8b5cf6',
    }
  },
  {
    name: 'Sunset Vaporwave',
    tokens: {
      '--rgb-base': '#16081e',
      '--rgb-sidebar': '#240d32',
      '--rgb-card': '#331346',
      '--color-brand': '#f43f5e',
      '--color-brand-hover': '#e11d48',
      '--color-accent': '#f59e0b',
      '--text-main': '#fff1f2',
      '--text-muted': '#fda4af',
      '--border-main': '#4c1d68',
      '--border-accent': '#f43f5e',
    }
  },
  {
    name: 'Emerald Matrix',
    tokens: {
      '--rgb-base': '#04130a',
      '--rgb-sidebar': '#081d10',
      '--rgb-card': '#0c2a18',
      '--color-brand': '#10b981',
      '--color-brand-hover': '#059669',
      '--color-accent': '#34d399',
      '--text-main': '#ecfdf5',
      '--text-muted': '#6ee7b7',
      '--border-main': '#134024',
      '--border-accent': '#10b981',
    }
  },
  {
    name: 'Solar Flare',
    tokens: {
      '--rgb-base': '#160d05',
      '--rgb-sidebar': '#231508',
      '--rgb-card': '#321f0b',
      '--color-brand': '#f97316',
      '--color-brand-hover': '#ea580c',
      '--color-accent': '#fbbf24',
      '--text-main': '#fff7ed',
      '--text-muted': '#fdba74',
      '--border-main': '#492c10',
      '--border-accent': '#f97316',
    }
  },
  {
    name: 'Crimson Blood',
    tokens: {
      '--rgb-base': '#120808',
      '--rgb-sidebar': '#1c0d0d',
      '--rgb-card': '#291313',
      '--color-brand': '#ef4444',
      '--color-brand-hover': '#dc2626',
      '--color-accent': '#f87171',
      '--text-main': '#fef2f2',
      '--text-muted': '#fca5a5',
      '--border-main': '#451d1d',
      '--border-accent': '#ef4444',
    }
  },
  {
    name: 'Nordic Blue',
    tokens: {
      '--rgb-base': '#09131b',
      '--rgb-sidebar': '#0f1f2c',
      '--rgb-card': '#162b3d',
      '--color-brand': '#0ea5e9',
      '--color-brand-hover': '#0284c7',
      '--color-accent': '#38bdf8',
      '--text-main': '#f0f9ff',
      '--text-muted': '#7dd3fc',
      '--border-main': '#1e3e57',
      '--border-accent': '#0ea5e9',
    }
  },
]

const THEME_PALETTES = {
  'aether-dark':         ['#0d0f14', '#161a23', '#3b82f6', '#60a5fa', '#f3f4f6'],
  'aether-light':        ['#f6f8fa', '#ffffff', '#2563eb', '#0284c7', '#111827'],
  'sovereign-onyx':      ['#09090b', '#1a1a20', '#3b82f6', '#60a5fa', '#fafafa'],
  'sovereign-slate':     ['#0c0f17', '#182030', '#6366f1', '#38bdf8', '#f1f5f9'],
  'sovereign-studio':    ['#0a0e0f', '#172225', '#10b981', '#2dd4bf', '#ecfdf5'],
  'sovereign-obsidian':  ['#0e0b08', '#221c15', '#f59e0b', '#fbbf24', '#fef3c7'],
  'sovereign-manifesto': ['#f5f0e8', '#fcfbfa', '#d42b2b', '#1a3dc4', '#0a0a0a'],
  'sovereign-light':     ['#f8fafc', '#ffffff', '#2563eb', '#0ea5e9', '#0f172a'],
}

const ACCENT_PRESETS = [
  { label: 'Onyx Blue', hex: '#3b82f6' },
  { label: 'Electric Indigo', hex: '#6366f1' },
  { label: 'Cyber Violet', hex: '#8b5cf6' },
  { label: 'Neon Cyan', hex: '#06b6d4' },
  { label: 'Emerald Pulse', hex: '#10b981' },
  { label: 'Solar Amber', hex: '#f59e0b' },
  { label: 'Crimson Spark', hex: '#ef4444' },
  { label: 'Hot Rose', hex: '#ec4899' },
]

function ThemeWireframePreview({ bg, card, brand, isSelected }) {
  const isLight = typeof bg === 'string' && (
    bg.toLowerCase().startsWith('#f') ||
    bg.toLowerCase().startsWith('#e') ||
    bg.toLowerCase().startsWith('rgb(24') ||
    bg.toLowerCase().startsWith('rgb(25')
  )
  const dotColor = isLight ? 'rgba(0,0,0,0.28)' : 'rgba(255,255,255,0.32)'
  const wireBg = bg?.startsWith('#') ? bg : (bg ? `rgb(${bg})` : '#0d0f14')
  const wireCard = card?.startsWith('#') ? card : (card ? `rgb(${card})` : '#161a23')
  const wireBrand = brand?.startsWith('#') ? brand : '#3b82f6'

  return (
    <div
      style={{
        width: '100%',
        height: 66,
        borderRadius: 6,
        background: wireBg,
        border: `1px solid ${isSelected ? wireBrand : 'rgba(255,255,255,0.08)'}`,
        position: 'relative',
        overflow: 'hidden',
        boxShadow: isSelected ? `0 0 14px ${wireBrand}25` : 'none',
        display: 'flex',
        flexDirection: 'column',
        marginBottom: 10,
        pointerEvents: 'none',
      }}
    >
      {/* Mini Titlebar */}
      <div
        style={{
          height: 12,
          background: isLight ? 'rgba(0,0,0,0.05)' : 'rgba(0,0,0,0.22)',
          borderBottom: isLight ? '1px solid rgba(0,0,0,0.07)' : '1px solid rgba(255,255,255,0.06)',
          display: 'flex',
          alignItems: 'center',
          padding: '0 6px',
          gap: 3,
        }}
      >
        <div style={{ width: 4, height: 4, borderRadius: '50%', background: dotColor }} />
        <div style={{ width: 4, height: 4, borderRadius: '50%', background: dotColor }} />
        <div style={{ width: 4, height: 4, borderRadius: '50%', background: dotColor }} />
        <div
          style={{
            marginLeft: 'auto',
            width: 20,
            height: 2.5,
            borderRadius: 1.5,
            background: isLight ? 'rgba(0,0,0,0.1)' : 'rgba(255,255,255,0.12)',
          }}
        />
      </div>

      {/* Mini App Body */}
      <div style={{ flex: 1, display: 'flex', padding: 5, gap: 5, overflow: 'hidden' }}>
        {/* Mini Sidebar */}
        <div
          style={{
            width: 24,
            background: isLight ? 'rgba(0,0,0,0.04)' : 'rgba(0,0,0,0.25)',
            borderRadius: 4,
            padding: 3,
            display: 'flex',
            flexDirection: 'column',
            gap: 3,
          }}
        >
          <div style={{ width: 12, height: 3, borderRadius: 1.5, background: wireBrand }} />
          <div style={{ width: 16, height: 2.5, borderRadius: 1.5, background: isLight ? 'rgba(0,0,0,0.12)' : 'rgba(255,255,255,0.14)' }} />
          <div style={{ width: 10, height: 2.5, borderRadius: 1.5, background: isLight ? 'rgba(0,0,0,0.12)' : 'rgba(255,255,255,0.14)' }} />
        </div>

        {/* Mini Content Stage */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 3 }}>
          <div
            style={{
              flex: 1,
              borderRadius: 4,
              background: `linear-gradient(135deg, ${wireCard} 0%, ${wireBrand}20 100%)`,
              border: isLight ? '1px solid rgba(0,0,0,0.06)' : '1px solid rgba(255,255,255,0.06)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <div
              style={{
                width: 9,
                height: 9,
                borderRadius: '50%',
                background: wireBrand,
                boxShadow: `0 0 6px ${wireBrand}`,
              }}
            />
          </div>

          <div style={{ display: 'flex', gap: 3 }}>
            <div style={{ flex: 1, height: 3, borderRadius: 1.5, background: isLight ? 'rgba(0,0,0,0.08)' : 'rgba(255,255,255,0.1)' }} />
            <div style={{ width: 14, height: 3, borderRadius: 1.5, background: wireBrand, opacity: 0.85 }} />
          </div>
        </div>
      </div>
    </div>
  )
}

export default function PersonalizationPage() {
  const activeTheme = useStore(s => s.activeTheme)
  const setActiveTheme = useStore(s => s.setActiveTheme)
  const themes = useStore(s => s.themes) || {}
  const saveCustomTheme = useStore(s => s.saveCustomTheme)
  const deleteCustomTheme = useStore(s => s.deleteCustomTheme)
  const renameCustomTheme = useStore(s => s.renameCustomTheme)
  const glowAmbience = useStore(s => s.glowAmbience) || 'balanced'
  const setGlowAmbience = useStore(s => s.setGlowAmbience)
  const reducedMotion = useStore(s => s.reducedMotion) || false
  const toggleReducedMotion = useStore(s => s.toggleReducedMotion)
  const uiDensity = useStore(s => s.uiDensity) || 'comfortable'
  const setUiDensity = useStore(s => s.setUiDensity)
  const customAccentColor = useStore(s => s.customAccentColor)
  const setCustomAccentColor = useStore(s => s.setCustomAccentColor)
  const thumbnailMode = useStore(s => s.thumbnailMode) || 'hover'
  const setThumbnailMode = useStore(s => s.setThumbnailMode)
  const authUser = useStore(s => s.authUser)

  // Separate user-created presets from built-ins
  const userPresets = Object.entries(themes).filter(([id]) =>
    !BUILTIN_THEMES.some(bt => bt.id === id)
  )

  // Custom Theme Studio State
  const [showCustomStudio, setShowCustomStudio] = useState(false)
  const [customThemeName, setCustomThemeName] = useState('My Custom Theme')
  const [customTokens, setCustomTokens] = useState({})
  const [isLivePreviewing, setIsLivePreviewing] = useState(false)
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false)

  // Modals
  const [showSaveModal, setShowSaveModal] = useState(false)
  const [saveModalName, setSaveModalName] = useState('')
  const [saveModalError, setSaveModalError] = useState(null)
  const [showDiscardModal, setShowDiscardModal] = useState(false)
  const [renameTarget, setRenameTarget] = useState(null) // { id, name }
  const [renameInput, setRenameInput] = useState('')
  const [deleteTarget, setDeleteTarget] = useState(null) // { id, name }
  const [showImportModal, setShowImportModal] = useState(false)
  const [importJsonText, setImportJsonText] = useState('')
  const fileInputRef = useRef(null)

  // Toast
  const [themeToast, setThemeToast] = useState(null)
  const showToast = (type, text) => {
    setThemeToast({ type, text })
    setTimeout(() => setThemeToast(null), 3500)
  }

  // Open Studio Workspace
  const handleOpenStudio = (presetId = null) => {
    let baseTokens = null
    let name = 'Custom Theme'

    if (presetId && themes[presetId]) {
      baseTokens = themes[presetId]
      name = baseTokens._meta?.name || 'Custom Theme'
    } else if (themes[activeTheme]) {
      baseTokens = themes[activeTheme]
      name = baseTokens._meta?.name ? `${baseTokens._meta.name} (Edit)` : 'Custom Theme'
    } else if (BUILTIN_THEME_TOKENS[activeTheme]) {
      baseTokens = BUILTIN_THEME_TOKENS[activeTheme]
      const bt = BUILTIN_THEMES.find(t => t.id === activeTheme)
      name = bt ? `${bt.name} Custom` : 'Custom Theme'
    } else {
      baseTokens = STARTER_PRESETS[0].tokens
      name = 'Cyber Neon Custom'
    }

    const normalized = {}
    Object.entries(baseTokens).forEach(([k, v]) => {
      if (k.startsWith('--')) {
        normalized[k] = k.startsWith('--rgb-') ? rgbTupleToHex(v) : v
      }
    })

    setCustomTokens(normalized)
    setCustomThemeName(name)
    setIsLivePreviewing(false)
    setHasUnsavedChanges(false)
    setShowCustomStudio(true)
  }

  // Live preview effect
  useEffect(() => {
    if (!showCustomStudio || !isLivePreviewing) {
      if (showCustomStudio && !isLivePreviewing) {
        Object.keys(customTokens).forEach(k => {
          document.documentElement.style.removeProperty(k)
        })
      }
      return
    }
    Object.entries(customTokens).forEach(([k, val]) => {
      const finalVal = k.startsWith('--rgb-') ? hexToRgbTuple(val) : val
      document.documentElement.style.setProperty(k, finalVal)
    })
  }, [showCustomStudio, isLivePreviewing, customTokens])

  const handleToggleLivePreview = () => {
    setIsLivePreviewing(prev => !prev)
  }

  const handleTokenChange = (key, val) => {
    setCustomTokens(prev => ({ ...prev, [key]: val }))
    setHasUnsavedChanges(true)
  }

  const handleSelectStarterPreset = (starter) => {
    setCustomTokens({ ...starter.tokens })
    setCustomThemeName(starter.name)
    setHasUnsavedChanges(true)
  }

  // Studio close requests
  const handleRequestCloseStudio = () => {
    if (hasUnsavedChanges) {
      setShowDiscardModal(true)
    } else {
      performCloseStudio()
    }
  }

  const performCloseStudio = () => {
    setShowCustomStudio(false)
    setIsLivePreviewing(false)
    setHasUnsavedChanges(false)
    setShowDiscardModal(false)

    // Clean up temporary live preview CSS properties
    Object.keys(customTokens).forEach(k => {
      document.documentElement.style.removeProperty(k)
    })
    // Re-apply current active theme from store
    setActiveTheme(activeTheme)
  }

  // Save Preset flow
  const handleInitiateSavePreset = () => {
    setSaveModalName(customThemeName || 'My Custom Theme')
    setSaveModalError(null)
    setShowSaveModal(true)
  }

  const handleConfirmSavePreset = (overwriteId = null) => {
    const trimmed = saveModalName.trim()
    if (!trimmed) {
      setSaveModalError('Please provide a preset name.')
      return
    }
    if (trimmed.length > 32) {
      setSaveModalError('Preset name cannot exceed 32 characters.')
      return
    }

    // Check collision if not explicitly overwriting
    if (!overwriteId) {
      const existingMatch = userPresets.find(
        ([, t]) => (t._meta?.name || '').toLowerCase() === trimmed.toLowerCase()
      )
      if (existingMatch) {
        setSaveModalError(`A preset named "${trimmed}" already exists. Overwrite it?`)
        return
      }
    }

    const presetId = overwriteId || `custom-${trimmed.toLowerCase().replace(/[^a-z0-9]/g, '-')}-${Date.now()}`
    const finalTokens = {}
    Object.entries(customTokens).forEach(([k, val]) => {
      finalTokens[k] = k.startsWith('--rgb-') ? hexToRgbTuple(val) : val
    })
    finalTokens._meta = {
      name: trimmed,
      bg: customTokens['--rgb-base'],
      card: customTokens['--rgb-card'],
      accent: customTokens['--color-brand'],
      text: customTokens['--text-main'],
      createdAt: Date.now(),
    }

    saveCustomTheme(presetId, finalTokens)
    setActiveTheme(presetId)
    setCustomThemeName(trimmed)
    setHasUnsavedChanges(false)
    setIsLivePreviewing(false)
    setShowSaveModal(false)
    showToast('success', `Preset "${trimmed}" saved and activated!`)
  }

  // Delete flow
  const handleConfirmDelete = () => {
    if (!deleteTarget) return
    deleteCustomTheme(deleteTarget.id)
    if (activeTheme === deleteTarget.id) {
      setActiveTheme('aether-dark')
    }
    showToast('success', `Deleted preset "${deleteTarget.name}"`)
    setDeleteTarget(null)
  }

  // Rename flow
  const handleConfirmRename = () => {
    if (!renameTarget) return
    const trimmed = renameInput.trim()
    if (!trimmed) return
    renameCustomTheme(renameTarget.id, trimmed)
    showToast('success', `Preset renamed to "${trimmed}"`)
    setRenameTarget(null)
    setRenameInput('')
  }

  // Export JSON
  const handleExportTheme = (themeId = null, themeTokens = null, themeName = null) => {
    try {
      let name = themeName
      let tokens = themeTokens

      if (!tokens) {
        const targetId = themeId || activeTheme
        if (themes[targetId]) {
          tokens = { ...themes[targetId] }
          name = tokens._meta?.name || 'Custom Theme'
          delete tokens._meta
        } else if (BUILTIN_THEME_TOKENS[targetId]) {
          tokens = BUILTIN_THEME_TOKENS[targetId]
          const builtin = BUILTIN_THEMES.find(t => t.id === targetId)
          name = builtin ? builtin.name : targetId
        } else if (showCustomStudio) {
          tokens = { ...customTokens }
          name = customThemeName || 'Custom Theme'
        }
      }

      if (!tokens) {
        showToast('error', 'No theme tokens available to export')
        return
      }

      const payload = {
        name: name || 'AetherFlow Theme',
        type: 'aetherflow-theme',
        version: 1,
        author: authUser?.user_metadata?.full_name || 'AetherFlow User',
        exportedAt: new Date().toISOString(),
        tokens: tokens,
      }

      const jsonStr = JSON.stringify(payload, null, 2)
      const blob = new Blob([jsonStr], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      const filename = `${(name || 'theme').toLowerCase().replace(/[^a-z0-9_-]/g, '_')}.aetherflow-theme.json`
      a.href = url
      a.download = filename
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)

      showToast('success', `Exported "${name}" theme successfully!`)
    } catch (err) {
      console.error('Export theme error:', err)
      showToast('error', 'Failed to export theme')
    }
  }

  const handleCopyThemeJson = () => {
    try {
      const cleanTokens = { ...customTokens }
      const payload = {
        name: customThemeName || 'Custom Theme',
        type: 'aetherflow-theme',
        version: 1,
        tokens: cleanTokens,
      }
      navigator.clipboard.writeText(JSON.stringify(payload, null, 2))
      showToast('success', `Copied "${customThemeName}" theme JSON to clipboard!`)
    } catch {
      showToast('error', 'Failed to copy to clipboard')
    }
  }

  // Import JSON
  const processImportedTheme = (parsed) => {
    try {
      const tokens = parsed.tokens || parsed
      if (!tokens || typeof tokens !== 'object') {
        throw new Error('Invalid theme format: no tokens object found')
      }

      const hasBase = tokens['--rgb-base'] || tokens['base'] || tokens['--bg-base']
      const hasBrand = tokens['--color-brand'] || tokens['brand'] || tokens['accent']
      if (!hasBase && !hasBrand) {
        throw new Error('Missing essential color tokens (--rgb-base or --color-brand)')
      }

      const normalized = {}
      Object.entries(tokens).forEach(([k, v]) => {
        if (typeof v === 'string') {
          const key = k.startsWith('--') ? k : `--${k}`
          normalized[key] = key.startsWith('--rgb-') && v.startsWith('#') ? hexToRgbTuple(v) : v
        }
      })

      const themeName = parsed.name || 'Imported Preset'
      const id = `custom-imported-${Date.now()}`
      normalized._meta = {
        name: themeName,
        bg: normalized['--rgb-base'] ? (normalized['--rgb-base'].startsWith('#') ? normalized['--rgb-base'] : rgbTupleToHex(normalized['--rgb-base'])) : '#0d0f14',
        card: normalized['--rgb-card'] ? (normalized['--rgb-card'].startsWith('#') ? normalized['--rgb-card'] : rgbTupleToHex(normalized['--rgb-card'])) : '#161a23',
        accent: normalized['--color-brand'] || '#3b82f6',
        text: normalized['--text-main'] || '#f3f4f6',
        createdAt: Date.now(),
      }

      saveCustomTheme(id, normalized)
      setActiveTheme(id)
      showToast('success', `Theme "${themeName}" imported into My Presets and applied!`)
      setShowImportModal(false)
      setImportJsonText('')
    } catch (err) {
      console.error('Theme import error:', err)
      showToast('error', err.message || 'Failed to import theme JSON')
    }
  }

  const handleFileImport = (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (event) => {
      try {
        const text = event.target.result
        const parsed = JSON.parse(text)
        processImportedTheme(parsed)
      } catch (err) {
        showToast('error', 'Invalid JSON file: ' + err.message)
      }
    }
    reader.readAsText(file)
    e.target.value = ''
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // MODE 2: CUSTOM THEME STUDIO (DEDICATED WORKSPACE)
  // ═══════════════════════════════════════════════════════════════════════════
  if (showCustomStudio) {
    const previewBg = customTokens['--rgb-base'] || '#0d0f14'
    const previewCard = customTokens['--rgb-card'] || '#161a23'
    const previewBrand = customTokens['--color-brand'] || '#3b82f6'
    const previewText = customTokens['--text-main'] || '#f3f4f6'
    const previewMuted = customTokens['--text-muted'] || '#9ca3af'
    const previewAccent = customTokens['--color-accent'] || '#60a5fa'
    const previewBorder = customTokens['--border-main'] || '#242a38'

    return (
      <div className="settings-page-container animate-fadeIn">
        {/* Studio Workspace Header Bar */}
        <header className="settings-page-header">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <button
                type="button"
                className="btn btn-ghost"
                style={{ height: 32, padding: '0 10px', gap: 6, fontSize: 12 }}
                onClick={handleRequestCloseStudio}
              >
                <ChevronLeft size={15} /> Personalization
              </button>
              <div style={{ width: 1, height: 18, background: 'var(--border-main)' }} />
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <h1 className="settings-page-title" style={{ fontSize: 18 }}>Theme Studio</h1>
                  <span
                    style={{
                      fontSize: 10.5,
                      fontWeight: 600,
                      padding: '2px 8px',
                      borderRadius: 4,
                      background: hasUnsavedChanges
                        ? 'color-mix(in srgb, var(--color-amber) 15%, transparent)'
                        : 'color-mix(in srgb, var(--border-main) 40%, transparent)',
                      border: `1px solid ${hasUnsavedChanges ? 'var(--color-amber)' : 'var(--border-subtle)'}`,
                      color: hasUnsavedChanges ? 'var(--color-amber)' : 'var(--text-muted)',
                      textTransform: 'uppercase',
                      letterSpacing: '0.04em',
                    }}
                  >
                    {hasUnsavedChanges ? 'Modified Draft' : 'Saved Baseline'}
                  </span>
                </div>
                <p className="settings-page-desc" style={{ marginTop: 2 }}>
                  Editing: <span style={{ color: 'var(--text-main)', fontWeight: 500 }}>{customThemeName}</span>
                </p>
              </div>
            </div>

            {/* Studio Action Controls */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <button
                type="button"
                className={`btn ${isLivePreviewing ? 'btn-primary' : 'btn-ghost'}`}
                style={{ height: 32, fontSize: 12, padding: '0 12px', gap: 6 }}
                onClick={handleToggleLivePreview}
                title="Toggle live app-wide CSS variable override"
              >
                <Eye size={13} /> {isLivePreviewing ? 'Live Preview: ON' : 'Live Preview: OFF'}
              </button>

              <button
                type="button"
                className="btn btn-ghost"
                style={{ height: 32, fontSize: 12, padding: '0 12px', gap: 6 }}
                onClick={handleCopyThemeJson}
                title="Copy current theme tokens as JSON"
              >
                <Copy size={13} /> Copy JSON
              </button>

              <button
                type="button"
                className="btn btn-primary"
                style={{ height: 32, fontSize: 12, padding: '0 16px', gap: 6 }}
                onClick={handleInitiateSavePreset}
              >
                <Save size={13} /> Save as Preset
              </button>

              <button
                type="button"
                className="btn btn-ghost"
                style={{ height: 32, fontSize: 12, padding: '0 10px' }}
                onClick={handleRequestCloseStudio}
                title="Close Studio and return to Personalization"
              >
                <X size={15} />
              </button>
            </div>
          </div>
        </header>

        {/* Toast Feedback */}
        {themeToast && (
          <div
            className="animate-fadeIn"
            style={{
              padding: '10px 16px',
              borderRadius: 8,
              marginBottom: 20,
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              fontSize: 12.5,
              fontWeight: 500,
              background: themeToast.type === 'error'
                ? 'color-mix(in srgb, var(--color-rose) 15%, transparent)'
                : 'color-mix(in srgb, var(--color-emerald) 15%, transparent)',
              border: `1px solid ${themeToast.type === 'error' ? 'var(--color-rose)' : 'var(--color-emerald)'}`,
              color: themeToast.type === 'error' ? 'var(--color-rose)' : 'var(--color-emerald)',
            }}
          >
            {themeToast.type === 'error' ? <AlertCircle size={14} /> : <CheckCircle2 size={14} />}
            <span>{themeToast.text}</span>
          </div>
        )}

        {/* Studio Body: Two Column Spatial Grid */}
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(320px, 420px) 1fr', gap: 28, alignItems: 'start' }}>
          {/* Left Column: Live Interactive Wireframe Stage */}
          <div>
            <div style={{ position: 'sticky', top: 20 }}>
              <div className="settings-section-header" style={{ marginBottom: 12 }}>
                <h2 className="settings-section-title">Live Preview Stage</h2>
                <span className="font-mono text-xs text-muted">Virtual Surface</span>
              </div>

              {/* Realistic Mock Window */}
              <div
                style={{
                  background: previewBg,
                  borderRadius: 10,
                  border: `1px solid ${previewBorder}`,
                  overflow: 'hidden',
                  boxShadow: `0 12px 36px rgba(0,0,0,0.35), 0 0 0 1px ${previewBrand}20`,
                  display: 'flex',
                  flexDirection: 'column',
                  transition: 'all 0.15s ease',
                }}
              >
                {/* Mock Window Titlebar */}
                <div
                  style={{
                    height: 36,
                    background: 'rgba(0,0,0,0.18)',
                    borderBottom: `1px solid ${previewBorder}`,
                    display: 'flex',
                    alignItems: 'center',
                    padding: '0 12px',
                    gap: 7,
                  }}
                >
                  <div style={{ width: 8, height: 8, borderRadius: '50%', background: previewBrand }} />
                  <div style={{ width: 8, height: 8, borderRadius: '50%', background: previewAccent }} />
                  <div style={{ width: 8, height: 8, borderRadius: '50%', background: 'rgba(255,255,255,0.2)' }} />
                  <div
                    style={{
                      marginLeft: 10,
                      fontSize: 11,
                      fontWeight: 600,
                      color: previewText,
                      letterSpacing: '-0.2px',
                    }}
                  >
                    AetherFlow Preview — {customThemeName}
                  </div>
                </div>

                {/* Mock Interior */}
                <div style={{ display: 'flex', minHeight: 280 }}>
                  {/* Mock Sidebar */}
                  <div
                    style={{
                      width: 90,
                      background: customTokens['--rgb-sidebar'] || 'rgba(0,0,0,0.15)',
                      borderRight: `1px solid ${previewBorder}`,
                      padding: 10,
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 6,
                    }}
                  >
                    <div
                      style={{
                        height: 22,
                        borderRadius: 4,
                        background: previewBrand,
                        display: 'flex',
                        alignItems: 'center',
                        padding: '0 6px',
                        color: '#fff',
                        fontSize: 10,
                        fontWeight: 600,
                      }}
                    >
                      Active Tab
                    </div>
                    <div style={{ height: 18, borderRadius: 4, background: 'rgba(255,255,255,0.06)', padding: '0 6px', display: 'flex', alignItems: 'center', color: previewMuted, fontSize: 9.5 }}>
                      Library
                    </div>
                    <div style={{ height: 18, borderRadius: 4, background: 'rgba(255,255,255,0.06)', padding: '0 6px', display: 'flex', alignItems: 'center', color: previewMuted, fontSize: 9.5 }}>
                      Displays
                    </div>
                  </div>

                  {/* Mock Main Surface */}
                  <div style={{ flex: 1, padding: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: previewText }}>
                      Sample Application Surface
                    </div>
                    <div style={{ fontSize: 11, color: previewMuted, lineHeight: 1.4 }}>
                      Visual inspection of surfaces, font contrast, and brand highlights.
                    </div>

                    {/* Mock Surface Card */}
                    <div
                      style={{
                        background: previewCard,
                        border: `1px solid ${previewBorder}`,
                        borderRadius: 6,
                        padding: 12,
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 8,
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <span style={{ fontSize: 11.5, fontWeight: 500, color: previewText }}>Wallpaper Engine</span>
                        <span
                          style={{
                            fontSize: 9.5,
                            fontWeight: 600,
                            padding: '2px 6px',
                            borderRadius: 3,
                            background: previewBrand,
                            color: '#fff',
                          }}
                        >
                          60 FPS
                        </span>
                      </div>
                      <div style={{ height: 4, borderRadius: 2, background: previewBorder, overflow: 'hidden' }}>
                        <div style={{ width: '68%', height: '100%', background: previewBrand }} />
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 6 }}>
                        <button
                          type="button"
                          style={{
                            fontSize: 10,
                            padding: '3px 8px',
                            borderRadius: 4,
                            border: `1px solid ${previewBorder}`,
                            background: 'transparent',
                            color: previewText,
                          }}
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          style={{
                            fontSize: 10,
                            padding: '3px 8px',
                            borderRadius: 4,
                            border: 'none',
                            background: previewBrand,
                            color: '#fff',
                            fontWeight: 600,
                          }}
                        >
                          Apply
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Status Note */}
              <div
                style={{
                  marginTop: 14,
                  padding: '10px 12px',
                  borderRadius: 6,
                  background: 'color-mix(in srgb, var(--border-main) 18%, var(--bg-card))',
                  border: '1px solid var(--border-subtle)',
                  fontSize: 11.5,
                  color: 'var(--text-muted)',
                  lineHeight: 1.45,
                }}
              >
                {isLivePreviewing ? (
                  <span style={{ color: 'var(--color-emerald)', fontWeight: 500 }}>
                    ● Live Preview Active: Tokens are temporarily overriding the host window.
                  </span>
                ) : (
                  <span>
                    Tokens stay contained to this preview until you toggle <strong>Live Preview</strong> or click <strong>Save as Preset</strong>.
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Right Column: Token Editors & Starter Baselines */}
          <div>
            {/* Starter Presets Bar */}
            <SettingSection title="Starter Baselines">
              <div style={{ padding: '10px 8px' }}>
                <div className="settings-item-desc" style={{ marginBottom: 10 }}>
                  Initialize this draft with colors from an existing palette:
                </div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {STARTER_PRESETS.map(sp => (
                    <button
                      key={sp.name}
                      type="button"
                      className="aether-preset-btn"
                      style={{ height: 28, display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11.5 }}
                      onClick={() => handleSelectStarterPreset(sp)}
                    >
                      <span style={{ width: 8, height: 8, borderRadius: '50%', background: sp.tokens['--color-brand'] }} />
                      {sp.name}
                    </button>
                  ))}
                  {BUILTIN_THEMES.map(bt => (
                    <button
                      key={bt.id}
                      type="button"
                      className="aether-preset-btn"
                      style={{ height: 28, display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11.5 }}
                      onClick={() => {
                        const raw = BUILTIN_THEME_TOKENS[bt.id] || {}
                        const normalized = {}
                        Object.entries(raw).forEach(([k, v]) => {
                          normalized[k] = k.startsWith('--rgb-') ? rgbTupleToHex(v) : v
                        })
                        setCustomTokens(normalized)
                        setCustomThemeName(`${bt.name} Custom`)
                        setHasUnsavedChanges(true)
                      }}
                    >
                      <span style={{ width: 8, height: 8, borderRadius: '50%', background: bt.accent }} />
                      {bt.name}
                    </button>
                  ))}
                </div>
              </div>
            </SettingSection>

            {/* Categorized Token Groups */}
            <SettingSection title="Surfaces & Canvas">
              {[
                { key: '--rgb-base', label: 'Window Background', desc: 'Main window canvas and deep backdrop' },
                { key: '--rgb-card', label: 'Cards & Panels', desc: 'Elevated content cards, dialog surfaces, and modals' },
                { key: '--rgb-sidebar', label: 'Sidebar Rail', desc: 'Left navigation sidebar background' },
              ].map(({ key, label, desc }) => (
                <SettingRow key={key} label={label} desc={desc}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span className="font-mono text-xs text-muted">{customTokens[key] || '#000000'}</span>
                    <input
                      type="color"
                      value={customTokens[key] || '#000000'}
                      onChange={e => handleTokenChange(key, e.target.value)}
                      style={{
                        width: 32,
                        height: 26,
                        padding: 0,
                        borderRadius: 6,
                        border: '1px solid var(--border-main)',
                        cursor: 'pointer',
                        background: 'transparent',
                      }}
                    />
                  </div>
                </SettingRow>
              ))}
            </SettingSection>

            <SettingSection title="Brand & Highlights">
              {[
                { key: '--color-brand', label: 'Primary Brand Accent', desc: 'Primary buttons, active indicators, and focus outlines' },
                { key: '--color-accent', label: 'Secondary Accent', desc: 'Glow highlights, status badges, and secondary indicators' },
              ].map(({ key, label, desc }) => (
                <SettingRow key={key} label={label} desc={desc}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span className="font-mono text-xs text-muted">{customTokens[key] || '#3b82f6'}</span>
                    <input
                      type="color"
                      value={customTokens[key] || '#3b82f6'}
                      onChange={e => handleTokenChange(key, e.target.value)}
                      style={{
                        width: 32,
                        height: 26,
                        padding: 0,
                        borderRadius: 6,
                        border: '1px solid var(--border-main)',
                        cursor: 'pointer',
                        background: 'transparent',
                      }}
                    />
                  </div>
                </SettingRow>
              ))}
            </SettingSection>

            <SettingSection title="Typography & Outlines">
              {[
                { key: '--text-main', label: 'Primary Text', desc: 'Main headings, prominent labels, and readable content' },
                { key: '--text-muted', label: 'Muted Text', desc: 'Secondary descriptions, captions, and muted timestamps' },
                { key: '--border-main', label: 'Surface Outlines', desc: 'Delicate borders between cards, rows, and headers' },
              ].map(({ key, label, desc }) => (
                <SettingRow key={key} label={label} desc={desc}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span className="font-mono text-xs text-muted">{customTokens[key] || '#ffffff'}</span>
                    <input
                      type="color"
                      value={customTokens[key] || '#ffffff'}
                      onChange={e => handleTokenChange(key, e.target.value)}
                      style={{
                        width: 32,
                        height: 26,
                        padding: 0,
                        borderRadius: 6,
                        border: '1px solid var(--border-main)',
                        cursor: 'pointer',
                        background: 'transparent',
                      }}
                    />
                  </div>
                </SettingRow>
              ))}
            </SettingSection>

            {/* Studio Bottom Bar */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 24, padding: '16px 8px', borderTop: '1px solid var(--border-subtle)' }}>
              <button
                type="button"
                className="btn btn-ghost"
                style={{ fontSize: 12 }}
                onClick={handleRequestCloseStudio}
              >
                <ChevronLeft size={14} /> Cancel & Exit Studio
              </button>
              <div style={{ display: 'flex', gap: 10 }}>
                <button
                  type="button"
                  className="btn btn-ghost"
                  style={{ fontSize: 12 }}
                  onClick={handleCopyThemeJson}
                >
                  <Copy size={13} /> Copy JSON
                </button>
                <button
                  type="button"
                  className="btn btn-primary"
                  style={{ fontSize: 12, padding: '0 20px', height: 34 }}
                  onClick={handleInitiateSavePreset}
                >
                  <Save size={14} /> Save as Preset
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Modal: Save Preset */}
        {showSaveModal && (
          <div
            style={{
              position: 'fixed',
              inset: 0,
              background: 'rgba(0, 0, 0, 0.65)',
              backdropFilter: 'blur(8px)',
              WebkitBackdropFilter: 'blur(8px)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              zIndex: 9999,
              padding: 20,
            }}
            onClick={() => setShowSaveModal(false)}
          >
            <div
              style={{
                background: 'var(--bg-card)',
                border: '1px solid var(--border-main)',
                borderRadius: 12,
                width: '100%',
                maxWidth: 420,
                padding: 22,
                boxShadow: '0 20px 50px rgba(0,0,0,0.5)',
              }}
              onClick={e => e.stopPropagation()}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Save size={16} style={{ color: 'var(--color-brand)' }} />
                  <span className="font-semibold text-sm">Save Theme Preset</span>
                </div>
                <button
                  type="button"
                  className="btn btn-ghost"
                  style={{ padding: 4, height: 24 }}
                  onClick={() => setShowSaveModal(false)}
                >
                  <X size={14} />
                </button>
              </div>

              <p className="text-xs text-muted" style={{ marginBottom: 16, lineHeight: 1.45 }}>
                Save your custom theme tokens as a permanent preset. It will appear directly alongside built-in themes under <strong>My Presets</strong>.
              </p>

              <div style={{ marginBottom: 16 }}>
                <label className="text-xs font-medium text-main" style={{ display: 'block', marginBottom: 6 }}>
                  Preset Name
                </label>
                <input
                  type="text"
                  className="input"
                  value={saveModalName}
                  onChange={e => {
                    setSaveModalName(e.target.value)
                    setSaveModalError(null)
                  }}
                  autoFocus
                  placeholder="e.g. Midnight Glass"
                  style={{ width: '100%' }}
                />
              </div>

              {saveModalError && (
                <div
                  style={{
                    padding: '8px 12px',
                    borderRadius: 6,
                    marginBottom: 16,
                    background: 'color-mix(in srgb, var(--color-amber) 15%, transparent)',
                    border: '1px solid var(--color-amber)',
                    color: 'var(--color-amber)',
                    fontSize: 12,
                    lineHeight: 1.4,
                  }}
                >
                  {saveModalError}
                </div>
              )}

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                <button
                  type="button"
                  className="btn btn-ghost"
                  style={{ fontSize: 12 }}
                  onClick={() => setShowSaveModal(false)}
                >
                  Cancel
                </button>
                {saveModalError && saveModalError.includes('already exists') ? (
                  <button
                    type="button"
                    className="btn btn-primary"
                    style={{ fontSize: 12, padding: '0 16px' }}
                    onClick={() => {
                      const match = userPresets.find(
                        ([, t]) => (t._meta?.name || '').toLowerCase() === saveModalName.trim().toLowerCase()
                      )
                      handleConfirmSavePreset(match ? match[0] : null)
                    }}
                  >
                    Overwrite Existing
                  </button>
                ) : (
                  <button
                    type="button"
                    className="btn btn-primary"
                    style={{ fontSize: 12, padding: '0 16px' }}
                    onClick={() => handleConfirmSavePreset()}
                  >
                    Save Preset
                  </button>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Modal: Discard Unsaved Changes */}
        {showDiscardModal && (
          <div
            style={{
              position: 'fixed',
              inset: 0,
              background: 'rgba(0, 0, 0, 0.65)',
              backdropFilter: 'blur(8px)',
              WebkitBackdropFilter: 'blur(8px)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              zIndex: 9999,
              padding: 20,
            }}
            onClick={() => setShowDiscardModal(false)}
          >
            <div
              style={{
                background: 'var(--bg-card)',
                border: '1px solid var(--border-main)',
                borderRadius: 12,
                width: '100%',
                maxWidth: 400,
                padding: 22,
                boxShadow: '0 20px 50px rgba(0,0,0,0.5)',
              }}
              onClick={e => e.stopPropagation()}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                <AlertCircle size={18} style={{ color: 'var(--color-amber)' }} />
                <span className="font-semibold text-sm">Discard Unsaved Changes?</span>
              </div>
              <p className="text-xs text-muted" style={{ lineHeight: 1.5, marginBottom: 18 }}>
                You have modified custom tokens in Theme Studio. Exiting now will discard these edits and restore your active theme.
              </p>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                <button
                  type="button"
                  className="btn btn-primary"
                  style={{ fontSize: 12 }}
                  onClick={() => setShowDiscardModal(false)}
                >
                  Keep Editing
                </button>
                <button
                  type="button"
                  className="btn btn-ghost"
                  style={{ fontSize: 12, color: 'var(--color-rose)' }}
                  onClick={performCloseStudio}
                >
                  Discard & Exit
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    )
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // MODE 1: MAIN PERSONALIZATION PAGE (PRECISION APPLICATION SURFACE)
  // ═══════════════════════════════════════════════════════════════════════════
  return (
    <div className="settings-page-container animate-fadeIn">
      {/* Hidden file input for theme JSON import */}
      <input
        type="file"
        ref={fileInputRef}
        accept=".json,application/json"
        style={{ display: 'none' }}
        onChange={handleFileImport}
      />

      {/* Main Page Header */}
      <header className="settings-page-header">
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: 16 }}>
          <div>
            <h1 className="settings-page-title">Personalization</h1>
            <p className="settings-page-desc">
              Visual themes, interface accent overrides, animation ergonomics, and appearance dynamics.
            </p>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <button
              type="button"
              className="btn btn-ghost"
              style={{ fontSize: 12, padding: '0 12px', height: 32, gap: 6 }}
              onClick={() => setShowImportModal(true)}
              title="Import theme from JSON file or text"
            >
              <Upload size={13} /> Import JSON
            </button>
            <button
              type="button"
              className="btn btn-ghost"
              style={{ fontSize: 12, padding: '0 12px', height: 32, gap: 6 }}
              onClick={() => handleExportTheme()}
              title="Export current active theme as JSON"
            >
              <Download size={13} /> Export Active
            </button>
            <button
              type="button"
              className="btn btn-primary"
              style={{ fontSize: 12, padding: '0 14px', height: 32, gap: 6 }}
              onClick={() => handleOpenStudio()}
            >
              <Plus size={14} /> Open Theme Studio
            </button>
          </div>
        </div>
      </header>

      {/* Toast feedback banner */}
      {themeToast && (
        <div
          className="animate-fadeIn"
          style={{
            padding: '10px 16px',
            borderRadius: 8,
            marginBottom: 24,
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            fontSize: 12.5,
            fontWeight: 500,
            background: themeToast.type === 'error'
              ? 'color-mix(in srgb, var(--color-rose) 15%, transparent)'
              : 'color-mix(in srgb, var(--color-emerald) 15%, transparent)',
            border: `1px solid ${themeToast.type === 'error' ? 'var(--color-rose)' : 'var(--color-emerald)'}`,
            color: themeToast.type === 'error' ? 'var(--color-rose)' : 'var(--color-emerald)',
          }}
        >
          {themeToast.type === 'error' ? <AlertCircle size={14} /> : <CheckCircle2 size={14} />}
          <span>{themeToast.text}</span>
        </div>
      )}

      {/* SECTION 1: THEME PRESETS (BUILT-IN + MY PRESETS) */}
      <SettingSection title="Theme Presets">
        {/* Built-in Presets Subgroup */}
        <div style={{ padding: '4px 0 14px 0' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, padding: '0 8px' }}>
            <span style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-muted)' }}>
              Built-in Presets
            </span>
            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
              {BUILTIN_THEMES.length} visual identities
            </span>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 12, padding: '0 4px' }}>
            {BUILTIN_THEMES.map(theme => {
              const isSelected = activeTheme === theme.id
              const palette = THEME_PALETTES[theme.id] || [theme.bg, '#1a1a20', theme.accent, '#38bdf8', '#ffffff']
              return (
                <div
                  key={theme.id}
                  className={`theme-preset-tile ${isSelected ? 'selected' : ''}`}
                  onClick={() => setActiveTheme(theme.id)}
                >
                  <ThemeWireframePreview
                    bg={theme.bg}
                    card={palette[1] || '#1a1a20'}
                    brand={theme.accent}
                    isSelected={isSelected}
                  />
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 7, minWidth: 0 }}>
                      <span
                        style={{
                          width: 8,
                          height: 8,
                          borderRadius: '50%',
                          background: theme.accent,
                          boxShadow: `0 0 6px ${theme.accent}`,
                          flexShrink: 0,
                        }}
                      />
                      <span
                        className="truncate"
                        style={{
                          fontSize: 13,
                          fontWeight: isSelected ? 600 : 500,
                          color: isSelected ? 'var(--color-brand)' : 'var(--text-main)',
                        }}
                      >
                        {theme.name}
                      </span>
                    </div>

                    {isSelected ? (
                      <span
                        style={{
                          width: 17,
                          height: 17,
                          borderRadius: '50%',
                          background: 'var(--color-brand)',
                          display: 'inline-flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          color: '#fff',
                          flexShrink: 0,
                        }}
                      >
                        <Check size={11} strokeWidth={3} />
                      </span>
                    ) : (
                      <span style={{ fontSize: 10, textTransform: 'capitalize', color: 'var(--text-muted)', background: 'var(--bg-hover)', padding: '1px 6px', borderRadius: 3 }}>
                        {theme.category}
                      </span>
                    )}
                  </div>

                  {/* Micro Color Swatch Bar */}
                  <div style={{ display: 'flex', gap: 4, marginTop: 'auto', paddingTop: 4 }}>
                    {palette.slice(0, 4).map((color, i) => (
                      <span
                        key={i}
                        style={{
                          flex: 1,
                          height: 3,
                          borderRadius: 1.5,
                          background: color,
                          opacity: 0.85,
                        }}
                        title={color}
                      />
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {/* My Presets Subgroup */}
        <div style={{ borderTop: '1px solid var(--border-subtle)', paddingTop: 18, marginTop: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, padding: '0 8px' }}>
            <span style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-muted)' }}>
              My Presets
            </span>
            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
              {userPresets.length} saved custom presets
            </span>
          </div>

          {userPresets.length > 0 ? (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 12, padding: '0 4px' }}>
              {userPresets.map(([id, tokens]) => {
                const isSelected = activeTheme === id
                const meta = tokens._meta || {
                  name: 'Custom Theme',
                  bg: tokens['--rgb-base'] || '#0d0f14',
                  card: tokens['--rgb-card'] || '#161a23',
                  accent: tokens['--color-brand'] || '#3b82f6',
                  text: tokens['--text-main'] || '#f3f4f6',
                }
                const palette = [
                  meta.bg?.startsWith('#') ? meta.bg : '#0d0f14',
                  meta.card?.startsWith('#') ? meta.card : '#161a23',
                  meta.accent?.startsWith('#') ? meta.accent : '#3b82f6',
                  meta.text?.startsWith('#') ? meta.text : '#f3f4f6',
                ]

                return (
                  <div
                    key={id}
                    className={`theme-preset-tile ${isSelected ? 'selected' : ''}`}
                    onClick={() => setActiveTheme(id)}
                  >
                    <ThemeWireframePreview
                      bg={meta.bg}
                      card={meta.card}
                      brand={meta.accent}
                      isSelected={isSelected}
                    />

                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 7, minWidth: 0 }}>
                        <span
                          style={{
                            width: 8,
                            height: 8,
                            borderRadius: '50%',
                            background: meta.accent,
                            boxShadow: `0 0 6px ${meta.accent}`,
                            flexShrink: 0,
                          }}
                        />
                        <span
                          className="truncate"
                          style={{
                            fontSize: 13,
                            fontWeight: isSelected ? 600 : 500,
                            color: isSelected ? 'var(--color-brand)' : 'var(--text-main)',
                          }}
                        >
                          {meta.name}
                        </span>
                      </div>

                      {isSelected && (
                        <span
                          style={{
                            width: 17,
                            height: 17,
                            borderRadius: '50%',
                            background: 'var(--color-brand)',
                            display: 'inline-flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            color: '#fff',
                            flexShrink: 0,
                          }}
                        >
                          <Check size={11} strokeWidth={3} />
                        </span>
                      )}
                    </div>

                    {/* Action Bar on Hover/Active */}
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        marginTop: 'auto',
                        paddingTop: 6,
                        borderTop: '1px solid var(--border-subtle)',
                      }}
                      onClick={e => e.stopPropagation()}
                    >
                      <button
                        type="button"
                        className="btn btn-ghost"
                        style={{ height: 22, padding: '0 6px', fontSize: 10.5, gap: 4 }}
                        onClick={() => handleOpenStudio(id)}
                        title="Edit preset in Theme Studio"
                      >
                        <Paintbrush size={11} /> Edit
                      </button>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                        <button
                          type="button"
                          className="btn btn-ghost"
                          style={{ height: 22, padding: '0 6px', fontSize: 10.5 }}
                          onClick={() => {
                            setRenameTarget({ id, name: meta.name })
                            setRenameInput(meta.name)
                          }}
                          title="Rename preset"
                        >
                          <Edit2 size={11} />
                        </button>
                        <button
                          type="button"
                          className="btn btn-ghost"
                          style={{ height: 22, padding: '0 6px', fontSize: 10.5 }}
                          onClick={() => handleExportTheme(id, tokens, meta.name)}
                          title="Export as JSON"
                        >
                          <Download size={11} />
                        </button>
                        <button
                          type="button"
                          className="btn btn-ghost"
                          style={{ height: 22, padding: '0 6px', fontSize: 10.5, color: 'var(--color-rose)' }}
                          onClick={() => setDeleteTarget({ id, name: meta.name })}
                          title="Delete custom preset"
                        >
                          <Trash2 size={11} />
                        </button>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          ) : (
            <div
              style={{
                padding: '24px 16px',
                borderRadius: 8,
                background: 'color-mix(in srgb, var(--border-main) 12%, var(--bg-card))',
                border: '1px dashed var(--border-subtle)',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                textAlign: 'center',
                gap: 8,
              }}
            >
              <Paintbrush size={20} style={{ color: 'var(--text-muted)', opacity: 0.6 }} />
              <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-main)' }}>
                No custom presets created yet
              </div>
              <p className="text-xs text-muted" style={{ maxWidth: 380, lineHeight: 1.45 }}>
                Craft bespoke background canvas tones, elevation surfaces, brand highlights, and text contrasts in Theme Studio.
              </p>
              <button
                type="button"
                className="btn btn-primary"
                style={{ fontSize: 11.5, height: 30, padding: '0 14px', marginTop: 4 }}
                onClick={() => handleOpenStudio()}
              >
                <Plus size={13} /> Create Custom Preset
              </button>
            </div>
          )}
        </div>
      </SettingSection>

      {/* SECTION 2: INTERFACE ACCENT */}
      <SettingSection title="Interface Accent">
        <SettingRow
          label="Primary interface accent"
          desc="Override the primary highlight color across buttons, indicators, and focus outlines without modifying base theme surfaces"
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
            {ACCENT_PRESETS.map(p => {
              const isSelected = customAccentColor?.toLowerCase() === p.hex.toLowerCase()
              return (
                <button
                  key={p.hex}
                  type="button"
                  onClick={() => setCustomAccentColor(p.hex)}
                  title={p.label}
                  style={{
                    width: 22,
                    height: 22,
                    borderRadius: '50%',
                    background: p.hex,
                    border: isSelected ? '2px solid #ffffff' : '1px solid rgba(0,0,0,0.3)',
                    boxShadow: isSelected ? `0 0 0 2px var(--color-brand), 0 0 8px ${p.hex}` : 'none',
                    cursor: 'pointer',
                    transition: 'transform 0.1s ease',
                    transform: isSelected ? 'scale(1.15)' : 'scale(1)',
                  }}
                />
              )
            })}

            <div style={{ width: 1, height: 18, background: 'var(--border-main)', margin: '0 4px' }} />

            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <input
                type="color"
                value={customAccentColor || '#3b82f6'}
                onChange={e => setCustomAccentColor(e.target.value)}
                style={{
                  width: 26,
                  height: 24,
                  borderRadius: 4,
                  border: '1px solid var(--border-main)',
                  cursor: 'pointer',
                  background: 'transparent',
                }}
                title="Choose custom hex"
              />
              <span className="font-mono text-xs text-muted" style={{ minWidth: 60 }}>
                {customAccentColor || 'Default'}
              </span>
            </div>

            {customAccentColor && (
              <button
                type="button"
                className="btn btn-ghost"
                style={{ height: 24, padding: '0 8px', fontSize: 11, gap: 4 }}
                onClick={() => setCustomAccentColor(null)}
              >
                <RotateCcw size={11} /> Reset
              </button>
            )}
          </div>
        </SettingRow>
      </SettingSection>

      {/* SECTION 3: APPEARANCE & MOTION */}
      <SettingSection title="Appearance & Motion">
        <SettingRow
          label="Accent Glow Ambience"
          desc="Controls the intensity of specular glows and brand halo shadows across UI controls"
        >
          <AetherSegmented
            value={glowAmbience}
            onChange={setGlowAmbience}
            items={[
              { id: 'vivid', label: 'Vivid' },
              { id: 'balanced', label: 'Balanced' },
              { id: 'subtle', label: 'Subtle' },
              { id: 'off', label: 'Off' },
            ]}
          />
        </SettingRow>

        <SettingRow
          label="Reduced motion"
          desc="Suppresses layout spring transitions and micro-animations for zero-latency responsiveness"
        >
          <AetherToggle
            checked={reducedMotion}
            onChange={toggleReducedMotion}
            ariaLabel="Reduced motion toggle"
          />
        </SettingRow>

        <SettingRow
          label="Interface density"
          desc="Choose between spacious comfortable layout or compact high-density layout for controls and lists"
        >
          <AetherSegmented
            value={uiDensity}
            onChange={setUiDensity}
            items={[
              { id: 'comfortable', label: 'Comfortable' },
              { id: 'compact', label: 'Compact' },
            ]}
          />
        </SettingRow>
      </SettingSection>

      {/* SECTION 4: THUMBNAIL PRESENTATION */}
      <SettingSection title="Thumbnail Presentation">
        <SettingRow
          label="Wallpaper card presentation"
          desc="Control hardware decoder usage for wallpaper thumbnails on Home and Library pages"
        >
          <AetherSegmented
            value={thumbnailMode}
            onChange={setThumbnailMode}
            items={[
              { id: 'hover', label: 'On Hover (Fast)' },
              { id: 'always', label: 'Always On' },
              { id: 'off', label: 'Minimal (Off)' },
            ]}
          />
        </SettingRow>
      </SettingSection>

      {/* Modal: Import Theme JSON */}
      {showImportModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0, 0, 0, 0.65)',
            backdropFilter: 'blur(8px)',
            WebkitBackdropFilter: 'blur(8px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 9999,
            padding: 20,
          }}
          onClick={() => setShowImportModal(false)}
        >
          <div
            style={{
              background: 'var(--bg-card)',
              border: '1px solid var(--border-main)',
              borderRadius: 12,
              width: '100%',
              maxWidth: 480,
              padding: 24,
              boxShadow: '0 20px 50px rgba(0,0,0,0.5)',
            }}
            onClick={e => e.stopPropagation()}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Upload size={16} style={{ color: 'var(--color-brand)' }} />
                <span className="font-semibold text-sm">Import Theme Preset</span>
              </div>
              <button
                type="button"
                className="btn btn-ghost"
                style={{ padding: 4, height: 24 }}
                onClick={() => setShowImportModal(false)}
              >
                <X size={14} />
              </button>
            </div>

            <p className="text-xs text-muted" style={{ marginBottom: 16, lineHeight: 1.45 }}>
              Load an exported <code>.aetherflow-theme.json</code> file or paste the theme tokens below.
            </p>

            <button
              type="button"
              className="btn btn-ghost"
              style={{
                width: '100%',
                height: 38,
                border: '1px dashed var(--border-strong)',
                marginBottom: 14,
                gap: 8,
                fontSize: 12,
              }}
              onClick={() => fileInputRef.current?.click()}
            >
              <Upload size={14} /> Choose JSON File from Disk
            </button>

            <div style={{ marginBottom: 16 }}>
              <label className="text-xs font-medium text-main" style={{ display: 'block', marginBottom: 6 }}>
                Or Paste JSON
              </label>
              <textarea
                className="input font-mono"
                rows={6}
                value={importJsonText}
                onChange={e => setImportJsonText(e.target.value)}
                placeholder='{\n  "name": "My Theme",\n  "tokens": { ... }\n}'
                style={{ width: '100%', fontSize: 11, resize: 'vertical' }}
              />
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button
                type="button"
                className="btn btn-ghost"
                style={{ fontSize: 12 }}
                onClick={() => setShowImportModal(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-primary"
                style={{ fontSize: 12, padding: '0 16px' }}
                disabled={!importJsonText.trim()}
                onClick={() => {
                  try {
                    const parsed = JSON.parse(importJsonText)
                    processImportedTheme(parsed)
                  } catch (err) {
                    showToast('error', 'Invalid JSON: ' + err.message)
                  }
                }}
              >
                Import Theme
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Rename Preset */}
      {renameTarget && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0, 0, 0, 0.65)',
            backdropFilter: 'blur(8px)',
            WebkitBackdropFilter: 'blur(8px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 9999,
            padding: 20,
          }}
          onClick={() => setRenameTarget(null)}
        >
          <div
            style={{
              background: 'var(--bg-card)',
              border: '1px solid var(--border-main)',
              borderRadius: 12,
              width: '100%',
              maxWidth: 380,
              padding: 22,
              boxShadow: '0 20px 50px rgba(0,0,0,0.5)',
            }}
            onClick={e => e.stopPropagation()}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Edit2 size={16} style={{ color: 'var(--color-brand)' }} />
                <span className="font-semibold text-sm">Rename Preset</span>
              </div>
              <button
                type="button"
                className="btn btn-ghost"
                style={{ padding: 4, height: 24 }}
                onClick={() => setRenameTarget(null)}
              >
                <X size={14} />
              </button>
            </div>

            <div style={{ marginBottom: 16 }}>
              <label className="text-xs font-medium text-main" style={{ display: 'block', marginBottom: 6 }}>
                Preset Title
              </label>
              <input
                type="text"
                className="input"
                value={renameInput}
                onChange={e => setRenameInput(e.target.value)}
                autoFocus
                style={{ width: '100%' }}
              />
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button
                type="button"
                className="btn btn-ghost"
                style={{ fontSize: 12 }}
                onClick={() => setRenameTarget(null)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-primary"
                style={{ fontSize: 12, padding: '0 16px' }}
                disabled={!renameInput.trim() || renameInput.trim() === renameTarget.name}
                onClick={handleConfirmRename}
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Delete Preset Confirmation */}
      {deleteTarget && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0, 0, 0, 0.65)',
            backdropFilter: 'blur(8px)',
            WebkitBackdropFilter: 'blur(8px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 9999,
            padding: 20,
          }}
          onClick={() => setDeleteTarget(null)}
        >
          <div
            style={{
              background: 'var(--bg-card)',
              border: '1px solid var(--border-main)',
              borderRadius: 12,
              width: '100%',
              maxWidth: 380,
              padding: 22,
              boxShadow: '0 20px 50px rgba(0,0,0,0.5)',
            }}
            onClick={e => e.stopPropagation()}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
              <Trash2 size={17} style={{ color: 'var(--color-rose)' }} />
              <span className="font-semibold text-sm">Delete Preset</span>
            </div>
            <p className="text-xs text-muted" style={{ lineHeight: 1.5, marginBottom: 18 }}>
              Are you sure you want to delete <strong>"{deleteTarget.name}"</strong>? This user-created preset will be permanently removed.
            </p>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button
                type="button"
                className="btn btn-ghost"
                style={{ fontSize: 12 }}
                onClick={() => setDeleteTarget(null)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn"
                style={{ fontSize: 12, padding: '0 14px', background: 'var(--color-rose)', color: '#fff' }}
                onClick={handleConfirmDelete}
              >
                Delete Preset
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
