import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MODULE_ID } from './constants';
import { CHAPTER_9_ID, HELIX_ROOMS, TILE_SIZE, helixIcon, markHelixRooms, setSealed } from './helix';

const roomPin = (page: string, x: number, y: number) => ({ entryId: CHAPTER_9_ID, pageId: page, x, y });

const helixTile = (step: number, sealed = false) => ({
  getFlag: (scope: string, key: string) =>
    scope === MODULE_ID ? ({ helixStep: step, sealed } as Record<string, unknown>)[key] : undefined,
  update: vi.fn(),
});

function scene(notes: unknown[], tiles: unknown[] = []) {
  return { notes: { contents: notes }, tiles: { contents: tiles }, createEmbeddedDocuments: vi.fn() };
}

const allPins = () => HELIX_ROOMS.map((r, i) => roomPin(r.page, 1000 + i * 100, 500));

describe('markHelixRooms', () => {
  beforeEach(() => vi.unstubAllGlobals());

  it('places nine hidden open tiles in ritual order beside their room pins', async () => {
    const spiral = scene(allPins());
    vi.stubGlobal('game', { scenes: [spiral] });

    expect(await markHelixRooms()).toEqual({ scenes: 1, tiles: 9, missing: [] });
    const [type, created] = spiral.createEmbeddedDocuments.mock.calls[0];
    expect(type).toBe('Tile');
    expect(created.map((t: { texture: { src: string } }) => t.texture.src)).toEqual(
      HELIX_ROOMS.map((_, i) => helixIcon(i + 1, false)),
    );
    expect(created[0]).toMatchObject({
      x: 1000 - 110 - TILE_SIZE / 2,
      y: 500 - TILE_SIZE / 2,
      hidden: true,
      flags: { [MODULE_ID]: { helixStep: 1, sealed: false } },
    });
  });

  it('adds only the steps a re-run finds missing', async () => {
    const spiral = scene(allPins(), [helixTile(1), helixTile(2, true)]);
    vi.stubGlobal('game', { scenes: [spiral] });

    expect((await markHelixRooms()).tiles).toBe(7);
    const created = spiral.createEmbeddedDocuments.mock.calls[0][1];
    expect(created.map((t: { flags: Record<string, { helixStep: number }> }) => t.flags[MODULE_ID].helixStep)).toEqual([
      3, 4, 5, 6, 7, 8, 9,
    ]);
  });

  it('reports rooms whose pin the scene lacks', async () => {
    const spiral = scene(allPins().filter((p) => p.pageId !== '0kSqo5oKQtD59pcX'));
    vi.stubGlobal('game', { scenes: [spiral] });

    expect(await markHelixRooms()).toEqual({ scenes: 1, tiles: 8, missing: ['B10'] });
  });

  it('ignores scenes without the chapter 9 room pins', async () => {
    const other = scene([roomPin('somewhereElse', 0, 0)]);
    vi.stubGlobal('game', { scenes: [other] });

    expect(await markHelixRooms()).toEqual({ scenes: 0, tiles: 0, missing: [] });
    expect(other.createEmbeddedDocuments).not.toHaveBeenCalled();
  });
});

describe('setSealed', () => {
  it('swaps the icon to the chosen state and records it', async () => {
    const tile = helixTile(4);

    await setSealed(tile, true);

    expect(tile.update).toHaveBeenCalledWith({
      'texture.src': helixIcon(4, true),
      [`flags.${MODULE_ID}.sealed`]: true,
    });
  });

  it('leaves tiles that are not Helix tiles alone', async () => {
    const tile = { getFlag: () => undefined, update: vi.fn() };

    await setSealed(tile, true);

    expect(tile.update).not.toHaveBeenCalled();
  });
});
