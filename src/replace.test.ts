import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MODULE_ID } from './constants';
import { FORAS_ID, THRESHOLDER_IDS, replaceActors } from './replace';

const MYSTIC_ID = THRESHOLDER_IDS[2];

function source(id: string) {
  return {
    _id: id,
    img: `portraits/${id}.webp`,
    items: [{ _id: 'old' }, { _id: 'new' }],
    prototypeToken: { width: 2, height: 2, texture: { src: `tokens/${id}.webp` } },
    system: { attributes: { hp: { max: 390, value: 390 } } },
    flags: { [MODULE_ID]: { replaces: `Compendium.pf2e.kingmaker-bestiary.Actor.${id}` } },
  };
}

function worldActor(id: string, replaced: boolean) {
  return {
    id,
    items: [{ id: 'old' }],
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

    expect(result).toEqual({ replaced: 1, refreshed: 0, tokens: 0 });
    expect(foras.update).toHaveBeenCalledWith(
      expect.objectContaining({ system: { attributes: { hp: { max: 390, value: 390 } } } }),
      { allowHPOverage: true },
    );
    expect(foras.createEmbeddedDocuments).toHaveBeenCalledWith('Item', [{ _id: 'new' }], { keepId: true });
  });

  it('only refreshes art, token size, and HP on an actor already replaced', async () => {
    const foras = worldActor(FORAS_ID, true);
    setup([foras]);

    const result = await replaceActors([FORAS_ID]);

    expect(result).toEqual({ replaced: 0, refreshed: 1, tokens: 0 });
    expect(foras.update).toHaveBeenCalledWith({
      img: `portraits/${FORAS_ID}.webp`,
      'prototypeToken.width': 2,
      'prototypeToken.height': 2,
      'prototypeToken.texture.src': `tokens/${FORAS_ID}.webp`,
      'system.attributes.hp.value': 390,
    });
    expect(foras.updateEmbeddedDocuments).not.toHaveBeenCalled();
    expect(foras.createEmbeddedDocuments).not.toHaveBeenCalled();
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
