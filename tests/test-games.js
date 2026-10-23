// Run with: node tests/test-games.js
import { ChessGame, CheckersGame, parseUserMove, extractAIMove } from '../games/game-logic.js';
import { gameController } from '../games/game-controller.js';

let passed = 0;
let failed = 0;

function assert(condition, message) {
    if (condition) {
        console.log(`PASS: ${message}`);
        passed++;
    } else {
        console.error(`FAIL: ${message}`);
        failed++;
    }
}

console.log('================================================================');
console.log('              JAMES GAMES UNIT TEST SUITE                       ');
console.log('================================================================\n');

// ─── 1. Chess Game Logic ───────────────────────────────────────────────────────
console.log('--- 1. Chess Game Logic ---');
const chess = new ChessGame();
assert(chess.getTurn() === 'w', 'Initial turn is white');
assert(chess.getFen().startsWith('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR'), 'Initial FEN is standard chess start');

// Valid moves
const m1 = chess.move('e2', 'e4');
assert(m1 !== null && m1.san === 'e4', 'Valid move e2 to e4 produces san "e4"');
assert(chess.getTurn() === 'b', 'Turn switches to black after white moves');

const m2 = chess.move('e7', 'e5');
assert(m2 !== null && m2.san === 'e5', 'Valid black move e7 to e5');
assert(chess.getTurn() === 'w', 'Turn switches to white after black moves');

// Block invalid move (moving through pieces or illegal moves)
const m3 = chess.move('e4', 'e6');
assert(m3 === null, 'Invalid move blocked');

// SAN moves
const m4 = chess.makeSanMove('Nf3');
assert(m4 && m4.length > 0 && m4[0].san === 'Nf3', 'SAN move Nf3 succeeds');

// Object parameter support
const m5 = chess.move({ from: 'b8', to: 'c6' });
assert(m5 !== null && m5.san === 'Nc6', 'Object move {from, to} works');

// Coordinate string in move
const m6 = chess.move('d2-d4');
assert(m6 !== null, 'Coordinate move "d2-d4" works');

// FEN export and reload
const savedFen = chess.getFen();
const chessReloaded = new ChessGame();
chessReloaded.loadFen(savedFen);
assert(chessReloaded.getFen() === savedFen, 'Chess FEN state roundtrip works');
assert(chessReloaded.getTurn() === chess.getTurn(), 'Chess turn matches after FEN reload');

// Checkmate scenario
const mateGame = new ChessGame();
// Fool's mate: 1. f3 e5 2. g4 Qh4#
mateGame.move('f2', 'f3');
mateGame.move('e7', 'e5');
mateGame.move('g2', 'g4');
mateGame.move('d8', 'h4');
assert(mateGame.isGameOver() === true, 'Fool\'s mate detected as game over');
assert(mateGame.game.isCheckmate() === true, 'Fool\'s mate detected as checkmate');

// ─── 2. Chess Move Extraction & Parsing ───────────────────────────────────────
console.log('\n--- 2. Chess Move Extraction & Natural Parsing ---');
const parseGame = new ChessGame();

// Natural language piece moves
const pKnight = parseUserMove('knight to f3', parseGame);
assert(pKnight && pKnight.notation === 'Nf3', 'Parses "knight to f3" as Nf3');

const parseGame2 = new ChessGame();
const pCoord = parseUserMove('e2 to e4', parseGame2);
assert(pCoord && pCoord.notation === 'e4', 'Parses "e2 to e4" as e4');

const parseGame3 = new ChessGame();
const pPawn = parseUserMove('pawn in front of the king', parseGame3);
assert(pPawn && (pPawn.notation === 'e4' || pPawn.notation === 'e3'), 'Parses natural language "pawn in front of king"');

// Castling detection
const castleGame = new ChessGame('rnbqk2r/pppp1ppp/5n2/2b1p3/2B1P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 4 4');
const pCastle = parseUserMove('castle kingside', castleGame);
assert(pCastle && pCastle.notation === 'O-O', 'Parses natural phrase "castle kingside"');

// AI move extraction
assert(extractAIMove('my move is e4', chess) === 'e4', 'Extracts direct move "e4"');
assert(extractAIMove('I will play Nf3', chess) === 'Nf3', 'Extracts piece move "Nf3"');
assert(extractAIMove('I play e7-e5', chess) === 'e7-e5', 'Extracts coordinate move "e7-e5"');
assert(extractAIMove('O-O', chess) === 'O-O', 'Extracts castling "O-O"');

// ─── 3. Checkers Game Logic ───────────────────────────────────────────────────
console.log('\n--- 3. Checkers Game Logic ---');
const checkers = new CheckersGame();
assert(checkers.turn === 'w', 'Initial checkers turn is white');
assert(checkers.board[6][1] === 1, 'White piece at row 6, col 1');
assert(checkers.board[1][0] === -1, 'Black piece at row 1, col 0');

// Valid simple move
const chkM1 = checkers.move('22-18');
assert(chkM1 !== null && chkM1.valid === true, 'Valid checkers move 22-18 succeeds');
assert(checkers.turn === 'b', 'Turn flips to black');

// Black response
const chkM2 = checkers.move('11-15');
assert(chkM2 !== null && chkM2.valid === true, 'Valid black checkers move 11-15 succeeds');
assert(checkers.turn === 'w', 'Turn flips to white');

// Capture (Jump)
const chkM3 = checkers.move('18x11');
assert(chkM3 !== null && chkM3.jumped === true, 'Checkers capture 18x11 is registered as a jump');
assert(checkers.board[2][4] === 0, 'Captured piece at row 2 col 4 is removed from board');

// Forced Capture Rule
const chkForced = new CheckersGame();
chkForced.move('22-18');
chkForced.move('11-15');
// White piece at 18 must jump black piece at 15
const illegalSimple = chkForced.move('24-20');
assert(illegalSimple === null, 'Simple move is blocked when a capture is available (forced capture rule)');
const legalJump = chkForced.move('18x11');
assert(legalJump !== null && legalJump.jumped === true, 'Legal jump succeeds under forced capture rule');

// King promotion & backward move
const chkKing = new CheckersGame();
// Setup position where white man is 1 step away from king row
chkKing.loadFen('......../w......./......../......../......../......../......../........ w');
assert(chkKing.board[1][0] === 1, 'White man at row 1 col 0');
const promoMove = chkKing.move(1, 0, 0, 1);
assert(promoMove !== null, 'White moves to row 0');
assert(chkKing.board[0][1] === 2, 'White piece is promoted to King (value = 2)');

// King can move backward
chkKing.turn = 'w';
const kingBack = chkKing.move(0, 1, 1, 0);
assert(kingBack !== null, 'King can legally move backward');

// Checkers FEN export and reload
const chkFen = checkers.getFen();
const chkReloaded = new CheckersGame();
chkReloaded.loadFen(chkFen);
assert(chkReloaded.getFen() === chkFen, 'Checkers FEN state roundtrip matches');

// Checkers Move Extraction & User Parsing
assert(extractAIMove('I will play 22-18', checkers) === '22-18', 'Extracts checkers PDN format');
assert(extractAIMove('my move is 11x15', checkers) === '11x15', 'Extracts checkers capture format');
assert(extractAIMove('I will jump 18x11.', checkers) === '18x11', 'Extracts jump with punctuation stripped');

const pChk1 = parseUserMove('move 22-18 please', new CheckersGame());
assert(pChk1 && pChk1.notation === '22-18', 'Parses checkers move from natural sentence to clean "22-18"');

// ─── 4. GameController Turn Order & AI Enforcement ────────────────────────────
console.log('\n--- 4. GameController & AI Turn Order ---');
let sysMsgs = [];
const logSys = (msg) => sysMsgs.push(msg);

// Start Chess
gameController.handleStartGame({ game: 'chess' }, logSys);
assert(gameController.activeGame !== null, 'Chess game successfully initialized');
assert(gameController.activeGame.type === 'chess', 'Active game type is chess');
assert(gameController.activeGame.aiColor === 'b', 'AI color is strictly forced to Black');
assert(gameController.activeGame.getTurn() === 'w', 'User (White) always goes first');

// AI blocked from playing first
const blockedAiChess = gameController.handleMakeMove({ move: 'e4' }, logSys);
assert(blockedAiChess.success === false, 'AI is prevented from making the first move in chess');

// User plays first
const userMove1 = gameController.parseUserMove('e4');
assert(userMove1 !== null, 'User move e4 parsed successfully');
gameController.handleGameMove(userMove1);
assert(gameController.activeGame.getTurn() === 'b', 'Turn flips to Black (AI) after user plays');

// AI plays second
const aiMove1 = gameController.handleMakeMove({ move: 'e5' }, logSys);
assert(aiMove1.success === true, 'AI can legally make the 2nd move as Black');
assert(gameController.activeGame.getTurn() === 'w', 'Turn flips back to White (user)');

// Start Checkers
let chkSys = [];
gameController.handleStartGame({ game: 'checkers', ai_color: 'white' }, msg => chkSys.push(msg));
assert(gameController.activeGame.type === 'checkers', 'Active game type is checkers');
assert(gameController.activeGame.aiColor === 'b', 'Checkers AI color is forced to Black even if white was requested');
assert(gameController.activeGame.getTurn() === 'w', 'User goes first in checkers');

const blockedAiChk = gameController.handleMakeMove({ move: '22-18' });
assert(blockedAiChk.success === false, 'AI blocked from moving first in checkers');

const userChkMove = gameController.parseUserMove('22-18');
gameController.handleGameMove(userChkMove);
assert(gameController.activeGame.getTurn() === 'b', 'Checkers turn flips to Black after user moves');

const aiChkMove = gameController.handleMakeMove({ move: '11-15' });
assert(aiChkMove.success === true, 'AI can legally move 2nd in checkers');
gameController.closeActiveGame();
assert(gameController.activeGame === null, 'Game controller activeGame closed cleanly');

console.log(`\n================================================================`);
console.log(`TOTAL: ${passed} passed, ${failed} failed.`);
console.log(`================================================================\n`);

if (failed > 0) process.exit(1);
process.exit(0);
