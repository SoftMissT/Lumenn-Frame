import test from 'node:test';
import assert from 'node:assert/strict';
import { intentHintKey, isNodeDimmed, jumpDetail, nodeClickIntent } from '../scripts/node-intent.mjs';

const live = { mode: 'live' };

test('GM no Ao Vivo salta para qualquer nó, ligado ou não', () => {
    for (const isLinked of [true, false])
        for (const nodeType of ['scene', 'audio', 'note', 'group', 'hive-ref', 'encounter'])
            assert.equal(nodeClickIntent({ ...live, isGM: true, nodeType, isLinked }).intent, 'jump');
});

test('detalhe do salto muda com o tipo e com "aqui"', () => {
    assert.equal(jumpDetail('scene'), 'scene');
    assert.equal(jumpDetail('audio'), 'audio');
    assert.equal(jumpDetail('hive-ref'), 'hive');
    assert.equal(jumpDetail('encounter'), 'encounter');
    assert.equal(jumpDetail('note'), 'select');
    assert.equal(jumpDetail('group'), 'select');
    assert.equal(jumpDetail('scene', { isActive: true }), 'here');
});

test('jogador no Ao Vivo: segue ligação, toca áudio, ou fica bloqueado', () => {
    const base = { ...live, isGM: false };
    assert.deepEqual(nodeClickIntent({ ...base, isLinked: true, nodeType: 'scene' }), { intent: 'follow', detail: 'scene' });
    assert.deepEqual(nodeClickIntent({ ...base, isLinked: true, nodeType: 'hive-ref' }), { intent: 'follow', detail: 'hive' });
    assert.deepEqual(nodeClickIntent({ ...base, isPlayable: true }), { intent: 'play', detail: 'audio' });
    assert.deepEqual(nodeClickIntent({ ...base }), { intent: 'blocked', detail: 'unlinked' });
    assert.deepEqual(nodeClickIntent({ ...base, isActive: true }), { intent: 'blocked', detail: 'here' });
});

test('ligação ganha de tocar áudio para o jogador', () => {
    assert.equal(nodeClickIntent({ ...live, isGM: false, isLinked: true, isPlayable: true }).intent, 'follow');
});

test('Edição: seleciona; mão e conectar não clicam no nó', () => {
    assert.deepEqual(nodeClickIntent({ mode: 'edit', isGM: true }), { intent: 'select', detail: 'select' });
    assert.equal(nodeClickIntent({ mode: 'edit', isGM: true, tool: 'connect' }).intent, 'none');
    assert.equal(nodeClickIntent({ mode: 'edit', isGM: true, tool: 'hand' }).intent, 'none');
});

test('escurece só o que o clique realmente bloqueia, e nunca o GM', () => {
    const gm = nodeClickIntent({ ...live, isGM: true, nodeType: 'scene' });
    const blocked = nodeClickIntent({ ...live, isGM: false });
    assert.equal(isNodeDimmed(gm.intent), false);
    assert.equal(isNodeDimmed(blocked.intent), true);
    assert.equal(isNodeDimmed(blocked.intent, { enabled: false }), false);
    assert.equal(isNodeDimmed(blocked.intent, { isActive: true }), false);
    assert.equal(isNodeDimmed('select'), false);
});

test('chave i18n da dica', () => {
    assert.equal(intentHintKey({ intent: 'jump', detail: 'scene' }), 'LUMENN_FRAME.Intent.jump.scene');
});

test('entrada vazia não lança', () => {
    assert.deepEqual(nodeClickIntent(), { intent: 'select', detail: 'select' });
});
