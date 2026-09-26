import { MODULE_ID } from './constants';

const ACTOR_PACK = `${MODULE_ID}.actors`;

interface ReplaceResult {
  actors: number;
  tokens: number;
}

interface ActorSource {
  _id: string;
  items: { _id: string }[];
  prototypeToken: { width: number; height: number; texture: { src: string } };
  flags: Record<string, { replaces?: string }>;
  [key: string]: unknown;
}

// Kingmaker imports its Adventure with keepId, so world actors share the bestiary id; the
// compendiumSource fallback catches actors a GM re-imported from the bestiary by hand.
function findWorldActor(source: ActorSource): Actor | undefined {
  const replaces = source.flags[MODULE_ID]?.replaces;
  return (
    game.actors.get(source._id) ??
    game.actors.find((a) => (a as unknown as { _stats: { compendiumSource?: string } })._stats.compendiumSource === replaces)
  );
}

/** Overwrite the imported Kingmaker thresholders with the cyclops versions, in place. */
export async function replaceThresholders(): Promise<ReplaceResult> {
  const pack = game.packs.get(ACTOR_PACK);
  if (!pack) throw new Error(`${ACTOR_PACK} missing`);
  const sources = (await pack.getDocuments()).map((d) => d.toObject() as unknown as ActorSource);

  const replaced = new Map<string, ActorSource>();
  for (const source of sources) {
    const actor = findWorldActor(source);
    if (!actor) continue;
    const { _id, items, folder, sort, ownership, _stats, ...data } = source;
    await actor.update(data);
    const existing = new Set(actor.items.map((i) => i.id));
    await actor.updateEmbeddedDocuments('Item', items.filter((i) => existing.has(i._id)));
    await actor.createEmbeddedDocuments('Item', items.filter((i) => !existing.has(i._id)), { keepId: true });
    replaced.set(actor.id!, source);
  }

  let tokens = 0;
  for (const scene of game.scenes) {
    const updates = scene.tokens
      .filter((t) => !t.actorLink && !!t.actorId && replaced.has(t.actorId))
      .map((t) => {
        const proto = replaced.get(t.actorId!)!.prototypeToken;
        return { _id: t.id, width: proto.width, height: proto.height, 'texture.src': proto.texture.src };
      });
    if (!updates.length) continue;
    await scene.updateEmbeddedDocuments('Token', updates);
    tokens += updates.length;
  }

  return { actors: replaced.size, tokens };
}
