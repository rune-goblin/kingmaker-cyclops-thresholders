import { MODULE_ID } from './constants';

const ASSETS = `modules/${MODULE_ID}/assets/helix`;
export const TILE_SIZE = 200;

// The Spiral of Yog-Sothoth: the gate closes once per room, in this order, from the centre out.
// Each point is the tile's centre, where the spiral corridor runs through the room.
export const HELIX_ROOMS: { room: string; x: number; y: number }[] = [
  { room: 'B14', x: 6625, y: 3738 },
  { room: 'B13', x: 6363, y: 4938 },
  { room: 'B12', x: 7525, y: 5088 },
  { room: 'B10', x: 8088, y: 2575 },
  { room: 'B8', x: 4900, y: 2350 },
  { room: 'B4', x: 4000, y: 4000 },
  { room: 'B3', x: 4825, y: 5913 },
  { room: 'B2', x: 9063, y: 6438 },
  { room: 'B1', x: 9513, y: 3663 },
];

export const helixIcon = (sealed: boolean) => `${ASSETS}/helix-${sealed ? 'sealed' : 'open'}.webp`;

interface HelixTile {
  id: string | null;
  getFlag(scope: string, key: string): unknown;
  update(data: Record<string, unknown>): Promise<unknown>;
}

interface HelixScene {
  tiles: { contents: unknown[] };
  createEmbeddedDocuments(type: 'Tile', data: object[]): Promise<unknown>;
  updateEmbeddedDocuments(type: 'Tile', data: object[]): Promise<unknown>;
}

const stepOf = (tile: HelixTile) => {
  const step = tile.getFlag(MODULE_ID, 'helixStep');
  return typeof step === 'number' ? step : undefined;
};

export const helixTiles = (scene: HelixScene) =>
  (scene.tiles.contents as HelixTile[]).filter((t) => stepOf(t) !== undefined);

const spot = (step: number) => {
  const { x, y } = HELIX_ROOMS[step - 1];
  return { x: x - TILE_SIZE / 2, y: y - TILE_SIZE / 2, width: TILE_SIZE, height: TILE_SIZE };
};

/**
 * Put a hidden tile on the spiral in each Helix Theorem room that lacks one. Safe to re-run:
 * tiles the GM moved stay put.
 */
export async function placeHelixTiles(scene: HelixScene): Promise<number> {
  const placed = new Set(helixTiles(scene).map(stepOf));
  const created = HELIX_ROOMS.flatMap((_, i) =>
    placed.has(i + 1)
      ? []
      : [
          {
            ...spot(i + 1),
            hidden: true,
            texture: { src: helixIcon(false) },
            flags: { [MODULE_ID]: { helixStep: i + 1, sealed: false } },
          },
        ],
  );
  if (created.length) await scene.createEmbeddedDocuments('Tile', created);
  return created.length;
}

export async function setAllHidden(scene: HelixScene, hidden: boolean): Promise<void> {
  const updates = helixTiles(scene).map((t) => ({ _id: t.id, hidden }));
  if (updates.length) await scene.updateEmbeddedDocuments('Tile', updates);
}

export async function openAllGates(scene: HelixScene): Promise<void> {
  const updates = helixTiles(scene).map((t) => ({
    _id: t.id,
    'texture.src': helixIcon(false),
    [`flags.${MODULE_ID}.sealed`]: false,
  }));
  if (updates.length) await scene.updateEmbeddedDocuments('Tile', updates);
}

export async function setSealed(tile: HelixTile, sealed: boolean): Promise<void> {
  if (stepOf(tile) === undefined) return;
  await tile.update({ 'texture.src': helixIcon(sealed), [`flags.${MODULE_ID}.sealed`]: sealed });
}

// The core HUD already toggles visibility, so a Helix tile only needs the seal swap beside it.
export function addSealControl(hud: { document: unknown }, html: HTMLElement): void {
  const tile = hud.document as HelixTile;
  if (stepOf(tile) === undefined) return;
  const sealed = tile.getFlag(MODULE_ID, 'sealed') === true;
  const label = game.i18n.localize(`${MODULE_ID}.helix.${sealed ? 'unseal' : 'seal'}`);

  const button = document.createElement('button');
  button.type = 'button';
  button.className = sealed ? 'control-icon active' : 'control-icon';
  button.dataset.tooltip = '';
  button.setAttribute('aria-label', label);
  button.innerHTML = `<i class="fa-solid ${sealed ? 'fa-door-closed' : 'fa-door-open'}" inert></i>`;
  button.addEventListener('click', () => void setSealed(tile, !sealed));
  html.querySelector('.col.left')?.append(button);
}
