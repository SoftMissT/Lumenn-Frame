import test from "node:test";
import assert from "node:assert/strict";
import { formatEdgeLabel } from "../scripts/edge-label.mjs";

const NAMES = {
  "LUMENN_FRAME.Edge.Auto": "Auto",
  "LUMENN_FRAME.Edge.Keep": "Manter",
  "LUMENN_FRAME.Edge.Crossfade": "Crossfade",
  "LUMENN_FRAME.Edge.Cut": "Corte",
  "LUMENN_FRAME.Inspector.SceneOnly": "Cena",
  "LUMENN_FRAME.Inspector.AudioOnly": "Áudio",
};
const L = (key) => NAMES[key] ?? key;

test("tipo de cena que não é fade mostra o próprio nome, não 'Corte'", () => {
  const label = formatEdgeLabel(
    { scope: "both", scene: { type: "waves", duration: 1500 }, audio: { mode: "auto", crossfadeDuration: 3000 } },
    { L, sceneName: "Ondas" },
  );
  assert.equal(label, "Ondas 1.5s · Auto 3.0s");
});

test("corte de cena e áudio sem duração não mostram segundos", () => {
  const label = formatEdgeLabel(
    { scope: "both", scene: { type: "cut", duration: 0 }, audio: { mode: "keep", crossfadeDuration: 3000 } },
    { L, sceneName: "Corte" },
  );
  assert.equal(label, "Corte · Manter");
});

test("escopo parcial mostra só a parte que roda", () => {
  const t = { scene: { type: "fade", duration: 1000 }, audio: { mode: "crossfade", crossfadeDuration: 2000 } };
  assert.equal(formatEdgeLabel({ ...t, scope: "scene" }, { L, sceneName: "Dissolver" }), "Cena · Dissolver 1.0s");
  assert.equal(formatEdgeLabel({ ...t, scope: "audio" }, { L, sceneName: "Dissolver" }), "Áudio · Crossfade 2.0s");
});
