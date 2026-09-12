import React, { useState, useEffect, useRef } from 'react'
import {
  Palette, Check, Trash2, Plus, RotateCcw, Upload, Download,
  Copy, Save, FileText, Sparkles, Eye, AlertCircle, CheckCircle2, Paintbrush
} from 'lucide-react'
import { useStore } from '../store/useStore.js'
import { BUILTIN_THEMES } from '../engines/index.js'
import { SettingRow } from '../components/Settings/SettingRow.jsx'

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

function ThemeWireframePreview({ bg, card, brand, text, accent, isSelected }) {
  const isLight = typeof bg === 'string' && (bg.toLowerCase().startsWith('#f') || bg.toLowerCase().startsWith('#e') || bg.toLowerCase().startsWith('rgb(24') || bg.toLowerCase().startsWith('rgb(25'))
  const dotColor = isLight ? 'rgba(0,0,0,0.25)' : 'rgba(255,255,255,0.3)'
  const wireBg = bg?.startsWith('#') ? bg : (bg ? `rgb(${bg})` : '#09090b')
  const wireCard = card?.startsWith('#') ? card : (card ? `rgb(${card})` : '#18181b')
  const wireBrand = brand?.startsWith('#') ? brand : '#3b82f6'

  return (
    <div
      style={{
        width: '100%',
        height: 64,
        borderRadius: 6,
        background: wireBg,
        border: `1px solid ${isSelected ? wireBrand : 'rgba(255,255,255,0.08)'}`,
        position: 'relative',
        overflow: 'hidden',
        boxShadow: isSelected ? `0 0 14px ${wireBrand}33` : 'none',
        display: 'flex',
        flexDirection: 'column',
        marginBottom: 10,
        pointerEvents: 'none',
      }}
    >
      <div
        style={{
          height: 12,
          background: 'rgba(0,0,0,0.18)',
          borderBottom: '1px solid rgba(255,255,255,0.06)',
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
            background: 'rgba(255,255,255,0.1)',
          }}
        />
      </div>

      <div style={{ flex: 1, display: 'flex', padding: 5, gap: 5, overflow: 'hidden' }}>
        <div
          style={{
            width: 26,
            background: 'rgba(0,0,0,0.22)',
            borderRadius: 4,
            padding: 3,
            display: 'flex',
            flexDirection: 'column',
            gap: 3,
          }}
        >
          <div style={{ width: 14, height: 3, borderRadius: 1.5, background: wireBrand }} />
          <div style={{ width: 18, height: 2.5, borderRadius: 1.5, background: 'rgba(255,255,255,0.14)' }} />
          <div style={{ width: 11, height: 2.5, borderRadius: 1.5, background: 'rgba(255,255,255,0.14)' }} />
        </div>

        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 3 }}>
          <div
            style={{
              flex: 1,
              borderRadius: 4,
              background: `linear-gradient(135deg, ${wireCard} 0%, ${wireBrand}22 100%)`,
              border: '1px solid rgba(255,255,255,0.06)',
              position: 'relative',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <div
              style={{
                width: 10,
                height: 10,
                borderRadius: '50%',
                background: wireBrand,
                boxShadow: `0 0 8px ${wireBrand}`,
              }}
            />
          </div>

          <div style={{ display: 'flex', gap: 3 }}>
            <div style={{ flex: 1, height: 3, borderRadius: 1.5, background: 'rgba(255,255,255,0.12)' }} />
            <div style={{ width: 14, height: 3, borderRadius: 1.5, background: wireBrand, opacity: 0.8 }} />
          </div>
        </div>
      </div>
    </div>
  )
}

export default function PersonalizationPage() {
  const activeTheme = useStore(s => s.activeTheme)
  const setActiveTheme = useStore(s => s.setActiveTheme)
  const customThemes = useStore(s => s.customThemes) || {}
  const saveCustomTheme = useStore(s => s.saveCustomTheme)
  const deleteCustomTheme = useStore(s => s.deleteCustomTheme)
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

  // Custom Theme Studio state
  const [showCustomStudio, setShowCustomStudio] = useState(false)
  const [customThemeName, setCustomThemeName] = useState('My Custom Theme')
  const [customTokens, setCustomTokens] = useState({})
  const [isLivePreviewing, setIsLivePreviewing] = useState(false)
  const [saveSuccessMsg, setSaveSuccessMsg] = useState(false)
  const [hasCustomized, setHasCustomized] = useState(false)

  // Toast / Status notification state
  const [themeToast, setThemeToast] = useState(null)
  const [showImportModal, setShowImportModal] = useState(false)
  const [importJsonText, setImportJsonText] = useState('')
  const fileInputRef = useRef(null)

  const showToast = (type, text) => {
    setThemeToast({ type, text })
    setTimeout(() => setThemeToast(null), 3500)
  }

  const handleOpenStudio = () => {
    const currentTokens = customThemes[activeTheme] || BUILTIN_THEME_TOKENS[activeTheme] || STARTER_PRESETS[0].tokens
    const normalized = {}
    Object.entries(currentTokens).forEach(([k, v]) => {
      if (k.startsWith('--')) {
        normalized[k] = k.startsWith('--rgb-') ? rgbTupleToHex(v) : v
      }
    })
    setCustomTokens(normalized)
    setCustomThemeName(
      customThemes[activeTheme]?._meta?.name
        ? `${customThemes[activeTheme]._meta.name} (Custom)`
        : 'My Custom Theme'
    )
    setIsLivePreviewing(false)
    setHasCustomized(false)
    setShowCustomStudio(true)
  }

  useEffect(() => {
    if (!showCustomStudio || !isLivePreviewing) return
    Object.entries(customTokens).forEach(([k, val]) => {
      const finalVal = k.startsWith('--rgb-') ? hexToRgbTuple(val) : val
      document.documentElement.style.setProperty(k, finalVal)
    })
  }, [showCustomStudio, isLivePreviewing, customTokens])

  const handleTokenChange = (key, val) => {
    setCustomTokens(prev => ({ ...prev, [key]: val }))
    setHasCustomized(true)
    setIsLivePreviewing(true)
  }

  const handleSelectPreset = (starter) => {
    setCustomTokens({ ...starter.tokens })
    setCustomThemeName(starter.name)
    setHasCustomized(true)
    setIsLivePreviewing(true)
  }

  const handleSaveCustomTheme = () => {
    const id = `custom-${Date.now()}`
    const finalTokens = {}
    Object.entries(customTokens).forEach(([k, val]) => {
      finalTokens[k] = k.startsWith('--rgb-') ? hexToRgbTuple(val) : val
    })
    finalTokens._meta = {
      name: customThemeName.trim() || 'Custom Theme',
      bg: customTokens['--rgb-base'],
      card: customTokens['--rgb-card'],
      accent: customTokens['--color-brand'],
      text: customTokens['--text-main'],
    }
    saveCustomTheme(id, finalTokens)
    setActiveTheme(id)
    setIsLivePreviewing(false)
    setHasCustomized(false)
    setSaveSuccessMsg(true)
    showToast('success', `Theme "${customThemeName.trim() || 'Custom Theme'}" saved and activated!`)
    setTimeout(() => setSaveSuccessMsg(false), 3500)
  }

  const handleCloseStudio = () => {
    setShowCustomStudio(false)
    setIsLivePreviewing(false)
    setHasCustomized(false)
    setActiveTheme(activeTheme)
  }

  const handleExportTheme = (themeId = null, themeTokens = null, themeName = null) => {
    try {
      let name = themeName
      let tokens = themeTokens

      if (!tokens) {
        const targetId = themeId || activeTheme
        if (customThemes[targetId]) {
          tokens = { ...customThemes[targetId] }
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

  const handleCopyThemeJson = (themeId = null) => {
    try {
      const targetId = themeId || activeTheme
      const targetTheme = customThemes[targetId]
      const tokens = targetTheme ? { ...targetTheme } : (BUILTIN_THEME_TOKENS[targetId] || customTokens)
      const name = targetTheme?._meta?.name || BUILTIN_THEMES.find(t => t.id === targetId)?.name || customThemeName
      const cleanTokens = { ...tokens }
      if (cleanTokens._meta) delete cleanTokens._meta

      const payload = {
        name: name || 'AetherFlow Theme',
        type: 'aetherflow-theme',
        version: 1,
        tokens: cleanTokens,
      }
      navigator.clipboard.writeText(JSON.stringify(payload, null, 2))
      showToast('success', `Copied "${name}" theme JSON to clipboard!`)
    } catch (err) {
      showToast('error', 'Failed to copy to clipboard')
    }
  }

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

      const themeName = parsed.name || 'Imported Theme'
      const id = `custom-imported-${Date.now()}`
      normalized._meta = {
        name: themeName,
        bg: normalized['--rgb-base'] ? (normalized['--rgb-base'].startsWith('#') ? normalized['--rgb-base'] : rgbTupleToHex(normalized['--rgb-base'])) : '#09090b',
        card: normalized['--rgb-card'] ? (normalized['--rgb-card'].startsWith('#') ? normalized['--rgb-card'] : rgbTupleToHex(normalized['--rgb-card'])) : '#1a1a20',
        accent: normalized['--color-brand'] || '#3b82f6',
        text: normalized['--text-main'] || '#fafafa',
      }

      saveCustomTheme(id, normalized)
      setActiveTheme(id)
      showToast('success', `Theme "${themeName}" imported and activated!`)
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

  return (
    <div className="animate-fadeIn" style={{ maxWidth: 880, margin: '0 auto', paddingBottom: 48 }}>
      {/* Top Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 className="font-display font-bold text-2xl" style={{ letterSpacing: '-0.5px' }}>
            Personalization & Aesthetics
          </h1>
          <p className="text-muted text-sm" style={{ marginTop: 4 }}>
            Tailor high-contrast UI themes, specular neon accents, motion ergonomics, and card thumbnail decoders
          </p>
        </div>
      </div>

      {/* Hidden file input for theme JSON import */}
      <input
        type="file"
        ref={fileInputRef}
        accept=".json,application/json"
        style={{ display: 'none' }}
        onChange={handleFileImport}
      />

      {/* Toast feedback banner */}
      {themeToast && (
        <div
          className="animate-fadeIn"
          style={{
            padding: '10px 16px',
            borderRadius: 8,
            marginBottom: 16,
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

      {/* Card 1: Sovereign Theme Presets & Custom Themes */}
      <div className="setting-card">
        <div className="setting-card-header">
          <div className="flex items-center gap-2.5">
            <Palette size={16} style={{ color: 'var(--color-brand)' }} />
            <span className="text-sm font-semibold">Sovereign Theme Presets</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              className="btn btn-ghost"
              style={{ fontSize: 11, padding: '4px 10px', height: 26 }}
              onClick={() => setShowImportModal(true)}
              title="Import a theme from JSON text or file"
            >
              <Upload size={12} /> Import
            </button>
            <button
              type="button"
              className="btn btn-ghost"
              style={{ fontSize: 11, padding: '4px 10px', height: 26 }}
              onClick={() => handleExportTheme()}
              title="Export current active theme as JSON file"
            >
              <Download size={12} /> Export Active
            </button>
            <button
              type="button"
              className="btn btn-primary"
              style={{ fontSize: 11, padding: '4px 12px', height: 26 }}
              onClick={handleOpenStudio}
            >
              <Plus size={13} /> Customize & Create
            </button>
          </div>
        </div>

        <div style={{ padding: '16px 18px' }}>
          <div className="text-xs text-muted" style={{ marginBottom: 14 }}>
            Select a visual identity, import a theme JSON, or create a custom palette. All UI surfaces, elevations, accents, and glows will dynamically adapt.
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 12 }}>
            {BUILTIN_THEMES.map(theme => {
              const isSelected = activeTheme === theme.id
              const palette = THEME_PALETTES[theme.id] || [theme.bg, '#1e2025', theme.accent, '#38bdf8', '#ffffff']
              return (
                <div
                  key={theme.id}
                  className={`option-card ${isSelected ? 'selected' : ''}`}
                  onClick={() => setActiveTheme(theme.id)}
                >
                  <ThemeWireframePreview
                    bg={theme.bg}
                    card={palette[1] || '#1a1a20'}
                    brand={theme.accent}
                    text={palette[4] || '#fafafa'}
                    accent={palette[3] || theme.accent}
                    isSelected={isSelected}
                  />
                  <div className="flex items-center justify-between" style={{ marginBottom: 10 }}>
                    <div className="flex items-center gap-2">
                      <span
                        style={{
                          width: 14,
                          height: 14,
                          borderRadius: '50%',
                          background: theme.accent,
                          boxShadow: `0 0 10px ${theme.accent}`,
                        }}
                      />
                      <span className="font-semibold text-sm" style={{ color: isSelected ? 'var(--color-brand)' : 'var(--text-main)' }}>
                        {theme.name}
                      </span>
                    </div>
                    {isSelected ? (
                      <span
                        style={{
                          width: 18, height: 18, borderRadius: '50%',
                          background: 'var(--color-brand)',
                          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                          color: '#fff', flexShrink: 0
                        }}
                      >
                        <Check size={11} strokeWidth={3} />
                      </span>
                    ) : (
                      <span className="badge" style={{ fontSize: 10, textTransform: 'capitalize' }}>
                        {theme.category}
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-1.5" style={{ marginTop: 'auto', paddingTop: 6 }}>
                    {palette.map((color, i) => (
                      <span
                        key={i}
                        style={{
                          flex: 1,
                          height: 6,
                          borderRadius: 3,
                          background: color,
                          border: '1px solid rgba(255, 255, 255, 0.1)',
                        }}
                        title={color}
                      />
                    ))}
                  </div>
                </div>
              )
            })}

            {Object.entries(customThemes).map(([id, tokens]) => {
              const isSelected = activeTheme === id
              const meta = tokens._meta || {
                name: 'Custom Theme',
                bg: tokens['--rgb-base'] || '#09090b',
                card: tokens['--rgb-card'] || '#1a1a20',
                accent: tokens['--color-brand'] || '#3b82f6',
                text: tokens['--text-main'] || '#fafafa',
              }
              const palette = [
                meta.bg?.startsWith('#') ? meta.bg : '#09090b',
                meta.card?.startsWith('#') ? meta.card : '#1a1a20',
                meta.accent?.startsWith('#') ? meta.accent : '#3b82f6',
                meta.text?.startsWith('#') ? meta.text : '#fafafa',
              ]
              return (
                <div
                  key={id}
                  className={`option-card ${isSelected ? 'selected' : ''}`}
                  onClick={() => setActiveTheme(id)}
                >
                  <ThemeWireframePreview
                    bg={meta.bg}
                    card={meta.card}
                    brand={meta.accent}
                    text={meta.text}
                    accent={meta.accent}
                    isSelected={isSelected}
                  />
                  <div className="flex items-center justify-between" style={{ marginBottom: 10 }}>
                    <div className="flex items-center gap-2 min-w-0">
                      <span
                        style={{
                          width: 14,
                          height: 14,
                          borderRadius: '50%',
                          background: meta.accent,
                          boxShadow: `0 0 10px ${meta.accent}`,
                          flexShrink: 0,
                        }}
                      />
                      <span className="font-semibold text-sm truncate" style={{ color: isSelected ? 'var(--color-brand)' : 'var(--text-main)' }}>
                        {meta.name}
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5 flex-shrink-0" onClick={e => e.stopPropagation()}>
                      <button
                        type="button"
                        className="btn btn-ghost"
                        style={{ padding: '2px 6px', height: 22 }}
                        onClick={() => handleExportTheme(id, tokens, meta.name)}
                        title="Export this custom theme as JSON"
                      >
                        <Download size={11} />
                      </button>
                      <button
                        type="button"
                        className="btn btn-ghost"
                        style={{ padding: '2px 6px', height: 22, color: 'var(--color-rose)' }}
                        onClick={() => {
                          deleteCustomTheme(id)
                          if (activeTheme === id) setActiveTheme('sovereign-onyx')
                          showToast('success', `Deleted theme "${meta.name}"`)
                        }}
                        title="Delete custom theme"
                      >
                        <Trash2 size={11} />
                      </button>
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5" style={{ marginTop: 'auto', paddingTop: 6 }}>
                    {palette.map((color, i) => (
                      <span
                        key={i}
                        style={{
                          flex: 1,
                          height: 6,
                          borderRadius: 3,
                          background: color,
                          border: '1px solid rgba(255, 255, 255, 0.1)',
                        }}
                      />
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {/* Card 2: Instant Accent Override */}
      <div className="setting-card">
        <div className="setting-card-header">
          <div className="flex items-center gap-2.5">
            <Paintbrush size={16} style={{ color: 'var(--color-accent)' }} />
            <span className="text-sm font-semibold">Instant Accent Override</span>
          </div>
          {customAccentColor && (
            <button
              type="button"
              className="btn btn-ghost"
              style={{ fontSize: 11, padding: '3px 8px', height: 24 }}
              onClick={() => setCustomAccentColor(null)}
            >
              <RotateCcw size={11} /> Reset to Theme Default
            </button>
          )}
        </div>

        <div style={{ padding: '16px 18px' }}>
          <div className="text-xs text-muted" style={{ marginBottom: 14 }}>
            Override the primary accent and glowing highlight across all controls instantly without creating a full theme.
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 16 }}>
            {ACCENT_PRESETS.map(p => {
              const isSelected = customAccentColor?.toLowerCase() === p.hex.toLowerCase()
              return (
                <button
                  key={p.hex}
                  type="button"
                  onClick={() => setCustomAccentColor(p.hex)}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 7,
                    padding: '6px 12px',
                    borderRadius: 8,
                    background: isSelected
                      ? `color-mix(in srgb, ${p.hex} 18%, var(--bg-card))`
                      : 'var(--bg-card)',
                    border: `1px solid ${isSelected ? p.hex : 'var(--border-subtle)'}`,
                    cursor: 'pointer',
                    transition: 'all 0.15s ease',
                  }}
                >
                  <span
                    style={{
                      width: 12,
                      height: 12,
                      borderRadius: '50%',
                      background: p.hex,
                      boxShadow: isSelected ? `0 0 10px ${p.hex}` : 'none',
                    }}
                  />
                  <span style={{ fontSize: 12, fontWeight: isSelected ? 600 : 400, color: 'var(--text-main)' }}>
                    {p.label}
                  </span>
                </button>
              )
            })}
          </div>

          <div className="flex items-center gap-3">
            <span className="text-xs text-muted">Custom Hex:</span>
            <input
              type="color"
              value={customAccentColor || '#3b82f6'}
              onChange={e => setCustomAccentColor(e.target.value)}
              style={{ width: 32, height: 26, borderRadius: 6, border: '1px solid var(--border-main)', cursor: 'pointer', background: 'transparent' }}
            />
            <span className="font-mono text-xs text-muted">{customAccentColor || 'Theme Default'}</span>
          </div>
        </div>
      </div>

      {/* Theme Studio Editor (When Open) */}
      {showCustomStudio && (
        <div className="setting-card animate-fadeIn" style={{ borderColor: 'var(--color-brand)' }}>
          <div className="setting-card-header">
            <div className="flex items-center gap-2.5">
              <Paintbrush size={16} style={{ color: 'var(--color-brand)' }} />
              <span className="text-sm font-semibold">Custom Theme Studio</span>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                className={`btn ${isLivePreviewing ? 'btn-primary' : 'btn-ghost'}`}
                style={{ fontSize: 11, padding: '3px 10px', height: 26 }}
                onClick={handleToggleLivePreview}
              >
                <Eye size={12} /> {isLivePreviewing ? 'Live Preview: ON' : 'Live Preview: OFF'}
              </button>
            </div>
          </div>

          <div style={{ padding: '16px 18px' }}>
            <div style={{ marginBottom: 16 }}>
              <label className="text-xs font-semibold text-muted" style={{ display: 'block', marginBottom: 6 }}>
                Theme Display Name
              </label>
              <input
                type="text"
                className="input"
                value={customThemeName}
                onChange={e => setCustomThemeName(e.target.value)}
                style={{ width: '100%', maxWidth: 360 }}
              />
            </div>

            <div style={{ marginBottom: 16 }}>
              <div className="text-xs font-semibold uppercase tracking-wider text-muted" style={{ marginBottom: 8 }}>
                Starter Presets
              </div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {STARTER_PRESETS.map(sp => (
                  <button
                    key={sp.name}
                    type="button"
                    className="btn btn-ghost"
                    style={{ fontSize: 11.5, padding: '5px 12px', height: 'auto', display: 'flex', alignItems: 'center', gap: 6 }}
                    onClick={() => handleSelectPreset(sp)}
                  >
                    <span style={{ width: 10, height: 10, borderRadius: '50%', background: sp.tokens['--color-brand'] }} />
                    {sp.name}
                  </button>
                ))}
              </div>
            </div>

            <div className="text-xs font-semibold uppercase tracking-wider text-muted" style={{ marginBottom: 10 }}>
              Color Tokens ({isLivePreviewing ? 'Live Preview Active' : 'Draft Mode'})
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 12, marginBottom: 20 }}>
              {[
                { key: '--rgb-base', label: 'Background / Base', desc: 'Main window backdrop' },
                { key: '--rgb-card', label: 'Cards & Panels', desc: 'Content surface elevation' },
                { key: '--rgb-sidebar', label: 'Sidebar Rail', desc: 'Navigation background' },
                { key: '--color-brand', label: 'Primary Brand Accent', desc: 'Buttons, badges, focus' },
                { key: '--color-accent', label: 'Secondary Accent', desc: 'Highlights & glowing dots' },
                { key: '--text-main', label: 'Primary Text', desc: 'Headings and high-contrast text' },
                { key: '--text-muted', label: 'Muted Text', desc: 'Descriptions and captions' },
              ].map(({ key, label, desc }) => {
                const rawVal = customTokens[key] || '#ffffff'
                return (
                  <div
                    key={key}
                    style={{
                      background: 'color-mix(in srgb, var(--border-main) 25%, var(--bg-card))',
                      border: '1px solid var(--border-subtle)',
                      borderRadius: 8,
                      padding: '10px 12px',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 6,
                    }}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-medium" style={{ color: 'var(--text-main)' }}>{label}</span>
                      <span className="font-mono text-xs text-muted">{rawVal}</span>
                    </div>
                    <div className="flex items-center gap-3" style={{ marginTop: 2 }}>
                      <input
                        type="color"
                        value={rawVal}
                        onChange={e => handleTokenChange(key, e.target.value)}
                        style={{
                          width: 36,
                          height: 28,
                          padding: 0,
                          borderRadius: 6,
                          border: '1px solid var(--border-main)',
                          cursor: 'pointer',
                          background: 'transparent',
                        }}
                      />
                      <span className="text-xs text-muted" style={{ fontSize: 10.5 }}>{desc}</span>
                    </div>
                  </div>
                )
              })}
            </div>

            <div className="flex items-center justify-between" style={{ borderTop: '1px solid var(--border-subtle)', paddingTop: 14 }}>
              <button
                type="button"
                className="btn btn-ghost"
                style={{ fontSize: 12 }}
                onClick={handleCloseStudio}
              >
                <RotateCcw size={13} /> Cancel & Reset
              </button>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  className="btn btn-ghost"
                  style={{ fontSize: 12 }}
                  onClick={() => handleCopyThemeJson()}
                >
                  <Copy size={13} /> Copy JSON
                </button>
                <button
                  type="button"
                  className="btn btn-primary"
                  style={{ fontSize: 12, padding: '8px 20px' }}
                  onClick={handleSaveCustomTheme}
                >
                  <Save size={14} /> Save & Apply Custom Theme
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Card 3: Visual Ambience & Motion Dynamics */}
      <div className="setting-card">
        <div className="setting-card-header">
          <div className="flex items-center gap-2.5">
            <Sparkles size={16} style={{ color: 'var(--color-highlight)' }} />
            <span className="text-sm font-semibold">Visual Ambience & Dynamics</span>
          </div>
          <span className="badge font-mono" style={{ fontSize: 10 }}>Display Feel</span>
        </div>

        <SettingRow
          label="Accent Glow Ambience"
          desc="Controls the intensity of neon aura halos, specular glows, and brand shadows across UI controls"
        >
          <div className="segmented-control">
            {[
              { id: 'vivid', label: 'Vivid' },
              { id: 'balanced', label: 'Balanced' },
              { id: 'subtle', label: 'Subtle' },
              { id: 'off', label: 'Off' },
            ].map(opt => (
              <button
                key={opt.id}
                type="button"
                className={`segmented-item ${glowAmbience === opt.id ? 'active-brand' : ''}`}
                onClick={() => setGlowAmbience(opt.id)}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </SettingRow>

        <SettingRow
          label="Reduced Motion / Snappy UI"
          desc="Disables dynamic spring animations and layout transitions for instantaneous zero-latency responsiveness"
        >
          <label className="toggle">
            <input
              type="checkbox"
              checked={reducedMotion}
              onChange={toggleReducedMotion}
            />
            <div className="toggle-track" />
            <div className="toggle-thumb" />
          </label>
        </SettingRow>

        <SettingRow
          label="Interface Density"
          desc="Choose between spacious comfortable layout or compact high-density layout for controls, cards, and navigation"
        >
          <div className="segmented-control">
            <button
              type="button"
              className={`segmented-item ${uiDensity === 'comfortable' ? 'active-brand' : ''}`}
              onClick={() => setUiDensity('comfortable')}
            >
              Comfortable
            </button>
            <button
              type="button"
              className={`segmented-item ${uiDensity === 'compact' ? 'active-brand' : ''}`}
              onClick={() => setUiDensity('compact')}
            >
              Compact
            </button>
          </div>
        </SettingRow>
      </div>

      {/* Card 4: Media Thumbnail Presentation Modes */}
      <div className="setting-card">
        <div className="setting-card-header">
          <div className="flex items-center gap-2.5">
            <Eye size={16} style={{ color: 'var(--color-cyan)' }} />
            <span className="text-sm font-semibold">Thumbnail Presentation Modes</span>
          </div>
          <span className="badge badge-brand font-mono" style={{ fontSize: 10 }}>Memory Saver</span>
        </div>

        <div style={{ padding: '16px 18px' }}>
          <div className="text-xs text-muted" style={{ marginBottom: 16 }}>
            Control how wallpaper cards render previews across Home and Library screens. AetherFlow strictly limits hardware decoders to only visible cards.
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
            {[
              {
                id: 'hover',
                label: 'On Hover (Recommended)',
                tag: 'Ultra Fast',
                desc: 'Zero-RAM vector badges. Plays live video & animation previews only when hovering over a card.',
              },
              {
                id: 'always',
                label: 'Always On',
                tag: 'Media Previews',
                desc: 'Always displays full image and video poster frames. Utilizes viewport lazy loading.',
              },
              {
                id: 'off',
                label: 'Clean Minimal (Off)',
                tag: 'Zero Decoder',
                desc: 'Renders sleek vector badges only. Lowest possible CPU and GPU overhead.',
              },
            ].map(m => {
              const isSelected = thumbnailMode === m.id
              return (
                <div
                  key={m.id}
                  className={`option-card ${isSelected ? 'selected' : ''}`}
                  onClick={() => setThumbnailMode(m.id)}
                >
                  <div className="flex items-center justify-between" style={{ marginBottom: 8 }}>
                    <span className="font-semibold text-sm" style={{ color: isSelected ? 'var(--color-brand)' : 'var(--text-main)' }}>
                      {m.label}
                    </span>
                    {isSelected ? (
                      <span
                        style={{
                          width: 18, height: 18, borderRadius: '50%',
                          background: 'var(--color-brand)',
                          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                          color: '#fff', flexShrink: 0
                        }}
                      >
                        <Check size={11} strokeWidth={3} />
                      </span>
                    ) : (
                      <span className="badge" style={{ fontSize: 10 }}>{m.tag}</span>
                    )}
                  </div>
                  <div className="text-xs text-muted" style={{ lineHeight: 1.5 }}>
                    {m.desc}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}
