import React from 'react'

export function SettingRow({ label, desc, children }) {
  return (
    <div className="setting-row">
      <div style={{ flex: 1, minWidth: 0, paddingRight: 16 }}>
        <div className="text-sm font-semibold" style={{ color: 'var(--text-main)' }}>{label}</div>
        {desc && <div className="text-xs text-muted" style={{ marginTop: 3, lineHeight: 1.45 }}>{desc}</div>}
      </div>
      <div style={{ flexShrink: 0 }}>
        {children}
      </div>
    </div>
  )
}

export function SliderRow({ label, desc, value, set, min, max, step, fmt, presets }) {
  return (
    <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--border-subtle)' }}>
      <div className="flex items-center justify-between" style={{ marginBottom: 6 }}>
        <div>
          <div className="text-sm font-semibold" style={{ color: 'var(--text-main)' }}>{label}</div>
          {desc && <div className="text-xs text-muted" style={{ marginTop: 2 }}>{desc}</div>}
        </div>
        <span className="telemetry-chip font-mono" style={{ color: 'var(--color-brand)' }}>
          {fmt ? fmt(value) : value}
        </span>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginTop: 10 }}>
        <input
          type="range"
          className="slider"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={e => set(parseFloat(e.target.value))}
        />
      </div>
      {presets && presets.length > 0 && (
        <div style={{ display: 'flex', gap: 6, marginTop: 10, flexWrap: 'wrap' }}>
          {presets.map(p => (
            <button
              key={p.label}
              type="button"
              className={`preset-btn ${value === p.val ? 'active' : ''}`}
              onClick={() => set(p.val)}
            >
              {p.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
