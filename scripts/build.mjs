import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const root = fileURLToPath(new URL('../', import.meta.url));
export const assets = ['index.html', 'styles.css', 'icon.svg', 'src/app.js', 'src/engine.js', 'src/i18n.js', 'src/storage.js'];
export function build() {
  const output = path.resolve(root, 'dist');
  // Delete only this project's explicit build directory, after checking the target.
  if (path.dirname(output) !== path.resolve(root) || path.basename(output) !== 'dist') throw new Error('Invalid build directory');
  fs.rmSync(output, { recursive: true, force: true });
  fs.mkdirSync(output, { recursive: true });
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json'), 'utf8'));
  const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  if (manifest.version !== pkg.version) throw new Error('package.json and manifest.json versions must match');
  fs.writeFileSync(path.join(output, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  for (const asset of assets) {
    const destination = path.join(output, asset);
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.copyFileSync(path.join(root, asset), destination);
  }
  return output;
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  console.log(`Built offline plugin: ${build()}`);
}
