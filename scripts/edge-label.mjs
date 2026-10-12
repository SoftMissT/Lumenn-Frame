const MODE_KEYS = {
  auto: "LUMENN_FRAME.Edge.Auto",
  keep: "LUMENN_FRAME.Edge.Keep",
  crossfade: "LUMENN_FRAME.Edge.Crossfade",
  fadeout: "LUMENN_FRAME.Edge.FadeOut",
  fadein: "LUMENN_FRAME.Edge.FadeIn",
  cut: "LUMENN_FRAME.Edge.Cut",
};

// Modos sem duração (manter/cortar) não mostram segundos.
const UNTIMED_MODES = new Set(["keep", "cut"]);

const sec = (ms) => `${((ms ?? 0) / 1000).toFixed(1)}s`;

/**
 * Texto do label central da FLOW edge. Escopo "both" (padrão) fica sem prefixo:
 * "Dissolver 1.0s · Auto 3.0s". Escopo parcial mostra só a parte que roda.
 * @param {object} t   edge.transition
 * @param {{L:(key:string)=>string, sceneName:string}} ctx
 *        L = localize; sceneName = rótulo já resolvido do tipo de transição de cena.
 */
export function formatEdgeLabel(t, { L, sceneName }) {
  const sceneType = t.scene?.type ?? "cut";
  const scene =
    sceneType === "cut" ? sceneName : `${sceneName} ${sec(t.scene?.duration)}`;
  const mode = t.audio?.mode ?? "auto";
  const audioName = L(MODE_KEYS[mode] ?? MODE_KEYS.auto);
  const audio = UNTIMED_MODES.has(mode)
    ? audioName
    : `${audioName} ${sec(t.audio?.crossfadeDuration)}`;
  const scope = t.scope ?? "both";
  if (scope === "scene") return `${L("LUMENN_FRAME.Inspector.SceneOnly")} · ${scene}`;
  if (scope === "audio") return `${L("LUMENN_FRAME.Inspector.AudioOnly")} · ${audio}`;
  return `${scene} · ${audio}`;
}
