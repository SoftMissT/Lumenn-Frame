import test from "node:test";
import assert from "node:assert/strict";

test("custom transition registry exposes the three Lumenn effects", async () => {
  globalThis.PIXI = {
    TextureMatrix: class {},
    Matrix: class {},
    Program: { defaultFragmentPrecision: "highp" },
  };
  globalThis.foundry = {
    canvas: { rendering: { filters: { AbstractBaseFilter: class {} } } },
  };
  globalThis.CONFIG = { Canvas: { sceneTransitions: {} } };
  const { registerLumennTransitions } = await import(
    "../scripts/custom-transitions.mjs"
  );
  const registered = registerLumennTransitions();
  assert.deepEqual(registered, [
    "lumenn-zoom-in",
    "lumenn-zoom-out",
    "lumenn-cross-dissolve",
  ]);
  for (const id of registered) {
    assert.equal(CONFIG.Canvas.sceneTransitions[id].filterType.startsWith("lumenn"), true);
    assert.equal(typeof CONFIG.Canvas.sceneTransitions[id].filterClass, "function");
    const Filter = CONFIG.Canvas.sceneTransitions[id].filterClass;
    assert.ok("progress" in Filter.defaultUniforms);
    assert.ok("targetTexture" in Filter.defaultUniforms);
    assert.ok("targetUVMatrix" in Filter.defaultUniforms);
    assert.ok("filterMatrixInverse" in Filter.defaultUniforms);
    assert.match(Filter._createFragmentShader(), /filterMatrixInverse/);
  }
});
