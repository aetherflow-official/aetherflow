/**
 * Engine Registry — maps engine IDs to their factory functions.
 * Lazy-loads engines to keep initial bundle size minimal.
 */

export const ENGINES = {
  'matrix-rain': {
    id: 'matrix-rain',
    name: 'Matrix Rain',
    description: 'Digital rain of katakana characters cascading down',
    preview: '/previews/matrix-rain.svg',
    tags: ['dark', 'hacker', 'green', 'cyberpunk'],
    defaultConfig: { color: '#00ff41', bgAlpha: 0.05, fontSize: 14, speedMultiplier: 1 },
    properties: {
      color: { type: 'color', label: 'Rain Color', default: '#00ff41' },
      bgAlpha: { type: 'range', label: 'Trail Length', min: 0.01, max: 0.2, step: 0.01, default: 0.05 },
      fontSize: { type: 'range', label: 'Character Size', min: 8, max: 24, step: 1, default: 14 },
    },
    load: () => import('./matrix-rain.js').then(m => m.createMatrixRain),
  },

  'cyber-particles': {
    id: 'cyber-particles',
    name: 'Cyber Particles',
    description: 'Connected particle network with interactive mouse repulsion',
    preview: '/previews/cyber-particles.svg',
    tags: ['dark', 'blue', 'network', 'interactive'],
    defaultConfig: { color: '#00d4ff', particleCount: 80, connectionDistance: 120, speedMultiplier: 1 },
    properties: {
      color: { type: 'color', label: 'Particle Color', default: '#00d4ff' },
      particleCount: { type: 'range', label: 'Particle Count', min: 20, max: 200, step: 10, default: 80 },
      connectionDistance: { type: 'range', label: 'Connection Range', min: 60, max: 250, step: 10, default: 120 },
    },
    load: () => import('./cyber-particles.js').then(m => m.createCyberParticles),
  },

  'synthwave-grid': {
    id: 'synthwave-grid',
    name: 'Synthwave Grid',
    description: 'Retro 80s perspective grid with neon sun and scanlines',
    preview: '/previews/synthwave-grid.svg',
    tags: ['retro', 'purple', 'neon', 'synthwave'],
    defaultConfig: { horizonColor: '#ff2d78', gridColor: '#b400ff', speedMultiplier: 1 },
    properties: {
      horizonColor: { type: 'color', label: 'Horizon Color', default: '#ff2d78' },
      gridColor: { type: 'color', label: 'Grid Color', default: '#b400ff' },
    },
    load: () => import('./synthwave-grid.js').then(m => m.createSynthwaveGrid),
  },

  'deep-space': {
    id: 'deep-space',
    name: 'Deep Space',
    description: 'Parallax starfield with nebula clouds and shooting stars',
    preview: '/previews/deep-space.svg',
    tags: ['dark', 'space', 'stars', 'minimal'],
    defaultConfig: { starCount: 300, speedMultiplier: 1, shootingStars: true },
    properties: {
      starCount: { type: 'range', label: 'Star Count', min: 100, max: 600, step: 50, default: 300 },
      shootingStars: { type: 'toggle', label: 'Shooting Stars', default: true },
    },
    load: () => import('./deep-space.js').then(m => m.createDeepSpace),
  },

  'tokyo-rain': {
    id: 'tokyo-rain',
    name: 'Tokyo City Rain',
    description: 'Anime-style neon city skyline with falling rain',
    preview: '/previews/tokyo-rain.svg',
    tags: ['neon', 'rain', 'city', 'purple', 'anime'],
    defaultConfig: { rainCount: 200, speedMultiplier: 1 },
    properties: {
      rainCount: { type: 'range', label: 'Rain Intensity', min: 50, max: 500, step: 25, default: 200 },
      rainColor: { type: 'color', label: 'Rain Color', default: '#96d2ff' },
    },
    load: () => import('./tokyo-rain.js').then(m => m.createTokyoRain),
  },

  'aurora': {
    id: 'aurora',
    name: 'Aurora Borealis',
    description: 'Smooth aurora curtains dancing over a starlit sky',
    preview: '/previews/aurora.svg',
    tags: ['green', 'nature', 'peaceful', 'blue'],
    defaultConfig: { speedMultiplier: 1, starCount: 150, intensity: 0.7 },
    properties: {
      intensity: { type: 'range', label: 'Intensity', min: 0.2, max: 1.2, step: 0.05, default: 0.7 },
      starCount: { type: 'range', label: 'Star Count', min: 50, max: 300, step: 25, default: 150 },
    },
    load: () => import('./aurora.js').then(m => m.createAurora),
  },

  'audio-spectrum': {
    id: 'audio-spectrum',
    name: 'Audio Spectrum',
    description: 'CAVA-style frequency bars with beat simulation and optional mic reactivity',
    preview: '/previews/audio-spectrum.svg',
    tags: ['audio', 'music', 'reactive', 'bars'],
    defaultConfig: { barCount: 80, mirror: true, speedMultiplier: 1, useMic: false, audioDeviceId: 'default' },
    properties: {
      color: { type: 'color', label: 'Primary Color', default: '#00d4ff' },
      accentColor: { type: 'color', label: 'Accent Color', default: '#ff2d78' },
      barCount: { type: 'range', label: 'Bar Count', min: 20, max: 128, step: 4, default: 80 },
      mirror: { type: 'toggle', label: 'Mirror Mode', default: true },
      useMic: { type: 'toggle', label: 'Microphone / Device Input', default: false },
    },
    load: () => import('./audio-spectrum.js').then(m => m.createAudioSpectrum),
  },
  'fps-meter': {
    id: 'fps-meter',
    name: 'FPS Benchmark HUD',
    description: 'Cyberpunk telemetry HUD showing real-time FPS counter, target limit, and frame-time graph',
    preview: '/previews/fps-meter.svg',
    tags: ['benchmark', 'fps', 'telemetry', 'cyberpunk', 'hud'],
    defaultConfig: { color: '#00ffcc', accentColor: '#ff0055', speedMultiplier: 1 },
    properties: {
      color: { type: 'color', label: 'Primary Neon', default: '#00ffcc' },
      accentColor: { type: 'color', label: 'Accent Neon', default: '#ff0055' },
    },
    load: () => import('./fps-meter.js').then(m => m.createFpsMeter),
  },
  'quantum-flux': {
    id: 'quantum-flux',
    name: 'Quantum Flux',
    description: 'Luminous cybernetic hexagonal matrix with interactive quantum energy pulses and particle sparks',
    preview: '/previews/quantum-flux.svg',
    tags: ['cyberpunk', 'interactive', 'neon', 'matrix', 'futuristic'],
    defaultConfig: { color: '#00f0ff', accentColor: '#b400ff', hexRadius: 36, speedMultiplier: 1 },
    properties: {
      color: { type: 'color', label: 'Pulse Color', default: '#00f0ff' },
      accentColor: { type: 'color', label: 'Secondary Neon', default: '#b400ff' },
      hexRadius: { type: 'range', label: 'Hexagon Size', min: 20, max: 70, step: 2, default: 36 },
    },
    load: () => import('./quantum-flux.js').then(m => m.createQuantumFlux),
  },
  'video-player': {
    id: 'video-player',
    name: 'Video Wallpaper',
    description: 'Plays a local MP4/WebM video file as your wallpaper',
    preview: '/previews/matrix-rain.svg', // using a fallback preview since we can't generate video previews easily right now
    tags: ['video', 'custom', 'local'],
    defaultConfig: { videoPath: '', speedMultiplier: 1 },
    properties: {
      videoPath: { type: 'text', label: 'Local Video Path (.mp4, .webm)', default: '' },
    },
    load: () => import('./video-player.js').then(m => m.default),
  },
  'image-player': {
    id: 'image-player',
    name: 'Picture Wallpaper',
    description: 'Displays a high-resolution local picture (PNG, JPG, WebP) as wallpaper',
    preview: '/previews/matrix-rain.svg',
    tags: ['image', 'picture', 'custom', 'local'],
    defaultConfig: { imagePath: '', fit: 'fill', backgroundColor: '#000000' },
    properties: {
      imagePath: { type: 'text', label: 'Local Image Path (.png, .jpg, .webp)', default: '' },
      fit: { type: 'select', label: 'Choose a Fit', options: ['fill', 'fit', 'stretch', 'center', 'tile'], default: 'fill' },
      backgroundColor: { type: 'color', label: 'Matte / Background Color', default: '#000000' },
    },
    load: () => import('./image-player.js').then(m => m.createImagePlayer || m.default),
  },
  'web-stream': {
    id: 'web-stream',
    name: 'YouTube & Web Stream',
    description: 'Streams live video, YouTube ambient loops, or interactive web pages as wallpaper',
    preview: '/previews/deep-space.svg',
    tags: ['stream', 'youtube', 'live', 'web'],
    defaultConfig: { streamUrl: '', muted: true, speedMultiplier: 1 },
    properties: {
      streamUrl: { type: 'text', label: 'YouTube or Web Stream URL', default: '' },
      muted: { type: 'toggle', label: 'Mute Audio', default: true },
    },
    load: () => import('./web-stream.js').then(m => m.createWebStream || m.default),
  },

  // ─── Community Procedural Engines (30 Curated Engines) ──────────────────────
  'stellar-warp': {
    id: 'stellar-warp', isCommunity: true, name: 'Stellar Warp',
    description: 'Hyperspace star warp with relativistic speed lines',
    tags: ['space', 'stars', 'warp', 'fast'],
    load: () => import('./communityEngines.js').then(m => m.createStellarWarp),
  },
  'black-hole-lens': {
    id: 'black-hole-lens', isCommunity: true, name: 'Black Hole Lens',
    description: 'Supermassive gravitational lensing with swirling accretion disk',
    tags: ['space', 'cosmic', 'gravity', 'dark'],
    load: () => import('./communityEngines.js').then(m => m.createBlackHoleLens),
  },
  'supernova-burst': {
    id: 'supernova-burst', isCommunity: true, name: 'Supernova Burst',
    description: 'Expanding multi-layered cosmic gas shockwave with stardust sparks',
    tags: ['space', 'nebula', 'burst', 'vibrant'],
    load: () => import('./communityEngines.js').then(m => m.createSupernovaBurst),
  },
  'orbital-mechanics': {
    id: 'orbital-mechanics', isCommunity: true, name: 'Orbital Mechanics',
    description: 'Gravitational Keplerian solar system orbits with glowing orbital trails',
    tags: ['space', 'planets', 'minimal', 'solar'],
    load: () => import('./communityEngines.js').then(m => m.createOrbitalMechanics),
  },
  'solar-flare': {
    id: 'solar-flare', isCommunity: true, name: 'Solar Flare Corona',
    description: 'Dynamic convective solar granules and erupting magnetic plasma loops',
    tags: ['space', 'sun', 'fire', 'orange'],
    load: () => import('./communityEngines.js').then(m => m.createSolarFlare),
  },
  'cyber-hex-circuit': {
    id: 'cyber-hex-circuit', isCommunity: true, name: 'Cyber Hex Circuit',
    description: 'Glowing motherboard PCB traces with travelling high-speed data pulses',
    tags: ['cyberpunk', 'circuit', 'tech', 'blue'],
    load: () => import('./communityEngines.js').then(m => m.createCyberHexCircuit),
  },
  'neon-wireframe-tunnel': {
    id: 'neon-wireframe-tunnel', isCommunity: true, name: 'Neon Wireframe Tunnel',
    description: 'Infinite 3D perspective wireframe corridor flying forward with depth glow',
    tags: ['cyberpunk', 'retro', 'tunnel', '3d'],
    load: () => import('./communityEngines.js').then(m => m.createNeonWireframeTunnel),
  },
  'quantum-entanglement': {
    id: 'quantum-entanglement', isCommunity: true, name: 'Quantum Entanglement',
    description: 'Interconnected quantum particles exchanging glowing resonance arcs',
    tags: ['cyberpunk', 'quantum', 'physics', 'interactive'],
    load: () => import('./communityEngines.js').then(m => m.createQuantumEntanglement),
  },
  'holographic-clock': {
    id: 'holographic-clock', isCommunity: true, name: 'Holographic Chrono HUD',
    description: 'Futuristic circular HUD with rotating arc gauges and live telemetry clock',
    tags: ['cyberpunk', 'hud', 'clock', 'minimal'],
    load: () => import('./communityEngines.js').then(m => m.createHolographicClock),
  },
  'sonar-radar-sweep': {
    id: 'sonar-radar-sweep', isCommunity: true, name: 'Sonar Radar Sweep',
    description: 'Tactical circular green phosphor radar screen with sweeping beam and blips',
    tags: ['cyberpunk', 'military', 'radar', 'green'],
    load: () => import('./communityEngines.js').then(m => m.createSonarRadarSweep),
  },
  'neural-synapse': {
    id: 'neural-synapse', isCommunity: true, name: 'Neural Synapse Network',
    description: 'Biological and AI neural network with branching dendrites and synaptic firing',
    tags: ['cyberpunk', 'ai', 'neural', 'purple'],
    load: () => import('./communityEngines.js').then(m => m.createNeuralSynapse),
  },
  'sakura-fall': {
    id: 'sakura-fall', isCommunity: true, name: 'Sakura Petals Blossom',
    description: 'Japanese anime cherry blossom petals swaying and tumbling gently in the breeze',
    tags: ['anime', 'nature', 'sakura', 'pink', 'peaceful'],
    load: () => import('./communityEngines.js').then(m => m.createSakuraFall),
  },
  'autumn-leaves': {
    id: 'autumn-leaves', isCommunity: true, name: 'Autumn Maple Drift',
    description: 'Golden orange and crimson maple leaves fluttering down against a calm sunrise',
    tags: ['nature', 'autumn', 'leaves', 'warm', 'cozy'],
    load: () => import('./communityEngines.js').then(m => m.createAutumnLeaves),
  },
  'firefly-forest': {
    id: 'firefly-forest', isCommunity: true, name: 'Enchanted Firefly Grove',
    description: 'Warm glowing fireflies floating with organic wandering physics in a dark forest',
    tags: ['nature', 'forest', 'fireflies', 'calm', 'night'],
    load: () => import('./communityEngines.js').then(m => m.createFireflyForest),
  },
  'rainy-window': {
    id: 'rainy-window', isCommunity: true, name: 'Rainy Window Pane',
    description: 'Atmospheric window condensation with dripping droplets and city street bokeh',
    tags: ['nature', 'lofi', 'rain', 'cozy', 'chill'],
    load: () => import('./communityEngines.js').then(m => m.createRainyWindow),
  },
  'gentle-snowfall': {
    id: 'gentle-snowfall', isCommunity: true, name: 'Gentle Winter Snowfall',
    description: 'Multi-layered parallax snowfall with soft flakes drifting in gentle wind',
    tags: ['nature', 'winter', 'snow', 'minimal', 'white'],
    load: () => import('./communityEngines.js').then(m => m.createGentleSnowfall),
  },
  'ocean-waves': {
    id: 'ocean-waves', isCommunity: true, name: 'Moonlit Ocean Waves',
    description: 'Harmonic layered sine ocean swells with translucent crests and tide reflection',
    tags: ['nature', 'ocean', 'waves', 'blue', 'peaceful'],
    load: () => import('./communityEngines.js').then(m => m.createOceanWaves),
  },
  'thunderstorm-lightning': {
    id: 'thunderstorm-lightning', isCommunity: true, name: 'Thunderstorm Lightning',
    description: 'Dramatic dark brooding rainstorm with ambient sheet flashes and branching bolts',
    tags: ['nature', 'storm', 'lightning', 'dark'],
    load: () => import('./communityEngines.js').then(m => m.createThunderstormLightning),
  },
  'hypnotic-spiral': {
    id: 'hypnotic-spiral', isCommunity: true, name: 'Hypnotic Archimedes Spiral',
    description: 'Archimedean logarithmic spiral with continuous optical flow and neon color shift',
    tags: ['abstract', 'spiral', 'psychedelic', 'purple'],
    load: () => import('./communityEngines.js').then(m => m.createHypnoticSpiral),
  },
  'voronoi-cells': {
    id: 'voronoi-cells', isCommunity: true, name: 'Living Voronoi Cells',
    description: 'Organic cellular tessellation diagram with drifting seeds and stained-glass glow',
    tags: ['abstract', 'geometric', 'voronoi', 'minimal'],
    load: () => import('./communityEngines.js').then(m => m.createVoronoiCells),
  },
  'plasma-waves': {
    id: 'plasma-waves', isCommunity: true, name: 'Liquid Plasma Waves',
    description: 'Classic demoscene multi-sine liquid plasma with vibrant color phase cycles',
    tags: ['abstract', 'plasma', 'retro', 'color'],
    load: () => import('./communityEngines.js').then(m => m.createPlasmaWaves),
  },
  'flow-field': {
    id: 'flow-field', isCommunity: true, name: 'Curl Noise Flow Field',
    description: 'Vector field where hundreds of glowing particles trace silky ribbon currents',
    tags: ['abstract', 'flow', 'particles', 'smooth'],
    load: () => import('./communityEngines.js').then(m => m.createFlowField),
  },
  'lissajous-knots': {
    id: 'lissajous-knots', isCommunity: true, name: 'Lissajous Harmonic Knots',
    description: '3D Harmonograph mathematical curves weaving glowing geometric webs',
    tags: ['abstract', 'math', 'curves', 'gold'],
    load: () => import('./communityEngines.js').then(m => m.createLissajousKnots),
  },
  'chladni-resonance': {
    id: 'chladni-resonance', isCommunity: true, name: 'Chladni Cymatic Resonance',
    description: 'Acoustic nodal sand vibration patterns morphing between sacred harmonic modes',
    tags: ['abstract', 'cymatics', 'geometry', 'green'],
    load: () => import('./communityEngines.js').then(m => m.createChladniResonance),
  },
  'cassette-tape': {
    id: 'cassette-tape', isCommunity: true, name: 'Vintage 80s Cassette',
    description: 'Retro synthwave cassette tape with rotating spools and glowing waveform',
    tags: ['retro', 'lofi', 'synthwave', '80s'],
    load: () => import('./communityEngines.js').then(m => m.createCassetteTape),
  },
  'isometric-city': {
    id: 'isometric-city', isCommunity: true, name: 'Isometric Cyber City',
    description: 'Minimalist isometric skyscrapers with illuminated windows and beacons',
    tags: ['retro', 'city', 'cyberpunk', 'isometric'],
    load: () => import('./communityEngines.js').then(m => m.createIsometricCity),
  },
  'neon-equalizer': {
    id: 'neon-equalizer', isCommunity: true, name: 'Radial Neon Equalizer',
    description: 'Circular 360-degree audio spectrum visualizer with pulsing neon energy bars',
    tags: ['retro', 'audio', 'music', 'visualizer'],
    load: () => import('./communityEngines.js').then(m => m.createNeonEqualizer),
  },
  'pixel-star-night': {
    id: 'pixel-star-night', isCommunity: true, name: '8-Bit Pixel Starry Night',
    description: 'Nostalgic 8-bit retro pixel art starry night with blocky moon and pixel stars',
    tags: ['gaming', 'retro', 'pixel', 'stars'],
    load: () => import('./communityEngines.js').then(m => m.createPixelStarNight),
  },
  'matrix-hex-code': {
    id: 'matrix-hex-code', isCommunity: true, name: 'Hexadecimal Memory Matrix',
    description: 'Cyberpunk memory dump matrix with columns of green/cyan hex addresses',
    tags: ['cyberpunk', 'matrix', 'code', 'minimal'],
    load: () => import('./communityEngines.js').then(m => m.createMatrixHexCode),
  },
  'sunset-coastal-drive': {
    id: 'sunset-coastal-drive', isCommunity: true, name: 'Sunset Coastal Horizon',
    description: 'Low-poly vector synthwave coastline with sunset waves and giant striped sun',
    tags: ['retro', 'synthwave', 'sunset', 'anime'],
    load: () => import('./communityEngines.js').then(m => m.createSunsetCoastalDrive),
  },
}

export const WALLPAPER_LIST = Object.values(ENGINES).filter(
  e => !e.isCommunity && e.id !== 'video-player' && e.id !== 'image-player' && e.id !== 'web-stream'
)

/** Prebuilt themes shipped with the app */
export const BUILTIN_THEMES = [
  { id: 'aether-dark',          name: 'Dark',          accent: '#3b82f6', bg: '#0d0f14', category: 'dark', isDefault: true },
  { id: 'aether-light',         name: 'Light',         accent: '#2563eb', bg: '#f6f8fa', category: 'light' },
  { id: 'sovereign-onyx',       name: 'Onyx',          accent: '#3b82f6', bg: '#09090b', category: 'dark' },
  { id: 'sovereign-slate',      name: 'Slate',         accent: '#6366f1', bg: '#0c0f17', category: 'dark' },
  { id: 'sovereign-studio',     name: 'Studio',        accent: '#10b981', bg: '#0a0e0f', category: 'dark' },
  { id: 'sovereign-obsidian',   name: 'Obsidian',      accent: '#f59e0b', bg: '#0e0b08', category: 'dark' },
  { id: 'sovereign-manifesto',  name: 'Manifesto',     accent: '#d42b2b', bg: '#f5f0e8', category: 'light' },
  { id: 'sovereign-light',      name: 'Light Classic', accent: '#2563eb', bg: '#f8fafc', category: 'light' },
]

