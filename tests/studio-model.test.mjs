import test from 'node:test';
import assert from 'node:assert/strict';
import { formatMs, progressAt, studioTimeline, transitionKind } from '../scripts/studio-model.mjs';
import { filmEffectOf } from '../scripts/film-transitions.mjs';

test('transitionKind separa corte, shader, cinema e stinger', () => {
    assert.equal(transitionKind(undefined, filmEffectOf), 'cut');
    assert.equal(transitionKind('cut', filmEffectOf), 'cut');
    assert.equal(transitionKind('fade', filmEffectOf), 'shader');
    assert.equal(transitionKind('lumenn-bounce-in', filmEffectOf), 'shader');
    assert.equal(transitionKind('film:cutscene', filmEffectOf), 'film');
    assert.equal(transitionKind('film:video', filmEffectOf), 'video');
});

test('studioTimeline: duração limitada, corte na metade, shader e corte arrastáveis', () => {
    const shader = studioTimeline({ type: 'fade', duration: 1500 }, { filmEffectOf });
    assert.equal(shader.duration, 1500);
    assert.equal(shader.cut, 750);
    assert.equal(shader.scrubbable, true);
    assert.deepEqual(shader.marks.map((m) => m.id), ['start', 'cut', 'end']);
    assert.equal(studioTimeline({ type: 'fade', duration: 99999 }, { filmEffectOf }).duration, 10000);
    assert.equal(studioTimeline({ type: 'fade', duration: 0 }, { filmEffectOf, defaultMs: 900 }).duration, 900);
    assert.equal(studioTimeline({ type: 'film:battle', duration: 1600 }, { filmEffectOf }).scrubbable, false);
    assert.equal(studioTimeline({ type: 'cut' }, { filmEffectOf }).duration, 600);
});

test('studioTimeline: stinger usa a duração real do vídeo e o ponto de corte gravado', () => {
    const auto = studioTimeline({ type: 'film:video', duration: 2000, video: { cutAt: '' } }, { filmEffectOf, videoMs: 1500 });
    assert.equal(auto.duration, 1500);
    assert.equal(auto.cut, 750);
    const fixed = studioTimeline({ type: 'film:video', video: { cutAt: 400 } }, { filmEffectOf, videoMs: 1500 });
    assert.equal(fixed.cut, 400);
    const late = studioTimeline({ type: 'film:video', video: { cutAt: 9000 } }, { filmEffectOf, videoMs: 1500 });
    assert.equal(late.cut, 1500);
});

test('progressAt: contínuo no shader, salto no corte seco', () => {
    const shader = studioTimeline({ type: 'fade', duration: 1000 }, { filmEffectOf });
    assert.equal(progressAt(250, shader), 0.25);
    assert.equal(progressAt(-5, shader), 0);
    assert.equal(progressAt(5000, shader), 1);
    const cut = studioTimeline({ type: 'cut' }, { filmEffectOf });
    assert.equal(progressAt(200, cut), 0);
    assert.equal(progressAt(400, cut), 1);
    assert.equal(formatMs(750), '0,75 s');
});
