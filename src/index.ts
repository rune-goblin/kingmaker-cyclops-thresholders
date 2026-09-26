import './styles.css';
import { MODULE_ID } from './constants';
import { replaceThresholders } from './replace';

interface ModuleApi {
  version: string;
  replaceThresholders: () => Promise<void>;
}

async function runReplace(): Promise<void> {
  if (!game.user.isGM) {
    ui.notifications.warn(game.i18n.localize(`${MODULE_ID}.gmOnly`));
    return;
  }
  const { actors, tokens } = await replaceThresholders();
  const key = actors ? `${MODULE_ID}.replaced` : `${MODULE_ID}.noneFound`;
  ui.notifications.info(game.i18n.format(key, { actors: String(actors), tokens: String(tokens) }));
}

Hooks.once('ready', () => {
  const module = game.modules.get(MODULE_ID);
  const version = module?.version ?? '0.0.0';
  const api: ModuleApi = { version, replaceThresholders: runReplace };
  // `api` is the Foundry convention for a public API, but isn't a typed field on Module.
  if (module) (module as { api?: ModuleApi }).api = api;
});
