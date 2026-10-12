import test from "node:test";
import assert from "node:assert/strict";

test("sortGraphsByName persists a case-insensitive natural order", async () => {
  let saved;
  const data = {
    schemaVersion: 2,
    graphs: [
      { id: "b", name: "zeta" },
      { id: "a", name: "Ato 10" },
      { id: "c", name: "ato 2" },
    ],
  };
  globalThis.foundry = {
    utils: { duplicate: (value) => structuredClone(value) },
  };
  globalThis.game = {
    user: { isGM: true },
    i18n: { lang: "pt-BR" },
    settings: {
      get: () => data,
      set: async (_module, _key, value) => {
        saved = value;
      },
    },
  };
  const { LumennGraphStore } = await import("../scripts/graph-store.mjs");
  await LumennGraphStore.sortGraphsByName();
  assert.deepEqual(saved.graphs.map((graph) => graph.name), ["ato 2", "Ato 10", "zeta"]);
});
