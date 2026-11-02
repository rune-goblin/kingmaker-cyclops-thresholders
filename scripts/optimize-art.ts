// Encode new art under assets/ as lossy WebP at quality 80. Usage: npm run optimize-art
// Lossy WebP is skipped, so reruns never stack compression loss on art already shipped.
import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync, renameSync, rmSync, statSync } from 'node:fs';
import { extname, join, relative } from 'node:path';

const ASSETS = join(process.cwd(), 'assets');
const RASTER = new Set(['.png', '.jpg', '.jpeg']);

try {
  execFileSync('cwebp', ['-version'], { stdio: 'ignore' });
} catch {
  console.error('cwebp not found — install libwebp (`brew install webp`).');
  process.exit(1);
}

function isLosslessWebp(file: string): boolean {
  const buf = readFileSync(file);
  for (let at = 12; at + 8 <= buf.length; ) {
    const fourcc = buf.toString('ascii', at, at + 4);
    if (fourcc === 'VP8L') return true;
    if (fourcc === 'VP8 ') return false;
    const size = buf.readUInt32LE(at + 4);
    at += 8 + size + (size & 1);
  }
  return false;
}

function* walk(dir: string): Generator<string> {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) yield* walk(path);
    else yield path;
  }
}

const kb = (bytes: number) => `${Math.round(bytes / 1024)}K`;
let encoded = 0;
const renamed: string[] = [];

for (const file of walk(ASSETS)) {
  const ext = extname(file).toLowerCase();
  const raster = RASTER.has(ext);
  if (!raster && !(ext === '.webp' && isLosslessWebp(file))) continue;

  const out = raster ? file.slice(0, -ext.length) + '.webp' : file;
  const before = statSync(file).size;
  const tmp = `${out}.tmp`;
  execFileSync('cwebp', ['-quiet', '-q', '80', '-m', '6', '-metadata', 'none', file, '-o', tmp]);
  renameSync(tmp, out);
  if (raster) {
    rmSync(file);
    renamed.push(relative(process.cwd(), out));
  }
  console.log(`${relative(process.cwd(), file)}  ${kb(before)} -> ${kb(statSync(out).size)}`);
  encoded++;
}

console.log(encoded ? `Encoded ${encoded} file(s).` : 'All art is already lossy WebP.');
if (renamed.length) console.log('Update references to the renamed files:\n  ' + renamed.join('\n  '));
