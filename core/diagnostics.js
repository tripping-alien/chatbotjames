export class DiagnosticsManager {
    constructor() {
        this.errorLog = [];
        this.metrics = {
            messageCount: 0,
            tokenCount: 0,
            lastInferenceTime: 0,
            averageInferenceTime: 0,
            toolCallCount: 0
        };
        this.panel = null;
        this.setupGlobalHandlers();
    }

    setupGlobalHandlers() {
        window.addEventListener('error', (e) => this.logError('Global Error', e.message, e.filename, e.lineno, e.error));
        window.addEventListener('unhandledrejection', (e) => this.logError('Unhandled Promise Rejection', e.reason));
    }

    logError(type, message, file = 'unknown', line = 0, errorObj = null) {
        const errorEntry = {
            timestamp: new Date().toISOString(),
            type,
            message,
            file,
            line,
            stack: errorObj?.stack || ''
        };
        this.errorLog.push(errorEntry);
        
        // Keep only last 100 errors to prevent memory leak
        if (this.errorLog.length > 100) {
            this.errorLog.shift();
        }
        console.warn('[Diagnostics] Logged internal error:', errorEntry);
    }

    recordMetric(key, value) {
        if (key in this.metrics) {
            if (typeof this.metrics[key] === 'number') {
                this.metrics[key] += value;
            } else {
                this.metrics[key] = value;
            }
        }
    }

    getDiagnosticsReport() {
        const gpuInfo = window.globalState?.gpuInfo || { hasGpu: false };
        const mem = navigator.deviceMemory ? navigator.deviceMemory + 'GB' : 'Unknown';
        
        let report = `
=== JAMES SYSTEM DIAGNOSTICS ===
Time: ${new Date().toISOString()}
User Agent: ${navigator.userAgent}
Device Memory: ${mem}
Logical Processors: ${navigator.hardwareConcurrency || 'Unknown'}

GPU Information:
- Has GPU: ${gpuInfo.hasGpu}
- Vendor: ${gpuInfo.vendor || 'Unknown'}
- Architecture: ${gpuInfo.architecture || 'Unknown'}

Application Metrics:
- Messages Processed: ${this.metrics.messageCount}
- Estimated Tokens: ${this.metrics.tokenCount}
- Last Inference Time: ${this.metrics.lastInferenceTime}ms
- Tool Calls Executed: ${this.metrics.toolCallCount}

Error Log (${this.errorLog.length} entries):
`;
        
        if (this.errorLog.length === 0) {
            report += 'No errors logged.\n';
        } else {
            this.errorLog.forEach((err, i) => {
                report += `[${i+1}] ${err.timestamp} | ${err.type} | ${err.message}\n`;
                if (err.stack) report += `    ${err.stack.split('\n')[0]}\n`;
            });
        }
        
        report += '================================';
        return report;
    }

    async downloadReport() {
        try {
            const report = this.getDiagnosticsReport();
            const blob = new Blob([report], { type: 'text/plain' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `james_diagnostics_${Date.now()}.txt`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            return true;
        } catch (e) {
            this.logError('Diagnostics', 'Failed to generate report download', null, null, e);
            return false;
        }
    }

    showDiagnosticsPanel() {
        if (this.panel) {
            this.panel.remove();
        }
        
        this.panel = document.createElement('div');
        this.panel.className = 'diagnostics-panel';
        Object.assign(this.panel.style, {
            position: 'fixed',
            top: '5%',
            left: '5%',
            width: '90%',
            height: '90%',
            backgroundColor: 'var(--bg-panel, #1a1a2e)',
            color: 'var(--text-color, #e0e0e0)',
            border: '1px solid var(--border-color, #333)',
            borderRadius: '8px',
            boxShadow: '0 10px 30px rgba(0,0,0,0.8)',
            zIndex: '9999',
            display: 'flex',
            flexDirection: 'column',
            fontFamily: 'monospace',
            overflow: 'hidden'
        });

        const header = document.createElement('div');
        Object.assign(header.style, {
            padding: '12px 16px',
            borderBottom: '1px solid var(--border-color, #333)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            backgroundColor: 'rgba(0,0,0,0.2)'
        });
        
        const title = document.createElement('h3');
        title.innerText = '🔧 System Diagnostics';
        title.style.margin = '0';
        title.style.color = 'var(--accent-color, #00ffaa)';
        
        const closeBtn = document.createElement('button');
        closeBtn.innerText = '✕';
        Object.assign(closeBtn.style, {
            background: 'none',
            border: 'none',
            color: '#fff',
            cursor: 'pointer',
            fontSize: '1.2rem'
        });
        closeBtn.onclick = () => {
            this.panel.remove();
            this.panel = null;
        };

        header.appendChild(title);
        header.appendChild(closeBtn);

        const content = document.createElement('div');
        Object.assign(content.style, {
            flex: '1',
            padding: '16px',
            overflowY: 'auto',
            whiteSpace: 'pre-wrap',
            fontSize: '0.9rem'
        });
        
        content.innerText = this.getDiagnosticsReport();

        const footer = document.createElement('div');
        Object.assign(footer.style, {
            padding: '12px 16px',
            borderTop: '1px solid var(--border-color, #333)',
            display: 'flex',
            justifyContent: 'flex-end',
            gap: '10px'
        });

        const refreshBtn = document.createElement('button');
        refreshBtn.innerText = 'Refresh';
        refreshBtn.className = 'apply-model-btn';
        refreshBtn.onclick = () => {
            content.innerText = this.getDiagnosticsReport();
        };

        const downloadBtn = document.createElement('button');
        downloadBtn.innerText = 'Download Report';
        downloadBtn.className = 'apply-model-btn';
        downloadBtn.onclick = () => {
            this.downloadReport();
        };

        footer.appendChild(refreshBtn);
        footer.appendChild(downloadBtn);

        this.panel.appendChild(header);
        this.panel.appendChild(content);
        this.panel.appendChild(footer);

        document.body.appendChild(this.panel);
    }
}

export const systemDiagnostics = new DiagnosticsManager();
