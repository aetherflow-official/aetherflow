import React from 'react'

/**
 * Aether Precision Settings Components
 * Architecture: Windows 11 Settings + Linear restraint + Aether dark precision.
 */

export function SettingSection({ title, action, children, style, className = '' }) {
  return (
    <section className={`settings-section ${className}`} style={style}>
      {title && (
        <div className="settings-section-header">
          <h2 className="settings-section-title">{title}</h2>
          {action && <div>{action}</div>}
        </div>
      )}
      <div className="settings-group">
        {children}
      </div>
    </section>
  )
}

export function SettingRow({ label, desc, children, style, onClick, className = '' }) {
  return (
    <div className={`settings-item-row ${className}`} style={style} onClick={onClick}>
      <div className="settings-item-info">
        <div className="settings-item-label">{label}</div>
        {desc && <div className="settings-item-desc">{desc}</div>}
      </div>
      {children && (
        <div className="settings-item-control">
          {children}
        </div>
      )}
    </div>
  )
}

export function SliderRow({ label, desc, value, set, min, max, step, fmt, presets, style }) {
  return (
    <div className="settings-slider-row" style={style}>
      <div className="settings-item-info">
        <div className="settings-item-label">{label}</div>
        {desc && <div className="settings-item-desc">{desc}</div>}
      </div>
      <div className="settings-slider-control">
        {presets && presets.length > 0 && (
          <div className="settings-slider-presets">
            {presets.map(p => (
              <button
                key={p.label}
                type="button"
                className={`aether-preset-btn ${value === p.val ? 'active' : ''}`}
                onClick={() => set(p.val)}
              >
                {p.label}
              </button>
            ))}
          </div>
        )}
        <input
          type="range"
          className="aether-slider"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={e => set(parseFloat(e.target.value))}
        />
        <span className="settings-slider-value">
          {fmt ? fmt(value) : value}
        </span>
      </div>
    </div>
  )
}

export function AetherToggle({ checked, onChange, ariaLabel, disabled }) {
  return (
    <label className="aether-toggle">
      <input
        type="checkbox"
        checked={checked}
        onChange={onChange}
        disabled={disabled}
        aria-label={ariaLabel}
      />
      <div className="aether-toggle-track" />
      <div className="aether-toggle-thumb" />
    </label>
  )
}

export function AetherSelect({ value, onChange, options, style, disabled }) {
  return (
    <select
      className="aether-select"
      value={value}
      onChange={onChange}
      style={style}
      disabled={disabled}
    >
      {options.map(opt => (
        <option key={opt.value} value={opt.value}>
          {opt.label}
        </option>
      ))}
    </select>
  )
}

export function AetherSegmented({ items, options, value, onChange, style }) {
  const list = items || options || []
  return (
    <div className="aether-segmented" style={style}>
      {list.map(item => {
        const itemVal = item.value !== undefined ? item.value : item.id
        const isActive = value === itemVal
        return (
          <button
            key={itemVal}
            type="button"
            className={`aether-segmented-btn ${isActive ? 'active-brand' : ''}`}
            onClick={() => onChange(itemVal)}
          >
            {item.label}
          </button>
        )
      })}
    </div>
  )
}
