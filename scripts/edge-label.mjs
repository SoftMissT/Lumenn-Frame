const MODE_KEYS = {
    auto: 'LUMENN_FRAME.Edge.Auto',
    keep: 'LUMENN_FRAME.Edge.Keep',
    crossfade: 'LUMENN_FRAME.Edge.Crossfade',
    fadeout: 'LUMENN_FRAME.Edge.FadeOut',
    fadein: 'LUMENN_FRAME.Edge.FadeIn',
    cut: 'LUMENN_FRAME.Edge.Cut',
};
const UNTIMED_MODES = new Set(['keep', 'cut']);
const sec = (ms) => `${((ms ?? 0) / 1e3).toFixed(1)}s`;
export function formatEdgeLabel(t, { L, sceneName }) {
    const sceneType = t.scene?.type ?? 'cut';
    const scene = sceneType === 'cut' ? sceneName : `${sceneName} ${sec(t.scene?.duration)}`;
    const mode = t.audio?.mode ?? 'auto';
    const audioName = L(MODE_KEYS[mode] ?? MODE_KEYS.auto);
    const audio = UNTIMED_MODES.has(mode)
        ? audioName
        : `${audioName} ${sec(t.audio?.crossfadeDuration)}`;
    const scope = t.scope ?? 'both';
    if (scope === 'scene') return `${L('LUMENN_FRAME.Inspector.SceneOnly')} · ${scene}`;
    if (scope === 'audio') return `${L('LUMENN_FRAME.Inspector.AudioOnly')} · ${audio}`;
    return `${scene} · ${audio}`;
}

/**
 * Encurta o rótulo para caber no vão visível entre os dois cards (o rótulo mora sob os
 * cards, ADR-002). `span` está em unidades do grafo; a fonte contra-escala pelo zoom com
 * teto 1,5, então a largura em unidades do grafo é `chars * charWidth * escala`.
 * Sem espaço para `minChars`, devolve '' (melhor sem rótulo do que cortado no meio).
 */
export function fitEdgeLabel(label, { span, zoom, charWidth = 6.2, padding = 12, minChars = 4 } = {}) {
    const text = String(label ?? '');
    if (!text || !Number.isFinite(span)) return text;
    const scale = Math.min(1 / Math.max(zoom || 1, 0.01), 1.5);
    const max = Math.floor((span - padding) / (charWidth * scale));
    if (text.length <= max) return text;
    if (max < minChars) return '';
    return `${text.slice(0, max - 1).trimEnd()}…`;
}

/**
 * Largura livre em volta do rótulo: do centro até o card mais próximo de cada lado,
 * só entre os cards que cruzam a faixa vertical do texto. Centro dentro de um card = 0.
 * Sem card nos lados devolve Infinity (nada a cortar). Tudo em unidades do grafo.
 * `rects`: [{x, y, width, height}].
 */
export function labelRoom({ x, y }, rects, { above = 14, below = 4 } = {}) {
    let left = Infinity;
    let right = Infinity;
    for (const rect of rects ?? []) {
        if (!rect) continue;
        const top = rect.y;
        const bottom = rect.y + rect.height;
        if (bottom < y - above || top > y + below) continue;
        const rectRight = rect.x + rect.width;
        if (x >= rect.x && x <= rectRight) return 0;
        if (rectRight < x) left = Math.min(left, x - rectRight);
        else right = Math.min(right, rect.x - x);
    }
    return 2 * Math.min(left, right);
}