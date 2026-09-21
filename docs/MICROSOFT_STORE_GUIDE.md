# Microsoft Store Release Guide for AetherFlow

This document outlines everything needed to submit and release **AetherFlow** on the official **Microsoft Store**.

---

## 1. Prerequisites

1. **Microsoft Partner Center Account:**
   - Sign up / log in at: [https://partner.microsoft.com/dashboard](https://partner.microsoft.com/dashboard)
2. **App Name Reserved:**
   - App Name: `AetherFlow` (Already registered)

---

## 2. Product Identity (Required for Packaging)

In your Microsoft Partner Center dashboard:
1. Go to **Apps and games** -> Click **AetherFlow**.
2. In the left navigation menu, navigate to **Product management** -> **Product Identity**.
3. Locate the three identity values:
   - **Package/Identity/Name** (e.g. `12345YourName.AetherFlow`)
   - **Package/Identity/Publisher** (e.g. `CN=XXXXXXXX-XXXX-XXXX-XXXX-XXXXXXXXXXXX`)
   - **Package/Properties/PublisherDisplayName** (e.g. `Yashpreet`)

---

## 3. Generating the Store-Ready MSIX Package

Run the packaging script in PowerShell with your Partner Center identity values:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/package_msix.ps1 `
    -PackageName "YOUR_PARTNER_CENTER_PACKAGE_NAME" `
    -Publisher "YOUR_PARTNER_CENTER_PUBLISHER_CN" `
    -PublisherDisplayName "YOUR_DISPLAY_NAME" `
    -SkipSign
```

> **Why `-SkipSign`?**  
> Microsoft Store automatically ingests unsigned packages and signs them with Microsoft Corporation's official Store Root Certificate during publishing.

The output package will be generated at:
```
packages\AetherFlow_1.0.0_x64.msix
```

---

## 4. Microsoft Partner Center Submission Checklist

Under **AetherFlow** -> **Submissions** -> **Start a submission**:

### A. Pricing and Availability
- **Price:** Free
- **Markets:** All markets (worldwide)
- **Discoverability:** Publicly available

### B. Properties
- **Category:** Personalization > Wallpaper & Themes
- **Support Contact:** `https://github.com/yashpreeto7/aetherflow/issues`
- **Privacy Policy URL:**  
  `https://github.com/yashpreeto7/aetherflow/blob/main/PRIVACY.md`

### C. Age Ratings (IARC)
- Complete the short IARC questionnaire.
- Result: **3+ / Everyone** (No violence, offensive language, or gambling).

### D. Packages
- Drag and drop `packages\AetherFlow_1.0.0_x64.msix` into the upload zone.
- Automated validation will verify the manifest, version `1.0.0.0`, and unplated icon assets.

### E. Capability Justification (`runFullTrust`)
Microsoft will ask why the app requests `runFullTrust`. Paste this pre-approved explanation:
```text
AetherFlow is a high-performance Windows desktop live wallpaper engine. It requires runFullTrust to pin wallpaper render canvases to the Windows desktop WorkerW layer, enumerate multi-monitor displays, perform local real-time audio visualization, and host playback processes via MPV.
```

### F. Store Listing (Copy & Paste)

**Title:**
`AetherFlow — Live Wallpaper & Theme Engine`

**Short Description:**
`Lightweight, high-performance live wallpaper and desktop visual engine for Windows.`

**Full Description:**
```text
AetherFlow is a next-generation, high-performance live wallpaper and desktop visual engine engineered specifically for Windows 10 & 11. 

Key Highlights:
• Fluid 60 FPS Visuals: Canvas 2D and MPV hardware-accelerated playback with near-zero latency.
• Ultra-Lightweight: Idle memory footprint as low as ~30MB to preserve maximum system resources for gaming and work.
• Real-time Audio Reactive Visualizer: Dynamic audio spectrums that dance to your music without storing or transmitting voice/microphone data.
• Multi-Monitor Native: Independent per-display wallpaper staging or seamless desktop spanning across all screens.
• Community Library: Discover, favorite, and publish stunning wallpapers.
• Fully Offline Capable: All core wallpaper engines run locally with zero cloud dependencies.
```

**Features:**
- Ultra-low RAM & CPU footprint (~30MB idle)
- Hardware-accelerated 60 FPS video playback via MPV
- Audio-reactive frequency visualizer
- Multi-monitor support with per-display configuration
- Canvas 2D shaders & generative interactive animations
- Free & open source with complete privacy respect

**Screenshots:**
Located in `docs/screenshots/` ready for upload:
- `docs/screenshots/app_home_controls.png`
- `docs/screenshots/app_community.png`
- `docs/screenshots/app_library.png`
- `docs/screenshots/desktop_matrix_rain.png`
- `docs/screenshots/desktop_cherry_blossom.png`

---

## 5. Certification & Release
Click **Submit to the Store**.
- Automated validation: ~10–15 minutes
- Human certification: typically 24–48 hours
- Status: Live worldwide on the Microsoft Store!
