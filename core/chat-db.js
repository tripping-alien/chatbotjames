// ─── IndexedDB Chat + Notes Storage ──────────────────────────────────────────
// All data is encrypted at rest using AES-256-GCM via crypto-utils.js.
// Callers see plain JS objects; encryption/decryption is fully transparent.

import { initEncryption, encryptObject, decryptObject } from './crypto-utils.js';
import { openDB } from 'https://esm.sh/idb@8.0.0';
const _configCache = new Map();

export const safeLocalStorage = {
    getItem(key) {
        if (_configCache.has(key)) return _configCache.get(key);
        try {
            return localStorage.getItem(key);
        } catch (e) {
            return null;
        }
    },
    setItem(key, val) {
        _configCache.set(key, val);
        openChatDB().then(db => db.put(IDB_CONFIG_STORE, val, key)).catch(()=>{});
        try { localStorage.setItem(key, val); } catch (e) {}
    },
    removeItem(key) {
        _configCache.delete(key);
        openChatDB().then(db => db.delete(IDB_CONFIG_STORE, key)).catch(()=>{});
        try { localStorage.removeItem(key); } catch (e) {}
    }
};

// Initialize the memory cache from IDB on app startup
export async function initConfigCache() {
    try {
        const db = await openChatDB();

        // Migrate all existing configuration from localStorage to IDB.
        // Guard each iteration: in Firefox Private Mode, localStorage.key(i) can
        // throw SecurityError even if localStorage.length succeeded.
        for (let i = 0; i < localStorage.length; i++) {
            try {
                const key = localStorage.key(i);
                if (key && (key.startsWith('james-') || key.startsWith('chatbot-'))) {
                    const val = localStorage.getItem(key);
                    const existing = await db.get(IDB_CONFIG_STORE, key);
                    if (existing === undefined && val !== null) {
                        await db.put(IDB_CONFIG_STORE, val, key);
                    }
                }
            } catch (_itemErr) { /* skip inaccessible key (e.g. Firefox Private Mode) */ }
        }

        const keys = await db.getAllKeys(IDB_CONFIG_STORE);
        for (const k of keys) {
            _configCache.set(k, await db.get(IDB_CONFIG_STORE, k));
        }
    } catch (e) {
        console.warn('Failed to init config cache from IDB', e);
    }
}

const IDB_NAME        = 'james-chats-db';
const IDB_STORE       = 'chats';
const IDB_NOTES_STORE = 'user-notes';
const IDB_CONFIG_STORE= 'config';
let _idbPromise = null;

const _chatWriteQueues = new Map();
const _noteWriteQueues = new Map();

export function openChatDB() {
    if (!_idbPromise) {
        _idbPromise = openDB(IDB_NAME, 3, {
            upgrade(db, oldVersion /*, newVersion, tx */) {
                // v1 schema (initial release): chats only
                if (oldVersion < 1) {
                    db.createObjectStore(IDB_STORE, { keyPath: 'id' });
                }
                // v1 → v2: add user-notes store
                if (oldVersion < 2) {
                    if (!db.objectStoreNames.contains(IDB_NOTES_STORE)) db.createObjectStore(IDB_NOTES_STORE, { keyPath: 'id' });
                }
                // v2 → v3: add config store.
                // NOTE: config was originally in the oldVersion<2 block, but an intermediate
                // production deploy shipped v2 with only user-notes. Any DB already at v2
                // will never re-run that block, so we fix it here unconditionally for v3.
                if (oldVersion < 3) {
                    if (!db.objectStoreNames.contains(IDB_CONFIG_STORE)) db.createObjectStore(IDB_CONFIG_STORE);
                }
            },
            blocked() {
                // Another tab has the DB open at an older version — warn and
                // schedule a reload for when the user closes that tab and returns here.
                console.warn('[IDB] Database upgrade blocked by another tab. Close other JAMES tabs to allow the upgrade.');
                const onVisible = () => {
                    if (document.visibilityState === 'visible') {
                        document.removeEventListener('visibilitychange', onVisible);
                        window.location.reload();
                    }
                };
                document.addEventListener('visibilitychange', onVisible);
            },
            blocking() {
                // This tab is blocking a newer version in another tab — close gracefully
                _idbPromise = null;
            }
        }).catch(err => {
            // Reset so the next openChatDB() call retries rather than replaying a cached rejection
            _idbPromise = null;
            throw err;
        });
    }
    return _idbPromise;
}

// ─── Chat Storage ─────────────────────────────────────────────────────────────

export function dbSaveChat(chat) {
    if (!chat) return Promise.resolve();
    const { id } = chat;
    const payload = { name: chat.name, messages: chat.messages, gameState: chat.gameState ?? null };
    
    const previous = _chatWriteQueues.get(id) || Promise.resolve();
    const current = previous.catch(() => {}).then(async () => {
        const [data, db] = await Promise.all([encryptObject(payload), openChatDB()]);
        await db.put(IDB_STORE, { id, data });
    });
    
    _chatWriteQueues.set(id, current);
    current.catch(e => console.warn('IDB save failed:', e)).finally(() => {
        if (_chatWriteQueues.get(id) === current) _chatWriteQueues.delete(id);
    });
    return current;
}

export function dbDeleteChat(id) {
    const previous = _chatWriteQueues.get(id) || Promise.resolve();
    const current = previous.catch(() => {}).then(async () => {
        const db = await openChatDB();
        await db.delete(IDB_STORE, id);
    });
    
    _chatWriteQueues.set(id, current);
    current.catch(e => console.warn('IDB delete failed:', e)).finally(() => {
        if (_chatWriteQueues.get(id) === current) _chatWriteQueues.delete(id);
    });
    return current;
}

export async function dbLoadAllChats() {
    await initEncryption();
    try {
        const db = await openChatDB();
        const tx = db.transaction(IDB_STORE, 'readonly');
        let cursor = await tx.store.openCursor(null, 'prev');
        const chats = [];
        
        while (cursor) {
            try {
                if (cursor.value.data) {
                    const payload = await decryptObject(cursor.value.data);
                    chats.push({ id: cursor.value.id, ...payload });
                } else {
                    chats.push(cursor.value);
                }
            } catch (e) {
                console.warn(`⚠️ Could not decrypt chat ${cursor.value.id}:`, e);
            }
            cursor = await cursor.continue();
        }
        return chats;
    } catch (e) {
        console.warn('IDB load failed, returning empty state:', e);
        return [];
    }
}

export async function migrateFromLocalStorage() {
    const raw = safeLocalStorage.getItem('chatbot-chats');
    if (!raw) return;
    try {
        const chats = JSON.parse(raw);
        if (Array.isArray(chats) && chats.length > 0) {
            console.log(`📦 Migrating ${chats.length} chat(s) from localStorage → encrypted IndexedDB…`);
            await Promise.all(chats.map(chat => dbSaveChat(chat)));
            safeLocalStorage.removeItem('chatbot-chats');
            console.log('✅ Migration complete');
        }
    } catch (e) {
        console.warn('Migration failed:', e);
    }
}

// ─── User Notes Storage ───────────────────────────────────────────────────────

export function dbSaveNote(note) {
    if (!note) return Promise.resolve();
    const { id } = note;
    const payload = { text: note.text, timestamp: note.timestamp };
    
    const previous = _noteWriteQueues.get(id) || Promise.resolve();
    const current = previous.catch(() => {}).then(async () => {
        const [data, db] = await Promise.all([encryptObject(payload), openChatDB()]);
        await db.put(IDB_NOTES_STORE, { id, data });
    });
        
    _noteWriteQueues.set(id, current);
    current.catch(e => console.warn('IDB note save failed:', e)).finally(() => {
        if (_noteWriteQueues.get(id) === current) _noteWriteQueues.delete(id);
    });
    return current;
}

export async function dbLoadNotes() {
    await initEncryption();
    try {
        const db = await openChatDB();
        const rows = await db.getAll(IDB_NOTES_STORE);
        const notes = await Promise.all(rows.map(async row => {
            try {
                const payload = await decryptObject(row.data);
                return { id: row.id, ...payload };
            } catch (e) {
                console.warn(`⚠️ Could not decrypt note ${row.id}:`, e);
                return null;
            }
        }));
        return notes.filter(Boolean).sort((a, b) => a.timestamp - b.timestamp);
    } catch (e) {
        console.warn('IDB notes load failed:', e);
        return [];
    }
}

export async function dbDeleteNote(id) {
    try {
        const db = await openChatDB();
        await db.delete(IDB_NOTES_STORE, id);
    } catch (e) {
        console.warn('IDB note delete failed:', e);
    }
}

export async function dbClearNotes() {
    try {
        const db = await openChatDB();
        await db.clear(IDB_NOTES_STORE);
    } catch (e) {
        console.warn('IDB notes clear failed:', e);
    }
}
