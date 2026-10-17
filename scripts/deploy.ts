// Build, then copy a clean, self-contained module into Foundry's modules/ — the same shape
// the release zip ships (module.json + dist + lang + packs + assets). Unlike `npm run
// setup`, which symlinks back to the repo for live editing, this leaves a real, link-free
// directory: assets and packs travel with it, so it works without the repo present. Run with
// `npm run deploy`. Override the target with FOUNDRY_DATA, else it reuses .dev-paths.json.
import {
  existsSync, lstatSync, unlinkSync, rmSync, mkdirSync, cpSync, copyFileSync,
} from 'node:fs';
import { join, basename, dirname } from 'node:path';
import { execFileSync } from 'node:child_process';
import { detectFoundryData } from './foundry-data.ts';

const repo = process.cwd();
const ID = 'kingmaker-cyclops-thresholders';

const foundryData = detectFoundryData();
if (!foundryData) {
  console.error('No Foundry data dir found — run `npm run setup`, set FOUNDRY_DATA, or create .dev-paths.json.');
  process.exit(1);
}

console.log('Building…');
execFileSync('npm', ['run', 'build'], { stdio: 'inherit', cwd: repo });

const dest = join(foundryData, 'modules', ID);
const existing = lstatSync(dest, { throwIfNoEntry: false });
if (existing?.isSymbolicLink()) {
  unlinkSync(dest); // a dev/whole-repo symlink → replace with a real copy
} else if (existing && !existing.isDirectory()) {
  console.error(`Refusing to deploy: ${dest} exists and is not a directory.`);
  process.exit(1);
}
mkdirSync(dest, { recursive: true });

// LevelDB lock/journal files and macOS cruft never belong in a deployed copy.
function keep(src: string): boolean {
  const name = basename(src);
  if (name === '.DS_Store' || name === 'LOCK' || name === 'LOG' || name === 'LOG.old') return false;
  return !name.endsWith('.log');
}

function copyDir(rel: string, filter: (src: string) => boolean = keep): void {
  const from = join(repo, rel);
  if (!existsSync(from)) {
    console.log(`skip ${rel}/ (not found)`);
    return;
  }
  const to = join(dest, rel);
  rmSync(to, { recursive: true, force: true });
  mkdirSync(dirname(to), { recursive: true });
  cpSync(from, to, { recursive: true, filter });
  console.log(`copied ${rel}/`);
}

for (const file of ['module.json', 'LICENSE', 'README.md']) {
  const from = join(repo, file);
  if (existsSync(from)) {
    copyFileSync(from, join(dest, file));
    console.log(`copied ${file}`);
  }
}
copyDir('dist');
copyDir('lang');
copyDir('packs', (src) => basename(src) !== '_source' && keep(src)); // built LevelDB only, not JSON sources
copyDir('assets'); // scenes reference modules/<id>/assets/… — keep that path valid

console.log(`\n✓ Deployed ${ID} → ${dest}`);
console.log('  Reload Foundry (or relaunch the world) to pick it up.');
