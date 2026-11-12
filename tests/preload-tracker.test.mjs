import test from 'node:test';
import assert from 'node:assert/strict';
import { createPreloadTracker, nextPreloadState, PRELOAD_STATES } from '../scripts/preload-tracker.mjs';

/** Promessa controlável: o teste decide quando a carga termina. */
const deferred = () => {
    let resolve;
    let reject;
    const promise = new Promise((ok, fail) => {
        resolve = ok;
        reject = fail;
    });
    return { promise, resolve, reject };
};

test('reducer: ciclo feliz idle → loading → ready', () => {
    assert.equal(nextPreloadState('idle', 'start'), 'loading');
    assert.equal(nextPreloadState('loading', 'resolve'), 'ready');
});

test('reducer: falha, nova tentativa e cancelamento', () => {
    assert.equal(nextPreloadState('loading', 'reject'), 'error');
    assert.equal(nextPreloadState('error', 'start'), 'loading');
    assert.equal(nextPreloadState('loading', 'cancel'), 'cancelled');
    assert.equal(nextPreloadState('cancelled', 'start'), 'loading');
});

test('reducer: ready não recarrega e cancel fora de loading é ignorado', () => {
    assert.equal(nextPreloadState('ready', 'start'), 'ready');
    assert.equal(nextPreloadState('ready', 'cancel'), 'ready');
    assert.equal(nextPreloadState('idle', 'cancel'), 'idle');
});

test('reducer: resolve/reject fora de loading não mudam nada', () => {
    for (const state of ['idle', 'ready', 'error', 'cancelled']) {
        assert.equal(nextPreloadState(state, 'resolve'), state);
        assert.equal(nextPreloadState(state, 'reject'), state);
    }
});

test('reducer: reset sempre volta a idle; entrada desconhecida não lança', () => {
    for (const state of PRELOAD_STATES) assert.equal(nextPreloadState(state, 'reset'), 'idle');
    assert.equal(nextPreloadState('ready', 'explode'), 'ready');
    assert.equal(nextPreloadState('???', 'start'), '???');
});

test('tracker: deduplica cargas simultâneas da mesma cena', async () => {
    let calls = 0;
    const gate = deferred();
    const tracker = createPreloadTracker({
        load: () => {
            calls++;
            return gate.promise;
        },
    });
    const first = tracker.start('scene-a');
    const second = tracker.start('scene-a');
    assert.equal(first, second);
    assert.equal(tracker.state('scene-a'), 'loading');
    gate.resolve();
    assert.equal(await first, 'ready');
    assert.equal(calls, 1);
});

test('tracker: ready não dispara nova carga', async () => {
    let calls = 0;
    const tracker = createPreloadTracker({ load: async () => void calls++ });
    await tracker.start('scene-a');
    assert.equal(await tracker.start('scene-a'), 'ready');
    assert.equal(calls, 1);
});

test('tracker: cancelar descarta o resultado atrasado', async () => {
    const gate = deferred();
    const seen = [];
    const tracker = createPreloadTracker({
        load: () => gate.promise,
        onChange: (key, state) => seen.push(state),
    });
    const run = tracker.start('scene-a');
    assert.equal(tracker.cancel('scene-a'), 'cancelled');
    gate.resolve();
    assert.equal(await run, 'cancelled');
    assert.equal(tracker.state('scene-a'), 'cancelled');
    assert.deepEqual(seen, ['loading', 'cancelled']);
});

test('tracker: retry depois de cancelar ignora a execução antiga', async () => {
    const old = deferred();
    const fresh = deferred();
    const gates = [old, fresh];
    const tracker = createPreloadTracker({ load: () => gates.shift().promise });
    const first = tracker.start('scene-a');
    tracker.cancel('scene-a');
    const second = tracker.start('scene-a');
    old.resolve();
    assert.equal(await first, 'loading');
    fresh.resolve();
    assert.equal(await second, 'ready');
});

test('tracker: falha vira error com o motivo e permite nova tentativa', async () => {
    let fail = true;
    const errors = [];
    const tracker = createPreloadTracker({
        load: async () => {
            if (fail) throw new Error('404');
        },
        onChange: (key, state, error) => error && errors.push(error.message),
    });
    assert.equal(await tracker.start('scene-a'), 'error');
    assert.deepEqual(errors, ['404']);
    fail = false;
    assert.equal(await tracker.start('scene-a'), 'ready');
});

test('tracker: cenas diferentes são independentes; chave vazia é idle', async () => {
    const gate = deferred();
    const tracker = createPreloadTracker({
        load: (key) => (key === 'slow' ? gate.promise : Promise.resolve()),
    });
    const slow = tracker.start('slow');
    assert.equal(await tracker.start('fast'), 'ready');
    assert.equal(tracker.state('slow'), 'loading');
    assert.equal(await tracker.start(''), 'idle');
    gate.resolve();
    assert.equal(await slow, 'ready');
});

test('tracker: reset esquece a cena', async () => {
    const tracker = createPreloadTracker({ load: async () => {} });
    await tracker.start('scene-a');
    tracker.reset('scene-a');
    assert.equal(tracker.state('scene-a'), 'idle');
});

test('tracker: exige load', () => {
    assert.throws(() => createPreloadTracker({}), TypeError);
});
