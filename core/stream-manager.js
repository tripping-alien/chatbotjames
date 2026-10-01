import { CONFIG } from './config.js';
import { updateLiveBubble } from './message-renderer.js';

// ─── Character-by-character Streaming Animation ──────────────────────────────
export const streamQueues = new Map();

// Monotonically increasing bubble IDs — collision-free alternative to Date.now()
let _nextTargetId = 0;
export const getNextTargetId = () => ++_nextTargetId;

// targetIds whose stream has already been flushed. A 'streaming' message that
// lands after 'complete' would otherwise rebuild the queue from scratch and
// resurrect a stale bubble on top of the finished message.
const _finished = new Set();

/**
 * Queue streaming text for a bubble.
 * @param {number|string} targetId
 * @param {string} fullText
 * @param {{ updateDom?: boolean }} opts - If updateDom is false, only store state
 *   (for background chats). Defaults to true.
 */
export function queueStreamText(targetId, fullText, { updateDom = true } = {}) {
    if (_finished.has(targetId)) return;
    if (!streamQueues.has(targetId)) {
        streamQueues.set(targetId, {
            pending: fullText,
            // When background: snap displayed to full text so restore shows latest.
            // When foreground: start empty so typewriter can animate.
            displayed: updateDom ? '' : fullText,
            running: false,
            updateDom
        });
    } else {
        const state = streamQueues.get(targetId);
        state.pending = fullText;
        state.updateDom = updateDom;
        if (!updateDom) {
            // Background: keep displayed in sync so returning to the chat shows current text
            state.displayed = fullText;
            if (state.timeoutId) {
                clearTimeout(state.timeoutId);
                state.timeoutId = null;
            }
            state.running = false;
        }
    }
    const state = streamQueues.get(targetId);
    if (updateDom && !state.running) drainStreamQueue(targetId);
}

export function drainStreamQueue(targetId) {
    // Guard: if flushStreamQueue already ran (timer fired just before clearTimeout could cancel it),
    // bail out immediately so we never overwrite the final force-rendered bubble with partial text.
    if (_finished.has(targetId)) return;
    const state = streamQueues.get(targetId);
    if (!state || state.displayed.length >= state.pending.length) {
        if (state) state.running = false;
        return;
    }
    // Paused (user switched away) — do not touch the DOM or schedule further ticks
    if (state.updateDom === false) {
        state.running = false;
        return;
    }
    state.running = true;

    // Advance exactly one character
    state.displayed = state.pending.slice(0, state.displayed.length + 1);
    updateLiveBubble(state.displayed, targetId);

    // Speed is controlled by CONFIG.ui.streamRenderIntervalMs (default 15 ms)
    state.timeoutId = setTimeout(() => drainStreamQueue(targetId), CONFIG.ui.streamRenderIntervalMs);
}

export function flushStreamQueue(targetId) {
    _finished.add(targetId);
    if (_finished.size > 1024) _finished.delete(_finished.values().next().value);
    const state = streamQueues.get(targetId);
    if (state) {
        if (state.timeoutId) clearTimeout(state.timeoutId);
        // Only force-render into the DOM if this bubble is allowed to update the current view
        if (state.updateDom !== false) {
            updateLiveBubble(state.pending, targetId, true);
        }
    }
    streamQueues.delete(targetId);
}

/**
 * Pause DOM updates for every stream that is not the given targetId.
 * Used when switching chats so a background stream cannot inject a ghost bubble
 * into the newly visible chat log.
 */
export function pauseStreamsExcept(keepTargetId) {
    for (const [id, state] of streamQueues) {
        if (id === keepTargetId) continue;
        state.updateDom = false;
        if (state.timeoutId) {
            clearTimeout(state.timeoutId);
            state.timeoutId = null;
        }
        state.running = false;
        // Snap to latest so restore is accurate when the user returns
        if (state.pending) state.displayed = state.pending;
    }
}

/**
 * Resume DOM updates and (if needed) the typewriter for a targetId after
 * switching back to its chat. Creates / refreshes the live bubble.
 */
export function resumeStreamForTarget(targetId) {
    const state = streamQueues.get(targetId);
    if (!state) {
        // Still in pure "thinking" phase — no tokens yet
        updateLiveBubble('...', targetId);
        return;
    }
    state.updateDom = true;
    const text = state.displayed || state.pending || '';
    if (text) {
        updateLiveBubble(text, targetId);
    } else {
        updateLiveBubble('...', targetId);
    }
    if (!state.running && state.displayed.length < state.pending.length) {
        drainStreamQueue(targetId);
    }
}
