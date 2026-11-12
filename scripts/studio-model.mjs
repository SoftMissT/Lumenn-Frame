/**
 * Estúdio de transição: o que a linha do tempo mostra e como o monitor toca cada tipo.
 * Puro: sem Foundry. O estúdio passa o reconhecedor de efeitos de cinema.
 *
 * Tipos:
 * - `cut`    troca seca no meio (sem animação);
 * - `shader` filtro do Foundry ou do Lumenn: mistura contínua A → B, arrastável;
 * - `film`   efeito de cinema (overlay): cobre, troca no corte, revela;
 * - `video`  stinger: o vídeo cobre a tela no ponto de corte.
 */

const MIN_MS = 200;
const MAX_MS = 10000;

export function transitionKind(type, filmEffectOf = () => null) {
    if (!type || type === 'cut') return 'cut';
    const effect = filmEffectOf(type);
    if (effect === 'video') return 'video';
    if (effect) return 'film';
    return 'shader';
}

const clampMs = (value, fallback) => {
    const n = Number(value);
    return Number.isFinite(n) && n > 0 ? Math.min(MAX_MS, Math.max(MIN_MS, Math.round(n))) : fallback;
};

/**
 * @param {object} sceneTrans `edge.transition.scene`
 * @param {object} opts
 * @param {Function} [opts.filmEffectOf]
 * @param {number} [opts.defaultMs] duração quando a transição não define (padrão do tipo)
 * @param {number} [opts.videoMs] duração real do vídeo, quando já conhecida
 */
export function studioTimeline(sceneTrans = {}, { filmEffectOf, defaultMs = 1000, videoMs = 0 } = {}) {
    const kind = transitionKind(sceneTrans?.type, filmEffectOf);
    const fallback = clampMs(defaultMs, 1000);
    let duration = kind === 'cut' ? 600 : clampMs(sceneTrans?.duration, fallback);
    if (kind === 'video' && Number(videoMs) > 0) duration = Math.round(Number(videoMs));
    let cut = Math.round(duration / 2);
    if (kind === 'video') {
        const at = Number(sceneTrans?.video?.cutAt);
        if (sceneTrans?.video?.cutAt !== '' && sceneTrans?.video?.cutAt != null && Number.isFinite(at) && at >= 0)
            cut = Math.min(Math.round(at), duration);
    }
    return {
        kind,
        duration,
        cut,
        cutRatio: duration ? cut / duration : 0.5,
        scrubbable: kind === 'shader' || kind === 'cut',
        marks: [
            { id: 'start', at: 0, ratio: 0 },
            { id: 'cut', at: cut, ratio: duration ? cut / duration : 0.5 },
            { id: 'end', at: duration, ratio: 1 },
        ],
    };
}

/** Progresso 0..1 do filtro num instante da linha do tempo (cut salta no corte). */
export function progressAt(ms, timeline) {
    if (!timeline?.duration) return 0;
    const t = Math.min(1, Math.max(0, Number(ms) / timeline.duration));
    if (timeline.kind === 'cut') return t >= timeline.cutRatio ? 1 : 0;
    return t;
}

/** Texto do relógio da linha do tempo: "0,75 s". */
export function formatMs(ms, locale = 'pt-BR') {
    const seconds = Math.max(0, Number(ms) || 0) / 1000;
    return `${seconds.toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} s`;
}
