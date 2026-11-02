import { MODULE_ID } from './constants';

export const CHAPTER_9_ID = '45g079GlbehLJpmo';
const ASSETS = `modules/${MODULE_ID}/assets/helix`;
export const TILE_SIZE = 100;
const OFFSET_X = -110;

// The Spiral of Yog-Sothoth: the gate closes once per room, in this order, from the centre out.
export const HELIX_ROOMS: { room: string; page: string }[] = [
  { room: 'B14', page: 'gzexduw0lqmG4q5r' },
  { room: 'B13', page: 'HXLgL6p5oCes0uP9' },
  { room: 'B12', page: 'Lax7DSMrgnvjmcyh' },
  { room: 'B10', page: '0kSqo5oKQtD59pcX' },
  { room: 'B8', page: 'Zh2VM1v7YxAL43Qu' },
  { room: 'B4', page: 'RVeE7HUPof17hEZy' },
  { room: 'B3', page: 'nsM73V8Ra1IvLs24' },
  { room: 'B2', page: 'Y0yPoSJNmiTvJA53' },
  { room: 'B1', page: 'XYXHryE1sVjrLhUw' },
];

export const helixIcon = (step: number, sealed: boolean) =>
  `${ASSETS}/helix-${step}-${sealed ? 'sealed' : 'open'}.webp`;

export interface HelixResult {
  scenes: number;
  tiles: number;
  missing: string[];
}

interface RoomNote {
  entryId: string | null;
  pageId: string | null;
  x: number;
  y: number;
}

interface HelixTile {
  getFlag(scope: string, key: string): unknown;
  update(data: Record<string, unknown>): Promise<unknown>;
}

const stepOf = (tile: HelixTile) => {
  const step = tile.getFlag(MODULE_ID, 'helixStep');
  return typeof step === 'number' ? step : undefined;
};

/**
 * Place a hidden tile beside each Helix Theorem room on the scenes that hold Kingmaker's chapter 9
 * room pins, its icon numbered in ritual order. Safe to re-run: tiles the GM moved stay put.
 */
export async function markHelixRooms(): Promise<HelixResult> {
  let scenes = 0;
  let tiles = 0;
  const missing: string[] = [];

  for (const scene of game.scenes) {
    const rooms = (scene.notes.contents as unknown as RoomNote[]).filter((n) => n.entryId === CHAPTER_9_ID);
    const pinOf = (page: string) => rooms.find((n) => n.pageId === page);
    if (!HELIX_ROOMS.some((r) => pinOf(r.page))) continue;
    scenes++;

    const placed = new Set((scene.tiles.contents as unknown as HelixTile[]).map(stepOf));
    const created = HELIX_ROOMS.flatMap(({ room, page }, i) => {
      const step = i + 1;
      if (placed.has(step)) return [];
      const pin = pinOf(page);
      if (!pin) {
        missing.push(room);
        return [];
      }
      return [
        {
          x: pin.x + OFFSET_X - TILE_SIZE / 2,
          y: pin.y - TILE_SIZE / 2,
          width: TILE_SIZE,
          height: TILE_SIZE,
          hidden: true,
          texture: { src: helixIcon(step, false) },
          flags: { [MODULE_ID]: { helixStep: step, sealed: false } },
        },
      ];
    });
    if (!created.length) continue;
    await scene.createEmbeddedDocuments('Tile', created);
    tiles += created.length;
  }

  return { scenes, tiles, missing };
}

export async function setSealed(tile: HelixTile, sealed: boolean): Promise<void> {
  const step = stepOf(tile);
  if (step === undefined) return;
  await tile.update({ 'texture.src': helixIcon(step, sealed), [`flags.${MODULE_ID}.sealed`]: sealed });
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
  button.innerHTML = `<i class="fa-solid ${sealed ? 'fa-eye-slash' : 'fa-eye'}" inert></i>`;
  button.addEventListener('click', () => void setSealed(tile, !sealed));
  html.querySelector('.col.left')?.append(button);
}
