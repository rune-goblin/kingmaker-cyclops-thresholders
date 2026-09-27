import { MODULE_ID } from './constants';

const ACTOR_PACK = `${MODULE_ID}.actors`;

export interface ReplaceResult {
  replaced: number;
  refreshed: number;
  tokens: number;
  spells: number;
}

interface ItemSource {
  _id: string;
  type?: string;
  system?: { publication?: { remaster?: boolean } };
  [key: string]: unknown;
}

interface ActorSource {
  _id: string;
  img: string;
  items: ItemSource[];
  prototypeToken: { width: number; height: number; texture: { src: string } };
  system: { attributes: { hp: { max: number } } };
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

export const THRESHOLDER_IDS = ['z1Hk6z6RU4sF9aJU', '3kyS4KzEmG8Eyl4N', 'htHgsx1COWOfhE3D'];
export const FORAS_ID = '2mkfF43tP8IGVfBz';

// Foundry's types don't include pf2e's creature update options.
const ALLOW_HP_OVERAGE = { allowHPOverage: true } as unknown as Parameters<Actor['update']>[1];

// A recursive merge would leave legacy keys (old damage partials, heightening) on a remastered item.
const REPLACE_WHOLE = { recursive: false } as unknown as Parameters<Actor['updateEmbeddedDocuments']>[2];

function maxHp(doc: { system?: unknown } | null | undefined): number | undefined {
  return (doc?.system as { attributes?: { hp?: { max?: number } } } | undefined)?.attributes?.hp?.max;
}

function currentHp(doc: { system?: unknown } | null | undefined): number | undefined {
  return (doc?.system as { attributes?: { hp?: { value?: number } } } | undefined)?.attributes?.hp?.value;
}

async function replace(actor: Actor, source: ActorSource): Promise<void> {
  const { _id, items, folder, sort, ownership, _stats, ...data } = source;
  // pf2e clamps current HP to the max from before the update, which would hold it at the old maximum.
  await actor.update(data, ALLOW_HP_OVERAGE);
  const existing = new Set(actor.items.map((i) => i.id));
  await actor.updateEmbeddedDocuments('Item', items.filter((i) => existing.has(i._id)), REPLACE_WHOLE);
  await actor.createEmbeddedDocuments('Item', items.filter((i) => !existing.has(i._id)), { keepId: true });
}

function isRemaster(item: { system?: unknown } | undefined): boolean {
  return !!(item?.system as ItemSource['system'])?.publication?.remaster;
}

// Only a legacy world spell is swapped, so spells the GM already remastered or edited survive.
async function syncSpells(actor: Actor, source: ActorSource): Promise<number> {
  const updates = source.items.filter((i) => {
    if (i.type !== 'spell' || !isRemaster(i)) return false;
    const current = actor.items.get(i._id);
    return !!current && !isRemaster(current);
  });
  if (!updates.length) return 0;
  await actor.updateEmbeddedDocuments('Item', updates, REPLACE_WHOLE);
  return updates.length;
}

// A second run must not wipe GM edits made since the first, so it touches only art, token size, HP,
// and spells still on legacy data.
async function refresh(actor: Actor, source: ActorSource): Promise<number> {
  const { img, prototypeToken: proto, system } = source;
  await actor.update({
    img,
    'prototypeToken.width': proto.width,
    'prototypeToken.height': proto.height,
    'prototypeToken.texture.src': proto.texture.src,
    // The derived max includes any Elite/Weak adjustment the GM applied since the first run.
    'system.attributes.hp.value': maxHp(actor) ?? system.attributes.hp.max,
  });
  return syncSpells(actor, source);
}

type TokenUpdate = { _id: string } & Record<string, unknown>;

function tokenUpdate(token: TokenDocument, source: ActorSource): TokenUpdate | null {
  const { prototypeToken: proto, system } = source;
  const max = maxHp(token.actor) ?? system.attributes.hp.max;
  const current =
    token.width === proto.width &&
    token.height === proto.height &&
    token.texture.src === proto.texture.src &&
    currentHp(token.actor) === max;
  if (current) return null;
  // An unlinked token keeps its own HP in its delta, which would otherwise mask the new maximum.
  return {
    _id: token.id!,
    width: proto.width,
    height: proto.height,
    'texture.src': proto.texture.src,
    'delta.system.attributes.hp.value': max,
  };
}

/**
 * Turn the chosen Kingmaker actors into their cyclops versions, in place. Safe to re-run: actors
 * already replaced keep their data and only get fresh art, token size, full HP, and remastered spells.
 */
export async function replaceActors(only?: string[]): Promise<ReplaceResult> {
  const pack = game.packs.get(ACTOR_PACK);
  if (!pack) throw new Error(`${ACTOR_PACK} missing`);
  const sources = (await pack.getDocuments())
    .map((d) => d.toObject() as unknown as ActorSource)
    .filter((s) => !only || only.includes(s._id));

  const result: ReplaceResult = { replaced: 0, refreshed: 0, tokens: 0, spells: 0 };
  const handled = new Map<string, ActorSource>();
  for (const source of sources) {
    const actor = findWorldActor(source);
    if (!actor) continue;
    if (actor.getFlag(MODULE_ID, 'replaces')) {
      result.spells += await refresh(actor, source);
      result.refreshed++;
    } else {
      await replace(actor, source);
      result.replaced++;
    }
    handled.set(actor.id!, source);
  }

  for (const scene of game.scenes) {
    const updates = scene.tokens
      .filter((t) => !t.actorLink && !!t.actorId && handled.has(t.actorId))
      .map((t) => tokenUpdate(t, handled.get(t.actorId!)!))
      .filter((u) => u !== null);
    if (!updates.length) continue;
    await scene.updateEmbeddedDocuments('Token', updates);
    result.tokens += updates.length;
  }

  return result;
}
