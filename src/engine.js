export const SIZE = 8;
export const COLORS = 5;

// Coordinates are [row, column]. Each orientation is a separate, fixed piece.
export const SHAPES = Object.freeze({
  dot: [[0, 0]],
  duoH: [[0, 0], [0, 1]],
  duoV: [[0, 0], [1, 0]],
  triH: [[0, 0], [0, 1], [0, 2]],
  triV: [[0, 0], [1, 0], [2, 0]],
  corner: [[0, 0], [1, 0], [1, 1]],
  cornerR: [[0, 1], [1, 0], [1, 1]],
  cornerU: [[0, 0], [0, 1], [1, 0]],
  cornerUR: [[0, 0], [0, 1], [1, 1]],
  square: [[0, 0], [0, 1], [1, 0], [1, 1]],
  fourH: [[0, 0], [0, 1], [0, 2], [0, 3]],
  fourV: [[0, 0], [1, 0], [2, 0], [3, 0]],
  ell: [[0, 0], [1, 0], [2, 0], [2, 1]],
  ellR: [[0, 1], [1, 1], [2, 0], [2, 1]],
  ellH: [[0, 0], [0, 1], [0, 2], [1, 0]],
  tee: [[0, 0], [0, 1], [0, 2], [1, 1]],
  teeU: [[0, 1], [1, 0], [1, 1], [1, 2]],
  zig: [[0, 0], [0, 1], [1, 1], [1, 2]],
  zag: [[0, 1], [0, 2], [1, 0], [1, 1]],
  fiveH: [[0, 0], [0, 1], [0, 2], [0, 3], [0, 4]],
  fiveV: [[0, 0], [1, 0], [2, 0], [3, 0], [4, 0]],
  rectangle: [[0, 0], [0, 1], [0, 2], [1, 0], [1, 1], [1, 2]],
  bigSquare: [[0, 0], [0, 1], [0, 2], [1, 0], [1, 1], [1, 2], [2, 0], [2, 1], [2, 2]],
});
for (const cells of Object.values(SHAPES)) {
  cells.forEach(Object.freeze);
  Object.freeze(cells);
}
const SHAPE_IDS = Object.keys(SHAPES);
const choose = (values, random) => values[Math.min(values.length - 1, Math.max(0, Math.floor(random() * values.length)))];
export const clone = value => structuredClone(value);
export const cellsOf = piece => SHAPES[piece.shape];
export const dimensions = piece => ({
  rows: Math.max(...cellsOf(piece).map(cell => cell[0])) + 1,
  columns: Math.max(...cellsOf(piece).map(cell => cell[1])) + 1,
});

export function canPlace(board, piece, row, column) {
  if (!piece || !SHAPES[piece.shape] || !Number.isInteger(row) || !Number.isInteger(column)) return false;
  return cellsOf(piece).every(([dr, dc]) => {
    const r = row + dr, c = column + dc;
    return r >= 0 && r < SIZE && c >= 0 && c < SIZE && board[r * SIZE + c] === 0;
  });
}

export function findPlacement(board, piece) {
  for (let row = 0; row < SIZE; row++) {
    for (let column = 0; column < SIZE; column++) {
      if (canPlace(board, piece, row, column)) return { row, column };
    }
  }
  return null;
}

export const hasMoves = game => game.hand.some(piece => piece && findPlacement(game.board, piece));

export function deal(board, random = Math.random) {
  const hand = Array.from({ length: 3 }, () => ({ shape: choose(SHAPE_IDS, random), color: 1 + Math.floor(random() * COLORS) }));
  // A fresh tray always offers at least one legal move, if the board has room.
  if (!hand.some(piece => findPlacement(board, piece))) {
    const fitting = SHAPE_IDS.filter(shape => findPlacement(board, { shape }));
    if (fitting.length) hand[0].shape = choose(fitting, random);
  }
  return hand;
}

export function newGame(random = Math.random) {
  const board = Array(SIZE * SIZE).fill(0);
  return { board, hand: deal(board, random), score: 0, lines: 0, moves: 0, combo: 0 };
}

export function preview(game, slot, row, column) {
  const piece = game.hand[slot];
  if (!canPlace(game.board, piece, row, column)) return null;
  const board = [...game.board];
  const placed = cellsOf(piece).map(([dr, dc]) => (row + dr) * SIZE + column + dc);
  placed.forEach(index => { board[index] = piece.color; });
  const rows = [], columns = [];
  for (let r = 0; r < SIZE; r++) if (board.slice(r * SIZE, (r + 1) * SIZE).every(Boolean)) rows.push(r);
  for (let c = 0; c < SIZE; c++) if (Array.from({ length: SIZE }, (_, r) => board[r * SIZE + c]).every(Boolean)) columns.push(c);
  const cleared = [...new Set([
    ...rows.flatMap(r => Array.from({ length: SIZE }, (_, c) => r * SIZE + c)),
    ...columns.flatMap(c => Array.from({ length: SIZE }, (_, r) => r * SIZE + c)),
  ])];
  return { board, placed, cleared, rows, columns };
}

export function place(game, slot, row, column, random = Math.random) {
  const result = preview(game, slot, row, column);
  if (!result) return null;
  const next = clone(game);
  next.board = result.board;
  result.cleared.forEach(index => { next.board[index] = 0; });
  const lines = result.rows.length + result.columns.length;
  next.combo = lines ? game.combo + 1 : 0;
  const crossBonus = result.rows.length && result.columns.length ? 50 : 0;
  const earned = result.placed.length * 5 + lines * 100 * Math.min(next.combo, 5) + crossBonus;
  next.score += earned;
  next.lines += lines;
  next.moves++;
  next.hand[slot] = null;
  if (next.hand.every(piece => piece === null)) next.hand = deal(next.board, random);
  return { game: next, earned, ...result, lines };
}

const integer = value => Number.isSafeInteger(value) && value >= 0;
export function validGame(value) {
  return value && Array.isArray(value.board) && value.board.length === SIZE * SIZE
    && value.board.every(color => Number.isInteger(color) && color >= 0 && color <= COLORS)
    && Array.isArray(value.hand) && value.hand.length === 3 && value.hand.some(Boolean)
    && value.hand.every(piece => piece === null || (piece && Object.hasOwn(SHAPES, piece.shape)
      && Number.isInteger(piece.color) && piece.color >= 1 && piece.color <= COLORS))
    && ['score', 'lines', 'moves', 'combo'].every(key => integer(value[key]));
}
