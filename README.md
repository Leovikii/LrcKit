<div align="center">
  <h1>LrcKit</h1>
  <p>
    <strong>A modern, efficient tool for subtitle conversion and file management.</strong>
  </p>
  <p>
    Built with <a href="https://wails.io">Wails</a>, <a href="https://react.dev">React</a>, and <a href="https://go.dev">Go</a>.
  </p>

  <img src="https://img.shields.io/badge/Platform-Windows-blue?logo=windows" alt="Platform" />
  <img src="https://img.shields.io/github/license/Leovikii/LrcKit" alt="License" />
  <img src="https://img.shields.io/github/v/release/Leovikii/LrcKit" alt="Version" />
</div>

<br />

## 📖 Introduction

**LrcKit** is a lightweight desktop application designed to simplify your music library management. It provides a seamless way to convert subtitle files (VTT/SRT) into LRC format and offers batch cleaning utilities for redundant files.

With a sleek, dark-themed UI and drag-and-drop support, LrcKit makes file processing fast and intuitive.

## ✨ Features

- **🎵 Smart Conversion**: 
  - Convert `.vtt` and `.srt` subtitles to `.lrc` format instantly.
  - Intelligent timestamp parsing and tag removal.
  - Option to auto-delete source files after conversion.

- **🧹 Batch Cleaner**: 
  - Quickly scan and remove redundant files based on custom extensions (e.g., remove all `.wav` or `.flac` source files after encoding).
  - Supports drag-and-drop for bulk operations.

- **🖥️ Modern UI/UX**:
  - **Drag & Drop**: Native OS-level drag and drop support.
  - **Visual Feedback**: Beautiful animations and progress indicators.
  - **Dual Lists**: Separate management for conversion and cleaning tasks.
  - **Status Bar**: Real-time processing status and statistics.

## 📥 Download

Get the latest version for Windows from the [Releases Page](../../releases).

1. Download `LrcKit.exe`.
2. Run it directly (portable, no installation required).

## 🛠️ Build From Source

If you want to modify or build LrcKit yourself, follow these steps:

### Prerequisites

- **Go** (v1.21+)
- **Node.js** (v18+)
- **Wails CLI**: `go install github.com/wailsapp/wails/v2/cmd/wails@latest`

### Steps

1. Clone the repository:
   ```bash
   git clone [https://github.com/Leovikii/LrcKit.git](https://github.com/Leovikii/LrcKit.git)
   cd LrcKit