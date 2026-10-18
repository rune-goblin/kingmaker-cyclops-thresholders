import { beforeEach, describe, expect, it, vi } from 'vitest';
import { restoreSpells } from './restore';

const spell = (id: string, compendiumSource: string | null) => ({
  id,
  type: 'spell',
  sort: 7,
  system: { description: { value: 'broken copy' }, location: { value: 'entry', heightenedLevel: 8 } },
  _stats: { compendiumSource },
});

const original = (id: string) => ({
  _id: id,
  type: 'spell',
  sort: 7,
  folder: null,
  system: { description: { value: 'original' }, location: { value: 'entry', heightenedLevel: 8 } },
  _stats: { compendiumSource: 'Compendium.pf2e.spells-srd.Item.quandary' },
});

function actor(id: string, converted: boolean) {
  return {
    id,
    items: [
      spell('quandary', 'Compendium.pf2e.spells-srd.Item.quandary'),
      spell('homebrew', null),
      { id: 'strike', type: 'melee', sort: 0, system: {}, _stats: { compendiumSource: 'Compendium.pf2e.x.Item.y' } },
    ],
    getFlag: () => (converted ? 'Compendium.pf2e.kingmaker-bestiary.Actor.x' : undefined),
    updateEmbeddedDocuments: vi.fn(),
  };
}

function setup(actors: ReturnType<typeof actor>[], tokens: unknown[] = []) {
  vi.stubGlobal('game', {
    actors: { filter: (fn: (a: (typeof actors)[number]) => boolean) => actors.filter(fn) },
    scenes: [{ tokens }],
  });
  vi.stubGlobal('fromUuid', async () => ({
    toObject: () => ({ ...original('pf2e-id'), folder: 'pf2e', _stats: { compendiumSource: null } }),
  }));
}

describe('restoreSpells', () => {
  beforeEach(() => vi.unstubAllGlobals());

  it('swaps pf2e spells on converted actors for the original, keeping id, sort, and slot', async () => {
    const foras = actor('foras', true);
    const human = actor('human', false);
    setup([foras, human]);

    const result = await restoreSpells();

    expect(result).toEqual({ actors: 1, tokens: 0, spells: 1 });
    expect(foras.updateEmbeddedDocuments).toHaveBeenCalledWith('Item', [original('quandary')], { recursive: false });
    expect(human.updateEmbeddedDocuments).not.toHaveBeenCalled();
  });

  it('swaps the spells an unlinked token keeps its own copy of', async () => {
    const tokenActor = { updateEmbeddedDocuments: vi.fn() };
    const unlinked = {
      actorLink: false,
      actorId: 'foras',
      actor: tokenActor,
      delta: { items: [spell('quandary', 'Compendium.pf2e.spells-srd.Item.quandary')] },
    };
    setup([actor('foras', true)], [unlinked, { ...unlinked, actorId: 'stranger' }]);

    const result = await restoreSpells();

    expect(result.tokens).toBe(1);
    expect(tokenActor.updateEmbeddedDocuments).toHaveBeenCalledOnce();
    expect(tokenActor.updateEmbeddedDocuments).toHaveBeenCalledWith('Item', [original('quandary')], {
      recursive: false,
    });
  });

  it('ignores actors without the module flag', async () => {
    setup([actor('human', false)]);

    expect(await restoreSpells()).toEqual({ actors: 0, tokens: 0, spells: 0 });
  });
});
