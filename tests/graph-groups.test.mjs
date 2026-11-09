import test from "node:test";
import assert from "node:assert/strict";
import {
  GROUP_PADDING,
  childrenOf,
  effectiveEndpoint,
  groupBounds,
  groupOpenFor,
  isGroupNode,
  movePositions,
  parentMap,
  ungroupIds,
} from "../scripts/graph-groups.mjs";

const sizeOf = (type) => (type === "group" ? [360, 240] : [200, 100]);

const graph = {
  nodes: [
    { id: "g1", type: "group", position: { x: 0, y: 0 } },
    { id: "s1", type: "scene", parentId: "g1", position: { x: 100, y: 50 } },
    { id: "s2", type: "scene", parentId: "g1", position: { x: 400, y: 250 } },
    { id: "s3", type: "scene", position: { x: 900, y: 900 } },
  ],
};

test("isGroupNode só aceita type group", () => {
  assert.equal(isGroupNode({ type: "group" }), true);
  assert.equal(isGroupNode({ type: "scene" }), false);
  assert.equal(isGroupNode(null), false);
});

test("childrenOf devolve só os filhos diretos", () => {
  assert.deepEqual(
    childrenOf(graph.nodes, "g1").map((node) => node.id),
    ["s1", "s2"],
  );
  assert.deepEqual(childrenOf(graph.nodes, "s3"), []);
});

test("groupBounds une os filhos com margem", () => {
  assert.deepEqual(groupBounds(graph.nodes, "g1", sizeOf), {
    x: 100 - GROUP_PADDING,
    y: 50 - GROUP_PADDING,
    width: 500 + GROUP_PADDING * 2,
    height: 300 + GROUP_PADDING * 2,
  });
});

test("groupBounds devolve null para grupo vazio", () => {
  assert.equal(groupBounds(graph.nodes, "vazio", sizeOf), null);
});

test("groupBounds aceita posição provisória do arrasto", () => {
  const moved = new Map([["s2", { x: 500, y: 300 }]]);
  const bounds = groupBounds(
    graph.nodes,
    "g1",
    sizeOf,
    GROUP_PADDING,
    (node) => moved.get(node.id) ?? node.position,
  );
  assert.equal(bounds.width, 500 - 100 + 200 + GROUP_PADDING * 2);
  assert.equal(bounds.height, 300 - 50 + 100 + GROUP_PADDING * 2);
});

test("effectiveEndpoint troca filho pela caixa só com o grupo fechado", () => {
  const parents = parentMap(graph.nodes);
  assert.equal(effectiveEndpoint("s1", parents, new Set(["g1"])), "g1");
  assert.equal(effectiveEndpoint("s1", parents, new Set()), "s1");
  assert.equal(effectiveEndpoint("s3", parents, new Set(["g1"])), "s3");
});

test("groupOpenFor abre por nó ativo, por navegável ou por trava", () => {
  assert.equal(groupOpenFor("g1", graph.nodes, "s1", new Set()), true);
  assert.equal(groupOpenFor("g1", graph.nodes, "s3", new Set(["s2"])), true);
  assert.equal(groupOpenFor("g1", graph.nodes, "s3", new Set()), false);
  assert.equal(
    groupOpenFor("g1", graph.nodes, "s3", new Set(), new Set(["g1"])),
    true,
  );
});

test("movePositions aplica o mesmo delta e arredonda", () => {
  assert.deepEqual(
    movePositions(childrenOf(graph.nodes, "g1"), { x: 10.4, y: -5.6 }),
    [
      { id: "s1", position: { x: 110, y: 44 } },
      { id: "s2", position: { x: 410, y: 244 } },
    ],
  );
});

test("ungroupIds lista os filhos para limpar parentId", () => {
  assert.deepEqual(ungroupIds(graph.nodes, "g1"), ["s1", "s2"]);
});
