import test from 'node:test';
import assert from 'node:assert/strict';
import {
    DEFAULT_HIVE_TRANSITIONS,
    normalizeHiveTransition,
    planGroupToHive,
    resolveHiveExitEdge,
} from '../scripts/hive-io.mjs';
import { validateHiveExport } from '../scripts/hive-runtime.mjs';

const scene = (id, x, parentId = null) => ({ id, type: 'scene', parentId, position: { x, y: 200 }, data: { sceneId: `S-${id}` } });
const audio = (id, parentId = null) => ({ id, type: 'audio', parentId, position: { x: 0, y: 500 }, data: { audioType: 'track', audioId: `A-${id}` } });
const flow = (id, from, to) => ({ id, type: 'flow', from, to, transition: { scope: 'both' } });
const wire = (id, from, to) => ({ id, type: 'audio', from, to });

// Rua -> [Portão -> Pátio -> Ginásio] -> Praça ; música da escola só dentro; tema da cidade dentro e fora.
const makeGraph = () => ({
    id: 'root',
    name: 'Mundo',
    activeNodeId: 'pateo',
    nodes: [
        scene('rua', 0),
        { id: 'grp', type: 'group', parentId: null, position: { x: 300, y: 150 }, data: { title: 'Escola' } },
        scene('portao', 400, 'grp'),
        scene('pateo', 800, 'grp'),
        scene('gin', 1200, 'grp'),
        scene('praca', 1700),
        audio('musEscola'),
        audio('temaCidade'),
    ],
    edges: [
        flow('e1', 'rua', 'portao'),
        flow('e2', 'portao', 'pateo'),
        flow('e3', 'pateo', 'gin'),
        flow('e4', 'gin', 'praca'),
        wire('a1', 'musEscola', 'portao'),
        wire('a2', 'temaCidade', 'rua'),
        wire('a3', 'temaCidade', 'pateo'),
    ],
});

let n = 0;
const newId = (prefix) => `${prefix}_${++n}`;
const labelOf = (node) => ({ portao: 'Portão', praca: 'Praça', gin: 'Ginásio' })[node?.id] ?? node?.id;

test('grupo vira Hive: salas saem do pai e o grupo vira um nó só', () => {
    const plan = planGroupToHive(makeGraph(), 'grp', { newId, labelOf });
    assert.equal(plan.hive.isHive, true);
    assert.equal(plan.hive.name, 'Escola');
    assert.deepEqual(
        plan.hive.nodes.filter((node) => node.type === 'scene').map((node) => node.id),
        ['portao', 'pateo', 'gin']
    );
    const parentIds = plan.parent.nodes.map((node) => node.id);
    assert.ok(!parentIds.includes('grp'));
    assert.ok(!parentIds.includes('portao'));
    assert.ok(parentIds.includes(plan.refNode.id));
    assert.equal(plan.refNode.data.graphId, plan.hive.id);
    assert.ok(plan.hive.nodes.every((node) => node.parentId === null));
    assert.equal(plan.parent.activeNodeId, plan.refNode.id, 'sala ativa dentro do grupo vira o nó Hive');
});

test('portas automáticas: FLOW de fora vira entrada, FLOW para fora vira saída', () => {
    const plan = planGroupToHive(makeGraph(), 'grp', { newId, labelOf });
    assert.deepEqual(plan.entries.map((port) => [port.name, port.nodeId, port.direction]), [['Portão', 'portao', 'entry']]);
    assert.deepEqual(plan.exits.map((port) => [port.name, port.nodeId, port.direction]), [['Praça', 'gin', 'exit']]);
    const into = plan.parent.edges.find((edge) => edge.from === 'rua' && edge.type === 'flow');
    assert.equal(into.to, plan.refNode.id);
    assert.equal(into.portId, plan.entries[0].id);
    const out = plan.parent.edges.find((edge) => edge.to === 'praca');
    assert.equal(out.from, plan.refNode.id);
    assert.equal(out.exitPortId, plan.exits[0].id);
    assert.equal(plan.refNode.data.portId, plan.entries[0].id);
    assert.equal(plan.hive.activeNodeId, 'portao');
});

test('arestas internas vão para a Hive e o áudio segue a regra de uso', () => {
    const plan = planGroupToHive(makeGraph(), 'grp', { newId, labelOf });
    const internal = plan.hive.edges.filter((edge) => edge.type === 'flow').map((edge) => [edge.from, edge.to]);
    assert.deepEqual(internal, [['portao', 'pateo'], ['pateo', 'gin']]);
    assert.ok(plan.hive.nodes.some((node) => node.id === 'musEscola'), 'música só da escola foi movida');
    assert.ok(!plan.parent.nodes.some((node) => node.id === 'musEscola'));
    const copy = plan.hive.nodes.find((node) => node.type === 'audio' && node.data.audioId === 'A-temaCidade');
    assert.ok(copy && copy.id !== 'temaCidade', 'tema usado dentro e fora foi copiado');
    assert.ok(plan.parent.nodes.some((node) => node.id === 'temaCidade'), 'original segue no pai');
    assert.ok(plan.hive.edges.some((edge) => edge.type === 'audio' && edge.from === copy.id && edge.to === 'pateo'));
    assert.ok(plan.parent.edges.some((edge) => edge.id === 'a2'));
    assert.ok(!plan.parent.edges.some((edge) => edge.id === 'a3'));
    for (const edge of plan.parent.edges) {
        assert.ok(plan.parent.nodes.some((node) => node.id === edge.from));
        assert.ok(plan.parent.nodes.some((node) => node.id === edge.to));
    }
    assert.equal(validateHiveExport({ hives: [plan.hive] }).valid, true);
});

test('Hive nova entra com íris e sai em cutscene de cinema sem mexer na música', () => {
    const plan = planGroupToHive(makeGraph(), 'grp', { newId, labelOf });
    assert.equal(plan.hive.hive.transition.scene.type, 'film:iris');
    assert.equal(plan.hive.hive.exit.scene.type, 'film:cutscene');
    assert.equal(plan.hive.hive.exit.audio.mode, 'none');
});

test('configuração antiga style:cutscene vira film:cutscene e preenche padrões', () => {
    const exit = normalizeHiveTransition({ style: 'cutscene', scene: { duration: 900 } }, DEFAULT_HIVE_TRANSITIONS.exit);
    assert.equal(exit.scene.type, 'film:cutscene');
    assert.equal(exit.scene.duration, 900);
    assert.equal(exit.audio.mode, 'none');
    assert.equal(normalizeHiveTransition(null, DEFAULT_HIVE_TRANSITIONS.transition).scene.type, 'film:iris');
});

test('grupo vazio ou inexistente não vira Hive', () => {
    const graph = makeGraph();
    assert.equal(planGroupToHive(graph, 'nada', { newId }), null);
    graph.nodes.push({ id: 'vazio', type: 'group', position: { x: 0, y: 0 }, data: {} });
    assert.equal(planGroupToHive(graph, 'vazio', { newId }), null);
});

test('saída escolhe a aresta da porta; sem marca, a única aresta', () => {
    const parent = {
        edges: [
            { id: 'x', type: 'flow', from: 'ref', to: 'a', exitPortId: 'p1' },
            { id: 'y', type: 'flow', from: 'ref', to: 'b', exitPortId: 'p2' },
        ],
    };
    assert.equal(resolveHiveExitEdge(parent, 'ref', 'p2').id, 'y');
    assert.equal(resolveHiveExitEdge(parent, 'ref', 'p9'), null);
    assert.equal(resolveHiveExitEdge({ edges: [parent.edges[0]] }, 'ref', null).id, 'x');
    assert.equal(resolveHiveExitEdge({ edges: [] }, 'ref', 'p1'), null);
});
