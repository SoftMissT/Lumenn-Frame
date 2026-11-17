import test from 'node:test';
import assert from 'node:assert/strict';
import { planExitLanding } from '../scripts/hive-landing.mjs';

const room = (id) => ({ id, type: 'scene', position: { x: 0, y: 0 }, data: {} });
const hiveB = (extra = {}) => ({
    id: 'B',
    name: 'Hive B',
    isHive: true,
    nodes: [room('b1'), room('b2')],
    hive: {
        ports: [
            { id: 'pe1', name: 'Portão', direction: 'entry', nodeId: 'b1' },
            { id: 'pe2', name: 'Fundos', direction: 'entry', nodeId: 'b2' },
        ],
    },
    ...extra,
});
const parentOf = (edge, targetNode) => ({
    id: 'root',
    nodes: [
        { id: 'refA', type: 'hive-ref', data: { graphId: 'A' } },
        targetNode,
        room('cena'),
    ],
    edges: edge ? [edge] : [],
});
const refB = (data = {}) => ({ id: 'refB', type: 'hive-ref', data: { graphId: 'B', ...data } });
const graphs = (...list) => (id) => list.find((g) => g.id === id) ?? null;

test('sem aresta de saída: volta ao nó Hive', () => {
    const out = planExitLanding({ parent: parentOf(null, refB()), refId: 'refA', getGraph: graphs() });
    assert.equal(out.status, 'back');
    assert.equal(out.target, null);
});

test('destino comum: segue para o nó, como antes', () => {
    const parent = parentOf({ id: 'e', type: 'flow', from: 'refA', to: 'cena' }, refB());
    const out = planExitLanding({ parent, refId: 'refA', getGraph: graphs() });
    assert.equal(out.status, 'node');
    assert.equal(out.target.id, 'cena');
});

test('destino é outra Hive: aterrissa na porta de entrada ligada à aresta', () => {
    const parent = parentOf({ id: 'e', type: 'flow', from: 'refA', to: 'refB', portId: 'pe2' }, refB());
    const out = planExitLanding({ parent, refId: 'refA', getGraph: graphs(hiveB()) });
    assert.equal(out.status, 'hive');
    assert.equal(out.entry.id, 'pe2');
    assert.equal(out.entry.node.id, 'b2');
    assert.equal(out.hive.id, 'B');
});

test('sem porta na aresta: usa a do nó Hive e, por fim, a primeira de entrada', () => {
    const viaRef = parentOf({ id: 'e', type: 'flow', from: 'refA', to: 'refB' }, refB({ portId: 'pe2' }));
    assert.equal(planExitLanding({ parent: viaRef, refId: 'refA', getGraph: graphs(hiveB()) }).entry.id, 'pe2');
    const plain = parentOf({ id: 'e', type: 'flow', from: 'refA', to: 'refB' }, refB());
    assert.equal(planExitLanding({ parent: plain, refId: 'refA', getGraph: graphs(hiveB()) }).entry.id, 'pe1');
});

test('porta de saída escolhida decide a aresta quando há duas', () => {
    const parent = {
        id: 'root',
        nodes: [{ id: 'refA', type: 'hive-ref', data: { graphId: 'A' } }, refB(), room('cena')],
        edges: [
            { id: 'e1', type: 'flow', from: 'refA', to: 'cena', exitPortId: 'x1' },
            { id: 'e2', type: 'flow', from: 'refA', to: 'refB', exitPortId: 'x2', portId: 'pe1' },
        ],
    };
    const getGraph = graphs(hiveB());
    assert.equal(planExitLanding({ parent, refId: 'refA', portId: 'x1', getGraph }).status, 'node');
    assert.equal(planExitLanding({ parent, refId: 'refA', portId: 'x2', getGraph }).status, 'hive');
});

test('Hive de destino sumiu, não é Hive ou não tem entrada: fica onde está', () => {
    const parent = parentOf({ id: 'e', type: 'flow', from: 'refA', to: 'refB' }, refB());
    assert.equal(planExitLanding({ parent, refId: 'refA', getGraph: graphs() }).status, 'hive-missing');
    assert.equal(
        planExitLanding({ parent, refId: 'refA', getGraph: graphs(hiveB({ isHive: false })) }).status,
        'hive-not-hive'
    );
    const empty = hiveB({ nodes: [], hive: { ports: [] } });
    assert.equal(planExitLanding({ parent, refId: 'refA', getGraph: graphs(empty) }).status, 'hive-no-entry');
});

test('ref desconhecido ou grafo pai vazio não quebram', () => {
    assert.equal(planExitLanding({ parent: undefined, refId: 'x', getGraph: graphs() }).status, 'back');
    assert.equal(planExitLanding({ parent: { nodes: [], edges: [] }, refId: null, getGraph: graphs() }).status, 'back');
});
