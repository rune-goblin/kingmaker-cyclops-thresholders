// Replace every pf2e spell embedded in the actor sources with the unmodified original from the
// installed pf2e system, keeping only the actor's own placement: item id, sort, spellcasting slot.
// Copy spells this way, never from the pf2e source repo: its links name their target, and only
// pf2e's build turns those into the ids Foundry resolves, so raw copies render "Unknown" links.
// Run with `npm run sync-spells` after adding or swapping a spell, then `npm run build`.
import { cpSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { extractPack } from '@foundryvtt/foundryvtt-cli';
import { detectFoundryData } from './foundry-data.ts';

type Doc = Record<string, unknown>;
interface Item extends Doc {
  _id: string;
  name: string;
  type: string;
  system: Doc;
  _stats?: { compendiumSource?: string | null };
}

const ACTORS = join(process.cwd(), 'packs', '_source', 'actors');
const SPELL_UUID = /^Compendium\.pf2e\.spells-srd\.Item\.([A-Za-z0-9]{16})$/;

const foundryData = detectFoundryData();
if (!foundryData) {
  console.error('No Foundry data dir found — run `npm run setup`, set FOUNDRY_DATA, or create .dev-paths.json.');
  process.exit(1);
}

const originals = new Map<string, Item>();
const tmp = mkdtempSync(join(tmpdir(), 'sync-spells-'));
try {
  // A running Foundry holds a LevelDB lock on the system's packs, so read a copy.
  const copy = join(tmp, 'spells');
  cpSync(join(foundryData, 'systems', 'pf2e', 'packs', 'spells'), copy, { recursive: true });
  rmSync(join(copy, 'LOCK'), { force: true });
  await extractPack(copy, join(tmp, 'out'), {
    transformEntry: (doc: Item) => {
      originals.set(doc._id, doc);
      return false;
    },
  });
} finally {
  rmSync(tmp, { recursive: true, force: true });
}

// Keeps the existing key order so the diff shows only changed values.
function orderedLike<T extends Doc>(next: T, existing: Doc): T {
  const keys = new Set([...Object.keys(existing), ...Object.keys(next)]);
  return Object.fromEntries([...keys].filter((k) => k in next).map((k) => [k, next[k]])) as T;
}

let synced = 0;
const missing: string[] = [];
for (const file of readdirSync(ACTORS).filter((f) => f.endsWith('.json'))) {
  const path = join(ACTORS, file);
  const actor = JSON.parse(readFileSync(path, 'utf8')) as { items: Item[] };
  actor.items = actor.items.map((item) => {
    const id = item.type === 'spell' ? SPELL_UUID.exec(item._stats?.compendiumSource ?? '')?.[1] : undefined;
    if (!id) return item;
    const original = originals.get(id);
    if (!original) {
      missing.push(`${file}: ${item.name} (${item._stats?.compendiumSource})`);
      return item;
    }
    synced++;
    const { folder: _folder, _key: _unusedKey, ...spell } = structuredClone(original);
    const system = orderedLike({ ...spell.system, location: item.system.location }, item.system);
    return orderedLike({ ...spell, system, _id: item._id, _key: item._key, sort: item.sort }, item);
  });
  writeFileSync(path, `${JSON.stringify(actor, null, 2)}\n`);
}

console.log(`Synced ${synced} spells from pf2e ${foundryData}.`);
if (missing.length) {
  console.error(`No pf2e original for:\n  ${missing.join('\n  ')}`);
  process.exit(1);
}
