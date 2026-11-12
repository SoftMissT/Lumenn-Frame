import test from 'node:test';
import assert from 'node:assert/strict';
import {
    createVisitQueue,
    nextVisitState,
    validateVisitRequest,
    visitableDestinations,
    VISIT_STATES,
} from '../scripts/visit-requests.mjs';

test('nextVisitState: só pending muda; estados finais ficam', () => {
    assert.equal(nextVisitState('pending', 'approve'), 'approved');
    assert.equal(nextVisitState('pending', 'decline'), 'declined');
    assert.equal(nextVisitState('pending', 'cancel'), 'cancelled');
    assert.equal(nextVisitState('pending', 'expire'), 'expired');
    for (const state of VISIT_STATES.filter((s) => s !== 'pending'))
        for (const event of ['approve', 'decline', 'cancel', 'expire']) assert.equal(nextVisitState(state, event), state);
    assert.equal(nextVisitState('pending', 'explode'), 'pending');
});

test('visitableDestinations: só nós de cena marcados, com Scene existente, sem duplicar', () => {
    const graphs = [
        {
            id: 'g1',
            nodes: [
                { id: 'a', type: 'scene', data: { sceneId: 's1', visitable: true } },
                { id: 'b', type: 'scene', data: { sceneId: 's2' } },
                { id: 'c', type: 'scene', data: { sceneId: 'gone', visitable: true } },
                { id: 'd', type: 'audio', data: { visitable: true } },
            ],
        },
        { id: 'g2', nodes: [{ id: 'e', type: 'scene', data: { sceneId: 's1', visitable: true } }, { id: 'f', type: 'scene', data: { sceneId: 's3', visitable: true } }] },
    ];
    const names = { s1: 'Torre', s2: 'Porto', s3: 'Arena' };
    const list = visitableDestinations(graphs, { sceneName: (id) => names[id] ?? null });
    assert.deepEqual(list.map((d) => d.sceneId), ['s3', 's1']);
    assert.deepEqual(list[1], { sceneId: 's1', name: 'Torre', graphId: 'g1', nodeId: 'a' });
    assert.deepEqual(visitableDestinations(undefined), []);
});

test('validateVisitRequest: autoria vem do servidor', () => {
    const base = { payload: { requestId: 'r1', userId: 'p1', sceneId: 's1' }, senderId: 'p1', senderIsGM: false, allowedSceneIds: new Set(['s1']), activeSceneId: 's0' };
    assert.deepEqual(validateVisitRequest(base), { ok: true });
    assert.equal(validateVisitRequest({ ...base, senderId: 'p2' }).reason, 'spoofed');
    assert.equal(validateVisitRequest({ ...base, senderId: null }).reason, 'spoofed');
    assert.equal(validateVisitRequest({ ...base, senderIsGM: true }).reason, 'gm-sender');
    assert.equal(validateVisitRequest({ ...base, allowedSceneIds: new Set() }).reason, 'forbidden');
    assert.equal(validateVisitRequest({ ...base, activeSceneId: 's1' }).reason, 'already-here');
    assert.equal(validateVisitRequest({ ...base, payload: { userId: 'p1' } }).reason, 'malformed');
    assert.equal(validateVisitRequest({ ...base, payload: null }).reason, 'malformed');
});

test('fila: pedido novo do mesmo jogador cancela o anterior', () => {
    const queue = createVisitQueue({ now: () => 1000 });
    queue.add({ id: 'r1', userId: 'p1', sceneId: 's1' });
    queue.add({ id: 'r2', userId: 'p2', sceneId: 's1' });
    const { request, replaced } = queue.add({ id: 'r3', userId: 'p1', sceneId: 's2' });
    assert.equal(request.state, 'pending');
    assert.deepEqual(replaced.map((r) => [r.id, r.state]), [['r1', 'cancelled']]);
    assert.deepEqual(queue.pending().map((r) => r.id), ['r2', 'r3']);
});

test('fila: aprovar/recusar só uma vez; cancelar só o dono', () => {
    const queue = createVisitQueue();
    queue.add({ id: 'r1', userId: 'p1', sceneId: 's1' });
    assert.equal(queue.resolve('r1', 'cancel', { byUserId: 'p2' }), null);
    assert.equal(queue.resolve('r1', 'approve').state, 'approved');
    assert.equal(queue.resolve('r1', 'decline'), null);
    assert.equal(queue.get('r1').state, 'approved');
    queue.add({ id: 'r2', userId: 'p1', sceneId: 's1' });
    assert.equal(queue.resolve('r2', 'cancel', { byUserId: 'p1' }).state, 'cancelled');
    assert.equal(queue.resolve('nada', 'approve'), null);
});

test('fila: expira só o que venceu', () => {
    let clock = 0;
    const queue = createVisitQueue({ now: () => clock, ttl: 100 });
    queue.add({ id: 'r1', userId: 'p1', sceneId: 's1' });
    clock = 50;
    queue.add({ id: 'r2', userId: 'p2', sceneId: 's1' });
    clock = 120;
    assert.deepEqual(queue.expireDue().map((r) => [r.id, r.state]), [['r1', 'expired']]);
    assert.deepEqual(queue.pending().map((r) => r.id), ['r2']);
    clock = 200;
    assert.deepEqual(queue.expireDue().map((r) => r.id), ['r2']);
    assert.deepEqual(queue.expireDue(), []);
});

test('fila: get devolve cópia (estado interno não vaza)', () => {
    const queue = createVisitQueue();
    queue.add({ id: 'r1', userId: 'p1', sceneId: 's1' });
    queue.get('r1').state = 'approved';
    assert.equal(queue.get('r1').state, 'pending');
});

test('fila: setTtl vale para pedidos novos e ignora valor inválido', () => {
    let clock = 0;
    const queue = createVisitQueue({ now: () => clock, ttl: 100 });
    assert.equal(queue.ttl(), 100);
    queue.setTtl(0);
    queue.setTtl(NaN);
    assert.equal(queue.ttl(), 100);
    queue.add({ id: 'r1', userId: 'p1', sceneId: 's1' });
    queue.setTtl(10);
    queue.add({ id: 'r2', userId: 'p2', sceneId: 's1' });
    clock = 50;
    assert.deepEqual(queue.expireDue().map((r) => r.id), ['r2']);
});
