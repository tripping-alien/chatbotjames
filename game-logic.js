import { Chess } from 'https://esm.sh/chess.js@1.3.0';

export class ChessGame {
    constructor(fen, moveHistory = []) {
        this.game = new Chess(fen);
        this.type = 'chess';
        this.moveHistory = moveHistory;
    }

    getFen() {
        return this.game.fen();
    }

    loadFen(fen) {
        if (!fen) return;
        this.game = new Chess(fen);
    }

    getState() {
        return { fen: this.game.fen(), moveHistory: this.moveHistory };
    }

    getHistory() {
        return this.moveHistory;
    }

    setHistory(history) {
        this.moveHistory = history || [];
    }

    getTurn() {
        return this.game.turn(); // returns 'w' or 'b'
    }

    getBoard() {
        return this.game.board(); // 2D array
    }

    move(source, target, promotion = 'q') {
        if (typeof source === 'string' && target === undefined) {
            const parsed = this.makeSanMove(source);
            if (parsed && parsed.length > 0) {
                return parsed[0];
            }
            return null;
        }
        try {
            const result = this.game.move({
                from: source,
                to: target,
                promotion: promotion // always promote to queen for simplicity
            });
            return result;
        } catch (e) {
            return null;
        }
    }

    makeSanMove(san) {
        try {
            const move = this.game.move(san.trim());
            return move ? [move] : null;
        } catch (e) {
            // Fallback: search for strict SAN intent
            const intentRegex = /(?:i (?:will )?(?:play|move)|my move is|move:|playing|^)\s*([NQKBR]?[a-h]?[1-8]?x?[a-h][1-8](?:=[NQKBR])?[+#]?|O-O(?:-O)?)\b/i;
            const match = san.match(intentRegex);
            if (match && match[1]) {
                try {
                    const m = this.game.move(match[1]);
                    if (m) return [m];
                } catch(err) {}
            }
            return null;
        }
    }

    isGameOver() {
        return this.game.isGameOver();
    }

    getValidMoves(square) {
        return this.game.moves({ square, verbose: true });
    }
}

/**
 * Checkers (English draughts) implementation.
 *
 * Board encoding: 0 = empty, 1 = white, 2 = white king, -1 = black, -2 = black king.
 * White starts at the bottom (rows 5–7) and moves up (dr = -1).
 * Black starts at the top (rows 0–2) and moves down (dr = +1).
 *
 * Rules implemented:
 *  - Forced capture: if any jump is available you must jump.
 *  - Multi-jump: after a capture, if the same piece can jump again the turn
 *    continues (mustJumpFrom tracks which piece must keep jumping).
 *  - King promotion: white reaching row 0, black reaching row 7.
 *  - Game over: current player has no legal moves (wins go to the other side).
 */
export class CheckersGame {
    constructor(state) {
        this.type = 'checkers';
        if (state) {
            this.board = typeof state.board === 'string' ? JSON.parse(state.board) : state.board;
            this.turn = state.turn;
            this.mustJumpFrom = state.mustJumpFrom || null;
            this.moveHistory = state.moveHistory || [];
        } else {
            this.reset();
            this.moveHistory = [];
        }
    }

    reset() {
        this.board = Array(8).fill(null).map(() => Array(8).fill(0));
        for (let r = 0; r < 8; r++) {
            for (let c = 0; c < 8; c++) {
                if ((r + c) % 2 !== 0) {
                    if (r < 3)      this.board[r][c] = -1; // Black
                    else if (r > 4) this.board[r][c] =  1; // White
                }
            }
        }
        this.turn = 'w';
        this.mustJumpFrom = null;
    }

    getTurn() {
        return this.turn;
    }

    getState() {
        return { board: JSON.stringify(this.board), turn: this.turn, mustJumpFrom: this.mustJumpFrom, moveHistory: this.moveHistory };
    }

    getHistory() {
        return this.moveHistory;
    }

    setHistory(history) {
        this.moveHistory = history || [];
    }

    getFen() {
        let fen = '';
        for (let r = 0; r < 8; r++) {
            for (let c = 0; c < 8; c++) {
                const p = this.board[r][c];
                fen += p === 0 ? '.' : p === 1 ? 'w' : p === 2 ? 'W' : p === -1 ? 'b' : 'B';
            }
            fen += '/';
        }
        return fen.slice(0, -1) + ' ' + this.turn;
    }

    loadFen(fen) {
        if (!fen) return;
        const parts = fen.split(' ');
        const rows = parts[0].split('/');
        for (let r = 0; r < 8; r++) {
            for (let c = 0; c < 8; c++) {
                const p = rows[r][c];
                this.board[r][c] = p === '.' ? 0 : p === 'w' ? 1 : p === 'W' ? 2 : p === 'b' ? -1 : -2;
            }
        }
        this.turn = parts[1] || 'w';
        this.mustJumpFrom = null;
    }

    // ── Internal helpers ────────────────────────────────────────────────────────

    /** All jump destinations from square (sr, sc). Does NOT check turn. */
    _getJumpsFrom(sr, sc) {
        const piece = this.board[sr][sc];
        if (piece === 0) return [];
        const isWhite = piece > 0;
        const isKing  = Math.abs(piece) === 2;
        const fwd     = isWhite ? -1 : 1;
        const rowDirs = isKing ? [-1, 1] : [fwd];
        const jumps   = [];

        for (const dr of rowDirs) {
            for (const dc of [-1, 1]) {
                const mr = sr + dr,     mc = sc + dc;
                const tr = sr + dr * 2, tc = sc + dc * 2;
                if (tr < 0 || tr > 7 || tc < 0 || tc > 7) continue;
                if (this.board[tr][tc] !== 0) continue;
                const mid = this.board[mr][mc];
                if (mid === 0) continue;
                if (isWhite && mid > 0) continue; // can't jump own piece
                if (!isWhite && mid < 0) continue;
                jumps.push({ r: tr, c: tc });
            }
        }
        return jumps;
    }

    /** All squares with at least one jump available for the current player. */
    _getAllJumps() {
        const result = [];
        for (let r = 0; r < 8; r++) {
            for (let c = 0; c < 8; c++) {
                const p = this.board[r][c];
                if (p === 0) continue;
                if (this.turn === 'w' && p < 0) continue;
                if (this.turn === 'b' && p > 0) continue;
                const targets = this._getJumpsFrom(r, c);
                if (targets.length > 0) result.push({ r, c, targets });
            }
        }
        return result;
    }

    /** All simple (non-jump) moves for the current player. */
    _getAllSimpleMoves() {
        const result = [];
        for (let r = 0; r < 8; r++) {
            for (let c = 0; c < 8; c++) {
                const p = this.board[r][c];
                if (p === 0) continue;
                if (this.turn === 'w' && p < 0) continue;
                if (this.turn === 'b' && p > 0) continue;
                const isKing = Math.abs(p) === 2;
                const fwd    = p > 0 ? -1 : 1;
                for (const dr of (isKing ? [-1, 1] : [fwd])) {
                    for (const dc of [-1, 1]) {
                        const tr = r + dr, tc = c + dc;
                        if (tr < 0 || tr > 7 || tc < 0 || tc > 7) continue;
                        if (this.board[tr][tc] !== 0) continue;
                        result.push({ r, c, tr, tc });
                    }
                }
            }
        }
        return result;
    }

    // ── Public API ──────────────────────────────────────────────────────────────

    /**
     * Returns true if (sr,sc)→(tr,tc) is a legal move for the current player,
     * taking forced-capture and multi-jump rules into account.
     */
    isValidMove(sr, sc, tr, tc) {
        if (sr < 0 || sr > 7 || sc < 0 || sc > 7 || tr < 0 || tr > 7 || tc < 0 || tc > 7) return false;
        if (this.board[tr][tc] !== 0) return false;

        const piece = this.board[sr][sc];
        if (piece === 0) return false;
        const isWhite = piece > 0;
        if (isWhite && this.turn !== 'w') return false;
        if (!isWhite && this.turn !== 'b') return false;

        // Mid-multi-jump: only the piece that started the sequence may move.
        if (this.mustJumpFrom && (sr !== this.mustJumpFrom.r || sc !== this.mustJumpFrom.c)) return false;

        const dr = tr - sr;
        const dc = tc - sc;
        const isKing = Math.abs(piece) === 2;
        const fwd    = isWhite ? -1 : 1;

        const allJumps = this.mustJumpFrom
            ? [{ r: sr, c: sc, targets: this._getJumpsFrom(sr, sc) }].filter(j => j.targets.length)
            : this._getAllJumps();

        // Simple move — only allowed when no captures are available
        if (Math.abs(dr) === 1 && Math.abs(dc) === 1) {
            if (allJumps.length > 0) return false; // forced capture
            if (!isKing && dr !== fwd) return false;
            return true;
        }

        // Jump move
        if (Math.abs(dr) === 2 && Math.abs(dc) === 2) {
            if (!isKing && Math.sign(dr) !== fwd) return false;
            const mr  = sr + dr / 2;
            const mc  = sc + dc / 2;
            const mid = this.board[mr][mc];
            if (mid === 0) return false;
            if (isWhite && mid > 0) return false;
            if (!isWhite && mid < 0) return false;
            return true;
        }

        return false;
    }

    /**
     * Execute the move (sr,sc)→(tr,tc). Returns a result object on success, null on failure.
     * Handles captures, king promotion, multi-jump continuation, and turn switching.
     */
    move(sr, sc, tr, tc) {
        if (typeof sr === 'string' && sc === undefined) {
            const parsed = this.makeSanMove(sr);
            if (parsed && parsed.length > 0) {
                return parsed[0];
            }
            return null;
        }
        if (!this.isValidMove(sr, sc, tr, tc)) return null;

        const piece = this.board[sr][sc];
        this.board[sr][sc] = 0;
        this.board[tr][tc] = piece;

        const isWhite = piece > 0;
        const dr = tr - sr;
        let jumped = false;

        // Remove captured piece
        if (Math.abs(dr) === 2) {
            this.board[sr + dr / 2][sc + (tc - sc) / 2] = 0;
            jumped = true;
        }

        // King promotion (promote immediately, but can't continue jump as a king this turn)
        let promoted = false;
        if (isWhite && tr === 0 && piece === 1)  { this.board[tr][tc] = 2;  promoted = true; }
        if (!isWhite && tr === 7 && piece === -1) { this.board[tr][tc] = -2; promoted = true; }

        // Multi-jump check: can this same piece jump again?
        if (jumped && !promoted) {
            const furtherJumps = this._getJumpsFrom(tr, tc);
            if (furtherJumps.length > 0) {
                this.mustJumpFrom = { r: tr, c: tc };
                return { valid: true, jumped, multiJump: true };
            }
        }

        // End of turn
        this.mustJumpFrom = null;
        this.turn = this.turn === 'w' ? 'b' : 'w';
        return { valid: true, jumped, multiJump: false };
    }

    /**
     * Returns the list of legal destination squares from (sr,sc) for UI highlighting.
     * Respects forced-capture and multi-jump constraints.
     */
    getValidMovesFrom(sr, sc) {
        const piece = this.board[sr][sc];
        if (piece === 0) return [];
        const isWhite = piece > 0;
        if (isWhite && this.turn !== 'w') return [];
        if (!isWhite && this.turn !== 'b') return [];

        // During multi-jump only the locked piece may move
        if (this.mustJumpFrom && (sr !== this.mustJumpFrom.r || sc !== this.mustJumpFrom.c)) return [];

        const allJumps = this.mustJumpFrom
            ? [{ r: sr, c: sc, targets: this._getJumpsFrom(sr, sc) }].filter(j => j.targets.length)
            : this._getAllJumps();

        if (allJumps.length > 0) {
            const mine = allJumps.find(j => j.r === sr && j.c === sc);
            return mine ? mine.targets : [];
        }

        // Simple moves
        const isKing = Math.abs(piece) === 2;
        const fwd    = isWhite ? -1 : 1;
        const dests  = [];
        for (const dr of (isKing ? [-1, 1] : [fwd])) {
            for (const dc of [-1, 1]) {
                const tr = sr + dr, tc = sc + dc;
                if (tr < 0 || tr > 7 || tc < 0 || tc > 7) continue;
                if (this.board[tr][tc] !== 0) continue;
                dests.push({ r: tr, c: tc });
            }
        }
        return dests;
    }

    /** True when the current player has no legal moves (they lose). */
    isGameOver() {
        if (this._getAllJumps().length > 0) return false;
        return this._getAllSimpleMoves().length === 0;
    }

    /** Returns 'w' or 'b' (the winner), or null if the game is still ongoing. */
    getWinner() {
        if (!this.isGameOver()) return null;
        return this.turn === 'w' ? 'b' : 'w'; // the player who can't move loses
    }

    // ── Standard Notation Converters (1-32) ──────────────────────────────────
    rcToSq(r, c) {
        return r * 4 + Math.floor(c / 2) + 1;
    }

    sqToRc(sq) {
        const zeroIdx = sq - 1;
        const r = Math.floor(zeroIdx / 4);
        const remainder = zeroIdx % 4;
        const c = (r % 2 === 0) ? (remainder * 2 + 1) : (remainder * 2);
        return { r, c };
    }

    /**
     * Parse a move from standard checkers notation (e.g. "11-15" or "11x15x24").
     * Fallback to coordinates parsing if necessary.
     */
    makeSanMove(san) {
        // Try standard checkers notation first: numbers separated by -, x, or spaces
        const parts = san.split(/[-xX\s→>]+/).map(p => parseInt(p, 10)).filter(n => !isNaN(n) && n >= 1 && n <= 32);
        if (parts.length >= 2) {
            const applied = [];
            for (let i = 0; i < parts.length - 1; i++) {
                const { r: sr, c: sc } = this.sqToRc(parts[i]);
                const { r: tr, c: tc } = this.sqToRc(parts[i + 1]);
                const res = this.move(sr, sc, tr, tc);
                if (res) applied.push({ ...res, notation: san });
                else break;
            }
            if (applied.length > 0 && applied.length === parts.length - 1) {
                return applied; // Return only if the full chain was valid
            }
            // If partial chain matched or failed, it might be coordinate notation? Let's fallback just in case.
        }

        // Fallback: Coordinates parsing "5,2 to 4,3"
        const regex = /(\d+)\s*[,:]?\s*(\d+)\s*(?:to|->|-|→|\s+)\s*(\d+)\s*[,:]?\s*(\d+)/gi;
        const matches = [...san.matchAll(regex)];
        if (matches.length > 0) {
            const applied = [];
            for (const match of matches) {
                const sr = parseInt(match[1]), sc = parseInt(match[2]);
                const tr = parseInt(match[3]), tc = parseInt(match[4]);
                const res = this.move(sr, sc, tr, tc);
                if (res) applied.push({ ...res, notation: san });
            }
            return applied.length > 0 ? applied : null;
        }
        return null;
    }
}

export function parseUserMove(text, game) {
    if (!game) return null;
    
    if (game.type === 'chess') {
        // e2 to e4, e2-e4, e2e4
        const sqMatch = text.match(/\b([a-h][1-8])\s*(?:to|->|-|→|\s+)?\s*([a-h][1-8])\b/i);
        if (sqMatch) {
            const m = game.move(sqMatch[1].toLowerCase(), sqMatch[2].toLowerCase());
            if (m) return { notation: m.san, move: m };
        }

        // Standard SAN (e4, Nf3, O-O, etc.)
        const sanMatches = text.match(/\b(?:[NQKBR]?[a-h]?[1-8]?x?[a-h][1-8](?:=[NQKBR])?[+#]?|O-O(?:-O)?)\b/g);
        if (sanMatches) {
            for (const san of sanMatches) {
                try {
                    const m = game.game.move(san);
                    if (m) return { notation: m.san, move: m };
                } catch(e) {}
            }
        }

        // Natural language phrases
        const lower = text.toLowerCase();
        let fromSq = null, toSq = null;
        const turn = game.getTurn();
        
        // King's pawn 2 steps / pawn in front of king 2 steps / pawn above king 2 steps
        if (/(?:pawn\s+(?:in\s+front\s+of|above|before)\s+(?:the\s+)?king|king'?s?\s+pawn).*(?:2|two)/.test(lower)) {
            fromSq = turn === 'w' ? 'e2' : 'e7';
            toSq = turn === 'w' ? 'e4' : 'e5';
        }
        // Queen's pawn 2 steps
        else if (/(?:pawn\s+(?:in\s+front\s+of|above|before)\s+(?:the\s+)?queen|queen'?s?\s+pawn).*(?:2|two)/.test(lower)) {
            fromSq = turn === 'w' ? 'd2' : 'd7';
            toSq = turn === 'w' ? 'd4' : 'd5';
        }
        // King's pawn 1 step
        else if (/(?:pawn\s+(?:in\s+front\s+of|above|before)\s+(?:the\s+)?king|king'?s?\s+pawn)/.test(lower)) {
            fromSq = turn === 'w' ? 'e2' : 'e7';
            toSq = turn === 'w' ? 'e3' : 'e6';
        }
        // Queen's pawn 1 step
        else if (/(?:pawn\s+(?:in\s+front\s+of|above|before)\s+(?:the\s+)?queen|queen'?s?\s+pawn)/.test(lower)) {
            fromSq = turn === 'w' ? 'd2' : 'd7';
            toSq = turn === 'w' ? 'd3' : 'd6';
        }

        if (fromSq && toSq) {
            const m = game.move(fromSq, toSq);
            if (m) return { notation: m.san, move: m };
        }
    } else if (game.type === 'checkers') {
        const match = text.match(/(\d+)\s*[-xX\s→>]+\s*(\d+)/i);
        if (match) {
            const m = game.makeSanMove(text);
            if (m && m.length > 0) return { notation: text, move: m[0] };
        }
    }

    return null;
}

export function extractAIMove(text, game) {
    if (!game) return null;
    if (game.type === 'chess') {
        const intentRegex = /(?:i (?:will )?(?:play|move)|my move is|move:|playing|^)\s*([NQKBR]?[a-h]?[1-8]?x?[a-h][1-8](?:=[NQKBR])?[+#]?|O-O(?:-O)?)\b/i;
        const match = text.match(intentRegex);
        if (match && match[1]) return match[1];
    } else if (game.type === 'checkers') {
        const intentRegex = /(?:i (?:will )?(?:play|move)|my move is|here'?s my move[:]?|move:|playing|^)\s*((\d+)\s*[-xX\s→>]+\s*(\d+(?:\s*[-xX\s→>]+\s*\d+)*))/i;
        let match = text.match(intentRegex);
        if (match && match[1]) return match[1];
        
        // Fallback for just move at end of string
        match = text.match(/(?:^|\n)\s*(\d+)\s*[-xX\s→>]+\s*(\d+)\s*$/i);
        if (match) return match[0];
        
        // Catch hallucinated chess notation (e.g. "e7 to e5") to trigger an error for the LLM
        match = text.match(/\b([a-h][1-8])\s*(?:to|->|-|→|\s+)?\s*([a-h][1-8])\b/i);
        if (match) return match[0];
    }
    return null;
}
