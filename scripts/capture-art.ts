// Copy the art pins' positions from a world back into src/art-placements.json, so the next build
// pins them where the GM left them. Usage: npm run capture-art -- <world-id>
import { cpSync, existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { extractPack } from '@foundryvtt/foundryvtt-cli';
import { detectFoundryData } from './foundry-data.ts';

interface Placement {
  page: string;
  scene: string;
  x: number;
  y: number;
  iconSize: number;
  icon: string;
}

interface Scene {
  _id: string;
  name: string;
  notes: { entryId: string; pageId: string; x: number; y: number; iconSize: number }[];
}

const world = process.argv[2];
if (!world) {
  console.error('Usage: npm run capture-art -- <world-id>');
  process.exit(1);
}
const data = detectFoundryData();
const scenesDb = data && join(data, 'worlds', world, 'data', 'scenes');
if (!scenesDb || !existsSync(scenesDb)) {
  console.error(`No scenes database for world "${world}" under ${data ?? 'the Foundry data folder'}.`);
  process.exit(1);
}

const journalDir = join('packs', '_source', 'journal');
const journalId = (JSON.parse(readFileSync(join(journalDir, readdirSync(journalDir)[0]), 'utf8')) as { _id: string })._id;
const placementsPath = join('src', 'art-placements.json');
const placements = JSON.parse(readFileSync(placementsPath, 'utf8')) as Placement[];

const tmp = mkdtempSync(join(tmpdir(), 'capture-art-'));
try {
  // A running Foundry holds a LevelDB lock on the world, so read a copy.
  const copy = join(tmp, 'scenes');
  cpSync(scenesDb, copy, { recursive: true });
  rmSync(join(copy, 'LOCK'), { force: true });
  const scenes: Scene[] = [];
  await extractPack(copy, join(tmp, 'out'), {
    documentType: 'Scene',
    transformEntry: (doc: Scene) => {
      scenes.push(doc);
      return false;
    },
  });

  const moved: string[] = [];
  for (const scene of scenes) {
    for (const note of scene.notes.filter((n) => n.entryId === journalId)) {
      const placement = placements.find((p) => p.page === note.pageId);
      if (!placement) continue;
      Object.assign(placement, {
        scene: scene._id,
        x: Math.round(note.x),
        y: Math.round(note.y),
        iconSize: note.iconSize,
      });
      moved.push(`${scene.name}: ${note.pageId} → (${placement.x}, ${placement.y})`);
    }
  }
  writeFileSync(placementsPath, `${JSON.stringify(placements, null, 2)}\n`);
  console.log(moved.length ? moved.join('\n') : `No art pins found in "${world}".`);
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
