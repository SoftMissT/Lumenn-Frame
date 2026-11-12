import test from 'node:test';
import assert from 'node:assert/strict';
import {
    connectIntent,
    hiveExportFileName,
    orphanExitEdges,
    portHubView,
    resolveHiveExitEdge,
} from '../scripts/hive-io.mjs';
const hive = (ports) => ({
    id: 'h1',
    name: 'Escola',
    isHive: true,
    hive: { ports },
    nodes: [
        { id: 'gate', type: 'scene', data: { sceneId: 'S1' } },
        { id: 'back', type: 'scene', data: { sceneId: 'S2' } },
    ],
    edges: [],
});
const PORTS = [
    { id: 'p1', name: 'Portão', direction: 'entry', nodeId: 'gate' },
    { id: 'p2', name: 'Fundos', direction: 'exit', nodeId: 'back' },
    { id: 'p3', name: 'Telhado', direction: 'exit', nodeId: 'back' },
];
test('aresta de saída guarda exitPortId e resolve a porta certa', () => {
    const parent = {
        nodes: [{ id: 'ref', type: 'hive-ref', data: { graphId: 'h1' } }],
        edges: [
            { id: 'e1', type: 'flow', from: 'ref', to: 'yard', exitPortId: 'p2' },
            { id: 'e2', type: 'flow', from: 'ref', to: 'roof', exitPortId: 'p3' },
        ],
    };
    assert.equal(resolveHiveExitEdge(parent, 'ref', 'p2').to, 'yard');
    assert.equal(resolveHiveExitEdge(parent, 'ref', 'p3').to, 'roof');
    assert.equal(resolveHiveExitEdge(parent, 'ref', 'ghost'), null);
    assert.equal(
        resolveHiveExitEdge(parent, 'ref', null),
        null,
        'duas saídas: porta é obrigatória'
    );
});
test('portHubView conta as arestas de cada porta e separa entrada de saída', () => {
    const parentEdges = [
        { id: 'e1', type: 'flow', from: 'outside', to: 'ref', portId: 'p1' },
        { id: 'e2', type: 'flow', from: 'ref', to: 'yard', exitPortId: 'p2' },
        { id: 'e3', type: 'flow', from: 'ref', to: 'yard2', exitPortId: 'p2' },
        { id: 'e4', type: 'audio', from: 'ref', to: 'yard', exitPortId: 'p3' },
    ];
    const view = portHubView(hive(PORTS), parentEdges, 'ref');
    assert.deepEqual(
        view.entries.map((port) => [port.id, port.socket, port.links]),
        [['p1', 'flow-in', 1]]
    );
    assert.deepEqual(
        view.exits.map((port) => [port.id, port.socket, port.links]),
        [
            ['p2', 'flow-out', 2],
            ['p3', 'flow-out', 0],
        ],
        'áudio não conta como ligação de fluxo'
    );
});
test('trilho e popover leem a mesma lista de portas', () => {
    const source = hive(PORTS);
    assert.deepEqual(portHubView(source, [], 'ref'), portHubView(source, [], 'ref'));
});
test('aresta legada sem portId conta na porta de entrada padrão', () => {
    const legacy = [{ id: 'e0', type: 'flow', from: 'outside', to: 'ref' }];
    const view = portHubView(hive(PORTS), legacy, 'ref');
    assert.equal(view.entries[0].links, 1, 'sem portId, entra pela primeira porta com sala');
});
test('porta removida deixa a aresta órfã e não quebra', () => {
    const edges = [
        { id: 'e1', type: 'flow', from: 'ref', to: 'yard', exitPortId: 'p2' },
        { id: 'e2', type: 'flow', from: 'ref', to: 'roof', exitPortId: 'p9' },
        { id: 'e3', type: 'flow', from: 'ref', to: 'note' },
    ];
    const orphans = orphanExitEdges(hive(PORTS), edges, 'ref');
    assert.deepEqual(
        orphans.map((edge) => edge.id),
        ['e2']
    );
    assert.deepEqual(orphanExitEdges(hive(PORTS), [], 'ref'), []);
    assert.equal(portHubView(hive([]), edges, 'ref').exits.length, 0);
});
test('clique simples desarma, Shift encadeia e Ctrl alterna sem desarmar', () => {
    assert.deepEqual(connectIntent({ target: 'a' }), { action: 'create', keepArmed: false });
    assert.deepEqual(connectIntent({ target: 'a', shiftKey: true }), {
        action: 'create',
        keepArmed: true,
    });
    assert.deepEqual(connectIntent({ target: 'a', ctrlKey: true }), {
        action: 'toggle',
        keepArmed: true,
    });
    assert.deepEqual(connectIntent({ target: 'a', ctrlKey: true, shiftKey: true }), {
        action: 'toggle',
        keepArmed: true,
    });
    assert.deepEqual(connectIntent({ target: null }), { action: 'disarm', keepArmed: false });
});
test('nome do arquivo exportado é estável e sem caractere proibido', () => {
    const name = hiveExportFileName(
        'Escola São João / Ato 1',
        new Date('2026-11-11T12:34:56.789Z')
    );
    assert.equal(name, 'Escola-Sao-Joao-Ato-1-2026-11-11T12-34-56.json');
    assert.match(hiveExportFileName(''), /^hive-/);
});
