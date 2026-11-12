import test from 'node:test';
import assert from 'node:assert/strict';
import { formatEdgeLabel } from '../scripts/edge-label.mjs';
const NAMES = {
    'LUMENN_FRAME.Edge.Auto': 'Auto',
    'LUMENN_FRAME.Edge.Keep': 'Manter',
    'LUMENN_FRAME.Edge.Crossfade': 'Crossfade',
    'LUMENN_FRAME.Edge.Cut': 'Corte',
    'LUMENN_FRAME.Inspector.SceneOnly': 'Cena',
    'LUMENN_FRAME.Inspector.AudioOnly': 'Áudio',
};
const L = (key) => NAMES[key] ?? key;
test("tipo de cena que não é fade mostra o próprio nome, não 'Corte'", () => {
    const label = formatEdgeLabel(
        {
            scope: 'both',
            scene: { type: 'waves', duration: 1500 },
            audio: { mode: 'auto', crossfadeDuration: 3e3 },
        },
        { L, sceneName: 'Ondas' }
    );
    assert.equal(label, 'Ondas 1.5s · Auto 3.0s');
});
test('corte de cena e áudio sem duração não mostram segundos', () => {
    const label = formatEdgeLabel(
        {
            scope: 'both',
            scene: { type: 'cut', duration: 0 },
            audio: { mode: 'keep', crossfadeDuration: 3e3 },
        },
        { L, sceneName: 'Corte' }
    );
    assert.equal(label, 'Corte · Manter');
});
test('escopo parcial mostra só a parte que roda', () => {
    const t = {
        scene: { type: 'fade', duration: 1e3 },
        audio: { mode: 'crossfade', crossfadeDuration: 2e3 },
    };
    assert.equal(
        formatEdgeLabel({ ...t, scope: 'scene' }, { L, sceneName: 'Dissolver' }),
        'Cena · Dissolver 1.0s'
    );
    assert.equal(
        formatEdgeLabel({ ...t, scope: 'audio' }, { L, sceneName: 'Dissolver' }),
        'Áudio · Crossfade 2.0s'
    );
});

import { fitEdgeLabel } from '../scripts/edge-label.mjs';

test('fitEdgeLabel: cabe inteiro, encurta com reticências, ou some', () => {
    const label = 'Fade 1.0s · Auto 3.0s';
    assert.equal(fitEdgeLabel(label, { span: 400, zoom: 1 }), label);
    const short = fitEdgeLabel(label, { span: 100, zoom: 1 });
    assert.ok(short.endsWith('…') && short.length < label.length);
    assert.equal(fitEdgeLabel(label, { span: 30, zoom: 1 }), '');
});

test('fitEdgeLabel: zoom pequeno infla o texto em unidades do grafo (teto 1,5)', () => {
    const label = 'Dissolver 2.0s · Cruzar 3.0s';
    const near = fitEdgeLabel(label, { span: 200, zoom: 1 });
    const far = fitEdgeLabel(label, { span: 200, zoom: 0.5 });
    assert.ok(far.length <= near.length);
    assert.equal(fitEdgeLabel(label, { span: 200, zoom: 0.1 }), fitEdgeLabel(label, { span: 200, zoom: 0.666 }));
});

test('fitEdgeLabel: entrada vazia ou span inválido não lança', () => {
    assert.equal(fitEdgeLabel('', { span: 10, zoom: 1 }), '');
    assert.equal(fitEdgeLabel(undefined), '');
    assert.equal(fitEdgeLabel('abc', { span: NaN, zoom: 1 }), 'abc');
});

import { labelRoom } from '../scripts/edge-label.mjs';

test('labelRoom: espaço até o card mais próximo, dos dois lados', () => {
    const rects = [{ x: 0, y: 0, width: 100, height: 50 }, { x: 300, y: 0, width: 100, height: 50 }];
    assert.equal(labelRoom({ x: 200, y: 20 }, rects), 2 * 100);
    // Mais perto do card da direita: o menor lado manda (rótulo centrado).
    assert.equal(labelRoom({ x: 240, y: 20 }, rects), 2 * 60);
});

test('labelRoom: card fora da faixa vertical do texto é ignorado', () => {
    const rects = [{ x: 250, y: 200, width: 100, height: 50 }];
    assert.equal(labelRoom({ x: 200, y: 20 }, rects), Infinity);
    assert.equal(labelRoom({ x: 200, y: 20 }, []), Infinity);
    assert.equal(labelRoom({ x: 200, y: 20 }, undefined), Infinity);
});

test('labelRoom: centro dentro de um card não deixa espaço', () => {
    assert.equal(labelRoom({ x: 50, y: 20 }, [{ x: 0, y: 0, width: 100, height: 50 }]), 0);
});

test('labelRoom + fitEdgeLabel: rótulo comprido entre cards próximos é encurtado', () => {
    const rects = [{ x: 0, y: 0, width: 100, height: 50 }, { x: 180, y: 0, width: 100, height: 50 }];
    const room = labelRoom({ x: 140, y: 20 }, rects);
    const fitted = fitEdgeLabel('Fade 1.0s · Auto 3.0s', { span: room, zoom: 1 });
    assert.ok(fitted.length < 'Fade 1.0s · Auto 3.0s'.length);
    assert.equal(fitEdgeLabel('Fade 1.0s · Auto 3.0s', { span: Infinity, zoom: 1 }), 'Fade 1.0s · Auto 3.0s');
});