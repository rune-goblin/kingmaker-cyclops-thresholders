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
  sort?: number;
  system?: { location?: unknown; [key: string]: unknown };
  _stats?: { compendiumSource?: string | null; [key: string]: unknown };
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

// Kingmaker imports its Adventure with keepId, so world actors share the bestiary id. The other
// matches catch copies a GM imported by hand from the bestiary or this module, or duplicated.
function findWorldActors(source: ActorSource): Actor[] {
  const replaces = source.flags[MODULE_ID]?.replaces;
  const origins = [replaces, `Compendium.${ACTOR_PACK}.Actor.${source._id}`];
  return game.actors.filter(
    (a) =>
      a.id === source._id ||
      origins.includes((a as unknown as { _stats: { compendiumSource?: string } })._stats.compendiumSource) ||
      a.getFlag(MODULE_ID, 'replaces') === replaces,
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

function isSpell(item: ItemSource): boolean {
  return item.type === 'spell';
}

// Takes each spell from the pf2e compendium on this server, so actors get its exact original
// rather than whatever copy the module shipped. Only the actor's slot and rank are kept.
async function withOriginalSpells(source: ActorSource): Promise<ActorSource> {
  const items = await Promise.all(
    source.items.map(async (item) => {
      const uuid = item._stats?.compendiumSource;
      if (!isSpell(item) || !uuid) return item;
      const original = (await fromUuid(uuid)) as { toObject(): ItemSource } | null;
      if (!original) return item;
      const data = original.toObject();
      return {
        ...data,
        _id: item._id,
        sort: item.sort,
        folder: null,
        system: { ...data.system, location: item.system?.location },
        _stats: { ...data._stats, compendiumSource: uuid },
      };
    }),
  );
  return { ...source, items };
}

async function syncSpells(actor: Actor, source: ActorSource): Promise<number> {
  const updates = source.items.filter((i) => isSpell(i) && actor.items.has(i._id));
  if (!updates.length) return 0;
  await actor.updateEmbeddedDocuments('Item', updates, REPLACE_WHOLE);
  return updates.length;
}

// A second run keeps the GM's other edits, so it touches only art, token size, HP, and the spells.
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
 * already replaced keep their data and only get fresh art, token size, full HP, and original spells.
 */
export async function replaceActors(only?: string[]): Promise<ReplaceResult> {
  const pack = game.packs.get(ACTOR_PACK);
  if (!pack) throw new Error(`${ACTOR_PACK} missing`);
  const sources = (await pack.getDocuments())
    .map((d) => d.toObject() as unknown as ActorSource)
    .filter((s) => !only || only.includes(s._id));

  const result: ReplaceResult = { replaced: 0, refreshed: 0, tokens: 0, spells: 0 };
  const handled = new Map<string, ActorSource>();
  for (const found of sources) {
    const actors = findWorldActors(found);
    if (!actors.length) continue;
    const source = await withOriginalSpells(found);
    for (const actor of actors) {
      if (actor.getFlag(MODULE_ID, 'replaces')) {
        result.spells += await refresh(actor, source);
        result.refreshed++;
      } else {
        await replace(actor, source);
        result.replaced++;
      }
      handled.set(actor.id!, source);
    }
  }

  for (const scene of game.scenes) {
    const tokens = scene.tokens.filter((t) => !t.actorLink && !!t.actorId && handled.has(t.actorId));
    // An unlinked token's own copy of a spell would hide the actor's fresh one.
    for (const token of tokens) {
      const spells = handled.get(token.actorId!)!.items.filter((i) => isSpell(i) && token.delta?.items.has(i._id));
      if (!spells.length || !token.actor) continue;
      await (token.actor as unknown as Actor).updateEmbeddedDocuments('Item', spells, REPLACE_WHOLE);
      result.spells += spells.length;
    }
    const updates = tokens.map((t) => tokenUpdate(t, handled.get(t.actorId!)!)).filter((u) => u !== null);
    if (!updates.length) continue;
    await scene.updateEmbeddedDocuments('Token', updates);
    result.tokens += updates.length;
  }

  return result;
}
