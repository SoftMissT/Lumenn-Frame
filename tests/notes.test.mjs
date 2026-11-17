import test from 'node:test';
import assert from 'node:assert/strict';
import { shouldRerenderForPath, notesFor, anchorOptions } from '../scripts/notes.mjs';

test('texto de Nota e anotações livres não redesenham o editor (foco do textarea)', () => {
    assert.equal(shouldRerenderForPath('data.body', 'note'), false);
    assert.equal(shouldRerenderForPath('data.title', 'note'), false);
    assert.equal(shouldRerenderForPath('notes', 'scene'), false);
    assert.equal(shouldRerenderForPath('notes', 'note'), false);
});

test('o resto continua redesenhando (título de grupo e Encontro aparece no cartão)', () => {
    assert.equal(shouldRerenderForPath('data.title', 'group'), true);
    assert.equal(shouldRerenderForPath('data.title', 'encounter'), true);
    assert.equal(shouldRerenderForPath('data.sceneId', 'scene'), true);
    assert.equal(shouldRerenderForPath('size', 'note'), true);
});

const note = (id, anchor, extra = {}) => ({ id, type: 'note', data: { title: id, body: `corpo ${id}`, anchorNodeId: anchor, ...extra } });
const scene = (id) => ({ id, type: 'scene', data: {} });

test('notesFor: ligadas ao nó ativo primeiro, depois as soltas', () => {
    const graph = { nodes: [scene('A'), scene('B'), note('n1', 'A'), note('n2', 'B'), note('n3', null)] };
    const out = notesFor(graph, 'A');
    assert.deepEqual(out.anchored.map((n) => n.id), ['n1']);
    assert.deepEqual(out.loose.map((n) => n.id), ['n3']);
    assert.deepEqual(out.all.map((n) => n.id), ['n1', 'n3']);
    assert.equal(out.anchored[0].anchored, true);
});

test('notesFor: Nota ligada a nó que sumiu vira solta, não some', () => {
    const graph = { nodes: [scene('A'), note('n1', 'apagado')] };
    assert.deepEqual(notesFor(graph, 'A').loose.map((n) => n.id), ['n1']);
});

test('notesFor: sem nó ativo só aparecem as soltas; grafo vazio não quebra', () => {
    const graph = { nodes: [scene('A'), note('n1', 'A'), note('n2', null)] };
    assert.deepEqual(notesFor(graph, null).all.map((n) => n.id), ['n2']);
    assert.deepEqual(notesFor(undefined, 'A').all, []);
});

test('anchorOptions exclui Notas e usa o rótulo informado', () => {
    const graph = { nodes: [scene('A'), note('n1', null), scene('B')] };
    assert.deepEqual(anchorOptions(graph, (n) => `nó ${n.id}`), [
        { id: 'A', name: 'nó A' },
        { id: 'B', name: 'nó B' },
    ]);
});
