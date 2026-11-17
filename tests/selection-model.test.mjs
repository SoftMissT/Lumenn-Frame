import test from 'node:test';
import assert from 'node:assert/strict';
import {
    createSelection,
    replace,
    add,
    toggle,
    clear,
    selectAll,
    applyClick,
    applyRect,
    normalizeRect,
    rectHits,
    prune,
} from '../scripts/selection-model.mjs';

const ids = (sel) => [...sel.ids];

test('replace e clear', () => {
    const a = replace(createSelection(), 'A');
    assert.deepEqual(ids(a), ['A']);
    assert.equal(a.primary, 'A');
    assert.deepEqual(ids(replace(a, 'B')), ['B']);
    assert.equal(clear(a).primary, null);
    assert.equal(clear(a).ids.size, 0);
});

test('add soma e vira o primário; a seleção antiga não muda', () => {
    const a = replace(createSelection(), 'A');
    const ab = add(a, 'B');
    assert.deepEqual(ids(ab), ['A', 'B']);
    assert.equal(ab.primary, 'B');
    assert.deepEqual(ids(a), ['A']);
});

test('toggle alterna e reatribui o primário ao tirar o primário', () => {
    let sel = selectAll(createSelection(), ['A', 'B', 'C']);
    assert.equal(sel.primary, 'C');
    sel = toggle(sel, 'C');
    assert.deepEqual(ids(sel), ['A', 'B']);
    assert.equal(sel.primary, 'B');
    sel = toggle(sel, 'A');
    assert.equal(sel.primary, 'B');
    sel = toggle(toggle(sel, 'B'), 'Z');
    assert.deepEqual(ids(sel), ['Z']);
});

test('primary sempre pertence a ids', () => {
    let sel = createSelection();
    for (const op of [(s) => add(s, 'A'), (s) => add(s, 'B'), (s) => toggle(s, 'B'), (s) => toggle(s, 'A')]) {
        sel = op(sel);
        assert.ok(sel.primary === null ? sel.ids.size === 0 : sel.ids.has(sel.primary));
    }
});

test('applyClick: sem modificador substitui, Shift soma, Ctrl e Cmd alternam', () => {
    let sel = replace(createSelection(), 'A');
    sel = applyClick(sel, 'B', { shiftKey: true });
    assert.deepEqual(ids(sel), ['A', 'B']);
    sel = applyClick(sel, 'A', { ctrlKey: true });
    assert.deepEqual(ids(sel), ['B']);
    sel = applyClick(sel, 'C', { metaKey: true });
    assert.deepEqual(ids(sel), ['B', 'C']);
    sel = applyClick(sel, 'D');
    assert.deepEqual(ids(sel), ['D']);
});

test('normalizeRect aceita arrasto em qualquer direção', () => {
    assert.deepEqual(normalizeRect({ x1: 100, y1: 80, x2: 20, y2: 10 }), {
        left: 20,
        top: 10,
        right: 100,
        bottom: 80,
    });
});

const nodes = [
    { id: 'in', position: { x: 50, y: 50 }, size: { w: 40, h: 40 } },
    { id: 'edge', position: { x: 90, y: 50 }, size: { w: 40, h: 40 } },
    { id: 'out', position: { x: 400, y: 400 }, size: { w: 40, h: 40 } },
    { id: 'semposicao' },
];

test('rectHits: cruzamento parcial conta; nó fora e sem posição não', () => {
    const hits = rectHits(nodes, { x1: 0, y1: 0, x2: 100, y2: 100 });
    assert.deepEqual(hits, ['in', 'edge']);
});

test('rectHits: retângulo invertido dá o mesmo resultado', () => {
    const a = rectHits(nodes, { x1: 0, y1: 0, x2: 100, y2: 100 });
    const b = rectHits(nodes, { x1: 100, y1: 100, x2: 0, y2: 0 });
    assert.deepEqual(a, b);
});

test('rectHits: sizeOf manda no tamanho e grafo vazio devolve nada', () => {
    const wide = rectHits(nodes, { x1: 380, y1: 300, x2: 390, y2: 310 }, { sizeOf: () => ({ w: 100, h: 200 }) });
    assert.ok(wide.includes('out') === false);
    assert.deepEqual(rectHits(nodes, { x1: 395, y1: 395, x2: 405, y2: 405 }), ['out']);
    assert.deepEqual(rectHits([], { x1: 0, y1: 0, x2: 1, y2: 1 }), []);
    assert.deepEqual(rectHits(undefined, { x1: 0, y1: 0, x2: 1, y2: 1 }), []);
});

test('applyRect: sem modificador substitui, Shift soma, Ctrl alterna', () => {
    const base = selectAll(createSelection(), ['A', 'B']);
    assert.deepEqual(ids(applyRect(base, ['B', 'C'], {})), ['B', 'C']);
    assert.deepEqual(ids(applyRect(base, ['B', 'C'], { shiftKey: true })), ['A', 'B', 'C']);
    assert.deepEqual(ids(applyRect(base, ['B', 'C'], { ctrlKey: true })), ['A', 'C']);
});

test('prune tira ids que sumiram e corrige o primário', () => {
    const sel = selectAll(createSelection(), ['A', 'B', 'C']);
    const out = prune(sel, ['A', 'B']);
    assert.deepEqual(ids(out), ['A', 'B']);
    assert.equal(out.primary, 'B');
    assert.equal(prune(sel, ['A', 'B', 'C']), sel);
    const empty = prune(sel, []);
    assert.equal(empty.primary, null);
    assert.equal(empty.ids.size, 0);
});
