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
