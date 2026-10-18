import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MODULE_ID } from './constants';
import { FORAS_ID, THRESHOLDER_IDS, replaceActors } from './replace';

const MYSTIC_ID = THRESHOLDER_IDS[2];

const spell = (id: string, compendiumSource: string | null = `pf2e.${id}`) => ({
  _id: id,
  type: 'spell',
  sort: 7,
  system: { description: { value: 'module copy' }, location: { value: 'entry', heightenedLevel: 8 } },
  _stats: { compendiumSource },
});

const original = (id: string) => ({
  _id: id,
  type: 'spell',
  sort: 7,
  folder: null,
  system: { description: { value: `original pf2e.${id}` }, location: { value: 'entry', heightenedLevel: 8 } },
  _stats: { compendiumSource: `pf2e.${id}`, systemVersion: '8.6.1' },
});

function source(id: string) {
  return {
    _id: id,
    img: `portraits/${id}.webp`,
    items: [{ _id: 'old' }, { _id: 'new' }, spell('cast'), spell('missing'), spell('local', null), spell('absent')],
    prototypeToken: { width: 2, height: 2, texture: { src: `tokens/${id}.webp` } },
    system: { attributes: { hp: { max: 390, value: 390 } } },
    flags: { [MODULE_ID]: { replaces: `Compendium.pf2e.kingmaker-bestiary.Actor.${id}` } },
  };
}

function worldActor(id: string, replaced: boolean, compendiumSource?: string) {
  const ids = ['old', 'cast', 'missing', 'local', 'gm-added'];
  return {
    id,
    _stats: { compendiumSource },
    items: Object.assign(
      ids.map((i) => ({ id: i })),
      { has: (itemId: string) => ids.includes(itemId) },
    ),
    system: { attributes: { hp: { max: replaced ? 390 : 355, value: 100 } } },
    getFlag: () => (replaced ? `Compendium.pf2e.kingmaker-bestiary.Actor.${id}` : undefined),
    update: vi.fn(),
    updateEmbeddedDocuments: vi.fn(),
    createEmbeddedDocuments: vi.fn(),
  };
}

function token(actorId: string, hp: number, deltaItems: string[] = []) {
  return {
    id: `tok-${actorId}`,
    actorId,
    actorLink: false,
    width: 2,
    height: 2,
    texture: { src: `tokens/${actorId}.webp` },
    delta: { items: { has: (id: string) => deltaItems.includes(id) } },
    actor: { system: { attributes: { hp: { max: 390, value: hp } } }, updateEmbeddedDocuments: vi.fn() },
  };
}

function setup(actors: ReturnType<typeof worldActor>[], tokens: ReturnType<typeof token>[] = []) {
  const scene = { tokens, updateEmbeddedDocuments: vi.fn() };
  const docs = [FORAS_ID, ...THRESHOLDER_IDS].map((id) => ({ toObject: () => source(id) }));
  vi.stubGlobal('game', {
    packs: { get: () => ({ getDocuments: async () => docs }) },
    actors: { filter: (fn: (a: (typeof actors)[number]) => boolean) => actors.filter(fn) },
    scenes: [scene],
  });
  vi.stubGlobal('fromUuid', async (uuid: string) =>
    uuid === 'pf2e.missing' ? null : { toObject: () => ({ ...original(uuid.slice(5)), _id: 'pf2e-id', folder: 'pf2e' }) },
  );
  return scene;
}

describe('replaceActors', () => {
  beforeEach(() => vi.unstubAllGlobals());

  it('fully replaces an unconverted actor and lets current HP exceed the old maximum', async () => {
    const foras = worldActor(FORAS_ID, false);
    setup([foras]);

    const result = await replaceActors([FORAS_ID]);

    expect(result).toEqual({ replaced: 1, refreshed: 0, tokens: 0, spells: 0 });
    expect(foras.update).toHaveBeenCalledWith(
      expect.objectContaining({ system: { attributes: { hp: { max: 390, value: 390 } } } }),
      { allowHPOverage: true },
    );
    expect(foras.updateEmbeddedDocuments).toHaveBeenCalledWith(
      'Item',
      [{ _id: 'old' }, original('cast'), spell('missing'), spell('local', null)],
      { recursive: false },
    );
    expect(foras.createEmbeddedDocuments).toHaveBeenCalledWith('Item', [{ _id: 'new' }, original('absent')], {
      keepId: true,
    });
  });

  it('refreshes art, token size, HP, and every module spell from the pf2e original on an actor already replaced', async () => {
    const foras = worldActor(FORAS_ID, true);
    setup([foras]);

    const result = await replaceActors([FORAS_ID]);

    expect(result).toEqual({ replaced: 0, refreshed: 1, tokens: 0, spells: 3 });
    expect(foras.update).toHaveBeenCalledWith({
      img: `portraits/${FORAS_ID}.webp`,
      'prototypeToken.width': 2,
      'prototypeToken.height': 2,
      'prototypeToken.texture.src': `tokens/${FORAS_ID}.webp`,
      'system.attributes.hp.value': 390,
    });
    expect(foras.updateEmbeddedDocuments).toHaveBeenCalledOnce();
    expect(foras.updateEmbeddedDocuments).toHaveBeenCalledWith(
      'Item',
      [original('cast'), spell('missing'), spell('local', null)],
      { recursive: false },
    );
    expect(foras.createEmbeddedDocuments).not.toHaveBeenCalled();
  });

  it('refreshes every copy of an actor, including ones imported from the module or duplicated', async () => {
    const adventure = worldActor(FORAS_ID, true);
    const imported = worldActor('imported', true, `Compendium.${MODULE_ID}.actors.Actor.${FORAS_ID}`);
    const unrelated = worldActor('unrelated', false);
    setup([adventure, imported, unrelated]);

    const result = await replaceActors([FORAS_ID]);

    expect(result.refreshed).toBe(2);
    expect(imported.updateEmbeddedDocuments).toHaveBeenCalled();
    expect(unrelated.update).not.toHaveBeenCalled();
  });

  it('heals a wounded token, replaces spells its delta overrides, and skips a token already current', async () => {
    const wounded = token(FORAS_ID, 200, ['cast', 'gm-added']);
    const scene = setup([worldActor(FORAS_ID, true), worldActor(MYSTIC_ID, true)], [wounded, token(MYSTIC_ID, 390)]);

    const result = await replaceActors();

    expect(result.tokens).toBe(1);
    expect(scene.updateEmbeddedDocuments).toHaveBeenCalledWith('Token', [
      expect.objectContaining({ _id: `tok-${FORAS_ID}`, 'delta.system.attributes.hp.value': 390 }),
    ]);
    expect(wounded.actor.updateEmbeddedDocuments).toHaveBeenCalledWith('Item', [original('cast')], {
      recursive: false,
    });
  });

  it('leaves actors outside the chosen set alone', async () => {
    const foras = worldActor(FORAS_ID, false);
    const mystic = worldActor(MYSTIC_ID, false);
    setup([foras, mystic]);

    const result = await replaceActors(THRESHOLDER_IDS);

    expect(result.replaced).toBe(1);
    expect(foras.update).not.toHaveBeenCalled();
    expect(mystic.update).toHaveBeenCalled();
  });
});
