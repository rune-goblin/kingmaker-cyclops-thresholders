import './styles.css';
import { MODULE_ID } from './constants';
import { FORAS_ID, THRESHOLDER_IDS, replaceActors } from './replace';

interface ModuleApi {
  version: string;
  replace: () => Promise<void>;
  replaceThresholders: () => Promise<void>;
  replaceForas: () => Promise<void>;
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
  const { replaced, refreshed, tokens } = await replaceActors(only);
  const key = replaced || refreshed ? `${MODULE_ID}.replaced` : `${MODULE_ID}.noneFound`;
  ui.notifications.info(
    game.i18n.format(key, { replaced: String(replaced), refreshed: String(refreshed), tokens: String(tokens) }),
  );
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

Hooks.once('ready', () => {
  const module = game.modules.get(MODULE_ID);
  const version = module?.version ?? '0.0.0';
  const api: ModuleApi = {
    version,
    replace: promptReplace,
    replaceThresholders: () => runReplace(THRESHOLDER_IDS),
    replaceForas: () => runReplace([FORAS_ID]),
  };
  // `api` is the Foundry convention for a public API, but isn't a typed field on Module.
  if (module) (module as { api?: ModuleApi }).api = api;
});
