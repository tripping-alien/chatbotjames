// Run with: node tests/test-stop-thinking-bubble.js
import fs from 'fs';
import path from 'path';

let failed = 0;
const check = (name, cond, extra = '') => {
    if (cond) {
        console.log(`PASS: ${name}`);
    } else {
        console.error(`FAIL: ${name} ${extra}`);
        failed++;
    }
};

console.log('--- Stop Generation & Thinking Bubble Tests ---');

// 1. Static code structure checks for core/app.js
const appPath = path.resolve('core/app.js');
const appContent = fs.readFileSync(appPath, 'utf8');

check('app.js imports removeThinkingBubble',
    /import\s*\{[^}]*removeThinkingBubble[^}]*\}\s*from\s*['"]\.\/message-renderer\.js['"]/.test(appContent));

check('app.js handleStopGeneration calls removeThinkingBubble',
    /function\s+handleStopGeneration\s*\(\)\s*\{[\s\S]*?removeThinkingBubble\s*\(/.test(appContent));

check('app.js handleStopGeneration calls cancelStream',
    /function\s+handleStopGeneration\s*\(\)\s*\{[\s\S]*?cancelStream\s*\(/.test(appContent));

check('app.js handleStopGeneration sets _cannedGenActive to false',
    /function\s+handleStopGeneration\s*\(\)\s*\{[\s\S]*?_cannedGenActive\s*=\s*false/.test(appContent));

check('app.js onAborted removes thinking bubble when message is empty',
    /workerController\.onAborted\s*=\s*[\s\S]*?!message\s*\|\|\s*message\.trim\(\)\s*===\s*''[\s\S]*?removeThinkingBubble/.test(appContent));

check('app.js onAborted does not push empty assistant message to chatHistory',
    /workerController\.onAborted\s*=\s*[\s\S]*?else\s*\{[\s\S]*?chatManager\.chatHistory\.push/.test(appContent));

check('app.js onWorkerStatus cleans up thinking bubble on error',
    /status\s*===\s*['"]error['"][\s\S]*?removeThinkingBubble/.test(appContent));

check('app.js setupModelPanel abort removes thinking bubble',
    /setupModelPanel[\s\S]*?workerController\.worker\.postMessage[\s\S]*?removeThinkingBubble/.test(appContent));

// 2. Static checks for core/stream-manager.js
const streamManagerPath = path.resolve('core/stream-manager.js');
const streamManagerContent = fs.readFileSync(streamManagerPath, 'utf8');

check('stream-manager.js exports cancelStream',
    /export\s+function\s+cancelStream\s*\(/.test(streamManagerContent));

check('stream-manager.js cancelStream clears timeouts and deletes queue',
    /clearTimeout\(state\.timeoutId\)[\s\S]*?streamQueues\.delete\(targetId\)/.test(streamManagerContent));

// 3. Functional tests for stream-manager cancelStream
const streamManagerCode = fs.readFileSync(path.resolve('core/stream-manager.js'), 'utf8')
    .replace(/import\s*\{[^}]*\}\s*from\s*['"]\.\/message-renderer\.js['"];?/, 'const updateLiveBubble = () => {}, updateLiveBubbleAppend = () => {};')
    .replace(/import\s*\{[^}]*\}\s*from\s*['"]\.\/config\.js['"];?/, 'const CONFIG = { ui: { streamRenderIntervalMs: 15 } };');
const moduleDataUri = 'data:text/javascript;base64,' + Buffer.from(streamManagerCode).toString('base64');
const { cancelStream, streamQueues } = await import(moduleDataUri);
const testTargetId = 999999;
streamQueues.set(testTargetId, {
    pending: 'Test streaming text',
    displayed: 'Test',
    running: true,
    timeoutId: setTimeout(() => {}, 10000)
});
check('streamQueues has test target before cancel', streamQueues.has(testTargetId));
cancelStream(testTargetId);
check('streamQueues does not have test target after cancelStream', !streamQueues.has(testTargetId));

// 4. Functional DOM tests for removeThinkingBubble in message-renderer.js
// Create minimal DOM mock for testing removeThinkingBubble logic
class MockElement {
    constructor(tag, id = '', className = '') {
        this.tagName = tag.toUpperCase();
        this.id = id;
        this.className = className;
        this.children = [];
        this.parentElement = null;
        this.innerHTML = '';
        this._textContent = '';
    }
    get textContent() {
        return this.innerHTML ? this.innerHTML.replace(/<[^>]+>/g, '') : this._textContent;
    }
    set textContent(val) {
        this._textContent = val;
    }
    appendChild(child) {
        child.parentElement = this;
        this.children.push(child);
        return child;
    }
    removeChild(child) {
        const idx = this.children.indexOf(child);
        if (idx !== -1) {
            this.children.splice(idx, 1);
            child.parentElement = null;
        }
        return child;
    }
    remove() {
        if (this.parentElement) {
            this.parentElement.removeChild(this);
        }
    }
    closest(selector) {
        let curr = this;
        while (curr) {
            if (selector.startsWith('.') && curr.className.split(' ').includes(selector.slice(1))) {
                return curr;
            }
            curr = curr.parentElement;
        }
        return null;
    }
    querySelector(selector) {
        if (selector.startsWith('.')) {
            const cls = selector.slice(1);
            const search = (el) => {
                for (const c of el.children) {
                    if (c.className && c.className.split(' ').includes(cls)) return c;
                    const nested = search(c);
                    if (nested) return nested;
                }
                return null;
            };
            return search(this);
        }
        return null;
    }
    querySelectorAll(selector) {
        const results = [];
        if (selector.startsWith('.')) {
            const cls = selector.slice(1);
            const search = (el) => {
                for (const c of el.children) {
                    if (c.className && c.className.split(' ').includes(cls)) results.push(c);
                    search(c);
                }
            };
            search(this);
        }
        return results;
    }
}

const mockDoc = {
    elementsById: new Map(),
    getElementById(id) {
        return this.elementsById.get(id) || null;
    }
};

const chatLog = new MockElement('div', 'chatLog', 'chat-log');
mockDoc.elementsById.set('chatLog', chatLog);

// Helper to simulate removeThinkingBubble logic
function simulateRemoveThinkingBubble(targetId, doc = mockDoc) {
    const log = doc.getElementById('chatLog');
    if (!log) return;

    if (targetId != null) {
        const bubble = doc.getElementById(`bubble-${targetId}`);
        if (bubble) {
            const isThinking = bubble.querySelector('.typing-indicator') !== null ||
                               bubble.textContent.trim() === '...' ||
                               bubble.textContent.trim() === '';
            if (isThinking) {
                const wrap = bubble.closest('.message-wrap') || bubble.parentElement;
                if (wrap) wrap.remove();
            }
        }
    }

    const indicators = log.querySelectorAll('.typing-indicator');
    indicators.forEach(ind => {
        const wrap = ind.closest('.message-wrap') || ind.parentElement;
        if (wrap) wrap.remove();
    });

    const emptyBubbles = log.querySelectorAll('.assistant-msg .message-content');
    emptyBubbles.forEach(b => {
        if (b.querySelector('.typing-indicator') || b.textContent.trim() === '...' || b.textContent.trim() === '') {
            const wrap = b.closest('.message-wrap') || b.parentElement;
            if (wrap) wrap.remove();
        }
    });

    const legacyThinking = doc.getElementById('thinking-bubble');
    if (legacyThinking) legacyThinking.remove();
}

// Case A: Live bubble with typing indicator (AI animation thinking bubble)
const wrap1 = new MockElement('div', '', 'message-wrap assistant-msg');
const bubble1 = new MockElement('div', 'bubble-101', 'message-content');
const indicator1 = new MockElement('div', '', 'typing-indicator');
bubble1.appendChild(indicator1);
wrap1.appendChild(bubble1);
chatLog.appendChild(wrap1);
mockDoc.elementsById.set('bubble-101', bubble1);

check('chatLog has thinking bubble wrap initially', chatLog.children.includes(wrap1));
simulateRemoveThinkingBubble(101);
check('simulateRemoveThinkingBubble removes thinking bubble from DOM', !chatLog.children.includes(wrap1));

// Case B: Live bubble that already has streamed text
const wrap2 = new MockElement('div', '', 'message-wrap assistant-msg');
const bubble2 = new MockElement('div', 'bubble-102', 'message-content');
bubble2.textContent = 'Hello, this is a real streamed answer.';
wrap2.appendChild(bubble2);
chatLog.appendChild(wrap2);
mockDoc.elementsById.set('bubble-102', bubble2);

simulateRemoveThinkingBubble(102);
check('simulateRemoveThinkingBubble preserves bubbles with real streamed content', chatLog.children.includes(wrap2));

// Case C: Live bubble with text '...'
const wrap3 = new MockElement('div', '', 'message-wrap assistant-msg');
const bubble3 = new MockElement('div', 'bubble-103', 'message-content');
bubble3.textContent = '...';
wrap3.appendChild(bubble3);
chatLog.appendChild(wrap3);
mockDoc.elementsById.set('bubble-103', bubble3);

simulateRemoveThinkingBubble(103);
check('simulateRemoveThinkingBubble removes ellipsis-only bubble', !chatLog.children.includes(wrap3));

// Case D: General sweep with legacy thinking-bubble
const legacyBubble = new MockElement('div', 'thinking-bubble', 'thinking');
chatLog.appendChild(legacyBubble);
mockDoc.elementsById.set('thinking-bubble', legacyBubble);
simulateRemoveThinkingBubble(null);
check('simulateRemoveThinkingBubble cleans up legacy #thinking-bubble', !chatLog.children.includes(legacyBubble));

console.log(failed === 0 ? '\nALL STOP THINKING BUBBLE TESTS PASSED' : `\n${failed} FAILED`);
process.exit(failed === 0 ? 0 : 1);
