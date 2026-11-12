const CUSTOM_TYPES = Object.freeze({
    ZOOM_IN: 'lumennZoomIn',
    ZOOM_OUT: 'lumennZoomOut',
    CROSS_DISSOLVE: 'lumennCrossDissolve',
    BOUNCE_IN: 'lumennBounceIn',
    SLIDE: 'lumennSlide',
    PIXELATE: 'lumennPixelate',
});
/** Ordem = índice no shader (uniform `type`). Só acrescentar no fim. */
const TYPE_ORDER = [
    CUSTOM_TYPES.ZOOM_IN,
    CUSTOM_TYPES.ZOOM_OUT,
    CUSTOM_TYPES.CROSS_DISSOLVE,
    CUSTOM_TYPES.BOUNCE_IN,
    CUSTOM_TYPES.SLIDE,
    CUSTOM_TYPES.PIXELATE,
];

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
            return TYPE_ORDER[this.uniforms.type];
        }
        set type(type) {
            const effect = TYPE_ORDER.indexOf(type);
            if (effect < 0) throw new Error(`Unknown Lumenn transition: ${type}`);
            this.uniforms.type = effect;
        }
        set targetTexture(texture) {
            if (!texture) return;
            if (!texture.uvMatrix) {
                texture.uvMatrix = new PIXI.TextureMatrix(texture, 0);
                texture.uvMatrix.update();
            }
            this.uniforms.targetTexture = texture;
            this.uniforms.targetUVMatrix = texture.uvMatrix.mapCoord.toArray(true);
        }
        static _createVertexShader() {
            return `\n        precision ${PIXI.Program.defaultFragmentPrecision} float;\n        attribute vec2 aVertexPosition;\n        uniform mat3 projectionMatrix;\n        uniform mat3 filterMatrix;\n        uniform vec4 inputSize;\n        uniform vec4 outputFrame;\n        varying vec2 vTextureCoord;\n        varying vec2 vFilterCoord;\n        vec4 filterVertexPosition() {\n          vec2 position = aVertexPosition * max(outputFrame.zw, vec2(0.)) + outputFrame.xy;\n          return vec4((projectionMatrix * vec3(position, 1.0)).xy, 0.0, 1.0);\n        }\n        vec2 filterTextureCoord() {\n          return aVertexPosition * (outputFrame.zw * inputSize.zw);\n        }\n        void main() {\n          gl_Position = filterVertexPosition();\n          vTextureCoord = filterTextureCoord();\n          vFilterCoord = (filterMatrix * vec3(vTextureCoord, 1.0)).xy;\n        }\n      `;
        }
        static _createFragmentShader() {
            return `\n        precision ${PIXI.Program.defaultFragmentPrecision} float;\n        uniform float progress;\n        uniform float type;\n        uniform sampler2D uSampler;\n        uniform sampler2D targetTexture;\n        uniform mat3 filterMatrixInverse;\n        uniform mat3 targetUVMatrix;\n        uniform vec4 backgroundColor;\n        varying vec2 vFilterCoord;\n\n        vec2 sourceUv(vec2 uv) {\n          return (filterMatrixInverse * vec3(uv, 1.0)).xy;\n        }\n        vec2 targetUv(vec2 uv) {\n          return (targetUVMatrix * vec3(uv, 1.0)).xy;\n        }\n        vec4 targetAt(vec2 uv) {\n          vec4 t = texture2D(targetTexture, targetUv(uv));\n          return mix(backgroundColor, t, t.a);\n        }\n        float bounceOut(float t) {\n          if (t < 1.0 / 2.75) return 7.5625 * t * t;\n          if (t < 2.0 / 2.75) { t -= 1.5 / 2.75; return 7.5625 * t * t + 0.75; }\n          if (t < 2.5 / 2.75) { t -= 2.25 / 2.75; return 7.5625 * t * t + 0.9375; }\n          t -= 2.625 / 2.75; return 7.5625 * t * t + 0.984375;\n        }\n        void main() {\n          float p = smoothstep(0.0, 1.0, progress);\n          vec2 center = vec2(0.5);\n          vec2 uv = vFilterCoord;\n          if (type > 4.5) {\n            // Pixel retrô: pixeliza até o meio, troca de cena e despixeliza.\n            float peak = 1.0 - abs(1.0 - 2.0 * progress);\n            float cells = mix(480.0, 18.0, peak);\n            vec2 q = (floor(uv * cells) + 0.5) / cells;\n            gl_FragColor = mix(texture2D(uSampler, sourceUv(q)), targetAt(q), smoothstep(0.45, 0.55, progress));\n            return;\n          }\n          if (type > 3.5) {\n            // Empurrar: a cena nova entra pela direita e empurra a antiga.\n            gl_FragColor = uv.x < 1.0 - p\n              ? texture2D(uSampler, sourceUv(uv + vec2(p, 0.0)))\n              : targetAt(uv - vec2(1.0 - p, 0.0));\n            return;\n          }\n          if (type > 2.5) {\n            // Bounce in: a cena nova cresce do centro quicando sobre a antiga, que escurece.\n            float s = bounceOut(clamp(progress, 0.0, 1.0));\n            vec2 t = center + (uv - center) / max(s, 0.001);\n            vec4 source = texture2D(uSampler, sourceUv(uv)) * (1.0 - 0.55 * p);\n            bool inside = t.x >= 0.0 && t.x <= 1.0 && t.y >= 0.0 && t.y <= 1.0 && s > 0.001;\n            gl_FragColor = inside ? targetAt(t) : source;\n            return;\n          }\n          vec2 sourceCoord = sourceUv(uv);\n          float zoom = type < 0.5 ? (1.0 + p * 0.42) : (1.0 - p * 0.32);\n          vec2 zoomedSource = clamp(center + (sourceCoord - center) * zoom, 0.0, 1.0);\n          vec4 source = texture2D(uSampler, zoomedSource);\n          float amount = type > 1.5 ? p : smoothstep(0.5, 1.0, p);\n          gl_FragColor = mix(source, targetAt(uv), amount);\n        }\n      `;
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
        'lumenn-zoom-in': {
            id: 'lumenn-zoom-in',
            label: 'LUMENN_FRAME.SceneTransition.ZoomIn',
            filterClass: Filter,
            filterType: CUSTOM_TYPES.ZOOM_IN,
            defaultDuration: 900,
        },
        'lumenn-zoom-out': {
            id: 'lumenn-zoom-out',
            label: 'LUMENN_FRAME.SceneTransition.ZoomOut',
            filterClass: Filter,
            filterType: CUSTOM_TYPES.ZOOM_OUT,
            defaultDuration: 900,
        },
        'lumenn-cross-dissolve': {
            id: 'lumenn-cross-dissolve',
            label: 'LUMENN_FRAME.SceneTransition.CrossDissolve',
            filterClass: Filter,
            filterType: CUSTOM_TYPES.CROSS_DISSOLVE,
            defaultDuration: 1200,
        },
        'lumenn-bounce-in': {
            id: 'lumenn-bounce-in',
            label: 'LUMENN_FRAME.SceneTransition.BounceIn',
            filterClass: Filter,
            filterType: CUSTOM_TYPES.BOUNCE_IN,
            defaultDuration: 1100,
        },
        'lumenn-slide': {
            id: 'lumenn-slide',
            label: 'LUMENN_FRAME.SceneTransition.Slide',
            filterClass: Filter,
            filterType: CUSTOM_TYPES.SLIDE,
            defaultDuration: 900,
        },
        'lumenn-pixelate': {
            id: 'lumenn-pixelate',
            label: 'LUMENN_FRAME.SceneTransition.Pixelate',
            filterClass: Filter,
            filterType: CUSTOM_TYPES.PIXELATE,
            defaultDuration: 1200,
        },
    };
    Object.assign(registry, definitions);
    return Object.keys(definitions);
}
