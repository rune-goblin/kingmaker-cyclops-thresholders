import { MODULE_ID } from './constants';
import placements from './art-placements.json';
import { swapCreatures } from './swaps';

const JOURNAL_PACK = `${MODULE_ID}.journal`;
export const ART_JOURNAL_ID = '7GQ5pIphx6GyLjbj';

const ASSETS = `modules/${MODULE_ID}/assets`;

export interface Placement {
  page: string;
  scene: string;
  x: number;
  y: number;
  iconSize: number;
  icon: string;
}

// Kingmaker imports its bestiary with keepId, so its actors match by the id at the end of the
// source. The Leng spiders come from the pf2e bestiary, which a GM imports under a new id.
export const ACTOR_ART: { sources: string[]; img: string; token: string }[] = [
  {
    sources: ['Compendium.pf2e.kingmaker-bestiary.Actor.bwEYizrdHs8lmvxE'],
    img: `${ASSETS}/images/leng-envoy.webp`,
    token: `${ASSETS}/tokens/leng-envoy.webp`,
  },
  {
    sources: ['Compendium.pf2e.kingmaker-bestiary.Actor.sw32QdZlsWnmWaVY'],
    img: `${ASSETS}/images/mastiff-of-tindalos.webp`,
    token: `${ASSETS}/tokens/mastiff-of-tindalos.webp`,
  },
  {
    sources: ['Compendium.pf2e.kingmaker-bestiary.Actor.pT5hfxcsG7eV5oxh'],
    img: `${ASSETS}/tokens/niodrhast.webp`,
    token: `${ASSETS}/tokens/niodrhast.webp`,
  },
  {
    sources: ['Compendium.pf2e.pathfinder-bestiary-2.Actor.pxlZ8QbxMK6b3l5w'],
    img: `${ASSETS}/tokens/leng-spider.webp`,
    token: `${ASSETS}/tokens/leng-spider.webp`,
  },
];

export interface CandlemereResult {
  creatures: number;
  journal: boolean;
  notes: number;
  actors: number;
  tokens: number;
}

function compendiumSource(actor: Actor): string | undefined {
  return (actor as unknown as { _stats: { compendiumSource?: string | null } })._stats.compendiumSource ?? undefined;
}

function artFor(actor: Actor): (typeof ACTOR_ART)[number] | undefined {
  const source = compendiumSource(actor);
  return ACTOR_ART.find((art) => art.sources.some((s) => s === source || s.endsWith(`.${actor.id}`)));
}

async function importJournal(): Promise<boolean> {
  if (game.journal.get(ART_JOURNAL_ID)) return false;
  const pack = game.packs.get(JOURNAL_PACK);
  if (!pack) throw new Error(`${JOURNAL_PACK} missing`);
  await game.journal.importFromCompendium(pack as never, ART_JOURNAL_ID, {}, { keepId: true });
  return true;
}

// Pins the GM already placed keep their position and size; only missing pins are added, and
// existing ones take the module's current icon.
async function pinPages(): Promise<number> {
  let created = 0;
  for (const scene of game.scenes) {
    const mine = (placements as Placement[]).filter((p) => p.scene === scene.id);
    if (!mine.length) continue;
    const pinned = scene.notes.filter((n) => n.entryId === ART_JOURNAL_ID);

    const icons = pinned
      .map((n) => ({ note: n, icon: mine.find((p) => p.page === n.pageId)?.icon }))
      .filter(({ note, icon }) => icon && note.texture.src !== icon)
      .map(({ note, icon }) => ({ _id: note.id!, 'texture.src': icon }));
    if (icons.length) await scene.updateEmbeddedDocuments('Note', icons);

    const pages = new Set(pinned.map((n) => n.pageId));
    const notes = mine
      .filter((p) => !pages.has(p.page))
      .map((p) => ({
        entryId: ART_JOURNAL_ID,
        pageId: p.page,
        x: p.x,
        y: p.y,
        iconSize: p.iconSize,
        texture: { src: p.icon },
      }));
    if (!notes.length) continue;
    await scene.createEmbeddedDocuments('Note', notes);
    created += notes.length;
  }
  return created;
}

// Art only: portraits and token images change, stats and adjustments never do.
async function applyArt(): Promise<{ actors: number; tokens: number }> {
  const art = new Map<string, string>();
  let actors = 0;
  for (const actor of game.actors) {
    const found = artFor(actor);
    if (!found) continue;
    art.set(actor.id!, found.token);
    if (actor.img === found.img && actor.prototypeToken.texture.src === found.token) continue;
    await actor.update({ img: found.img, 'prototypeToken.texture.src': found.token });
    actors++;
  }

  // Placed tokens keep their own texture, so the prototype change doesn't reach them.
  let tokens = 0;
  for (const scene of game.scenes) {
    const updates = scene.tokens
      .filter((t) => !!t.actorId && art.has(t.actorId) && t.texture.src !== art.get(t.actorId))
      .map((t) => ({ _id: t.id!, 'texture.src': art.get(t.actorId!)! }));
    if (!updates.length) continue;
    await scene.updateEmbeddedDocuments('Token', updates);
    tokens += updates.length;
  }
  return { actors, tokens };
}

/**
 * Put the module's creatures on the Candlemere Spiral, import the art journal, pin each image page
 * in its room, and give the Leng envoys, mastiffs, Niodrhast, and Leng spiders their new portraits and tokens.
 * Safe to re-run: moved pins stay where the GM left them.
 */
export async function setUpCandlemere(): Promise<CandlemereResult> {
  const creatures = await swapCreatures();
  const journal = await importJournal();
  const notes = await pinPages();
  return { creatures, journal, notes, ...(await applyArt()) };
}
