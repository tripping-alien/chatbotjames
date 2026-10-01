// ─── Profiler & Memory Management ──────────────────────────────────────────────
// Monitors execution times, memory usage, and warns if WebGPU allocates too much

export class Profiler {
    constructor() {
        this.marks = new Map();
        this.metrics = [];
        this.memoryWarnings = 0;
        this.isProfiling = false;
        
        // Bind functions for requestAnimationFrame
        this._checkMemory = this._checkMemory.bind(this);
    }

    start() {
        this.isProfiling = true;
        console.log('[Profiler] Started system profiling.');
        
        if (performance && performance.memory) {
            this._memCheckInterval = setInterval(this._checkMemory, 5000);
        }
    }

    stop() {
        this.isProfiling = false;
        clearInterval(this._memCheckInterval);
        console.log('[Profiler] Stopped system profiling.');
    }

    markStart(label) {
        if (!this.isProfiling) return;
        this.marks.set(label, performance.now());
    }

    markEnd(label) {
        if (!this.isProfiling) return;
        const start = this.marks.get(label);
        if (start) {
            const duration = performance.now() - start;
            this.metrics.push({ label, duration, timestamp: Date.now() });
            this.marks.delete(label);
            
            if (this.metrics.length > 500) {
                this.metrics.shift(); // keep it constrained
            }
            
            // Auto-log unusually slow operations
            if (duration > 1000) {
                console.warn(`[Profiler] Heavy operation detected: ${label} took ${(duration/1000).toFixed(2)}s`);
            }
        }
    }

    _checkMemory() {
        if (!performance.memory) return;
        
        const used = performance.memory.usedJSHeapSize;
        const limit = performance.memory.jsHeapSizeLimit;
        const ratio = used / limit;

        if (ratio > 0.85) {
            this.memoryWarnings++;
            console.warn(`[Profiler] MEMORY WARNING: Heap usage is at ${(ratio * 100).toFixed(1)}% (${(used/1024/1024).toFixed(1)}MB)`);
            
            if (this.memoryWarnings > 3 && ratio > 0.95) {
                console.error('[Profiler] CRITICAL MEMORY PRESSURE: Application is about to crash!');
                // Force garbage collection hint (if browser supports experimental API)
                if (window.gc) window.gc();
            }
        } else {
            // Reset warnings if memory recovers
            if (ratio < 0.7) this.memoryWarnings = 0;
        }
    }

    getReport() {
        if (this.metrics.length === 0) return 'No profiling data available.';
        
        const summary = new Map();
        for (const m of this.metrics) {
            if (!summary.has(m.label)) {
                summary.set(m.label, { total: 0, count: 0, max: 0 });
            }
            const s = summary.get(m.label);
            s.total += m.duration;
            s.count += 1;
            if (m.duration > s.max) s.max = m.duration;
        }

        let report = '=== PERFORMANCE PROFILER ===\n';
        for (const [label, s] of summary.entries()) {
            const avg = s.total / s.count;
            report += `- ${label.padEnd(20)} | Avg: ${avg.toFixed(2)}ms | Max: ${s.max.toFixed(2)}ms | Calls: ${s.count}\n`;
        }
        
        if (performance.memory) {
            report += '\n=== MEMORY ===\n';
            report += `Used: ${(performance.memory.usedJSHeapSize / 1024 / 1024).toFixed(1)} MB\n`;
            report += `Limit: ${(performance.memory.jsHeapSizeLimit / 1024 / 1024).toFixed(1)} MB\n`;
        }
        
        return report;
    }
}

export const systemProfiler = new Profiler();
