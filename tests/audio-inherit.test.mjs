import test from 'node:test';
import assert from 'node:assert/strict';
import { effectiveAudioSources, findHiveRef } from '../scripts/audio-inherit.mjs';

// `audioSourcesIn` de mentira: lê `sources` gravadas no nó do grafo.
const audioSourcesIn = (graph, nodeId) => graph.nodes.find((n) => n.id === nodeId)?.sources ?? [];
const music = (id) => ({ type: 'track', id, role: 'music' });
const sfx = (id) => ({ type: 'track', id, role: 'sfx' });

const root = (sources = []) => ({
    id: 'root',
    nodes: [{ id: 'ref', type: 'hive-ref', data: { graphId: 'hiveA' }, sources }],
});
const hiveA = (roomSources = [], extra = []) => ({
    id: 'hiveA',
    nodes: [{ id: 'sala', type: 'scene', sources: roomSources }, ...extra],
});
const run = (graphs, graphId = 'hiveA', nodeId = 'sala') =>
    effectiveAudioSources({ graphs, graphId, nodeId, audioSourcesIn });

test('sem herança: sala sem música em Hive sem música devolve o que tem', () => {
    assert.deepEqual(run([root(), hiveA()]), []);
});

test('um nível: sala sem música usa a do nó da Hive no pai', () => {
    assert.deepEqual(run([root([music('tema')]), hiveA()]), [music('tema')]);
});

test('música própria da sala vence a herdada', () => {
    assert.deepEqual(run([root([music('tema')]), hiveA([music('sala')])]), [music('sala')]);
});

test('SFX local não bloqueia a música herdada', () => {
    const out = run([root([music('tema')]), hiveA([sfx('porta')])]);
    assert.deepEqual(out, [music('tema'), sfx('porta')]);
});

test('herança do pai não traz o SFX do pai', () => {
    const out = run([root([music('tema'), sfx('trovao')]), hiveA()]);
    assert.deepEqual(out, [music('tema')]);
});

test('dois níveis: a música sobe até a raiz', () => {
    const inner = { id: 'hiveB', nodes: [{ id: 'sala', type: 'scene', sources: [] }] };
    const mid = hiveA([], []);
    mid.nodes.push({ id: 'refB', type: 'hive-ref', data: { graphId: 'hiveB' }, sources: [] });
    const out = run([root([music('tema')]), mid, inner], 'hiveB', 'sala');
    assert.deepEqual(out, [music('tema')]);
});

test('dois níveis: o nível do meio com música própria corta a subida', () => {
    const inner = { id: 'hiveB', nodes: [{ id: 'sala', type: 'scene', sources: [] }] };
    const mid = hiveA([], []);
    mid.nodes.push({ id: 'refB', type: 'hive-ref', data: { graphId: 'hiveB' }, sources: [music('meio')] });
    const out = run([root([music('tema')]), mid, inner], 'hiveB', 'sala');
    assert.deepEqual(out, [music('meio')]);
});

test('ciclo de Hives não trava', () => {
    const a = { id: 'a', nodes: [{ id: 'ra', type: 'hive-ref', data: { graphId: 'b' }, sources: [] }, { id: 'sala', type: 'scene', sources: [] }] };
    const b = { id: 'b', nodes: [{ id: 'rb', type: 'hive-ref', data: { graphId: 'a' }, sources: [] }] };
    assert.deepEqual(effectiveAudioSources({ graphs: [a, b], graphId: 'a', nodeId: 'sala', audioSourcesIn }), []);
});

test('parentOf escolhe o nó Hive pelo qual se entrou, não o primeiro que aponta para a Hive', () => {
    const second = {
        id: 'root2',
        nodes: [{ id: 'ref2', type: 'hive-ref', data: { graphId: 'hiveA' }, sources: [music('outro')] }],
    };
    const graphs = [root([music('tema')]), second, hiveA()];
    const base = { graphs, graphId: 'hiveA', nodeId: 'sala', audioSourcesIn };
    assert.deepEqual(effectiveAudioSources(base), [music('tema')]);
    assert.deepEqual(
        effectiveAudioSources({ ...base, parentOf: () => ({ graphId: 'root2', nodeId: 'ref2' }) }),
        [music('outro')]
    );
    // Dica inválida cai no primeiro nó que aponta para a Hive.
    assert.deepEqual(
        effectiveAudioSources({ ...base, parentOf: () => ({ graphId: 'nada', nodeId: 'x' }) }),
        [music('tema')]
    );
});

test('findHiveRef aceita hiveId legado e ignora o próprio grafo', () => {
    const legacy = { id: 'p', nodes: [{ id: 'r', type: 'hive-ref', data: { hiveId: 'h' } }] };
    assert.equal(findHiveRef([legacy], 'h').ref.id, 'r');
    assert.equal(findHiveRef([legacy], 'p'), null);
    assert.equal(findHiveRef(undefined, 'h'), null);
});
