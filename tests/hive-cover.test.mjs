import test from 'node:test';
import assert from 'node:assert/strict';
import { coverFor, graphNoun } from '../scripts/hive-cover.mjs';

const scene = (id, sceneId) => ({ id, type: 'scene', data: sceneId ? { sceneId } : {} });
const ref = (id, graphId) => ({ id, type: 'hive-ref', data: { graphId } });
const g = (id, nodes, hive) => ({ id, isHive: true, nodes, ...(hive ? { hive } : {}) });
const all = () => true;

test('sala direta com cena dá a capa', () => {
    const graphs = [g('h', [scene('a', null), scene('b', 'S2')])];
    assert.deepEqual(coverFor(graphs, 'h', { hasScene: all }), { sceneId: 'S2', img: null });
});

test('Hive só com sub-Hive: a capa vem de dentro', () => {
    const graphs = [g('h', [ref('r', 'sub')]), g('sub', [scene('a', 'S9')])];
    assert.equal(coverFor(graphs, 'h', { hasScene: all }).sceneId, 'S9');
});

test('sala direta tem prioridade sobre sub-Hive', () => {
    const graphs = [g('h', [ref('r', 'sub'), scene('a', 'DIRETA')]), g('sub', [scene('b', 'FUNDO')])];
    assert.equal(coverFor(graphs, 'h', { hasScene: all }).sceneId, 'DIRETA');
});

test('cena que sumiu do mundo é ignorada', () => {
    const graphs = [g('h', [scene('a', 'MORTA'), scene('b', 'VIVA')])];
    assert.equal(coverFor(graphs, 'h', { hasScene: (id) => id === 'VIVA' }).sceneId, 'VIVA');
});

test('sem nenhuma cena: sem capa', () => {
    assert.deepEqual(coverFor([g('h', [scene('a', null)])], 'h', { hasScene: all }), { sceneId: null, img: null });
    assert.deepEqual(coverFor([], 'h'), { sceneId: null, img: null });
});

test('capa manual vence: imagem primeiro, depois cena', () => {
    const base = [g('h', [scene('a', 'S1')], { cover: { img: 'ui/x.webp', sceneId: 'S5' } })];
    assert.deepEqual(coverFor(base, 'h', { hasScene: all }), { sceneId: null, img: 'ui/x.webp' });
    const byScene = [g('h', [scene('a', 'S1')], { cover: { sceneId: 'S5' } })];
    assert.equal(coverFor(byScene, 'h', { hasScene: all }).sceneId, 'S5');
    assert.equal(coverFor(byScene, 'h', { hasScene: (id) => id !== 'S5' }).sceneId, 'S1');
});

test('ciclo de Hives não trava', () => {
    const graphs = [g('a', [ref('r', 'b')]), g('b', [ref('r', 'a')])];
    assert.equal(coverFor(graphs, 'a', { hasScene: all }).sceneId, null);
});

test('graphNoun: Hive marcada ou kind hive; o resto é Storyboard', () => {
    assert.equal(graphNoun({ isHive: true }), 'Hive');
    assert.equal(graphNoun({ kind: 'hive' }), 'Hive');
    assert.equal(graphNoun({}), 'Storyboard');
    assert.equal(graphNoun(null), 'Storyboard');
});
