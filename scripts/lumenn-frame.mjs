import { LumennBeatStore } from "./beat-store.mjs";
import { LumennAudioEngine, LumennInvalidAudioSourceError } from "./audio-engine.mjs";
import { LumennTransitionController } from "./transition-controller.mjs";
import { LumennStoryboardApp } from "./storyboard-app.mjs";
import { registerHandlebarsHelpers } from "./handlebars-helpers.mjs";

const MODULE_ID = "lumenn-frame";

Hooks.once("init", () => {
  registerHandlebarsHelpers();
  LumennBeatStore.registerSettings();

  // Artigo II: o motor é validável isoladamente via macro —
  // as classes ficam expostas na API pública do módulo.
  game.modules.get(MODULE_ID).api = {
    openStoryboard() {
      new LumennStoryboardApp().render({ force: true });
    },
    LumennAudioEngine,
    LumennInvalidAudioSourceError,
    LumennBeatStore,
    LumennTransitionController,
    LumennStoryboardApp,
  };

  Hooks.on("getSceneControlButtons", (controls) => {
    const tokenControl = Array.isArray(controls)
      ? controls.find((c) => c.name === "token")
      : controls.tokens ?? controls.token;
    if (!tokenControl) return;
    const open = () => game.modules.get(MODULE_ID).api.openStoryboard();
    const tool = { name: "lumenn-frame", title: "Lumenn Frame", icon: "fas fa-film", button: true, visible: !!game.user?.isGM, onChange: open, onClick: open };
    if (Array.isArray(tokenControl.tools)) tokenControl.tools.push(tool);
    else tokenControl.tools = { ...(tokenControl.tools ?? {}), "lumenn-frame": tool };
  });
});
