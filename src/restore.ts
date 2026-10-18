import { MODULE_ID } from './constants';

export interface RestoreResult {
  actors: number;
  tokens: number;
  spells: number;
}

interface SpellItem {
  id: string | null;
  type: string;
  sort: number;
  system: { location?: unknown };
  _stats: { compendiumSource?: string | null };
}

type ItemData = { system: Record<string, unknown>; _stats: Record<string, unknown> } & Record<string, unknown>;

// A recursive merge would leave keys from the old copy on the original.
const REPLACE_WHOLE = { recursive: false } as unknown as Parameters<Actor['updateEmbeddedDocuments']>[2];

async function restore(actor: Actor, items: Iterable<SpellItem>): Promise<number> {
  const updates: ItemData[] = [];
  for (const item of items) {
    const uuid = item._stats.compendiumSource;
    if (item.type !== 'spell' || !uuid?.startsWith('Compendium.pf2e.')) continue;
    const original = (await fromUuid(uuid)) as { toObject(): ItemData } | null;
    if (!original) continue;
    const data = original.toObject();
    updates.push({
      ...data,
      _id: item.id,
      sort: item.sort,
      folder: null,
      system: { ...data.system, location: item.system.location },
      _stats: { ...data._stats, compendiumSource: uuid },
    });
  }
  if (updates.length) await actor.updateEmbeddedDocuments('Item', updates as never, REPLACE_WHOLE);
  return updates.length;
}

/**
 * Swap every pf2e spell on the converted actors, and on their unlinked tokens, for the compendium
 * original, keeping only its item id, sort, and spellcasting slot. Repairs the "Unknown" links in
 * spells copied by releases before 0.1.7.
 */
export async function restoreSpells(): Promise<RestoreResult> {
  const actors = game.actors.filter((a) => !!a.getFlag(MODULE_ID, 'replaces'));
  const ids = new Set(actors.map((a) => a.id));
  const result: RestoreResult = { actors: 0, tokens: 0, spells: 0 };
  for (const actor of actors) {
    const spells = await restore(actor, actor.items as unknown as Iterable<SpellItem>);
    result.spells += spells;
    if (spells) result.actors++;
  }
  for (const scene of game.scenes) {
    for (const token of scene.tokens) {
      if (token.actorLink || !token.actor || !token.actorId || !ids.has(token.actorId) || !token.delta) continue;
      const spells = await restore(token.actor as unknown as Actor, token.delta.items as unknown as Iterable<SpellItem>);
      result.spells += spells;
      if (spells) result.tokens++;
    }
  }
  return result;
}
