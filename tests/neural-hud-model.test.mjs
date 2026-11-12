import test from 'node:test';
import assert from 'node:assert/strict';
import { buildHudModel, filterOfKind, HUD_FILTERS, secondaryAddress } from '../scripts/neural-hud-model.mjs';
import { normalizeAddress } from '../scripts/neural-address.mjs';

const entries = [
    { id: 'gP', graphId: 'gP', nodeId: null, name: 'QA Parent', address: 'QA Parent', kind: 'storyboard' },
    { id: 'n1', graphId: 'gP', nodeId: 'n1', name: 'Start', address: 'QA Parent / Start', kind: 'scene' },
    { id: 'n2', graphId: 'gP', nodeId: 'n2', name: 'Hive', address: 'QA Parent / Hive', kind: 'hive-ref' },
    { id: 'gH', graphId: 'gH', nodeId: null, name: 'QA Hive', address: 'QA Parent / QA Hive', kind: 'hive' },
    { id: 'n3', graphId: 'gH', nodeId: 'n3', name: 'Sala 1', address: 'QA Parent / QA Hive / Sala 1', kind: 'scene' },
    { id: 'n4', graphId: 'gH', nodeId: 'n4', name: 'Tema', address: 'QA Parent / QA Hive / Tema', kind: 'audio' },
    { id: 'n5', graphId: 'gH', nodeId: 'n5', name: 'Pista', address: 'Z500 / Pista', kind: 'note' },
];
const opts = { normalize: normalizeAddress };

test('filterOfKind cobre cena, áudio, hives e o resto', () => {
    assert.equal(filterOfKind('scene'), 'scene');
    assert.equal(filterOfKind('audio'), 'audio');
    for (const kind of ['hive', 'mini-hive', 'hive-ref', 'storyboard', 'group']) assert.equal(filterOfKind(kind), 'hive');
    assert.equal(filterOfKind('note'), 'other');
    assert.equal(filterOfKind(undefined), 'other');
});

test('agrupa por grafo com título vindo da entrada do grafo', () => {
    const model = buildHudModel(entries, opts);
    assert.deepEqual(model.groups.map((g) => g.title), ['QA Parent', 'QA Hive']);
    assert.deepEqual(model.groups[1].items.map((i) => i.id), ['n3', 'n4', 'n5']);
    assert.equal(model.total, 7);
});

test('grafo atual vem primeiro, sem a própria entrada, com título de fallback', () => {
    const withoutCurrent = entries.filter((e) => e.id !== 'gH');
    const model = buildHudModel(withoutCurrent, { ...opts, currentGraphId: 'gH', currentTitle: 'QA Hive', currentAddress: 'QA Parent / QA Hive' });
    assert.equal(model.groups[0].graphId, 'gH');
    assert.equal(model.groups[0].isCurrent, true);
    assert.equal(model.groups[0].title, 'QA Hive');
    assert.equal(model.groups[0].entry, null);
});

test('busca normaliza acento e caixa e conta por tipo', () => {
    const model = buildHudModel(entries, { ...opts, query: 'SALA' });
    assert.equal(model.total, 1);
    assert.equal(model.counts.all, 1);
    assert.equal(model.counts.scene, 1);
    assert.deepEqual(model.groups.map((g) => g.graphId), ['gH']);
});

test('filtro restringe a lista mas as contagens seguem a busca', () => {
    const model = buildHudModel(entries, { ...opts, filter: 'scene' });
    assert.equal(model.total, 2);
    assert.equal(model.counts.all, 7);
    assert.equal(model.counts.hive, 3);
    assert.equal(model.counts.audio, 1);
    assert.equal(model.counts.other, 1);
    assert.ok(model.groups.every((g) => g.entry === null));
});

test('filtro desconhecido vira all; lista vazia não quebra', () => {
    assert.equal(buildHudModel(entries, { ...opts, filter: 'xx' }).filter, 'all');
    const empty = buildHudModel([], opts);
    assert.deepEqual(empty.groups, []);
    assert.equal(empty.total, 0);
    assert.deepEqual(Object.keys(empty.counts), [...HUD_FILTERS]);
    assert.equal(buildHudModel(undefined, opts).total, 0);
});

test('busca por palavras: todas precisam aparecer, em qualquer ordem, ignorando barras', () => {
    const model = buildHudModel(entries, { ...opts, query: 'hive sala 1' });
    assert.deepEqual(model.groups.flatMap((g) => g.items.map((i) => i.id)), ['n3']);
    assert.equal(buildHudModel(entries, { ...opts, query: '1 sala' }).total, 1);
    assert.equal(buildHudModel(entries, { ...opts, query: 'parent / hive / sala' }).total, 1);
    assert.equal(buildHudModel(entries, { ...opts, query: '   ' }).total, 7);
});

test('busca sem resultado esvazia grupos', () => {
    const model = buildHudModel(entries, { ...opts, query: 'inexistente' });
    assert.equal(model.groups.length, 0);
    assert.equal(model.counts.all, 0);
});

test('secondaryAddress só mostra endereço fora do padrão', () => {
    assert.equal(secondaryAddress(entries[4], 'QA Parent / QA Hive'), '');
    assert.equal(secondaryAddress(entries[6], 'QA Parent / QA Hive'), 'Z500 / Pista');
    assert.equal(secondaryAddress({}, 'x'), '');
});

import { graphRelations, pushRecent, RECENT_MAX } from '../scripts/neural-hud-model.mjs';
import { parentGraphId } from '../scripts/neural-address.mjs';

const family = [
    { id: 'root', name: 'Raiz', nodes: [{ id: 'r1', type: 'hive-ref', data: { graphId: 'a' } }, { id: 'r2', type: 'hive-ref', data: { graphId: 'b' } }] },
    { id: 'a', name: 'A', nodes: [{ id: 'a1', type: 'hive-ref', data: { graphId: 'a-kid' } }] },
    { id: 'b', name: 'B', nodes: [] },
    { id: 'a-kid', name: 'Filha de A', nodes: [] },
    { id: 'solto', name: 'Solto', nodes: [] },
];

test('graphRelations: aqui, acima, filha, irmã; o resto fica de fora', () => {
    const rel = graphRelations(family, 'a', parentGraphId);
    assert.equal(rel.get('a'), 'here');
    assert.equal(rel.get('root'), 'parent');
    assert.equal(rel.get('a-kid'), 'child');
    assert.equal(rel.get('b'), 'sibling');
    assert.equal(rel.has('solto'), false);
    assert.equal(graphRelations(family, null, parentGraphId).size, 0);
    assert.equal(graphRelations(family, 'a').size, 0);
});

test('graphRelations: na raiz não há acima nem irmã', () => {
    const rel = graphRelations(family, 'root', parentGraphId);
    assert.deepEqual([...rel.entries()].sort(), [['a', 'child'], ['b', 'child'], ['root', 'here']]);
});

test('buildHudModel ordena por relação: aqui, filha, acima, irmã, resto', () => {
    const list = [
        { id: 'root', graphId: 'root', nodeId: null, name: 'Raiz', address: 'Raiz', kind: 'storyboard' },
        { id: 'a', graphId: 'a', nodeId: null, name: 'A', address: 'Raiz / A', kind: 'hive' },
        { id: 'b', graphId: 'b', nodeId: null, name: 'B', address: 'Raiz / B', kind: 'hive' },
        { id: 'a-kid', graphId: 'a-kid', nodeId: null, name: 'Filha de A', address: 'Raiz / A / Filha de A', kind: 'hive' },
        { id: 'solto', graphId: 'solto', nodeId: null, name: 'Solto', address: 'Solto', kind: 'storyboard' },
        { id: 'x', graphId: 'a', nodeId: 'x', name: 'Sala', address: 'Raiz / A / Sala', kind: 'scene' },
    ];
    const model = buildHudModel(list.filter((e) => e.id !== 'a'), {
        ...opts,
        currentGraphId: 'a',
        currentTitle: 'A',
        relations: graphRelations(family, 'a', parentGraphId),
    });
    assert.deepEqual(model.groups.map((g) => [g.graphId, g.relation]), [
        ['a', 'here'],
        ['a-kid', 'child'],
        ['root', 'parent'],
        ['b', 'sibling'],
        ['solto', 'other'],
    ]);
});

test('buildHudModel sem relações mantém o grafo atual primeiro', () => {
    const model = buildHudModel(entries.filter((e) => e.id !== 'gH'), { ...opts, currentGraphId: 'gH', currentTitle: 'QA Hive' });
    assert.equal(model.groups[0].relation, 'here');
    assert.ok(model.groups.slice(1).every((g) => g.relation === 'other'));
});

test('recentes: na ordem dada, respeitam busca e filtro, ignoram id sumido', () => {
    const recentIds = ['n4', 'sumiu', 'n1', 'n3'];
    assert.deepEqual(buildHudModel(entries, { ...opts, recentIds }).recent.map((e) => e.id), ['n4', 'n1', 'n3']);
    assert.deepEqual(buildHudModel(entries, { ...opts, recentIds, filter: 'scene' }).recent.map((e) => e.id), ['n1', 'n3']);
    assert.deepEqual(buildHudModel(entries, { ...opts, recentIds, query: 'sala' }).recent.map((e) => e.id), ['n3']);
    assert.deepEqual(buildHudModel(entries, opts).recent, []);
});

test('pushRecent: último na frente, sem repetir, com teto', () => {
    assert.deepEqual(pushRecent(['a', 'b', 'c'], 'b'), ['b', 'a', 'c']);
    assert.deepEqual(pushRecent([], 'a'), ['a']);
    assert.equal(pushRecent(['1', '2', '3', '4', '5'], 'novo').length, RECENT_MAX);
    assert.deepEqual(pushRecent(['1', '2', '3', '4', '5'], 'novo')[0], 'novo');
    assert.deepEqual(pushRecent(undefined, 'a'), ['a']);
    assert.deepEqual(pushRecent(['a'], ''), ['a']);
});