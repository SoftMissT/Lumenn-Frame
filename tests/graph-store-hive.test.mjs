import test from 'node:test';
import assert from 'node:assert/strict';

const settings = { graphs: { schemaVersion: 2, graphs: [] } };
let counter = 0;

globalThis.game = {
    user: { isGM: true },
    i18n: { localize: (key) => key, format: (key) => key },
    settings: {
        get: (namespace, key) => settings[key],
        set: async (namespace, key, value) => {
            settings[key] = value;
        },
    },
};
globalThis.foundry = {
    utils: {
        duplicate: (value) => structuredClone(value),
        randomID: () => `id${++counter}`,
    },
};

const { LumennGraphStore } = await import('../scripts/graph-store.mjs');

function seed(...graphs) {
    settings.graphs = { schemaVersion: 2, graphs };
    settings.graphsBackup = '';
}
const room = (id) => ({ id, type: 'scene', position: { x: 0, y: 0 }, data: {} });

test('updateHive grava portas saneadas e a transição padrão sem bump de schema', async () => {
    seed({ id: 'h', name: 'H', activeNodeId: null, isHive: true, nodes: [room('a')], edges: [] });
    const hive = await LumennGraphStore.updateHive('h', {
        ports: [
            { name: 'Portão', direction: 'entry', nodeId: 'a' },
            { name: 'Saída', direction: 'exit', nodeId: 'ghost' },
        ],
        transition: { scene: { type: 'fade', duration: 500 } },
    });
    // A saída do mestre aponta para sala que não existe: fica sem sala, e a Hive ganha
    // uma saída automática (Hive com sala sempre tem entrada e saída válidas).
    assert.equal(hive.ports.length, 3);
    assert.equal(hive.ports[0].nodeId, 'a');
    assert.equal(hive.ports[1].nodeId, null);
    assert.deepEqual([hive.ports[2].direction, hive.ports[2].nodeId, hive.ports[2].auto], ['exit', 'a', true]);
    assert.ok(hive.ports[0].id.startsWith('port_'));
    assert.equal(hive.transition.scene.duration, 500);
    assert.equal(settings.graphs.schemaVersion, 2);
});

test('updateHive recusa storyboard que não é Hive', async () => {
    seed({ id: 'g', name: 'G', activeNodeId: null, nodes: [], edges: [] });
    assert.equal(await LumennGraphStore.updateHive('g', { ports: [] }), null);
});

test('unmarkHive bloqueia Hive em uso e libera quando ninguém a usa', async () => {
    seed(
        { id: 'h', name: 'H', activeNodeId: null, isHive: true, hive: { ports: [] }, nodes: [], edges: [] },
        {
            id: 'p',
            name: 'P',
            activeNodeId: null,
            nodes: [{ id: 'r', type: 'hive-ref', data: { graphId: 'h' } }],
            edges: [],
        }
    );
    assert.equal(await LumennGraphStore.unmarkHive('h'), false);
    settings.graphs.graphs[1].nodes = [];
    assert.equal(await LumennGraphStore.unmarkHive('h'), true);
    assert.equal(LumennGraphStore.getGraph('h').isHive, undefined);
});

test('apagar a sala solta a porta e o Encontro em vez de deixá-los órfãos', async () => {
    seed({
        id: 'h',
        name: 'H',
        activeNodeId: null,
        isHive: true,
        hive: { ports: [{ id: 'p1', name: 'A', direction: 'entry', nodeId: 'a' }] },
        nodes: [room('a'), { id: 'e', type: 'encounter', position: { x: 0, y: 0 }, data: { sceneNodeId: 'a' } }],
        edges: [],
    });
    await LumennGraphStore.deleteNode('h', 'a');
    const graph = LumennGraphStore.getGraph('h');
    assert.equal(graph.hive.ports[0].nodeId, null);
    assert.equal(graph.nodes[0].data.sceneNodeId, null);
});

test('addNodeBlockReason explica a recusa em vez de devolver null mudo', () => {
    seed(
        { id: 'plain', name: 'Plain', activeNodeId: null, nodes: [], edges: [] },
        { id: 'h', name: 'H', activeNodeId: null, isHive: true, nodes: [], edges: [] }
    );
    assert.equal(
        LumennGraphStore.addNodeBlockReason('plain', { type: 'encounter' }),
        'encounter-outside-hive'
    );
    assert.equal(
        LumennGraphStore.addNodeBlockReason('h', { type: 'hive-ref', data: { graphId: 'h' } }),
        'hive-cycle'
    );
    assert.equal(
        LumennGraphStore.addNodeBlockReason('plain', { type: 'hive-ref', data: { graphId: 'h' } }),
        null
    );
    assert.equal(LumennGraphStore.addNodeBlockReason('ghost', { type: 'scene' }), 'missing-graph');
});

test('trilha de execução fica no storyboard-pai e some quando vazia', async () => {
    seed({ id: 'root', name: 'Root', activeNodeId: null, nodes: [], edges: [] });
    const level = { graphId: 'h', activeNodeId: 'a', viaPortId: 'p1', refNodeId: 'r' };
    await LumennGraphStore.setLiveTrail('root', [level]);
    assert.deepEqual(LumennGraphStore.getLiveTrail('root'), [level]);
    await LumennGraphStore.setLiveTrail('root', []);
    assert.deepEqual(LumennGraphStore.getLiveTrail('root'), []);
    assert.equal('liveTrail' in LumennGraphStore.getGraph('root'), false);
});

test('convertGroupToHive grava pai e Hive numa escrita só', async () => {
    seed({
        id: 'root',
        name: 'Root',
        activeNodeId: 'a',
        nodes: [
            room('out'),
            { id: 'g', type: 'group', position: { x: 0, y: 0 }, data: { title: 'Escola' } },
            { ...room('a'), parentId: 'g' },
            { ...room('b'), parentId: 'g' },
        ],
        edges: [
            { id: 'e1', type: 'flow', from: 'out', to: 'a' },
            { id: 'e2', type: 'flow', from: 'a', to: 'b' },
        ],
    });
    let writes = 0;
    const set = game.settings.set;
    game.settings.set = async (...args) => {
        writes += 1;
        return set(...args);
    };
    const plan = await LumennGraphStore.convertGroupToHive('root', 'g', (node) => node.id);
    game.settings.set = set;
    assert.equal(writes, 1);
    const root = LumennGraphStore.getGraph('root');
    assert.deepEqual(root.nodes.map((node) => node.type).sort(), ['hive-ref', 'scene']);
    assert.equal(root.activeNodeId, plan.refNode.id);
    const hive = LumennGraphStore.getGraph(plan.hive.id);
    assert.equal(hive.isHive, true);
    assert.equal(hive.hive.ports[0].nodeId, 'a');
    assert.deepEqual(LumennGraphStore.getHiveUsages(hive.id).map((use) => use.graphId), ['root']);
    assert.equal(await LumennGraphStore.convertGroupToHive('root', 'g'), null);
});

const countWrites = async (fn) => {
    let writes = 0;
    const set = game.settings.set;
    game.settings.set = async (...args) => {
        writes += 1;
        return set(...args);
    };
    try {
        await fn();
    } finally {
        game.settings.set = set;
    }
    return writes;
};

test('primeira cena numa Hive vazia já cria entrada e saída, na mesma escrita', async () => {
    seed({ id: 'h', name: 'H', activeNodeId: null, isHive: true, hive: { ports: [] }, nodes: [], edges: [] });
    const writes = await countWrites(() => LumennGraphStore.addNode('h', room('a')));
    assert.equal(writes, 1);
    const ports = LumennGraphStore.getGraph('h').hive.ports;
    assert.deepEqual(ports.map((p) => [p.direction, p.nodeId, p.auto]), [
        ['entry', 'a', true],
        ['exit', 'a', true],
    ]);
});

test('nota numa Hive não cria porta', async () => {
    seed({ id: 'h', name: 'H', activeNodeId: null, isHive: true, hive: { ports: [] }, nodes: [], edges: [] });
    await LumennGraphStore.addNode('h', { id: 'n', type: 'note', data: { title: '', body: '' } });
    assert.deepEqual(LumennGraphStore.getGraph('h').hive.ports, []);
});

test('deleteNodes apaga vários numa escrita e religa a porta auto', async () => {
    seed({
        id: 'h',
        name: 'H',
        activeNodeId: 'a',
        isHive: true,
        hive: {
            ports: [
                { id: 'p1', name: 'Entrada', direction: 'entry', nodeId: 'a', auto: true },
                { id: 'p2', name: 'Saída', direction: 'exit', nodeId: 'a', auto: true },
            ],
        },
        nodes: [room('a'), { ...room('b'), position: { x: 10, y: 10 } }, room('c')],
        edges: [{ id: 'e', type: 'flow', from: 'a', to: 'b' }],
    });
    let count = 0;
    const writes = await countWrites(async () => {
        count = await LumennGraphStore.deleteNodes('h', ['a', 'c', 'fantasma']);
    });
    assert.equal(writes, 1);
    assert.equal(count, 2);
    const graph = LumennGraphStore.getGraph('h');
    assert.deepEqual(graph.nodes.map((n) => n.id), ['b']);
    assert.equal(graph.edges.length, 0);
    assert.equal(graph.activeNodeId, null);
    assert.deepEqual(graph.hive.ports.map((p) => p.nodeId), ['b', 'b']);
    assert.equal(await LumennGraphStore.deleteNodes('h', []), 0);
});

test('ensureAllHivePorts: uma escrita, só Hives, e a segunda rodada não escreve', async () => {
    seed(
        { id: 'h1', name: 'H1', activeNodeId: null, isHive: true, hive: { ports: [] }, nodes: [room('a')], edges: [] },
        { id: 'h2', name: 'H2', activeNodeId: null, isHive: true, hive: { ports: [] }, nodes: [], edges: [] },
        { id: 'sb', name: 'SB', activeNodeId: null, nodes: [room('x')], edges: [] }
    );
    let count = 0;
    const first = await countWrites(async () => {
        count = await LumennGraphStore.ensureAllHivePorts();
    });
    assert.equal(first, 1);
    assert.equal(count, 1);
    assert.equal(LumennGraphStore.getGraph('h1').hive.ports.length, 2);
    assert.equal(LumennGraphStore.getGraph('sb').hive, undefined);
    const second = await countWrites(() => LumennGraphStore.ensureAllHivePorts());
    assert.equal(second, 0);
});

test('importHive grava a Hive nova e recusa id repetido', async () => {
    seed({ id: 'root', name: 'Root', activeNodeId: null, nodes: [], edges: [] });
    const graph = { id: 'new', name: 'N', isHive: true, hive: { ports: [] }, nodes: [], edges: [] };
    assert.ok(await LumennGraphStore.importHive(graph));
    assert.equal(await LumennGraphStore.importHive(graph), null);
    assert.deepEqual(LumennGraphStore.getHives().map((hive) => hive.id), ['new']);
});
