import test, { mock } from "node:test";
import assert from "node:assert/strict";
import { LumennAudioEngine } from "../scripts/audio-engine.mjs";

/**
 * Todo update() de PlaylistSound chama sync() no Foundry: restaurar o `fade` do
 * usuário durante o crossfade vira corte seco no fade-out e encurta o fade-in.
 * O motor só restaura depois do fim do fade (duração + folga).
 */
function fakeLibrary(userFades) {
  const docs = new Map();
  const playlist = {
    sounds: [],
    async updateEmbeddedDocuments() {},
    async playSound(sound) {
      sound.playing = true;
    },
  };
  const make = (id, fade, playing = false) => {
    const doc = {
      documentName: "PlaylistSound",
      id,
      uuid: `Playlist.p1.PlaylistSound.${id}`,
      fade,
      playing,
      parent: playlist,
      async update(patch) {
        Object.assign(this, patch);
      },
    };
    playlist.sounds.push(doc);
    docs.set(doc.uuid, doc);
    return doc;
  };
  const a = make("a", userFades.a, true);
  const b = make("b", userFades.b, false);
  playlist.sounds.filter = Array.prototype.filter.bind(playlist.sounds);
  globalThis.fromUuidSync = (uuid) => docs.get(uuid);
  return { a, b };
}

test("o fade do usuário só volta depois que o crossfade termina", async () => {
  mock.timers.enable({ apis: ["setTimeout"] });
  const saved = globalThis.fromUuidSync;
  try {
    const { a, b } = fakeLibrary({ a: 1, b: 0 });
    const engine = new LumennAudioEngine();
    const result = await engine.applyMode(
      "crossfade",
      [{ type: "track", id: a.uuid, role: "music" }],
      [{ type: "track", id: b.uuid, role: "music" }],
      3000,
    );
    assert.equal(result, "crossfaded");
    assert.equal(a.playing, false);
    assert.equal(b.playing, true);
    assert.equal(a.fade, 3000, "fade-out usa a duração do crossfade");
    assert.equal(b.fade, 3000, "fade-in usa a duração do crossfade");

    mock.timers.tick(3400);
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(a.fade, 3000, "ainda dentro do fade: não restaurou");
    assert.equal(b.fade, 3000);

    mock.timers.tick(200);
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(a.fade, 1, "restaurado depois do fim");
    assert.equal(b.fade, 0);
  } finally {
    mock.timers.reset();
    globalThis.fromUuidSync = saved;
  }
});

test("uma nova transição reagenda a restauração em vez de cortar a anterior", async () => {
  mock.timers.enable({ apis: ["setTimeout"] });
  const saved = globalThis.fromUuidSync;
  try {
    const { a, b } = fakeLibrary({ a: 1, b: 0 });
    const engine = new LumennAudioEngine();
    const A = { type: "track", id: a.uuid, role: "music" };
    const B = { type: "track", id: b.uuid, role: "music" };
    await engine.applyMode("crossfade", [A], [B], 2000);
    mock.timers.tick(2000);
    await engine.applyMode("crossfade", [B], [A], 2000);
    mock.timers.tick(2400);
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(a.fade, 2000, "a segunda transição ainda corre");
    mock.timers.tick(200);
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(a.fade, 1);
    assert.equal(b.fade, 0);
  } finally {
    mock.timers.reset();
    globalThis.fromUuidSync = saved;
  }
});

test("faixa carregando ou ainda entrando mantém o fade até terminar de entrar", async () => {
  mock.timers.enable({ apis: ["setTimeout"] });
  const saved = globalThis.fromUuidSync;
  const flush = () => new Promise((resolve) => setImmediate(resolve));
  try {
    const { a, b } = fakeLibrary({ a: 1, b: 0 });
    b.sound = { playing: false, currentTime: 0 }; // ainda decodificando
    const engine = new LumennAudioEngine();
    await engine.applyMode(
      "crossfade",
      [{ type: "track", id: a.uuid, role: "music" }],
      [{ type: "track", id: b.uuid, role: "music" }],
      3000,
    );
    mock.timers.tick(3600);
    await flush();
    assert.equal(b.fade, 3000, "carregando: não restaura");
    b.sound.playing = true;
    b.sound.currentTime = 1; // entrando
    mock.timers.tick(300);
    await flush();
    assert.equal(b.fade, 3000, "ainda dentro do fade-in");
    b.sound.currentTime = 3.1; // terminou de entrar
    mock.timers.tick(300);
    await flush();
    assert.equal(b.fade, 0, "restaurado depois de entrar");
    assert.equal(a.fade, 1);
  } finally {
    mock.timers.reset();
    globalThis.fromUuidSync = saved;
  }
});

test("o alvo é carregado antes de começar o crossfade", async () => {
  mock.timers.enable({ apis: ["setTimeout"] });
  const saved = globalThis.fromUuidSync;
  try {
    const { a, b } = fakeLibrary({ a: 1, b: 0 });
    const order = [];
    b.load = async () => {
      order.push("load");
    };
    const playlist = b.parent;
    const play = playlist.playSound;
    playlist.playSound = async (sound) => {
      order.push("play");
      return play(sound);
    };
    const engine = new LumennAudioEngine();
    await engine.applyMode(
      "crossfade",
      [{ type: "track", id: a.uuid, role: "music" }],
      [{ type: "track", id: b.uuid, role: "music" }],
      1000,
    );
    assert.deepEqual(order, ["load", "play"]);
  } finally {
    mock.timers.reset();
    globalThis.fromUuidSync = saved;
  }
});
