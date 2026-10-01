/**
 * renderGameBoard
 * Renders an interactive 8×8 board for either a ChessGame or CheckersGame.
 *
 * Features:
 *  - Chess: highlights selected square + all legal destination squares (via chess.js).
 *  - Checkers: highlights selected square + all legal destinations (respects forced-
 *    capture and multi-jump rules). The piece locked into a multi-jump sequence
 *    is visually indicated.
 *  - Better checkers piece symbols: regular piece = ⬤, king = ♛.
 *  - game-over banner shown inside the board container.
 */
export function renderGameBoard(game, container, onMove) {
    // ── Wrapper: board + notation panel ────────────────────────────────────────
    const wrapper = document.createElement('div');
    wrapper.style.cssText = 'display: flex; flex-direction: column; gap: 8px; align-items: center;';

    // ── Header with Close Button ──────────────────────────────────────────────
    const gameHeader = document.createElement('div');
    gameHeader.style.cssText = `
        display: flex;
        justify-content: space-between;
        align-items: center;
        background: rgba(0,0,0,0.25);
        border-radius: 4px;
        padding: 6px 12px;
        margin-bottom: 4px;
        color: #eee;
        font-family: sans-serif;
        font-size: 13px;
        width: 472px;
        box-sizing: border-box;
    `;
    
    const titleContainer = document.createElement('div');
    titleContainer.style.cssText = 'display: flex; align-items: center; gap: 12px;';
    
    const titleText = document.createElement('div');
    titleText.textContent = game.type === 'chess' ? '♟️ Chess' : '🔴 Checkers';
    titleText.style.fontWeight = 'bold';
    
    const turnLabel = document.createElement('div');
    turnLabel.style.cssText = `
        font-size: 11px;
        padding: 3px 8px;
        border-radius: 12px;
        font-weight: bold;
        text-transform: uppercase;
        letter-spacing: 0.05em;
    `;
    
    const closeBtn = document.createElement('button');
    closeBtn.textContent = 'Close Game';
    closeBtn.style.cssText = `
        background: rgba(239, 68, 68, 0.2);
        color: #fca5a5;
        border: 1px solid rgba(239, 68, 68, 0.4);
        border-radius: 4px;
        padding: 4px 8px;
        font-size: 11px;
        cursor: pointer;
        transition: background 0.2s;
    `;
    closeBtn.onmouseover = () => closeBtn.style.background = 'rgba(239, 68, 68, 0.4)';
    closeBtn.onmouseout = () => closeBtn.style.background = 'rgba(239, 68, 68, 0.2)';
    closeBtn.onclick = () => {
        if (window.closeActiveGame) window.closeActiveGame();
    };
    
    titleContainer.appendChild(titleText);
    titleContainer.appendChild(turnLabel);
    gameHeader.appendChild(titleContainer);
    gameHeader.appendChild(closeBtn);
    wrapper.appendChild(gameHeader);

    // ── Board with coordinate labels ──────────────────────────────────────────
    // Layout: [ rank-labels (20px) ] [ 8×8 board (352px) ]
    //                                [ file-labels row   ]
    const boardWithLabels = document.createElement('div');
    boardWithLabels.style.cssText = `
        display: grid;
        grid-template-columns: 24px 448px;
        grid-template-rows: 448px 24px;
        user-select: none;
    `;

    // Left rank-label column
    const rankLabels = document.createElement('div');
    rankLabels.style.cssText = `
        display: flex;
        flex-direction: column;
        justify-content: space-around;
        align-items: center;
        height: 448px;
        font-family: 'Courier New', monospace;
        font-size: 11px;
        color: #aaa;
        padding: 0;
    `;

    // Bottom file-label row (corner spacer + 8 labels)
    const fileLabelsRow = document.createElement('div');
    fileLabelsRow.style.cssText = `
        grid-column: 1 / 3;
        display: grid;
        grid-template-columns: 24px repeat(8, 56px);
        height: 24px;
    `;
    // corner spacer
    fileLabelsRow.appendChild(document.createElement('div'));

    const boardContainer = document.createElement('div');
    boardContainer.className = 'game-board-container';
    boardContainer.style.cssText = `
        display: grid;
        grid-template-columns: repeat(8, 56px);
        grid-template-rows: repeat(8, 56px);
        width: 448px;
        height: 448px;
        border: 2px solid #555;
        border-radius: 4px;
        margin: 0;
        position: relative;
        box-shadow: 0 4px 16px rgba(0,0,0,0.4);
    `;

    const LABEL_STYLE = `
        display: flex;
        align-items: center;
        justify-content: center;
        font-family: 'Courier New', monospace;
        font-size: 11px;
        color: #aaa;
        width: 56px;
        height: 24px;
    `;

    // Populate rank labels (left side) and file labels (bottom row)
    for (let r = 0; r < 8; r++) {
        const lbl = document.createElement('div');
        lbl.style.cssText = 'line-height: 56px; font-family: "Courier New",monospace; font-size:11px; color:#aaa; text-align:center; width:24px; height:56px;';
        lbl.textContent = game.type === 'chess' ? String(8 - r) : String(r);
        rankLabels.appendChild(lbl);
    }
    for (let c = 0; c < 8; c++) {
        const lbl = document.createElement('div');
        lbl.style.cssText = LABEL_STYLE;
        lbl.textContent = game.type === 'chess'
            ? String.fromCharCode('a'.charCodeAt(0) + c)
            : String(c);
        fileLabelsRow.appendChild(lbl);
    }

    boardWithLabels.appendChild(rankLabels);
    boardWithLabels.appendChild(boardContainer);
    boardWithLabels.appendChild(fileLabelsRow);

    // ── Notation panel ──────────────────────────────────────────────────────────
    const notationPanel = document.createElement('div');
    notationPanel.style.cssText = `
        width: 472px;
        max-height: 100px;
        overflow-y: auto;
        background: rgba(0,0,0,0.25);
        border-radius: 4px;
        padding: 6px 8px;
        font-family: 'Courier New', monospace;
        font-size: 12px;
        color: #ddd;
        line-height: 1.6;
        box-sizing: border-box;
    `;
    notationPanel.textContent = 'No moves yet.';

    wrapper.appendChild(boardWithLabels);
    wrapper.appendChild(notationPanel);

    // Move history: array of strings
    function renderNotation() {
        const history = game.moveHistory || [];
        if (history.length === 0) {
            notationPanel.textContent = 'No moves yet.';
            return;
        }
        let txt = '';
        for (let i = 0; i < history.length; i++) {
            if (i % 2 === 0) {
                txt += `${(i / 2) + 1}. ${history[i]}`;
            } else {
                txt += `  ${history[i]}   `;
            }
        }
        notationPanel.textContent = txt.trim();
        notationPanel.scrollTop = notationPanel.scrollHeight;
    }

    let selectedSquare = null; // chess: algebraic string; checkers: {r,c}
    let multiJumpChain = null;  // checkers: accumulates "(r,c)→(r,c)→..." during a multi-jump

    function scrollChat() {
        const chatLog = document.getElementById('chatLog');
        if (chatLog) chatLog.scrollTop = chatLog.scrollHeight;
    }

    // ── Chess piece symbols ─────────────────────────────────────────────────────
    const CHESS_SYMBOLS = {
        w: { p: '♙', n: '♘', b: '♗', r: '♖', q: '♕', k: '♔' },
        b: { p: '♟', n: '♞', b: '♝', r: '♜', q: '♛', k: '♚' },
    };

    const CHECKERS_SYMBOL = { regular: '⬤', king: '♛' };

    function render() {
        if (!game.isGameOver || !game.isGameOver()) {
            const currentTurn = game.type === 'chess' ? game.getTurn() : game.turn;
            const aiColor = game.aiColor || 'b';
            const isUserTurn = currentTurn !== aiColor;
            turnLabel.textContent = isUserTurn ? 'Your Turn' : "AI's Turn";
            turnLabel.style.color = isUserTurn ? '#34d399' : '#f87171'; // Green for user, Red for AI
            turnLabel.style.background = isUserTurn ? 'rgba(52, 211, 153, 0.15)' : 'rgba(248, 113, 113, 0.15)';
        } else {
            turnLabel.textContent = 'Game Over';
            turnLabel.style.color = '#9ca3af';
            turnLabel.style.background = 'rgba(156, 163, 175, 0.15)';
        }

        boardContainer.innerHTML = '';

        // Compute valid destinations for the selected square (for highlighting)
        let validDests = new Set(); // "r,c" strings for checkers; algebraic for chess

        if (selectedSquare !== null) {
            if (game.type === 'chess') {
                const moves = game.getValidMoves(selectedSquare);
                moves.forEach(m => validDests.add(m.to));
            } else {
                // Checkers
                const sr = selectedSquare.r, sc = selectedSquare.c;
                game.getValidMovesFrom(sr, sc).forEach(d => validDests.add(`${d.r},${d.c}`));
            }
        }

        // Determine the square locked into a multi-jump (checkers only)
        const mustKey = (game.type === 'checkers' && game.mustJumpFrom)
            ? `${game.mustJumpFrom.r},${game.mustJumpFrom.c}` : null;

        const boardState = game.type === 'chess' ? game.getBoard() : game.board;

        for (let r = 0; r < 8; r++) {
            for (let c = 0; c < 8; c++) {
                const square = document.createElement('div');
                const isLight = (r + c) % 2 === 0;

                // Base board colour
                square.style.cssText = `
                    background-color: ${isLight ? '#f0d9b5' : '#b58863'};
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    font-size: 32px;
                    cursor: pointer;
                    position: relative;
                    transition: background-color 0.12s;
                `;

                const algebraic = String.fromCharCode('a'.charCodeAt(0) + c) + (8 - r);
                const ckKey     = `${r},${c}`;

                square.dataset.r   = r;
                square.dataset.c   = c;
                square.dataset.alg = algebraic;

                // ── Highlight logic ───────────────────────────────────────────
                const isSelected = game.type === 'chess'
                    ? selectedSquare === algebraic
                    : selectedSquare && selectedSquare.r === r && selectedSquare.c === c;

                const isDest = game.type === 'chess'
                    ? validDests.has(algebraic)
                    : validDests.has(ckKey);

                const isMustJump = mustKey === ckKey;

                if (isSelected) {
                    square.style.backgroundColor = '#f6f669';
                } else if (isMustJump && !selectedSquare) {
                    // Pulse the piece that's locked in a multi-jump
                    square.style.backgroundColor = '#ffe066';
                    square.style.boxShadow = 'inset 0 0 0 2px #e6a800';
                }

                // ── Valid-move dot / capture highlight ────────────────────────
                if (isDest) {
                    const dot = document.createElement('div');
                    const hasPiece = game.type === 'chess'
                        ? boardState[r][c] !== null
                        : boardState[r][c] !== 0;

                    if (hasPiece) {
                        // Capture ring
                        dot.style.cssText = `
                            position: absolute; inset: 0;
                            border-radius: 0;
                            box-shadow: inset 0 0 0 3px rgba(0,0,0,0.35);
                            pointer-events: none;
                        `;
                    } else {
                        // Move dot
                        dot.style.cssText = `
                            position: absolute;
                            width: 28%;
                            height: 28%;
                            border-radius: 50%;
                            background: rgba(0,0,0,0.25);
                            pointer-events: none;
                        `;
                    }
                    square.appendChild(dot);
                }

                // ── Piece rendering ───────────────────────────────────────────
                const pieceEl = document.createElement('span');
                pieceEl.style.cssText = 'position: relative; z-index: 1; line-height: 1;';

                if (game.type === 'chess') {
                    const p = boardState[r][c];
                    if (p) {
                        pieceEl.textContent = CHESS_SYMBOLS[p.color][p.type];
                        pieceEl.style.color      = p.color === 'w' ? '#fff' : '#000';
                        pieceEl.style.textShadow = p.color === 'w'
                            ? '0 0 2px #000, 0 0 2px #000'
                            : '0 0 2px #fff';
                    }
                } else {
                    const p = boardState[r][c];
                    if (p !== 0) {
                        const isKing = Math.abs(p) === 2;
                        pieceEl.textContent = isKing ? CHECKERS_SYMBOL.king : CHECKERS_SYMBOL.regular;
                        pieceEl.style.fontSize   = isKing ? '28px' : '34px';
                        pieceEl.style.color      = p > 0 ? '#f0f0f0' : '#1a1a1a';
                        pieceEl.style.textShadow = p > 0
                            ? '0 0 2px #000, 0 0 2px #000'
                            : '0 0 2px #fff, 0 0 2px #fff';
                    }
                }
                square.appendChild(pieceEl);

                // ── Click handler ─────────────────────────────────────────────
                square.onclick = () => {
                    // Ignore clicks if the AI is currently thinking/generating
                    if (window.globalState && window.globalState.isGeneratingUI) return;

                    if (selectedSquare !== null) {
                        let moveResult = null;

                        if (game.type === 'chess') {
                            moveResult = game.move(selectedSquare, algebraic);
                        } else {
                            moveResult = game.move(selectedSquare.r, selectedSquare.c, r, c);
                        }

                        if (moveResult) {
                            // Successful move — record notation
                            let notationStr = null;
                            if (game.type === 'chess') {
                                notationStr = moveResult.san || `${moveResult.from}-${moveResult.to}`;
                            } else {
                                // Build / extend the multi-jump chain using standard notation (1-32)
                                const s = game.rcToSq(selectedSquare.r, selectedSquare.c);
                                const t = game.rcToSq(r, c);
                                const sep = moveResult.jumped ? 'x' : '-';
                                
                                if (multiJumpChain === null) {
                                    multiJumpChain = `${s}${sep}${t}`;
                                } else {
                                    multiJumpChain += `${sep}${t}`;
                                }
                                notationStr = multiJumpChain;
                            }

                            if (game.type === 'checkers' && moveResult.multiJump) {
                                // Mid-sequence: update selection, do NOT flush notation yet
                                selectedSquare = { r, c };
                            } else {
                                // Turn complete — flush notation and reset chain
                                selectedSquare = null;
                                multiJumpChain = null;
                            }
                            render();
                            scrollChat();
                            if (!moveResult.multiJump) {
                                onMove({ ...moveResult, notation: notationStr });
                            }
                        } else {
                            // Invalid move → try to select the clicked square instead
                            if (game.type === 'chess') {
                                selectedSquare = boardState[r][c] ? algebraic : null;
                            } else {
                                selectedSquare = boardState[r][c] !== 0 ? { r, c } : null;
                            }
                            render();
                            scrollChat();
                        }
                    } else {
                        // Nothing selected — select clicked square (only own pieces)
                        let isOwnPiece = false;
                        const aiColor = game.aiColor || 'b';
                        const currentTurn = game.type === 'chess' ? game.getTurn() : game.turn;
                        const isUserTurn = currentTurn !== aiColor;

                        if (isUserTurn) {
                            if (game.type === 'chess') {
                                const p = boardState[r][c];
                                isOwnPiece = p && p.color === currentTurn;
                            } else {
                                const p = boardState[r][c];
                                isOwnPiece = p !== 0 && ((currentTurn === 'w' && p > 0) || (currentTurn === 'b' && p < 0));
                            }
                        }

                        if (isOwnPiece) {
                            if (game.type === 'chess') {
                                selectedSquare = algebraic;
                            } else {
                                // Don't allow selecting a different piece during multi-jump
                                if (!game.mustJumpFrom || (game.mustJumpFrom.r === r && game.mustJumpFrom.c === c)) {
                                    selectedSquare = { r, c };
                                }
                            }
                            render();
                        }
                    }
                };

                boardContainer.appendChild(square);
            }
        }

        // ── Game-over overlay (checkers only; chess handled by chess.js) ───────
        if (game.type === 'checkers' && game.isGameOver()) {
            const winner = game.getWinner();
            const overlay = document.createElement('div');
            overlay.style.cssText = `
                position: absolute; inset: 0;
                background: rgba(0,0,0,0.65);
                display: flex; align-items: center; justify-content: center;
                z-index: 10; border-radius: 2px;
            `;
            const banner = document.createElement('div');
            banner.style.cssText = `
                color: #fff;
                font-size: 1.3em;
                font-weight: bold;
                text-align: center;
                padding: 12px 20px;
                background: rgba(0,0,0,0.5);
                border-radius: 8px;
                border: 1px solid rgba(255,255,255,0.2);
            `;
            banner.textContent = winner === 'w' ? '⬤ White wins! 🎉' : '⬤ Black wins! 🎉';
            overlay.appendChild(banner);
            boardContainer.appendChild(overlay);
        }
    }

    renderNotation();
    render();

    // Mount to the provided container
    container.innerHTML = '';
    container.appendChild(wrapper);
    scrollChat();

    return {
        update: (notation) => {
            // Called by app.js when AI makes a move
            renderNotation();
            render();
            scrollChat();
        }
    };
}
