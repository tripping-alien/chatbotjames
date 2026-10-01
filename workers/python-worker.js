/**
 * pyodide.worker.js
 *
 * A robust Pyodide Web Worker supporting:
 *   - Captured stdout / stderr
 *   - Matplotlib figure output (base64 PNG)
 *   - micropip package installation
 *   - Interrupt / cancellation via SharedArrayBuffer
 *   - State reset
 *   - Proper PyProxy memory management
 *
 * Message types (postMessage TO worker):
 *   { type: 'init' }
 *   { type: 'run',     code: string, execId: string, interruptBuffer?: SharedArrayBuffer }
 *   { type: 'install', packages: string[], execId: string }
 *   { type: 'reset',   execId: string }
 *
 * Message types (postMessage FROM worker):
 *   { status: 'loading' }
 *   { status: 'ready' }
 *   { status: 'done',     execId, stdout, result, figures }
 *   { status: 'error',    execId, error }
 *   { status: 'stdout',   execId, text }       ← streamed during install
 */

importScripts('https://cdn.jsdelivr.net/pyodide/v0.25.1/full/pyodide.js');

// ─── State ────────────────────────────────────────────────────────────────────

let pyodide = null;
let micropip = null;
let initState = 'idle'; // 'idle' | 'loading' | 'ready' | 'error'

// ─── Bootstrap ────────────────────────────────────────────────────────────────

async function initPyodide() {
    if (initState === 'loading' || initState === 'ready') return;
    initState = 'loading';
    self.postMessage({ status: 'loading' });

    try {
        pyodide = await loadPyodide();

        // Install micropip so the worker can fetch arbitrary wheels.
        await pyodide.loadPackage('micropip');
        micropip = pyodide.pyimport('micropip');

        // Redirect stdout / stderr; also install a Matplotlib backend that
        // captures figures as base64 PNG instead of trying to open a window.
        await pyodide.runPythonAsync(`
import sys, io, base64, json

class _CaptureStream(io.StringIO):
    """Writable stream that accumulates text."""
    pass

sys.stdout = _CaptureStream()
sys.stderr = _CaptureStream()

# ── Matplotlib shim ──────────────────────────────────────────────────────────
_mpl_figures = []   # populated by _capture_figures() after each run

def _capture_figures():
    """Render all open Matplotlib figures to base64 PNG and return as JSON."""
    try:
        import matplotlib.pyplot as plt
        import io as _io
        captured = []
        for fig_num in plt.get_fignums():
            fig = plt.figure(fig_num)
            buf = _io.BytesIO()
            fig.savefig(buf, format='png', bbox_inches='tight')
            buf.seek(0)
            captured.append(base64.b64encode(buf.read()).decode('ascii'))
        plt.close('all')
        return json.dumps(captured)
    except ImportError:
        return '[]'

def _reset_streams():
    sys.stdout.seek(0); sys.stdout.truncate(0)
    sys.stderr.seek(0); sys.stderr.truncate(0)
`);

        // Tell Matplotlib to use the non-interactive Agg backend from the
        // start so it never tries to spawn a GUI.
        try {
            await pyodide.loadPackage('matplotlib');
            await pyodide.runPythonAsync(`
import matplotlib
matplotlib.use('Agg')
`);
        } catch (_) {
            // matplotlib not critical; skip silently
        }

        initState = 'ready';
        self.postMessage({ status: 'ready' });
    } catch (err) {
        initState = 'error';
        self.postMessage({ status: 'error', error: `Pyodide failed to load: ${err.message}` });
    }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Safely convert a PyProxy (or any value) to a plain JS string.
 * Calls .toJs() when available to avoid "[object Object]".
 */
function pyResultToString(result) {
    if (result === undefined || result === null) return undefined;

    // PyProxy exposes .toJs() and .toString()
    if (typeof result.toJs === 'function') {
        try {
            const js = result.toJs({ dict_converter: Object.fromEntries });
            return JSON.stringify(js, (_, v) => typeof v === 'bigint' ? v.toString() : v);
        } catch (_) {
            // fall through to toString
        }
    }
    if (typeof result.toString === 'function') {
        try {
            const s = result.toString();
            // Filter out the unhelpful proxy sentinel
            if (s !== '[object Object]') return s;
        } catch (_) { /* fall through */ }
    }
    try {
        return String(result);
    } catch (_) {
        return '[Unserializable Result]';
    }
}

/**
 * Destroy a PyProxy if it is one, to avoid memory leaks.
 */
function safeDestroy(proxy) {
    if (proxy && typeof proxy.destroy === 'function') {
        try { proxy.destroy(); } catch (_) { /* ignore */ }
    }
}

// ─── Message dispatcher ───────────────────────────────────────────────────────

self.onmessage = async (e) => {
    const { type, code, packages, execId, interruptBuffer } = e.data;

    // ── init ──────────────────────────────────────────────────────────────────
    if (type === 'init') {
        await initPyodide();
        return;
    }

    // All other types require Pyodide to be ready.
    if (initState !== 'ready') {
        self.postMessage({
            status: 'error',
            execId,
            error: initState === 'loading'
                ? 'Pyodide is still loading — please wait for the ready signal.'
                : 'Pyodide failed to initialise. Reload the page to try again.',
        });
        return;
    }

    // ── install ───────────────────────────────────────────────────────────────
    if (type === 'install') {
        if (!Array.isArray(packages) || packages.length === 0) {
            self.postMessage({ status: 'error', execId, error: 'No packages specified.' });
            return;
        }
        try {
            for (const pkg of packages) {
                // Stream install progress as stdout messages
                self.postMessage({ status: 'stdout', execId, text: `Installing ${pkg}…\n` });
                await micropip.install(pkg);
            }
            self.postMessage({ status: 'done', execId, stdout: '', result: undefined, figures: [] });
        } catch (err) {
            self.postMessage({ status: 'error', execId, error: err.message });
        }
        return;
    }

    // ── reset ─────────────────────────────────────────────────────────────────
    if (type === 'reset') {
        try {
            // Wipe the user namespace without destroying builtins.
            await pyodide.runPythonAsync(`
import sys, importlib

# Remove user-defined names from __main__ that aren't builtins or our shims
_keep = {'_CaptureStream', '_capture_figures', '_reset_streams', '__builtins__',
         '__name__', '__doc__', '__package__', '__loader__', '__spec__'}
_main = sys.modules['__main__']
for _k in list(vars(_main).keys()):
    if _k not in _keep and not _k.startswith('__'):
        try:
            delattr(_main, _k)
        except AttributeError:
            pass

_reset_streams()
`);
            self.postMessage({ status: 'done', execId, stdout: 'Namespace cleared.', result: undefined, figures: [] });
        } catch (err) {
            self.postMessage({ status: 'error', execId, error: err.message });
        }
        return;
    }

    // ── run ───────────────────────────────────────────────────────────────────
    if (type === 'run') {
        if (typeof code !== 'string' || code.trim() === '') {
            self.postMessage({ status: 'error', execId, error: 'No code provided.' });
            return;
        }

        // Wire up interrupt support when the caller supplies a SharedArrayBuffer
        // (must be from a cross-origin-isolated page: COOP + COEP headers).
        if (typeof SharedArrayBuffer !== 'undefined' && interruptBuffer instanceof SharedArrayBuffer) {
            pyodide.setInterruptBuffer(new Uint8Array(interruptBuffer));
        } else {
            pyodide.setInterruptBuffer(null);
        }

        // 1. Auto-install any packages referenced in import statements.
        try {
            await pyodide.loadPackagesFromImports(code);
        } catch (pkgErr) {
            // Non-fatal — the code itself will surface a clearer ImportError.
            console.warn('[pyodide worker] loadPackagesFromImports:', pkgErr.message);
        }

        // 2. Clear I/O buffers from any previous run.
        await pyodide.runPythonAsync('_reset_streams()');

        // 3. Execute user code.
        let resultProxy;
        try {
            resultProxy = await pyodide.runPythonAsync(code);
        } catch (pyErr) {
            // Prefer stderr (contains the Python traceback) over the JS error.
            let stderr = '';
            try {
                stderr = await pyodide.runPythonAsync('sys.stderr.getvalue()');
            } catch (_) { /* ignore */ }
            self.postMessage({
                status: 'error',
                execId,
                error: (stderr || pyErr.message).trim(),
            });
            return;
        }

        // 4. Collect outputs.
        const stdout = await pyodide.runPythonAsync('sys.stdout.getvalue()');

        const resultString = pyResultToString(resultProxy);
        safeDestroy(resultProxy);

        // 5. Capture any Matplotlib figures.
        let figures = [];
        try {
            const figsJsonProxy = await pyodide.runPythonAsync('_capture_figures()');
            const figsJson = typeof figsJsonProxy === 'string'
                ? figsJsonProxy
                : figsJsonProxy?.toString?.() ?? '[]';
            safeDestroy(figsJsonProxy);
            figures = JSON.parse(figsJson); // string[] of base64 PNGs
        } catch (_) { /* matplotlib not available or no figures */ }

        self.postMessage({
            status: 'done',
            execId,
            stdout: stdout.trim(),
            result: resultString,
            figures,              // base64 PNG strings; render with <img src="data:image/png;base64,…">
        });
        return;
    }

    // ── unknown ───────────────────────────────────────────────────────────────
    self.postMessage({ status: 'error', execId, error: `Unknown message type: "${type}"` });
};
