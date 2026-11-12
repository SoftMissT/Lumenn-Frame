import test from 'node:test';
import assert from 'node:assert/strict';
import { hiveMap } from '../scripts/hive-map.mjs';

const porto = {
    id: 'g_porto',
    name: 'Distrito do Porto',
    isHive: true,
    hive: { ports: [{ direction: 'entry' }, { direction: 'exit' }, { direction: 'exit' }] },
    nodes: ['Armazém 3', 'Doca Norte', 'Escritório', 'Porão', 'Cais'].map((title, i) => ({
        id: `s${i}`,
        type: 'scene',
        data: { title },
    })),
};
const cidade = {
    id: 'g_cidade',
    name: 'Cidade Aurora',
    isHive: true,
    hive: { ports: [{ direction: 'entry' }] },
    nodes: [
        { id: 'r1', type: 'hive-ref', data: { graphId: 'g_porto' } },
        { id: 'r2', type: 'hive-ref', data: { graphId: 'sumiu' } },
        { id: 'x', type: 'scene', data: { title: 'Praça' } },
    ],
};
const get = (id) => ({ g_porto: porto, g_cidade: cidade })[id] ?? null;

test('hiveMap: cartão por Hive com locais (até 4 + resto), sub-hives e portas', () => {
    const map = hiveMap(cidade, get);
    assert.equal(map.name, 'Cidade Aurora');
    assert.equal(map.sceneCount, 1);
    assert.equal(map.hiveCount, 2);
    assert.equal(map.entries, 1);
    const [a, b] = map.hives;
    assert.deepEqual(a.places, ['Armazém 3', 'Doca Norte', 'Escritório', 'Porão']);
    assert.equal(a.more, 1);
    assert.equal(a.sceneCount, 5);
    assert.equal(a.entries, 1);
    assert.equal(a.exits, 2);
    assert.equal(b.missing, true);
    assert.equal(b.name, null);
});

test('hiveMap: storyboard sem Hives devolve lista vazia', () => {
    const map = hiveMap({ name: 'Solto', nodes: [] }, get);
    assert.equal(map.hiveCount, 0);
    assert.deepEqual(map.hives, []);
    assert.equal(hiveMap(null, get).hiveCount, 0);
});
