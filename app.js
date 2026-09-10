import { globalState } from './global-state.js';
import { chatManager } from './chat-manager.js';
import { gameController } from './game-controller.js?v=5';
import { attachmentManager } from './attachment-manager.js';
import { uiManager } from './ui-manager.js';
import { workerController, hasToolCalls } from './worker-controller.js';

import { smallTalk } from './smalltalk.js?v=3';

import { CONFIG } from './config.js';
import { safeLocalStorage, dbSaveNote, dbDeleteNote, dbClearNotes } from './chat-db.js';
import { playSendSound } from './audio-wakelock.js';
import { getNextTargetId } from './stream-manager.js';
import {
    setupMessageRenderer,
    updateStatusLight,
    escapeHTML,
    appendUserMessage,
    updateLiveBubble,
    appendErrorToChat,
    renderChatLog as coreRender
} from './message-renderer.js';
import { setupModelPanel, updateModelInfo, refreshPresetCards } from './model-panel.js';
import { UserInputProcessor } from './input-processor.js';

// ==========================================
// MANAGER WIRING & CALLBACKS
// ==========================================

function renderChatLog() {
    coreRender({
        chatHistory: chatManager.chatHistory,
        chatLogEl: document.getElementById('chatLog'),
        activeGenerations: workerController.activeGenerations,
        currentChatId: chatManager.currentChatId,
        onCopy: () => _showCopyToast(),
        onEdit: (idx, txt) => {
            uiManager.cmdInput.value = txt;
            chatManager.chatHistory = chatManager.chatHistory.slice(0, idx);
            chatManager.persistCurrentChat(() => gameController.getGameState());
            renderChatLog();
        }
    });

    // Restore thinking / streaming bubble for this thread if generation is still in progress.
    // renderChatLog wipes the DOM (innerHTML = ''), so without this the bubble is lost on
    // thread switch and never comes back until a new worker event arrives.
    const targetId = workerController.activeGenerations.get(chatManager.currentChatId);
    if (targetId != null) {
        import('./stream-manager.js').then(sm => {
            // Pause every other stream so background animations cannot inject ghost bubbles
            sm.pauseStreamsExcept(targetId);
            sm.resumeStreamForTarget(targetId);
        });
    } else {
        // No active gen on this chat — pause all streams' DOM updates
        import('./stream-manager.js').then(sm => sm.pauseStreamsExcept(null));
    }
}

window.gameController = gameController;
window.chatManager = chatManager;
window.workerController = workerController;
window.renderChatLog = renderChatLog;
window.globalState = globalState;
window.sendMessage = sendMessage;


// Chat Manager Callbacks
chatManager.onChatListUpdated = () => {
    const chatListEl = document.getElementById('chatList');
    if (!chatListEl) return;
    chatListEl.innerHTML = '';
    chatManager.allChats.forEach(chat => {
        const chatItem = document.createElement('div');
        chatItem.className = 'chat-item';
        chatItem.dataset.chatId = chat.id;
        chatItem.setAttribute('role', 'listitem');

        // Make the whole row keyboard-activatable
        const rowBtn = document.createElement('div');
        rowBtn.className = 'chat-item-main';
        rowBtn.setAttribute('role', 'button');
        rowBtn.tabIndex = 0;
        rowBtn.setAttribute('aria-label', `Open chat: ${chat.name}`);

        const chatText = document.createElement('span');
        chatText.textContent = chat.name;
        chatText.style.pointerEvents = 'none';
        rowBtn.appendChild(chatText);

        const openChat = () => {
            chatManager.loadChatHistory(
                chat.id,
                () => gameController.getGameState(),
                (state) => gameController.restoreGameState(state),
                safeLocalStorage
            );
            if (window.innerWidth <= 768) uiManager.closeSidebar();
        };
        rowBtn.onclick = openChat;
        rowBtn.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                openChat();
            }
        });

        const deleteBtn = document.createElement('button');
        deleteBtn.type = 'button';
        deleteBtn.textContent = 'x';
        deleteBtn.className = 'delete-chat-btn';
        deleteBtn.setAttribute('aria-label', `Delete chat: ${chat.name}`);
        deleteBtn.onclick = (e) => {
            e.stopPropagation();
            chatManager.deleteChat(
                chat.id,
                safeLocalStorage,
                () => gameController.getGameState(),
                (state) => gameController.restoreGameState(state),
                () => uiManager.getWelcomeMessage(isMobileDevice(), isTVDevice(), true)
            );
        };

        chatItem.appendChild(rowBtn);
        chatItem.appendChild(deleteBtn);
        chatListEl.appendChild(chatItem);
    });

    updateChatListActive(chatManager.currentChatId);
};

function updateChatListActive(chatId) {
    document.querySelectorAll('#chatList .chat-item').forEach(item => {
        item.classList.toggle('active', chatId != null && Number(item.dataset.chatId) === chatId);
    });
}

chatManager.onChatChanged = (chatId) => {
    updateChatListActive(chatId);
    renderChatLog();
};

chatManager.onNotesLoaded = (notes) => {
    _updateNotesUI(notes);
};

// Game Controller Callbacks
gameController.onGameStateChange = () => {
    chatManager.persistCurrentChat(() => gameController.getGameState());
};

window.closeActiveGame = function() {
    gameController.closeActiveGame((sysMsg) => {
        chatManager.chatHistory.push({ role: 'system', content: sysMsg });
    });
    chatManager.persistCurrentChat(() => gameController.getGameState());
};

// Worker Controller Callbacks

// ── Bug #1 guard: true while a canned typewriter animation owns isGeneratingUI.
// Prevents a late worker 'done'/'complete' from calling setIdleState(true) and
// stopping the animation mid-stream.
let _cannedGenActive = false;

// ── Bug #3 guard: tracks consecutive invalid-move retries per background chat.
// Without this a bad AI move causes an unbounded postQuery loop on the worker.
const _bgChatMoveRetries = new Map(); // chatId → retry count

workerController.onWorkerStatus = (status, message, e) => {
    if (status === 'done' || status === 'complete' || status === 'error' || status === 'aborted') {
        const isToolCall = (status === 'complete' || status === 'aborted') && message && hasToolCalls(message);
        // Don't let a worker status reset the UI while a canned animation owns isGeneratingUI.
        // (The canned handler will call setIdleState itself when it finishes.)
        if (!_cannedGenActive && !isToolCall) {
            uiManager.setIdleState(true, (v) => globalState.isGeneratingUI = v);
            updateStatusLight('idle');
            uiManager.updateStatusText('✅ READY');
        }
        if (status === 'aborted' && e.data.chatId) workerController.activeGenerations.delete(e.data.chatId);
        if (status === 'complete' && e.data.chatId) workerController.activeGenerations.delete(e.data.chatId);
        if (status === 'error' && e.data.chatId) workerController.activeGenerations.delete(e.data.chatId);
    } else {
        if (!globalState.isGeneratingUI) {
            uiManager.setIdleState(false, (v) => globalState.isGeneratingUI = v);
            updateStatusLight('thinking');
        }
        if (status === 'thinking') uiManager.updateStatusText('🧠 THINKING...');
        if (status === 'streaming') uiManager.updateStatusText('💬 RESPONDING...');
    }
};

workerController.onModelInfo = (data) => {
    globalState.gpuInfo = data.gpuInfo;
    globalState.presets = data.presets;
    globalState.deviceRamGB = data.ramGB ?? 4;
    updateModelInfo({ gpuInfo: globalState.gpuInfo, presets: globalState.presets, ramGB: globalState.deviceRamGB });
};

workerController.onWarmStart = (preset) => {
    uiManager.updateStatusMeta(`Resuming: ${preset.label}…`);
    uiManager.updateStatusText(`RESUMING ${preset.label.toUpperCase()}…`);
};

workerController.onDownloadProgress = (loaded, total, file) => {
    const percent = total ? (loaded / total * 100) : 0;
    uiManager.updateProgress(percent);
    const mbLoaded = (loaded / 1024 / 1024).toFixed(1);
    const mbTotal = (total / 1024 / 1024).toFixed(1);
    uiManager.updateStatusMeta(`Downloading: ${file || 'weights'} (${mbLoaded}/${mbTotal} MB)`);
    uiManager.updateStatusText(`⬇️ DOWNLOADING (${Math.round(percent)}%)...`);
};

workerController.onWorkerDone = (data) => {
    if (data && data.backend) {
        const backend = data.backend === 'webgpu' ? 'WebGPU' : 'WASM (CPU)';
        const deviceTag = data.isTV ? ' · TV Mode' : data.isMobile ? ' · Lightweight Mode' : '';
        uiManager.updateStatusMeta(`JAMES is online (${backend}${deviceTag})`);
        uiManager.updateProgress(100);
        uiManager.updateStatusText('✅ READY');

        const runningPreset = globalState.presets.find(
            p => p.backend === data.backend && p.dtype === data.dtype && p.model === data.model
        );
        if (runningPreset) {
            globalState.activePresetId = runningPreset.id;
            globalState.selectedPresetId = runningPreset.id;
            safeLocalStorage.setItem('james-last-preset-id', runningPreset.id);
            updateModelInfo({ activePresetId: globalState.activePresetId, selectedPresetId: globalState.selectedPresetId });
            refreshPresetCards();
            uiManager.updateActiveModelLabel(runningPreset.label);
        }
    }
    
    if (window._chatsLoadedForRecovery) {
        initRecovery();
    }
};

workerController.onStreaming = (chatId, targetId, message) => {
    // Always keep stream state so returning to a background thread can restore the bubble.
    // Only drive the typewriter / DOM when this is the visible chat.
    const isActive = chatId === chatManager.currentChatId;
    import('./stream-manager.js').then(sm => sm.queueStreamText(targetId, message, { updateDom: isActive }));
};

workerController.onThinking = (chatId, targetId) => {
    // Remember that this generation is in the thinking phase for this thread.
    // Only paint the bubble if the user is currently viewing that thread.
    if (chatId === chatManager.currentChatId) {
        updateLiveBubble("...", targetId);
    }
};

workerController.onComplete = (chatId, targetId, message) => {
    import('./stream-manager.js').then(sm => sm.flushStreamQueue(targetId));
    if (chatId === chatManager.currentChatId) {
        if (!message || message.trim() === '') {
            const bubble = document.getElementById(`bubble-${targetId}`);
            if (bubble && bubble.parentElement) {
                bubble.parentElement.remove();
            }
        } else {
            updateLiveBubble(message, targetId, true);
            chatManager.chatHistory.push({ role: 'assistant', content: message });
            
            if (gameController.activeGame) {
                import('./game-logic.js').then(({ extractAIMove }) => {
                    const aiMove = extractAIMove(message, gameController.activeGame);
                    if (aiMove) {
                        gameController.handleMakeMove(
                            { move: aiMove },
                            (msg) => {
                                chatManager.chatHistory.push({ role: 'system', content: msg });
                                renderChatLog();
                            },
                            (v) => uiManager.setIdleState(v, (x) => globalState.isGeneratingUI = x),
                            null
                        );
                        chatManager.persistCurrentChat(() => gameController.getGameState());
                    }
                });
            }
            chatManager.persistCurrentChat(() => gameController.getGameState());
        }
    } else if (chatId !== chatManager.currentChatId && message) {
        const bgChat = chatManager.allChats.find(c => c.id === chatId);
        if (bgChat) {
            bgChat.messages.push({ role: 'assistant', content: message });
            
            if (bgChat.gameState) {
                import('./game-logic.js').then(({ extractAIMove, ChessGame, CheckersGame }) => {
                    const tempGame = bgChat.gameState.type === 'checkers' ? new CheckersGame() : new ChessGame();
                    if (bgChat.gameState.fen) tempGame.loadFen(bgChat.gameState.fen);
                    tempGame.aiColor = bgChat.gameState.aiColor || 'b';
                    
                    const aiMove = extractAIMove(message, tempGame);
                    if (aiMove) {
                        const moveInfo = tempGame.move(aiMove);
                        if (moveInfo) {
                            let notation = moveInfo.notation || moveInfo.san;
                            if (bgChat.gameState.history && tempGame.setHistory) tempGame.setHistory(bgChat.gameState.history);
                            if (!tempGame.moveHistory) tempGame.moveHistory = [];
                            if (notation) tempGame.moveHistory.push(notation);
                            bgChat.gameState = {
                                type: tempGame.type,
                                fen: tempGame.getFen(),
                                history: tempGame.getHistory ? tempGame.getHistory() : null,
                                aiColor: tempGame.aiColor
                            };
                        } else {
                            bgChat.messages.push({ role: 'system', content: `[System]: Failed to make move ${aiMove}. Invalid move.` });
                            const nextTargetId = Date.now().toString(36);
                            workerController.postQuery(getMessagesWindow(bgChat.messages), nextTargetId, chatId);
                        }
                    }
                    import('./chat-db.js').then(db => db.dbSaveChat(bgChat));
                });
            } else {
                import('./chat-db.js').then(db => db.dbSaveChat(bgChat));
            }
        }
    }
};

workerController.onToolCalls = (message, targetId, chatId) => {
    handleToolCalls(message, targetId, chatId);
};

workerController.onAborted = (chatId, targetId, message) => {
    import('./stream-manager.js').then(sm => sm.flushStreamQueue(targetId));
    if (chatId === chatManager.currentChatId && message !== undefined && message !== null) {
        updateLiveBubble(message, targetId, true); // force=true: bypass throttle so the final aborted content always renders
        chatManager.chatHistory.push({ role: 'assistant', content: message });
        
        if (window.gameController && window.gameController.activeGame) {
            import('./game-logic.js').then(({ extractAIMove }) => {
                const aiMove = extractAIMove(message, window.gameController.activeGame);
                if (aiMove) {
                    window.gameController.handleMakeMove(
                        { move: aiMove },
                        (msg) => {
                            chatManager.chatHistory.push({ role: 'system', content: msg });
                            renderChatLog();
                        },
                        (v) => uiManager.setIdleState(v, (x) => globalState.isGeneratingUI = x),
                        null
                    );
                    chatManager.persistCurrentChat(() => window.gameController.getGameState());
                }
            });
        }
        
        chatManager.persistCurrentChat(() => gameController.getGameState());
    } else if (chatId !== chatManager.currentChatId && message) {
        const bgChat = chatManager.allChats.find(c => c.id === chatId);
        if (bgChat) {
            bgChat.messages.push({ role: 'assistant', content: message });
            
            if (bgChat.gameState) {
                import('./game-logic.js').then(({ extractAIMove, ChessGame, CheckersGame }) => {
                    const tempGame = bgChat.gameState.type === 'checkers' ? new CheckersGame() : new ChessGame();
                    if (bgChat.gameState.fen) tempGame.loadFen(bgChat.gameState.fen);
                    tempGame.aiColor = bgChat.gameState.aiColor || 'b';
                    
                    const aiMove = extractAIMove(message, tempGame);
                    if (aiMove) {
                        const moveInfo = tempGame.move(aiMove);
                        if (moveInfo) {
                            // Successful move — reset the retry counter for this chat.
                            _bgChatMoveRetries.delete(chatId);
                            let notation = moveInfo.notation || moveInfo.san;
                            if (bgChat.gameState.history && tempGame.setHistory) tempGame.setHistory(bgChat.gameState.history);
                            if (!tempGame.moveHistory) tempGame.moveHistory = [];
                            if (notation) tempGame.moveHistory.push(notation);
                            bgChat.gameState = {
                                type: tempGame.type,
                                fen: tempGame.getFen(),
                                history: tempGame.getHistory ? tempGame.getHistory() : null,
                                aiColor: tempGame.aiColor
                            };
                        } else {
                            // Invalid move — cap retries at 3 to prevent an unbounded query storm.
                            const _retries = (_bgChatMoveRetries.get(chatId) || 0) + 1;
                            if (_retries > 3) {
                                _bgChatMoveRetries.delete(chatId);
                                bgChat.messages.push({ role: 'system', content: '[System]: AI could not produce a valid move after several attempts. Please resume the game manually.' });
                            } else {
                                _bgChatMoveRetries.set(chatId, _retries);
                                bgChat.messages.push({ role: 'system', content: `[System]: Failed to make move ${aiMove}. Invalid move. Try again.` });
                                const nextTargetId = Date.now().toString(36);
                                workerController.postQuery(getMessagesWindow(bgChat.messages), nextTargetId, chatId);
                            }
                        }
                    }
                    import('./chat-db.js').then(db => db.dbSaveChat(bgChat));
                });
            } else {
                import('./chat-db.js').then(db => db.dbSaveChat(bgChat));
            }
        }
    }
    if (chatId === chatManager.currentChatId) {
        renderChatLog();
    }
};

// Attachment Manager Callbacks
attachmentManager.onPreviewsUpdated = () => {
    const previewContainer = document.getElementById('attachmentPreview');
    if (!previewContainer) return;

    previewContainer.innerHTML = '';
    attachmentManager.attachedFiles.forEach((file, index) => {
        const chip = document.createElement('div');
        chip.className = 'attachment-chip';
        
        const span = document.createElement('span');
        span.textContent = `📄 ${file.name}`;
        
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.innerHTML = '&times;';
        btn.onclick = () => attachmentManager.removeAttachment(index);
        
        chip.appendChild(span);
        chip.appendChild(btn);
        previewContainer.appendChild(chip);
    });
};
window.attachmentManager = attachmentManager;

// ==========================================
// CORE SEND LOGIC
// ==========================================

function getMessagesWindow(messages) {
    const background = messages.filter(m => m.isBackground);
    const regular = messages.filter(m => !m.isBackground);

    let windowed = regular;
    if (regular.length > CONFIG.ui.maxHistory) {
        windowed = regular.slice(-CONFIG.ui.maxHistory);
    }
    while (windowed.length > 0 && windowed[0].role !== 'user') {
        windowed = windowed.slice(1);
    }

    // Remove old tool results (system messages) to save context tokens.
    // We only keep tool results if they occur AFTER the most recent user message.
    const lastUserIdx = windowed.map(m => m.role).lastIndexOf('user');
    if (lastUserIdx !== -1) {
        windowed = windowed.filter((m, i) => !(i < lastUserIdx && m.role === 'system'));
    }

    if (chatManager.userNotes && chatManager.userNotes.length > 0) {
        const notesText = chatManager.userNotes.map(n => `- ${n.text}`).join('\n');
        const notesMsg = {
            role: 'system',
            content: `[About this user]\n${notesText}`,
            isBackground: true
        };
        windowed = [notesMsg, ...windowed];
    }

    return [...windowed, ...background];
}

function sendMessage(preExecutedMove = null) {
    const text = uiManager.cmdInput.value.trim();
    if ((!text && attachmentManager.attachedFiles.length === 0 && !preExecutedMove) || globalState.isGeneratingUI) return;

    const processedText = UserInputProcessor.process(text);
    let fullPrompt = processedText;

    if (attachmentManager.attachedFiles.length > 0) {
        let fileContext = "\n\n[Attached Files Content]:\n";
        attachmentManager.attachedFiles.forEach(file => {
            fileContext += `\n--- START FILE: ${file.name} ---\n${file.content}\n--- END FILE: ${file.name} ---\n`;
        });
        fullPrompt = (processedText ? processedText + "\n" : "Please analyze the attached file(s):") + fileContext;
    }

    let userMovePlayed = null;
    if (gameController.activeGame) {
        if (preExecutedMove) {
            userMovePlayed = preExecutedMove;
        } else {
            userMovePlayed = gameController.parseUserMove(text);
        }
        
        if (userMovePlayed) {
            gameController.handleGameMove(
                userMovePlayed, 
                null, 
                (v) => uiManager.setIdleState(v, (x) => globalState.isGeneratingUI = x), 
                null,
                !!preExecutedMove // indicates UI already handled notation update
            );
        }

        const turnColor = gameController.activeGame.getTurn() === 'w' ? 'White' : 'Black';
        const aiColor = gameController.activeGame.aiColor === 'w' ? 'White' : 'Black';
        const gameTypeLabel = gameController.activeGame.type === 'chess' ? 'FEN' : 'Checkers Board';
        const formatReminder = gameController.activeGame.type === 'chess' 
            ? 'IMPORTANT: You must format your move using Standard Algebraic Notation (SAN) for chess (e.g. "e5", "Nf3", "O-O", "Bxc6"). Do NOT use "from to" coordinate format like "c6 to c5".' 
            : 'IMPORTANT: You must format your move using Standard Checkers Notation (1-32) (e.g. "11-15", or "11x18x25" for multi-jumps). Do NOT use coordinates.';
        
        let moveHistoryStr = '';
        if (gameController.activeGame.getHistory) {
            const history = gameController.activeGame.getHistory();
            if (history && history.length > 0) {
                moveHistoryStr = ` Move history: ${history.join(' ')}.`;
            }
        }
        
        if (userMovePlayed) {
            fullPrompt += `\n\n[Game State] Current ${gameTypeLabel}: ${gameController.activeGame.getFen()}.${moveHistoryStr} You are playing ${aiColor}. The user just played ${userMovePlayed.notation}. It is NOW YOUR TURN. You MUST use the make_move tool immediately to play your move. ${formatReminder} Do NOT ask the user for their move—they just played it!`;
        } else {
            fullPrompt += `\n\n[Game State] Current ${gameTypeLabel}: ${gameController.activeGame.getFen()}.${moveHistoryStr} You are playing ${aiColor}. It is currently ${turnColor}'s turn. If the user's message is just normal chat, reply normally without using any game tools. If you are making a move, remember: ${formatReminder}`;
        }
    }

    const displayMessage = processedText + (attachmentManager.attachedFiles.length > 0 ? ` [Attached: ${attachmentManager.attachedFiles.map(f => f.name).join(', ')}]` : '');

    chatManager.chatHistory.push({ role: 'user', content: fullPrompt, displayContent: displayMessage });
    appendUserMessage(displayMessage, chatManager.chatHistory.length - 1);

    uiManager.cmdInput.value = '';
    const filesToSend = [...attachmentManager.attachedFiles];
    attachmentManager.clearAttachments();
    chatManager.persistCurrentChat(() => gameController.getGameState());

    playSendSound();
    uiManager.sendBtn.classList.add('sending');
    uiManager.sendBtn.addEventListener('animationend', () => uiManager.sendBtn.classList.remove('sending'), { once: true });

    chatManager.updateChatName(chatManager.currentChatId, text || filesToSend.map(f => f.name).join(', ') || 'File upload');

    if (filesToSend.length === 0) {
        const canned = smallTalk.match(processedText);
        if (canned) {
            simulateCannedResponse(canned); // Need to patch simulateCannedResponse to use global state
            return;
        }
    }

    uiManager.setIdleState(false, (v) => globalState.isGeneratingUI = v);
    updateStatusLight('thinking');
    uiManager.updateStatusText('🧠 THINKING...');

    const messagesForModel = getMessagesWindow(chatManager.chatHistory);
    const targetId = getNextTargetId();
    updateLiveBubble('...', targetId);
    // Scroll to bottom after adding user message + thinking bubble
    const _chatLog = document.getElementById('chatLog');
    if (_chatLog) _chatLog.scrollTop = _chatLog.scrollHeight;
    workerController.postQuery(messagesForModel, targetId, chatManager.currentChatId);
}

function handleStopGeneration() {
    if (workerController.activeGenerations.has(chatManager.currentChatId)) {
        workerController.worker.postMessage({ type: 'abort', targetId: workerController.activeGenerations.get(chatManager.currentChatId) });
        uiManager.updateStatusText('🛑 STOPPING...');
    }
}

window.simulateCannedResponse = function(text) {
    globalState.cannedGenId++;
    const currentGenId = globalState.cannedGenId;

    // Lock: prevents worker 'done'/'complete' messages from calling setIdleState(true)
    // and interrupting this animation. Cleared in every exit path below.
    _cannedGenActive = true;

    uiManager.setIdleState(false, (v) => globalState.isGeneratingUI = v);
    updateStatusLight('thinking');
    uiManager.updateStatusText('🧠 THINKING...');

    const targetId = getNextTargetId();
    workerController.activeGenerations.set(chatManager.currentChatId, targetId);
    updateLiveBubble('', targetId);

    // Brief "thinking" pause before streaming starts, then typewriter character-by-character
    setTimeout(() => {
        // If a newer canned response superseded this one, or generating was externally cleared,
        // exit — but only clear _cannedGenActive if we are still the current gen.
        if (!globalState.isGeneratingUI || globalState.cannedGenId !== currentGenId) {
            if (globalState.cannedGenId === currentGenId) _cannedGenActive = false;
            return;
        }
        uiManager.updateStatusText('💬 RESPONDING...');

        let chars = 0;

        function streamNextChar() {
            if (!globalState.isGeneratingUI || globalState.cannedGenId !== currentGenId) {
                // Superseded by a newer canned gen — don't clear the flag if a newer gen is live.
                if (globalState.cannedGenId === currentGenId) _cannedGenActive = false;
                workerController.activeGenerations.delete(chatManager.currentChatId);
                return;
            }

            chars++;
            if (chars >= text.length) {
                // Final character — commit and finish
                try {
                    updateLiveBubble(text, targetId, true);
                    chatManager.chatHistory.push({ role: 'assistant', content: text });
                    chatManager.persistCurrentChat(() => gameController.getGameState());
                    renderChatLog();
                } finally {
                    // We are the latest gen — safe to unconditionally clear the lock.
                    _cannedGenActive = false;
                    uiManager.setIdleState(true, (v) => globalState.isGeneratingUI = v);
                    updateStatusLight('idle');
                    uiManager.updateStatusText('✅ READY');
                    workerController.activeGenerations.delete(chatManager.currentChatId);
                }
                return;
            }

            updateLiveBubble(text.substring(0, chars), targetId);

            // Natural typing speed: pause slightly longer after punctuation
            const ch = text[chars - 1];
            const delay = /[.!?,;:\n]/.test(ch) ? 60 + Math.random() * 40 : 18 + Math.random() * 14;
            setTimeout(streamNextChar, delay);
        }

        streamNextChar();
    }, 180);
};

// ── Bug #2 guard: strictly serialize tool executions per chat to prevent concurrent
// executions from pushing duplicate history messages if the worker double-fires 'complete'.
const _toolExecutionQueue = new Map();

async function handleToolCalls(message, targetId, originChatId, _depth = 0) {
    const previous = _toolExecutionQueue.get(originChatId) || Promise.resolve();
    const current = previous.catch(() => {}).then(async () => {
        const isActiveChat = originChatId === chatManager.currentChatId;
        let targetHistory = chatManager.chatHistory;
        let bgChat = null;

        if (!isActiveChat) {
            bgChat = chatManager.allChats.find(c => c.id === originChatId);
            if (!bgChat) return;
            targetHistory = bgChat.messages;
        }

        if (_depth > CONFIG.ui.maxToolDepth) {
            if (isActiveChat) {
                appendErrorToChat("Maximum tool depth exceeded.");
                uiManager.setIdleState(true, (v) => globalState.isGeneratingUI = v);
            } else {
                targetHistory.push({ role: 'system', content: '[Error: Maximum tool depth exceeded]' });
                import('./chat-db.js').then(db => db.dbSaveChat(bgChat));
            }
            return;
        }

    const regex = /```\s*tool:run\n?([\s\S]*?)```/g;
    let match;
    const calls = [];
    while ((match = regex.exec(message)) !== null) {
        calls.push(match[1].trim());
    }

    if (calls.length === 0) {
        if (isActiveChat) {
            uiManager.setIdleState(true, (v) => globalState.isGeneratingUI = v);
        }
        return;
    }

    // Push the assistant's message with tool calls to history
    targetHistory.push({ role: 'assistant', content: message });
    if (isActiveChat) {
        chatManager.persistCurrentChat(() => gameController.getGameState());
    } else {
        await import('./chat-db.js').then(db => db.dbSaveChat(bgChat));
    }

    for (const callBlock of calls) {
        // ── Multi-format tool call parser ─────────────────────────────────────
        // Supports JSON, XML, and plain "key: value" formats (auto-detected).
        let toolName, params;

        const trimmed = callBlock.trim();

        // ── JSON format: {"tool":"name","params":{...}} or {"name":"...","params":{...}} ──
        if (trimmed.startsWith('{')) {
            try {
                const parsed = JSON.parse(trimmed);
                toolName = parsed.tool ?? parsed.name ?? parsed.tool_name ?? '';
                params = parsed.params ?? parsed.parameters ?? parsed.args ?? {};
            } catch {
                toolName = '';
                params = {};
            }
        }
        // ── XML format: <tool>name</tool><params><key>val</key>...</params> ──
        else if (trimmed.startsWith('<')) {
            try {
                const parser = new DOMParser();
                // Wrap in a root element so DOMParser handles it cleanly
                const doc = parser.parseFromString(`<root>${trimmed}</root>`, 'text/xml');
                const toolEl = doc.querySelector('tool') ?? doc.querySelector('name') ?? doc.querySelector('tool_name');
                toolName = toolEl?.textContent?.trim() ?? '';
                params = {};
                const paramsEl = doc.querySelector('params') ?? doc.querySelector('parameters') ?? doc.querySelector('args');
                if (paramsEl) {
                    for (const child of paramsEl.children) {
                        params[child.tagName] = child.textContent.trim();
                    }
                }
            } catch {
                toolName = '';
                params = {};
            }
        }
        // ── Plain "key: value" format (original / fallback) ──────────────────
        else {
            const lines = trimmed.split('\n').map(l => l.trim()).filter(l => l);
            toolName = lines[0];
            params = {};
            for (let i = 1; i < lines.length; i++) {
                const parts = lines[i].split(':');
                if (parts.length >= 2) {
                    const k = parts[0].trim();
                    const v = parts.slice(1).join(':').trim();
                    params[k] = v;
                }
            }
        }

        if (isActiveChat) uiManager.updateStatusText(`⚙️ RUNNING ${toolName.toUpperCase()}...`);
        let toolResult = null;

        try {
            if (toolName === 'start_game') {
                if (isActiveChat) {
                    gameController.handleStartGame(
                        params, 
                        (msg) => targetHistory.push({ role: 'system', content: msg }), 
                        () => {}
                    );
                    toolResult = `Game started: ${params.game || 'chess'}. Wait for user's move.`;
                } else {
                    toolResult = `Error: Cannot start game in background chat.`;
                }
            } else if (toolName === 'make_move') {
                if (isActiveChat) {
                    const moveResult = gameController.handleMakeMove(
                        params, 
                        (msg) => {
                            if (!msg.includes('Failed to make move')) {
                                targetHistory.push({ role: 'system', content: msg });
                            }
                        }, 
                        (v) => uiManager.setIdleState(v, (x) => globalState.isGeneratingUI = x),
                        () => {} 
                    );
                    if (moveResult && moveResult.success === false) {
                        toolResult = moveResult.error;
                    } else {
                        toolResult = `Move ${params.move} played. Wait for user's next move.`;
                    }
                } else {
                    if (bgChat.gameState) {
                        const { ChessGame, CheckersGame } = await import('./game-logic.js');
                        let tempGame = bgChat.gameState.type === 'checkers' ? new CheckersGame() : new ChessGame();
                        if (bgChat.gameState.fen) tempGame.loadFen(bgChat.gameState.fen);
                        if (bgChat.gameState.history && tempGame.setHistory) tempGame.setHistory(bgChat.gameState.history);
                        tempGame.aiColor = bgChat.gameState.aiColor || 'b';

                        const moveInfo = tempGame.move(params.move);
                        if (moveInfo) {
                            let notation = moveInfo.notation || moveInfo.san;
                            if (!tempGame.moveHistory) tempGame.moveHistory = [];
                            if (notation) tempGame.moveHistory.push(notation);
                            
                            bgChat.gameState = {
                                type: tempGame.type,
                                fen: tempGame.getFen(),
                                history: tempGame.getHistory ? tempGame.getHistory() : null,
                                aiColor: tempGame.aiColor
                            };
                            toolResult = `Move ${params.move} played. Wait for user's next move.`;
                        } else {
                            toolResult = `[System]: Failed to make move ${params.move}. Invalid move.`;
                        }
                    } else {
                        toolResult = `[System]: Failed to make move. No active game.`;
                    }
                }
            } else if (toolName === 'write_note') {
                const db = await import('./chat-db.js');
                const note = params.note;
                if (!note) throw new Error("No note provided");
                await db.dbSaveNote({ id: crypto.randomUUID(), text: note, timestamp: Date.now() });
                const updatedNotes = await db.dbLoadNotes();
                if (chatManager.onNotesLoaded) chatManager.onNotesLoaded(updatedNotes);
                toolResult = "Note saved silently.";
            } else if (toolName === 'eval_python' || toolName === 'python') {
                const pyResp = await workerController.callWorkerRPC(workerController.pythonWorker, { type: 'run', code: params.code }, 30000);
                // python-worker returns { status, execId, stdout, result, figures }
                toolResult = pyResp.stdout || pyResp.result || '(no output)';
                if (pyResp.figures && pyResp.figures.length > 0) {
                    toolResult += '\n[Matplotlib figures generated: ' + pyResp.figures.length + ']';
                }
            } else if (toolName === 'location') {
                const toolsBridge = await import('./tools-bridge.js');
                const loc = await toolsBridge.getLocation();
                toolResult = { latitude: loc.latitude, longitude: loc.longitude, accuracy: `${Math.round(loc.accuracy)}m` };
            } else if (toolName === 'clipboard') {
                const toolsBridge = await import('./tools-bridge.js');
                const content = await toolsBridge.readClipboard();
                toolResult = { content, length: content.length };
            } else if (toolName === 'timer') {
                const toolsBridge = await import('./tools-bridge.js');
                const s = Math.max(1, parseInt(params.seconds ?? 0));
                toolsBridge.showTimer(s, params.label, { DOM: { log: document.getElementById('chatLog') } });
                toolResult = { seconds: s, label: params.label ?? 'Timer', note: 'Timer started.' };
            } else {
                // Route all other tools to toolsWorker
                const rpcResp = await workerController.callWorkerRPC(workerController.toolsWorker, { tool: toolName, params }, 30000);
                toolResult = rpcResp.result ?? rpcResp;
            }
        } catch (e) {
            toolResult = `Error executing tool: ${e.message}`;
            if (isActiveChat) appendErrorToChat(toolResult);
        }

        if (toolResult) {
            const formattedResult = typeof toolResult === 'object' ? JSON.stringify(toolResult, null, 2) : toolResult;
            targetHistory.push({ role: 'system', content: `[Tool Result: ${toolName}]\n${formattedResult}` });
            if (isActiveChat) {
                chatManager.persistCurrentChat(() => gameController.getGameState());
                renderChatLog();
            } else {
                await import('./chat-db.js').then(db => db.dbSaveChat(bgChat));
            }
        }
    }

        if (isActiveChat) {
            uiManager.updateStatusText('🧠 THINKING...');
            const nextTargetId = getNextTargetId();
            workerController.postQuery(getMessagesWindow(targetHistory), nextTargetId, originChatId);
            updateLiveBubble('...', nextTargetId);
        } else {
            const nextTargetId = Date.now().toString(36);
            workerController.postQuery(getMessagesWindow(targetHistory), nextTargetId, originChatId);
        }
    });

    _toolExecutionQueue.set(originChatId, current);
    return current;
}

// ==========================================
// RECOVERY LOGIC
// ==========================================
function initRecovery() {
    if (!chatManager.chatHistory || chatManager.chatHistory.length === 0) return;
    const lastMsg = chatManager.chatHistory[chatManager.chatHistory.length - 1];
    if (lastMsg.role !== 'user') return;

    const overlay = document.getElementById('recoveryOverlay');
    const modal = document.getElementById('recoveryModal');
    if (!overlay || !modal) return;

    overlay.classList.add('visible');
    modal.classList.add('open');

    const lastInput = lastMsg.displayContent || lastMsg.content || '(previous message)';
    const promptTextEl = modal.querySelector('#recoveryPromptText');
    if (promptTextEl) {
        promptTextEl.textContent = `"${lastInput.substring(0, 80)}${lastInput.length > 80 ? '…' : ''}"`;
    } else {
        const modalBody = modal.querySelector('.recovery-body');
        if (modalBody) {
            modalBody.innerHTML = `
            It looks like the page was refreshed while JAMES was generating a response to:<br><br>
            <strong id="recoveryPromptText" style="color: var(--primary-blue);"></strong><br><br>
            Would you like to try regenerating the last message?
        `;
            modal.querySelector('#recoveryPromptText').textContent = `"${lastInput.substring(0, 80)}${lastInput.length > 80 ? '…' : ''}"`;
        }
    }

    const closePopup = () => {
        overlay.classList.remove('visible');
        modal.classList.remove('open');
    };

    document.getElementById('recoveryNoBtn')?.addEventListener('click', closePopup, { once: true });
    document.getElementById('recoveryClose')?.addEventListener('click', closePopup, { once: true });

    document.getElementById('recoveryYesBtn')?.addEventListener('click', () => {
        closePopup();
        uiManager.setIdleState(false, (v) => globalState.isGeneratingUI = v);
        updateStatusLight('thinking');
        uiManager.updateStatusText('⏩ RESUMING...');

        const targetId = getNextTargetId();
        updateLiveBubble('...', targetId, true);
        workerController.postQuery(getMessagesWindow(chatManager.chatHistory), targetId, chatManager.currentChatId);
    }, { once: true });
}

window.initRecovery = initRecovery;
window.uiManager = uiManager;

// ==========================================
// INITIALIZATION
// ==========================================
function isMobileDevice() {
    return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
}
/** True for Smart TVs, set-top boxes, and large living-room displays. */
function isTVDevice() {
    const ua = navigator.userAgent;
    if (/SmartTV|SMART-TV|Tizen|WebOS|Web0S|HbbTV|BRAVIA|NetCast|Roku|AFT[A-Z]|CrKey|AppleTV|Android TV|googletv/i.test(ua)) {
        return true;
    }
    // Large screen + coarse pointer (remote / gamepad) ≈ 10-foot UI
    try {
        const large = window.matchMedia('(min-width: 1920px)').matches;
        const coarse = window.matchMedia('(pointer: coarse)').matches;
        const noHover = window.matchMedia('(hover: none)').matches;
        if (large && coarse && noHover) return true;
    } catch (_) {}
    return false;
}

function setupEventListeners() {
    if (uiManager.sendBtn && uiManager.cmdInput) {
        uiManager.sendBtn.addEventListener('click', () => {
            if (globalState.isGeneratingUI) handleStopGeneration();
            else sendMessage();
        });
        uiManager.cmdInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                if (globalState.isGeneratingUI) handleStopGeneration();
                else sendMessage();
            }
        });
    }

    document.getElementById('stopButton')?.addEventListener('click', handleStopGeneration);
    document.getElementById('stop-button')?.addEventListener('click', handleStopGeneration);
}

// Bootstrap
document.addEventListener('DOMContentLoaded', () => {
    setupEventListeners();
    attachmentManager.setupFileAttachment('attachButton', 'fileInput', 'chatWindow', appendErrorToChat);
});

(async () => {
    await chatManager.loadSavedChats((await import('./chat-db.js')).migrateFromLocalStorage, (await import('./crypto-utils.js')).initEncryption);
    const lastChatId = Number(safeLocalStorage.getItem('james-last-chat-id'));
    const lastChat = chatManager.allChats.find(c => c.id === lastChatId);
    
    if (lastChat) {
        chatManager.loadChatHistory(
            lastChatId, 
            () => gameController.getGameState(), 
            (state) => gameController.restoreGameState(state),
            safeLocalStorage
        );
    } else if (chatManager.allChats.length > 0) {
        chatManager.loadChatHistory(
            chatManager.allChats[0].id,
            () => gameController.getGameState(), 
            (state) => gameController.restoreGameState(state),
            safeLocalStorage
        );
    } else {
        chatManager.startNewChat(
            () => uiManager.getWelcomeMessage(isMobileDevice(), isTVDevice(), true), 
            safeLocalStorage,
            () => gameController.getGameState(),
            (state) => gameController.restoreGameState(state)
        );
    }
    
    window._chatsLoadedForRecovery = true;
    if (workerController._recoveryInitDone) initRecovery();
})();

uiManager.initSidebarState(safeLocalStorage.getItem('james-sidebar-collapsed'));
if (isTVDevice()) uiManager.initTVMode();

uiManager.setIdleState(false, (v) => globalState.isGeneratingUI = v);
const _savedLastPresetId = safeLocalStorage.getItem('james-last-preset-id');
workerController.initWorkers(safeLocalStorage);
uiManager.updateStatusText(_savedLastPresetId ? '⏩ RESUMING LAST MODEL…' : '⚡ INITIALIZING...');

const newChatBtn = document.getElementById('newChatBtn');
if (newChatBtn) {
    newChatBtn.addEventListener('click', () => chatManager.startNewChat(
        () => uiManager.getWelcomeMessage(isMobileDevice(), isTVDevice(), true), 
        safeLocalStorage,
        () => gameController.getGameState(),
        (state) => gameController.restoreGameState(state)
    ));
}

document.getElementById('sidebarToggle')?.addEventListener('click', () => {
    const nowCollapsed = uiManager.toggleSidebar();
    safeLocalStorage.setItem('james-sidebar-collapsed', nowCollapsed);
});

document.getElementById('sidebarOverlay')?.addEventListener('click', () => uiManager.closeSidebar());

setupMessageRenderer({
    getChatHistory: () => chatManager.chatHistory,
    getIsGenerating: () => globalState.isGeneratingUI,
    onEditUserMsg: (historyIdx) => {
        if (historyIdx < 0 || historyIdx >= chatManager.chatHistory.length) return;
        const msg = chatManager.chatHistory[historyIdx];
        if (!msg || msg.role !== 'user') return;
        let originalText = msg.displayContent || msg.content;
        const fileMarker = '\n\n[Attached Files Content]:';
        const markerIdx = originalText.indexOf(fileMarker);
        if (markerIdx !== -1) originalText = originalText.substring(0, markerIdx).trim();
        chatManager.chatHistory = chatManager.chatHistory.slice(0, historyIdx);
        chatManager.persistCurrentChat(() => gameController.getGameState());
        if (uiManager.cmdInput) {
            uiManager.cmdInput.value = originalText;
            uiManager.cmdInput.focus();
        }
        renderChatLog();
    }
});

setupModelPanel({
    onApplyModel: (selectedId) => {
        // Abort any in-progress generation so the worker is free to re-init
        if (workerController.activeGenerations.size > 0) {
            const currentTargetId = workerController.activeGenerations.get(chatManager.currentChatId);
            if (currentTargetId) {
                workerController.worker.postMessage({ type: 'abort', targetId: currentTargetId });
            }
            workerController.activeGenerations.clear();
        }
        uiManager.updateProgress(0);
        uiManager.updateStatusMeta('Loading selected model…');
        uiManager.setIdleState(false, (v) => globalState.isGeneratingUI = v);
        uiManager.updateStatusText('⬇️ LOADING MODEL…');
        workerController.worker.postMessage({ type: 'init', forcePresetId: selectedId, screenWidth: window.screen?.width, maxTouchPoints: navigator.maxTouchPoints });
    }
});


function _showCopyToast() {
    const toast = document.getElementById('noteToast');
    if (!toast) return;
    toast.textContent = 'Copied!';
    toast.classList.add('visible');
    setTimeout(() => toast.classList.remove('visible'), 2000);
}

function _updateNotesUI(notes) {
    const notesList = document.getElementById('notesList');
    const btn = document.getElementById('notesBtn');
    
    if (btn) {
        btn.title = notes && notes.length > 0
            ? `JAMES remembers ${notes.length} thing${notes.length !== 1 ? 's' : ''} about you`
            : 'No memory notes yet';
        btn.classList.toggle('notes-active', notes && notes.length > 0);
    }
    
    if (!notesList) return;

    if (!notes || notes.length === 0) {
        notesList.innerHTML = '<p class="notes-empty">JAMES hasn\'t saved any notes about you yet.<br><small>Notes are saved automatically as you chat.</small></p>';
        return;
    }

    notesList.innerHTML = notes.map(note => `
        <div class="note-item" style="padding:0.75rem;border-bottom:1px solid var(--border-color);display:flex;justify-content:space-between;align-items:flex-start;gap:1rem;">
            <div style="font-size:0.9rem;line-height:1.4;flex:1;">${escapeHTML(note.text)}</div>
            <button class="icon-btn" onclick="window._deleteNote('${note.id}')" title="Delete Note" style="padding:4px;color:var(--error-color);">🗑️</button>
        </div>
    `).join('');
}
window._deleteNote = async (id) => {
    await dbDeleteNote(id);
    _updateNotesUI(await import('./chat-db.js').then(m => m.dbLoadNotes()));
};
document.getElementById('notesClearBtn')?.addEventListener('click', async () => {
    if (confirm('Clear all notes?')) {
        await dbClearNotes();
        _updateNotesUI([]);
    }
});

function _setupNotesPanel() {
    const btn      = document.getElementById('notesBtn');
    
// ── Accessibility: Escape closes any open modal panel ───────────────────────
document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    const panels = [
        { panel: 'notesPanel', overlay: 'notesPanelOverlay' },
        { panel: 'faqPanel', overlay: 'faqPanelOverlay' },
        { panel: 'modelPanel', overlay: 'modelPanelOverlay' },
        { panel: 'recoveryModal', overlay: 'recoveryOverlay' },
    ];
    for (const { panel, overlay } of panels) {
        const el = document.getElementById(panel);
        if (el?.classList.contains('open')) {
            el.classList.remove('open');
            document.getElementById(overlay)?.classList.remove('visible');
            e.preventDefault();
            // Return focus to a sensible place
            document.getElementById('cmdInput')?.focus();
            break;
        }
    }
});

const panel    = document.getElementById('notesPanel');
    const overlay  = document.getElementById('notesPanelOverlay');
    const closeBtn = document.getElementById('notesPanelClose');
    if (!btn || !panel) return;

    const openPanel  = () => { panel.classList.add('open'); overlay?.classList.add('visible'); };
    const closePanel = () => { panel.classList.remove('open'); overlay?.classList.remove('visible'); };

    btn.addEventListener('click', openPanel);
    overlay?.addEventListener('click', closePanel);
    closeBtn?.addEventListener('click', closePanel);
}
_setupNotesPanel();

function _setupFaqPanel() {
    const btn      = document.getElementById('faqBtn');
    const panel    = document.getElementById('faqPanel');
    const overlay  = document.getElementById('faqPanelOverlay');
    const closeBtn = document.getElementById('faqPanelClose');
    if (!btn || !panel) return;

    const openPanel  = (e) => { e.preventDefault(); panel.classList.add('open'); overlay?.classList.add('visible'); };
    const closePanel = () => { panel.classList.remove('open'); overlay?.classList.remove('visible'); };

    btn.addEventListener('click', openPanel);
    overlay?.addEventListener('click', closePanel);
    closeBtn?.addEventListener('click', closePanel);
}
_setupFaqPanel();

import('./tools-bridge.js').then(module => {
    module.setupToolsBridge({
        worker: workerController.toolsWorker,
        DOM: { log: document.getElementById('chatLog'), cmd: uiManager.cmdInput },
        submit: sendMessage
    });
}).catch(() => { });

if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch(err => console.warn('SW registration failed:', err));
}

const installBanner = document.getElementById('installBanner');
const installBtn = document.getElementById('installBtn');
const dismissBtn = document.getElementById('dismissInstallBtn');

window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    globalState.pwaDeferredPrompt = e;
    if (!safeLocalStorage.getItem('james-pwa-dismissed')) {
        installBanner?.classList.remove('hidden');
    }
});

installBtn?.addEventListener('click', async () => {
    installBanner?.classList.add('hidden');
    if (globalState.pwaDeferredPrompt) {
        globalState.pwaDeferredPrompt.prompt();
        await globalState.pwaDeferredPrompt.userChoice;
        globalState.pwaDeferredPrompt = null;
    }
});

dismissBtn?.addEventListener('click', () => {
    installBanner?.classList.add('hidden');
    safeLocalStorage.setItem('james-pwa-dismissed', 'true');
});

