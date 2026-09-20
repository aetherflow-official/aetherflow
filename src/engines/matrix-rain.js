/**
 * Matrix Rain Engine
 * Lightweight Canvas 2D — green digital rain columns.
 * ~2KB, zero dependencies.
 */

const CHARS = 'アイウエオカキクケコサシスセソタチツテトナニヌネノハヒフヘホマミムメモヤユヨラリルレロワヲン0123456789ABCDEF'

export function createMatrixRain(canvas, options = {}) {
  let {
    color = '#00ff41',
    bgAlpha = 0.05,
    fontSize = 14,
    speedMultiplier = 1,
    fps = 60,
  } = options

  const ctx = canvas.getContext('2d')
  let animId = null
  let drops = []
  let lastFrame = 0
  let bgStyle = `rgba(0,0,0,${bgAlpha})`
  const charsLen = CHARS.length

  function applyFont() {
    ctx.font = `${fontSize}px 'JetBrains Mono', monospace`
  }

  function resize() {
    canvas.width = canvas.offsetWidth || window.innerWidth
    canvas.height = canvas.offsetHeight || window.innerHeight
    applyFont()
    const cols = Math.floor(canvas.width / fontSize)
    drops = Array.from({ length: cols }, () => Math.random() * -canvas.height / fontSize)
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

    ctx.fillStyle = bgStyle
    ctx.fillRect(0, 0, canvas.width, canvas.height)

    for (let i = 0; i < drops.length; i++) {
      const char = CHARS[Math.floor(Math.random() * charsLen)]
      const x = i * fontSize
      const y = drops[i] * fontSize

      // Bright head
      ctx.fillStyle = '#ffffff'
      ctx.fillText(char, x, y)

      ctx.fillStyle = color
      if (y > 20) {
        ctx.fillText(CHARS[Math.floor(Math.random() * charsLen)], x, y - fontSize)
      }

      if (y > canvas.height && Math.random() > 0.975) {
        drops[i] = 0
      }
      drops[i] += speedMultiplier * 0.5
    }
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
    if (newOpts.color !== undefined) color = newOpts.color
    if (newOpts.bgAlpha !== undefined) {
      bgAlpha = newOpts.bgAlpha
      bgStyle = `rgba(0,0,0,${bgAlpha})`
    }
    if (newOpts.fontSize !== undefined) {
      fontSize = newOpts.fontSize
      applyFont()
    }
    if (newOpts.speedMultiplier !== undefined) speedMultiplier = newOpts.speedMultiplier
    if (newOpts.fps !== undefined) fps = newOpts.fps
    if (newOpts.paused !== undefined) {
      if (newOpts.paused) pause()
      else resume()
    }
  }

  return { start, stop, updateOptions, pause, resume }
}
