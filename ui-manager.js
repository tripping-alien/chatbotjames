class UIManager {
    constructor() {
        this.cmdInput = document.getElementById('cmdInput')
            || document.getElementById('userInput')
            || document.getElementById('user-input');

        this.sendBtn = document.getElementById('sendBtn')
            || document.getElementById('sendButton')
            || document.getElementById('send-button');

        this.statusTextEl = document.getElementById('statusText');
        this.progressFillEl = document.querySelector('.progress-fill');
        this.statusMetaEl = document.querySelector('.status-meta');
        this.activeModelLabel = document.getElementById('activeModelLabel');
        this.applyModelBtn = document.getElementById('applyModelBtn');
    }

    setIdleState(isIdle, isGeneratingUIFlagCallback) {
        if (!this.cmdInput || !this.sendBtn) return;
        if (isIdle) {
            this.cmdInput.disabled = false;
            this.sendBtn.innerHTML = '➔';
            this.sendBtn.classList.remove('stop-btn');

            this.cmdInput.classList.remove('loading-state');
            this.cmdInput.placeholder = "💬 Message JAMES...";
            this.cmdInput.focus();
            if (isGeneratingUIFlagCallback) isGeneratingUIFlagCallback(false);
        } else {
            this.cmdInput.disabled = true;
            this.cmdInput.classList.add('loading-state');
            this.cmdInput.placeholder = "⏳ Generating response...";

            this.sendBtn.innerHTML = '⏸';
            this.sendBtn.classList.add('stop-btn');
            if (isGeneratingUIFlagCallback) isGeneratingUIFlagCallback(true);
        }
    }

    updateStatusText(text) {
        if (this.statusTextEl) this.statusTextEl.textContent = text;
    }

    updateStatusMeta(text) {
        if (this.statusMetaEl) this.statusMetaEl.innerText = text;
    }

    updateProgress(percent) {
        if (this.progressFillEl) this.progressFillEl.style.width = `${percent}%`;
        const container = document.getElementById('progressContainer');
        if (container) {
            const val = Math.max(0, Math.min(100, Math.round(percent)));
            container.setAttribute('aria-valuenow', String(val));
            // Show to AT only while downloading (0 < val < 100)
            if (val > 0 && val < 100) {
                container.removeAttribute('aria-hidden');
                container.setAttribute('aria-valuetext', `${val} percent downloaded`);
            } else {
                container.setAttribute('aria-hidden', 'true');
            }
        }
    }

    updateActiveModelLabel(label) {
        if (this.activeModelLabel) this.activeModelLabel.textContent = `Active: ${label}`;
        if (this.applyModelBtn) this.applyModelBtn.disabled = true;
    }

    resetApplyModelBtn() {
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
        return nowCollapsed; // To save to localStorage
    }

    initTVMode() {
        document.body.classList.add('tv-mode');
        document.documentElement.classList.add('tv-mode');
        document.getElementById('sidebar')?.classList.add('collapsed');
        // Prefer larger default chat width variables if CSS has not already set them
        document.documentElement.style.setProperty('--chat-max-width', 'min(72rem, 90vw)');
        // Ensure input is easy to find with a remote
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

    getWelcomeMessage(isMobileDevice, isTVDevice, showTools = true) {
        if (isMobileDevice) return this.getLightweightWelcomeMessage(showTools);
        if (isTVDevice) return this.getTVWelcomeMessage(showTools);
        return this.getFullWelcomeMessage(showTools);
    }

    getLightweightWelcomeMessage(showTools) {
        return this.getFullWelcomeMessage(showTools);
    }

    getFullWelcomeMessage(showTools) {
        const asciiArt = ` ███████╗██╗
 ██╔══██╗██║
 ███████║██║
 ██╔══██║██║
 ██║  ██║██║
 ╚═╝  ╚═╝╚═╝
 >> NEURAL CORE v1.0.0`;

        return {
            role: 'system',
            content: `JAMES is online.\nType anything to begin...`,
            displayContent: `<div class="welcome-box hacker-theme"><pre class="ascii-art">${asciiArt}</pre><div class="welcome-box-body hacker-body"><p class="hacker-greeting">👋 Hey — I'm JAMES. Your fully local AI assistant.</p><p class="hacker-text">Everything runs directly in your browser using a local language model loaded via WebAssembly. There's no server, no API call, no cloud — just your machine.</p><ul class="hacker-list"><li><span class="hacker-bullet"></span><span>🔒 <strong>Private by design</strong> — your conversations never leave this device</span></li><li><span class="hacker-bullet"></span><span>💾 <strong>Nothing is stored externally</strong> — sessions live in your browser's IndexedDB only</span></li><li><span class="hacker-bullet"></span><span>✈️ <strong>Fully offline-capable</strong> — once the model is cached, no internet required</span></li><li><span class="hacker-bullet"></span><span>🌐 <strong>Web-native</strong> — built with vanilla JS, WebWorkers &amp; WebAssembly</span></li><li><span class="hacker-bullet"></span><span>🐍 <strong>Python runtime</strong> — powered by Pyodide, runs code directly in browser</span></li><li><span class="hacker-bullet"></span><span>⚡ <strong>Hardware accelerated</strong> — a discrete GPU is required for best performance</span></li></ul><p class="hacker-prompt">💬 Type anything to begin...</p></div></div>`
        };
    }

    getTVWelcomeMessage(showTools) {
        return this.getFullWelcomeMessage(showTools);
    }
}

export const uiManager = new UIManager();
