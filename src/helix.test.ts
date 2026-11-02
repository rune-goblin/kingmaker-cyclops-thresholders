import { describe, expect, it, vi } from 'vitest';
import { MODULE_ID } from './constants';
import { HELIX_ROOMS, TILE_SIZE, helixIcon, openAllGates, placeHelixTiles, setAllHidden, setSealed } from './helix';

const helixTile = (step: number, { sealed = false } = {}) => ({
  id: `tile-${step}`,
  getFlag: (scope: string, key: string) =>
    scope === MODULE_ID ? ({ helixStep: step, sealed } as Record<string, unknown>)[key] : undefined,
  update: vi.fn(),
});

const otherTile = { id: 'rug', getFlag: () => undefined, update: vi.fn() };

function scene(tiles: unknown[] = []) {
  return { tiles: { contents: tiles }, createEmbeddedDocuments: vi.fn(), updateEmbeddedDocuments: vi.fn() };
}

type Created = { x: number; y: number; hidden: boolean; texture: { src: string }; flags: Record<string, { helixStep: number }> };

describe('placeHelixTiles', () => {
  it('centres a hidden open tile on the spiral in each of the nine rooms', async () => {
    const spiral = scene([otherTile]);

    expect(await placeHelixTiles(spiral)).toBe(9);
    const [type, created] = spiral.createEmbeddedDocuments.mock.calls[0] as [string, Created[]];
    expect(type).toBe('Tile');
    expect(created.map((t) => t.flags[MODULE_ID].helixStep)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
    expect(created.every((t) => t.hidden && t.texture.src === helixIcon(false))).toBe(true);
    expect(created[0]).toMatchObject({
      x: HELIX_ROOMS[0].x - TILE_SIZE / 2,
      y: HELIX_ROOMS[0].y - TILE_SIZE / 2,
      width: TILE_SIZE,
      height: TILE_SIZE,
    });
    expect(spiral.updateEmbeddedDocuments).not.toHaveBeenCalled();
  });

  it('adds only the steps a re-run finds missing and leaves placed tiles where they are', async () => {
    const spiral = scene([helixTile(1), helixTile(2, { sealed: true })]);

    expect(await placeHelixTiles(spiral)).toBe(7);
    const created = spiral.createEmbeddedDocuments.mock.calls[0][1] as Created[];
    expect(created.map((t) => t.flags[MODULE_ID].helixStep)).toEqual([3, 4, 5, 6, 7, 8, 9]);
    expect(spiral.updateEmbeddedDocuments).not.toHaveBeenCalled();
  });
});

describe('bulk actions', () => {
  it('shows every Helix tile and no other tile', async () => {
    const spiral = scene([helixTile(1), otherTile, helixTile(2)]);

    await setAllHidden(spiral, false);

    expect(spiral.updateEmbeddedDocuments).toHaveBeenCalledWith('Tile', [
      { _id: 'tile-1', hidden: false },
      { _id: 'tile-2', hidden: false },
    ]);
  });

  it('opens every gate for a fresh attempt', async () => {
    const spiral = scene([helixTile(1, { sealed: true }), otherTile]);

    await openAllGates(spiral);

    expect(spiral.updateEmbeddedDocuments).toHaveBeenCalledWith('Tile', [
      { _id: 'tile-1', 'texture.src': helixIcon(false), [`flags.${MODULE_ID}.sealed`]: false },
    ]);
  });
});

describe('setSealed', () => {
  it('swaps the icon to the chosen state and records it', async () => {
    const tile = helixTile(4);

    await setSealed(tile, true);

    expect(tile.update).toHaveBeenCalledWith({
      'texture.src': helixIcon(true),
      [`flags.${MODULE_ID}.sealed`]: true,
    });
  });

  it('leaves tiles that are not Helix tiles alone', async () => {
    await setSealed(otherTile, true);

    expect(otherTile.update).not.toHaveBeenCalled();
  });
});
