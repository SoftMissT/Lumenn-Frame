import test from 'node:test';
import assert from 'node:assert/strict';
import {
    FILM_EFFECTS,
    FILM_PREFIX,
    filmCutPoint,
    filmEffectOf,
    filmHalf,
    filmNotifyReady,
    waitPlayersReady,
} from '../scripts/film-transitions.mjs';
test('ponto de corte: vídeo usa o cutAt limitado à duração; demais, metade', () => {
    assert.equal(filmCutPoint('video', 2e3, 700), 700);
    assert.equal(filmCutPoint('video', 2e3, 9e3), 2e3);
    assert.equal(filmCutPoint('video', 2e3, undefined), 1e3);
    assert.equal(filmCutPoint('video', 0, null), 1e3);
    assert.equal(filmCutPoint('iris', 1600, 50), 800);
});
test('mestre espera a confirmação de cada jogador e não trava sem jogadores', async () => {
    const ready = waitPlayersReady('a.webm', ['u1', 'u2'], 500);
    filmNotifyReady({ src: 'a.webm', userId: 'u1' });
    filmNotifyReady({ src: 'outro.webm', userId: 'u2' });
    filmNotifyReady({ src: 'a.webm', userId: 'u2' });
    assert.deepEqual(await ready, ['u1', 'u2']);
    assert.deepEqual(await waitPlayersReady('a.webm', []), []);
    const late = await waitPlayersReady('b.webm', ['u3'], 30);
    assert.deepEqual(late, [], 'tempo limite libera o mestre');
});
test('catálogo de cinema tem 10 efeitos com id e rótulo i18n únicos', () => {
    assert.equal(FILM_EFFECTS.length, 10);
    assert.equal(new Set(FILM_EFFECTS.map((effect) => effect.id)).size, 10);
    assert.ok(FILM_EFFECTS.some((effect) => effect.id === 'battle'));
    for (const effect of FILM_EFFECTS) assert.match(effect.label, /^LUMENN_FRAME\.Film\./);
});
test('filmEffectOf só reconhece film:<efeito> conhecido', () => {
    assert.equal(filmEffectOf(`${FILM_PREFIX}iris`), 'iris');
    assert.equal(filmEffectOf('film:nada'), null);
    assert.equal(filmEffectOf('fade'), null);
    assert.equal(filmEffectOf(undefined), null);
});
test('filmHalf divide a duração e cai no padrão do efeito', () => {
    assert.equal(filmHalf(2e3, 'iris'), 1e3);
    assert.equal(filmHalf(0, 'cutscene'), 1300);
    assert.equal(filmHalf(100, 'flash'), 200);
});

import { filmTitle } from '../scripts/film-transitions.mjs';

test('filmTitle: título configurado vence o automático; sem texto, usa o destino', () => {
    assert.deepEqual(filmTitle({ title: { text: 'CAPÍTULO 3', subtitle: 'A Torre', font: 'Orbitron', color: '#ffd166', size: 96 } }, { caption: 'Sala 1', subtitle: 'Hive' }), {
        caption: 'CAPÍTULO 3',
        subtitle: 'A Torre',
        titleFont: 'Orbitron',
        titleColor: '#ffd166',
        titleSize: 96,
    });
    const auto = filmTitle({}, { caption: 'Sala 1', subtitle: 'Hive' });
    assert.equal(auto.caption, 'Sala 1');
    assert.equal(auto.subtitle, 'Hive');
    assert.equal(auto.titleFont, '');
});

test('filmTitle: só passa fonte, cor e tamanho seguros para CSS', () => {
    const bad = filmTitle({ title: { text: 'X', font: "x'; background:url(a)", color: 'red;', size: 9999 } });
    assert.equal(bad.titleFont, '');
    assert.equal(bad.titleColor, '');
    assert.equal(bad.titleSize, 200);
    assert.equal(filmTitle({ title: { size: 'abc' } }).titleSize, 0);
    assert.equal(filmTitle({ title: { size: 4 } }).titleSize, 16);
    assert.equal(filmTitle({ title: { font: 'Noto Serif JP' } }).titleFont, 'Noto Serif JP');
});