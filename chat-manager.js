import { dbSaveChat, dbDeleteChat, dbLoadAllChats, dbLoadNotes } from './chat-db.js';
import { CONFIG } from './config.js';

class ChatManager {
    constructor() {
        this.chatHistory = [];
        this.allChats = [];
        this.chatMap = new Map();
        this.currentChatId = null;
        this.userNotes = [];

        // Callbacks for UI updates
        this.onChatChanged = null; // Called when chat context changes
        this.onChatListUpdated = null; // Called when list of chats changes
        this.onNotesLoaded = null;
    }

    async loadSavedChats(migrateFromLocalStorage, initEncryption) {
        if (initEncryption) await initEncryption();
        if (migrateFromLocalStorage) await migrateFromLocalStorage();
        
        this.allChats = await dbLoadAllChats();
        this.chatMap = new Map(this.allChats.map(c => [c.id, c]));
        if (this.allChats.length > 0 && this.onChatListUpdated) {
            this.onChatListUpdated();
        }

        this.userNotes = await dbLoadNotes();
        if (this.onNotesLoaded) {
            this.onNotesLoaded(this.userNotes);
        }
    }

    persistCurrentChat(getGameStateCallback) {
        if (!this.currentChatId) return;
        const chat = this.chatMap.get(this.currentChatId);
        if (chat) {
            chat.messages = [...this.chatHistory];
            if (getGameStateCallback) {
                chat.gameState = getGameStateCallback();
            } else {
                chat.gameState = null;
            }
            dbSaveChat(chat);
        }
    }

    loadChatHistory(chatId, getGameStateCallback, restoreGameStateCallback, safeLocalStorage) {
        const chat = this.chatMap.get(chatId);
        if (!chat) return;

        this.persistCurrentChat(getGameStateCallback);
        this.currentChatId = chatId;
        if (safeLocalStorage) safeLocalStorage.setItem('james-last-chat-id', this.currentChatId);
        this.chatHistory = [...chat.messages];
        
        if (restoreGameStateCallback) {
            restoreGameStateCallback(chat.gameState);
        }

        if (this.onChatChanged) {
            this.onChatChanged(this.currentChatId);
        }
    }

    startNewChat(getWelcomeMessageCallback, safeLocalStorage, getGameStateCallback, restoreGameStateCallback) {
        if (getGameStateCallback) {
            this.persistCurrentChat(getGameStateCallback);
        }
        
        const welcome = getWelcomeMessageCallback ? getWelcomeMessageCallback() : { role: 'system', content: 'Hello!' };
        this.chatHistory = [welcome];

        const newChat = {
            id: parseInt(crypto.randomUUID().replace(/-/g, '').slice(0, 13), 16),
            name: 'New Chat',
            messages: [...this.chatHistory],
            gameState: null
        };
        this.currentChatId = newChat.id;
        if (safeLocalStorage) safeLocalStorage.setItem('james-last-chat-id', this.currentChatId);
        this.allChats.unshift(newChat);
        this.chatMap.set(newChat.id, newChat);
        dbSaveChat(newChat);

        if (restoreGameStateCallback) {
            restoreGameStateCallback(null);
        }

        if (this.onChatListUpdated) this.onChatListUpdated();
        if (this.onChatChanged) this.onChatChanged(this.currentChatId);
    }

    deleteChat(chatId, safeLocalStorage, getGameStateCallback, restoreGameStateCallback, getWelcomeMessageCallback) {
        this.allChats = this.allChats.filter(c => c.id !== chatId);
        this.chatMap.delete(chatId);
        dbDeleteChat(chatId);

        if (chatId === this.currentChatId) {
            if (this.allChats.length > 0) {
                this.loadChatHistory(this.allChats[0].id, getGameStateCallback, restoreGameStateCallback, safeLocalStorage);
            } else {
                this.startNewChat(getWelcomeMessageCallback, safeLocalStorage, getGameStateCallback, restoreGameStateCallback);
            }
        } else {
            if (this.onChatListUpdated) this.onChatListUpdated();
        }
    }

    updateChatName(chatId, titleSource) {
        const chat = this.chatMap.get(chatId);
        if (chat && chat.name === 'New Chat') {
            chat.name = titleSource.substring(0, 30) + (titleSource.length > 30 ? '...' : '');
            dbSaveChat(chat);
            if (this.onChatListUpdated) this.onChatListUpdated();
        }
    }
}

export const chatManager = new ChatManager();
