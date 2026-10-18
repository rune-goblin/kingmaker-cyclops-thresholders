import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MODULE_ID } from './constants';
import { FORAS_ID, THRESHOLDER_IDS, replaceActors } from './replace';

const MYSTIC_ID = THRESHOLDER_IDS[2];

const spell = (id: string, remaster: boolean, compendiumSource: string | null = `pf2e.${id}`, description?: string) => ({
  _id: id,
  type: 'spell',
  system: { publication: { remaster }, ...(description && { description: { value: description } }) },
  _stats: { compendiumSource },
});

function source(id: string) {
  return {
    _id: id,
    img: `portraits/${id}.webp`,
    items: [
      { _id: 'old' },
      { _id: 'new' },
      spell('legacy', true),
      spell('edited', true),
      spell('kept', false),
      spell('swapped', true),
      spell('untracked', true),
    ],
    prototypeToken: { width: 2, height: 2, texture: { src: `tokens/${id}.webp` } },
    system: { attributes: { hp: { max: 390, value: 390 } } },
    flags: { [MODULE_ID]: { replaces: `Compendium.pf2e.kingmaker-bestiary.Actor.${id}` } },
  };
}

function worldActor(id: string, replaced: boolean) {
  const items = [
    { id: 'old' },
    { id: 'legacy', ...spell('legacy', false) },
    { id: 'edited', ...spell('edited', true) },
    { id: 'kept', ...spell('kept', false) },
    { id: 'swapped', ...spell('swapped', true, 'pf2e.previous') },
    { id: 'untracked', ...spell('untracked', true, null) },
  ];
  return {
    id,
    items: Object.assign(items, { get: (itemId: string) => items.find((i) => i.id === itemId) }),
    system: { attributes: { hp: { max: replaced ? 390 : 355, value: 100 } } },
    getFlag: () => (replaced ? 'yes' : undefined),
    update: vi.fn(),
    updateEmbeddedDocuments: vi.fn(),
    createEmbeddedDocuments: vi.fn(),
  };
}

function token(actorId: string, hp: number, src = `tokens/${actorId}.webp`) {
  return {
    id: `tok-${actorId}`,
    actorId,
    actorLink: false,
    width: 2,
    height: 2,
    texture: { src },
    actor: { system: { attributes: { hp: { max: 390, value: hp } } } },
  };
}

function setup(actors: ReturnType<typeof worldActor>[], tokens: ReturnType<typeof token>[] = []) {
  const scene = { tokens, updateEmbeddedDocuments: vi.fn() };
  const docs = [FORAS_ID, ...THRESHOLDER_IDS].map((id) => ({ toObject: () => source(id) }));
  vi.stubGlobal('game', {
    packs: { get: () => ({ getDocuments: async () => docs }) },
    actors: { get: (id: string) => actors.find((a) => a.id === id), find: () => undefined },
    scenes: [scene],
  });
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
    expect(foras.updateEmbeddedDocuments).toHaveBeenCalledWith('Item', expect.any(Array), { recursive: false });
    expect(foras.createEmbeddedDocuments).toHaveBeenCalledWith('Item', [{ _id: 'new' }], { keepId: true });
  });

  it('only refreshes art, token size, HP, and legacy or swapped spells on an actor already replaced', async () => {
    const foras = worldActor(FORAS_ID, true);
    setup([foras]);

    const result = await replaceActors([FORAS_ID]);

    expect(result).toEqual({ replaced: 0, refreshed: 1, tokens: 0, spells: 2 });
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
      [spell('legacy', true), spell('swapped', true)],
      { recursive: false },
    );
    expect(foras.createEmbeddedDocuments).not.toHaveBeenCalled();
  });

  it('replaces a spell whose links name their target instead of its id with the module copy', async () => {
    const byName = '@UUID[Compendium.pf2e.spells-srd.Item.Interplanar Teleport]';
    const byId = '@UUID[Compendium.pf2e.spells-srd.Item.5bTt2CvYHPvaR7QQ]{Interplanar Teleport}';
    const foras = worldActor(FORAS_ID, true);
    Object.assign(foras.items.get('edited')!, spell('edited', true, undefined, byName));
    Object.assign(foras.items.get('kept')!, spell('kept', false, undefined, byName));
    Object.assign(foras.items.get('untracked')!, spell('untracked', true, null, byId));
    setup([foras]);

    const result = await replaceActors([FORAS_ID]);

    expect(result.spells).toBe(4);
    expect(foras.updateEmbeddedDocuments).toHaveBeenCalledWith(
      'Item',
      [spell('legacy', true), spell('edited', true), spell('kept', false), spell('swapped', true)],
      { recursive: false },
    );
  });

  it('heals a wounded token and skips one already current', async () => {
    const scene = setup([worldActor(FORAS_ID, true), worldActor(MYSTIC_ID, true)], [
      token(FORAS_ID, 200),
      token(MYSTIC_ID, 390),
    ]);

    const result = await replaceActors();

    expect(result.tokens).toBe(1);
    expect(scene.updateEmbeddedDocuments).toHaveBeenCalledWith('Token', [
      expect.objectContaining({ _id: `tok-${FORAS_ID}`, 'delta.system.attributes.hp.value': 390 }),
    ]);
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
