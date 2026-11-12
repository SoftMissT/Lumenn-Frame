import test from 'node:test';
import assert from 'node:assert/strict';
import { linkBetween, linkedFrom } from '../scripts/links.mjs';

const edges = [
    { id: 'ab', type: 'flow', from: 'A', to: 'B', transition: { scene: { type: 'fade' } } },
    { id: 'bc', type: 'flow', from: 'B', to: 'C' },
    { id: 'mA', type: 'audio', from: 'M', to: 'A' },
];

test('uma ligação gravada vale nos dois sentidos, com a mesma transição', () => {
    assert.equal(linkBetween(edges, 'A', 'B').id, 'ab');
    assert.equal(linkBetween(edges, 'B', 'A').id, 'ab');
    assert.equal(linkBetween(edges, 'B', 'A').transition.scene.type, 'fade');
    assert.equal(linkBetween(edges, 'C', 'B').id, 'bc');
});

test('sentido direto tem prioridade quando as duas existem (legado com retorno)', () => {
    const legacy = [...edges, { id: 'ba', type: 'flow', from: 'B', to: 'A' }];
    assert.equal(linkBetween(legacy, 'B', 'A').id, 'ba');
    assert.equal(linkBetween(legacy, 'A', 'B').id, 'ab');
});

test('áudio é de mão única; sem ligação devolve null', () => {
    assert.equal(linkBetween(edges, 'A', 'M', { types: ['flow', 'audio'] }), null);
    assert.equal(linkBetween(edges, 'M', 'A', { types: ['flow', 'audio'] }).id, 'mA');
    assert.equal(linkBetween(edges, 'A', 'C'), null);
    assert.equal(linkBetween(edges, 'A', 'A'), null);
    assert.equal(linkBetween(undefined, 'A', 'B'), null);
});

test('linkedFrom: saídas diretas + fluxo no contrário', () => {
    assert.deepEqual([...linkedFrom(edges, 'B')].sort(), ['A', 'C']);
    assert.deepEqual([...linkedFrom(edges, 'A')].sort(), ['B']);
    assert.deepEqual([...linkedFrom(edges, 'M')].sort(), ['A']);
    assert.deepEqual([...linkedFrom(edges, null)], []);
});
