const CUSTOM_TYPES = Object.freeze({
  ZOOM_IN: "lumennZoomIn",
  ZOOM_OUT: "lumennZoomOut",
  CROSS_DISSOLVE: "lumennCrossDissolve",
});

function createLumennFilter() {
  const BaseFilter = foundry.canvas?.rendering?.filters?.AbstractBaseFilter;
  if (!BaseFilter || !globalThis.PIXI?.TextureMatrix) return null;

  return class LumennTransitionFilter extends BaseFilter {
    static get defaultUniforms() {
      return {
        progress: 0,
        effect: 0,
        targetTexture: null,
        targetUVMatrix: new PIXI.Matrix(),
      };
    }

    get type() {
      return this.uniforms.effect;
    }

    set type(type) {
      const effect = {
        [CUSTOM_TYPES.ZOOM_IN]: 0,
        [CUSTOM_TYPES.ZOOM_OUT]: 1,
        [CUSTOM_TYPES.CROSS_DISSOLVE]: 2,
      }[type];
      if (effect === undefined) throw new Error(`Unknown Lumenn transition: ${type}`);
      this.uniforms.effect = effect;
    }

    set targetTexture(texture) {
      if (!texture) return;
      if (!texture.uvMatrix) {
        texture.uvMatrix = new PIXI.TextureMatrix(texture, 0.0);
        texture.uvMatrix.update();
      }
      this.uniforms.targetTexture = texture;
      this.uniforms.targetUVMatrix = texture.uvMatrix.mapCoord.toArray(true);
    }

    static _createVertexShader() {
      return `
        precision ${PIXI.Program.defaultFragmentPrecision} float;
        attribute vec2 aVertexPosition;
        uniform mat3 projectionMatrix;
        uniform mat3 filterMatrix;
        uniform vec4 inputSize;
        uniform vec4 outputFrame;
        varying vec2 vTextureCoord;
        varying vec2 vFilterCoord;
        void main() {
          vec2 position = aVertexPosition * max(outputFrame.zw, vec2(0.)) + outputFrame.xy;
          gl_Position = vec4((projectionMatrix * vec3(position, 1.0)).xy, 0.0, 1.0);
          vTextureCoord = aVertexPosition * (outputFrame.zw * inputSize.zw);
          vFilterCoord = (filterMatrix * vec3(vTextureCoord, 1.0)).xy;
        }
      `;
    }

    static _createFragmentShader() {
      return `
        precision ${PIXI.Program.defaultFragmentPrecision} float;
        uniform float progress;
        uniform float effect;
        uniform sampler2D uSampler;
        uniform sampler2D targetTexture;
        uniform mat3 targetUVMatrix;
        varying vec2 vTextureCoord;
        varying vec2 vFilterCoord;
        vec2 targetUv(vec2 uv) {
          return (targetUVMatrix * vec3(uv, 1.0)).xy;
        }
        void main() {
          vec2 center = vec2(0.5);
          float p = smoothstep(0.0, 1.0, progress);
          float zoom = effect < 0.5 ? (1.0 + p * 0.42) : (1.0 - p * 0.32);
          vec2 sourceUv = clamp(center + (vTextureCoord - center) * zoom, 0.0, 1.0);
          vec4 source = texture2D(uSampler, sourceUv);
          vec4 target = texture2D(targetTexture, targetUv(vFilterCoord));
          float mixAmount = effect > 1.5 ? p : smoothstep(0.5, 1.0, p);
          gl_FragColor = mix(source, target, mixAmount);
        }
      `;
    }
  };
}

export function registerLumennTransitions() {
  const registry = CONFIG.Canvas?.sceneTransitions;
  const Filter = createLumennFilter();
  if (!registry || !Filter) return false;
  const definitions = {
    "lumenn-zoom-in": {
      id: "lumenn-zoom-in",
      label: "LUMENN_FRAME.SceneTransition.ZoomIn",
      filterClass: Filter,
      filterType: CUSTOM_TYPES.ZOOM_IN,
      defaultDuration: 900,
    },
    "lumenn-zoom-out": {
      id: "lumenn-zoom-out",
      label: "LUMENN_FRAME.SceneTransition.ZoomOut",
      filterClass: Filter,
      filterType: CUSTOM_TYPES.ZOOM_OUT,
      defaultDuration: 900,
    },
    "lumenn-cross-dissolve": {
      id: "lumenn-cross-dissolve",
      label: "LUMENN_FRAME.SceneTransition.CrossDissolve",
      filterClass: Filter,
      filterType: CUSTOM_TYPES.CROSS_DISSOLVE,
      defaultDuration: 1200,
    },
  };
  Object.assign(registry, definitions);
  return Object.keys(definitions);
}
