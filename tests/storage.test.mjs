import test from 'node:test';
import assert from 'node:assert/strict';
import { createStorage, saveQueue } from '../src/storage.js';

test('host storage is used exclusively and host errors are surfaced', async () => {
  const calls = [];
  const host = { storage: { get: async key => { calls.push(key); return { score: 123 }; }, set: async () => { throw new Error('PLUGIN_SESSION'); } } };
  const local = { getItem() { throw new Error('Must not access browser storage'); }, setItem() { throw new Error('Must not access browser storage'); } };
  const store = createStorage(host, local);
  assert.deepEqual(await store.read(), { score: 123 });
  await assert.rejects(store.write({ score: 456 }), /PLUGIN_SESSION/);
  assert.deepEqual(calls, ['block-breeze.v1']);
});

test('browser preview round-trips an independent JSON save', async () => {
  const values = new Map();
  const store = createStorage(null, { getItem: key => values.get(key), setItem: (key, value) => values.set(key, value) });
  assert.equal(await store.read(), null);
  await store.write({ game: { score: 42 } });
  assert.deepEqual(await store.read(), { game: { score: 42 } });
});

test('queued saves preserve order, snapshot mutable data, and recover after a failed write', async () => {
  const seen = [], statuses = [];
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  const queue = saveQueue({ async write(value) { seen.push(value.score); if (value.score === 1) { await gate; throw new Error('temporary'); } } }, ok => statuses.push(ok));
  const value = { score: 1 };
  const first = queue(value).catch(() => {});
  value.score = 2;
  const second = queue(value);
  value.score = 999;
  await Promise.resolve();
  release();
  await Promise.all([first, second]);
  assert.deepEqual(seen, [1, 2]);
  assert.deepEqual(statuses, [false, true]);
});
