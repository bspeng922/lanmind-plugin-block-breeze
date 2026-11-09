import test from 'node:test';
import assert from 'node:assert/strict';
import { SIZE, SHAPES, newGame, clone, canPlace, hasMoves, findPlacement, preview, place, deal, validGame } from '../src/engine.js';

const fixed = () => 0;
function fixture() {
  return { ...newGame(fixed), hand: [{ shape: 'dot', color: 1 }, { shape: 'square', color: 2 }, { shape: 'triH', color: 3 }] };
}

test('invalid placements cannot wrap rows, overlap, or mutate a game', () => {
  const game = fixture();
  game.board[0] = 2;
  const original = clone(game);
  for (const [slot, row, column] of [[0, 0, 0], [1, -1, 0], [1, 7, 7], [2, 0, 7], [0, .5, 0], [3, 0, 1]]) {
    assert.equal(place(game, slot, row, column), null);
  }
  assert.deepEqual(game, original);
});

test('a crossing row and column clear simultaneously with no double-counted cell', () => {
  const game = fixture();
  for (let index = 1; index < SIZE; index++) { game.board[index] = 2; game.board[index * SIZE] = 3; }
  const prediction = preview(game, 0, 0, 0);
  assert.equal(prediction.cleared.length, 15);
  assert.deepEqual(prediction.rows, [0]);
  assert.deepEqual(prediction.columns, [0]);
  assert.equal(game.board[0], 0);
  const result = place(game, 0, 0, 0, fixed);
  assert.equal(result.game.score, 255);
  assert.equal(result.game.lines, 2);
  assert.equal(result.game.combo, 1);
  assert.ok(result.game.board.every(value => value === 0));
});

test('consecutive clears multiply line points, cap at five and reset on a quiet move', () => {
  const game = fixture();
  game.combo = 9;
  game.board.fill(1, 1, 8);
  const result = place(game, 0, 0, 0, fixed);
  assert.equal(result.earned, 505);
  assert.equal(result.game.combo, 10);
  const quiet = place(result.game, 1, 2, 2, fixed);
  assert.equal(quiet.game.combo, 0);
  assert.equal(quiet.earned, 20);
});

test('a new tray is dealt only after all three pieces have been used', () => {
  let game = fixture();
  game = place(game, 0, 0, 0, fixed).game;
  assert.equal(game.hand[0], null);
  game = place(game, 1, 1, 1, fixed).game;
  assert.equal(game.hand[1], null);
  game = place(game, 2, 4, 0, fixed).game;
  assert.ok(game.hand.every(Boolean));
  assert.equal(game.moves, 3);
  assert.equal(game.score, 40);
});

test('game over considers every remaining piece and every board location', () => {
  const game = fixture();
  // A checkerboard has 32 empty cells but cannot fit a square or straight triomino.
  game.board = Array.from({ length: 64 }, (_, i) => (Math.floor(i / 8) + i % 8) % 2);
  game.hand = [null, { shape: 'square', color: 1 }, { shape: 'triH', color: 2 }];
  assert.equal(hasMoves(game), false);
  assert.equal(findPlacement(game.board, { shape: 'dot' }).row, 0);
  game.hand[0] = { shape: 'dot', color: 3 };
  assert.equal(hasMoves(game), true);
});

test('dealing avoids a completely unplayable new tray when a shape still fits', () => {
  const board = Array(64).fill(1);
  board[63] = 0;
  const hand = deal(board, () => .9999);
  assert.equal(hand[0].shape, 'dot');
  assert.equal(canPlace(board, hand[0], 7, 7), true);
});

test('saved state rejects malformed boards, prototype properties, colors and scores', () => {
  assert.ok(validGame(fixture()));
  for (const mutate of [
    game => game.board.pop(), game => { game.board[0] = 6; },
    game => { game.hand[0].shape = '__proto__'; }, game => { game.hand[0].color = 0; },
    game => { game.score = Infinity; }, game => { game.moves = -1; },
    game => { game.hand = [null, null, null]; },
  ]) { const game = fixture(); mutate(game); assert.ok(!validGame(game)); }
});

test('every shape is normalized, unique and fits an empty board', () => {
  for (const [shape, cells] of Object.entries(SHAPES)) {
    assert.equal(new Set(cells.map(cell => cell.join(','))).size, cells.length);
    assert.equal(Math.min(...cells.map(cell => cell[0])), 0);
    assert.equal(Math.min(...cells.map(cell => cell[1])), 0);
    assert.ok(findPlacement(Array(64).fill(0), { shape }));
  }
});
