import test from "node:test";
import assert from "node:assert/strict";

const settings = { graphs: { schemaVersion: 2, graphs: [] } };
let writes = 0;

globalThis.game = {
  user: { isGM: true },
  settings: {
    get: (namespace, key) => settings[key],
    set: async (namespace, key, value) => {
      writes += 1;
      settings[key] = value;
    },
  },
};

globalThis.foundry = {
  utils: {
    duplicate: (value) => structuredClone(value),
    randomID: () => "test",
  },
};

const { LumennGraphStore } = await import("../scripts/graph-store.mjs");

function seed(graph) {
  settings.graphs = { schemaVersion: 2, graphs: [graph] };
  settings.graphsBackup = "";
  writes = 0;
}

test("addNode cria grupo sem setting defaultGroup e aceita parentId", async () => {
  seed({ id: "g", name: "G", activeNodeId: null, nodes: [], edges: [] });
  const group = await LumennGraphStore.addNode("g", {
    type: "group",
    position: { x: 0, y: 0 },
  });
  assert.equal(group.type, "group");
  assert.equal(group.parentId, null);
  assert.match(group.color, /^#[0-9a-f]{6}$/i);
});

test("updateNodes grava uma vez para vários nós", async () => {
  seed({
    id: "g",
    name: "G",
    activeNodeId: null,
    nodes: [
      { id: "a", type: "scene", position: { x: 0, y: 0 }, data: {} },
      { id: "b", type: "scene", position: { x: 0, y: 0 }, data: {} },
      { id: "group", type: "group", position: { x: 0, y: 0 }, data: {} },
    ],
    edges: [],
  });
  const updated = await LumennGraphStore.updateNodes("g", [
    { id: "a", position: { x: 10, y: 20 } },
    { id: "b", parentId: "group" },
  ]);
  assert.equal(writes, 1);
  assert.equal(updated.length, 2);
  assert.deepEqual(settings.graphs.graphs[0].nodes[0].position, {
    x: 10,
    y: 20,
  });
  assert.equal(settings.graphs.graphs[0].nodes[1].parentId, "group");
});

test("deleteNode de grupo desagrupa, preserva salas e limpa o nó ativo", async () => {
  seed({
    id: "g",
    name: "G",
    activeNodeId: "group",
    nodes: [
      { id: "group", type: "group", position: { x: 0, y: 0 }, data: {} },
      {
        id: "a",
        type: "scene",
        parentId: "group",
        position: { x: 0, y: 0 },
        data: {},
      },
      {
        id: "b",
        type: "scene",
        parentId: "group",
        position: { x: 0, y: 0 },
        data: {},
      },
    ],
    edges: [{ id: "e", type: "flow", from: "a", to: "b" }],
  });
  const ok = await LumennGraphStore.deleteNode("g", "group");
  const graph = settings.graphs.graphs[0];
  assert.equal(ok, true);
  assert.deepEqual(
    graph.nodes.map((node) => node.id),
    ["a", "b"],
  );
  assert.equal(graph.nodes[0].parentId, null);
  assert.equal(graph.nodes[1].parentId, null);
  assert.equal(graph.edges.length, 1);
  assert.equal(graph.activeNodeId, null);
});

test("migrate ignora schemaVersion futura em vez de apagar os grafos", async () => {
  settings.graphs = {
    schemaVersion: 3,
    graphs: [{ id: "g", name: "G", activeNodeId: null, nodes: [], edges: [] }],
  };
  const result = await LumennGraphStore.migrate();
  assert.equal(result.migrated, false);
  assert.equal(result.future, true);
  assert.equal(settings.graphs.graphs.length, 1);
});

test("migrate bloqueia v1 com grafos existentes e grava backup", async () => {
  seed({
    id: "g",
    name: "G",
    activeNodeId: null,
    nodes: [{ id: "a", type: "scene", position: { x: 0, y: 0 }, data: {} }],
    edges: [],
  });
  settings.graphs.schemaVersion = 1;
  const result = await LumennGraphStore.migrate();
  assert.equal(result.blocked, true);
  assert.equal(settings.graphs.graphs[0].nodes.length, 1);
  assert.match(settings.graphsBackup, /"schemaVersion":1/);
});

test("updateNode ignora id, type e parentId inválido", async () => {
  seed({
    id: "g",
    name: "G",
    activeNodeId: null,
    nodes: [
      { id: "group", type: "group", position: { x: 0, y: 0 }, data: {} },
      { id: "a", type: "scene", position: { x: 0, y: 0 }, data: {} },
      { id: "b", type: "scene", position: { x: 0, y: 0 }, data: {} },
    ],
    edges: [],
  });
  const node = await LumennGraphStore.updateNode("g", "a", {
    id: "x",
    type: "group",
    parentId: "missing",
  });
  assert.equal(node.id, "a");
  assert.equal(node.type, "scene");
  assert.equal(node.parentId, undefined);
  await LumennGraphStore.updateNode("g", "a", { parentId: "group" });
  assert.equal(settings.graphs.graphs[0].nodes[1].parentId, "group");
  await LumennGraphStore.updateNode("g", "group", { parentId: "group" });
  assert.equal(settings.graphs.graphs[0].nodes[0].parentId, undefined);
  await LumennGraphStore.updateNode("g", "a", { parentId: "b" });
  assert.equal(settings.graphs.graphs[0].nodes[1].parentId, "group");});

test("updateNodes também remove id e type do patch", async () => {
  seed({
    id: "g",
    name: "G",
    activeNodeId: null,
    nodes: [{ id: "a", type: "scene", position: { x: 0, y: 0 }, data: {} }],
    edges: [],
  });
  await LumennGraphStore.updateNodes("g", [
    { id: "a", type: "group", notes: "ok" },
  ]);
  const node = settings.graphs.graphs[0].nodes[0];
  assert.equal(node.id, "a");
  assert.equal(node.type, "scene");
  assert.equal(node.notes, "ok");
});

test("migrate não roda para jogador", async () => {
  seed({
    id: "g",
    name: "G",
    activeNodeId: null,
    nodes: [],
    edges: [],
  });
  settings.graphs.schemaVersion = 1;
  game.user.isGM = false;
  const result = await LumennGraphStore.migrate();
  game.user.isGM = true;
  assert.equal(result.gm, false);
  assert.equal(writes, 0);
  assert.equal(settings.graphs.schemaVersion, 1);
});

test("updateNodes não escreve para jogador", async () => {
  seed({
    id: "g",
    name: "G",
    activeNodeId: null,
    nodes: [{ id: "a", type: "scene", position: { x: 0, y: 0 }, data: {} }],
    edges: [],
  });
  game.user.isGM = false;
  const updated = await LumennGraphStore.updateNodes("g", [
    { id: "a", position: { x: 9, y: 9 } },
  ]);
  game.user.isGM = true;
  assert.deepEqual(updated, []);
  assert.equal(writes, 0);
});
