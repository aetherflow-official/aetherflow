# REMAINING_TASKS.md — AetherFlow Next Steps
<!-- Read AGENTS.md first. This file describes what is left to do. -->
<!-- Each task has EXACT commands to run, EXACT files to create/edit, and a verification step. -->

---

## Current Status: Frontend ✅ Complete | Native App ❌ Not Yet Launched

The React + Vite frontend is 100% done and builds successfully.
The only thing that remains is launching it as a real Windows desktop app using Tauri.

---

## TASK 1 — Install Rust and Launch Native Windows App

**What this does:** Converts the web UI into an actual `.exe` Windows app that lives in the taskbar.

**Estimated time:** 15–30 minutes (mostly waiting for Rust to download and compile)

### Step 1.1 — Check if Rust is already installed
```powershell
rustup --version
```
- If you see a version number (e.g. `rustup 1.27.0`) → skip to Step 1.3
- If you see an error "not recognized" → go to Step 1.2

### Step 1.2 — Install Rust
```powershell
winget install Rustlang.Rustup
```
**After it finishes:** Close PowerShell completely. Open a new PowerShell window. Then:
```powershell
rustup default stable
rustup target add x86_64-pc-windows-msvc
```

### Step 1.3 — Verify Rust works
```powershell
rustc --version
cargo --version
```
Both should print version numbers. If not, restart your terminal and try again.

### Step 1.4 — Run AetherFlow as a native Windows app (first time)
```powershell
cd C:\Users\Yashpreet_o7\Desktop\AetherFlow
npm run tauri:dev
```
**IMPORTANT:** The first run downloads and compiles many Rust packages. This takes **5–10 minutes**. Do not cancel it. You will see lots of "Compiling..." messages — this is normal.

When it's done, a real Windows application window will open with the AetherFlow UI.

### Step 1.5 — Verify it works
- [ ] A Windows app window opens (not a browser tab)
- [ ] The sidebar shows: Home, Marketplace, Library, Settings
- [ ] Clicking a wallpaper on the Home page activates it
- [ ] The status bar at the bottom shows FPS counter

### Step 1.6 — Update HANDOFF.md
Change the status line at the top of `HANDOFF.md` from:
```
> **Status:** 🟡 FRONTEND COMPLETE
```
To:
```
> **Status:** ✅ NATIVE APP RUNNING — ready for packaging
```

---

## TASK 2 — Generate Wallpaper Preview Images

**What this does:** Creates thumbnail `.webp` images for each wallpaper so they show up in the marketplace and library cards instead of "Preview unavailable".

**Estimated time:** 10 minutes

### Step 2.1 — Create the previews directory
```powershell
mkdir C:\Users\Yashpreet_o7\Desktop\AetherFlow\public\previews 2>$null
```

### Step 2.2 — Generate placeholders
Since we can't auto-screenshot Canvas animations, create colored placeholder images.

Create the file `C:\Users\Yashpreet_o7\Desktop\AetherFlow\scripts\generate-previews.html`:
```html
<!DOCTYPE html>
<html>
<body>
<canvas id="c" width="320" height="180"></canvas>
<script>
const previews = [
  { id: 'matrix-rain',      bg: '#000000', accent: '#00ff41', label: 'Matrix Rain' },
  { id: 'cyber-particles',  bg: '#030a0f', accent: '#00d4ff', label: 'Cyber Particles' },
  { id: 'synthwave-grid',   bg: '#0d0019', accent: '#ff2d78', label: 'Synthwave Grid' },
  { id: 'deep-space',       bg: '#000005', accent: '#8800cc', label: 'Deep Space' },
  { id: 'tokyo-rain',       bg: '#0a001a', accent: '#b400ff', label: 'Tokyo Rain' },
  { id: 'aurora',           bg: '#000810', accent: '#00ff88', label: 'Aurora' },
  { id: 'audio-spectrum',   bg: '#050010', accent: '#ff2d78', label: 'Audio Spectrum' },
]
const c = document.getElementById('c')
const ctx = c.getContext('2d')

previews.forEach(p => {
  ctx.fillStyle = p.bg
  ctx.fillRect(0, 0, 320, 180)
  const g = ctx.createRadialGradient(160, 90, 10, 160, 90, 120)
  g.addColorStop(0, p.accent + '44')
  g.addColorStop(1, 'transparent')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, 320, 180)
  ctx.fillStyle = p.accent
  ctx.font = 'bold 16px monospace'
  ctx.textAlign = 'center'
  ctx.fillText(p.label, 160, 95)
  const link = document.createElement('a')
  link.download = p.id + '.png'
  link.href = c.toDataURL()
  link.click()
})
</script>
</body>
</html>
```

Open this HTML file in a browser. It will download 7 PNG files. Move them to `public/previews/` and rename with `.webp` extension (or keep `.png` and update the paths in `src/engines/index.js` from `.webp` to `.png`).

### Step 2.3 — Update preview paths in engine registry
If you saved them as `.png`, open `src/engines/index.js` and change all `preview:` entries:
```js
// Change this:
preview: '/previews/matrix-rain.webp',
// To this:
preview: '/previews/matrix-rain.png',
```

### Step 2.4 — Verify
Run `npm run dev`, open http://localhost:1420/, go to Home page.
The wallpaper cards should now show colored preview images instead of blank areas.

---

## TASK 3 — Connect Marketplace (Optional, needs internet)

**What this does:** Enables the Marketplace page to actually load and publish community wallpapers. Without this, the Marketplace works in "offline mode" showing only built-in wallpapers.

**Estimated time:** 20 minutes

### Step 3.1 — Create Supabase account
1. Go to https://supabase.com
2. Click "Start your project" → sign up with GitHub or email
3. Create a new project (choose a region close to India, e.g. ap-south-1)
4. Wait for project to initialize (~2 minutes)

### Step 3.2 — Get your credentials
In Supabase dashboard:
1. Click "Settings" (gear icon, left sidebar)
2. Click "API"
3. Copy "Project URL" and "anon public" key

### Step 3.3 — Create .env file
Create the file `C:\Users\Yashpreet_o7\Desktop\AetherFlow\.env`:
```
VITE_SUPABASE_URL=https://YOUR_PROJECT_ID.supabase.co
VITE_SUPABASE_ANON_KEY=eyJh...your_anon_key...
```
Replace the values with what you copied from Supabase.

### Step 3.4 — Create database tables
In Supabase dashboard, click "SQL Editor", then run this:
```sql
-- Wallpapers table
CREATE TABLE wallpapers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  author_id UUID REFERENCES auth.users,
  name TEXT NOT NULL,
  description TEXT,
  tags TEXT[],
  preview_url TEXT,
  package_url TEXT,
  downloads INT DEFAULT 0,
  likes INT DEFAULT 0,
  is_featured BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Security: anyone can read, only authors can insert their own
ALTER TABLE wallpapers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read" ON wallpapers FOR SELECT USING (true);
CREATE POLICY "Auth insert" ON wallpapers FOR INSERT WITH CHECK (auth.uid() = author_id);

-- Storage bucket for files
INSERT INTO storage.buckets (id, name, public) VALUES ('wallpapers', 'wallpapers', true);

-- Function for incrementing likes
CREATE OR REPLACE FUNCTION increment_likes(row_id UUID)
RETURNS void AS $$
  UPDATE wallpapers SET likes = likes + 1 WHERE id = row_id;
$$ LANGUAGE sql SECURITY DEFINER;
```

### Step 3.5 — Verify
```powershell
cd C:\Users\Yashpreet_o7\Desktop\AetherFlow
npm run dev
```
Open http://localhost:1420/marketplace — the "Offline" badge should disappear. You should see "Featured" wallpapers (empty at first, which is correct).

---

## TASK 4 — Build Windows Installer (Final Step)

**What this does:** Creates a `.exe` installer file anyone can double-click to install AetherFlow.

**Requirements:** Rust must be installed (Task 1 must be complete).

### Step 4.1 — Build the installer
```powershell
cd C:\Users\Yashpreet_o7\Desktop\AetherFlow
npm run tauri:build
```
This takes 3–10 minutes. You'll see Rust compilation output.

### Step 4.2 — Find the installer
The installer will be at:
```
C:\Users\Yashpreet_o7\Desktop\AetherFlow\src-tauri\target\release\bundle\nsis\AetherFlow_1.0.7_x64-setup.exe
```

### Step 4.3 — Verify
Double-click the `.exe` to install AetherFlow. It should install and launch normally.

---

## TASK 5 — Future Feature: Theme Editor (Not Started)

This is a visual editor where users can customize theme colors with color pickers.

**Where to add it:** Create `src/components/ThemeEditor/index.jsx`

**What it should do:**
1. Show color pickers for each CSS custom property (`--color-brand`, `--color-accent`, etc.)
2. Live-preview changes by calling `document.documentElement.style.setProperty('--color-brand', newColor)`
3. Save the custom theme to the Zustand store via `useStore.getState().saveCustomTheme(id, tokens)`
4. Show a "Save Theme" button that names the theme
5. Add the saved theme to the themes list on the Home page

**Do NOT start this task until Tasks 1–3 are complete.**

---

## TASK 6 — Future Feature: Video Wallpaper Support (Not Started)

Allow users to use a local MP4/WebM video file as a wallpaper.

**Where to add it:** Create `src/engines/video-player.js`

**What it should do:**
1. Accept a `videoPath` in options (local file path or URL)
2. Use an `<video>` element (NOT canvas) positioned behind all other windows
3. Set `video.loop = true`, `video.muted = true`, `video.autoplay = true`
4. Add a `pause()` method called when `pauseOnBattery` or `pauseOnFullscreen` is active

**Note:** This will need a new Tauri command in `src-tauri/src/main.rs` to access local files.

---

## Completion Checklist

Mark these off as you complete them:

- [x] TASK 1: Rust installed + `npm run tauri:dev` works → native window opens
- [x] TASK 2: Preview images exist in `public/previews/` → cards show thumbnails
- [x] TASK 3: `.env` created + Supabase tables created → marketplace is live
- [x] TASK 4: `npm run tauri:build` → installer .exe created
- [x] TASK 5: Theme editor built
- [x] TASK 6: Video wallpaper support (with MPV hardware acceleration)
- [x] TASK 7: FPS throttle pacing + FPS Benchmark HUD Wallpaper
- [x] TASK 8: Pruned repository (removed `.agents/` tracking, unused assets, and debug binaries)
- [x] TASK 9: Native Win32 Translucent Taskbar (Clear, Acrylic, Blur, Default)
- [x] TASK 10: YouTube & Live Web Stream Wallpapers (embedded iframes + instant thumbnails)
- [x] TASK 11: In-App GitHub Releases Auto-Updater (Settings check + startup toast notification)
- [x] TASK 12: Community Marketplace Backend & Live Database Migration (Supabase RPCs, 20-wallpaper catalog, real-time likes & installs, Staff Pick curation, My Submissions)
- [x] TASK 13: Release v1.0.7 (Hover default thumbnail mode with Zustand migration v2, Viewport Lazy Loading and off-screen unloading via IntersectionObserver, Home top preview hero synchronization, YouTube thumbnail CORS fix)
- [x] TASK 14: Custom Theme Studio & Import/Export System (Draft mode non-intrusive preview, JSON export to clipboard/file, theme import with token validation and normalization, starter presets)
- [x] TASK 15: Dedicated Account Tab in Settings (Authenticated vs Guest states, live Supabase & local storage diagnostics, user profile card)
- [x] TASK 16: Win32 Occlusion, Multi-Monitor Pausing & Audio Policies Overhaul (pause on maximized windows, per-monitor Z-order occlusion engine, isolated vs global pausing, mute when covered vs mute when focused vs always active, borderless fullscreen F11 detection, verified by user)
- [x] TASK 16.1: MPV Video Engine Self-Occlusion & Global/Isolated State Desync Fix (excluded MPV child PIDs/HWNDs and desktop window hierarchy from occlusion engine, added MONITOR_SYNC_REQUESTED atomic flush on setting/mode switch, resolved secondary display unmuting in set_mpv_mute)
- [x] TASK 16.2: Multi-Monitor Isolated Pausing & NULL-Handle Occlusion Bugfix (fixed `0 == 0` NULL-handle trap on `parent == shell_hwnd/progman` in `enum_occlusion_proc`, replaced state-wiping `paused_monitors.clear()` with deterministic `force_sync` reconciliation, scoped isolated audio muting strictly to the active audio source monitor, added store migration v3 with `pauseOnMaximized: true` fallback)
- [x] TASK 16.3: "Mute When Covered" Occlusion Decoupling & Audio Source Routing (decoupled physical display occlusion from animation pause preferences so mute-covered functions even if pauseOnMaximized is false, added dynamic audio source display tracking for MPV and Webview, broadcast mute events to both MPV processes and all WebView windows)
- [x] TASK 17: UI/UX Redesign & Modernization on `ui/ux` branch (Design evaluation of `ui improvement ideas/` reference mockups, layout, typography, glassmorphic hierarchy, ThemeWireframePreview, Instant Accent Override with custom hex picker, Interface Density toggle, and TaskbarWireframeIllustration)
- [x] TASK 18: Lively v2.1 Advanced Features & Screensaver Multi-Monitor Engine
  - [x] 18.1: 16×8 Grid Desktop Coverage Diagnostic Visualizer (128 sampling tiles per display, real-time bitmask calculation in Win32, interactive live visualizer in Settings Performance tab)
  - [x] 18.2: Visualizer Audio Source Hardware Device Selection & VU Meter (dynamic input enumeration, fallback on disconnect, live decibel bar, 10s auto-stop test in Settings)
  - [x] 18.3: Picture Wallpaper Choose a Fit & Color Matte (fill, fit, stretch, center, tile modes with custom background color picker and color presets)
  - [x] 18.4: Monitor Display Ordering & Clean Labeling (Primary monitor sorted first as `Display 1 (Primary)`, friendly display names across diagnostic grid, audio routing, and home pills)
  - [x] 18.5: Screensaver Core Engine (Win32 idle detection, grace period, lock on resume, luxury HUD clock/date, wallpaper pausing synchronization, unclosable/freeze bugfix)
  - [x] 18.6: Screensaver Multi-Monitor Edge Polish:
    - [x] Eliminate WebView2 white background flash on secondary monitor (`Screen 2`) during initial initialization (`Color(0,0,0,255)` + `.visible(false)` + CSS `transition: none !important;`)
    - [x] Ensure tray-activated screensaver uses hardware `rcMonitor` across all secondary displays via `MonitorFromPoint` midpoint calculation to prevent sizing gaps
  - [x] 18.7: Impeccable UI Architecture & Dedicated Screensaver Studio:
    - [x] Extracted Screensaver subsystem from crowded settings into a dedicated first-class surface (`/screensaver`) in App navigation and routing (`src/pages/Screensaver.jsx`, `src/App.jsx`).
    - [x] Interactive widescreen ambient OLED simulator with live digital clock HUD, activation presets (1m–30m), visual source mode picker (desktop mirror, procedural engines, OLED blackout), transition fade slider, and security lock/mute policies.
    - [x] Complete redesign of Settings (`/settings`) from a crowded 8-tab horizontal strip into a macOS System Settings / Linear style Master-Detail Two-Column layout with grouped vertical navigation (`Workspace & Display`, `Personalization`, `Audio & Spectrum`, `System & Account`), responsive collapse, and generous breathing room.
  - [x] 18.8: First-Class Sidebar Promotion & TranslucentTB Requirement Notice:
    - [x] Promoted key settings domains out of `/settings` directly into first-class sidebar navigation: Displays & Workspace (`/displays`), Personalization (`/personalization`), Audio (`/audio`), Screensaver (`/screensaver`), and System & Preferences (`/settings`).
    - [x] Restored permanent, prominent Windows 11 TranslucentTB requirement notice, direct Microsoft Store one-click button, TranslucentTB live sync badge, and Explorer recovery button in `/displays`.
    - [x] Added quick navigation cards in `Settings.jsx` directing users immediately to dedicated sidebar pages.
    - [x] Extracted reusable `SettingRow` and `SliderRow` components to eliminate code duplication across settings surfaces.
  - [x] 18.10: Screensaver Window Dismissal Lifecycle, Instant Teardown, In-App Preview & Borderless Blackout Fix:
    - [x] Fixed stuck black screen covering desktop upon screensaver dismissal and app closing: replaced asynchronous `win.close()` with synchronous native Win32 `win.hide()`, `ShowWindow(raw, SW_HIDE)`, `DestroyWindow(raw)`, and `win.destroy()`.
    - [x] Added `dismiss_screensaver` call into main window `CloseRequested` handler and `trigger_screensaver` entry so no screensaver windows can ever linger or block the desktop when closing the app or launching new previews.
    - [x] Fixed in-app preview from Screensaver Studio: aligned Serde camelCase deserialization (`ScreensaverSettings`), fixed `trigger_screensaver({ isPreview: true })` parameter passing, and added automatic mode switching to `'specific'` when clicking any procedural engine card.
    - [x] Enhanced Screensaver Studio simulator stage: rendered an animated OLED Pure Blackout starry sleep visualization with status badge when in blackout mode, ensuring the preview stage is never a dead black box.
    - [x] Eliminated 8px transparent borders on left, right, and bottom of both screens without monitor seam overlap: enabled `.transparent(false)` with `background_color(Color(0,0,0,255))` on screensaver window, stripped `WS_EX_LAYERED`, configured true borderless `WS_POPUP` style, and synchronized child WebView2 size to physical monitor rects.
  - [x] 18.11: Screensaver Seamless Fullscreen Hardware Pinning & Desktop Wallpaper Preservation:
    - [x] Fixed black desktop upon screensaver dismissal: Eliminated `win.hide()` calls on `wallpaper_` child windows of WorkerW in `trigger_screensaver`. Reparented WorkerW children lose their DirectComposition render targets if hidden with `SW_HIDE`. Wallpaper is now kept alive and paused in place, resuming instantly with 0ms black-screen glitch.
    - [x] Eliminated Windows 11 DWM white border and 8px inset gap on screensaver windows:
      - Enabled `.fullscreen(true)` on `WebviewWindowBuilder`.
      - Injected Win32 `DwmSetWindowAttribute(raw, 34 /* DWMWA_BORDER_COLOR */, &0xFFFFFFFE /* DWMWA_COLOR_NONE */, 4)` to suppress Windows 11 active window accent border.
      - Removed `EnumChildWindows` manual resize loop that disrupted WebView2's internal compositor swapchain.
      - Enforced `border: none !important; outline: none !important; box-shadow: none !important;` in `wallpaper.html` and `src/wallpaper.jsx`.
    - [x] Refined screensaver user-input wake sensitivity: increased mouse wake distance threshold to 40px and grace period to 1500ms so initial button release never causes accidental instant dismissal.
    - [x] Added native desktop wallpaper restoration via `SystemParametersInfoW(SPI_SETDESKWALLPAPER)` on `stop_wallpaper` and app `quit` to prevent empty black desktop.
  - [x] 18.12: Screensaver Smart Suppression & Wallpaper Fullscreen Pause Restoration:
    - [x] Added smart trigger inhibition rules (`inhibit_fullscreen`, `inhibit_maximized`, `inhibit_audio`) preventing screensaver from interrupting while watching anime, movies, YouTube, or playing video games.
    - [x] Implemented native Win32 WASAPI peak audio meter (`is_system_audio_active()`) and shell presentation detector (`is_presentation_or_d3d_fullscreen()`).
    - [x] Fixed wallpaper resume bug on screensaver dismissal: replaced unconditional unpause with atomic `MONITOR_SYNC_REQUESTED` reconciliation, ensuring wallpaper remains paused and audio remains muted while any app is fullscreen or maximized.
    - [x] Added "Smart Trigger & Media Suppression" setting card in Screensaver Studio (`Screensaver.jsx`) with persisted Zustand toggles (`useStore.js`).
- [x] TASK 19: Smooth Transactional Wallpaper Transitions & Rapid Switching Race Condition Elimination:
  - [x] Diagnosed root causes: premature wallpaper destruction/hiding before new wallpaper ready, concurrent IPC named pipe collisions across rapid clicks, and non-interactive window station isolation.
  - [x] Implemented monitor-scoped transactional apply tickets (`MONITOR_APPLY_TICKETS` in Rust, `monitorApplyTransactions` in JS) with monotonically increasing IDs.
  - [x] Implemented MPV staging with `alpha = 0`, polling `wait_for_playback` on MPV IPC named pipes until the first frame is ready, and performing atomic swaps where the old wallpaper stays visible until the new wallpaper is ready.
  - [x] Added stale request discard: superseded in-flight jobs immediately detect ticket obsolescence, terminate early, and clean up staging resources without touching active wallpaper or exposing desktop.
  - [x] Protected normal, custom, canvas, and locker wallpapers: retained existing HWNDs, WorkerW pinning, and visibility without recreation or unpinning, ensuring zero 80% WebView popups.
  - [x] Added WinSta0 window station and desktop attachment at process startup.
  - [x] Verified with automated end-to-end test suite (`scratch/run_full_transition_suite.ps1`): rapid A -> B -> C -> D switching, Video <-> Canvas transitions, and 0 popup windows verified.
- [x] TASK 20: Playlist Auto-Rotation, Mass Batch Ingestion, Hybrid Storage Engine & Watch Folder:
  - [x] 20.1: Hybrid Storage Strategy (`src-tauri/src/main.rs`, `src/lib/storageManager.js`): copy files < 50MB to `%APPDATA%\AetherFlow\library\` for self-containment; reference files >= 50MB in-place with `storageType: 'reference'`; added `get_file_metadata`, `batch_import_media_files`, and `get_library_storage_stats`.
  - [x] 20.2: Batch Ingestion & Recursive Folder Scanning: upgraded dialog to `multiple: true`, added batch drag-and-drop listener, created `BatchImportModal` with live progress and auto-playlist creation, and added `scan_directory_media` for folder import.
  - [x] 20.3: Native Background Watch Folder: Rust monitor loop scans watch folder every 4.5s, detects newly added files, emits `aether:watch-folder-new-items`, and auto-ingests into library.
  - [x] 20.4: Playlist Auto-Rotation Engine: multi-playlist Zustand state with non-repeating shuffle cycle pools and sequential modes; Rust background timer thread evaluates `PLAYLIST_TIMERS` every 750ms and emits rotation triggers with screensaver inhibition.
  - [x] 20.5: Dedicated Playlist Studio & Settings UI: added `/playlists` route and sidebar navigation item; built Master-Detail Playlist Studio (`Playlists.jsx`) with live active toggles, target monitor scope assignment, interval presets (1m-24h), and interactive wallpaper picker; added "Storage & Watch Folder" section in `Settings.jsx`.
- [x] TASK 21: Community Hub Auth & Admin Security Overhaul:
  - [x] 21.1: Gated `submitWallpaper()` and Submit tab behind authentication; unauthenticated users see clean sign-in callout.
  - [x] 21.2: Gated `getUserSubmissions()` and My Submissions tab behind authentication; removed anonymous localStorage fallback merging.
  - [x] 21.3: Completely eradicated hardcoded plaintext admin passcodes (`aether-admin`, `aetherflow-admin`, `admin123`) and `verifyAdminPasscode()`.
  - [x] 21.4: Removed admin passcode modal, input form, and "Moderator Access" button from UI.
  - [x] 21.5: Implemented automatic email-based admin resolution (`VITE_ADMIN_EMAILS` / user metadata) and added internal `requireAdmin()` gate on all moderation actions.
  - [x] 21.6: Removed `communityAdminUnlocked` state, setter, and partialize persistence from `useStore.js`.
- [x] TASK 22: System Tray Upgrades, Collision-Free Customizable Global Hotkeys & Desktop / File Explorer Context Menus:
  - [x] 22.1: Collision-Free Built-in Hotkeys: Engineered built-in defaults strictly avoiding PowerToys and Windows 11 system hotkeys using `Ctrl+Alt+[Letter]` (Next: `Ctrl+Alt+N`, Prev: `Ctrl+Alt+P`, Pause: `Ctrl+Alt+W`, Mute: `Ctrl+Alt+M`, Icons: `Ctrl+Alt+D`, Screensaver: `Ctrl+Alt+S`, Open: `Ctrl+Alt+A`).
  - [x] 22.2: Fully Customizable Key Recorder: Built interactive `ShortcutRecorder` UI in `Settings.jsx` supporting live key capture, Escape to cancel, dynamic unbind/rebind via `tauri-plugin-global-shortcut`, and one-click "Reset Defaults".
  - [x] 22.3: Native System Tray Upgrades: Added Open, Next, Prev, Pause/Resume, Mute/Unmute, Stop, Toggle Desktop Icons, Taskbar Style Submenu (Translucent, Blur, Acrylic, Clear, Default), Screensaver, and Quit.
- [x] TASK 24: Direct Media Uploads to GitHub Releases CDN, CORS Resolution & Streamlined Submit UI:
  - [x] 24.1: Direct Media Threshold Expansion: Supported up to 150 MB video loops and 50 MB picture artwork directly on GitHub Releases CDN (`wallpapers-v1`), storing zero media bytes in Supabase Storage.
  - [x] 24.2: Native Rust CORS Elimination: Implemented native Rust `upload_release_asset` and `delete_release_asset` in `main.rs` using `reqwest` streaming directly from disk, bypassing browser XHR CORS preflight limitations on `uploads.github.com`.
  - [x] 24.3: Streamlined Submit UI: Overhauled Submit Wallpaper tab into a balanced 2-column layout with media type selector (`Video Loop`, `Picture / Art`, `YouTube Stream`, `Web Stream URL`), drag-and-drop file staging, live format/resolution/duration/audio metadata chips, and non-blocking guest notice.

- [x] TASK 25: Hybrid Community Wallpaper Storage Architecture & Artist Licensing:
  - [x] 25.1: Global Storage Behavior Preference: Implemented global `communityStorageMode` setting in `Settings.jsx` under "Storage & Watch Folder" with three modes:
    - `Stream & Cache` (Default Option C): First click streams immediately from CDN (zero wait, instant gratification), caches silently in background to `%APPDATA%\com.aetherflow.app\wallpapers\community_<id>.<ext>` so loops & subsequent Windows boots are 100% offline-safe.
    - `Stream Only` (Option B): Always streams directly from CDN without consuming local disk space.
    - `Always Download` (Option A): Pre-downloads complete binary to disk before starting playback.
  - [x] 25.2: Native Rust Caching & Free Space Pipeline: Implemented `cache_community_wallpaper` (streaming chunks, progress reporting via `aether:community-download-progress`, atomic `.part` rename) and `remove_local_community_wallpaper` in `src-tauri/src/main.rs`.
  - [x] 25.3: Library Per-Item Overrides & Storage Telemetry: Added Storage Telemetry Header in `Library.jsx` (`Local Storage: X MB · Cloud Stream: Y items (~Z GB drive space saved)`), `LOCAL` / `CLOUD` badges on wallpaper cards (grid & list), context menu actions (`Download Offline`, `Free Up Space`), and granular item management without deleting cloud entries.
  - [x] 25.4: Artist Attribution & Licensing Integration: Added `Artist Portfolio / Social Link (Optional)` and `License` dropdown (defaulting to `CC BY-NC-ND 4.0 (Recommended for Artists)`) to the Submit form; displayed clickable `By Author ↗` (opens in system browser via Tauri `open_url`) and `[CC BY-NC-ND]` badge on Catalog Cards, Preview Modals, and Library Cards.

- [x] TASK 26: Community Most Popular/Liked Filters & Sorting, Decouple Community Apply from Library, and Expanded System Tray Quick Controls:
  - [x] 26.1: Zero Fake Likes & Real Metrics Calculation (`src/lib/curatedCatalog.js`, `src/lib/community.js`):
    - Reset all 45+ wallpapers in `curatedCatalog.js` to `likes: 0, downloads: 0` (zero mock engagement).
    - Removed the synthetic hash generator from `community.js` that was producing fake counts like 345 on like.
    - `getWallpaperMetrics()` now returns real counts: unliked starts at `0 likes`, liking immediately displays `1 like`, unliking reverts to `0 likes`.
    - Upgraded `searchCatalog()` with normalized ID prefix lookups, user-like boosting, multi-level tie-breaking, and filter modes (`filterMode === 'popular'` and `filterMode === 'liked'`).
  - [x] 26.2: Community UI Filter Integration (`src/pages/Community.jsx`):
    - Added `🔥 Most Popular` and `❤️ Most Liked` to the Curation filter dropdown with 1-click active filter chip dismissals.
    - Elevated `Most Popular` and `Most Liked` in the Sort selector dropdown.
    - Added dedicated empty state for `❤️ Most Liked` when no wallpapers have been favorited yet.
  - [x] 26.3: Decouple Community Apply from Library (`src/pages/Community.jsx`):
    - Removed `installItem(item)` and `pinToHome(item.id)` from `handleInstall()`. Applying now directly streams and activates on the desktop without adding to `useStore.installed`.
    - Removed auto-library addition from `handleLike()`. Adding to Library remains strictly explicit via `+ Library` or `Download Offline`.
  - [x] 26.4: Win32 System Tray Quick Controls (`src-tauri/src/main.rs`, `src/App.jsx`):
    - Added native Win32 submenus for **Volume** (100%, 80%, 60%, 40%, 20%, Mute), **Brightness** (100%, 85%, 70%, 50%, 30%), **Playback Speed** (2.0x, 1.5x, 1.25x, 1.0x, 0.75x, 0.5x), and **Opacity** (100%, 85%, 70%, 50%, 30%).
    - Bound native Win32 menu events to MPV and WebViews, emitting `aether:tray:set-*` events for real-time bidirectional synchronization with Zustand store state and in-app HUD sliders.
  - [x] 26.5: Standalone Binary Deployment:
    - Built frontend (`npm run build` in 509ms) and compiled release binary (`cargo build --release` in 2m 18s).
    - Deployed `AetherFlow.exe` (7.83 MB) and verified running process under PID 24272.





