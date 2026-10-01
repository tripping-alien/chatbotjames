import { ChessGame, CheckersGame, parseUserMove } from './game-logic.js?v=6';
import { renderGameBoard } from './game-ui.js?v=5';
import {
    playGameMoveSound,
    playGameWinSound,
    playGameLoseSound,
    playGameBuffSound
} from './audio-wakelock.js';

class GameController {
    constructor() {
        this.activeGame = null;
        this.activeGameUI = null;
        this.onGameStateChange = null; // Callback for when game state changes (e.g. to persist chat)
    }

    getGameState() {
        if (!this.activeGame) return null;
        return {
            type: this.activeGame.type,
            fen: this.activeGame.getFen(),
            history: this.activeGame.getHistory ? this.activeGame.getHistory() : null,
            aiColor: this.activeGame.aiColor
        };
    }

    restoreGameState(state) {
        if (!state || !state.type) {
            this.activeGame = null;
            this.refreshGameBoardUI();
            return;
        }
        
        if (state.type === 'checkers') {
            this.activeGame = new CheckersGame();
        } else {
            this.activeGame = new ChessGame();
        }
        
        if (state.fen) {
            this.activeGame.loadFen(state.fen);
        }
        if (state.history && this.activeGame.setHistory) {
            this.activeGame.setHistory(state.history);
        }
        if (state.aiColor) {
            this.activeGame.aiColor = state.aiColor;
        } else {
            this.activeGame.aiColor = 'b';
        }

        this.refreshGameBoardUI();
    }

    closeActiveGame(addSystemMessageCallback) {
        this.activeGame = null;
        this.activeGameUI = null;
        if (addSystemMessageCallback) {
            addSystemMessageCallback('[Game Closed]');
        }
        if (window.renderChatLog) {
            window.renderChatLog();
        } else {
            this.refreshGameBoardUI();
        }
    }

    refreshGameBoardUI() {
        const boardWrapper = document.getElementById('liveGameView');
        if (!boardWrapper) return;

        if (this.activeGame) {
            boardWrapper.innerHTML = '';
            boardWrapper.style.display = 'flex';
            boardWrapper.style.justifyContent = 'center';
            this.activeGameUI = renderGameBoard(this.activeGame, boardWrapper, (moveResult) => {
                // When user clicks to make a move, populate the input and send it
                if (moveResult && moveResult.notation && window.uiManager && window.uiManager.cmdInput && window.sendMessage) {
                    window.uiManager.cmdInput.value = moveResult.notation;
                    window.sendMessage(moveResult);
                }
            });
        } else {
            boardWrapper.style.display = 'none';
            boardWrapper.innerHTML = '';
            this.activeGameUI = null;
        }
    }

    handleGameMove(moveInfo, addSystemMessageCallback, setIdleStateCallback, queryModelCallback, skipUIUpdate = false) {
        if (!this.activeGame) return;

        let notation = moveInfo.notation || moveInfo.san;
        const actualMove = moveInfo.move || moveInfo;
        
        if (this.activeGameUI && !skipUIUpdate) {
            this.activeGameUI.update(notation);
        }

        if (!this.activeGame.moveHistory) this.activeGame.moveHistory = [];
        if (notation) this.activeGame.moveHistory.push(notation);

        const isPromotion = actualMove.promotion || (actualMove.flags && actualMove.flags.includes('p'));
        const isJump = actualMove.jumped || actualMove.multiJump;

        if (isPromotion || isJump) {
            playGameBuffSound();
        } else {
            playGameMoveSound();
        }

        let isGameOver = false;
        let result = null;
        let isWin = false;

        if (this.activeGame.type === 'chess' && this.activeGame.game.isGameOver()) {
            isGameOver = true;
            if (this.activeGame.game.isCheckmate()) {
                result = this.activeGame.getTurn() === 'w' ? '0-1' : '1-0';
                isWin = result === '1-0';
            } else {
                result = '1/2-1/2';
                isWin = false; // draw
            }
        } else if (this.activeGame.type === 'checkers' && this.activeGame.isGameOver()) {
            isGameOver = true;
            result = this.activeGame.getWinner() === 'w' ? '1-0' : '0-1';
            isWin = result === '1-0';
        }

        if (isGameOver) {
            if (isWin) playGameWinSound();
            else playGameLoseSound();
            
            if (addSystemMessageCallback) addSystemMessageCallback(`[Game Over] ${result || 'Draw'}`);
            if (setIdleStateCallback) setIdleStateCallback(false);
            if (queryModelCallback) queryModelCallback();
        }
    }

    handleStartGame(params, addSystemMessageCallback, queryModelCallback) {
        const gameType = (params.game || 'chess').toLowerCase();
        const aiColor = (params.ai_color || 'black').toLowerCase() === 'white' ? 'w' : 'b';
        
        if (gameType === 'checkers') {
            this.activeGame = new CheckersGame();
        } else {
            this.activeGame = new ChessGame();
        }
        this.activeGame.aiColor = aiColor;
        
        playGameBuffSound();

        const boardName = gameType === 'checkers' ? 'Checkers Board' : 'FEN';
        if (addSystemMessageCallback) {
            if (aiColor === 'w') {
                addSystemMessageCallback(`[System]: ${gameType} started. Current ${boardName}: ${this.activeGame.getFen()}. You are White. User is Black. Please make the first move using the make_move tool.`);
            } else {
                addSystemMessageCallback(`[System]: ${gameType} started. Current ${boardName}: ${this.activeGame.getFen()}. You are Black. User is White. It is White's turn. Wait for the user to make their move.`);
            }
        }
        
        if (window.renderChatLog) {
            window.renderChatLog();
        } else {
            this.refreshGameBoardUI();
        }
        if (queryModelCallback) queryModelCallback();
    }

    handleMakeMove(params, addSystemMessageCallback, setIdleStateCallback, queryModelCallback) {
        if (!this.activeGame) {
            const err = `[System]: Failed to make move. No active game. Please start a game first using start_game.`;
            if (addSystemMessageCallback) addSystemMessageCallback(err);
            if (queryModelCallback) queryModelCallback();
            return { success: false, error: err };
        }

        if (this.activeGame.getTurn() !== this.activeGame.aiColor) {
            const currentTurn = this.activeGame.getTurn() === 'w' ? 'White' : 'Black';
            const aiC = this.activeGame.aiColor === 'w' ? 'White' : 'Black';
            const err = `[System]: Failed to make move. You are playing ${aiC}, but it is currently ${currentTurn}'s turn. Please wait for the user to make their move.`;
            if (addSystemMessageCallback) addSystemMessageCallback(err);
            if (queryModelCallback) queryModelCallback();
            return { success: false, error: err };
        }

        try {
            const moveInfo = this.activeGame.move(params.move);
            if (!moveInfo) {
                const err = `[System]: Failed to make move ${params.move}. Invalid move.`;
                if (addSystemMessageCallback) addSystemMessageCallback(err);
                if (queryModelCallback) queryModelCallback();
                return { success: false, error: err };
            }
            this.handleGameMove(moveInfo, addSystemMessageCallback, setIdleStateCallback, queryModelCallback);
            if (this.onGameStateChange) this.onGameStateChange();
            return { success: true };
        } catch (e) {
            const err = `[System]: Failed to make move ${params.move}. Error: ${e.message}`;
            if (addSystemMessageCallback) addSystemMessageCallback(err);
            if (queryModelCallback) queryModelCallback();
            return { success: false, error: err };
        }
    }

    parseUserMove(text) {
        if (!this.activeGame) return null;
        return parseUserMove(text, this.activeGame);
    }
}

export const gameController = new GameController();
