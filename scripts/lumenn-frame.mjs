import { LumennBeatStore } from "./beat-store.mjs";
import { LumennStoryboardApp } from "./storyboard-app.mjs";
import { registerHandlebarsHelpers } from "./handlebars-helpers.mjs";

const MODULE_ID = "lumenn-frame";

Hooks.once("init", () => {
  registerHandlebarsHelpers();
  LumennBeatStore.registerSettings();

  game.modules.get(MODULE_ID).api = {
    openStoryboard() {
      new LumennStoryboardApp().render(true);
    },
  };

  if (game.user.isGM) {
    Hooks.on("getSceneControls", (controls) => {
      controls.find((c) => c.name === "token")?.tools.push({
        name: "lumenn-frame",
        title: "Lumenn Frame",
        icon: "fas fa-film",
        button: true,
        onClick: () => game.modules.get(MODULE_ID).api.openStoryboard(),
      });
    });
  }

  console.log(`${MODULE_ID}: initialized`);
});

Hooks.once("ready", () => {
  console.log(`${MODULE_ID}: ready`);
});
