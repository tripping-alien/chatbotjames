// Run with: node tests/test-chat-history-persistence.js
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

console.log('--- Chat History Persistence & Refresh Tests ---');

// 1. Verify core/chat-db.js implementation
const chatDbPath = path.resolve('core/chat-db.js');
const chatDbContent = fs.readFileSync(chatDbPath, 'utf8');

check('chat-db.js uses db.getAll(IDB_STORE) to load chats',
    /db\.getAll\(IDB_STORE\)/.test(chatDbContent));

check('chat-db.js does NOT keep openCursor across async decryptObject (avoids TransactionInactiveError)',
    !/openCursor\([^)]*\)[\s\S]*?await\s+decryptObject[\s\S]*?cursor\.continue/.test(chatDbContent));

check('chat-db.js decrypts chats via Promise.all after getAll',
    /Promise\.all\(rows\.map\(async\s+row/.test(chatDbContent));

// 2. Verify core/app.js implementation
const appPath = path.resolve('core/app.js');
const appContent = fs.readFileSync(appPath, 'utf8');

check('app.js handles string, number, and raw forms of james-last-chat-id',
    /rawLastId != null/.test(appContent) && /chatManager\.chatMap\.get\(Number\(rawLastId\)\)/.test(appContent));

check('app.js calls chatManager.onChatListUpdated after loading saved chats',
    /chatManager\.onChatListUpdated\(\)/.test(appContent));

check('app.js registers beforeunload listener to persist current chat before refresh',
    /window\.addEventListener\(['"]beforeunload['"],\s*\(\)\s*=>\s*\{\s*chatManager\.persistCurrentChat/.test(appContent));

check('app.js simulateCannedResponse uses persistCurrentChat to guarantee assistant message persistence',
    /simulateCannedResponse[\s\S]*?chatManager\.persistCurrentChat/.test(appContent));

check('app.js listens to alpine:init to keep Alpine store in sync',
    /document\.addEventListener\(['"]alpine:init['"],\s*syncAlpineChats\)/.test(appContent));

// 3. Verify index.html implementation
const indexPath = path.resolve('index.html');
const indexContent = fs.readFileSync(indexPath, 'utf8');

check('index.html checks window.chatManager when initializing Alpine store',
    /window\.chatManager\s*\?\s*\[\.\.\.window\.chatManager\.allChats\]/.test(indexContent));

// 4. Functional tests for ChatManager logic (evaluating without external network imports)
const chatManagerCode = fs.readFileSync(path.resolve('core/chat-manager.js'), 'utf8')
    .replace("import { dbSaveChat, dbDeleteChat, dbLoadAllChats, dbLoadNotes } from './chat-db.js';",
             "const dbSaveChat = () => Promise.resolve(); const dbDeleteChat = () => Promise.resolve(); const dbLoadAllChats = () => Promise.resolve([]); const dbLoadNotes = () => Promise.resolve([]);")
    .replace("import { CONFIG } from './config.js';", "const CONFIG = {};");

const moduleDataUri = 'data:text/javascript;base64,' + Buffer.from(chatManagerCode).toString('base64');
const { chatManager } = await import(moduleDataUri);

chatManager.startNewChat(() => ({ role: 'system', content: 'Welcome test' }), null, null, null);
check('startNewChat creates a chat with welcome message', chatManager.chatHistory.length === 1 && chatManager.chatHistory[0].content === 'Welcome test');
const firstChatId = chatManager.currentChatId;
check('firstChatId is generated', firstChatId != null);

chatManager.chatHistory.push({ role: 'user', content: 'Hello James' });
chatManager.chatHistory.push({ role: 'assistant', content: 'Hello Human' });
chatManager.persistCurrentChat();

const savedChat = chatManager.chatMap.get(firstChatId);
check('persistCurrentChat persists chat history into chatMap messages',
    savedChat && savedChat.messages.length === 3 && savedChat.messages[1].content === 'Hello James');

chatManager.startNewChat(() => ({ role: 'system', content: 'Second chat' }), null, null, null);
check('startNewChat switches to new thread', chatManager.currentChatId !== firstChatId);
check('new thread has fresh history', chatManager.chatHistory.length === 1 && chatManager.chatHistory[0].content === 'Second chat');

// Simulate page refresh / loading existing thread
chatManager.loadChatHistory(firstChatId, null, null, null);
check('loadChatHistory restores firstChatId as current', chatManager.currentChatId === firstChatId);
check('loadChatHistory restores the 3 messages', chatManager.chatHistory.length === 3 && chatManager.chatHistory[2].content === 'Hello Human');

console.log(`\nResults: ${failed === 0 ? 'ALL PASSED' : `${failed} FAILED`}`);
process.exit(failed);
