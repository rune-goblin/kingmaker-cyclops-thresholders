// Build test/foundry-data/ — an isolated Foundry data path for the Playwright e2e harness,
// so driving a headless Foundry never touches the user's normal install. Idempotent; safe to
// re-run on every boot (start-test-env.sh does exactly that).
//
// systems/modules/worlds are CLONED, not symlinked. A running Foundry takes an exclusive
// LevelDB lock on every world db AND every compendium pack it can see — well over a hundred
// once a system and a few content modules are installed. Two instances sharing those
// directories cannot both boot, so symlinking them means you cannot run your own Foundry while
// the suite runs. On APFS (and btrfs/xfs) the clones are copy-on-write: gigabytes mirror in
// seconds for almost no disk.
//
// The module under test keeps its live symlinks (dist/lang/module.json/assets → repo) so Vite
// output is still picked up; only `packs` is de-symlinked, since that is the one entry the
// test instance would otherwise lock out from under `npm run build`.
import {
  existsSync, mkdirSync, copyFileSync, writeFileSync, unlinkSync, lstatSync, rmSync,
  readFileSync, readdirSync, readlinkSync, renameSync,
} from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, dirname, resolve } from 'node:path';
import { homedir } from 'node:os';

const repo = process.cwd();
const TEST_DATA = join(repo, 'test', 'foundry-data');
const PORT = Number(process.env.TEST_FOUNDRY_PORT ?? 30005);
const TEST_WORLD = process.env.TEST_WORLD ?? 'pf2e-test';
const RESET_WORLD = process.argv.includes('--reset-world');

function readDevPaths(): { foundryData?: string } {
  const p = join(repo, '.dev-paths.json');
  if (!existsSync(p)) return {};
  try {
    return JSON.parse(readFileSync(p, 'utf8')) as { foundryData?: string };
  } catch {
    return {};
  }
}

// The real Foundry Data dir (holds systems/, modules/, worlds/). Mirrors npm run setup's
// detection so both resolve the same place without re-prompting.
function resolveFoundryData(): string {
  const candidates = [
    process.env.FOUNDRY_DATA,
    readDevPaths().foundryData,
    join(homedir(), 'Library', 'Application Support', 'FoundryVTT-v14', 'Data'),
    join(homedir(), 'Library', 'Application Support', 'FoundryVTT', 'Data'),
    join(homedir(), 'FoundryVTT', 'Data'),
  ].filter((p): p is string => Boolean(p));

  const found = candidates.find((p) => existsSync(p));
  if (!found) {
    console.error('❌ Could not find a Foundry Data dir to mirror.');
    console.error('   Set FOUNDRY_DATA or run `npm run setup` to cache it in .dev-paths.json. Looked in:');
    for (const p of candidates) console.error(`     - ${p}`);
    process.exit(1);
  }
  return found;
}

// Copy-on-write where the filesystem supports it. `cp -R` keeps symlinks as symlinks on every
// platform here, which the packs fixup below relies on.
function cloneArgs(): string[] {
  if (process.platform === 'darwin') return ['-c', '-R', '-p'];
  if (process.platform === 'linux') return ['--reflink=auto', '-R', '-p'];
  return ['-R', '-p'];
}

// A recursive delete must never follow a link out of the isolated tree — earlier layouts
// symlinked these very paths at the user's real systems/ and modules/.
function removePath(p: string): void {
  const st = lstatSync(p, { throwIfNoEntry: false });
  if (!st) return;
  if (st.isSymbolicLink()) unlinkSync(p);
  else rmSync(p, { recursive: true, force: true });
}

// Stage into a sibling then swap, so an interrupted clone can't leave a half-populated tree
// that later boots would treat as complete.
function cloneTree(src: string, dest: string): void {
  const staging = `${dest}.staging`;
  removePath(staging);
  try {
    execFileSync('cp', [...cloneArgs(), src, staging], { stdio: 'pipe' });
  } catch {
    // A CoW-capable filesystem is an optimisation, not a requirement.
    execFileSync('cp', ['-R', '-p', src, staging], { stdio: 'pipe' });
  }
  removePath(dest);
  renameSync(staging, dest);
}

function humanSize(dir: string): string {
  try {
    return execFileSync('du', ['-sh', dir], { encoding: 'utf8' }).split('\t')[0]?.trim() ?? '?';
  } catch {
    return '?';
  }
}

// Dev scaffolds (this module, and any sibling module you develop the same way) symlink `packs`
// back to their repo's built LevelDB. Left alone, the test instance locks the repo's packs —
// blocking `npm run build` and colliding with the developer's own Foundry. Everything else
// stays linked and live, so a Vite build reaches the harness with no re-clone.
function declinkModulePacks(modulesDir: string): void {
  for (const entry of readdirSync(modulesDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const packs = join(modulesDir, entry.name, 'packs');
    const st = lstatSync(packs, { throwIfNoEntry: false });
    if (!st?.isSymbolicLink()) continue;

    const target = resolve(dirname(packs), readlinkSync(packs));
    unlinkSync(packs);
    if (!existsSync(target)) {
      console.log(`   ✂️  ${entry.name}/packs — dangling link dropped (repo not built?)`);
      continue;
    }
    cloneTree(target, packs);
    console.log(`   📦 ${entry.name}/packs cloned (was → ${target})`);
  }
}

const foundryData = resolveFoundryData();
const configSource = join(dirname(foundryData), 'Config');

console.log(`📁 Data source:   ${foundryData}`);
console.log(`📁 Config source: ${configSource}\n`);

const configDir = join(TEST_DATA, 'Config');
const dataDir = join(TEST_DATA, 'Data');
mkdirSync(configDir, { recursive: true });
mkdirSync(join(dataDir, 'assets'), { recursive: true });
mkdirSync(join(TEST_DATA, 'Logs'), { recursive: true });

const licenseSrc = join(configSource, 'license.json');
if (existsSync(licenseSrc)) {
  copyFileSync(licenseSrc, join(configDir, 'license.json'));
  console.log('📋 copied license.json');
} else {
  console.warn(`⚠️  license.json not found at ${licenseSrc} — the test instance won't boot without it.`);
}
// A lingering admin.txt would reinstate an admin password we can't recover the plaintext for.
const adminTxt = join(configDir, 'admin.txt');
if (existsSync(adminTxt)) unlinkSync(adminTxt);

const options = {
  dataPath: `${TEST_DATA}/`,
  port: PORT,
  upnp: false,
  hostname: null,
  routePrefix: null,
  sslCert: null,
  sslKey: null,
  proxyPort: null,
  proxySSL: false,
  updateChannel: 'stable',
  language: 'en.core',
  world: null,
  telemetry: false,
};
writeFileSync(join(configDir, 'options.json'), `${JSON.stringify(options, null, 2)}\n`);
console.log(`✅ wrote Config/options.json (port ${PORT}, upnp off)`);

// Refreshed every run: a stale clone would silently test against an old system or an old build
// of a sibling module. Cheap enough (CoW) that "always" beats any staleness heuristic.
for (const name of ['systems', 'modules'] as const) {
  const src = join(foundryData, name);
  const dest = join(dataDir, name);
  const started = process.hrtime.bigint();
  cloneTree(src, dest);
  const secs = Number(process.hrtime.bigint() - started) / 1e9;
  console.log(`🧬 cloned ${name} (${humanSize(dest)}) in ${secs.toFixed(1)}s`);
}
declinkModulePacks(join(dataDir, 'modules'));

// Not refreshed: the world accumulates harness state (whatever global-setup and the specs leave
// behind). Re-cloning each run would throw that away. `--reset-world` when a clean slate is
// actually wanted.
const worldsDir = join(dataDir, 'worlds');
const worldsSt = lstatSync(worldsDir, { throwIfNoEntry: false });
if (worldsSt?.isSymbolicLink()) unlinkSync(worldsDir); // migrate from the old symlinked layout
mkdirSync(worldsDir, { recursive: true });

const worldDest = join(worldsDir, TEST_WORLD);
if (RESET_WORLD) removePath(worldDest);

if (existsSync(worldDest)) {
  console.log(`🌍 world "${TEST_WORLD}" already cloned — left as is (--reset-world to refresh)`);
} else {
  const worldSrc = join(foundryData, 'worlds', TEST_WORLD);
  if (!existsSync(worldSrc)) {
    const available = readdirSync(join(foundryData, 'worlds'))
      .filter((n) => existsSync(join(foundryData, 'worlds', n, 'world.json')));
    console.error(`❌ World "${TEST_WORLD}" not found at ${worldSrc}`);
    console.error(`   Set TEST_WORLD to one of: ${available.join(', ') || '(none installed)'}`);
    console.error('   (TEST_WORLD also has a default in playwright.config.ts — update it there too.)');
    process.exit(1);
  }
  cloneTree(worldSrc, worldDest);
  console.log(`🌍 cloned world "${TEST_WORLD}" (${humanSize(worldDest)}) — independent of the original`);
}

console.log('\n✨ Test data path ready at test/foundry-data (no shared LevelDBs — run your own Foundry freely)');
console.log('   Boot it with:  npm run test:foundry            (auto-launches TEST_WORLD)');
console.log('   Run e2e with:  npm run test:e2e');
