import test from "node:test";
import assert from "node:assert/strict";

test("scene transition runner passes activation mode explicitly", async () => {
  const calls = [];
  const previousGame = globalThis.game;
  const previousCanvas = globalThis.canvas;
  const previousConfig = globalThis.CONFIG;
  const current = {
    id: "current",
    async view() {
      calls.push("restore");
      globalThis.canvas.scene = current;
    },
  };
  const scene = {
    id: "target",
    async activate() { calls.push("activate"); },
    async view() {
      calls.push("view");
      globalThis.canvas.scene = scene;
    },
  };
  globalThis.game = { release: { generation: 14 }, user: { isGM: true } };
  globalThis.canvas = {
    scene: current,
    app: { renderer: {} },
    transition: {
      async run(options) {
        calls.push(options.activate);
        await options.nextScene.view();
      },
    },
  };
  globalThis.CONFIG = { Canvas: { sceneTransitions: {
    "lumenn-zoom-in": { id: "lumenn-zoom-in" },
  } } };

  const { LumennCompat } = await import("../scripts/foundry-compat.mjs");
  assert.equal(
    await LumennCompat.runSceneTransition({
      scene,
      type: "lumenn-zoom-in",
      activate: true,
    }),
    "native",
  );
  assert.deepEqual(calls, [true, "view"]);

  calls.length = 0;
  globalThis.canvas.scene = current;
  assert.equal(
    await LumennCompat.previewSceneTransition({
      scene,
      type: "lumenn-zoom-in",
      duration: 0,
    }),
    "native",
  );
  assert.deepEqual(calls, [false, "view", "restore"]);

  globalThis.game = previousGame;
  globalThis.canvas = previousCanvas;
  globalThis.CONFIG = previousConfig;
});
