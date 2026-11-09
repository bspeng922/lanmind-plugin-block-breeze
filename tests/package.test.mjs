import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { unzipSync, zipSync } from 'fflate';
import { build } from '../scripts/build.mjs';
import { generateKey, packagePlugin, packageUnsigned, verifyPackage } from '../scripts/package.mjs';

test('signed releases are deterministic, self-contained, and verify as both ZIP and LMPK', t => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'block-breeze-package-'));
  t.after(() => fs.rmSync(temp, { recursive: true, force: true }));
  const key = path.join(temp, 'publisher.pem');
  generateKey(key);
  const input = build();
  const first = path.join(temp, 'first.lmpk'), second = path.join(temp, 'second.zip');
  const metadata = packagePlugin({ input, key, output: first });
  packagePlugin({ input, key, output: second });
  assert.deepEqual(fs.readFileSync(first), fs.readFileSync(second));
  assert.equal(verifyPackage(first).publisherId, metadata.publisherId);
  assert.equal(verifyPackage(second).sha256, metadata.sha256);
  const files = unzipSync(fs.readFileSync(first));
  assert.deepEqual(JSON.parse(Buffer.from(files['manifest.json']).toString()).capabilities, []);
  assert.ok(!Object.keys(files).some(name => /test|\.pem|node_modules|\.git/.test(name)));
  assert.throws(() => packagePlugin({ input, key, output: first }), /EEXIST/);
  files['index.html'] = Buffer.from('tampered');
  const tampered = path.join(temp, 'tampered.zip');
  fs.writeFileSync(tampered, zipSync(files));
  assert.throws(() => verifyPackage(tampered), /Invalid resource/);
});

test('unsigned static ZIP is usable without a key and never claims a valid signature', t => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'block-breeze-unsigned-'));
  t.after(() => fs.rmSync(temp, { recursive: true, force: true }));
  const output = path.join(temp, 'unsigned.zip');
  const metadata = packageUnsigned({ input: build(), output });
  assert.equal(metadata.signed, false);
  assert.equal(metadata.publisherId, 'unsigned');
  const files = unzipSync(fs.readFileSync(output));
  assert.ok(!Object.hasOwn(files, 'signature.json'));
  assert.ok(Object.hasOwn(JSON.parse(Buffer.from(files['manifest.json']).toString()).files, 'src/app.js'));
});
