import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MODULE_ID } from './constants';
import { CODEX_ID, TREASURE, addTreasure } from './treasure';

const SUPPLIES = TREASURE[0].actor;
const codex = { _id: CODEX_ID, name: 'Codex of the Coterminous Gate' };

function supplies(received?: string[]) {
  const flags: Record<string, unknown> = { treasureAdded: received };
  return {
    id: SUPPLIES,
    getFlag: (scope: string, key: string) => (scope === MODULE_ID ? flags[key] : undefined),
    setFlag: vi.fn(async (_scope: string, key: string, value: unknown) => {
      flags[key] = value;
    }),
    createEmbeddedDocuments: vi.fn(),
  };
}

function setup(actor: ReturnType<typeof supplies> | undefined) {
  const fromCompendium = vi.fn((doc: typeof codex) => ({ name: doc.name, _stats: { compendiumSource: 'codex' } }));
  vi.stubGlobal('game', {
    packs: { get: () => ({ getDocument: async (id: string) => (id === CODEX_ID ? codex : undefined) }) },
    actors: { get: (id: string) => (id === actor?.id ? actor : undefined) },
    items: { fromCompendium },
  });
}

describe('addTreasure', () => {
  beforeEach(() => vi.unstubAllGlobals());

  it('puts the Codex among the Ritual Supplies in B14 and remembers it', async () => {
    const actor = supplies();
    setup(actor);

    expect(await addTreasure()).toBe(1);
    expect(actor.createEmbeddedDocuments).toHaveBeenCalledWith('Item', [
      { name: 'Codex of the Coterminous Gate', _stats: { compendiumSource: 'codex' } },
    ]);
    expect(actor.setFlag).toHaveBeenCalledWith(MODULE_ID, 'treasureAdded', [CODEX_ID]);
  });

  it('does not hand the Codex out again after the party looted it', async () => {
    const actor = supplies([CODEX_ID]);
    setup(actor);

    expect(await addTreasure()).toBe(0);
    expect(actor.createEmbeddedDocuments).not.toHaveBeenCalled();
  });

  it('skips a world without the Ritual Supplies', async () => {
    setup(undefined);

    expect(await addTreasure()).toBe(0);
  });
});
