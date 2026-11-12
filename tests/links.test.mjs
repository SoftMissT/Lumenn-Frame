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

test('legado com retorno gravado: a volta escondida não comanda a navegação', () => {
    // Até a 0.1.0 este caso usava a 'ba'. Agora o editor esconde a gêmea, então a navegação
    // usa a mesma ligação que o mestre vê e edita, nos dois sentidos.
    const legacy = [...edges, { id: 'ba', type: 'flow', from: 'B', to: 'A' }];
    assert.equal(linkBetween(legacy, 'B', 'A').id, 'ab');
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

import { flowTwins, reverseFlow } from '../scripts/links.mjs';

test('flowTwins: o par A→B / B→A esconde só a segunda; áudio e trios ficam', () => {
    const edges = [
        { id: 'e1', type: 'flow', from: 'a', to: 'b' },
        { id: 'e2', type: 'audio', from: 'b', to: 'a' },
        { id: 'e3', type: 'flow', from: 'b', to: 'a' },
        { id: 'e4', type: 'flow', from: 'b', to: 'c' },
        { id: 'e5', type: 'flow', from: 'a', to: 'b' },
    ];
    const twins = flowTwins(edges);
    assert.deepEqual([...twins], [['e3', 'e1']]);
    assert.equal(flowTwins([]).size, 0);
    assert.equal(flowTwins(null).size, 0);
});

test('reverseFlow acha a volta já gravada e ignora áudio', () => {
    const edges = [
        { id: 'e1', type: 'flow', from: 'a', to: 'b' },
        { id: 'e2', type: 'audio', from: 'c', to: 'a' },
    ];
    assert.equal(reverseFlow(edges, 'b', 'a')?.id, 'e1');
    assert.equal(reverseFlow(edges, 'a', 'c'), null);
});
test('linkBetween ignora a volta gêmea: os dois sentidos usam a ligação visível', () => {
    const edges = [
        { id: 'keep', type: 'flow', from: 'a', to: 'b', transition: { scene: { type: 'film:video' } } },
        { id: 'twin', type: 'flow', from: 'b', to: 'a', transition: { scene: { type: 'fade' } } },
    ];
    assert.equal(linkBetween(edges, 'a', 'b')?.id, 'keep');
    assert.equal(linkBetween(edges, 'b', 'a')?.id, 'keep');
});