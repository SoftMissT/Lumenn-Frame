import test from 'node:test';
import assert from 'node:assert/strict';
import { ancestorChain, buildNeuralContext } from '../scripts/neural-context.mjs';

const labelOf = (node) => node.data?.title ?? node.id;
const campaign = () => [
    {
        id: 'root',
        name: 'Campanha',
        anchors: { intro: 'a', output: null },
        activeNodeId: 'a',
        nodes: [
            { id: 'a', type: 'scene', data: { title: 'Abertura' } },
            { id: 'b', type: 'scene', data: { title: 'Praça' } },
            { id: 'h', type: 'hive-ref', data: { graphId: 'hive' } },
            { id: 'm', type: 'audio', data: { title: 'Tema' } },
            { id: 'n', type: 'note', data: {} },
        ],
        edges: [
            { id: 'e1', type: 'flow', from: 'a', to: 'b' },
            { id: 'e2', type: 'flow', from: 'a', to: 'h' },
            { id: 'e3', type: 'audio', from: 'm', to: 'a' },
        ],
    },
    {
        id: 'hive',
        name: 'Torre',
        isHive: true,
        hive: { ports: [{ id: 'p1', direction: 'entry' }, { id: 'p2', direction: 'exit' }, { id: 'p3', direction: 'exit' }] },
        activeNodeId: 's1',
        nodes: [
            { id: 's1', type: 'scene', data: { title: 'Sala 1' } },
            { id: 's2', type: 'scene', data: { title: 'Sala 2' } },
        ],
        edges: [{ id: 'e4', type: 'flow', from: 's1', to: 's2' }],
    },
];

test('contagens de células, sinapses e membranas', () => {
    const ctx = buildNeuralContext(campaign(), 'root', { labelOf });
    assert.equal(ctx.found, true);
    assert.deepEqual(ctx.cells, { scene: 2, audio: 1, note: 1, hive: 1, group: 0, encounter: 0, other: 0, total: 5 });
    assert.deepEqual(ctx.links, { flow: 2, audio: 1, total: 3 });
    assert.deepEqual(ctx.ports, { entry: 0, exit: 0 });
    const hive = buildNeuralContext(campaign(), 'hive', { labelOf });
    assert.deepEqual(hive.ports, { entry: 1, exit: 2 });
    assert.equal(hive.kind, 'hive');
});

test('endereço e trilha de ancestrais pelos hive-ref', () => {
    const ctx = buildNeuralContext(campaign(), 'hive', { labelOf });
    assert.equal(ctx.address, 'Campanha / Torre');
    assert.deepEqual(ctx.crumbs.map((c) => c.name), ['Campanha', 'Torre']);
    assert.deepEqual(ancestorChain(campaign(), 'root').map((c) => c.graphId), ['root']);
    assert.deepEqual(ancestorChain(campaign(), 'nada'), []);
});

test('âncoras: definida, onde mora e ausente', () => {
    const ctx = buildNeuralContext(campaign(), 'root', { labelOf });
    assert.equal(ctx.anchors.intro.status, 'found');
    assert.equal(ctx.anchors.intro.name, 'Abertura');
    assert.equal(ctx.anchors.intro.here, true);
    assert.equal(ctx.anchors.output.status, 'not-set');
    assert.equal(ctx.anchors.output.here, false);
    // Dentro da Hive, a âncora é da raiz e não está "aqui".
    const inside = buildNeuralContext(campaign(), 'hive', { labelOf });
    assert.equal(inside.anchors.intro.name, 'Abertura');
    assert.equal(inside.anchors.intro.here, false);
});

test('destinos: tudo que dá para saltar, menos o próprio grafo', () => {
    const ctx = buildNeuralContext(campaign(), 'root', { labelOf });
    // Hive (1 grafo) + 2 nós da Hive; os 5 nós da raiz contam como locais internos.
    assert.equal(ctx.destinations, 1 + 2 + 5);
});

test('sinapses que saem do nó ativo', () => {
    const ctx = buildNeuralContext(campaign(), 'root', { labelOf });
    assert.deepEqual(ctx.outgoing.map((o) => [o.name, o.type]), [['Praça', 'flow'], ['h', 'flow']]);
    const none = campaign();
    none[0].activeNodeId = null;
    assert.deepEqual(buildNeuralContext(none, 'root', { labelOf }).outgoing, []);
});

test('grafo inexistente e dados ausentes não lançam', () => {
    assert.deepEqual(buildNeuralContext(campaign(), 'zz'), { found: false, graphId: 'zz' });
    assert.equal(buildNeuralContext(undefined, 'x').found, false);
    const sparse = buildNeuralContext([{ id: 'g', name: 'G' }], 'g');
    assert.equal(sparse.cells.total, 0);
    assert.deepEqual(sparse.ports, { entry: 0, exit: 0 });
});
