import {
  LumennAudioEngine,
  LumennInvalidAudioSourceError,
} from "./audio-engine.mjs";
import { LumennTransitionController } from "./transition-controller.mjs";
import { LumennGraphStore } from "./graph-store.mjs";
import { LumennCompat, SOCKET_NAME } from "./foundry-compat.mjs";
import { LumennGraphApp, lumennClientSceneFade } from "./storyboard-app.mjs";
import { registerHandlebarsHelpers } from "./handlebars-helpers.mjs";

const MODULE_ID = "lumenn-frame";

Hooks.once("init", () => {
  registerHandlebarsHelpers();
  LumennGraphStore.registerSettings();

  game.modules.get(MODULE_ID).api = {
    openStoryboard() {
      new LumennGraphApp().render({ force: true });
    },
    LumennAudioEngine,
    LumennInvalidAudioSourceError,
    LumennTransitionController,
    LumennGraphStore,
    LumennGraphApp,
  };

  Hooks.on("getSceneControlButtons", (controls) => {
    const tokenControl = Array.isArray(controls)
      ? controls.find((c) => c.name === "token")
      : (controls.tokens ?? controls.token);
    if (!tokenControl) return;
    const open = () => game.modules.get(MODULE_ID).api.openStoryboard();
    const tool = {
      name: "lumenn-frame",
      title: "Lumenn Frame",
      icon: "fas fa-film",
      button: true,
      visible: !!game.user?.isGM,
      onChange: open,
      onClick: open,
    };
    if (Array.isArray(tokenControl.tools)) tokenControl.tools.push(tool);
    else
      tokenControl.tools = {
        ...(tokenControl.tools ?? {}),
        "lumenn-frame": tool,
      };
  });
});

Hooks.once("ready", () => {
  // Migração não-destrutiva do schema v1 (Beats) para v2 (Graphs), com backup.
  if (game.user?.isGM) {
    LumennGraphStore.migrate().then(({ migrated }) => {
      if (migrated)
        ui.notifications.info(game.i18n.localize("LUMENN_FRAME.Migrated"));
    });
  }

  // Socket: somente o GM executa transições; players espelham o fade de Scene.
  LumennCompat.socketOn((payload) => {
    if (!payload?.type) return;
    if (LumennCompat.isGM()) return; // GM já executou localmente
    if (payload.type === "transition:start") {
      lumennClientSceneFade(payload.sceneId ?? null, payload.sceneTrans ?? {});
    }
  });
});
