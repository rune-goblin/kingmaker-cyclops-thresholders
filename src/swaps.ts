const SPIRAL = 'nRny3fEVnIYr2b7B';

interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface Swap {
  scene: string;
  /** The Kingmaker actor whose tokens this swap removes. */
  replaces: string;
  within?: Rect;
  pack: string;
  id: string;
  tokens: { x: number; y: number }[];
}

export const SWAPS: Swap[] = [
  {
    scene: SPIRAL,
    replaces: 'sw32QdZlsWnmWaVY',
    // The Garden only: the mastiff beside the Leng envoy in B5 stays.
    within: { x: 1500, y: 4000, width: 3000, height: 2500 },
    pack: 'pf2e.pathfinder-bestiary-2',
    id: 'pxlZ8QbxMK6b3l5w',
    tokens: [
      { x: 2775, y: 5625 },
      { x: 3450, y: 5475 },
      { x: 2400, y: 4800 },
      { x: 2175, y: 5475 },
    ],
  },
  {
    scene: SPIRAL,
    replaces: 'hD8Su0awrJYwmDXh',
    pack: 'pf2e.pathfinder-monster-core',
    id: 'G5OY8UMEOrbycZZc',
    tokens: [
      { x: 7800, y: 5100 },
      { x: 7575, y: 5400 },
      { x: 7425, y: 4950 },
    ],
  },
];

const sourceOf = (swap: Swap) => `Compendium.${swap.pack}.Actor.${swap.id}`;

function compendiumSource(actor: Actor | undefined): string | undefined {
  return (actor as unknown as { _stats?: { compendiumSource?: string | null } })?._stats?.compendiumSource ?? undefined;
}

function inside(token: TokenDocument, rect?: Rect): boolean {
  return !rect || (token.x >= rect.x && token.x < rect.x + rect.width && token.y >= rect.y && token.y < rect.y + rect.height);
}

async function creature(swap: Swap): Promise<Actor> {
  const source = sourceOf(swap);
  const existing = game.actors.find((a) => compendiumSource(a) === source);
  if (existing) return existing;
  const pack = game.packs.get(swap.pack);
  if (!pack) throw new Error(`${swap.pack} missing`);
  return (await game.actors.importFromCompendium(pack as never, swap.id)) as Actor;
}

/**
 * Replace stock Kingmaker encounters on the Candlemere Spiral with the creatures the module calls
 * for, exactly as the bestiary ships them. A scene already holding the new creature is left alone,
 * as is one whose stock tokens the GM deleted.
 */
export async function swapCreatures(): Promise<number> {
  let placed = 0;
  for (const swap of SWAPS) {
    const scene = game.scenes.get(swap.scene);
    if (!scene) continue;
    const source = sourceOf(swap);
    if (scene.tokens.some((t) => compendiumSource(game.actors.get(t.actorId ?? '')) === source)) continue;
    const stock = scene.tokens.filter((t) => t.actorId === swap.replaces && inside(t, swap.within));
    if (!stock.length) continue;

    const actor = await creature(swap);
    const { hidden, disposition, elevation, level } = stock[0].toObject() as Record<string, unknown>;
    const tokens = await Promise.all(
      swap.tokens.map(async ({ x, y }) =>
        (await actor.getTokenDocument({ x, y, hidden, disposition, elevation, level } as never)).toObject(),
      ),
    );
    await scene.deleteEmbeddedDocuments('Token', stock.map((t) => t.id!));
    const created = await scene.createEmbeddedDocuments('Token', tokens as never);
    placed += created.length;
  }
  return placed;
}
