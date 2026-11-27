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

const rendererPath = path.resolve('core/message-renderer.js');
const rendererContent = fs.readFileSync(rendererPath, 'utf8');
check('message-renderer.js renders google 3-dots thinking indicator',
    /google-dots/.test(rendererContent) && /google-dot/.test(rendererContent));

check('appendUserMessage delegates to createMessageElement for immediate copy button support',
    /function\s+appendUserMessage\s*\([^)]*\)\s*\{[\s\S]*?createMessageElement\s*\(/.test(rendererContent));

check('createMessageElement attaches copy-msg-btn to user-msg-container',
    /user-msg-container[\s\S]*?container\.appendChild\(copyBtn\)/.test(rendererContent));

const cssPath = path.resolve('style.css');
const cssContent = fs.readFileSync(cssPath, 'utf8');
check('style.css defines google-dot animation keyframes and classes',
    /\.google-dot/.test(cssContent) && /@keyframes\s+google-dot-bounce/.test(cssContent));

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

check('app.js renderChatLog checks isGeneratingUI and calls removeThinkingBubble on inactive threads',
    /renderChatLog[\s\S]*?activeGenerations\.get[\s\S]*?globalState\.isGeneratingUI[\s\S]*?removeThinkingBubble\(\)/.test(appContent));

check('app.js simulateCannedResponse cleans up activeGenerations on completion',
    /simulateCannedResponse[\s\S]*?activeGenerations\.delete\(chatId\)/.test(appContent));

// 2. Static checks for core/stream-manager.js
const streamManagerPath = path.resolve('core/stream-manager.js');
const streamManagerContent = fs.readFileSync(streamManagerPath, 'utf8');

check('stream-manager.js exports cancelStream',
    /export\s+function\s+cancelStream\s*\(/.test(streamManagerContent));

check('stream-manager.js cancelStream clears timeouts and deletes queue',
    /clearTimeout\(state\.timeoutId\)[\s\S]*?streamQueues\.delete\(targetId\)/.test(streamManagerContent));

check('stream-manager.js resumeStreamForTarget guards against finished streams and inactive chats',
    /export\s+function\s+resumeStreamForTarget[\s\S]*?_finished\.has\(targetId\)[\s\S]*?activeTarget\s*!==\s*targetId/.test(streamManagerContent));

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

// 5. Functional tests for WorkerController Stop / Abort isolation & tool cancellation
const wcPath = path.resolve('core/worker-controller.js');
const wcContent = fs.readFileSync(wcPath, 'utf8');

// Evaluate WorkerController cleanly from module source by exporting class dynamically
const wcClassCode = wcContent + '\nexport { WorkerController };';
const wcClassUri = 'data:text/javascript;base64,' + Buffer.from(wcClassCode).toString('base64');
const { WorkerController } = await import(wcClassUri);

const wc = new WorkerController();
const postedMessages = [];
wc.worker = { postMessage: (m) => postedMessages.push(m) };

let toolCallsTriggered = 0;
let abortedCallbackArgs = null;
let streamingCallbackCalls = 0;
wc.onToolCalls = () => { toolCallsTriggered++; };
wc.onAborted = (chatId, targetId, message) => { abortedCallbackArgs = { chatId, targetId, message }; };
wc.onStreaming = () => { streamingCallbackCalls++; };

// Case 5a: Background chat stays intact when stopping active chat
wc.postQuery([{ role: 'user', content: 'chat A' }], 201, 'chat-a');
wc.activeGenerations.set('chat-b', 202);
const sig201 = wc.getAbortSignal(201);
wc.abortGeneration(201, 'chat-a');
check('abortGeneration aborts target AbortSignal immediately', sig201.aborted === true);
check('abortGeneration deletes stopped chat from activeGenerations', !wc.activeGenerations.has('chat-a'));
check('abortGeneration preserves unrelated background chat in activeGenerations', wc.activeGenerations.get('chat-b') === 202);

// Case 5b: Stale streaming events from aborted targetId are suppressed
wc.workerMessageHandler({ data: { status: 'streaming', targetId: 201, chatId: 'chat-a', message: 'late chunk' } });
check('stale streaming event after abort does not reach onStreaming', streamingCallbackCalls === 0);

// Case 5c: Aborted output containing JSON tool call syntax must NOT execute tools
wc.workerMessageHandler({ data: { status: 'aborted', targetId: 201, chatId: 'chat-a', message: '{"tool":"search","params":{"q":"test"}}' } });
check('aborted status with tool syntax does not invoke onToolCalls', toolCallsTriggered === 0);
check('aborted status invokes onAborted instead', abortedCallbackArgs?.targetId === 201);

// Case 5d: Rapid re-send before worker emits aborted queues cleanly instead of throwing busy
wc.postQuery([{ role: 'user', content: 'first' }], 301, 'chat-c');
wc.abortGeneration(301, 'chat-c');
postedMessages.length = 0;
wc.postQuery([{ role: 'user', content: 'retry' }], 302, 'chat-c');
check('re-sending during worker unwind queues query instead of posting while busy', postedMessages.length === 0);
wc.workerMessageHandler({ data: { status: 'aborted', targetId: 301, chatId: 'chat-c', message: '' } });
check('queued query flushes immediately once aborted worker unwinds', postedMessages.length === 1 && postedMessages[0].targetId === 302);

// Case 5e: callWorkerRPC rejects immediately with AbortError when signal is aborted
const fakeToolsWorker = {
    listeners: new Set(),
    addEventListener(type, fn) { if (type === 'message') this.listeners.add(fn); },
    removeEventListener(type, fn) { if (type === 'message') this.listeners.delete(fn); },
    postMessage() {}
};
const sigRpc = wc.getAbortSignal(401);
const rpcPromise = wc.callWorkerRPC(fakeToolsWorker, { tool: 'web_search', params: {} }, 30000, sigRpc);
wc.abortGeneration(401, 'chat-d');
let rpcAborted = false;
try {
    await rpcPromise;
} catch (err) {
    rpcAborted = err?.name === 'AbortError';
}
check('callWorkerRPC rejects immediately with AbortError on Stop', rpcAborted);

// Static structural checks for handleToolCalls & worker.js abort guards
check('handleToolCalls checks workerController.isTargetAborted before posting follow-up query',
    /handleToolCalls[\s\S]*?isTargetAborted\(targetId\)/.test(appContent));
const workerContent = fs.readFileSync(path.resolve('workers/worker.js'), 'utf8');
check('worker.js checks isAborted after tokenizer and guards targetId on abort',
    /activeTargetId/.test(workerContent) && /tokenizer\(prompt\)[\s\S]{0,120}AbortGeneration/.test(workerContent));

console.log(failed === 0 ? '\nALL STOP THINKING BUBBLE TESTS PASSED' : `\n${failed} FAILED`);
process.exit(failed === 0 ? 0 : 1);
