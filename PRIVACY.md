# Privacy Policy for AetherFlow

**Effective Date:** September 21, 2026  
**Last Updated:** September 21, 2026  

AetherFlow ("we", "our", or "the Application") is a high-performance Windows desktop application designed for live wallpapers, visual audio reactions, and desktop personalization. We are committed to respecting and protecting user privacy.

---

## 1. Information We Collect

### A. Local Device Data (Non-Collected)
- **Settings & Preferences:** Your selected wallpapers, playback rules, monitor mappings, and UI preferences are stored locally on your device using local storage (`localStorage` and local configuration files). This data is never sent to our servers.
- **Microphone & Audio Input:** When Audio Visualization is enabled, audio data is processed **locally and in real-time** on your machine using the Web Audio API to compute frequency spectrums. No audio recordings, streams, or voice data are ever saved, stored, or transmitted.
- **Camera & Video Capture:** AetherFlow does **not** access, record, or stream your webcam or video capture devices.

### B. Cloud & Marketplace Data (Optional)
- **Supabase Authentication:** If you choose to log in or create an account to publish community wallpapers, your email address, username, and authentication tokens are managed securely by Supabase.
- **Community Wallpapers:** Wallpapers and metadata you explicitly upload to the community library become publicly accessible to other AetherFlow users.
- **Third-Party Streaming:** If you play live web streams or video feeds (such as YouTube or direct media streams), network requests are made directly between your machine and the media provider. Those requests are subject to the third-party provider's privacy policy.

---

## 2. Telemetry & Analytics
AetherFlow does **not** employ third-party behavioral trackers, ad networks, or telemetry spyware. Performance metrics (such as FPS, CPU, and RAM usage) displayed in the status bar are calculated locally and never transmitted externally.

---

## 3. Data Storage & Security
- Local preferences reside entirely within the user's Windows AppData directory or sandboxed package container.
- Cloud data (for authenticated community users) is encrypted in transit (HTTPS / TLS 1.3).

---

## 4. Third-Party Services
AetherFlow may interact with the following third-party services:
- **Supabase:** Authentication and Community wallpaper registry.
- **GitHub:** For checking software updates (when using the updater module).
- **YouTube / Media CDNs:** For streaming web-hosted wallpaper content requested by the user.

---

## 5. Children's Privacy
AetherFlow is suitable for general audiences and does not knowingly collect personal information from children under 13.

---

## 6. Open Source Transparency
AetherFlow's source code is publicly accessible on GitHub at:  
https://github.com/yashpreeto7/aetherflow

---

## 7. Contact
For questions, support, or privacy inquiries:
- **Project Repository:** https://github.com/yashpreeto7/aetherflow/issues
- **Developer:** Yashpreet
