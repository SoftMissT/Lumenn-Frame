import test from 'node:test';
import assert from 'node:assert/strict';
import {
    buildHiveExport,
    hiveEntryPort,
    hiveExitPortsAt,
    listHivePending,
    planHiveImport,
    sanitizeHivePorts,
} from '../scripts/hive-io.mjs';
import { detectHiveCycles, resolveHivePort, validateHiveExport } from '../scripts/hive-runtime.mjs';
const makeHive = () => ({
    id: 'g1',
    name: 'Escola',
    activeNodeId: 'gate',
    isHive: true,
    hive: {
        ports: [
            { id: 'p1', name: 'Portão', direction: 'entry', nodeId: 'gate' },
            { id: 'p2', name: 'Fundos', direction: 'exit', nodeId: 'back' },
        ],
        transition: { scene: { type: 'fade', duration: 800 } },
    },
    nodes: [
        { id: 'gate', type: 'scene', data: { sceneId: 'S1', sourceFolderId: 'F1' } },
        { id: 'back', type: 'scene', data: { sceneId: 'S2' } },
        { id: 'mus', type: 'audio', data: { audioType: 'playlist', audioId: 'PL1', loop: true } },
        { id: 'enc', type: 'encounter', data: { encounterType: 'combat', sceneNodeId: 'gate' } },
    ],
    edges: [
        { id: 'e1', type: 'flow', from: 'gate', to: 'back' },
        { id: 'e2', type: 'audio', from: 'mus', to: 'enc' },
    ],
});
test('resolveHivePort e validação leem as portas de graph.hive.ports', () => {
    const hive = makeHive();
    assert.equal(resolveHivePort(hive, 'portão').node.id, 'gate');
    assert.deepEqual(validateHiveExport({ hives: [hive] }), { valid: true, errors: [] });
});
test('ciclo é visto pelo formato real do store (data.graphId)', () => {
    const a = { id: 'a', nodes: [{ id: 'r', type: 'hive-ref', data: { graphId: 'b' } }] };
    const b = { id: 'b', nodes: [{ id: 'r', type: 'hive-ref', data: { graphId: 'a' } }] };
    assert.deepEqual(detectHiveCycles([a, b]), [['a', 'b', 'a']]);
});
test('Hive aninhada é recusada na validação da v1', () => {
    const hive = { ...makeHive(), nodes: [{ id: 'r', type: 'hive-ref', data: { graphId: 'x' } }] };
    hive.hive.ports = [];
    const result = validateHiveExport({ hives: [hive] });
    assert.equal(result.valid, false);
    assert.match(result.errors[0], /aninhada/);
});
test('hiveEntryPort prefere a pedida e cai na primeira de entrada', () => {
    const hive = makeHive();
    assert.equal(hiveEntryPort(hive, 'p1').id, 'p1');
    assert.equal(hiveEntryPort(hive, 'p2').id, 'p1');
    assert.equal(hiveEntryPort(hive).id, 'p1');
    hive.hive.ports = [{ id: 'p2', name: 'Fundos', direction: 'exit', nodeId: 'back' }];
    assert.equal(hiveEntryPort(hive), null);
});
test('hiveExitPortsAt devolve só saídas da sala', () => {
    const hive = makeHive();
    assert.deepEqual(
        hiveExitPortsAt(hive, 'back').map((port) => port.id),
        ['p2']
    );
    assert.deepEqual(hiveExitPortsAt(hive, 'gate'), []);
});
test('sanitizeHivePorts corrige direção, id e sala inexistente', () => {
    let count = 0;
    const clean = sanitizeHivePorts(
        [
            { name: ' A ', direction: 'x', nodeId: 'gate' },
            { id: 'dup', name: 'B', nodeId: 'ghost' },
            { id: 'dup', name: 'C' },
        ],
        makeHive().nodes,
        () => `n${++count}`
    );
    assert.deepEqual(clean, [
        { id: 'n1', name: 'A', direction: 'entry', nodeId: 'gate' },
        { id: 'dup', name: 'B', direction: 'entry', nodeId: null },
    ]);
});
test('listHivePending acusa cena apagada e importação sem par', () => {
    const hive = makeHive();
    hive.nodes.push({ id: 'x', type: 'scene', data: { sceneId: null, pendingName: 'Pátio' } });
    const pending = listHivePending(hive, { hasScene: (id) => id === 'S1', hasAudio: () => true });
    assert.deepEqual(pending, [
        { nodeId: 'back', kind: 'scene', name: null },
        { nodeId: 'x', kind: 'scene', name: 'Pátio' },
    ]);
});
test('exporta nomes no lugar de ids do mundo', () => {
    const payload = buildHiveExport(makeHive(), {
        sceneName: (id) => ({ S1: 'Portão da Escola', S2: 'Fundos' })[id] ?? null,
        audioRef: (data) => (data.audioId === 'PL1' ? { type: 'playlist', name: 'Tema' } : null),
    });
    const [hive] = payload.hives;
    assert.equal(payload.format, 'lumenn-frame-hive');
    assert.equal(hive.nodes[0].data.sceneName, 'Portão da Escola');
    assert.equal('sceneId' in hive.nodes[0].data, false);
    assert.equal('sourceFolderId' in hive.nodes[0].data, false);
    assert.equal(hive.nodes[2].data.audioName, 'Tema');
    assert.equal('audioId' in hive.nodes[2].data, false);
    assert.equal(validateHiveExport(payload).valid, true);
});
test('importa com ids novos, casa por nome e deixa pendente o resto', () => {
    const payload = buildHiveExport(makeHive(), {
        sceneName: (id) => ({ S1: 'Portão da Escola', S2: 'Fundos' })[id] ?? null,
        audioRef: () => ({ type: 'playlist', name: 'Tema' }),
    });
    let count = 0;
    const { graph, pending } = planHiveImport(
        payload.hives[0],
        {
            scenes: [
                { id: 'W1', name: 'portão da escola' },
                { id: 'W2', name: 'Fundos' },
                { id: 'W3', name: 'Fundos' },
            ],
            audio: [{ id: 'WP', name: 'Tema', type: 'playlist' }],
        },
        (prefix) => `${prefix}_${++count}`
    );
    assert.equal(graph.isHive, true);
    assert.notEqual(graph.id, 'g1');
    const gate = graph.nodes.find((node) => node.data.sceneId === 'W1');
    assert.ok(gate, 'cena casada pelo nome sem diferenciar caixa');
    const back = graph.nodes.find((node) => node.data.pendingName === 'Fundos');
    assert.equal(back.data.sceneId, null);
    assert.equal(pending.length, 1);
    assert.equal(pending[0].reason, 'ambiguous');
    assert.equal(graph.nodes.find((node) => node.type === 'audio').data.audioId, 'WP');
    const enc = graph.nodes.find((node) => node.type === 'encounter');
    assert.equal(enc.data.sceneNodeId, gate.id);
    assert.equal(graph.activeNodeId, gate.id);
    for (const edge of graph.edges) {
        assert.ok(graph.nodes.some((node) => node.id === edge.from));
        assert.ok(graph.nodes.some((node) => node.id === edge.to));
    }
    assert.deepEqual(
        graph.hive.ports.map((port) => port.nodeId),
        [gate.id, back.id]
    );
    assert.equal(
        graph.hive.ports.every((port) => !['p1', 'p2'].includes(port.id)),
        true
    );
    assert.equal(validateHiveExport({ hives: [graph] }).valid, true);
});
test('round-trip preserva hive.exit e as portas da aresta de saída', () => {
    const source = makeHive();
    source.hive.exit = {
        scope: 'both',
        scene: { type: 'film:cutscene', duration: 2600, color: '#000000' },
        audio: { mode: 'none' },
    };
    source.edges.push({
        id: 'e3',
        type: 'flow',
        from: 'back',
        to: 'gate',
        portId: 'p1',
        exitPortId: 'p2',
    });
    const payload = buildHiveExport(source, {
        sceneName: (id) => ({ S1: 'Portão da Escola', S2: 'Fundos' })[id] ?? null,
        audioRef: () => null,
    });
    const exported = payload.hives[0];
    assert.deepEqual(exported.hive.exit, source.hive.exit);
    assert.equal(exported.hive.transition.scene.type, 'fade');
    const exportedEdge = exported.edges.find((edge) => edge.id === 'e3');
    assert.equal(exportedEdge.exitPortId, 'p2');
    assert.equal(exportedEdge.portId, 'p1');
    let count = 0;
    const { graph } = planHiveImport(
        exported,
        {
            scenes: [
                { id: 'W1', name: 'Portão da Escola' },
                { id: 'W2', name: 'Fundos' },
            ],
            audio: [],
        },
        (prefix) => `${prefix}_${++count}`
    );
    assert.deepEqual(graph.hive.exit, source.hive.exit);
    assert.equal(validateHiveExport({ hives: [graph] }).valid, true);
    const back = graph.nodes.find((node) => node.data.sceneId === 'W2');
    const importedEdge = graph.edges.find((edge) => edge.from === back.id && edge.portId);
    assert.ok(importedEdge?.exitPortId, 'aresta manteve a porta de saída');
    const exitPort = graph.hive.ports.find((port) => port.id === importedEdge.exitPortId);
    assert.equal(exitPort.direction, 'exit');
    assert.equal(exitPort.nodeId, back.id);
    const entryPort = graph.hive.ports.find((port) => port.id === importedEdge.portId);
    assert.equal(entryPort.direction, 'entry');
    assert.equal(entryPort.nodeId, graph.nodes.find((node) => node.data.sceneId === 'W1').id);
});
test('round-trip preserva kind, address, âncoras e endereço do nó', () => {
    const source = makeHive();
    source.kind = 'mini-hive';
    source.address = 'Universo/Planeta/Brasil/Escola';
    source.anchors = { intro: 'gate', output: 'back' };
    source.nodes.find((node) => node.id === 'gate').address =
        'Universo/Planeta/Brasil/Escola/Portão';
    const payload = buildHiveExport(source, {
        sceneName: (id) => ({ S1: 'Portão da Escola', S2: 'Fundos' })[id] ?? null,
        audioRef: () => null,
    });
    const exported = payload.hives[0];
    assert.equal(exported.kind, 'mini-hive');
    assert.equal(exported.address, 'Universo/Planeta/Brasil/Escola');
    assert.deepEqual(exported.anchors, { intro: 'gate', output: 'back' });
    let count = 0;
    const { graph } = planHiveImport(
        exported,
        {
            scenes: [
                { id: 'W1', name: 'Portão da Escola' },
                { id: 'W2', name: 'Fundos' },
            ],
            audio: [],
        },
        (prefix) => `${prefix}_${++count}`
    );
    assert.equal(graph.kind, 'mini-hive');
    assert.equal(graph.address, 'Universo/Planeta/Brasil/Escola');
    const gate = graph.nodes.find((node) => node.data.sceneId === 'W1');
    const back = graph.nodes.find((node) => node.data.sceneId === 'W2');
    assert.deepEqual(graph.anchors, { intro: gate.id, output: back.id });
    assert.equal(
        gate.address,
        'Universo/Planeta/Brasil/Escola/Portão',
        'endereço do nó sobrevive ao round-trip'
    );
});
