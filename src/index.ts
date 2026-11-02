import './styles.css';
import { MODULE_ID } from './constants';
import { FORAS_ID, THRESHOLDER_IDS, replaceActors } from './replace';
import { restoreSpells } from './restore';
import { setUpCandlemere } from './art';
import { addSealControl, markHelixRooms } from './helix';

interface ModuleApi {
  version: string;
  replace: () => Promise<void>;
  replaceThresholders: () => Promise<void>;
  replaceForas: () => Promise<void>;
  restoreSpells: () => Promise<void>;
  setUpCandlemere: () => Promise<void>;
  markHelixRooms: () => Promise<void>;
}

const CHOICES: Record<string, string[] | undefined> = {
  thresholders: THRESHOLDER_IDS,
  foras: [FORAS_ID],
  all: undefined,
};

async function runReplace(only?: string[]): Promise<void> {
  if (!game.user.isGM) {
    ui.notifications.warn(game.i18n.localize(`${MODULE_ID}.gmOnly`));
    return;
  }
  const { replaced, refreshed, tokens, spells } = await replaceActors(only);
  const key = replaced || refreshed ? `${MODULE_ID}.replaced` : `${MODULE_ID}.noneFound`;
  ui.notifications.info(
    game.i18n.format(key, { replaced: String(replaced), refreshed: String(refreshed), tokens: String(tokens), spells: String(spells) }),
  );
}

async function runRestore(): Promise<void> {
  if (!game.user.isGM) {
    ui.notifications.warn(game.i18n.localize(`${MODULE_ID}.gmOnly`));
    return;
  }
  const { actors, tokens, spells } = await restoreSpells();
  ui.notifications.info(
    game.i18n.format(`${MODULE_ID}.restored`, { actors: String(actors), tokens: String(tokens), spells: String(spells) }),
  );
}

async function runCandlemere(): Promise<void> {
  if (!game.user.isGM) {
    ui.notifications.warn(game.i18n.localize(`${MODULE_ID}.gmOnly`));
    return;
  }
  const { creatures, journal, notes, actors, tokens } = await setUpCandlemere();
  ui.notifications.info(
    game.i18n.format(`${MODULE_ID}.candlemere`, {
      journal: game.i18n.localize(`${MODULE_ID}.${journal ? 'artImported' : 'artKept'}`),
      creatures: String(creatures),
      notes: String(notes),
      actors: String(actors),
      tokens: String(tokens),
    }),
  );
}

async function runHelix(): Promise<void> {
  if (!game.user.isGM) {
    ui.notifications.warn(game.i18n.localize(`${MODULE_ID}.gmOnly`));
    return;
  }
  const { scenes, tiles, missing } = await markHelixRooms();
  if (!scenes) {
    ui.notifications.warn(game.i18n.localize(`${MODULE_ID}.helix.noScene`));
    return;
  }
  ui.notifications.info(game.i18n.format(`${MODULE_ID}.helix.marked`, { tiles: String(tiles) }));
  if (missing.length) {
    ui.notifications.warn(game.i18n.format(`${MODULE_ID}.helix.missing`, { rooms: missing.join(', ') }));
  }
}

async function promptReplace(): Promise<void> {
  if (!game.user.isGM) {
    ui.notifications.warn(game.i18n.localize(`${MODULE_ID}.gmOnly`));
    return;
  }
  const t = (key: string) => game.i18n.localize(`${MODULE_ID}.dialog.${key}`);
  const choice = await foundry.applications.api.DialogV2.wait({
    window: { title: t('title') },
    content: `<p>${t('content')}</p>`,
    buttons: [
      { action: 'thresholders', label: t('thresholders'), default: true },
      { action: 'foras', label: t('foras') },
      { action: 'all', label: t('all') },
    ],
    rejectClose: false,
  });
  if (typeof choice !== 'string' || !(choice in CHOICES)) return;
  await runReplace(CHOICES[choice]);
}

Hooks.on('renderTileHUD', addSealControl);

Hooks.once('ready', () => {
  const module = game.modules.get(MODULE_ID);
  const version = module?.version ?? '0.0.0';
  const api: ModuleApi = {
    version,
    replace: promptReplace,
    replaceThresholders: () => runReplace(THRESHOLDER_IDS),
    replaceForas: () => runReplace([FORAS_ID]),
    restoreSpells: runRestore,
    setUpCandlemere: runCandlemere,
    markHelixRooms: runHelix,
  };
  // `api` is the Foundry convention for a public API, but isn't a typed field on Module.
  if (module) (module as { api?: ModuleApi }).api = api;
});
