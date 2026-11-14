import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MODULE_ID } from './constants';
import { ADDITIONS, ILMORRA_ID, VASHTREL_ID, addCreatures } from './additions';
import { SPIRAL } from './swaps';

function actor(id: string) {
  return { id, getTokenDocument: vi.fn(async (data: object) => ({ toObject: () => ({ actorId: id, ...data }) })) };
}

function spiral(added?: string[]) {
  const flags: Record<string, unknown> = { added };
  return {
    id: SPIRAL,
    initialLevel: 'defaultLevel0000',
    getFlag: (scope: string, key: string) => (scope === MODULE_ID ? flags[key] : undefined),
    setFlag: vi.fn(async (_scope: string, key: string, value: unknown) => {
      flags[key] = value;
    }),
    createEmbeddedDocuments: vi.fn(async (_type: string, data: unknown[]) => data),
  };
}

function setup(scene: ReturnType<typeof spiral>, inWorld: string[] = []) {
  const world = new Map(inWorld.map((id) => [id, actor(id)]));
  const importFromCompendium = vi.fn(async (_pack: unknown, id: string, _data: object, _options: object) => {
    world.set(id, actor(id));
    return world.get(id);
  });
  vi.stubGlobal('game', {
    scenes: [scene],
    packs: { get: () => ({}) },
    actors: { get: (id: string) => world.get(id), importFromCompendium },
  });
  return importFromCompendium;
}

describe('addCreatures', () => {
  beforeEach(() => vi.unstubAllGlobals());

  it('imports Ilmorra and Vashtrel under their own ids and hides them in B10', async () => {
    const scene = spiral();
    const importFromCompendium = setup(scene);

    expect(await addCreatures()).toBe(2);

    expect(importFromCompendium.mock.calls.map((c) => [c[1], c[3]])).toEqual([
      [ILMORRA_ID, { keepId: true }],
      [VASHTREL_ID, { keepId: true }],
    ]);
    const [type, tokens] = scene.createEmbeddedDocuments.mock.calls[0];
    expect(type).toBe('Token');
    expect(tokens).toEqual(
      ADDITIONS.map(({ id, x, y }) => ({ actorId: id, x, y, hidden: true, level: 'defaultLevel0000' })),
    );
    expect(scene.setFlag).toHaveBeenCalledWith(MODULE_ID, 'added', [ILMORRA_ID, VASHTREL_ID]);
  });

  it('reuses an actor the world already holds', async () => {
    const importFromCompendium = setup(spiral(), [ILMORRA_ID]);

    await addCreatures();

    expect(importFromCompendium.mock.calls.map((c) => c[1])).toEqual([VASHTREL_ID]);
  });

  it('leaves a scene alone once it has received both, even after the GM deletes their tokens', async () => {
    const scene = spiral([ILMORRA_ID, VASHTREL_ID]);
    setup(scene);

    expect(await addCreatures()).toBe(0);
    expect(scene.createEmbeddedDocuments).not.toHaveBeenCalled();
  });
});
