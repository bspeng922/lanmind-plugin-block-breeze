import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash, createPrivateKey, createPublicKey, generateKeyPairSync, sign, verify } from 'node:crypto';
import { zipSync, unzipSync } from 'fflate';
import { root, assets, build } from './build.mjs';

const context = Buffer.from('lanmind-web-plugin-v1\0');
export const hash = bytes => createHash('sha256').update(bytes).digest('hex');
export function generateKey(output) {
  const { privateKey, publicKey } = generateKeyPairSync('ed25519');
  const resolved = path.resolve(output);
  const relative = path.relative(root, resolved);
  if (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative)) throw new Error('Store the signing key outside this repository');
  fs.mkdirSync(path.dirname(resolved), { recursive: true });
  fs.writeFileSync(resolved, privateKey.export({ format: 'pem', type: 'pkcs8' }), { flag: 'wx', mode: 0o600 });
  return { keyPath: resolved, publisherId: hash(Buffer.from(publicKey.export({ format: 'jwk' }).x, 'base64url')) };
}

export function packagePlugin({ input, key, output }) {
  const directory = fs.realpathSync(input);
  const keyPath = fs.realpathSync(key);
  const keyRelative = path.relative(directory, keyPath);
  if (!keyRelative.startsWith(`..${path.sep}`) && keyRelative !== '..' && !path.isAbsolute(keyRelative)) throw new Error('Signing key must be outside the plugin directory');
  const template = JSON.parse(fs.readFileSync(path.join(directory, 'manifest.json'), 'utf8'));
  if (template.schemaVersion !== 2 || template.runtime !== 'web' || template.sdkVersion !== 1) throw new Error('Expected a schemaVersion 2 web plugin with SDK 1');
  if (template.id !== 'bspeng922.block-breeze' || !/^\d+\.\d+\.\d+$/.test(template.version)) throw new Error('Invalid plugin ID or version');
  if (template.capabilities?.length !== 0) throw new Error('Block Breeze must not request business data permissions');
  const files = Object.create(null), inventory = Object.create(null);
  // A fixed allowlist keeps tests, documentation, source-control data and keys out.
  for (const asset of assets) {
    const absolute = path.join(directory, asset);
    if (!fs.lstatSync(absolute).isFile() || fs.lstatSync(absolute).isSymbolicLink()) throw new Error(`Expected a regular asset: ${asset}`);
    const bytes = fs.readFileSync(absolute);
    if (bytes.length > 5 * 1024 * 1024) throw new Error(`Asset too large: ${asset}`);
    files[asset] = bytes;
    inventory[asset] = hash(bytes);
  }
  if (!Object.hasOwn(inventory, template.entry)) throw new Error('Missing HTML entry');
  const manifest = Buffer.from(JSON.stringify({ ...template, files: inventory }));
  const privateKey = createPrivateKey(fs.readFileSync(keyPath));
  if (privateKey.asymmetricKeyType !== 'ed25519') throw new Error('An Ed25519 key is required');
  const publicKey = Buffer.from(createPublicKey(privateKey).export({ format: 'jwk' }).x, 'base64url');
  files['manifest.json'] = manifest;
  files['signature.json'] = Buffer.from(JSON.stringify({ publicKey: publicKey.toString('base64'), signature: sign(null, Buffer.concat([context, manifest]), privateKey).toString('base64') }));
  const archive = zipSync(files, { level: 6, mtime: new Date(1980, 0, 1), os: 3, attrs: (0o100644 << 16) >>> 0 });
  fs.writeFileSync(output, archive, { flag: 'wx' });
  return { publisherId: hash(publicKey), id: template.id, version: template.version, sha256: hash(archive), sizeBytes: archive.length };
}

export function verifyPackage(input) {
  const bytes = fs.readFileSync(input);
  if (bytes.length > 100 * 1024 * 1024) throw new Error('Package exceeds 100 MiB');
  const files = unzipSync(bytes);
  const manifestBytes = files['manifest.json'];
  const signed = Object.hasOwn(files, 'signature.json');
  let publisherId = 'unsigned';
  if (signed) {
    const signature = JSON.parse(Buffer.from(files['signature.json']).toString('utf8'));
    const publicBytes = Buffer.from(signature.publicKey, 'base64');
    const publicKey = createPublicKey({ key: { kty: 'OKP', crv: 'Ed25519', x: publicBytes.toString('base64url') }, format: 'jwk' });
    if (!verify(null, Buffer.concat([context, manifestBytes]), publicKey, Buffer.from(signature.signature, 'base64'))) throw new Error('Invalid package signature');
    publisherId = hash(publicBytes);
  }
  const manifest = JSON.parse(Buffer.from(manifestBytes).toString('utf8'));
  if (manifest.schemaVersion !== 2 || manifest.runtime !== 'web' || manifest.sdkVersion !== 1) throw new Error('Incompatible manifest');
  for (const [name, digest] of Object.entries(manifest.files)) {
    if (!files[name] || hash(files[name]) !== digest) throw new Error(`Invalid resource: ${name}`);
  }
  if (Object.keys(files).length !== Object.keys(manifest.files).length + (signed ? 2 : 1)) throw new Error('Unexpected files in package');
  return { publisherId, signed, id: manifest.id, version: manifest.version, sha256: hash(bytes), sizeBytes: bytes.length };
}

export function packageUnsigned({ input, output }) {
  const manifest = JSON.parse(fs.readFileSync(path.join(input, 'manifest.json'), 'utf8'));
  const files = Object.create(null);
  manifest.files = {};
  for (const asset of assets) { files[asset] = fs.readFileSync(path.join(input, asset)); manifest.files[asset] = hash(files[asset]); }
  files['manifest.json'] = Buffer.from(JSON.stringify(manifest));
  const archive = zipSync(files, { level: 6, mtime: new Date(1980, 0, 1), os: 3, attrs: (0o100644 << 16) >>> 0 });
  fs.writeFileSync(output, archive, { flag: 'wx' });
  return verifyPackage(output);
}

function cli() {
  const [command, ...args] = process.argv.slice(2);
  const options = {};
  for (let index = 0; index < args.length; index += 2) {
    if (!args[index].startsWith('--') || !args[index + 1]) throw new Error('Expected --option value');
    options[args[index].slice(2)] = args[index + 1];
  }
  if (command === 'keygen' && options.out) return generateKey(options.out);
  if (command === 'verify' && options.input) return verifyPackage(options.input);
  if (command === 'unsigned') {
    const input = build();
    const version = JSON.parse(fs.readFileSync(path.join(input, 'manifest.json'), 'utf8')).version;
    const output = path.resolve(options.out ?? path.join(root, 'release'));
    fs.mkdirSync(output, { recursive: true });
    if (fs.existsSync(path.join(output, 'SHA256SUMS.txt'))) throw new Error('Release exists; use a fresh --out directory');
    const filename = `block-breeze-${version}-unsigned.zip`;
    const metadata = packageUnsigned({ input, output: path.join(output, filename) });
    fs.writeFileSync(path.join(output, 'SHA256SUMS.txt'), `${metadata.sha256}  ${filename}\n`);
    const repository = process.env.GITHUB_REPOSITORY ?? 'bspeng922/lanmind-plugin-block-breeze';
    fs.writeFileSync(path.join(output, 'plugin-release.json'), `${JSON.stringify({ schemaVersion: 1, ...metadata, minHostVersion: '0.2.1', zipUrl: `https://github.com/${repository}/releases/download/v${version}/${filename}` }, null, 2)}\n`);
    return { ...metadata, output };
  }
  if (command === 'pack' && options.key) {
    const input = build();
    const version = JSON.parse(fs.readFileSync(path.join(input, 'manifest.json'), 'utf8')).version;
    const output = path.resolve(options.out ?? path.join(root, 'release'));
    fs.mkdirSync(output, { recursive: true });
    const filename = `block-breeze-${version}`;
    const lmpk = path.join(output, `${filename}.lmpk`), zip = path.join(output, `${filename}.zip`);
    // A version is immutable. A rerun must use an empty output directory.
    if (['.lmpk', '.zip'].some(extension => fs.existsSync(path.join(output, filename + extension)))) throw new Error('Release exists; use a new version or a fresh --out directory');
    const metadata = packagePlugin({ input, key: options.key, output: lmpk });
    fs.copyFileSync(lmpk, zip, fs.constants.COPYFILE_EXCL);
    verifyPackage(lmpk);
    fs.writeFileSync(path.join(output, 'SHA256SUMS.txt'), `${metadata.sha256}  ${filename}.lmpk\n${metadata.sha256}  ${filename}.zip\n`);
    const repository = process.env.GITHUB_REPOSITORY ?? 'bspeng922/lanmind-plugin-block-breeze';
    const downloadBase = `https://github.com/${repository}/releases/download/v${version}`;
    fs.writeFileSync(path.join(output, 'plugin-release.json'), `${JSON.stringify({ schemaVersion: 1, ...metadata, minHostVersion: '0.2.1', downloadUrl: `${downloadBase}/${filename}.lmpk`, zipUrl: `${downloadBase}/${filename}.zip` }, null, 2)}\n`);
    return { ...metadata, output };
  }
  throw new Error('Usage:\n npm run keygen -- --out <path-outside-repository>\n npm run package -- --key <publisher.pem> [--out <release-directory>]\n npm run verify -- --input <package.lmpk-or.zip>');
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { console.log(JSON.stringify(cli(), null, 2)); }
  catch (error) { console.error(error.message); process.exitCode = 1; }
}
