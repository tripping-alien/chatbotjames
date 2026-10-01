class UIManager {
    constructor() {
        // NOTE: Do NOT look up DOM elements here — this constructor runs at
        // module-import time, before DOMContentLoaded. Use lazy getters below.
        this._cmdInput = null;
        this._sendBtn = null;
        this.statusTextEl = null;
        this.progressFillEl = null;
        this.statusMetaEl = null;
        this.activeModelLabel = null;
        this.applyModelBtn = null;
    }

    // ── Lazy DOM getters: resolved on first access after DOM is ready ──────────
    get cmdInput() {
        if (!this._cmdInput) {
            this._cmdInput = document.getElementById('cmdInput')
                || document.getElementById('userInput')
                || document.getElementById('user-input');
        }
        return this._cmdInput;
    }

    get sendBtn() {
        if (!this._sendBtn) {
            this._sendBtn = document.getElementById('sendBtn')
                || document.getElementById('sendButton')
                || document.getElementById('send-button');
        }
        return this._sendBtn;
    }

    // ── Resolve remaining elements lazily on first real use ───────────────────
    _resolveElements() {
        if (!this.statusTextEl) this.statusTextEl = document.getElementById('statusText');
        if (!this.progressFillEl) this.progressFillEl = document.querySelector('.progress-fill');
        if (!this.statusMetaEl) this.statusMetaEl = document.querySelector('.status-meta');
        if (!this.activeModelLabel) this.activeModelLabel = document.getElementById('activeModelLabel');
        if (!this.applyModelBtn) this.applyModelBtn = document.getElementById('applyModelBtn');
    }

    setIdleState(isIdle, isGeneratingUIFlagCallback) {
        const input = this.cmdInput;
        const btn = this.sendBtn;
        if (!input || !btn) return;
        if (isIdle) {
            input.disabled = false;
            btn.innerHTML = '&#10132;';
            btn.classList.remove('stop-btn');

            input.classList.remove('loading-state');
            input.placeholder = "\uD83D\uDCAC Message JAMES...";
            input.focus();
            if (isGeneratingUIFlagCallback) isGeneratingUIFlagCallback(false);
        } else {
            input.disabled = true;
            input.classList.add('loading-state');
            input.placeholder = "\u23F3 Generating response...";

            btn.innerHTML = '&#9208;';
            btn.classList.add('stop-btn');
            if (isGeneratingUIFlagCallback) isGeneratingUIFlagCallback(true);
        }
    }

    updateStatusText(text) {
        this._resolveElements();
        if (this.statusTextEl) this.statusTextEl.textContent = text;
    }

    updateStatusMeta(text) {
        this._resolveElements();
        if (this.statusMetaEl) this.statusMetaEl.innerText = text;
    }

    updateProgress(percent) {
        this._resolveElements();
        if (this.progressFillEl) this.progressFillEl.style.width = `${percent}%`;
        const container = document.getElementById('progressContainer');
        if (container) {
            const val = Math.max(0, Math.min(100, Math.round(percent)));
            container.setAttribute('aria-valuenow', String(val));
            if (val > 0 && val < 100) {
                container.removeAttribute('aria-hidden');
                container.setAttribute('aria-valuetext', `${val} percent downloaded`);
            } else {
                container.setAttribute('aria-hidden', 'true');
            }
        }
    }

    updateActiveModelLabel(label) {
        this._resolveElements();
        if (this.activeModelLabel) this.activeModelLabel.textContent = `Active: ${label}`;
        if (this.applyModelBtn) this.applyModelBtn.disabled = true;
    }

    resetApplyModelBtn() {
        this._resolveElements();
        if (this.applyModelBtn) this.applyModelBtn.disabled = false;
    }

    closeSidebar() {
        document.getElementById('sidebar')?.classList.add('collapsed');
        document.getElementById('sidebarOverlay')?.classList.remove('visible');
    }

    toggleSidebar() {
        const sidebar = document.getElementById('sidebar');
        const overlay = document.getElementById('sidebarOverlay');
        const nowCollapsed = sidebar?.classList.toggle('collapsed');
        overlay?.classList.toggle('visible', nowCollapsed === false);
        return nowCollapsed;
    }

    initTVMode() {
        document.body.classList.add('tv-mode');
        document.documentElement.classList.add('tv-mode');
        document.getElementById('sidebar')?.classList.add('collapsed');
        document.documentElement.style.setProperty('--chat-max-width', 'min(72rem, 90vw)');
        requestAnimationFrame(() => {
            this.cmdInput?.focus();
        });
    }

    initSidebarState(savedSidebarState) {
        if (savedSidebarState === 'true' || window.innerWidth <= 768) {
            document.getElementById('sidebar')?.classList.add('collapsed');
        } else if (savedSidebarState === 'false') {
            document.getElementById('sidebar')?.classList.remove('collapsed');
        }
    }

    getWelcomeMessage(isMobileDevice, isTVDevice) {
        if (isMobileDevice) return this.getLightweightWelcomeMessage();
        if (isTVDevice) return this.getTVWelcomeMessage();
        return this.getFullWelcomeMessage();
    }

    getLightweightWelcomeMessage() {
        return this.getFullWelcomeMessage();
    }

    getFullWelcomeMessage() {
        const asciiArt = [
            ' \u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2563\u2588\u2588\u2563',
            ' \u2588\u2588\u2554\u2550\u2550\u2588\u2588\u2563\u2588\u2588\u2563',
            ' \u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2563\u2588\u2588\u2563',
            ' \u2588\u2588\u2554\u2550\u2550\u2588\u2588\u2563\u2588\u2588\u2563',
            ' \u2588\u2588\u2551  \u2588\u2588\u2551\u2588\u2588\u2551',
            ' \u255a\u2550\u255d  \u255a\u2550\u255d\u255a\u2550\u255d',
            ' >> NEURAL CORE v1.0.0'
        ].join('\n');

        return {
            role: 'system',
            content: 'JAMES is online.\nType anything to begin...',
            displayContent: `<div class="welcome-box hacker-theme"><pre class="ascii-art">${asciiArt}</pre><div class="welcome-box-body hacker-body"><p class="hacker-greeting">\uD83D\uDC4B Hey \u2014 I'm JAMES. Your fully local AI assistant.</p><p class="hacker-text">Everything runs directly in your browser using a local language model loaded via WebAssembly. There\u2019s no server, no API call, no cloud \u2014 just your machine.</p><ul class="hacker-list"><li><span class="hacker-bullet"></span><span>\uD83D\uDD12 <strong>Private by design</strong> \u2014 your conversations never leave this device</span></li><li><span class="hacker-bullet"></span><span>\uD83D\uDCBE <strong>Nothing is stored externally</strong> \u2014 sessions live in your browser\u2019s IndexedDB only</span></li><li><span class="hacker-bullet"></span><span>\u2708\uFE0F <strong>Fully offline-capable</strong> \u2014 once the model is cached, no internet required</span></li><li><span class="hacker-bullet"></span><span>\uD83C\uDF10 <strong>Web-native</strong> \u2014 built with vanilla JS, WebWorkers &amp; WebAssembly</span></li><li><span class="hacker-bullet"></span><span>\uD83D\uDC0D <strong>Python runtime</strong> \u2014 powered by Pyodide, runs code directly in browser</span></li><li><span class="hacker-bullet"></span><span>\u26A1 <strong>Hardware accelerated</strong> \u2014 a discrete GPU is required for best performance</span></li></ul><p class="hacker-prompt">\uD83D\uDCAC Type anything to begin...</p></div></div>`
        };
    }

    getTVWelcomeMessage() {
        return this.getFullWelcomeMessage();
    }
}

export const uiManager = new UIManager();
