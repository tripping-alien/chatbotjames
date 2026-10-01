// ─── Global Error Boundary & Crash Analytics ─────────────────────────────────
// Catches unhandled exceptions, promise rejections, and rendering errors.
// Provides a clean fallback UI and structured crash dumps.

export class ErrorBoundary {
    constructor() {
        this.errorLog = [];
        this.MAX_LOGS = 50;
        this.isCrashed = false;
        this.crashUiContainer = null;
        
        this.setupGlobalHandlers();
    }

    setupGlobalHandlers() {
        window.addEventListener('error', (event) => this.handleGlobalError(event));
        window.addEventListener('unhandledrejection', (event) => this.handleUnhandledRejection(event));
        
        // Wrap requestAnimationFrame for uncaught render loop errors
        const originalRaf = window.requestAnimationFrame;
        window.requestAnimationFrame = (callback) => {
            return originalRaf((time) => {
                try {
                    callback(time);
                } catch (e) {
                    this.logError('RenderLoop', e.message, e.stack);
                    console.error('Caught RAF error:', e);
                }
            });
        };
    }

    handleGlobalError(event) {
        this.logError('UncaughtException', event.message, event.error?.stack || event.filename + ':' + event.lineno);
        
        // Only show crash UI for critical UI-blocking errors
        if (event.filename && (event.filename.includes('app.js') || event.filename.includes('ui-manager.js'))) {
            this.showCrashScreen(event.error);
        }
    }

    handleUnhandledRejection(event) {
        let reasonStr = typeof event.reason === 'string' ? event.reason : (event.reason?.message || 'Unknown Promise Rejection');
        this.logError('UnhandledRejection', reasonStr, event.reason?.stack || '');
        
        // Critical IndexedDB failures often result in Promise rejections
        if (reasonStr.toLowerCase().includes('database') || reasonStr.toLowerCase().includes('indexeddb')) {
            console.error('CRITICAL STORAGE ERROR: Database connection lost or corrupted.');
        }
    }

    logError(type, message, stack) {
        const errorEntry = {
            timestamp: new Date().toISOString(),
            type,
            message,
            stack,
            url: window.location.href,
            userAgent: navigator.userAgent,
            memory: navigator.deviceMemory ? navigator.deviceMemory + 'GB' : 'Unknown',
            hardwareConcurrency: navigator.hardwareConcurrency || 'Unknown'
        };
        
        this.errorLog.unshift(errorEntry);
        if (this.errorLog.length > this.MAX_LOGS) {
            this.errorLog.pop();
        }
        
        // Persist to session storage for recovery across reloads
        try {
            sessionStorage.setItem('james-crash-log', JSON.stringify(this.errorLog));
        } catch (e) { /* ignore quota errors */ }
    }

    getStructuredCrashDump() {
        let dump = '=== JAMES CRASH DUMP ===\n';
        dump += 'Generated: ' + new Date().toISOString() + '\n\n';
        
        this.errorLog.forEach((err, i) => {
            dump += `--- ERROR ${i + 1} ---\n`;
            dump += `Type: ${err.type}\n`;
            dump += `Time: ${err.timestamp}\n`;
            dump += `Message: ${err.message}\n`;
            if (err.stack) dump += `Stack Trace:\n${err.stack}\n`;
            dump += '\n';
        });
        
        dump += '=== SYSTEM INFO ===\n';
        dump += 'User Agent: ' + navigator.userAgent + '\n';
        if (navigator.deviceMemory) dump += 'Memory: ~' + navigator.deviceMemory + 'GB\n';
        if (navigator.hardwareConcurrency) dump += 'Cores: ' + navigator.hardwareConcurrency + '\n';
        
        return dump;
    }

    showCrashScreen(error) {
        if (this.isCrashed) return;
        this.isCrashed = true;

        this.crashUiContainer = document.createElement('div');
        Object.assign(this.crashUiContainer.style, {
            position: 'fixed',
            top: '0', left: '0', width: '100vw', height: '100vh',
            backgroundColor: '#0d1117',
            color: '#ff4444',
            zIndex: '2147483647',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            fontFamily: 'monospace',
            padding: '20px',
            boxSizing: 'border-box',
            textAlign: 'center'
        });

        const icon = document.createElement('div');
        icon.innerHTML = '⚠️';
        icon.style.fontSize = '4rem';
        icon.style.marginBottom = '20px';

        const title = document.createElement('h1');
        title.innerText = 'FATAL SYSTEM EXCEPTION';
        title.style.margin = '0 0 10px 0';
        title.style.color = '#ff5555';

        const msg = document.createElement('p');
        msg.innerText = 'JAMES encountered a critical error and could not recover.\nYour data is safe, but the app needs to restart.';
        msg.style.color = '#a0a0a0';
        msg.style.maxWidth = '600px';
        msg.style.lineHeight = '1.5';

        const details = document.createElement('div');
        details.innerText = error?.message || 'Unknown Error';
        Object.assign(details.style, {
            marginTop: '20px', padding: '15px', background: '#161b22', border: '1px solid #30363d',
            borderRadius: '6px', color: '#ff7b72', width: '100%', maxWidth: '800px',
            overflowX: 'auto', whiteSpace: 'pre-wrap', textAlign: 'left', fontSize: '0.9rem'
        });

        if (error?.stack) {
            const stack = document.createElement('div');
            stack.innerText = error.stack;
            Object.assign(stack.style, {
                marginTop: '10px', paddingTop: '10px', borderTop: '1px dashed #30363d',
                color: '#8b949e', fontSize: '0.8rem'
            });
            details.appendChild(stack);
        }

        const actions = document.createElement('div');
        actions.style.marginTop = '30px';
        actions.style.display = 'flex';
        actions.style.gap = '15px';

        const reloadBtn = document.createElement('button');
        reloadBtn.innerText = 'REBOOT SYSTEM';
        Object.assign(reloadBtn.style, {
            padding: '12px 24px', background: '#238636', color: '#fff', border: 'none',
            borderRadius: '6px', cursor: 'pointer', fontFamily: 'monospace', fontWeight: 'bold',
            fontSize: '1rem'
        });
        reloadBtn.onclick = () => window.location.reload();

        const dumpBtn = document.createElement('button');
        dumpBtn.innerText = 'DOWNLOAD CRASH DUMP';
        Object.assign(dumpBtn.style, {
            padding: '12px 24px', background: 'transparent', color: '#8b949e', border: '1px solid #30363d',
            borderRadius: '6px', cursor: 'pointer', fontFamily: 'monospace', fontSize: '1rem'
        });
        dumpBtn.onclick = () => {
            const blob = new Blob([this.getStructuredCrashDump()], { type: 'text/plain' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `james_crashdump_${Date.now()}.txt`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        };

        actions.appendChild(reloadBtn);
        actions.appendChild(dumpBtn);

        this.crashUiContainer.appendChild(icon);
        this.crashUiContainer.appendChild(title);
        this.crashUiContainer.appendChild(msg);
        this.crashUiContainer.appendChild(details);
        this.crashUiContainer.appendChild(actions);

        document.body.appendChild(this.crashUiContainer);
    }
}

export const errorBoundary = new ErrorBoundary();
