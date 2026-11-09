import { SIZE, SHAPES, clone, cellsOf, dimensions, canPlace, findPlacement, hasMoves, newGame, place, preview, validGame } from './engine.js';
import { createStorage, saveQueue } from './storage.js';
import { t, setLocale, getLocale } from './i18n.js';

const $ = id => document.getElementById(id);
const board = $('board');
const tray = $('tray');
let game, previous = null, best = 0, startingBest = 0;
let selected = null, hover = null, drag = null, ignoreClickUntil = 0;
let settings = { sound: false, theme: 'auto' };
let hostTheme = null, store, save, storageHealthy = true, readable = false;
let toastTimer, feedbackTimer, audio;
const scheme = window.matchMedia('(prefers-color-scheme: dark)');

function toast(message) {
  $('toast').textContent = message;
  $('toast').classList.add('visible');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => $('toast').classList.remove('visible'), 2300);
}

function saveStatus(ok) {
  storageHealthy = ok;
  $('save-status').classList.toggle('failed', !ok);
  $('save-label').textContent = t(ok ? 'saveOk' : 'saveFail');
}

function persist() {
  if (!readable) return;
  void save({ schemaVersion: 1, game, previous, best, startingBest, settings }).catch(() => {});
}

function applyTheme() {
  const theme = settings.theme === 'auto' ? (hostTheme ?? (scheme.matches ? 'dark' : 'light')) : settings.theme;
  document.documentElement.dataset.theme = theme;
  const label = t(theme === 'dark' ? 'light' : 'dark');
  $('theme-button').ariaLabel = label;
  $('theme-button').title = label;
  document.querySelector('meta[name="theme-color"]').content = theme === 'dark' ? '#19231f' : '#f7f8f2';
}

function applyLanguage(context) {
  setLocale(context?.locale ?? 'zh-CN');
  if (context?.theme) hostTheme = context.theme.id === 'dark' ? 'dark' : 'light';
  document.documentElement.lang = getLocale();
  document.title = `${t('name')} · Block Breeze`;
  document.querySelectorAll('[data-i18n]').forEach(element => { element.textContent = t(element.dataset.i18n); });
  document.querySelectorAll('[data-label]').forEach(element => { element.ariaLabel = element.title = t(element.dataset.label); });
  // Only our own translation strings contain markup.
  $('hero').innerHTML = t('hero');
  $('intro-copy').innerHTML = t('intro');
  applyTheme();
  if (game) render();
}

function shapeElement(piece, tile = 15, gap = 3) {
  const { rows, columns } = dimensions(piece);
  const element = document.createElement('span');
  element.className = 'mini-shape';
  element.style.setProperty('--rows', rows);
  element.style.setProperty('--columns', columns);
  element.style.setProperty('--tile', `${tile}px`);
  element.style.setProperty('--gap', `${gap}px`);
  element.style.setProperty('--piece-color', `var(--block-${piece.color})`);
  for (const [r, c] of cellsOf(piece)) {
    const block = document.createElement('i');
    block.className = 'mini-tile';
    block.style.gridRow = r + 1;
    block.style.gridColumn = c + 1;
    element.append(block);
  }
  return element;
}

for (let index = 0; index < SIZE * SIZE; index++) {
  const cell = document.createElement('button');
  cell.type = 'button';
  cell.className = 'cell';
  cell.dataset.index = index;
  cell.setAttribute('role', 'gridcell');
  cell.setAttribute('aria-rowindex', Math.floor(index / SIZE) + 1);
  cell.setAttribute('aria-colindex', index % SIZE + 1);
  cell.tabIndex = index === 0 ? 0 : -1;
  board.append(cell);
}
const boardCells = [...board.children];

function renderBoard() {
  boardCells.forEach((cell, index) => {
    cell.className = `cell${game.board[index] ? ' filled' : ''}`;
    cell.style.setProperty('--piece-color', `var(--block-${game.board[index] || 1})`);
    cell.ariaLabel = t('cell', { row: Math.floor(index / SIZE) + 1, column: index % SIZE + 1, state: t(game.board[index] ? 'filled' : 'empty') });
  });
  board.dataset.selected = String(selected !== null);
  if (selected === null || !hover || !game.hand[selected]) return;
  const piece = game.hand[selected];
  const prediction = preview(game, selected, hover.row, hover.column);
  cellsOf(piece).forEach(([dr, dc]) => {
    const row = hover.row + dr, column = hover.column + dc;
    if (row < 0 || row >= SIZE || column < 0 || column >= SIZE) return;
    const cell = boardCells[row * SIZE + column];
    cell.style.setProperty('--piece-color', `var(--block-${piece.color})`);
    cell.classList.add(prediction ? 'preview' : 'preview-invalid');
  });
  prediction?.cleared.forEach(index => boardCells[index].classList.add('preview-clear'));
}

function renderTray() {
  tray.replaceChildren();
  game.hand.forEach((piece, slot) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `piece-button${piece ? '' : ' used'}${selected === slot ? ' selected' : ''}`;
    button.dataset.slot = slot;
    button.ariaLabel = t('select', { n: slot + 1 });
    button.setAttribute('aria-pressed', String(selected === slot));
    button.disabled = !piece || !hasMoves(game);
    if (piece) {
      const { rows, columns } = dimensions(piece);
      button.title = t('shapeLabel', { rows, columns, count: cellsOf(piece).length });
      button.append(shapeElement(piece, rows >= 5 ? 11 : rows >= 4 ? 13 : 16));
      if (!findPlacement(game.board, piece)) button.classList.add('no-fit');
    }
    tray.append(button);
  });
}

function render() {
  $('score').textContent = game.score.toLocaleString(getLocale());
  $('best').textContent = best.toLocaleString(getLocale());
  $('lines').textContent = game.lines;
  $('undo-button').disabled = !previous;
  $('over-undo').hidden = !previous;
  const milestone = (Math.floor(game.score / 1000) + 1) * 1000;
  $('milestone-value').textContent = t('goalValue', { score: milestone.toLocaleString(getLocale()) });
  const progress = (game.score % 1000) / 10;
  $('milestone-fill').style.width = `${progress}%`;
  $('milestone-progress').setAttribute('aria-valuenow', progress);
  $('milestone-progress').ariaLabel = t('goal');
  $('combo-badge').hidden = game.combo < 2;
  $('combo-badge').textContent = t('combo', { combo: game.combo });
  $('sound-button').classList.toggle('sound-enabled', settings.sound);
  $('sound-button').setAttribute('aria-pressed', String(settings.sound));
  $('sound-button').ariaLabel = $('sound-button').title = t(settings.sound ? 'soundOn' : 'soundOff');
  const ended = !hasMoves(game);
  $('game-over').hidden = !ended;
  board.inert = ended;
  $('final-score').textContent = game.score.toLocaleString(getLocale());
  $('new-best').hidden = game.score <= startingBest || game.score === 0;
  renderBoard();
  renderTray();
  saveStatus(storageHealthy);
}

function playSound(clear = false) {
  if (!settings.sound) return;
  try {
    audio ??= new (window.AudioContext || window.webkitAudioContext)();
    void audio.resume().catch(() => {});
    const now = audio.currentTime;
    const notes = clear ? [523.25, 659.25, 783.99] : [440];
    notes.forEach((frequency, index) => {
      const oscillator = audio.createOscillator(), gain = audio.createGain();
      oscillator.type = 'sine';
      oscillator.frequency.value = frequency;
      gain.gain.setValueAtTime(0, now + index * .07);
      gain.gain.linearRampToValueAtTime(.065, now + index * .07 + .012);
      gain.gain.exponentialRampToValueAtTime(.001, now + index * .07 + .2);
      oscillator.connect(gain).connect(audio.destination);
      oscillator.start(now + index * .07);
      oscillator.stop(now + index * .07 + .22);
    });
  } catch { /* Audio is optional in embedded WebViews. */ }
}

function makeMove(row, column) {
  if (selected === null || !hasMoves(game)) return false;
  const result = place(game, selected, row, column);
  if (!result) { toast(t('invalid')); return false; }
  previous = clone(game);
  game = result.game;
  best = Math.max(best, game.score);
  selected = hover = null;
  render();
  for (const index of result.placed) if (!result.cleared.includes(index)) boardCells[index].classList.add('just-placed');
  for (const index of result.cleared) boardCells[index].classList.add('just-cleared');
  clearTimeout(feedbackTimer);
  if (result.lines) {
    $('board-feedback').textContent = game.combo >= 2 ? `${t('combo', { combo: game.combo })}  +${result.earned}` : `+${result.earned}`;
    $('board-feedback').classList.remove('show');
    void $('board-feedback').offsetWidth;
    $('board-feedback').classList.add('show');
    feedbackTimer = setTimeout(() => $('board-feedback').classList.remove('show'), 1200);
  }
  toast(t(result.lines ? 'cleared' : 'placed', { lines: result.lines, score: result.earned }));
  playSound(Boolean(result.lines));
  persist();
  return true;
}

function select(slot, announce = true) {
  if (!game.hand[slot] || !hasMoves(game)) return;
  selected = selected === slot ? null : slot;
  hover = null;
  renderBoard();
  renderTray();
  if (announce && selected !== null) toast(t('selected'));
}

function undo() {
  if (!previous) return;
  cancelDrag();
  game = previous;
  previous = null;
  selected = hover = null;
  render();
  persist();
  toast(t('undone'));
}

function restart() {
  cancelDrag();
  game = newGame();
  previous = selected = hover = null;
  startingBest = best;
  $('restart-dialog').close();
  render();
  persist();
  toast(t('fresh'));
}

function dialogOpen() { return Boolean(document.querySelector('dialog[open]')); }

tray.addEventListener('click', event => {
  if (Date.now() < ignoreClickUntil) return;
  const button = event.target.closest('[data-slot]');
  if (button && !button.disabled) select(Number(button.dataset.slot));
});
board.addEventListener('click', event => {
  if (Date.now() < ignoreClickUntil) return;
  const cell = event.target.closest('[data-index]');
  if (!cell) return;
  const index = Number(cell.dataset.index);
  makeMove(Math.floor(index / SIZE), index % SIZE);
});
board.addEventListener('pointermove', event => {
  if (drag || selected === null) return;
  const cell = event.target.closest('[data-index]');
  if (!cell) return;
  const index = Number(cell.dataset.index);
  hover = { row: Math.floor(index / SIZE), column: index % SIZE };
  renderBoard();
});
board.addEventListener('pointerleave', () => { if (!drag) { hover = null; renderBoard(); } });

tray.addEventListener('pointerdown', event => {
  const button = event.target.closest('[data-slot]');
  if (!button || button.disabled || (event.pointerType === 'mouse' && event.button !== 0) || drag) return;
  drag = { slot: Number(button.dataset.slot), x: event.clientX, y: event.clientY, id: event.pointerId, active: false, touch: event.pointerType === 'touch', button };
  button.setPointerCapture(event.pointerId);
});

function updateDrag(event) {
  if (!drag || event.pointerId !== drag.id) return;
  if (!drag.active && Math.hypot(event.clientX - drag.x, event.clientY - drag.y) < 5) return;
  if (!drag.active) {
    drag.active = true;
    selected = drag.slot;
    renderTray();
    tray.children[drag.slot].classList.add('is-dragging');
  }
  const piece = game.hand[drag.slot];
  if (!piece) { cancelDrag(); return; }
  const rect = boardCells[0].getBoundingClientRect();
  const second = boardCells[1].getBoundingClientRect();
  const step = second.left - rect.left, gap = step - rect.width;
  const { rows, columns } = dimensions(piece);
  const left = event.clientX - (columns * step - gap) / 2;
  const top = event.clientY - (rows * step - gap) / 2 - (drag.touch ? 52 : 18);
  const ghost = $('drag-ghost');
  ghost.hidden = false;
  ghost.style.left = `${left}px`;
  ghost.style.top = `${top}px`;
  ghost.replaceChildren(shapeElement(piece, rect.width, gap));
  hover = { row: Math.round((top - rect.top) / step), column: Math.round((left - rect.left) / step) };
  renderBoard();
}
window.addEventListener('pointermove', updateDrag);
function cancelDrag() {
  if (drag?.button.hasPointerCapture(drag.id)) drag.button.releasePointerCapture(drag.id);
  if (drag?.active) ignoreClickUntil = Date.now() + 300;
  drag = null;
  hover = null;
  $('drag-ghost').hidden = true;
  if (game) { renderBoard(); renderTray(); }
}
window.addEventListener('pointerup', event => {
  if (!drag || event.pointerId !== drag.id) return;
  if (drag.active) {
    updateDrag(event);
    const target = hover;
    const valid = target && canPlace(game.board, game.hand[selected], target.row, target.column);
    cancelDrag();
    if (valid) makeMove(target.row, target.column);
  } else {
    // Keep the original button mounted so its following click selects the piece.
    drag = null;
  }
});
window.addEventListener('pointercancel', cancelDrag);
window.addEventListener('blur', cancelDrag);
window.addEventListener('resize', () => { if (drag) cancelDrag(); });

board.addEventListener('focusin', event => {
  const cell = event.target.closest('[data-index]');
  if (!cell) return;
  boardCells.forEach(other => { other.tabIndex = other === cell ? 0 : -1; });
  if (selected !== null) {
    const index = Number(cell.dataset.index);
    hover = { row: Math.floor(index / SIZE), column: index % SIZE };
    renderBoard();
  }
});
board.addEventListener('keydown', event => {
  const delta = { ArrowLeft: [0, -1], ArrowRight: [0, 1], ArrowUp: [-1, 0], ArrowDown: [1, 0] }[event.key];
  if (!delta) return;
  event.preventDefault();
  const index = Number(event.target.dataset.index);
  const row = Math.max(0, Math.min(SIZE - 1, Math.floor(index / SIZE) + delta[0]));
  const column = Math.max(0, Math.min(SIZE - 1, index % SIZE + delta[1]));
  boardCells[row * SIZE + column].focus();
});
window.addEventListener('keydown', event => {
  if (!game || dialogOpen() || event.altKey || event.ctrlKey || event.metaKey) return;
  if (event.key === 'Escape') { cancelDrag(); selected = hover = null; renderBoard(); renderTray(); }
  if (/^[123]$/.test(event.key)) {
    event.preventDefault();
    select(Number(event.key) - 1);
    if (selected !== null) boardCells.find(cell => cell.tabIndex === 0)?.focus();
  }
});

$('undo-button').addEventListener('click', undo);
$('over-undo').addEventListener('click', undo);
$('restart-button').addEventListener('click', () => { cancelDrag(); if (game.moves) $('restart-dialog').showModal(); else restart(); });
$('play-again').addEventListener('click', restart);
$('cancel-restart').addEventListener('click', () => $('restart-dialog').close());
$('confirm-restart').addEventListener('click', restart);
$('help-button').addEventListener('click', () => { cancelDrag(); $('help-dialog').showModal(); });
$('close-help').addEventListener('click', () => $('help-dialog').close());
$('got-it').addEventListener('click', () => $('help-dialog').close());
$('sound-button').addEventListener('click', () => { settings.sound = !settings.sound; render(); playSound(); persist(); });
$('theme-button').addEventListener('click', () => { settings.theme = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark'; applyTheme(); persist(); });
scheme.addEventListener('change', applyTheme);
window.addEventListener('lanmind:context', event => applyLanguage(event.detail));
// Brand navigation would discard a browser game before its current write completes.
document.querySelector('.brand').addEventListener('click', event => { event.preventDefault(); });

async function start() {
  applyLanguage();
  game = newGame();
  try {
    // Accessing localStorage itself can throw in restricted browser contexts.
    store = createStorage();
    save = saveQueue(store, saveStatus);
    const [stored, context] = await Promise.allSettled([
      store.read(),
      window.LanMind?.context.get() ?? Promise.resolve(null),
    ]);
    if (context.status === 'fulfilled' && context.value) applyLanguage(context.value);
    if (stored.status === 'rejected') throw stored.reason;
    readable = true;
    const snapshot = stored.value;
    if (snapshot?.schemaVersion === 1) {
      best = Number.isSafeInteger(snapshot.best) && snapshot.best >= 0 ? snapshot.best : 0;
      if (validGame(snapshot.game)) {
        game = clone(snapshot.game);
        if (validGame(snapshot.previous)) previous = clone(snapshot.previous);
        best = Math.max(best, game.score);
        startingBest = Number.isSafeInteger(snapshot.startingBest) && snapshot.startingBest >= 0 ? Math.min(snapshot.startingBest, best) : best;
        if (game.moves) toast(t('restored'));
      }
      settings = { sound: snapshot.settings?.sound === true, theme: ['light', 'dark'].includes(snapshot.settings?.theme) ? snapshot.settings.theme : 'auto' };
    }
  } catch {
    // A failed host read must never overwrite a save that we could not load.
    readable = false;
    saveStatus(false);
  }
  applyTheme();
  render();
  $('app').classList.remove('is-loading');
  if (readable) persist();
}
void start();
