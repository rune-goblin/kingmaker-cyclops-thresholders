import { MODULE_ID } from './constants';

const ITEM_PACK = `${MODULE_ID}.items`;
const FLAG = 'treasureAdded';

export const CODEX_ID = 'BZb2xDI3sp59Vi6w';

export interface Treasure {
  /** A Kingmaker loot actor; the Adventure imports with keepId, so the id holds in every world. */
  actor: string;
  item: string;
}

export const TREASURE: Treasure[] = [
  // B14, the Ritual Chamber: Foras's worktable.
  { actor: 'mxGasmiHaza9lkME', item: CODEX_ID },
];

/**
 * Put the module's items into Kingmaker's treasure. The actor remembers each item it received, so an
 * item the party has already looted is not handed out again.
 */
export async function addTreasure(): Promise<number> {
  const pack = game.packs.get(ITEM_PACK);
  if (!pack) throw new Error(`${ITEM_PACK} missing`);
  let added = 0;
  for (const { actor: actorId, item: itemId } of TREASURE) {
    const actor = game.actors.get(actorId);
    if (!actor) continue;
    const done = (actor.getFlag(MODULE_ID, FLAG) as string[] | undefined) ?? [];
    if (done.includes(itemId)) continue;

    const item = await pack.getDocument(itemId);
    if (!item) throw new Error(`${ITEM_PACK}.${itemId} missing`);
    await actor.createEmbeddedDocuments('Item', [game.items.fromCompendium(item as never)] as never);
    await actor.setFlag(MODULE_ID, FLAG, [...done, itemId]);
    added++;
  }
  return added;
}
