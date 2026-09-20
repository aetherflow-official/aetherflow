/**
 * Deep Space Starfield Engine
 * Canvas 2D — 3-layer parallax stars with nebula glow and shooting stars.
 * ~3KB, zero dependencies.
 */

export function createDeepSpace(canvas, options = {}) {
  let {
    starCount = 300,
    nebulaColors = ['#6600cc', '#003399', '#cc0066'],
    speedMultiplier = 1,
    shootingStars = true,
    fps = 60,
  } = options

  const ctx = canvas.getContext('2d')
  let animId = null
  let stars = []
  let shooters = []
  let lastFrame = 0

  class Star {
    constructor(w, h) { this.reset(w, h, true) }
    reset(w, h, initial = false) {
      this.x = Math.random() * w
      this.y = initial ? Math.random() * h : 0
      this.z = Math.random()                  // depth (0=far, 1=near)
      this.size = this.z * 2.5 + 0.3
      this.speed = (this.z * 0.3 + 0.05) * speedMultiplier
      this.alpha = this.z * 0.7 + 0.2
      this.twinkle = Math.random() * Math.PI * 2
    }
  }

  class ShootingStar {
    constructor(w, h) { this.reset(w, h) }
    reset(w, h) {
      this.x = Math.random() * w
      this.y = Math.random() * h * 0.4
      this.len = Math.random() * 120 + 60
      this.speed = Math.random() * 10 + 8
      this.angle = Math.PI / 4 + (Math.random() - 0.5) * 0.5
      this.alpha = 1
      this.active = true
    }
  }

  let backdropCanvas = null
  let backdropCtx = null

  function renderBackdrop(W, H) {
    if (!backdropCanvas) {
      backdropCanvas = document.createElement('canvas')
    }
    backdropCanvas.width = W
    backdropCanvas.height = H
    backdropCtx = backdropCanvas.getContext('2d')

    // Radial background
    const bg = backdropCtx.createRadialGradient(W / 2, H / 2, 0, W / 2, H / 2, Math.max(W, H) * 0.8)
    bg.addColorStop(0, '#070012')
    bg.addColorStop(0.4, '#040009')
    bg.addColorStop(1, '#000005')
    backdropCtx.fillStyle = bg
    backdropCtx.fillRect(0, 0, W, H)

    // Nebula clouds
    nebulaColors.forEach((c, i) => {
      const nx = W * (0.2 + i * 0.3)
      const ny = H * (0.2 + (i % 2) * 0.5)
      const ng = backdropCtx.createRadialGradient(nx, ny, 0, nx, ny, W * 0.25)
      ng.addColorStop(0, c + '18')
      ng.addColorStop(1, 'transparent')
      backdropCtx.fillStyle = ng
      backdropCtx.fillRect(0, 0, W, H)
    })
  }

  function resize() {
    canvas.width = canvas.offsetWidth || window.innerWidth
    canvas.height = canvas.offsetHeight || window.innerHeight
    renderBackdrop(canvas.width, canvas.height)
    stars = Array.from({ length: starCount }, () => new Star(canvas.width, canvas.height))
  }

  function spawnShooter() {
    if (!shootingStars) return
    if (shooters.length < 3 && Math.random() < 0.003) {
      shooters.push(new ShootingStar(canvas.width, canvas.height))
    }
  }

  function frame(ts) {
    animId = requestAnimationFrame(frame)
    if (fps && fps > 0 && fps < 240) {
      const minInterval = 1000 / fps
      if (ts - lastFrame < minInterval - 1) {
        return
      }
    }
    lastFrame = ts
    const W = canvas.width
    const H = canvas.height

    // Draw cached space backdrop
    if (backdropCanvas) {
      ctx.drawImage(backdropCanvas, 0, 0)
    }

    // Stars (zero string allocations: reuse white color + primitive globalAlpha)
    ctx.fillStyle = '#ffffff'
    for (let i = 0; i < stars.length; i++) {
      const s = stars[i]
      s.twinkle += 0.03
      ctx.globalAlpha = s.alpha * (0.85 + Math.sin(s.twinkle) * 0.15)
      ctx.beginPath()
      ctx.arc(s.x, s.y, s.size, 0, Math.PI * 2)
      ctx.fill()

      s.y += s.speed
      if (s.y > H) s.reset(W, H)
    }

    // Shooting stars (in-place array update: zero array allocations)
    spawnShooter()
    for (let i = shooters.length - 1; i >= 0; i--) {
      const s = shooters[i]
      if (!s.active) {
        shooters.splice(i, 1)
        continue
      }
      const tx = s.x + Math.cos(s.angle) * s.len
      const ty = s.y + Math.sin(s.angle) * s.len
      const grad = ctx.createLinearGradient(s.x, s.y, tx, ty)
      grad.addColorStop(0, '#ffffff')
      grad.addColorStop(1, 'rgba(255,255,255,0)')
      ctx.globalAlpha = s.alpha
      ctx.beginPath()
      ctx.moveTo(s.x, s.y)
      ctx.lineTo(tx, ty)
      ctx.strokeStyle = grad
      ctx.lineWidth = 1.5
      ctx.stroke()

      s.x += Math.cos(s.angle) * s.speed
      s.y += Math.sin(s.angle) * s.speed
      s.alpha -= 0.015
      if (s.alpha <= 0 || s.x > W || s.y > H) s.active = false
    }
    ctx.globalAlpha = 1
  }

  function start() {
    resize()
    window.addEventListener('resize', resize)
    animId = requestAnimationFrame(frame)
  }

  function stop() {
    if (animId) cancelAnimationFrame(animId)
    animId = null
    window.removeEventListener('resize', resize)
    backdropCanvas = null
    backdropCtx = null
  }

  function pause() {
    if (animId) {
      cancelAnimationFrame(animId)
      animId = null
    }
  }

  function resume() {
    if (!animId) {
      lastFrame = performance.now()
      animId = requestAnimationFrame(frame)
    }
  }

  function updateOptions(newOpts) {
    Object.assign(options, newOpts)
    if (newOpts.speedMultiplier !== undefined) {
      speedMultiplier = newOpts.speedMultiplier
      stars.forEach(s => {
        s.speed = (s.z * 0.3 + 0.05) * speedMultiplier
      })
    }
    if (newOpts.fps !== undefined) fps = newOpts.fps
    if (newOpts.nebulaColors !== undefined) nebulaColors = newOpts.nebulaColors
    if (newOpts.shootingStars !== undefined) shootingStars = newOpts.shootingStars
    if (newOpts.paused !== undefined) {
      if (newOpts.paused) pause()
      else resume()
    }
  }

  return { start, stop, updateOptions, pause, resume }
}
