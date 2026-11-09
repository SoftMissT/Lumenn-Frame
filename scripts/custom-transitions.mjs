const CUSTOM_TYPES = Object.freeze({
    ZOOM_IN: 'lumennZoomIn',
    ZOOM_OUT: 'lumennZoomOut',
    CROSS_DISSOLVE: 'lumennCrossDissolve',
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
            return `\n        precision ${PIXI.Program.defaultFragmentPrecision} float;\n        uniform float progress;\n        uniform float type;\n        uniform sampler2D uSampler;\n        uniform sampler2D targetTexture;\n        uniform mat3 filterMatrixInverse;\n        uniform mat3 targetUVMatrix;\n        uniform vec4 backgroundColor;\n        varying vec2 vFilterCoord;\n\n        vec2 sourceUv(vec2 uv) {\n          return (filterMatrixInverse * vec3(uv, 1.0)).xy;\n        }\n        vec2 targetUv(vec2 uv) {\n          return (targetUVMatrix * vec3(uv, 1.0)).xy;\n        }\n        void main() {\n          float p = smoothstep(0.0, 1.0, progress);\n          vec2 center = vec2(0.5);\n          vec2 sourceCoord = sourceUv(vFilterCoord);\n          float zoom = type < 0.5 ? (1.0 + p * 0.42) : (1.0 - p * 0.32);\n          vec2 zoomedSource = clamp(center + (sourceCoord - center) * zoom, 0.0, 1.0);\n          vec4 source = texture2D(uSampler, zoomedSource);\n          vec4 target = texture2D(targetTexture, targetUv(vFilterCoord));\n          target = mix(backgroundColor, target, target.a);\n          float amount = type > 1.5 ? p : smoothstep(0.5, 1.0, p);\n          gl_FragColor = mix(source, target, amount);\n        }\n      `;
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
    };
    Object.assign(registry, definitions);
    return Object.keys(definitions);
}
