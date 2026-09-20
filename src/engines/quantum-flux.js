/**
 * Quantum Flux — Procedural Canvas 2D Wallpaper Engine
 * A luminous cybernetic hexagonal matrix with undulating quantum waves,
 * energy ripple propagation, and mouse-reactive particle sparks.
 *
 * Canvas 2D only • 60 FPS • Lightweight • No WebGL
 */

export function createQuantumFlux(canvas, options = {}) {
  const ctx = canvas.getContext('2d')
  let animId = null
  let width = 0
  let height = 0
  let time = 0

  const opts = {
    color: options.color || '#00f0ff',
    accentColor: options.accentColor || '#b400ff',
    hexRadius: options.hexRadius || 36,
    speedMultiplier: options.speedMultiplier !== undefined ? options.speedMultiplier : 1,
    glowIntensity: options.glowIntensity || 0.8,
    interactive: options.interactive !== false,
  }

  let mouse = { x: -1000, y: -1000, active: false }
  const ripples = []
  const sparks = []

  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    width = canvas.offsetWidth || window.innerWidth
    height = canvas.offsetHeight || window.innerHeight
    canvas.width = Math.floor(width * dpr)
    canvas.height = Math.floor(height * dpr)
    ctx.scale(dpr, dpr)
  }

  function handleMouseMove(e) {
    const rect = canvas.getBoundingClientRect()
    mouse.x = e.clientX - rect.left
    mouse.y = e.clientY - rect.top
    mouse.active = true

    if (Math.random() < 0.35 && sparks.length < 50) {
      sparks.push({
        x: mouse.x,
        y: mouse.y,
        vx: (Math.random() - 0.5) * 4,
        vy: (Math.random() - 0.5) * 4,
        life: 1,
        color: Math.random() > 0.5 ? opts.color : opts.accentColor
      })
    }
  }

  function handleMouseLeave() {
    mouse.active = false
  }

  function handleClick(e) {
    const rect = canvas.getBoundingClientRect()
    const cx = e.clientX - rect.left
    const cy = e.clientY - rect.top
    ripples.push({ x: cx, y: cy, radius: 10, maxRadius: 360, strength: 1.5 })

    // Burst sparks
    for (let i = 0; i < 16; i++) {
      const angle = (Math.PI * 2 / 16) * i
      const spd = 2 + Math.random() * 4
      sparks.push({
        x: cx,
        y: cy,
        vx: Math.cos(angle) * spd,
        vy: Math.sin(angle) * spd,
        life: 1,
        color: i % 2 === 0 ? opts.color : opts.accentColor
      })
    }
  }

  function drawHexagon(cx, cy, r) {
    ctx.beginPath()
    for (let i = 0; i < 6; i++) {
      const angle = (Math.PI / 3) * i - Math.PI / 6
      const x = cx + r * Math.cos(angle)
      const y = cy + r * Math.sin(angle)
      if (i === 0) ctx.moveTo(x, y)
      else ctx.lineTo(x, y)
    }
    ctx.closePath()
  }

  function frame() {
    time += 0.015 * opts.speedMultiplier

    // Dark deep void background
    ctx.fillStyle = '#06080f'
    ctx.fillRect(0, 0, width, height)

    // Subtle atmospheric ambient gradients
    const grad1 = ctx.createRadialGradient(width * 0.25, height * 0.3, 20, width * 0.25, height * 0.3, width * 0.6)
    grad1.addColorStop(0, 'rgba(0, 240, 255, 0.06)')
    grad1.addColorStop(1, 'transparent')
    ctx.fillStyle = grad1
    ctx.fillRect(0, 0, width, height)

    const grad2 = ctx.createRadialGradient(width * 0.75, height * 0.7, 30, width * 0.75, height * 0.7, width * 0.65)
    grad2.addColorStop(0, 'rgba(180, 0, 255, 0.07)')
    grad2.addColorStop(1, 'transparent')
    ctx.fillStyle = grad2
    ctx.fillRect(0, 0, width, height)

    // Update active ripples
    for (let i = ripples.length - 1; i >= 0; i--) {
      const rip = ripples[i]
      rip.radius += 5 * opts.speedMultiplier
      rip.strength *= 0.965
      if (rip.radius > rip.maxRadius || rip.strength < 0.02) {
        ripples.splice(i, 1)
      }
    }

    // Hexagonal geometry
    const r = opts.hexRadius
    const h = r * Math.sqrt(3)
    const stepX = r * 1.5
    const stepY = h

    const cols = Math.ceil(width / stepX) + 2
    const rows = Math.ceil(height / stepY) + 2

    ctx.lineWidth = 1.1

    for (let col = -1; col < cols; col++) {
      for (let row = -1; row < rows; row++) {
        const cx = col * stepX
        const cy = row * stepY + (col % 2 === 0 ? 0 : h * 0.5)

        // Mathematical quantum wave calculation
        const distToCenter = Math.hypot(cx - width * 0.5, cy - height * 0.5)
        const wave = Math.sin(distToCenter * 0.015 - time * 2) + Math.cos((cx * 0.02) + time) * 0.5

        // Mouse proximity calculation
        let mouseInfluence = 0
        if (mouse.active) {
          const mDist = Math.hypot(cx - mouse.x, cy - mouse.y)
          if (mDist < 180) {
            mouseInfluence = (1 - mDist / 180) * 1.8
          }
        }

        // Ripple impact
        let rippleInfluence = 0
        for (const rip of ripples) {
          const rDist = Math.abs(Math.hypot(cx - rip.x, cy - rip.y) - rip.radius)
          if (rDist < 40) {
            rippleInfluence += (1 - rDist / 40) * rip.strength * 2
          }
        }

        const energy = Math.min(1.5, Math.max(0, 0.2 + (wave + 1) * 0.35 + mouseInfluence + rippleInfluence))

        if (energy > 0.08) {
          drawHexagon(cx, cy, r * 0.94)

          if (energy > 0.75) {
            // Hot neon edge
            ctx.strokeStyle = `rgba(0, 240, 255, ${Math.min(0.85, energy * 0.65)})`
            ctx.stroke()
            // Quantum center pulse core
            ctx.beginPath()
            ctx.arc(cx, cy, 1.8 * energy, 0, Math.PI * 2)
            ctx.fillStyle = energy > 1.1 ? '#ffffff' : opts.color
            ctx.fill()
          } else {
            // Dormant / gentle ambient edge
            ctx.strokeStyle = `rgba(80, 110, 170, ${energy * 0.22})`
            ctx.stroke()
          }
        }
      }
    }

    // Render interactive spark particles
    for (let i = sparks.length - 1; i >= 0; i--) {
      const sp = sparks[i]
      sp.x += sp.vx
      sp.y += sp.vy
      sp.life -= 0.028

      if (sp.life <= 0) {
        sparks.splice(i, 1)
        continue
      }

      ctx.beginPath()
      ctx.arc(sp.x, sp.y, 2.2 * sp.life, 0, Math.PI * 2)
      ctx.fillStyle = sp.color
      ctx.globalAlpha = sp.life
      ctx.fill()
      ctx.globalAlpha = 1
    }

    animId = requestAnimationFrame(frame)
  }

  function start() {
    resize()
    window.addEventListener('resize', resize)
    if (opts.interactive) {
      canvas.addEventListener('mousemove', handleMouseMove)
      canvas.addEventListener('mouseleave', handleMouseLeave)
      canvas.addEventListener('click', handleClick)
    }
    animId = requestAnimationFrame(frame)
  }

  function stop() {
    if (animId) {
      cancelAnimationFrame(animId)
      animId = null
    }
    window.removeEventListener('resize', resize)
    canvas.removeEventListener('mousemove', handleMouseMove)
    canvas.removeEventListener('mouseleave', handleMouseLeave)
    canvas.removeEventListener('click', handleClick)
  }

  function updateOptions(newOpts) {
    Object.assign(opts, newOpts)
  }

  return { start, stop, updateOptions }
}
