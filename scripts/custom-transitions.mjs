const CUSTOM_TYPES = Object.freeze({
  ZOOM_IN: "lumennZoomIn",
  ZOOM_OUT: "lumennZoomOut",
  CROSS_DISSOLVE: "lumennCrossDissolve",
});

function createLumennFilter() {
  const filters = foundry.canvas?.rendering?.filters;
  const BaseFilter = filters?.TextureTransitionFilter ?? filters?.AbstractBaseFilter;
  if (!BaseFilter || !globalThis.PIXI?.Matrix) return null;

  return class LumennTransitionFilter extends BaseFilter {
    static get defaultUniforms() {
      return {
        ...(super.defaultUniforms ?? {}),
        progress: 0,
        type: 0,
        targetTexture: null,
        targetUVMatrix: new PIXI.Matrix(),
        filterMatrix: new PIXI.Matrix(),
        filterMatrixInverse: new PIXI.Matrix(),
        backgroundColor: [0, 0, 0, 1],
      };
    }

    get type() {
      return [CUSTOM_TYPES.ZOOM_IN, CUSTOM_TYPES.ZOOM_OUT, CUSTOM_TYPES.CROSS_DISSOLVE][
        this.uniforms.type
      ];
    }

    set type(type) {
      const effect = {
        [CUSTOM_TYPES.ZOOM_IN]: 0,
        [CUSTOM_TYPES.ZOOM_OUT]: 1,
        [CUSTOM_TYPES.CROSS_DISSOLVE]: 2,
      }[type];
      if (effect === undefined) throw new Error(`Unknown Lumenn transition: ${type}`);
      this.uniforms.type = effect;
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
        vec4 filterVertexPosition() {
          vec2 position = aVertexPosition * max(outputFrame.zw, vec2(0.)) + outputFrame.xy;
          return vec4((projectionMatrix * vec3(position, 1.0)).xy, 0.0, 1.0);
        }
        vec2 filterTextureCoord() {
          return aVertexPosition * (outputFrame.zw * inputSize.zw);
        }
        void main() {
          gl_Position = filterVertexPosition();
          vTextureCoord = filterTextureCoord();
          vFilterCoord = (filterMatrix * vec3(vTextureCoord, 1.0)).xy;
        }
      `;
    }

    static _createFragmentShader() {
      return `
        precision ${PIXI.Program.defaultFragmentPrecision} float;
        uniform float progress;
        uniform float type;
        uniform sampler2D uSampler;
        uniform sampler2D targetTexture;
        uniform mat3 filterMatrixInverse;
        uniform mat3 targetUVMatrix;
        uniform vec4 backgroundColor;
        varying vec2 vFilterCoord;

        vec2 sourceUv(vec2 uv) {
          return (filterMatrixInverse * vec3(uv, 1.0)).xy;
        }
        vec2 targetUv(vec2 uv) {
          return (targetUVMatrix * vec3(uv, 1.0)).xy;
        }
        void main() {
          float p = smoothstep(0.0, 1.0, progress);
          vec2 center = vec2(0.5);
          vec2 sourceCoord = sourceUv(vFilterCoord);
          float zoom = type < 0.5 ? (1.0 + p * 0.42) : (1.0 - p * 0.32);
          vec2 zoomedSource = clamp(center + (sourceCoord - center) * zoom, 0.0, 1.0);
          vec4 source = texture2D(uSampler, zoomedSource);
          vec4 target = texture2D(targetTexture, targetUv(vFilterCoord));
          target = mix(backgroundColor, target, target.a);
          float amount = type > 1.5 ? p : smoothstep(0.5, 1.0, p);
          gl_FragColor = mix(source, target, amount);
        }
      `;
    }
  };
}

export function registerLumennTransitions() {
  const config = (globalThis.CONFIG ??= {});
  const canvasConfig = (config.Canvas ??= {});
  const registry = (canvasConfig.sceneTransitions ??= {});
  const Filter = createLumennFilter();
  if (!Filter) return false;
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
