/**
 * communityEngines.js — 30 Curated Procedural Canvas 2D Wallpaper Engines
 * Strictly Canvas 2D, zero WebGL, lightweight 60 FPS loops with complete lifecycle cleanup.
 */

// Helper to init standard canvas dimensions
function setupCanvas(canvas) {
  const rect = canvas.getBoundingClientRect()
  const w = rect.width || canvas.offsetWidth || canvas.parentElement?.offsetWidth || window.innerWidth || 1920
  const h = rect.height || canvas.offsetHeight || canvas.parentElement?.offsetHeight || window.innerHeight || 1080
  canvas.width = Math.max(Math.round(w), 300)
  canvas.height = Math.max(Math.round(h), 200)
  return { width: canvas.width, height: canvas.height }
}

// ─── 1. STELLAR WARP (Space) ──────────────────────────────────────────────────
export function createStellarWarp(canvas, options = {}) {
  const { color = '#7dd3fc', speedMultiplier = 1 } = options
  const ctx = canvas.getContext('2d')
  let animId = null
  let stars = []
  const COUNT = 350

  function initStars() {
    stars = Array.from({ length: COUNT }, () => ({
      x: (Math.random() - 0.5) * canvas.width * 2,
      y: (Math.random() - 0.5) * canvas.height * 2,
      z: Math.random() * canvas.width,
      pz: 0,
    }))
  }

  function resize() {
    setupCanvas(canvas)
    initStars()
  }

  function frame() {
    const cx = canvas.width / 2
    const cy = canvas.height / 2
    ctx.fillStyle = 'rgba(5, 7, 15, 0.25)'
    ctx.fillRect(0, 0, canvas.width, canvas.height)

    const speed = 12 * (options.speedMultiplier ?? speedMultiplier)
    for (const s of stars) {
      s.pz = s.z
      s.z -= speed
      if (s.z <= 0) {
        s.x = (Math.random() - 0.5) * canvas.width * 2
        s.y = (Math.random() - 0.5) * canvas.height * 2
        s.z = canvas.width
        s.pz = s.z
      }
      const k = 250 / s.z
      const px = s.x * k + cx
      const py = s.y * k + cy
      const prevK = 250 / s.pz
      const prevX = s.x * prevK + cx
      const prevY = s.y * prevK + cy

      if (px >= 0 && px <= canvas.width && py >= 0 && py <= canvas.height) {
        const alpha = Math.min(1, (1 - s.z / canvas.width) * 1.5)
        ctx.strokeStyle = options.color || color
        ctx.globalAlpha = alpha
        ctx.lineWidth = Math.max(0.8, (1 - s.z / canvas.width) * 3)
        ctx.beginPath()
        ctx.moveTo(prevX, prevY)
        ctx.lineTo(px, py)
        ctx.stroke()
      }
    }
    ctx.globalAlpha = 1
    animId = requestAnimationFrame(frame)
  }

  function start() {
    resize()
    window.addEventListener('resize', resize)
    animId = requestAnimationFrame(frame)
  }

  function stop() {
    if (animId) cancelAnimationFrame(animId)
    window.removeEventListener('resize', resize)
  }

  function updateOptions(newOpts) {
    Object.assign(options, newOpts)
  }

  return { start, stop, updateOptions }
}

// ─── 2. BLACK HOLE LENS (Space) ───────────────────────────────────────────────
export function createBlackHoleLens(canvas, options = {}) {
  const { color = '#f97316', speedMultiplier = 1 } = options
  const ctx = canvas.getContext('2d')
  let animId = null
  let t = 0

  function resize() { setupCanvas(canvas) }

  function frame() {
    t += 0.02 * (options.speedMultiplier ?? speedMultiplier)
    const cx = canvas.width / 2
    const cy = canvas.height / 2
    const bhRadius = Math.min(canvas.width, canvas.height) * 0.16

    ctx.fillStyle = '#030308'
    ctx.fillRect(0, 0, canvas.width, canvas.height)

    // Outer swirling accretion disk
    for (let r = bhRadius * 2.8; r >= bhRadius * 0.9; r -= 4) {
      const angleOffset = Math.sin(t + r * 0.02) * 0.5
      ctx.save()
      ctx.translate(cx, cy)
      ctx.scale(1, 0.35)
      ctx.rotate(angleOffset + t * 0.2)
      ctx.beginPath()
      ctx.arc(0, 0, r, 0, Math.PI * 2)
      const grad = ctx.createLinearGradient(-r, 0, r, 0)
      grad.addColorStop(0, 'rgba(255, 100, 20, 0.03)')
      grad.addColorStop(0.3, options.color || color)
      grad.addColorStop(0.7, '#fef08a')
      grad.addColorStop(1, 'rgba(255, 60, 0, 0.02)')
      ctx.strokeStyle = grad
      ctx.lineWidth = 3
      ctx.stroke()
      ctx.restore()
    }

    // Glowing photon sphere ring
    ctx.save()
    ctx.beginPath()
    ctx.arc(cx, cy, bhRadius * 1.05, 0, Math.PI * 2)
    ctx.strokeStyle = '#ffffff'
    ctx.lineWidth = 3
    ctx.shadowColor = options.color || color
    ctx.shadowBlur = 30
    ctx.stroke()
    ctx.restore()

    // Pure black event horizon
    ctx.beginPath()
    ctx.arc(cx, cy, bhRadius, 0, Math.PI * 2)
    ctx.fillStyle = '#000000'
    ctx.fill()

    animId = requestAnimationFrame(frame)
  }

  function start() {
    resize()
    window.addEventListener('resize', resize)
    animId = requestAnimationFrame(frame)
  }

  function stop() {
    if (animId) cancelAnimationFrame(animId)
    window.removeEventListener('resize', resize)
  }

  function updateOptions(newOpts) { Object.assign(options, newOpts) }
  return { start, stop, updateOptions }
}

// ─── 3. SUPERNOVA BURST (Space) ───────────────────────────────────────────────
export function createSupernovaBurst(canvas, options = {}) {
  const { color = '#ec4899', speedMultiplier = 1 } = options
  const ctx = canvas.getContext('2d')
  let animId = null
  let shockRadius = 0
  let particles = []

  function initParticles() {
    particles = Array.from({ length: 180 }, () => {
      const angle = Math.random() * Math.PI * 2
      const spd = 0.8 + Math.random() * 3.5
      return {
        x: canvas.width / 2,
        y: canvas.height / 2,
        vx: Math.cos(angle) * spd,
        vy: Math.sin(angle) * spd,
        size: 1.5 + Math.random() * 3,
        alpha: 0.8 + Math.random() * 0.2,
      }
    })
  }

  function resize() {
    setupCanvas(canvas)
    shockRadius = 0
    initParticles()
  }

  function frame() {
    const cx = canvas.width / 2
    const cy = canvas.height / 2
    ctx.fillStyle = 'rgba(7, 3, 14, 0.15)'
    ctx.fillRect(0, 0, canvas.width, canvas.height)

    shockRadius += 1.8 * (options.speedMultiplier ?? speedMultiplier)
    if (shockRadius > Math.max(canvas.width, canvas.height) * 0.8) {
      shockRadius = 0
      initParticles()
    }

    // Shockwave Ring
    ctx.save()
    ctx.beginPath()
    ctx.arc(cx, cy, shockRadius, 0, Math.PI * 2)
    ctx.strokeStyle = options.color || color
    ctx.lineWidth = 4
    ctx.globalAlpha = Math.max(0, 1 - shockRadius / (canvas.width * 0.6))
    ctx.shadowColor = '#ffffff'
    ctx.shadowBlur = 20
    ctx.stroke()
    ctx.restore()

    // Dispersing particles
    for (const p of particles) {
      p.x += p.vx * (options.speedMultiplier ?? speedMultiplier)
      p.y += p.vy * (options.speedMultiplier ?? speedMultiplier)
      ctx.beginPath()
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2)
      ctx.fillStyle = options.color || color
      ctx.globalAlpha = p.alpha * Math.max(0, 1 - shockRadius / (canvas.width * 0.7))
      ctx.fill()
    }
    ctx.globalAlpha = 1
    animId = requestAnimationFrame(frame)
  }

  function start() {
    resize()
    window.addEventListener('resize', resize)
    animId = requestAnimationFrame(frame)
  }

  function stop() {
    if (animId) cancelAnimationFrame(animId)
    window.removeEventListener('resize', resize)
  }

  function updateOptions(newOpts) { Object.assign(options, newOpts) }
  return { start, stop, updateOptions }
}

// ─── 4. ORBITAL MECHANICS (Space) ─────────────────────────────────────────────
export function createOrbitalMechanics(canvas, options = {}) {
  const { color = '#38bdf8', speedMultiplier = 1 } = options
  const ctx = canvas.getContext('2d')
  let animId = null
  let t = 0
  const planets = [
    { r: 70, spd: 1.6, size: 5, col: '#f43f5e' },
    { r: 120, spd: 1.1, size: 7, col: '#fbbf24' },
    { r: 180, spd: 0.8, size: 9, col: '#38bdf8' },
    { r: 250, spd: 0.5, size: 14, col: '#a855f7' },
    { r: 330, spd: 0.3, size: 11, col: '#34d399' },
  ]

  function resize() { setupCanvas(canvas) }

  function frame() {
    t += 0.015 * (options.speedMultiplier ?? speedMultiplier)
    const cx = canvas.width / 2
    const cy = canvas.height / 2

    ctx.fillStyle = '#060913'
    ctx.fillRect(0, 0, canvas.width, canvas.height)

    // Central Sun
    ctx.save()
    ctx.beginPath()
    ctx.arc(cx, cy, 22, 0, Math.PI * 2)
    ctx.fillStyle = '#fde047'
    ctx.shadowColor = '#f59e0b'
    ctx.shadowBlur = 35
    ctx.fill()
    ctx.restore()

    // Orbits & Planets
    for (const p of planets) {
      ctx.beginPath()
      ctx.arc(cx, cy, p.r, 0, Math.PI * 2)
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.12)'
      ctx.lineWidth = 1
      ctx.stroke()

      const angle = t * p.spd
      const px = cx + Math.cos(angle) * p.r
      const py = cy + Math.sin(angle) * p.r

      ctx.save()
      ctx.beginPath()
      ctx.arc(px, py, p.size, 0, Math.PI * 2)
      ctx.fillStyle = p.col
      ctx.shadowColor = p.col
      ctx.shadowBlur = 15
      ctx.fill()
      ctx.restore()
    }

    animId = requestAnimationFrame(frame)
  }

  function start() {
    resize()
    window.addEventListener('resize', resize)
    animId = requestAnimationFrame(frame)
  }

  function stop() {
    if (animId) cancelAnimationFrame(animId)
    window.removeEventListener('resize', resize)
  }

  function updateOptions(newOpts) { Object.assign(options, newOpts) }
  return { start, stop, updateOptions }
}

// ─── 5. SOLAR FLARE (Space) ───────────────────────────────────────────────────
export function createSolarFlare(canvas, options = {}) {
  const { color = '#f97316', speedMultiplier = 1 } = options
  const ctx = canvas.getContext('2d')
  let animId = null
  let t = 0

  function resize() { setupCanvas(canvas) }

  function frame() {
    t += 0.03 * (options.speedMultiplier ?? speedMultiplier)
    const cx = canvas.width / 2
    const cy = canvas.height / 2
    const baseR = Math.min(canvas.width, canvas.height) * 0.22

    ctx.fillStyle = '#080302'
    ctx.fillRect(0, 0, canvas.width, canvas.height)

    // Pulsing corona flares
    for (let i = 0; i < 48; i++) {
      const angle = (i / 48) * Math.PI * 2
      const flareLen = Math.sin(angle * 6 + t) * Math.cos(angle * 3 - t * 0.5) * 60 + 50
      const x1 = cx + Math.cos(angle) * baseR
      const y1 = cy + Math.sin(angle) * baseR
      const x2 = cx + Math.cos(angle) * (baseR + flareLen)
      const y2 = cy + Math.sin(angle) * (baseR + flareLen)

      ctx.beginPath()
      ctx.moveTo(x1, y1)
      ctx.lineTo(x2, y2)
      ctx.strokeStyle = i % 2 === 0 ? '#fbbf24' : (options.color || color)
      ctx.lineWidth = 2.5
      ctx.globalAlpha = 0.5 + Math.sin(t + i) * 0.3
      ctx.stroke()
    }

    // Solar sphere
    ctx.save()
    ctx.beginPath()
    ctx.arc(cx, cy, baseR, 0, Math.PI * 2)
    const g = ctx.createRadialGradient(cx, cy, baseR * 0.2, cx, cy, baseR)
    g.addColorStop(0, '#fef08a')
    g.addColorStop(0.7, '#f97316')
    g.addColorStop(1, '#991b1b')
    ctx.fillStyle = g
    ctx.shadowColor = '#f97316'
    ctx.shadowBlur = 40
    ctx.fill()
    ctx.restore()

    ctx.globalAlpha = 1
    animId = requestAnimationFrame(frame)
  }

  function start() {
    resize()
    window.addEventListener('resize', resize)
    animId = requestAnimationFrame(frame)
  }

  function stop() {
    if (animId) cancelAnimationFrame(animId)
    window.removeEventListener('resize', resize)
  }

  function updateOptions(newOpts) { Object.assign(options, newOpts) }
  return { start, stop, updateOptions }
}

// ─── 6. CYBER HEX CIRCUIT (Cyberpunk) ─────────────────────────────────────────
export function createCyberHexCircuit(canvas, options = {}) {
  const { color = '#00f2fe', speedMultiplier = 1 } = options
  const ctx = canvas.getContext('2d')
  let animId = null
  let pulses = []
  const step = 60

  function initPulses() {
    pulses = Array.from({ length: 30 }, () => ({
      x: Math.floor(Math.random() * (canvas.width / step)) * step,
      y: Math.floor(Math.random() * (canvas.height / step)) * step,
      dir: Math.floor(Math.random() * 4), // 0:R, 1:D, 2:L, 3:U
      len: 20 + Math.random() * 40,
      spd: 2 + Math.random() * 3,
    }))
  }

  function resize() {
    setupCanvas(canvas)
    initPulses()
  }

  function frame() {
    ctx.fillStyle = 'rgba(7, 10, 20, 0.18)'
    ctx.fillRect(0, 0, canvas.width, canvas.height)

    // Draw background circuit grid lines
    ctx.strokeStyle = 'rgba(0, 242, 254, 0.05)'
    ctx.lineWidth = 1
    for (let x = 0; x < canvas.width; x += step) {
      ctx.beginPath()
      ctx.moveTo(x, 0)
      ctx.lineTo(x, canvas.height)
      ctx.stroke()
    }
    for (let y = 0; y < canvas.height; y += step) {
      ctx.beginPath()
      ctx.moveTo(0, y)
      ctx.lineTo(canvas.width, y)
      ctx.stroke()
    }

    // Racing electric data pulses
    ctx.strokeStyle = options.color || color
    ctx.lineWidth = 2.5
    ctx.shadowColor = options.color || color
    ctx.shadowBlur = 10

    for (const p of pulses) {
      const spd = p.spd * (options.speedMultiplier ?? speedMultiplier)
      if (p.dir === 0) p.x += spd
      else if (p.dir === 1) p.y += spd
      else if (p.dir === 2) p.x -= spd
      else p.y -= spd

      if (Math.random() < 0.04) p.dir = Math.floor(Math.random() * 4)

      if (p.x < 0) p.x = canvas.width
      if (p.x > canvas.width) p.x = 0
      if (p.y < 0) p.y = canvas.height
      if (p.y > canvas.height) p.y = 0

      ctx.beginPath()
      ctx.arc(p.x, p.y, 2.5, 0, Math.PI * 2)
      ctx.fillStyle = '#ffffff'
      ctx.fill()
    }
    ctx.shadowBlur = 0
    animId = requestAnimationFrame(frame)
  }

  function start() {
    resize()
    window.addEventListener('resize', resize)
    animId = requestAnimationFrame(frame)
  }

  function stop() {
    if (animId) cancelAnimationFrame(animId)
    window.removeEventListener('resize', resize)
  }

  function updateOptions(newOpts) { Object.assign(options, newOpts) }
  return { start, stop, updateOptions }
}

// ─── 7. NEON WIREFRAME TUNNEL (Cyberpunk) ─────────────────────────────────────
export function createNeonWireframeTunnel(canvas, options = {}) {
  const { color = '#ec4899', speedMultiplier = 1 } = options
  const ctx = canvas.getContext('2d')
  let animId = null
  let offset = 0

  function resize() { setupCanvas(canvas) }

  function frame() {
    offset += 0.015 * (options.speedMultiplier ?? speedMultiplier)
    const cx = canvas.width / 2
    const cy = canvas.height / 2
    const maxDim = Math.max(canvas.width, canvas.height)

    ctx.fillStyle = '#0a0515'
    ctx.fillRect(0, 0, canvas.width, canvas.height)

    ctx.strokeStyle = options.color || color
    ctx.lineWidth = 1.5

    // Radiating vanishing lines
    for (let a = 0; a < Math.PI * 2; a += Math.PI / 6) {
      ctx.beginPath()
      ctx.moveTo(cx, cy)
      ctx.lineTo(cx + Math.cos(a) * maxDim, cy + Math.sin(a) * maxDim)
      ctx.stroke()
    }

    // Zooming tunnel rings
    for (let i = 0; i < 18; i++) {
      const progress = ((i / 18) + offset) % 1
      const size = Math.pow(progress, 2.5) * maxDim
      const alpha = progress

      ctx.save()
      ctx.beginPath()
      ctx.rect(cx - size / 2, cy - size / 2, size, size)
      ctx.globalAlpha = alpha
      ctx.shadowColor = options.color || color
      ctx.shadowBlur = 12
      ctx.stroke()
      ctx.restore()
    }

    animId = requestAnimationFrame(frame)
  }

  function start() {
    resize()
    window.addEventListener('resize', resize)
    animId = requestAnimationFrame(frame)
  }

  function stop() {
    if (animId) cancelAnimationFrame(animId)
    window.removeEventListener('resize', resize)
  }

  function updateOptions(newOpts) { Object.assign(options, newOpts) }
  return { start, stop, updateOptions }
}

// ─── 8. QUANTUM ENTANGLEMENT (Cyberpunk) ──────────────────────────────────────
export function createQuantumEntanglement(canvas, options = {}) {
  const { color = '#06b6d4', speedMultiplier = 1 } = options
  const ctx = canvas.getContext('2d')
  let animId = null
  let nodes = []
  const COUNT = 32

  function initNodes() {
    nodes = Array.from({ length: COUNT }, () => ({
      x: Math.random() * canvas.width,
      y: Math.random() * canvas.height,
      vx: (Math.random() - 0.5) * 1.5,
      vy: (Math.random() - 0.5) * 1.5,
      phase: Math.random() * Math.PI * 2,
    }))
  }

  function resize() {
    setupCanvas(canvas)
    initNodes()
  }

  function frame() {
    ctx.fillStyle = 'rgba(5, 12, 20, 0.22)'
    ctx.fillRect(0, 0, canvas.width, canvas.height)

    const spd = (options.speedMultiplier ?? speedMultiplier)
    for (const n of nodes) {
      n.x += n.vx * spd
      n.y += n.vy * spd
      n.phase += 0.04 * spd

      if (n.x < 0 || n.x > canvas.width) n.vx *= -1
      if (n.y < 0 || n.y > canvas.height) n.vy *= -1
    }

    // Entanglement links
    ctx.lineWidth = 1.2
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const dx = nodes[i].x - nodes[j].x
        const dy = nodes[i].y - nodes[j].y
        const dist = Math.hypot(dx, dy)
        if (dist < 180) {
          const alpha = (1 - dist / 180) * (0.5 + Math.sin(nodes[i].phase) * 0.5)
          ctx.strokeStyle = options.color || color
          ctx.globalAlpha = alpha
          ctx.beginPath()
          ctx.moveTo(nodes[i].x, nodes[i].y)
          ctx.lineTo(nodes[j].x, nodes[j].y)
          ctx.stroke()
        }
      }
    }

    // Draw nodes
    for (const n of nodes) {
      ctx.beginPath()
      ctx.arc(n.x, n.y, 4, 0, Math.PI * 2)
      ctx.fillStyle = '#ffffff'
      ctx.globalAlpha = 0.9
      ctx.fill()
    }
    ctx.globalAlpha = 1

    animId = requestAnimationFrame(frame)
  }

  function start() {
    resize()
    window.addEventListener('resize', resize)
    animId = requestAnimationFrame(frame)
  }

  function stop() {
    if (animId) cancelAnimationFrame(animId)
    window.removeEventListener('resize', resize)
  }

  function updateOptions(newOpts) { Object.assign(options, newOpts) }
  return { start, stop, updateOptions }
}

// ─── 9. HOLOGRAPHIC CLOCK (Cyberpunk) ─────────────────────────────────────────
export function createHolographicClock(canvas, options = {}) {
  const { color = '#00ffcc', speedMultiplier = 1 } = options
  const ctx = canvas.getContext('2d')
  let animId = null
  let rot = 0

  function resize() { setupCanvas(canvas) }

  function frame() {
    rot += 0.01 * (options.speedMultiplier ?? speedMultiplier)
    const cx = canvas.width / 2
    const cy = canvas.height / 2
    const now = new Date()
    const hours = String(now.getHours()).padStart(2, '0')
    const mins = String(now.getMinutes()).padStart(2, '0')
    const secs = String(now.getSeconds()).padStart(2, '0')
    const ms = now.getMilliseconds()

    ctx.fillStyle = '#040b10'
    ctx.fillRect(0, 0, canvas.width, canvas.height)

    // Concentric HUD circles
    ctx.strokeStyle = options.color || color
    ctx.shadowColor = options.color || color
    ctx.shadowBlur = 10

    // Outer rotating ring with gaps
    ctx.save()
    ctx.translate(cx, cy)
    ctx.rotate(rot)
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.arc(0, 0, 180, 0, Math.PI * 1.6)
    ctx.stroke()

    ctx.beginPath()
    ctx.arc(0, 0, 200, Math.PI, Math.PI * 2.8)
    ctx.stroke()
    ctx.restore()

    // Inner second sweep
    const secAngle = ((now.getSeconds() + ms / 1000) / 60) * Math.PI * 2 - Math.PI / 2
    ctx.beginPath()
    ctx.arc(cx, cy, 140, -Math.PI / 2, secAngle)
    ctx.lineWidth = 4
    ctx.stroke()

    // Digital time text
    ctx.fillStyle = '#ffffff'
    ctx.font = 'bold 48px monospace'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(`${hours}:${mins}:${secs}`, cx, cy)

    ctx.font = '12px monospace'
    ctx.fillStyle = options.color || color
    ctx.fillText('AETHERFLOW // TELEMETRY CHRONO', cx, cy + 45)

    ctx.shadowBlur = 0
    animId = requestAnimationFrame(frame)
  }

  function start() {
    resize()
    window.addEventListener('resize', resize)
    animId = requestAnimationFrame(frame)
  }

  function stop() {
    if (animId) cancelAnimationFrame(animId)
    window.removeEventListener('resize', resize)
  }

  function updateOptions(newOpts) { Object.assign(options, newOpts) }
  return { start, stop, updateOptions }
}

// ─── 10. SONAR RADAR SWEEP (Cyberpunk) ────────────────────────────────────────
export function createSonarRadarSweep(canvas, options = {}) {
  const { color = '#22c55e', speedMultiplier = 1 } = options
  const ctx = canvas.getContext('2d')
  let animId = null
  let sweepAngle = 0
  const blips = [
    { r: 90, a: 1.2, alpha: 0 },
    { r: 160, a: 3.8, alpha: 0 },
    { r: 230, a: 5.1, alpha: 0 },
  ]

  function resize() { setupCanvas(canvas) }

  function frame() {
    sweepAngle += 0.03 * (options.speedMultiplier ?? speedMultiplier)
    if (sweepAngle > Math.PI * 2) sweepAngle -= Math.PI * 2

    const cx = canvas.width / 2
    const cy = canvas.height / 2
    const maxR = Math.min(canvas.width, canvas.height) * 0.42

    ctx.fillStyle = 'rgba(3, 15, 8, 0.15)'
    ctx.fillRect(0, 0, canvas.width, canvas.height)

    // Range rings
    ctx.strokeStyle = 'rgba(34, 197, 94, 0.25)'
    ctx.lineWidth = 1.5
    for (let r = 70; r <= maxR; r += 70) {
      ctx.beginPath()
      ctx.arc(cx, cy, r, 0, Math.PI * 2)
      ctx.stroke()
    }

    // Crosshairs
    ctx.beginPath()
    ctx.moveTo(cx - maxR, cy); ctx.lineTo(cx + maxR, cy)
    ctx.moveTo(cx, cy - maxR); ctx.lineTo(cx, cy + maxR)
    ctx.stroke()

    // Sweeping beam
    ctx.save()
    ctx.beginPath()
    ctx.moveTo(cx, cy)
    ctx.arc(cx, cy, maxR, sweepAngle - 0.35, sweepAngle)
    ctx.closePath()
    const grad = ctx.createRadialGradient(cx, cy, 10, cx, cy, maxR)
    grad.addColorStop(0, 'rgba(34, 197, 94, 0.4)')
    grad.addColorStop(1, 'rgba(34, 197, 94, 0.05)')
    ctx.fillStyle = grad
    ctx.fill()
    ctx.restore()

    // Radar blips
    for (const b of blips) {
      if (Math.abs(sweepAngle - b.a) < 0.08) b.alpha = 1
      b.alpha = Math.max(0, b.alpha - 0.008)
      if (b.alpha > 0) {
        const bx = cx + Math.cos(b.a) * b.r
        const by = cy + Math.sin(b.a) * b.r
        ctx.beginPath()
        ctx.arc(bx, by, 5, 0, Math.PI * 2)
        ctx.fillStyle = `rgba(255, 255, 255, ${b.alpha})`
        ctx.shadowColor = options.color || color
        ctx.shadowBlur = 10
        ctx.fill()
        ctx.shadowBlur = 0
      }
    }

    animId = requestAnimationFrame(frame)
  }

  function start() {
    resize()
    window.addEventListener('resize', resize)
    animId = requestAnimationFrame(frame)
  }

  function stop() {
    if (animId) cancelAnimationFrame(animId)
    window.removeEventListener('resize', resize)
  }

  function updateOptions(newOpts) { Object.assign(options, newOpts) }
  return { start, stop, updateOptions }
}

// ─── 11. NEURAL SYNAPSE (Cyberpunk) ───────────────────────────────────────────
export function createNeuralSynapse(canvas, options = {}) {
  const { color = '#a855f7', speedMultiplier = 1 } = options
  const ctx = canvas.getContext('2d')
  let animId = null
  let neurons = []
  const COUNT = 40

  function initNeurons() {
    neurons = Array.from({ length: COUNT }, () => ({
      x: Math.random() * canvas.width,
      y: Math.random() * canvas.height,
      vx: (Math.random() - 0.5) * 0.8,
      vy: (Math.random() - 0.5) * 0.8,
      fireTimer: Math.random() * 100,
    }))
  }

  function resize() {
    setupCanvas(canvas)
    initNeurons()
  }

  function frame() {
    ctx.fillStyle = 'rgba(10, 5, 20, 0.2)'
    ctx.fillRect(0, 0, canvas.width, canvas.height)

    const spd = options.speedMultiplier ?? speedMultiplier
    for (const n of neurons) {
      n.x += n.vx * spd
      n.y += n.vy * spd
      n.fireTimer += 1

      if (n.x < 0 || n.x > canvas.width) n.vx *= -1
      if (n.y < 0 || n.y > canvas.height) n.vy *= -1
    }

    // Axon synaptic connections
    for (let i = 0; i < neurons.length; i++) {
      for (let j = i + 1; j < neurons.length; j++) {
        const dist = Math.hypot(neurons[i].x - neurons[j].x, neurons[i].y - neurons[j].y)
        if (dist < 140) {
          const isFiring = (neurons[i].fireTimer % 60 < 10) || (neurons[j].fireTimer % 60 < 10)
          ctx.strokeStyle = isFiring ? '#ffffff' : (options.color || color)
          ctx.lineWidth = isFiring ? 2 : 0.8
          ctx.globalAlpha = isFiring ? 0.9 : 0.25
          ctx.beginPath()
          ctx.moveTo(neurons[i].x, neurons[i].y)
          ctx.lineTo(neurons[j].x, neurons[j].y)
          ctx.stroke()
        }
      }
    }

    for (const n of neurons) {
      ctx.beginPath()
      ctx.arc(n.x, n.y, 3.5, 0, Math.PI * 2)
      ctx.fillStyle = options.color || color
      ctx.globalAlpha = 0.8
      ctx.fill()
    }
    ctx.globalAlpha = 1
    animId = requestAnimationFrame(frame)
  }

  function start() {
    resize()
    window.addEventListener('resize', resize)
    animId = requestAnimationFrame(frame)
  }

  function stop() {
    if (animId) cancelAnimationFrame(animId)
    window.removeEventListener('resize', resize)
  }

  function updateOptions(newOpts) { Object.assign(options, newOpts) }
  return { start, stop, updateOptions }
}

// ─── 12. SAKURA FALL (Anime & Nature) ─────────────────────────────────────────
export function createSakuraFall(canvas, options = {}) {
  const { color = '#fbcfe8', speedMultiplier = 1 } = options
  const ctx = canvas.getContext('2d')
  let animId = null
  let petals = []
  const COUNT = 65

  function initPetals() {
    petals = Array.from({ length: COUNT }, () => ({
      x: Math.random() * canvas.width,
      y: Math.random() * canvas.height,
      vx: 1 + Math.random() * 1.5,
      vy: 1.2 + Math.random() * 2,
      rot: Math.random() * Math.PI * 2,
      vrot: (Math.random() - 0.5) * 0.05,
      size: 7 + Math.random() * 8,
    }))
  }

  function resize() {
    setupCanvas(canvas)
    initPetals()
  }

  function frame() {
    ctx.fillStyle = 'rgba(15, 8, 18, 0.2)'
    ctx.fillRect(0, 0, canvas.width, canvas.height)

    const spd = options.speedMultiplier ?? speedMultiplier
    for (const p of petals) {
      p.x += Math.sin(p.y * 0.01) * 1.2 + p.vx * spd
      p.y += p.vy * spd
      p.rot += p.vrot * spd

      if (p.y > canvas.height + 20) { p.y = -20; p.x = Math.random() * canvas.width }
      if (p.x > canvas.width + 20) p.x = -20

      ctx.save()
      ctx.translate(p.x, p.y)
      ctx.rotate(p.rot)
      ctx.beginPath()
      ctx.ellipse(0, 0, p.size, p.size * 0.45, 0, 0, Math.PI * 2)
      ctx.fillStyle = options.color || color
      ctx.globalAlpha = 0.75
      ctx.shadowColor = '#f472b6'
      ctx.shadowBlur = 8
      ctx.fill()
      ctx.restore()
    }
    ctx.globalAlpha = 1
    animId = requestAnimationFrame(frame)
  }

  function start() {
    resize()
    window.addEventListener('resize', resize)
    animId = requestAnimationFrame(frame)
  }

  function stop() {
    if (animId) cancelAnimationFrame(animId)
    window.removeEventListener('resize', resize)
  }

  function updateOptions(newOpts) { Object.assign(options, newOpts) }
  return { start, stop, updateOptions }
}

// ─── 13. AUTUMN LEAVES (Nature) ───────────────────────────────────────────────
export function createAutumnLeaves(canvas, options = {}) {
  const { color = '#f97316', speedMultiplier = 1 } = options
  const ctx = canvas.getContext('2d')
  let animId = null
  let leaves = []
  const palette = ['#ea580c', '#f97316', '#eab308', '#dc2626', '#b45309']

  function initLeaves() {
    leaves = Array.from({ length: 50 }, () => ({
      x: Math.random() * canvas.width,
      y: Math.random() * canvas.height,
      vx: 0.8 + Math.random() * 1.5,
      vy: 1.5 + Math.random() * 2.2,
      angle: Math.random() * Math.PI * 2,
      vangle: (Math.random() - 0.5) * 0.04,
      size: 10 + Math.random() * 10,
      col: palette[Math.floor(Math.random() * palette.length)],
    }))
  }

  function resize() {
    setupCanvas(canvas)
    initLeaves()
  }

  function frame() {
    ctx.fillStyle = 'rgba(18, 10, 6, 0.2)'
    ctx.fillRect(0, 0, canvas.width, canvas.height)

    const spd = options.speedMultiplier ?? speedMultiplier
    for (const l of leaves) {
      l.x += Math.sin(l.y * 0.015) * 2 + l.vx * spd
      l.y += l.vy * spd
      l.angle += l.vangle * spd

      if (l.y > canvas.height + 30) { l.y = -30; l.x = Math.random() * canvas.width }
      if (l.x > canvas.width + 30) l.x = -30

      ctx.save()
      ctx.translate(l.x, l.y)
      ctx.rotate(l.angle)
      ctx.beginPath()
      ctx.moveTo(0, -l.size)
      ctx.quadraticCurveTo(l.size * 0.8, 0, 0, l.size)
      ctx.quadraticCurveTo(-l.size * 0.8, 0, 0, -l.size)
      ctx.fillStyle = l.col
      ctx.globalAlpha = 0.85
      ctx.fill()
      ctx.restore()
    }
    ctx.globalAlpha = 1
    animId = requestAnimationFrame(frame)
  }

  function start() {
    resize()
    window.addEventListener('resize', resize)
    animId = requestAnimationFrame(frame)
  }

  function stop() {
    if (animId) cancelAnimationFrame(animId)
    window.removeEventListener('resize', resize)
  }

  function updateOptions(newOpts) { Object.assign(options, newOpts) }
  return { start, stop, updateOptions }
}

// ─── 14. FIREFLY FOREST (Nature) ──────────────────────────────────────────────
export function createFireflyForest(canvas, options = {}) {
  const { color = '#fef08a', speedMultiplier = 1 } = options
  const ctx = canvas.getContext('2d')
  let animId = null
  let fireflies = []

  function initFireflies() {
    fireflies = Array.from({ length: 70 }, () => ({
      x: Math.random() * canvas.width,
      y: Math.random() * canvas.height,
      vx: (Math.random() - 0.5) * 0.8,
      vy: (Math.random() - 0.5) * 0.8,
      pulse: Math.random() * Math.PI * 2,
      size: 2.5 + Math.random() * 3,
    }))
  }

  function resize() {
    setupCanvas(canvas)
    initFireflies()
  }

  function frame() {
    ctx.fillStyle = 'rgba(4, 12, 10, 0.2)'
    ctx.fillRect(0, 0, canvas.width, canvas.height)

    const spd = options.speedMultiplier ?? speedMultiplier
    for (const f of fireflies) {
      f.x += f.vx * spd
      f.y += f.vy * spd
      f.pulse += 0.05 * spd

      if (f.x < 0) f.x = canvas.width
      if (f.x > canvas.width) f.x = 0
      if (f.y < 0) f.y = canvas.height
      if (f.y > canvas.height) f.y = 0

      const alpha = Math.max(0.1, Math.sin(f.pulse))
      ctx.beginPath()
      ctx.arc(f.x, f.y, f.size, 0, Math.PI * 2)
      ctx.fillStyle = options.color || color
      ctx.globalAlpha = alpha
      ctx.shadowColor = '#84cc16'
      ctx.shadowBlur = 16
      ctx.fill()
      ctx.shadowBlur = 0
    }
    ctx.globalAlpha = 1
    animId = requestAnimationFrame(frame)
  }

  function start() {
    resize()
    window.addEventListener('resize', resize)
    animId = requestAnimationFrame(frame)
  }

  function stop() {
    if (animId) cancelAnimationFrame(animId)
    window.removeEventListener('resize', resize)
  }

  function updateOptions(newOpts) { Object.assign(options, newOpts) }
  return { start, stop, updateOptions }
}

// ─── 15. RAINY WINDOW (Nature & Lofi) ─────────────────────────────────────────
export function createRainyWindow(canvas, options = {}) {
  const { color = '#93c5fd', speedMultiplier = 1 } = options
  const ctx = canvas.getContext('2d')
  let animId = null
  let drops = []

  function initDrops() {
    drops = Array.from({ length: 80 }, () => ({
      x: Math.random() * canvas.width,
      y: Math.random() * canvas.height,
      len: 12 + Math.random() * 25,
      spd: 4 + Math.random() * 7,
      width: 1 + Math.random() * 1.5,
    }))
  }

  function resize() {
    setupCanvas(canvas)
    initDrops()
  }

  function frame() {
    ctx.fillStyle = 'rgba(10, 15, 25, 0.25)'
    ctx.fillRect(0, 0, canvas.width, canvas.height)

    // Street bokeh glow in background
    ctx.fillStyle = 'rgba(234, 179, 8, 0.08)'
    ctx.beginPath(); ctx.arc(canvas.width * 0.3, canvas.height * 0.6, 90, 0, Math.PI * 2); ctx.fill()
    ctx.fillStyle = 'rgba(239, 68, 68, 0.08)'
    ctx.beginPath(); ctx.arc(canvas.width * 0.7, canvas.height * 0.4, 120, 0, Math.PI * 2); ctx.fill()

    const spd = options.speedMultiplier ?? speedMultiplier
    ctx.strokeStyle = options.color || color
    for (const d of drops) {
      d.y += d.spd * spd
      if (d.y > canvas.height + d.len) {
        d.y = -d.len
        d.x = Math.random() * canvas.width
      }
      ctx.lineWidth = d.width
      ctx.beginPath()
      ctx.moveTo(d.x, d.y)
      ctx.lineTo(d.x, d.y + d.len)
      ctx.stroke()
    }
    animId = requestAnimationFrame(frame)
  }

  function start() {
    resize()
    window.addEventListener('resize', resize)
    animId = requestAnimationFrame(frame)
  }

  function stop() {
    if (animId) cancelAnimationFrame(animId)
    window.removeEventListener('resize', resize)
  }

  function updateOptions(newOpts) { Object.assign(options, newOpts) }
  return { start, stop, updateOptions }
}

// ─── 16. GENTLE SNOWFALL (Nature) ─────────────────────────────────────────────
export function createGentleSnowfall(canvas, options = {}) {
  const { color = '#ffffff', speedMultiplier = 1 } = options
  const ctx = canvas.getContext('2d')
  let animId = null
  let flakes = []
  const COUNT = 120

  function initFlakes() {
    flakes = Array.from({ length: COUNT }, () => ({
      x: Math.random() * canvas.width,
      y: Math.random() * canvas.height,
      r: 1 + Math.random() * 3.5,
      spd: 0.8 + Math.random() * 1.8,
      wobble: Math.random() * Math.PI * 2,
    }))
  }

  function resize() {
    setupCanvas(canvas)
    initFlakes()
  }

  function frame() {
    ctx.fillStyle = 'rgba(8, 12, 22, 0.2)'
    ctx.fillRect(0, 0, canvas.width, canvas.height)

    const spd = options.speedMultiplier ?? speedMultiplier
    ctx.fillStyle = options.color || color
    for (const f of flakes) {
      f.wobble += 0.02 * spd
      f.x += Math.sin(f.wobble) * 0.8
      f.y += f.spd * spd

      if (f.y > canvas.height + 5) {
        f.y = -5
        f.x = Math.random() * canvas.width
      }
      ctx.beginPath()
      ctx.arc(f.x, f.y, f.r, 0, Math.PI * 2)
      ctx.globalAlpha = f.r > 2.5 ? 0.9 : 0.5
      ctx.fill()
    }
    ctx.globalAlpha = 1
    animId = requestAnimationFrame(frame)
  }

  function start() {
    resize()
    window.addEventListener('resize', resize)
    animId = requestAnimationFrame(frame)
  }

  function stop() {
    if (animId) cancelAnimationFrame(animId)
    window.removeEventListener('resize', resize)
  }

  function updateOptions(newOpts) { Object.assign(options, newOpts) }
  return { start, stop, updateOptions }
}

// ─── 17. OCEAN WAVES (Nature) ─────────────────────────────────────────────────
export function createOceanWaves(canvas, options = {}) {
  const { color = '#0284c7', speedMultiplier = 1 } = options
  const ctx = canvas.getContext('2d')
  let animId = null
  let t = 0

  function resize() { setupCanvas(canvas) }

  function frame() {
    t += 0.025 * (options.speedMultiplier ?? speedMultiplier)
    ctx.fillStyle = '#03101d'
    ctx.fillRect(0, 0, canvas.width, canvas.height)

    const layers = [
      { yOffset: 0.65, amp: 22, freq: 0.008, speed: 1.0, col: 'rgba(2, 132, 199, 0.4)' },
      { yOffset: 0.72, amp: 28, freq: 0.006, speed: 1.3, col: 'rgba(14, 165, 233, 0.5)' },
      { yOffset: 0.80, amp: 35, freq: 0.005, speed: 1.6, col: 'rgba(56, 189, 248, 0.6)' },
      { yOffset: 0.88, amp: 40, freq: 0.004, speed: 1.9, col: 'rgba(125, 211, 252, 0.7)' },
    ]

    for (const l of layers) {
      ctx.beginPath()
      ctx.moveTo(0, canvas.height)
      const baseH = canvas.height * l.yOffset
      for (let x = 0; x <= canvas.width; x += 10) {
        const y = baseH + Math.sin(x * l.freq + t * l.speed) * l.amp + Math.cos(x * 0.015 - t * 0.5) * 8
        ctx.lineTo(x, y)
      }
      ctx.lineTo(canvas.width, canvas.height)
      ctx.closePath()
      ctx.fillStyle = l.col
      ctx.fill()
    }

    animId = requestAnimationFrame(frame)
  }

  function start() {
    resize()
    window.addEventListener('resize', resize)
    animId = requestAnimationFrame(frame)
  }

  function stop() {
    if (animId) cancelAnimationFrame(animId)
    window.removeEventListener('resize', resize)
  }

  function updateOptions(newOpts) { Object.assign(options, newOpts) }
  return { start, stop, updateOptions }
}

// ─── 18. THUNDERSTORM LIGHTNING (Nature) ──────────────────────────────────────
export function createThunderstormLightning(canvas, options = {}) {
  const { color = '#38bdf8', speedMultiplier = 1 } = options
  const ctx = canvas.getContext('2d')
  let animId = null
  let flash = 0

  function resize() { setupCanvas(canvas) }

  function frame() {
    if (Math.random() < 0.015 * (options.speedMultiplier ?? speedMultiplier)) {
      flash = 0.8 + Math.random() * 0.2
    }
    flash = Math.max(0, flash - 0.06)

    ctx.fillStyle = flash > 0.4 ? `rgba(224, 242, 254, ${flash * 0.6})` : '#070b14'
    ctx.fillRect(0, 0, canvas.width, canvas.height)

    // Lightning bolt
    if (flash > 0.3) {
      ctx.strokeStyle = '#ffffff'
      ctx.lineWidth = 2.5
      ctx.shadowColor = options.color || color
      ctx.shadowBlur = 25
      ctx.beginPath()
      let lx = canvas.width * (0.3 + Math.random() * 0.4)
      let ly = 0
      ctx.moveTo(lx, ly)
      while (ly < canvas.height * 0.8) {
        lx += (Math.random() - 0.5) * 40
        ly += 20 + Math.random() * 30
        ctx.lineTo(lx, ly)
      }
      ctx.stroke()
      ctx.shadowBlur = 0
    }

    animId = requestAnimationFrame(frame)
  }

  function start() {
    resize()
    window.addEventListener('resize', resize)
    animId = requestAnimationFrame(frame)
  }

  function stop() {
    if (animId) cancelAnimationFrame(animId)
    window.removeEventListener('resize', resize)
  }

  function updateOptions(newOpts) { Object.assign(options, newOpts) }
  return { start, stop, updateOptions }
}

// ─── 19. HYPNOTIC SPIRAL (Abstract) ───────────────────────────────────────────
export function createHypnoticSpiral(canvas, options = {}) {
  const { color = '#8b5cf6', speedMultiplier = 1 } = options
  const ctx = canvas.getContext('2d')
  let animId = null
  let angleOffset = 0

  function resize() { setupCanvas(canvas) }

  function frame() {
    angleOffset += 0.04 * (options.speedMultiplier ?? speedMultiplier)
    const cx = canvas.width / 2
    const cy = canvas.height / 2

    ctx.fillStyle = '#0a0515'
    ctx.fillRect(0, 0, canvas.width, canvas.height)

    ctx.lineWidth = 2.5
    ctx.strokeStyle = options.color || color

    for (let arm = 0; arm < 4; arm++) {
      ctx.beginPath()
      const startAngle = (arm * Math.PI) / 2 + angleOffset
      for (let r = 0; r < Math.min(canvas.width, canvas.height) * 0.5; r += 2) {
        const theta = startAngle + r * 0.05
        const x = cx + Math.cos(theta) * r
        const y = cy + Math.sin(theta) * r
        if (r === 0) ctx.moveTo(x, y)
        else ctx.lineTo(x, y)
      }
      ctx.stroke()
    }
    animId = requestAnimationFrame(frame)
  }

  function start() {
    resize()
    window.addEventListener('resize', resize)
    animId = requestAnimationFrame(frame)
  }

  function stop() {
    if (animId) cancelAnimationFrame(animId)
    window.removeEventListener('resize', resize)
  }

  function updateOptions(newOpts) { Object.assign(options, newOpts) }
  return { start, stop, updateOptions }
}

// ─── 20. VORONOI CELLS (Abstract) ─────────────────────────────────────────────
export function createVoronoiCells(canvas, options = {}) {
  const { color = '#06b6d4', speedMultiplier = 1 } = options
  const ctx = canvas.getContext('2d')
  let animId = null
  let points = []
  const COUNT = 24

  function initPoints() {
    points = Array.from({ length: COUNT }, () => ({
      x: Math.random() * canvas.width,
      y: Math.random() * canvas.height,
      vx: (Math.random() - 0.5) * 1.2,
      vy: (Math.random() - 0.5) * 1.2,
      r: 15 + Math.random() * 25,
    }))
  }

  function resize() {
    setupCanvas(canvas)
    initPoints()
  }

  function frame() {
    ctx.fillStyle = 'rgba(6, 12, 18, 0.25)'
    ctx.fillRect(0, 0, canvas.width, canvas.height)

    const spd = options.speedMultiplier ?? speedMultiplier
    for (const p of points) {
      p.x += p.vx * spd
      p.y += p.vy * spd
      if (p.x < 0 || p.x > canvas.width) p.vx *= -1
      if (p.y < 0 || p.y > canvas.height) p.vy *= -1
    }

    // Connect Voronoi neighbors
    ctx.strokeStyle = options.color || color
    ctx.lineWidth = 1.2
    for (let i = 0; i < points.length; i++) {
      for (let j = i + 1; j < points.length; j++) {
        const d = Math.hypot(points[i].x - points[j].x, points[i].y - points[j].y)
        if (d < 220) {
          ctx.globalAlpha = 1 - d / 220
          ctx.beginPath()
          ctx.moveTo(points[i].x, points[i].y)
          ctx.lineTo(points[j].x, points[j].y)
          ctx.stroke()
        }
      }
    }

    ctx.globalAlpha = 1
    animId = requestAnimationFrame(frame)
  }

  function start() {
    resize()
    window.addEventListener('resize', resize)
    animId = requestAnimationFrame(frame)
  }

  function stop() {
    if (animId) cancelAnimationFrame(animId)
    window.removeEventListener('resize', resize)
  }

  function updateOptions(newOpts) { Object.assign(options, newOpts) }
  return { start, stop, updateOptions }
}

// ─── 21. PLASMA WAVES (Abstract) ──────────────────────────────────────────────
export function createPlasmaWaves(canvas, options = {}) {
  const { color = '#ec4899', speedMultiplier = 1 } = options
  const ctx = canvas.getContext('2d')
  let animId = null
  let t = 0

  function resize() { setupCanvas(canvas) }

  function frame() {
    t += 0.03 * (options.speedMultiplier ?? speedMultiplier)
    const cx = canvas.width / 2
    const cy = canvas.height / 2

    ctx.fillStyle = 'rgba(10, 4, 18, 0.2)'
    ctx.fillRect(0, 0, canvas.width, canvas.height)

    for (let i = 0; i < 6; i++) {
      ctx.beginPath()
      const radius = 60 + i * 40
      ctx.arc(
        cx + Math.sin(t + i) * 60,
        cy + Math.cos(t * 0.8 + i) * 40,
        radius,
        0,
        Math.PI * 2
      )
      ctx.strokeStyle = i % 2 === 0 ? (options.color || color) : '#38bdf8'
      ctx.lineWidth = 3
      ctx.globalAlpha = 0.45
      ctx.shadowColor = options.color || color
      ctx.shadowBlur = 20
      ctx.stroke()
    }
    ctx.shadowBlur = 0
    ctx.globalAlpha = 1
    animId = requestAnimationFrame(frame)
  }

  function start() {
    resize()
    window.addEventListener('resize', resize)
    animId = requestAnimationFrame(frame)
  }

  function stop() {
    if (animId) cancelAnimationFrame(animId)
    window.removeEventListener('resize', resize)
  }

  function updateOptions(newOpts) { Object.assign(options, newOpts) }
  return { start, stop, updateOptions }
}

// ─── 22. FLOW FIELD (Abstract) ────────────────────────────────────────────────
export function createFlowField(canvas, options = {}) {
  const { color = '#38bdf8', speedMultiplier = 1 } = options
  const ctx = canvas.getContext('2d')
  let animId = null
  let particles = []
  const COUNT = 160

  function initParticles() {
    particles = Array.from({ length: COUNT }, () => ({
      x: Math.random() * canvas.width,
      y: Math.random() * canvas.height,
      vx: 0,
      vy: 0,
    }))
  }

  function resize() {
    setupCanvas(canvas)
    initParticles()
  }

  function frame() {
    ctx.fillStyle = 'rgba(5, 10, 20, 0.12)'
    ctx.fillRect(0, 0, canvas.width, canvas.height)

    const spd = 2.5 * (options.speedMultiplier ?? speedMultiplier)
    ctx.strokeStyle = options.color || color
    ctx.lineWidth = 1.2
    ctx.globalAlpha = 0.65

    for (const p of particles) {
      const angle = Math.sin(p.x * 0.005) + Math.cos(p.y * 0.005)
      p.vx = Math.cos(angle) * spd
      p.vy = Math.sin(angle) * spd
      const px = p.x
      const py = p.y
      p.x += p.vx
      p.y += p.vy

      ctx.beginPath()
      ctx.moveTo(px, py)
      ctx.lineTo(p.x, p.y)
      ctx.stroke()

      if (p.x < 0 || p.x > canvas.width || p.y < 0 || p.y > canvas.height) {
        p.x = Math.random() * canvas.width
        p.y = Math.random() * canvas.height
      }
    }
    ctx.globalAlpha = 1
    animId = requestAnimationFrame(frame)
  }

  function start() {
    resize()
    window.addEventListener('resize', resize)
    animId = requestAnimationFrame(frame)
  }

  function stop() {
    if (animId) cancelAnimationFrame(animId)
    window.removeEventListener('resize', resize)
  }

  function updateOptions(newOpts) { Object.assign(options, newOpts) }
  return { start, stop, updateOptions }
}

// ─── 23. LISSAJOUS KNOTS (Abstract) ───────────────────────────────────────────
export function createLissajousKnots(canvas, options = {}) {
  const { color = '#f59e0b', speedMultiplier = 1 } = options
  const ctx = canvas.getContext('2d')
  let animId = null
  let t = 0

  function resize() { setupCanvas(canvas) }

  function frame() {
    t += 0.02 * (options.speedMultiplier ?? speedMultiplier)
    const cx = canvas.width / 2
    const cy = canvas.height / 2
    const scale = Math.min(canvas.width, canvas.height) * 0.38

    ctx.fillStyle = 'rgba(12, 8, 4, 0.2)'
    ctx.fillRect(0, 0, canvas.width, canvas.height)

    ctx.strokeStyle = options.color || color
    ctx.lineWidth = 2
    ctx.beginPath()

    for (let theta = 0; theta < Math.PI * 4; theta += 0.05) {
      const x = cx + Math.sin(theta * 3 + t) * scale
      const y = cy + Math.sin(theta * 2) * scale
      if (theta === 0) ctx.moveTo(x, y)
      else ctx.lineTo(x, y)
    }
    ctx.stroke()

    animId = requestAnimationFrame(frame)
  }

  function start() {
    resize()
    window.addEventListener('resize', resize)
    animId = requestAnimationFrame(frame)
  }

  function stop() {
    if (animId) cancelAnimationFrame(animId)
    window.removeEventListener('resize', resize)
  }

  function updateOptions(newOpts) { Object.assign(options, newOpts) }
  return { start, stop, updateOptions }
}

// ─── 24. CHLADNI RESONANCE (Abstract) ─────────────────────────────────────────
export function createChladniResonance(canvas, options = {}) {
  const { color = '#10b981', speedMultiplier = 1 } = options
  const ctx = canvas.getContext('2d')
  let animId = null
  let grains = []
  const COUNT = 180

  function initGrains() {
    grains = Array.from({ length: COUNT }, () => ({
      x: (Math.random() - 0.5) * 2,
      y: (Math.random() - 0.5) * 2,
    }))
  }

  function resize() {
    setupCanvas(canvas)
    initGrains()
  }

  function frame() {
    const cx = canvas.width / 2
    const cy = canvas.height / 2
    const scale = Math.min(canvas.width, canvas.height) * 0.4

    ctx.fillStyle = 'rgba(4, 18, 12, 0.2)'
    ctx.fillRect(0, 0, canvas.width, canvas.height)

    ctx.fillStyle = options.color || color
    for (const g of grains) {
      // Chladni modal drift
      const targetX = Math.sin(g.y * 3) * 0.8
      g.x += (targetX - g.x) * 0.05
      const px = cx + g.x * scale
      const py = cy + g.y * scale

      ctx.beginPath()
      ctx.arc(px, py, 2.5, 0, Math.PI * 2)
      ctx.fill()
    }

    animId = requestAnimationFrame(frame)
  }

  function start() {
    resize()
    window.addEventListener('resize', resize)
    animId = requestAnimationFrame(frame)
  }

  function stop() {
    if (animId) cancelAnimationFrame(animId)
    window.removeEventListener('resize', resize)
  }

  function updateOptions(newOpts) { Object.assign(options, newOpts) }
  return { start, stop, updateOptions }
}

// ─── 25. CASSETTE TAPE (Retro & Chill) ────────────────────────────────────────
export function createCassetteTape(canvas, options = {}) {
  const { color = '#f43f5e', speedMultiplier = 1 } = options
  const ctx = canvas.getContext('2d')
  let animId = null
  let rot = 0

  function resize() { setupCanvas(canvas) }

  function frame() {
    rot += 0.05 * (options.speedMultiplier ?? speedMultiplier)
    const cx = canvas.width / 2
    const cy = canvas.height / 2

    ctx.fillStyle = '#0f0512'
    ctx.fillRect(0, 0, canvas.width, canvas.height)

    // Cassette outline
    ctx.strokeStyle = options.color || color
    ctx.lineWidth = 3
    ctx.strokeRect(cx - 160, cy - 100, 320, 200)

    // Two spools
    const spools = [cx - 70, cx + 70]
    for (const sx of spools) {
      ctx.beginPath()
      ctx.arc(sx, cy, 35, 0, Math.PI * 2)
      ctx.stroke()

      // Spinning teeth
      for (let a = 0; a < 6; a++) {
        const theta = rot + (a * Math.PI) / 3
        ctx.beginPath()
        ctx.moveTo(sx, cy)
        ctx.lineTo(sx + Math.cos(theta) * 35, cy + Math.sin(theta) * 35)
        ctx.stroke()
      }
    }

    // Magnetic tape window
    ctx.strokeRect(cx - 110, cy - 30, 220, 60)

    animId = requestAnimationFrame(frame)
  }

  function start() {
    resize()
    window.addEventListener('resize', resize)
    animId = requestAnimationFrame(frame)
  }

  function stop() {
    if (animId) cancelAnimationFrame(animId)
    window.removeEventListener('resize', resize)
  }

  function updateOptions(newOpts) { Object.assign(options, newOpts) }
  return { start, stop, updateOptions }
}

// ─── 26. ISOMETRIC CITY (Retro & City) ────────────────────────────────────────
export function createIsometricCity(canvas, options = {}) {
  const { color = '#38bdf8', speedMultiplier = 1 } = options
  const ctx = canvas.getContext('2d')
  let animId = null
  let t = 0

  function resize() { setupCanvas(canvas) }

  function frame() {
    t += 0.02 * (options.speedMultiplier ?? speedMultiplier)
    const cx = canvas.width / 2
    const cy = canvas.height * 0.7

    ctx.fillStyle = '#060914'
    ctx.fillRect(0, 0, canvas.width, canvas.height)

    ctx.strokeStyle = options.color || color
    ctx.lineWidth = 1.5

    // Draw 3x3 isometric building blocks
    for (let row = -2; row <= 2; row++) {
      for (let col = -2; col <= 2; col++) {
        const x = cx + (col - row) * 50
        const y = cy + (col + row) * 25
        const h = 50 + Math.sin(t + col + row) * 30

        ctx.beginPath()
        ctx.moveTo(x, y)
        ctx.lineTo(x, y - h)
        ctx.lineTo(x + 40, y - h - 20)
        ctx.lineTo(x + 40, y - 20)
        ctx.closePath()
        ctx.stroke()
      }
    }

    animId = requestAnimationFrame(frame)
  }

  function start() {
    resize()
    window.addEventListener('resize', resize)
    animId = requestAnimationFrame(frame)
  }

  function stop() {
    if (animId) cancelAnimationFrame(animId)
    window.removeEventListener('resize', resize)
  }

  function updateOptions(newOpts) { Object.assign(options, newOpts) }
  return { start, stop, updateOptions }
}

// ─── 27. NEON EQUALIZER (Retro & Audio) ───────────────────────────────────────
export function createNeonEqualizer(canvas, options = {}) {
  const { color = '#00f2fe', speedMultiplier = 1 } = options
  const ctx = canvas.getContext('2d')
  let animId = null
  let t = 0

  function resize() { setupCanvas(canvas) }

  function frame() {
    t += 0.05 * (options.speedMultiplier ?? speedMultiplier)
    const cx = canvas.width / 2
    const cy = canvas.height / 2
    const BARS = 48

    ctx.fillStyle = '#050711'
    ctx.fillRect(0, 0, canvas.width, canvas.height)

    ctx.lineWidth = 3
    ctx.strokeStyle = options.color || color
    ctx.shadowColor = options.color || color
    ctx.shadowBlur = 12

    for (let i = 0; i < BARS; i++) {
      const angle = (i / BARS) * Math.PI * 2
      const barH = 20 + Math.abs(Math.sin(t + i * 0.3) * Math.cos(t * 0.7 + i * 0.2)) * 80
      const r1 = 80
      const r2 = r1 + barH

      ctx.beginPath()
      ctx.moveTo(cx + Math.cos(angle) * r1, cy + Math.sin(angle) * r1)
      ctx.lineTo(cx + Math.cos(angle) * r2, cy + Math.sin(angle) * r2)
      ctx.stroke()
    }
    ctx.shadowBlur = 0

    animId = requestAnimationFrame(frame)
  }

  function start() {
    resize()
    window.addEventListener('resize', resize)
    animId = requestAnimationFrame(frame)
  }

  function stop() {
    if (animId) cancelAnimationFrame(animId)
    window.removeEventListener('resize', resize)
  }

  function updateOptions(newOpts) { Object.assign(options, newOpts) }
  return { start, stop, updateOptions }
}

// ─── 28. PIXEL STAR NIGHT (Retro & Gaming) ────────────────────────────────────
export function createPixelStarNight(canvas, options = {}) {
  const { color = '#fef08a', speedMultiplier = 1 } = options
  const ctx = canvas.getContext('2d')
  let animId = null
  let stars = []

  function initStars() {
    stars = Array.from({ length: 60 }, () => ({
      x: Math.floor((Math.random() * canvas.width) / 6) * 6,
      y: Math.floor((Math.random() * canvas.height) / 6) * 6,
      blink: Math.random() * 10,
    }))
  }

  function resize() {
    setupCanvas(canvas)
    initStars()
  }

  function frame() {
    ctx.fillStyle = '#040714'
    ctx.fillRect(0, 0, canvas.width, canvas.height)

    // Pixel Moon
    ctx.fillStyle = '#fef08a'
    const mx = canvas.width * 0.8
    const my = 80
    ctx.fillRect(mx, my, 48, 48)
    ctx.fillStyle = '#040714'
    ctx.fillRect(mx + 12, my - 6, 48, 48) // crescent shadow

    // 8-bit blocky stars
    ctx.fillStyle = options.color || color
    for (const s of stars) {
      s.blink += 0.05 * (options.speedMultiplier ?? speedMultiplier)
      if (Math.sin(s.blink) > 0) {
        ctx.fillRect(s.x, s.y, 6, 6)
      }
    }

    animId = requestAnimationFrame(frame)
  }

  function start() {
    resize()
    window.addEventListener('resize', resize)
    animId = requestAnimationFrame(frame)
  }

  function stop() {
    if (animId) cancelAnimationFrame(animId)
    window.removeEventListener('resize', resize)
  }

  function updateOptions(newOpts) { Object.assign(options, newOpts) }
  return { start, stop, updateOptions }
}

// ─── 29. MATRIX HEX CODE (Cyberpunk & Minimal) ────────────────────────────────
export function createMatrixHexCode(canvas, options = {}) {
  const { color = '#00ff66', speedMultiplier = 1 } = options
  const ctx = canvas.getContext('2d')
  let animId = null
  let columns = []
  const fontSize = 13
  const hexChars = '0123456789ABCDEF'

  function initCols() {
    const count = Math.floor(canvas.width / (fontSize * 2.2))
    columns = Array.from({ length: count }, () => Math.random() * -50)
  }

  function resize() {
    setupCanvas(canvas)
    initCols()
  }

  function frame() {
    ctx.fillStyle = 'rgba(4, 10, 5, 0.18)'
    ctx.fillRect(0, 0, canvas.width, canvas.height)

    ctx.font = `bold ${fontSize}px monospace`
    ctx.fillStyle = options.color || color

    const spd = options.speedMultiplier ?? speedMultiplier
    for (let i = 0; i < columns.length; i++) {
      const char = hexChars[Math.floor(Math.random() * hexChars.length)] + hexChars[Math.floor(Math.random() * hexChars.length)]
      const x = i * fontSize * 2.2
      const y = columns[i] * fontSize

      ctx.fillText(char, x, y)

      if (y > canvas.height && Math.random() > 0.975) {
        columns[i] = 0
      }
      columns[i] += spd
    }

    animId = requestAnimationFrame(frame)
  }

  function start() {
    resize()
    window.addEventListener('resize', resize)
    animId = requestAnimationFrame(frame)
  }

  function stop() {
    if (animId) cancelAnimationFrame(animId)
    window.removeEventListener('resize', resize)
  }

  function updateOptions(newOpts) { Object.assign(options, newOpts) }
  return { start, stop, updateOptions }
}

// ─── 30. SUNSET COASTAL DRIVE (Synthwave & Anime) ─────────────────────────────
export function createSunsetCoastalDrive(canvas, options = {}) {
  const { color = '#ff007f', speedMultiplier = 1 } = options
  const ctx = canvas.getContext('2d')
  let animId = null
  let t = 0

  function resize() { setupCanvas(canvas) }

  function frame() {
    t += 0.03 * (options.speedMultiplier ?? speedMultiplier)
    const cx = canvas.width / 2
    const horizon = canvas.height * 0.55

    // Sunset Sky Gradient
    const skyGrad = ctx.createLinearGradient(0, 0, 0, horizon)
    skyGrad.addColorStop(0, '#1a052e')
    skyGrad.addColorStop(0.7, '#6b1154')
    skyGrad.addColorStop(1, '#ff5e62')
    ctx.fillStyle = skyGrad
    ctx.fillRect(0, 0, canvas.width, horizon)

    // Giant Striped Synth Sun
    ctx.save()
    ctx.beginPath()
    ctx.arc(cx, horizon, 110, Math.PI, 0)
    const sunGrad = ctx.createLinearGradient(cx, horizon - 110, cx, horizon)
    sunGrad.addColorStop(0, '#ffed4a')
    sunGrad.addColorStop(1, '#ff007f')
    ctx.fillStyle = sunGrad
    ctx.fill()

    // Sun horizontal scanline cutouts
    ctx.fillStyle = '#6b1154'
    for (let y = horizon - 90; y < horizon; y += 12) {
      const h = ((y - (horizon - 90)) / 90) * 6 + 2
      ctx.fillRect(cx - 120, y, 240, h)
    }
    ctx.restore()

    // Ocean grid reflecting sun
    const oceanGrad = ctx.createLinearGradient(0, horizon, 0, canvas.height)
    oceanGrad.addColorStop(0, '#2d063b')
    oceanGrad.addColorStop(1, '#080110')
    ctx.fillStyle = oceanGrad
    ctx.fillRect(0, horizon, canvas.width, canvas.height - horizon)

    // Moving perspective water lines
    ctx.strokeStyle = options.color || color
    ctx.lineWidth = 1.5
    for (let i = 0; i < 10; i++) {
      const p = ((i / 10) + (t * 0.2)) % 1
      const y = horizon + Math.pow(p, 2) * (canvas.height - horizon)
      ctx.beginPath()
      ctx.moveTo(0, y)
      ctx.lineTo(canvas.width, y)
      ctx.stroke()
    }

    animId = requestAnimationFrame(frame)
  }

  function start() {
    resize()
    window.addEventListener('resize', resize)
    animId = requestAnimationFrame(frame)
  }

  function stop() {
    if (animId) cancelAnimationFrame(animId)
    window.removeEventListener('resize', resize)
  }

  function updateOptions(newOpts) { Object.assign(options, newOpts) }
  return { start, stop, updateOptions }
}
