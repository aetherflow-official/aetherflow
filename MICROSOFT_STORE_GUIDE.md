# Microsoft Store Release Guide for AetherFlow

This document outlines everything needed to submit and release **AetherFlow** on the official **Microsoft Store**.

---

## 1. Prerequisites

1. **Microsoft Partner Center Account:**
   - Sign up at: [https://partner.microsoft.com/dashboard](https://partner.microsoft.com/dashboard)
   - Individual account registration fee: ~$19 USD (one-time). Company account: ~$99 USD.
2. **Windows 10/11 Machine:**
   - With Windows SDK tools (already configured in this repository).

---

## 2. Step-by-Step Submission Process

### Step 1: Reserve Your Product Name
1. In Microsoft Partner Center, go to **Apps and games** -> **New product** -> **MSIX or PWA app**.
2. Enter `AetherFlow` (or your preferred name) and click **Check availability** -> **Reserve product name**.

---

### Step 2: Retrieve Your Product Identity
1. In your app dashboard on Partner Center, navigate to **Product management** -> **Product Identity**.
2. Note down the three values shown:
   - **Package/Identity/Name** (e.g. `12345YourName.AetherFlow`)
   - **Package/Identity/Publisher** (e.g. `CN=A1B2C3D4-E5F6-7890-ABCD-EF1234567890`)
   - **Package/Properties/PublisherDisplayName** (your publisher name)

---

### Step 3: Build the Store-Ready MSIX Package
Run the following PowerShell command in the project root, substituting your Partner Center identity values:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/package_msix.ps1 `
    -PackageName "YOUR_PARTNER_CENTER_PACKAGE_NAME" `
    -Publisher "YOUR_PARTNER_CENTER_PUBLISHER_CN" `
    -PublisherDisplayName "YOUR_DISPLAY_NAME" `
    -SkipSign
```

*(Note: `-SkipSign` is used because Microsoft Store automatically ingests and signs the package with Microsoft Corporation's official Store certificate during submission).*

The output package will be generated at:
```
packages\AetherFlow_1.1.1_x64.msix
```

---

### Step 4: Fill Out the Store Submission Listing

In Partner Center, start a **New submission** and fill out the sections:

#### A. Pricing and Availability
- **Price:** Free
- **Markets:** All markets (worldwide) or your choice.

#### B. Properties
- **Category:** Personalization > Wallpaper & Themes
- **Support contact info:** Your email or GitHub issues URL (`https://github.com/yashpreeto7/aetherflow/issues`)
- **Privacy policy URL:** 
  ```
  https://github.com/yashpreeto7/aetherflow/blob/main/PRIVACY.md
  ```

#### C. Age Ratings (IARC)
- Complete the standard short questionnaire. (AetherFlow contains no violence, gambling, or offensive content -> rated 3+ / Everyone).

#### D. Packages
- Drag and drop `packages\AetherFlow_1.1.1_x64.msix` into the upload zone.
- Partner Center will validate the package structure, manifest, and icons automatically.

#### E. Mandatory Capability Declaration (`runFullTrust`)
Because AetherFlow uses the desktop bridge capability `runFullTrust` to interact with the Windows desktop layer and MPV, Partner Center will ask for a short explanation. Enter:
> *"AetherFlow is a high-performance desktop wallpaper engine. It requires runFullTrust to pin wallpaper render canvases to the Windows desktop WorkerW layer, enumerate multi-monitor displays, perform local audio visualization, and host playback processes via MPV."*

#### F. Store Listing (Text & Visuals)
- **Description:** 
  > *AetherFlow is a next-generation, high-performance live wallpaper and visual engine for Windows. Featuring fluid Canvas 2D engines, MPV video acceleration, reactive audio spectrums, multi-monitor spanning, and community wallpaper sharing—engineered to use less than 30MB of RAM.*
- **Features:**
  - Ultra-lightweight: ~30MB idle RAM usage
  - 60 FPS Canvas 2D & MPV hardware-accelerated video playback
  - Real-time Audio Reactive visualizer
  - Multi-monitor support with per-display wallpaper staging
  - Community marketplace for browsing and sharing wallpapers
  - Seamless dark and cyberpunk theme presets
- **Screenshots:**
  - Upload at least 1 desktop screenshot (1920x1080 or 1366x768).

---

### Step 5: Submit for Certification
Click **Submit to the Store**.
- Automated validation takes ~10–30 minutes.
- Manual certification review usually completes within **24 to 48 hours**.
- Once approved, AetherFlow will be publicly live in the Microsoft Store worldwide!
