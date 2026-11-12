import test from 'node:test';
import assert from 'node:assert/strict';
import { TRANSITION_PRESETS, presetById, presetMacroData } from '../scripts/transition-presets.mjs';
import { FILM_EFFECTS, STINGERS, filmEffectOf, stingerSrc } from '../scripts/film-transitions.mjs';

test('presets: ids únicos e todo tipo de cena existe no catálogo', () => {
    assert.equal(new Set(TRANSITION_PRESETS.map((p) => p.id)).size, TRANSITION_PRESETS.length);
    const shaders = ['lumenn-cross-dissolve', 'lumenn-zoom-in', 'lumenn-zoom-out', 'lumenn-bounce-in', 'lumenn-slide', 'lumenn-pixelate', 'lumenn-dip-black', 'lumenn-dip-white', 'lumenn-glitch'];
    for (const p of TRANSITION_PRESETS) {
        const t = p.scene.type;
        assert.ok(filmEffectOf(t) || shaders.includes(t), `${p.id}: tipo ${t} desconhecido`);
        assert.ok(p.scene.duration > 0, `${p.id}: duração`);
        assert.ok(p.name && p.img, `${p.id}: nome e imagem`);
    }
    assert.equal(FILM_EFFECTS.length > 0, true);
});

test('presets: todo stinger pronto tem preset apontando para o arquivo dele', () => {
    for (const s of STINGERS) {
        const p = presetById(`stinger-${s.id}`);
        assert.ok(p, `falta preset do stinger ${s.id}`);
        assert.equal(p.scene.type, 'film:video');
        assert.equal(p.scene.video.src, stingerSrc(s.id));
    }
    assert.equal(presetById('nada'), null);
});

test('macro do compêndio: _id estável de 16 caracteres e comando que chama a API', () => {
    const ids = TRANSITION_PRESETS.map((p, i) => presetMacroData(p, i)._id);
    assert.equal(new Set(ids).size, ids.length);
    for (const id of ids) assert.match(id, /^[A-Za-z0-9]{16}$/);
    const m = presetMacroData(TRANSITION_PRESETS[0], 0);
    assert.equal(m.type, 'script');
    assert.match(m.command, /api\?\.applyTransition\("stinger-ink"\)/);
    assert.equal(m.flags['lumenn-frame'].transitionPreset, 'stinger-ink');
});
