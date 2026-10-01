# JAMES (Just A Machine, Engineered for Speech)

<p align="left">
  <img alt="License: MIT" src="https://img.shields.io/badge/License-MIT-blue.svg">
  <img alt="Platform: WebGPU/WASM" src="https://img.shields.io/badge/Platform-WebGPU%20%7C%20WASM-orange.svg">
  <img alt="Status: 100% Offline" src="https://img.shields.io/badge/Privacy-100%25%20Offline-success.svg">
  <img alt="Built with Vanilla JS" src="https://img.shields.io/badge/Built%20with-Vanilla%20JS-f7df1e.svg?logo=javascript&logoColor=black">
  <img alt="PRs Welcome" src="https://img.shields.io/badge/PRs-welcome-brightgreen.svg">
</p>

![JAMES AI Preview](preview.png)

JAMES is a fully local, browser-native AI assistant designed with privacy as the foundational principle. By leveraging WebAssembly and WebGPU, JAMES runs entirely client-side, ensuring your data never leaves your device. No cloud, no API calls, no accounts—just your machine.

## Core Features

* **100% Private & Local AI:** All processing happens directly within your browser. There is no server communication for model inference.
* **Frictionless Access:** Start chatting instantly. No sign-ups, logins, or accounts are required.
* **Browser-Powered Performance:** Utilizes WASM and WebGPU for fast, hardware-accelerated client-side model execution.
* **Integrated Python Runtime:** Powered by Pyodide, allowing JAMES to execute Python code securely within the browser environment.
* **Scientific Calculators:** Native tools for particle physics, relativity, linear algebra, and differential equations without needing Python.
* **Zero-Delay Smalltalk Engine:** Instantly responds to greetings, jokes, and easter eggs (like HAL 9000 & Portal) without waiting for the heavy LLM to spin up.
* **Playable Minigames:** Play fully interactive, rule-enforced Chess and Checkers directly in the chat with AI-powered moves.
* **Web Search:** Capable of fetching live web content, weather, and Wikipedia summaries on demand.
* **Offline-Capable:** Once the model is cached locally, no active internet connection is needed to chat.
* **Premium Glassmorphic UI:** Features rich CSS-only gradients, sleek slide-up modal animations, and a polished retro-terminal aesthetic.
* **Algorithmic Audio Engine:** Zero-dependency Web Audio API provides satisfying, dynamic sound cues for sending, receiving, and model-load events.
* **Smart Desktop Notifications:** Intelligently alerts you when long-running local generations finish, but only if you've minimized the window or switched tabs.

## Genesis AI & Living Memory

The most significant feature of JAMES is the **Persistent Personal Memory** system. While traditional local LLMs wipe their context the moment you close the tab, JAMES is designed to remember you across sessions without compromising your privacy.

* **Client-Side Encryption:** All memories, notes, and session histories are encrypted and stored exclusively on your device using IndexedDB.
* **Contextual Continuity:** JAMES seamlessly retrieves relevant past interactions to maintain a continuous, living relationship, making conversations increasingly tailored over time.
* **Zero Server Footprint:** Because the memory storage is strictly local, you get all the benefits of a personalized, long-term AI thought partner without ever creating a profile on a corporate server.

## Tech Stack

* **Frontend:** 100% Vanilla JavaScript & HTML5 (`highlight.js` for syntax). Custom state management, optimized to avoid heavy framework overhead.
* **Compute:** WebGPU for accelerated local model execution via Transformers.js
* **Runtime Environments:** ONNX Runtime Web & Pyodide (WASM)
* **Storage:** Unified IndexedDB (via `idb`) for fully asynchronous, blocking-free storage of encrypted chat history, memory, and application configuration.
* **Utilities:** `dayjs` for robust timezone and time-math operations
* **Testing:** Custom zero-dependency automated unit test runner (`tests.html`)

## Getting Started

Try it live at: [chatbotjames.onrender.com](https://chatbotjames.onrender.com)

*(Note: Because the model runs entirely locally, initial load times may vary based on your hardware and network speed as the browser caches the required WebAssembly files and model weights).*

---
**Author:** Andrey Lopukhov
