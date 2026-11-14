import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ART_JOURNAL_ID, setUpCandlemere } from './art';

vi.mock('./swaps', () => ({ swapCreatures: async () => 0 }));
vi.mock('./additions', () => ({ addCreatures: async () => 0 }));
vi.mock('./treasure', () => ({ addTreasure: async () => 0 }));

const IMAGES = 'modules/kingmaker-cyclops-thresholders/assets/images';

const page = (_id: string, name: string, src: string, caption: string) => ({ _id, name, src, image: { caption } });

const SOURCE = [
  page('VS0ZeQAsnmTTggU5', 'B14. Foras', `${IMAGES}/foras-the-master.webp`, 'Ritual Chamber'),
  page('Hq7vPz3KdR5wXmTa', 'B10. Ilmorra and Vashtrel', `${IMAGES}/mortification-room.webp`, 'Mortification Room'),
  page('QXdm1lPxpAJwRZJr', 'B3. Rune-Scribed Room', `${IMAGES}/cyclops-monks.webp`, 'Rune-Scribed Room'),
];

function setup(worldPages: ReturnType<typeof page>[] | null) {
  const byId = new Map((worldPages ?? []).map((p) => [p._id, p]));
  const world = worldPages && {
    pages: { has: (id: string) => byId.has(id), get: (id: string) => byId.get(id) },
    createEmbeddedDocuments: vi.fn(),
    updateEmbeddedDocuments: vi.fn(),
  };
  const importFromCompendium = vi.fn();
  vi.stubGlobal('game', {
    packs: {
      get: () => ({
        getDocument: async () => ({ pages: { contents: SOURCE.map((p) => ({ toObject: () => p })) } }),
      }),
    },
    journal: { get: (id: string) => (id === ART_JOURNAL_ID ? world : undefined), importFromCompendium },
    scenes: [],
    actors: [],
  });
  return { world, importFromCompendium };
}

describe('setUpCandlemere journal sync', () => {
  beforeEach(() => vi.unstubAllGlobals());

  it('imports the journal into a world without one', async () => {
    const { importFromCompendium } = setup(null);

    expect(await setUpCandlemere()).toMatchObject({ journal: true, pages: 0 });
    expect(importFromCompendium).toHaveBeenCalledOnce();
  });

  it('adds the pages a module update brought and repoints a page at the current image', async () => {
    const { world } = setup([
      page('VS0ZeQAsnmTTggU5', 'B14. Foras', `${IMAGES}/foras-the-master_buff.webp`, 'Ritual Chamber'),
      SOURCE[2],
    ]);

    expect(await setUpCandlemere()).toMatchObject({ journal: false, pages: 2 });
    expect(world!.createEmbeddedDocuments).toHaveBeenCalledWith('JournalEntryPage', [SOURCE[1]], { keepId: true });
    expect(world!.updateEmbeddedDocuments).toHaveBeenCalledWith('JournalEntryPage', [
      { _id: 'VS0ZeQAsnmTTggU5', name: 'B14. Foras', src: `${IMAGES}/foras-the-master.webp`, 'image.caption': 'Ritual Chamber' },
    ]);
  });

  it('leaves a current journal alone', async () => {
    const { world } = setup(SOURCE);

    expect(await setUpCandlemere()).toMatchObject({ journal: false, pages: 0 });
    expect(world!.createEmbeddedDocuments).not.toHaveBeenCalled();
    expect(world!.updateEmbeddedDocuments).not.toHaveBeenCalled();
  });
});
