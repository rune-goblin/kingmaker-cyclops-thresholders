import { MODULE_ID } from './constants';
import { SPIRAL } from './swaps';

const ACTOR_PACK = `${MODULE_ID}.actors`;
const FLAG = 'added';

export interface Addition {
  scene: string;
  /** The module actor, imported into the world under this same id. */
  id: string;
  x: number;
  y: number;
}

export const ILMORRA_ID = '72jeyQdCHtP5i2FT';
export const VASHTREL_ID = 'XfW07QSPvGI3fSaH';

export const ADDITIONS: Addition[] = [
  // B10, the Mortification Room: two elite disciples meditate on the ritual circles.
  { scene: SPIRAL, id: ILMORRA_ID, x: 7950, y: 2250 },
  { scene: SPIRAL, id: VASHTREL_ID, x: 8250, y: 1950 },
];

async function worldActor(id: string): Promise<Actor> {
  const existing = game.actors.get(id);
  if (existing) return existing;
  const pack = game.packs.get(ACTOR_PACK);
  if (!pack) throw new Error(`${ACTOR_PACK} missing`);
  return (await game.actors.importFromCompendium(pack as never, id, {}, { keepId: true })) as Actor;
}

/**
 * Place the module's own creatures in their rooms, hidden like Kingmaker's encounters. The scene
 * remembers each creature it received, so a token the GM deleted stays deleted on the next run.
 */
export async function addCreatures(): Promise<number> {
  let placed = 0;
  for (const scene of game.scenes) {
    const mine = ADDITIONS.filter((a) => a.scene === scene.id);
    if (!mine.length) continue;
    const done = (scene.getFlag(MODULE_ID, FLAG) as string[] | undefined) ?? [];
    const todo = mine.filter((a) => !done.includes(a.id));
    if (!todo.length) continue;

    const level = (scene as unknown as { initialLevel?: string | null }).initialLevel ?? undefined;
    const tokens = await Promise.all(
      todo.map(async ({ id, x, y }) =>
        (await (await worldActor(id)).getTokenDocument({ x, y, hidden: true, level } as never)).toObject(),
      ),
    );
    const created = await scene.createEmbeddedDocuments('Token', tokens as never);
    await scene.setFlag(MODULE_ID, FLAG, [...done, ...todo.map((a) => a.id)]);
    placed += created.length;
  }
  return placed;
}
