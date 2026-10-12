import test from "node:test";
import assert from "node:assert/strict";

/**
 * Contrato da troca de Scene no Foundry 14.367 (medido no mundo real):
 * - `canvas.transition.run({nextScene})` não anima (o draw destrói a captura);
 *   o efeito sai por `viewOptions.transition` em `view()`/`activate()`.
 * - `activate()` dispara `PlaylistCollection#_onChangeScene`, que corta a música;
 *   o Lumenn o suspende só durante a ativação.
 */
function setup({ gm = true } = {}) {
  const saved = {
    game: globalThis.game,
    canvas: globalThis.canvas,
    CONFIG: globalThis.CONFIG,
  };
  const calls = [];
  const sceneChange = { hits: 0 };
  const original = async () => {
    sceneChange.hits += 1;
  };
  globalThis.game = {
    release: { generation: 14 },
    user: { isGM: gm },
    playlists: { _onChangeScene: original },
  };
  globalThis.CONFIG = {
    Canvas: {
      sceneTransitions: {
        fade: { id: "fade" },
        "lumenn-zoom-in": { id: "lumenn-zoom-in" },
      },
    },
  };
  globalThis.canvas = {
    scene: null,
    ready: true,
    loading: false,
    transition: { isRunning: false, promise: null },
  };
  const startTransition = (options) => {
    if (!options?.transition?.type) return;
    const t = globalThis.canvas.transition;
    t.isRunning = true;
    t.promise = new Promise((resolve) =>
      setTimeout(() => {
        t.isRunning = false;
        resolve();
      }, 15),
    );
  };
  const makeScene = (id, { active = false } = {}) => {
    const scene = {
      id,
      active,
      async view(options) {
        calls.push(["view", id, options?.transition ?? null]);
        globalThis.canvas.scene = scene;
        startTransition(options);
      },
      async activate(options) {
        // O Foundry chama isso dentro do update da ativação.
        await globalThis.game.playlists._onChangeScene(scene);
        calls.push(["activate", id, options?.viewOptions?.transition ?? null, sceneChange.hits]);
        scene.active = true;
        globalThis.canvas.scene = scene;
        startTransition(options?.viewOptions);
      },
    };
    return scene;
  };
  return {
    calls,
    sceneChange,
    original,
    makeScene,
    restore() {
      globalThis.game = saved.game;
      globalThis.canvas = saved.canvas;
      globalThis.CONFIG = saved.CONFIG;
    },
  };
}

test("ativação leva a transição da edge a todos os clientes e suspende a playlist da Scene", async () => {
  const env = setup();
  try {
    const { LumennCompat } = await import("../scripts/foundry-compat.mjs");
    const scene = env.makeScene("target");
    assert.equal(
      await LumennCompat.runSceneTransition({
        scene,
        type: "lumenn-zoom-in",
        duration: 900,
        activate: true,
      }),
      "native",
    );
    assert.deepEqual(env.calls, [
      ["activate", "target", { type: "lumenn-zoom-in", duration: 900 }, 0],
    ]);
    assert.equal(env.sceneChange.hits, 0, "o hook do Foundry não cortou a música");
    assert.equal(game.playlists._onChangeScene, env.original, "hook restaurado");
    await game.playlists._onChangeScene(scene);
    assert.equal(env.sceneChange.hits, 1, "o hook volta a funcionar fora da ativação");
  } finally {
    env.restore();
  }
});

test("sem fade para jogadores: o GM vê o efeito em view() e a ativação sai sem efeito", async () => {
  const env = setup();
  try {
    const { LumennCompat } = await import("../scripts/foundry-compat.mjs");
    const scene = env.makeScene("target");
    await LumennCompat.runSceneTransition({
      scene,
      type: "fade",
      duration: 500,
      playersTransition: false,
    });
    assert.deepEqual(env.calls, [
      ["view", "target", { type: "fade", duration: 500 }],
      ["activate", "target", { type: null }, 0],
    ]);
  } finally {
    env.restore();
  }
});

test("Scene já ativa só é visualizada com o efeito, sem reativar", async () => {
  const env = setup();
  try {
    const { LumennCompat } = await import("../scripts/foundry-compat.mjs");
    const scene = env.makeScene("target", { active: true });
    await LumennCompat.runSceneTransition({ scene, type: "fade", duration: 300 });
    assert.deepEqual(env.calls, [["view", "target", { type: "fade", duration: 300 }]]);
  } finally {
    env.restore();
  }
});

test("corte é seco: ativa com type null e não espera animação", async () => {
  const env = setup();
  try {
    const { LumennCompat } = await import("../scripts/foundry-compat.mjs");
    const scene = env.makeScene("target");
    assert.equal(await LumennCompat.runSceneTransition({ scene, type: "cut" }), "cut");
    assert.deepEqual(env.calls, [["activate", "target", { type: null }, 0]]);
  } finally {
    env.restore();
  }
});

test("tipo fora do registry cai no fallback sem ativar nada", async () => {
  const env = setup();
  try {
    const { LumennCompat } = await import("../scripts/foundry-compat.mjs");
    const scene = env.makeScene("target");
    assert.equal(await LumennCompat.runSceneTransition({ scene, type: "dip" }), "fallback");
    assert.deepEqual(env.calls, []);
  } finally {
    env.restore();
  }
});

test("a espera só termina quando a animação do canvas termina", async () => {
  const env = setup();
  try {
    const { LumennCompat } = await import("../scripts/foundry-compat.mjs");
    const scene = env.makeScene("target", { active: true });
    const t0 = performance.now();
    await LumennCompat.runSceneTransition({ scene, type: "fade", duration: 15 });
    assert.equal(globalThis.canvas.transition.isRunning, false);
    assert.ok(performance.now() - t0 >= 10, "esperou a animação");
  } finally {
    env.restore();
  }
});

test("o hook é restaurado mesmo quando a ativação falha", async () => {
  const env = setup();
  try {
    const { LumennCompat } = await import("../scripts/foundry-compat.mjs");
    const scene = {
      id: "boom",
      async activate() {
        throw new Error("falhou");
      },
    };
    await assert.rejects(
      LumennCompat.activateScene(scene, undefined, { suppressScenePlaylist: true }),
      /falhou/,
    );
    assert.equal(game.playlists._onChangeScene, env.original);
  } finally {
    env.restore();
  }
});

test("preview não ativa a Scene e restaura a visualizada sem efeito", async () => {
  const env = setup();
  try {
    const { LumennCompat } = await import("../scripts/foundry-compat.mjs");
    const previous = env.makeScene("current");
    globalThis.canvas.scene = previous;
    const scene = env.makeScene("target");
    assert.equal(
      await LumennCompat.previewSceneTransition({ scene, type: "lumenn-zoom-in", duration: 10 }),
      "native",
    );
    assert.deepEqual(env.calls, [
      ["view", "target", { type: "lumenn-zoom-in", duration: 10 }],
      ["view", "current", { type: null }],
    ]);
  } finally {
    env.restore();
  }
});
