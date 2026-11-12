/**
 * Pré-load do GM por cena: estados, deduplicação e cancelamento.
 * Puro: não toca em Foundry. Quem carrega de verdade é o `load` injetado.
 */
export const PRELOAD_STATES = Object.freeze(['idle', 'loading', 'ready', 'error', 'cancelled']);
export const PRELOAD_EVENTS = Object.freeze(['start', 'resolve', 'reject', 'cancel', 'reset']);
/**
 * Próximo estado de uma cena dado um evento.
 * Estado ou evento desconhecido devolve o estado atual (nunca lança).
 *
 * @param {'idle'|'loading'|'ready'|'error'|'cancelled'} state
 * @param {'start'|'resolve'|'reject'|'cancel'|'reset'} event
 * @returns {'idle'|'loading'|'ready'|'error'|'cancelled'}
 */
export function nextPreloadState(state, event) {
    if (event === 'reset') return 'idle';
    if (!PRELOAD_STATES.includes(state)) return state;
    // Pronta não recarrega (o cache do core já está quente); erro e cancelado tentam de novo.
    if (event === 'start') return state === 'ready' || state === 'loading' ? state : 'loading';
    // resolve/reject/cancel só valem durante a carga.
    if (state !== 'loading') return state;
    if (event === 'resolve') return 'ready';
    if (event === 'reject') return 'error';
    if (event === 'cancel') return 'cancelled';
    return state;
}
/**
 * @param {object} options
 * @param {(key: string) => Promise<unknown>} options.load  Carrega a cena. Rejeita em falha.
 * @param {(key: string, state: string, error: unknown) => void} [options.onChange]
 */
export function createPreloadTracker({ load, onChange = () => {} } = {}) {
    if (typeof load !== 'function')
        throw new TypeError('createPreloadTracker: load é obrigatório.');
    /** @type {Map<string, {state: string, run: number, promise: Promise<string>|null, error: unknown}>} */
    const entries = new Map();
    const stateOf = (key) => entries.get(key)?.state ?? 'idle';
    const write = (key, patch) => {
        const entry = {
            state: 'idle',
            run: 0,
            promise: null,
            error: null,
            ...entries.get(key),
            ...patch,
        };
        entries.set(key, entry);
        onChange(key, entry.state, entry.error);
        return entry;
    };
    return {
        state: stateOf,
        /** Inicia (ou reaproveita) o pré-load. Resolve com o estado final desta execução. */
        start(key) {
            if (!key) return Promise.resolve('idle');
            const current = entries.get(key);
            if (current?.state === 'loading' && current.promise) return current.promise;
            const next = nextPreloadState(stateOf(key), 'start');
            if (next !== 'loading') return Promise.resolve(next);
            const run = (current?.run ?? 0) + 1;
            const settle = (event, error = null) => {
                const live = entries.get(key);
                // Resultado atrasado de uma execução cancelada: descarta.
                if (live?.run !== run || live.state !== 'loading') return live?.state ?? 'idle';
                return write(key, {
                    state: nextPreloadState('loading', event),
                    promise: null,
                    error,
                }).state;
            };
            const promise = Promise.resolve()
                .then(() => load(key))
                .then(
                    () => settle('resolve'),
                    (error) => settle('reject', error ?? new Error('preload failed'))
                );
            write(key, {
                state: 'loading',
                run,
                promise,
                error: null,
            });
            return promise;
        },
        /**
         * Cancela a espera. ponytail: o Foundry não aborta o download de texturas;
         * cancelar só descarta o resultado. Upgrade: AbortSignal se o core expuser.
         */
        cancel(key) {
            const current = entries.get(key);
            if (!current) return 'idle';
            const next = nextPreloadState(current.state, 'cancel');
            if (next === current.state) return next;
            return write(key, {
                state: next,
                run: current.run + 1,
                promise: null,
            }).state;
        },
        reset(key) {
            if (!entries.delete(key)) return;
            onChange(key, 'idle', null);
        },
    };
}
