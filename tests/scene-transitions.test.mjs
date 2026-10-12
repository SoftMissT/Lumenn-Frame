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
    active: false,
    async activate(options) { calls.push(["activate", options?.viewOptions]); },
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
  // A Scene é visualizada dentro do run (que aguarda o draw) e só depois ativada:
  // activate() dentro do run deixa o Canvas#draw resetar a captura e usar a
  // transição da própria Scene.
  assert.equal(
    await LumennCompat.runSceneTransition({
      scene,
      type: "lumenn-zoom-in",
      duration: 900,
      activate: true,
    }),
    "native",
  );
  assert.deepEqual(calls, [
    false,
    "view",
    ["activate", { transition: { type: "lumenn-zoom-in", duration: 900 } }],
  ]);

  calls.length = 0;
  globalThis.canvas.scene = current;
  scene.active = true;
  await LumennCompat.runSceneTransition({
    scene,
    type: "lumenn-zoom-in",
    activate: true,
  });
  assert.deepEqual(calls, [false, "view"], "Scene já ativa não é reativada");
  scene.active = false;

  calls.length = 0;
  assert.equal(
    await LumennCompat.runSceneTransition({ scene, type: "cut", activate: true }),
    "cut",
  );
  assert.deepEqual(calls, [["activate", { transition: { type: null } }]]);

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
