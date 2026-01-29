# 🛡️ EraseMeta

**Total Privacy. Zero Traces.**  
EraseMeta is a powerful, privacy-first browser extension that automatically strips metadata (EXIF, GPS, author info, and more) from your files before they are uploaded to the web or downloaded from web. 

Processing happens **100% locally** in your browser — your files never leave your computer until they are clean.

---

## ✨ Features

- **🚀 Auto-Clean Uploads**: Automatically intercepts file uploads on any website and strips metadata seamlessly.
- **📥 Clean Downloads**: Option to automatically clean metadata from files you download from the web.
- **🖼️ Universal Support**: 
  - **Images**: JPEG, PNG, WebP, HEIC, TIFF, etc.
  - **Videos**: MP4, MKV, MOV, WEBM (powered by FFmpeg.wasm).
  - **Documents**: PDF, Microsoft Office (Word, Excel, PowerPoint), and OpenOffice.
- **🖱️ "Download Clean" Context Menu**: Right-click any image on a webpage to download a metadata-free version instantly.
- **⚡ High Performance**: Fast, silent processing with a modern, glassmorphic UI.
- **🌓 Dark Mode**: Full system-aware dark mode support.
- **🛡️ Fail-Safe Protection**: Choose between blocking uploads on error or falling back to the original file.

---

## 🛠️ Installation

### Chrome / Edge / Brave
1. Download the latest `EraseMeta_Chrome_v1.0.zip` from the Release page.
2. Unzip the folder.
3. Open `chrome://extensions/` in your browser.
4. Enable **Developer mode** (top right).
5. Click **Load unpacked** and select the unzipped folder.

### Firefox
1. Download `EraseMeta_Firefox_v1.0.zip`.
2. Open `about:debugging#/runtime/this-firefox`.
3. Click **Load Temporary Add-on...** and select `manifest.json` from the unzipped folder.
   *(Note: For permanent installation, use the version from the Firefox Add-ons store.)*

---

## 🏗️ Technical Stack

- **Core**: Vanilla JavaScript (ES Modules), HTML5, CSS3.
- **Processing**:
  - `ffmpeg.wasm`: For high-performance video/audio scrubbing.
  - `pdf-lib`: For PDF metadata removal.
  - `jszip`: For Office document XML manipulation.
- **Identity**: Custom-designed minimalist logo and premium HSL-based design system.

---
