/**
 * crypto-utils.js — AES-256-GCM encryption via the Web Crypto API.
 *
 * The master key is generated once per browser/origin and stored as a
 * non-extractable CryptoKey in a dedicated IndexedDB store.
 *
 * Threat model: protects IDB data files on disk from raw file-system
 * inspection (e.g. shared computer, forensic imaging). Does NOT protect
 * against same-origin JavaScript running on the same page.
 */

const KEY_STORAGE_KEY = 'james-enc-key-v1';
const KEY_DB_NAME = 'james-crypto-db';
const KEY_STORE_NAME = 'keys';
const KEY_ID = 'master';
let _cryptoKey = null; // In-memory cache — only loaded once per page lifetime
let _cryptoKeyPromise = null; // Prevent concurrent callers from generating different keys

/**
 * Load or generate the AES-256-GCM master key.
 * Idempotent — safe to call many times; concurrent callers share one operation.
 * @returns {Promise<CryptoKey>}
 */
export async function initEncryption() {
    if (_cryptoKey) return _cryptoKey;
    if (_cryptoKeyPromise) return _cryptoKeyPromise;

    const initialize = async () => {
        const db = await _openKeyDB();
        const storedKey = await _readStoredKey(db);
        if (storedKey) {
            _cryptoKey = storedKey;
            db.close();
            return _cryptoKey;
        }

        let stored;
        try {
            stored = localStorage.getItem(KEY_STORAGE_KEY);
        } catch (e) {
            console.warn('⚠️ Could not read the encryption key from localStorage:', e);
        }

        if (stored !== null && stored !== undefined) {
            const jwk = JSON.parse(atob(stored));
            _cryptoKey = await crypto.subtle.importKey(
                'jwk',
                jwk,
                { name: 'AES-GCM', length: 256 },
                false,
                ['encrypt', 'decrypt']
            );
            await _writeStoredKey(db, _cryptoKey);
            db.close();
            try {
                localStorage.removeItem(KEY_STORAGE_KEY);
            } catch (e) {
                console.warn('⚠️ Could not remove the legacy encryption key:', e);
            }
            return _cryptoKey;
        }

        const key = await crypto.subtle.generateKey(
            { name: 'AES-GCM', length: 256 },
            false,
            ['encrypt', 'decrypt']
        );
        _cryptoKey = key;
        await _writeStoredKey(db, key);
        db.close();
        console.log('🔐 New AES-256-GCM encryption key generated.');

        return key;
    };
    _cryptoKeyPromise = typeof navigator !== 'undefined' && navigator.locks
        ? navigator.locks.request('james-encryption-key', initialize)
        : initialize();

    try {
        return await _cryptoKeyPromise;
    } catch (e) {
        _cryptoKey = null;
        throw new Error('Unable to initialize the encryption key. Existing encrypted data was not replaced.', { cause: e });
    } finally {
        _cryptoKeyPromise = null;
    }
}

/**
 * Encrypt a UTF-8 plaintext string.
 * Uses a random 96-bit IV for every call (standard for AES-GCM).
 * @param {string} plaintext
 * @returns {Promise<{iv: string, ct: string}>} Both values are Base64.
 */
export async function encrypt(plaintext) {
    if (typeof plaintext !== 'string') {
        throw new TypeError('encrypt() requires a string plaintext');
    }
    const key = await initEncryption();
    const iv  = crypto.getRandomValues(new Uint8Array(12)); // 96-bit IV
    const encoded  = new TextEncoder().encode(plaintext);

    const ciphertext = await crypto.subtle.encrypt(
        { name: 'AES-GCM', iv },
        key,
        encoded
    );

    return {
        iv: _u8ToB64(iv),
        ct: _u8ToB64(new Uint8Array(ciphertext))
    };
}

/**
 * Decrypt an envelope produced by {@link encrypt}.
 * @param {{iv: string, ct: string}} envelope
 * @returns {Promise<string>} plaintext
 */
export async function decrypt(envelope) {
    if (!envelope || typeof envelope.iv !== 'string' || typeof envelope.ct !== 'string') {
        throw new TypeError('decrypt() requires an envelope with Base64 iv and ct strings');
    }
    const key = await initEncryption();
    const iv  = _b64ToU8(envelope.iv);
    const ct  = _b64ToU8(envelope.ct);
    if (iv.length !== 12) throw new TypeError('Invalid AES-GCM IV');
    if (ct.length < 16) throw new TypeError('Invalid AES-GCM ciphertext');

    const plaintext = await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv },
        key,
        ct
    );
    return new TextDecoder().decode(plaintext);
}

/** Encrypt any JSON-serialisable value. */
export async function encryptObject(obj) {
    const text = JSON.stringify(obj);
    if (text === undefined) throw new TypeError('encryptObject() requires a JSON-serialisable value');
    return encrypt(text);
}

/** Decrypt an envelope back to a parsed JS value. */
export async function decryptObject(envelope) {
    const text = await decrypt(envelope);
    return JSON.parse(text);
}

// ── Internal helpers ───────────────────────────────────────────────────────────

function _u8ToB64(u8) {
    // Chunked on purpose: spreading a large Uint8Array into String.fromCharCode
    // exceeds the engine's argument limit (~64-125k) and throws RangeError,
    // which silently broke persistence for any chat over ~64 KB.
    const CHUNK = 0x8000;
    let str = '';
    for (let i = 0; i < u8.length; i += CHUNK) {
        str += String.fromCharCode.apply(null, u8.subarray(i, i + CHUNK));
    }
    return btoa(str);
}

function _b64ToU8(b64) {
    return Uint8Array.from(atob(b64), c => c.charCodeAt(0));
}

function _openKeyDB() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(KEY_DB_NAME, 1);
        request.onupgradeneeded = () => {
            if (!request.result.objectStoreNames.contains(KEY_STORE_NAME)) {
                request.result.createObjectStore(KEY_STORE_NAME);
            }
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

function _readStoredKey(db) {
    return new Promise((resolve, reject) => {
        const request = db.transaction(KEY_STORE_NAME, 'readonly')
            .objectStore(KEY_STORE_NAME)
            .get(KEY_ID);
        request.onsuccess = () => resolve(request.result || null);
        request.onerror = () => reject(request.error);
    });
}

function _writeStoredKey(db, key) {
    return new Promise((resolve, reject) => {
        const transaction = db.transaction(KEY_STORE_NAME, 'readwrite');
        transaction.objectStore(KEY_STORE_NAME).put(key, KEY_ID);
        transaction.oncomplete = resolve;
        transaction.onerror = () => reject(transaction.error);
        transaction.onabort = () => reject(transaction.error || new Error('Encryption key transaction aborted'));
    });
}
