/**
 * Synthwave Grid Engine
 * Canvas 2D — retro perspective grid with sun and scanlines.
 * ~3KB, zero dependencies.
 */

export function createSynthwaveGrid(canvas, options = {}) {
  let {
    horizonColor = '#ff2d78',
    gridColor = '#b400ff',
    sunColors = ['#ffdd00', '#ff8c00', '#ff2d78'],
    speedMultiplier = 1,
    fps = 60,
  } = options

  const ctx = canvas.getContext('2d')
  let animId = null
  let offset = 0
  let lastFrame = 0

  let bgGrad = null
  let sunGrad = null
  let hGlowGrad = null
  let scanlinePattern = null

  function initGradients() {
    const W = canvas.width
    const H = canvas.height
    const horizon = H * 0.5

    bgGrad = ctx.createLinearGradient(0, 0, 0, H)
    bgGrad.addColorStop(0, '#0d0019')
    bgGrad.addColorStop(0.5, '#1a0033')
    bgGrad.addColorStop(1, '#000010')

    const sunX = W / 2
    const sunY = horizon
    const sunR = Math.min(W, H) * 0.14
    sunGrad = ctx.createRadialGradient(sunX, sunY, 0, sunX, sunY, sunR)
    sunColors.forEach((c, i) => sunGrad.addColorStop(i / (sunColors.length - 1), c))

    hGlowGrad = ctx.createLinearGradient(0, horizon - 30, 0, horizon + 30)
    hGlowGrad.addColorStop(0, 'rgba(255,45,120,0)')
    hGlowGrad.addColorStop(0.5, 'rgba(255,45,120,0.6)')
    hGlowGrad.addColorStop(1, 'rgba(255,45,120,0)')

    const pCanvas = document.createElement('canvas')
    pCanvas.width = 1
    pCanvas.height = 4
    const pCtx = pCanvas.getContext('2d')
    pCtx.fillStyle = 'rgba(0,0,0,0.06)'
    pCtx.fillRect(0, 0, 1, 2)
    scanlinePattern = ctx.createPattern(pCanvas, 'repeat')
  }

  function resize() {
    canvas.width = canvas.offsetWidth || window.innerWidth
    canvas.height = canvas.offsetHeight || window.innerHeight
    initGradients()
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
    const horizon = H * 0.5

    // Background gradient (reusing cached gradient)
    if (bgGrad) {
      ctx.fillStyle = bgGrad
      ctx.fillRect(0, 0, W, H)
    }

    // Sun
    const sunX = W / 2
    const sunY = horizon
    const sunR = Math.min(W, H) * 0.14

    if (sunGrad) {
      ctx.beginPath()
      ctx.arc(sunX, sunY, sunR, 0, Math.PI * 2)
      ctx.fillStyle = sunGrad
      ctx.fill()
    }

    // Sun scanlines
    ctx.save()
    ctx.beginPath()
    ctx.arc(sunX, sunY, sunR, 0, Math.PI * 2)
    ctx.clip()
    ctx.fillStyle = 'rgba(0,0,0,0.45)'
    for (let i = 0; i < sunR * 2; i += 6) {
      ctx.fillRect(sunX - sunR, sunY - sunR + i, sunR * 2, 3)
    }
    ctx.restore()

    // Horizon glow (reusing cached gradient)
    if (hGlowGrad) {
      ctx.fillStyle = hGlowGrad
      ctx.fillRect(0, horizon - 30, W, 60)
    }

    // ── Perspective Grid ──────────────────────────────────────────
    const vpX = W / 2
    const gridCols = 14
    const gridRows = 10
    const gridBottom = H + 40

    ctx.save()
    ctx.beginPath()
    ctx.rect(0, horizon, W, H - horizon)
    ctx.clip()

    ctx.strokeStyle = gridColor
    ctx.lineWidth = 1

    // Vertical lines (batched into single path)
    ctx.globalAlpha = 0.55
    ctx.beginPath()
    for (let i = 0; i <= gridCols; i++) {
      const t = i / gridCols
      const bx = W * t
      ctx.moveTo(vpX + (bx - vpX) * 0.01, horizon)
      ctx.lineTo(bx, gridBottom)
    }
    ctx.stroke()

    // Horizontal lines (scrolling)
    for (let i = 0; i < gridRows; i++) {
      const rawT = (i / gridRows + (offset % (1 / gridRows)) * gridRows) % 1
      const t = Math.pow(rawT, 2)
      const y = horizon + (gridBottom - horizon) * t
      const alpha = rawT * 0.7
      ctx.globalAlpha = alpha
      const lx = vpX + (0 - vpX) * (1 - rawT * 0.95)
      const rx = vpX + (W - vpX) * (1 - rawT * 0.95)
      ctx.beginPath()
      ctx.moveTo(lx, y)
      ctx.lineTo(rx, y)
      ctx.stroke()
    }

    ctx.restore()
    ctx.globalAlpha = 1

    // Scanlines overlay (single fillRect using repeating pattern)
    if (scanlinePattern) {
      ctx.fillStyle = scanlinePattern
      ctx.fillRect(0, 0, W, H)
    }

    offset += 0.003 * speedMultiplier
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
    bgGrad = null
    sunGrad = null
    hGlowGrad = null
    scanlinePattern = null
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
    if (newOpts.speedMultiplier !== undefined) speedMultiplier = newOpts.speedMultiplier
    if (newOpts.fps !== undefined) fps = newOpts.fps
    let needRegen = false
    if (newOpts.horizonColor !== undefined) { horizonColor = newOpts.horizonColor; needRegen = true }
    if (newOpts.gridColor !== undefined) gridColor = newOpts.gridColor
    if (newOpts.sunColors !== undefined) { sunColors = newOpts.sunColors; needRegen = true }
    if (needRegen && canvas.width && canvas.height) {
      initGradients()
    }
    if (newOpts.paused !== undefined) {
      if (newOpts.paused) pause()
      else resume()
    }
  }

  return { start, stop, updateOptions, pause, resume }
}
