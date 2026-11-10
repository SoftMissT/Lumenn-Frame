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
    assert.equal(filmCutPoint('video', 2000, 700), 700);
    assert.equal(filmCutPoint('video', 2000, 9000), 2000);
    assert.equal(filmCutPoint('video', 2000, undefined), 1000);
    assert.equal(filmCutPoint('video', 0, null), 1000);
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

test('catálogo de cinema tem 9 efeitos com id e rótulo i18n únicos', () => {
    assert.equal(FILM_EFFECTS.length, 9);
    assert.equal(new Set(FILM_EFFECTS.map((effect) => effect.id)).size, 9);
    for (const effect of FILM_EFFECTS) assert.match(effect.label, /^LUMENN_FRAME\.Film\./);
});

test('filmEffectOf só reconhece film:<efeito> conhecido', () => {
    assert.equal(filmEffectOf(`${FILM_PREFIX}iris`), 'iris');
    assert.equal(filmEffectOf('film:nada'), null);
    assert.equal(filmEffectOf('fade'), null);
    assert.equal(filmEffectOf(undefined), null);
});

test('filmHalf divide a duração e cai no padrão do efeito', () => {
    assert.equal(filmHalf(2000, 'iris'), 1000);
    assert.equal(filmHalf(0, 'cutscene'), 1300);
    assert.equal(filmHalf(100, 'flash'), 200);
});
