import { LumennGraphStore } from './graph-store.mjs';
import { LumennTransitionController } from './transition-controller.mjs';
import { LumennCompat } from './foundry-compat.mjs';
import { LumennSettings } from './settings.mjs';
import { fitEdgeLabel, formatEdgeLabel, labelRoom } from './edge-label.mjs';
import {
    clampGraphZoom,
    directionalRectAnchor,
    focusCameraOnBounds,
    GRAPH_ZOOM_STEP,
    wheelPanDelta,
} from './graph-viewport.mjs';
import { openLumennGuide } from './guide-journal.mjs';
import {
    createNavigationTrail,
    popNavigationLevel,
    pushNavigationLevel,
    setNavigationNode,
    validateHiveExport,
} from './hive-runtime.mjs';
import {
    FILM_EFFECTS,
    FILM_PREFIX,
    filmCutPoint,
    filmEffectOf,
    filmPreview,
    filmTitle,
    DEFAULT_STINGER,
    STINGERS,
    stingerSrc,
    waitPlayersReady,
} from './film-transitions.mjs';
import {
    buildHiveExport,
    connectIntent,
    DEFAULT_HIVE_TRANSITIONS,
    hiveExportFileName,
    normalizeHiveTransition,
    orphanExitEdges,
    portHubView,
    resolveHiveExitEdge,
    HIVE_EXPORT_FORMAT,
    hiveEntryPort,
    hiveExitPortsAt,
    listHivePending,
    planHiveImport,
} from './hive-io.mjs';
import {
    childrenOf,
    effectiveEndpoint,
    GROUP_PADDING,
    groupBounds,
    groupOpenFor,
    movePositions,
    parentMap,
} from './graph-groups.mjs';
import { parentGraphId, planJump } from './neural-address.mjs';
import { linkBetween, linkedFrom } from './links.mjs';
import { TITLE_FONTS } from './fonts.mjs';
/** Grupos do seletor de transição por intenção (ids que não existirem no Foundry somem sozinhos). */
const TRANSITION_GROUPS = Object.freeze({
    motion: [
        'cut',
        'fade',
        'lumenn-cross-dissolve',
        'lumenn-zoom-in',
        'lumenn-zoom-out',
        'lumenn-bounce-in',
        'lumenn-slide',
    ],
    rpg: ['film:battle', 'lumenn-pixelate', 'glitch', 'hologram', 'swirl', 'holeSwirl'],
});
/** Atalhos: [id, ícone, rótulo curto]. O nome completo vai na dica. */
const QUICK_TRANSITIONS = Object.freeze([
    ['lumenn-cross-dissolve', 'fa-clone', 'Dissolve'],
    ['lumenn-zoom-in', 'fa-magnifying-glass-plus', 'ZoomIn'],
    ['lumenn-zoom-out', 'fa-magnifying-glass-minus', 'ZoomOut'],
    ['lumenn-bounce-in', 'fa-basketball', 'Bounce'],
    ['film:cutscene', 'fa-film', 'Cutscene'],
    ['film:battle', 'fa-burst', 'Battle'],
    ['film:video', 'fa-clapperboard', 'Stinger'],
    ['lumenn-pixelate', 'fa-chess-board', 'Pixel'],
    ['cut', 'fa-scissors', 'Cut'],
]);
import { graphRelations, pushRecent } from './neural-hud-model.mjs';
import { intentHintKey, isNodeDimmed, nodeClickIntent } from './node-intent.mjs';
import { buildNeuralContext } from './neural-context.mjs';
import { createPreloadTracker } from './preload-tracker.mjs';
import { LumennNeuralHud } from './neural-hud.mjs';
const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;
const { DragDrop } = foundry.applications.ux;
const ZOOM_STEP = GRAPH_ZOOM_STEP;
const MODULE_ID = 'lumenn-frame';
const HIVE_PACK = {
    name: 'lumenn-frame-hives',
    collection: 'world.lumenn-frame-hives',
};
const NODE_SIZES = {
    scene: {
        compact: [230, 160],
        normal: [320, 215],
        large: [400, 260],
    },
    audio: {
        compact: [210, 130],
        normal: [285, 165],
        large: [360, 205],
    },
    note: {
        compact: [200, 130],
        normal: [260, 170],
        large: [340, 220],
    },
    group: {
        compact: [280, 180],
        normal: [360, 240],
        large: [460, 300],
    },
    'hive-ref': {
        compact: [230, 160],
        normal: [320, 215],
        large: [400, 260],
    },
    encounter: {
        compact: [210, 120],
        normal: [270, 150],
        large: [340, 190],
    },
};
const COLORS = [
    '#f0a321',
    '#2dd4bf',
    '#e45656',
    '#7aa2f7',
    '#bb9af7',
    '#9ece6a',
    '#73707c',
    '#ffffff',
];
const SIZES = ['compact', 'normal', 'large'];
const HEX_COLOR = /^#[0-9a-f]{6}$/i;

function normalizeHexColor(value, fallback = '#000000') {
    const raw = String(value ?? '').trim();
    if (HEX_COLOR.test(raw)) return raw;
    if (/^#[0-9a-f]{3}$/i.test(raw)) {
        return `#${[...raw.slice(1)].map((c) => `${c}${c}`).join('')}`;
    }
    return HEX_COLOR.test(fallback) ? fallback : '#000000';
}

function nodeSize(type, size) {
    return NODE_SIZES[type]?.[size] ?? NODE_SIZES[type]?.normal ?? [260, 175];
}

function fadeOverlay() {
    let el = document.getElementById('lumenn-fade');
    if (!el) {
        el = document.createElement('div');
        el.id = 'lumenn-fade';
        el.style.cssText =
            'position:fixed;inset:0;background:#000;opacity:0;pointer-events:none;z-index:99999;transition:opacity .01s linear;';
        document.body.appendChild(el);
    }
    return el;
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
export async function lumennClientSceneFade(sceneId, sceneTrans = {}) {
    const type = sceneTrans?.type ?? 'fade';
    const scene = sceneId ? game.scenes.get(sceneId) : null;
    if (
        !LumennCompat.isGM() &&
        LumennCompat.hasNativeSceneTransitions() &&
        (type === 'cut' || LumennCompat.hasSceneTransition(type))
    )
        return 'native';
    const nativeResult = await LumennCompat.runSceneTransition({
        scene,
        type,
        duration: sceneTrans?.duration ?? 1e3,
        color: normalizeHexColor(sceneTrans?.color, '#000000'),
        activate: false,
    });
    if (nativeResult === 'native' || nativeResult === 'cut') return nativeResult;
    const el = fadeOverlay();
    const duration = sceneTrans?.duration ?? 500;
    if (duration <= 0) return;
    el.style.transition = `opacity ${duration}ms ease`;
    el.style.opacity = '1';
    await sleep(duration);
    if (sceneId) {
        if (LumennCompat.isGM())
            await LumennCompat.activateScene(scene, undefined, {
                suppressScenePlaylist: true,
            });
        else if (scene?.view) await scene.view();
    }
    await sleep(40);
    el.style.opacity = '0';
    await sleep(duration);
}
export class LumennGraphApp extends HandlebarsApplicationMixin(ApplicationV2) {
    #controller = new LumennTransitionController();
    #graphId = null;
    #mode = 'edit';
    #tool = 'select';
    #collapsedGroups = new Set();
    #lockedGroups = new Set();
    #trail = [];
    #editStack = [];
    #history = [];
    #future = [];
    #browserOpen = false;
    #browserFilter = 'all';
    #cameraFadeIn = false;
    #fitPending = false;
    #groupDragOverrides = null;
    #libraryDockOpen = false;
    #camera = {
        panX: 0,
        panY: 0,
        zoom: 1,
    };
    #panState = null;
    #spaceDown = false;
    #resizeObserver = null;
    #dragDrop;
    #selected = {
        kind: null,
        id: null,
    };
    #connectState = null;
    #edgeFrame = null;
    #pendingEdgeNodes = new Map();
    #edgeGraphSnapshot = null;
    #expanded = false;
    #prevPosition = null;
    #transitioning = false;
    #previewing = false;
    #suppressClick = false;
    #suppressNodeClick = false;
    #contextMenu = null;
    #contextCleanup = null;
    /** @type {LumennNeuralHud|null} */
    #destinationsHud = null;
    /** Pré-load do GM por cena. Sobrevive ao fechar o HUD: reabrir mostra "Pronta". */
    #preloads = createPreloadTracker({
        load: (sceneId) => {
            const scene = game.scenes.get(sceneId);
            if (!scene) throw new Error(`Lumenn Frame: cena ${sceneId} não existe.`);
            return LumennCompat.preloadScene(scene).then(() =>
                LumennCompat.assertScenePreloaded(scene)
            );
        },
        onChange: (sceneId, state, error) => this.#onPreloadChange(sceneId, state, error),
    });
    static DEFAULT_OPTIONS = {
        id: 'lumenn-storyboard',
        classes: ['lumenn-frame', 'graph-editor', 'app', 'window-app'],
        tag: 'div',
        position: {
            width: 1440,
            height: 900,
        },
        // ApplicationV2 lê `window.title`; o `title` na raiz (formato v1) deixava o h1 vazio.
        window: {
            title: 'LUMENN_FRAME.Title',
            icon: 'fa-solid fa-film',
            resizable: true,
        },
        dragDrop: [
            {
                dropSelector: '.lf-viewport',
            },
        ],
    };
    static PARTS = {
        main: {
            template: 'modules/lumenn-frame/templates/storyboard.hbs',
        },
    };
    constructor(options = {}) {
        super(options);
        this.#dragDrop = this.#createDragDropHandlers();
        this.#camera.zoom = clampGraphZoom(LumennSettings.getCameraDefaults().zoom);
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                if (this.#browserOpen) {
                    this.#browserOpen = false;
                    this.render();
                    return;
                }
                if (this.#previewing) {
                    canvas.transition?.cancel?.();
                    e.preventDefault();
                    return;
                }
                if (this.#connectState) {
                    const armed = this.#connectState.armed === true;
                    this.#connectState = null;
                    this.#updateGhost();
                    if (armed) this.render();
                }
                if (this.#selected.kind) {
                    this.#selected = {
                        kind: null,
                        id: null,
                    };
                    this.render();
                }
            }
            if (e.code === 'Space') {
                const t = e.target;
                if (t && (t.matches?.('input, textarea, select') || t.isContentEditable)) return;
                if (!this.#spaceDown) {
                    this.#spaceDown = true;
                    this.element?.classList.add('space-hold');
                }
                e.preventDefault();
            }
        });
        document.addEventListener('keyup', (e) => {
            if (e.code === 'Space') {
                this.#spaceDown = false;
                this.element?.classList.remove('space-hold');
            }
        });
    }
    #editable() {
        return this.#mode === 'edit' && LumennCompat.isGM();
    }
    /** Storyboard exibido; dentro de uma Hive no Ao Vivo, o nó ativo vem da trilha, nunca da Hive. */
    #graph() {
        return this.#overlay(LumennGraphStore.getGraph(this.#graphId));
    }
    #hiveLevel(graphId = this.#graphId) {
        if (this.#mode !== 'live' || this.#trail.length < 2) return null;
        const last = this.#trail.at(-1);
        return last.graphId === graphId ? last : null;
    }
    #overlay(graph) {
        const level = graph ? this.#hiveLevel(graph.id) : null;
        return level
            ? {
                  ...graph,
                  activeNodeId: level.activeNodeId,
              }
            : graph;
    }
    #resetTrail() {
        this.#trail = [];
    }
    /** Garante uma trilha coerente com o storyboard exibido (Ao Vivo). */
    #syncTrail() {
        const ids = this.#trail.map((level) => level.graphId);
        if (!this.#trail.length || !ids.includes(this.#graphId)) {
            const root = LumennGraphStore.getGraph(this.#graphId);
            let trail = createNavigationTrail(this.#graphId, root?.activeNodeId ?? null);
            if (root)
                for (const level of LumennGraphStore.getLiveTrail(root.id)) {
                    if (!LumennGraphStore.getGraph(level.graphId)?.isHive) {
                        ui.notifications.warn(game.i18n.localize('LUMENN_FRAME.Warn.HiveGone'));
                        break;
                    }
                    trail = pushNavigationLevel(trail, level);
                }
            this.#trail = trail;
        }
        const valid = [this.#trail[0]];
        for (const level of this.#trail.slice(1)) {
            if (!LumennGraphStore.getGraph(level.graphId)?.isHive) break;
            valid.push(level);
        }
        if (valid.length !== this.#trail.length) {
            ui.notifications.warn(game.i18n.localize('LUMENN_FRAME.Warn.HiveGone'));
            this.#trail = valid;
            this.#saveTrail();
        }
        const last = this.#trail.at(-1);
        if (last && last.graphId !== this.#graphId) {
            this.#graphId = last.graphId;
            this.#fitPending = true;
        }
    }
    async #saveTrail() {
        if (!LumennCompat.isGM() || !this.#trail.length) return;
        await LumennGraphStore.setLiveTrail(this.#trail[0].graphId, this.#trail.slice(1));
    }
    #canEditLiveAudio() {
        if (this.#mode !== 'live' || !LumennCompat.isGM()) return false;
        if (this.#selected.kind !== 'edge') return false;
        const edge = LumennGraphStore.getEdge(this.#graphId, this.#selected.id);
        return edge?.type === 'flow' || edge?.type === 'audio';
    }
    #canEditInspectorPath(path) {
        if (typeof path !== 'string' || !path) return false;
        if (this.#editable()) return true;
        return (
            this.#canEditLiveAudio() &&
            (path === 'transition.scope' || path.startsWith('transition.audio.'))
        );
    }
    #createDragDropHandlers() {
        return this.options.dragDrop.map((d) => {
            d.permissions = {
                drop: () => this.#editable(),
            };
            d.callbacks = {
                dragover: this.#onDragOver.bind(this),
                dragleave: this.#onDragLeave.bind(this),
                drop: this.#onDrop.bind(this),
            };
            return new DragDrop(d);
        });
    }
    #onDragOver(e) {
        e.preventDefault();
        this.element.querySelector('.lf-viewport')?.classList.add('drag-over');
    }
    #onDragLeave() {
        this.element.querySelector('.lf-viewport')?.classList.remove('drag-over');
    }
    async #onDrop(event) {
        event.preventDefault();
        this.element.querySelector('.lf-viewport')?.classList.remove('drag-over');
        if (!this.#editable()) return;
        const hiveId = event.dataTransfer?.getData('application/x-lumenn-hive');
        if (hiveId)
            return this.#insertHive(
                hiveId,
                this.#clientToCanvas(event, this.element.querySelector('.lf-viewport'))
            );
        const data = LumennCompat.getDragData(event);
        const doc = await LumennCompat.resolveUuid(data?.uuid);
        if (!doc) return;
        const viewport = this.element.querySelector('.lf-viewport');
        const point = this.#clientToCanvas(event, viewport);
        const dropNode = event.target?.closest?.('.lf-node');
        if (dropNode?.dataset?.id) return this.#attachDrop(dropNode.dataset.id, doc);
        const items = this.#resolveDropItems(doc);
        if (!items.length) return;
        const graph = this.#graph();
        const imp = LumennSettings.getImportDefaults();
        const created = [];
        for (let i = 0; i < items.length; i++) {
            const item = items[i];
            const [w, h] = nodeSize(item.type, 'normal');
            const col = i % imp.columns;
            const row = Math.floor(i / imp.columns);
            const node = {
                id: `node_${foundry.utils.randomID(16)}`,
                type: item.type,
                position: {
                    x: Math.round(point.x + col * (w + imp.gap)),
                    y: Math.round(point.y + row * (h + imp.gap)),
                },
                data: {
                    ...(item.data ?? {}),
                },
            };
            const createdNode = await LumennGraphStore.addNode(this.#graphId, node);
            if (createdNode) created.push(createdNode);
        }
        if (created.length && !graph?.activeNodeId)
            await LumennGraphStore.setActiveNode(this.#graphId, created[0].id);
        if (imp.autoConnect) {
            const scenes = created.filter((n) => n.type === 'scene');
            for (let i = 0; i < scenes.length - 1; i++) {
                await LumennGraphStore.addEdge(this.#graphId, {
                    id: `edge_${foundry.utils.randomID(16)}`,
                    type: 'flow',
                    from: scenes[i].id,
                    to: scenes[i + 1].id,
                });
            }
        }
        this.#selected = {
            kind: 'node',
            id: created[0]?.id ?? null,
        };
        this.render();
    }
    #attachDrop(nodeId, doc) {
        const node = LumennGraphStore.getNode(this.#graphId, nodeId);
        if (!node) return;
        if (node.type === 'group' || node.type === 'hive-ref' || node.type === 'encounter') {
            ui.notifications.warn(game.i18n.localize('LUMENN_FRAME.Group.DropUnsupported'));
            return;
        }
        if (node.type === 'scene' && doc.documentName === 'Scene') {
            LumennGraphStore.updateNode(this.#graphId, nodeId, {
                data: {
                    ...node.data,
                    sceneId: doc.id,
                },
            }).then(() => this.render());
        } else if (
            node.type === 'scene' &&
            ['Playlist', 'PlaylistSound'].includes(doc.documentName)
        ) {
            const [w] = nodeSize('audio', 'normal');
            LumennGraphStore.addNode(this.#graphId, {
                id: `node_${foundry.utils.randomID(16)}`,
                type: 'audio',
                position: {
                    x: node.position.x + w + 40,
                    y: node.position.y,
                },
                data: {
                    audioRole: 'music',
                    audioType: doc.documentName === 'Playlist' ? 'playlist' : 'track',
                    audioId: doc.documentName === 'Playlist' ? doc.id : doc.uuid,
                    volume: 0.75,
                    loop: true,
                    fadeIn: null,
                    fadeOut: null,
                },
            })
                .then(
                    (audioNode) =>
                        audioNode &&
                        LumennGraphStore.addEdge(this.#graphId, {
                            id: `edge_${foundry.utils.randomID(16)}`,
                            type: 'audio',
                            from: audioNode.id,
                            to: nodeId,
                        })
                )
                .then(() => this.render());
        }
    }
    #resolveDropItems(doc) {
        const imp = LumennSettings.getImportDefaults();
        const items = [];
        const audioDefaults = {
            audioRole: 'music',
            volume: 0.75,
            loop: true,
            fadeIn: null,
            fadeOut: null,
        };
        const push = (d, rootFolder) => {
            const folder = d.folder ?? rootFolder;
            const meta = {
                sourceFolderId: folder?.id ?? null,
                sourceFolderPath: folder?.path ?? null,
            };
            if (d.documentName === 'Scene') {
                items.push({
                    type: 'scene',
                    data: {
                        sceneId: d.id,
                        ...meta,
                    },
                });
            } else if (d.documentName === 'Playlist') {
                if (imp.tracksAsNodes) {
                    for (const s of d.sounds ?? []) {
                        items.push({
                            type: 'audio',
                            data: {
                                audioType: 'track',
                                audioId: s.uuid,
                                ...audioDefaults,
                                ...meta,
                            },
                        });
                    }
                } else {
                    items.push({
                        type: 'audio',
                        data: {
                            audioType: 'playlist',
                            audioId: d.id,
                            ...audioDefaults,
                            ...meta,
                        },
                    });
                }
            } else if (d.documentName === 'PlaylistSound') {
                items.push({
                    type: 'audio',
                    data: {
                        audioType: 'track',
                        audioId: d.uuid,
                        ...audioDefaults,
                        ...meta,
                    },
                });
            }
        };
        if (doc.documentName === 'Folder') {
            const list =
                imp.recursive && typeof doc.getSubfolders === 'function'
                    ? LumennCompat.collectFolderDocuments(doc)
                    : [...doc.contents];
            for (const d of list) push(d, doc);
        } else {
            push(doc, null);
        }
        return items;
    }
    #clientToScreen(event, viewport) {
        const r = viewport?.getBoundingClientRect() ?? {
            left: 0,
            top: 0,
        };
        return {
            x: event.clientX - r.left,
            y: event.clientY - r.top,
        };
    }
    #clientToCanvas(event, viewport) {
        return this.#screenToWorld(this.#clientToScreen(event, viewport));
    }
    #screenToWorld(s) {
        return {
            x: (s.x - this.#camera.panX) / this.#camera.zoom,
            y: (s.y - this.#camera.panY) / this.#camera.zoom,
        };
    }
    #worldToScreen(w) {
        return {
            x: w.x * this.#camera.zoom + this.#camera.panX,
            y: w.y * this.#camera.zoom + this.#camera.panY,
        };
    }
    #applyCamera(root = this.element) {
        const camEl = root.querySelector('.lf-camera');
        if (camEl) {
            camEl.style.transform = `translate3d(${this.#camera.panX}px, ${this.#camera.panY}px, 0) scale(${this.#camera.zoom})`;
            const zoom = String(this.#camera.zoom);
            if (camEl.dataset.lfZoom !== zoom) {
                camEl.dataset.lfZoom = zoom;
                camEl.style.setProperty('--lf-inv-zoom', String(1 / this.#camera.zoom));
            }
        }
        const pct = root.querySelector('[data-camera-percent]');
        if (pct) pct.textContent = `${Math.round(this.#camera.zoom * 100)}%`;
    }
    #zoomAt(screenPoint, zoom) {
        const cam = this.#camera;
        const w = this.#screenToWorld(screenPoint);
        zoom = clampGraphZoom(zoom);
        cam.panX = screenPoint.x - w.x * zoom;
        cam.panY = screenPoint.y - w.y * zoom;
        cam.zoom = zoom;
        this.#applyCamera();
    }
    #fitAll(root) {
        const viewport = root.querySelector('.lf-viewport');
        if (!viewport) return;
        const graph = this.#graph();
        const nodes = graph?.nodes ?? [];
        if (!nodes.length) {
            this.#camera.panX = 0;
            this.#camera.panY = 0;
            this.#camera.zoom = 1;
            return this.#applyCamera(root);
        }
        const PAD = 60;
        let minX = Infinity,
            minY = Infinity,
            maxX = -Infinity,
            maxY = -Infinity;
        for (const n of nodes) {
            const bounds = this.#nodeBounds(n.id, null, graph);
            if (!bounds) continue;
            minX = Math.min(minX, bounds.x);
            minY = Math.min(minY, bounds.y);
            maxX = Math.max(maxX, bounds.x + bounds.width);
            maxY = Math.max(maxY, bounds.y + bounds.height);
        }
        const contentW = Math.max(1, maxX - minX);
        const contentH = Math.max(1, maxY - minY);
        const availW = Math.max(1, viewport.clientWidth - PAD * 2);
        const availH = Math.max(1, viewport.clientHeight - PAD * 2);
        let zoom = Math.min(availW / contentW, availH / contentH);
        zoom = clampGraphZoom(zoom);
        this.#camera.zoom = zoom;
        this.#camera.panX = viewport.clientWidth / 2 - ((minX + maxX) / 2) * zoom;
        this.#camera.panY = viewport.clientHeight / 2 - ((minY + maxY) / 2) * zoom;
        this.#applyCamera(root);
    }
    #toggleWorkspace(root) {
        if (this.#expanded) {
            if (this.#prevPosition) this.setPosition(this.#prevPosition);
            this.#expanded = false;
        } else {
            this.#prevPosition = LumennCompat.expandWorkspace(this);
            this.#expanded = true;
        }
        const btn = root.querySelector("[data-action='workspace-toggle']");
        if (btn)
            btn.textContent = this.#expanded
                ? game.i18n.localize('LUMENN_FRAME.Workspace.Restore')
                : game.i18n.localize('LUMENN_FRAME.Workspace.Expand');
    }
    async _prepareContext() {
        if (LumennCompat.isGM() && !LumennGraphStore.getAll().length) {
            await LumennGraphStore.createGraph();
        }
        const graphs = LumennGraphStore.getAll();
        let activeGraph = graphs.find((g) => g.id === this.#graphId) ?? graphs[0] ?? null;
        if (activeGraph) this.#graphId = activeGraph.id;
        if (this.#mode === 'live' && activeGraph) {
            this.#syncTrail();
            activeGraph = graphs.find((g) => g.id === this.#graphId) ?? activeGraph;
        }
        activeGraph = this.#overlay(activeGraph);
        const L = (k) => game.i18n.localize(k);
        const navigable = this.#navigableSet(activeGraph);
        const rootId = activeGraph ? LumennGraphStore.rootGraphId(activeGraph.id, graphs) : null;
        const anchors = rootId
            ? (graphs.find((graph) => graph.id === rootId)?.anchors ?? null)
            : null;
        const defaultColors = LumennGraphStore.getDefaultColors();
        const allNodes = activeGraph?.nodes ?? [];
        const collapsed = this.#collapsedSet(activeGraph);
        const visible = allNodes.filter((n) => !(n.parentId && collapsed.has(n.parentId)));
        visible.sort((a, b) => (a.type === 'group' ? 0 : 1) - (b.type === 'group' ? 0 : 1));
        const nodes = visible.map((n) => {
            const kids = n.type === 'group' ? childrenOf(allNodes, n.id) : [];
            const bounds =
                n.type === 'group' ? groupBounds(allNodes, n.id, nodeSize, GROUP_PADDING) : null;
            const [w, h] = bounds ? [bounds.width, bounds.height] : nodeSize(n.type, n.size);
            const position = bounds
                ? {
                      x: bounds.x,
                      y: bounds.y,
                  }
                : n.position;
            const audioSource =
                n.type === 'encounter'
                    ? (this.#audioSourcesFor(activeGraph, n.id)[0] ?? null)
                    : this.#audioSourceOf(n);
            const encounterHere =
                n.type !== 'encounter' ||
                !n.data?.sceneNodeId ||
                n.data.sceneNodeId === activeGraph.activeNodeId;
            const playable =
                n.type !== 'group' &&
                this.#mode === 'live' &&
                LumennCompat.isGM() &&
                !!audioSource &&
                encounterHere;
            const groupActive = kids.some((k) => k.id === activeGraph.activeNodeId);
            const groupNavigable = kids.some((k) => navigable.has(k.id));
            const isHere = n.type === 'group' ? groupActive : n.id === activeGraph.activeNodeId;
            // Uma função decide o que o clique faz; clique, escurecimento e dica leem dela.
            const click = nodeClickIntent({
                mode: this.#mode,
                isGM: LumennCompat.isGM(),
                tool: this.#tool,
                nodeType: n.type,
                isActive: isHere,
                isLinked: n.type === 'group' ? groupNavigable : navigable.has(n.id),
                isPlayable: playable,
            });
            const out = {
                ...n,
                clickIntent: click.intent,
                hint: L(intentHintKey(click)),
                position,
                color: normalizeHexColor(n.color, defaultColors[n.type] ?? '#73707c'),
                width: w,
                height: h,
                isActive: n.type === 'group' ? groupActive : n.id === activeGraph.activeNodeId,
                isNavigable:
                    n.type === 'group'
                        ? this.#mode === 'live' && groupNavigable
                        : this.#mode === 'live' && navigable.has(n.id),
                isPlayable: playable,
                isPlaying: n.type !== 'group' && !!audioSource && this.#isAudioPlaying(audioSource),
                // Só escurece o que o clique realmente bloqueia (nunca o GM, que salta para qualquer nó).
                isDimmed:
                    this.#mode === 'live' &&
                    isNodeDimmed(click.intent, {
                        isActive: isHere,
                        enabled: LumennSettings.get('dimUnreachable'),
                    }),
                selected: this.#selected.kind === 'node' && this.#selected.id === n.id,
                targetHi: this.#connectState?.targetHi === n.id,
                armed: this.#connectState?.armed === true && this.#connectState.nodeId === n.id,
                anchorIntro: !!anchors?.intro && anchors.intro === n.id,
                anchorOutput: !!anchors?.output && anchors.output === n.id,
            };
            if (n.type === 'group') {
                out.groupLabel = n.data?.title || L('LUMENN_FRAME.Group.DefaultName');
                out.groupCount = kids.length;
                out.groupOpen = !collapsed.has(n.id);
                out.groupLocked = this.#lockedGroups.has(n.id);
            } else if (n.type === 'scene') {
                const scene = n.data?.sceneId ? game.scenes.get(n.data.sceneId) : null;
                out.sceneName =
                    scene?.name ??
                    (n.data?.sceneId
                        ? L('LUMENN_FRAME.Beat.InvalidScene')
                        : L('LUMENN_FRAME.Beat.NoScene'));
                out.sceneThumb = scene?.thumbnail || LumennCompat.sceneBackgroundSrc(scene) || null;
            } else if (n.type === 'audio') {
                const label = this.#audioLabel(n.data);
                out.audioLabel = label.name;
                out.audioBadge = label.badge;
                out.audioRole = n.data?.audioRole === 'sfx' ? 'sfx' : 'music';
                out.audioRoleLabel =
                    out.audioRole === 'sfx'
                        ? L('LUMENN_FRAME.AudioRole.Sfx')
                        : L('LUMENN_FRAME.AudioRole.Music');
            } else if (n.type === 'hive-ref') {
                const hive = LumennGraphStore.getGraph(n.data?.graphId);
                const rooms = (hive?.nodes ?? []).filter((room) => room.type === 'scene');
                const cover = rooms
                    .map((room) => (room.data?.sceneId ? game.scenes.get(room.data.sceneId) : null))
                    .find(Boolean);
                out.hiveName = hive?.isHive ? hive.name : L('LUMENN_FRAME.Hive.Missing');
                out.hiveMissing = !hive?.isHive;
                out.hiveRooms = rooms.length;
                out.hiveThumb = cover?.thumbnail || LumennCompat.sceneBackgroundSrc(cover) || null;
                out.hivePortName =
                    (hive ? hiveEntryPort(hive, n.data?.portId)?.name : '') ||
                    L('LUMENN_FRAME.Hive.AutoPort');
                const hub = hive?.isHive ? portHubView(hive, activeGraph?.edges, n.id) : null;
                const named = (port) => ({
                    ...port,
                    name: port.name || L('LUMENN_FRAME.Hive.PortDefaultName'),
                    title: `${port.name || L('LUMENN_FRAME.Hive.PortDefaultName')} - ${port.links}`,
                });
                out.portHub = hub
                    ? {
                          entries: hub.entries.map(named),
                          exits: hub.exits.map(named),
                          orphanCount: orphanExitEdges(hive, activeGraph?.edges, n.id).length,
                      }
                    : null;
                out.portHubPopover = LumennSettings.get('portHubStyle') === 'popover';
            } else if (n.type === 'encounter') {
                const kind = ['combat', 'event', 'npc'].includes(n.data?.encounterType)
                    ? n.data.encounterType
                    : 'event';
                out.encTitle = n.data?.title || L('LUMENN_FRAME.Encounter.Default');
                out.encTypeLabel = L(`LUMENN_FRAME.Encounter.${kind}`);
            }
            return out;
        });
        const hiveLevel = this.#hiveLevel(activeGraph?.id);
        const trail = hiveLevel
            ? {
                  crumbs: this.#trail.map((level) => ({
                      name: LumennGraphStore.getGraph(level.graphId)?.name ?? '?',
                  })),
                  canExit: LumennCompat.isGM(),
                  exitPorts: hiveExitPortsAt(activeGraph, activeGraph.activeNodeId).map((port) => ({
                      id: port.id,
                      name: port.name || L('LUMENN_FRAME.Hive.PortDefaultName'),
                  })),
              }
            : null;
        const editTrail =
            this.#mode === 'edit' && this.#editStack.length
                ? {
                      crumbs: [...this.#editStack, activeGraph?.id].map((id) => ({
                          id,
                          name: LumennGraphStore.getGraph(id)?.name ?? '?',
                      })),
                      back: LumennGraphStore.getGraph(this.#editStack.at(-1))?.name ?? '',
                  }
                : null;
        const library = LumennGraphStore.getHives()
            .filter((h) => h.id !== activeGraph?.id)
            .map((h) => ({
                id: h.id,
                name: h.name,
                rooms: (h.nodes ?? []).filter((n) => n.type === 'scene').length,
            }));
        const inspector = this.#buildInspector(activeGraph);
        const neural = this.#neuralView(activeGraph);
        let connectHint = null;
        if (this.#editable() && this.#connectState) {
            connectHint = this.#connectState.port.startsWith('flow')
                ? L('LUMENN_FRAME.Connect.HintFlowDrag')
                : L('LUMENN_FRAME.Connect.HintAudioDrag');
        } else if (this.#editable() && this.#tool === 'connect') {
            connectHint = L('LUMENN_FRAME.Connect.HintIdle');
        }
        return {
            graphs: graphs.map((g) => ({
                id: g.id,
                name: g.name,
                isHive: g.isHive === true,
            })),
            activeGraph,
            isHiveGraph: activeGraph?.isHive === true,
            browser: this.#browserView(graphs, activeGraph?.id),
            canBack: this.#history.length > 0,
            canForward: this.#future.length > 0,
            trail,
            editTrail,
            neural,
            library,
            nodes,
            edgeCount: activeGraph?.edges?.length ?? 0,
            mode: this.#mode,
            tool: this.#tool,
            isGM: LumennCompat.isGM(),
            editable: this.#editable(),
            liveAudioEditing: this.#canEditLiveAudio(),
            selectedKind: this.#selected.kind,
            connecting: !!this.#connectState,
            showConnectHint: !!connectHint,
            connectHint,
            transitioning: this.#transitioning,
            showEdgeLabels: LumennSettings.get('showTransitionLabels'),
            inspector,
            navigableIds: [...navigable],
            label: {
                editMode: L('LUMENN_FRAME.Toolbar.EditMode'),
                liveMode: L('LUMENN_FRAME.Toolbar.LiveMode'),
                guide: L('LUMENN_FRAME.Toolbar.Guide'),
                expand: L('LUMENN_FRAME.Workspace.Expand'),
                restore: L('LUMENN_FRAME.Workspace.Restore'),
                emptyState: L('LUMENN_FRAME.EmptyState'),
                emptyHint: L('LUMENN_FRAME.EmptyHint'),
                dropHint: L('LUMENN_FRAME.DropHint'),
                select: L('LUMENN_FRAME.Tool.Select'),
                hand: L('LUMENN_FRAME.Tool.Hand'),
                connect: L('LUMENN_FRAME.Tool.Connect'),
                addScene: L('LUMENN_FRAME.Tool.AddScene'),
                addAudio: L('LUMENN_FRAME.Tool.AddAudio'),
                addNote: L('LUMENN_FRAME.Tool.AddNote'),
                addGroup: L('LUMENN_FRAME.Tool.AddGroup'),
                addHive: L('LUMENN_FRAME.Tool.AddHive'),
                addHiveHint: L('LUMENN_FRAME.Tool.AddHiveHint'),
                fit: L('LUMENN_FRAME.Tool.Fit'),
                addEncounter: L('LUMENN_FRAME.Tool.AddEncounter'),
                curve: L('LUMENN_FRAME.Inspector.Curve'),
                preview: L('LUMENN_FRAME.Inspector.Preview'),
                v14Native: L('LUMENN_FRAME.Inspector.Native'),
                fallbackMode: L('LUMENN_FRAME.Inspector.FallbackMode'),
                hiveBadge: L('LUMENN_FRAME.Hive.Badge'),
                hiveSection: L('LUMENN_FRAME.Hive.Section'),
                hiveMark: L('LUMENN_FRAME.Hive.Mark'),
                hiveUnmark: L('LUMENN_FRAME.Hive.Unmark'),
                hiveIntro: L('LUMENN_FRAME.Hive.Intro'),
                hivePorts: L('LUMENN_FRAME.Hive.Ports'),
                hivePortAdd: L('LUMENN_FRAME.Hive.PortAdd'),
                hivePortRemove: L('LUMENN_FRAME.Hive.PortRemove'),
                hivePortName: L('LUMENN_FRAME.Hive.PortName'),
                hivePortEntry: L('LUMENN_FRAME.Hive.PortEntry'),
                hivePortExit: L('LUMENN_FRAME.Hive.PortExit'),
                hivePortNoRoom: L('LUMENN_FRAME.Hive.PortNoRoom'),
                hiveTransition: L('LUMENN_FRAME.Hive.Transition'),
                hiveTransitionUse: L('LUMENN_FRAME.Hive.TransitionUse'),
                hiveTransitionAudio: L('LUMENN_FRAME.Hive.TransitionAudio'),
                hiveLibrary: L('LUMENN_FRAME.Hive.Library'),
                hiveLibraryEmpty: L('LUMENN_FRAME.Hive.LibraryEmpty'),
                hiveInsert: L('LUMENN_FRAME.Hive.Insert'),
                hiveOpen: L('LUMENN_FRAME.Hive.Open'),
                hiveExport: L('LUMENN_FRAME.Hive.Export'),
                hiveImport: L('LUMENN_FRAME.Hive.Import'),
                hivePending: L('LUMENN_FRAME.Hive.Pending'),
                hivePendingHint: L('LUMENN_FRAME.Hive.PendingHint'),
                hiveRelink: L('LUMENN_FRAME.Hive.Relink'),
                hiveUsedIn: L('LUMENN_FRAME.Hive.UsedIn'),
                hiveTarget: L('LUMENN_FRAME.Hive.Target'),
                hiveEntryPort: L('LUMENN_FRAME.Hive.EntryPort'),
                hiveRooms: L('LUMENN_FRAME.Hive.Rooms'),
                hiveNoneSelected: L('LUMENN_FRAME.Hive.NoneSelected'),
                hiveExitHint: L('LUMENN_FRAME.Hive.ExitHint'),
                hiveExitPort: L('LUMENN_FRAME.Hive.ExitPort'),
                hiveExitPortNone: L('LUMENN_FRAME.Hive.ExitPortNone'),
                hiveExitPortOrphan: L('LUMENN_FRAME.Hive.ExitPortOrphan'),
                hivePortOrphan: L('LUMENN_FRAME.Hive.PortOrphan'),
                trailLabel: L('LUMENN_FRAME.Trail.Label'),
                trailExit: L('LUMENN_FRAME.Trail.Exit'),
                trailExitVia: L('LUMENN_FRAME.Trail.ExitVia'),
                encType: L('LUMENN_FRAME.Encounter.Type'),
                encRoom: L('LUMENN_FRAME.Encounter.Room'),
                encAnyRoom: L('LUMENN_FRAME.Encounter.AnyRoom'),
                groupToHive: L('LUMENN_FRAME.Group.ToHive'),
                groupToHiveHint: L('LUMENN_FRAME.Group.ToHiveHint'),
                hiveEnter: L('LUMENN_FRAME.Hive.Enter'),
                editBack: L('LUMENN_FRAME.Hive.EditBack'),
                hiveEntryStyle: L('LUMENN_FRAME.Hive.EntryStyle'),
                hiveExitTransition: L('LUMENN_FRAME.Hive.ExitTransition'),
                hiveStyleScene: L('LUMENN_FRAME.Hive.StyleScene'),
                hiveStyleCutscene: L('LUMENN_FRAME.Hive.StyleCutscene'),
                hiveCaption: L('LUMENN_FRAME.Hive.Caption'),
                neuralIntro: L('LUMENN_FRAME.Neural.Intro'),
                neuralOutput: L('LUMENN_FRAME.Neural.Output'),
                neuralDestinations: L('LUMENN_FRAME.Neural.Destinations'),
                neuralIntroHint: L('LUMENN_FRAME.Neural.IntroHint'),
                neuralOutputHint: L('LUMENN_FRAME.Neural.OutputHint'),
                neuralDestinationsHint: L('LUMENN_FRAME.Neural.DestinationsHint'),
                legend: L('LUMENN_FRAME.Legend.Title'),
                filmMusic: L('LUMENN_FRAME.Film.MusicLabel'),
                filmVideoFile: L('LUMENN_FRAME.Film.VideoFile'),
                filmCutAt: L('LUMENN_FRAME.Film.CutAt'),
                filmVideoSound: L('LUMENN_FRAME.Film.VideoSound'),
                filmVideoHint: L('LUMENN_FRAME.Film.VideoHint'),
                filmPlayersOnly: L('LUMENN_FRAME.Film.PlayersOnly'),
                browse: L('LUMENN_FRAME.Browser.Open'),
                browserTitle: L('LUMENN_FRAME.Browser.Title'),
                browserAll: L('LUMENN_FRAME.Browser.All'),
                browserStoryboards: L('LUMENN_FRAME.Browser.Storyboards'),
                browserHives: L('LUMENN_FRAME.Browser.Hives'),
                browserCurrent: L('LUMENN_FRAME.Browser.Current'),
                browserScenes: L('LUMENN_FRAME.Browser.Scenes'),
                historyBack: L('LUMENN_FRAME.Browser.Back'),
                historyForward: L('LUMENN_FRAME.Browser.Forward'),
                encHint: L('LUMENN_FRAME.Encounter.Hint'),
                graph: L('LUMENN_FRAME.Inspector.Graph'),
                scene: L('LUMENN_FRAME.Inspector.Scene'),
                audio: L('LUMENN_FRAME.Inspector.Audio'),
                audioNodes: L('LUMENN_FRAME.Inspector.AudioNodes'),
                focusNode: L('LUMENN_FRAME.Inspector.FocusNode'),
                audioRole: L('LUMENN_FRAME.AudioRole.Label'),
                musicRole: L('LUMENN_FRAME.AudioRole.Music'),
                sfxRole: L('LUMENN_FRAME.AudioRole.Sfx'),
                activeState: L('LUMENN_FRAME.Legend.Active'),
                navigableState: L('LUMENN_FRAME.Legend.Navigable'),
                selectedState: L('LUMENN_FRAME.Legend.Selected'),
                targetState: L('LUMENN_FRAME.Legend.Target'),
                note: L('LUMENN_FRAME.Inspector.Note'),
                group: L('LUMENN_FRAME.Inspector.Group'),
                groupRooms: L('LUMENN_FRAME.Group.Rooms'),
                groupCreate: L('LUMENN_FRAME.Inspector.GroupCreate'),
                groupAdd: L('LUMENN_FRAME.Inspector.GroupAdd'),
                groupRemove: L('LUMENN_FRAME.Inspector.GroupRemove'),
                groupApplyRooms: L('LUMENN_FRAME.Inspector.GroupApplyRooms'),
                groupUngroup: L('LUMENN_FRAME.Inspector.GroupUngroup'),
                groupLock: L('LUMENN_FRAME.Group.Lock'),
                groupUnlock: L('LUMENN_FRAME.Group.Unlock'),
                groupToggle: L('LUMENN_FRAME.Group.Toggle'),
                flowEdge: L('LUMENN_FRAME.Inspector.FlowEdge'),
                audioEdge: L('LUMENN_FRAME.Inspector.AudioEdge'),
                audioRoutingNote: L('LUMENN_FRAME.Inspector.AudioRoutingNote'),
                none: L('LUMENN_FRAME.Config.None'),
                save: L('LUMENN_FRAME.Config.Save'),
                delete: L('LUMENN_FRAME.Beat.Delete'),
                setInitial: L('LUMENN_FRAME.Beat.SetStart'),
                addReturn: L('LUMENN_FRAME.Edge.AddReturn'),
                bothWays: L('LUMENN_FRAME.Edge.BothWays'),
                titleText: L('LUMENN_FRAME.Film.TitleText'),
                titleAuto: L('LUMENN_FRAME.Film.TitleAuto'),
                titleSub: L('LUMENN_FRAME.Film.TitleSub'),
                titleFont: L('LUMENN_FRAME.Film.TitleFont'),
                titleDefault: L('LUMENN_FRAME.Film.TitleDefault'),
                titleSize: L('LUMENN_FRAME.Film.TitleSize'),
                titleColor: L('LUMENN_FRAME.Film.TitleColor'),
                stingerReady: L('LUMENN_FRAME.Stinger.Ready'),
                filmCutAuto: L('LUMENN_FRAME.Stinger.CutAuto'),
                bidirectional: L('LUMENN_FRAME.Edge.Bidirectional'),
                color: L('LUMENN_FRAME.Inspector.Color'),
                size: L('LUMENN_FRAME.Inspector.Size'),
                notes: L('LUMENN_FRAME.Inspector.Notes'),
                name: L('LUMENN_FRAME.Inspector.Name'),
                sceneTrans: L('LUMENN_FRAME.Inspector.SceneTransition'),
                audioTrans: L('LUMENN_FRAME.Inspector.AudioTransition'),
                cut: L('LUMENN_FRAME.Edge.Cut'),
                fade: L('LUMENN_FRAME.Edge.Fade'),
                duration: L('LUMENN_FRAME.Inspector.Duration'),
                audioMode: L('LUMENN_FRAME.Inspector.AudioMode'),
                auto: L('LUMENN_FRAME.Edge.Auto'),
                keep: L('LUMENN_FRAME.Edge.Keep'),
                crossfade: L('LUMENN_FRAME.Edge.Crossfade'),
                fadeout: L('LUMENN_FRAME.Edge.FadeOut'),
                fadein: L('LUMENN_FRAME.Edge.FadeIn'),
                crossfadeDur: L('LUMENN_FRAME.Inspector.CrossfadeDur'),
                volume: L('LUMENN_FRAME.Inspector.Volume'),
                loop: L('LUMENN_FRAME.Inspector.Loop'),
                title: L('LUMENN_FRAME.Inspector.Title'),
                body: L('LUMENN_FRAME.Inspector.Body'),
                source: L('LUMENN_FRAME.Inspector.Source'),
                sceneDoc: L('LUMENN_FRAME.Config.Scene'),
                createGraph: L('LUMENN_FRAME.Toolbar.CreateStoryboard'),
                renameGraph: L('LUMENN_FRAME.Toolbar.RenameStoryboard'),
                deleteGraph: L('LUMENN_FRAME.Toolbar.DeleteStoryboard'),
                sortGraphs: L('LUMENN_FRAME.Toolbar.SortStoryboards'),
                liveAudioEditing: L('LUMENN_FRAME.Inspector.LiveAudioEditing'),
                transition: L('LUMENN_FRAME.Transitioning'),
                from: L('LUMENN_FRAME.Edge.From'),
                to: L('LUMENN_FRAME.Edge.To'),
                fadeIn: L('LUMENN_FRAME.Inspector.FadeIn'),
                fadeOut: L('LUMENN_FRAME.Inspector.FadeOut'),
                connections: L('LUMENN_FRAME.Inspector.Connections'),
                whereAmI: L('LUMENN_FRAME.Neural.WhereAmI'),
                cellScenes: L('LUMENN_FRAME.Neural.CellScenes'),
                cellAudio: L('LUMENN_FRAME.Neural.CellAudio'),
                cellHives: L('LUMENN_FRAME.Neural.CellHives'),
                synapses: L('LUMENN_FRAME.Neural.Synapses'),
                membranes: L('LUMENN_FRAME.Neural.Membranes'),
                neuralOutgoing: L('LUMENN_FRAME.Neural.Outgoing'),
                trailGoto: L('LUMENN_FRAME.Neural.TrailGoto'),
                visitable: L('LUMENN_FRAME.Inspector.Visitable'),
                visitableHint: L('LUMENN_FRAME.Inspector.VisitableHint'),
                outgoing: L('LUMENN_FRAME.Inspector.Outgoing'),
                incoming: L('LUMENN_FRAME.Inspector.Incoming'),
                addDestination: L('LUMENN_FRAME.Inspector.AddDestination'),
                attachAudio: L('LUMENN_FRAME.Inspector.AttachAudio'),
                noScenes: L('LUMENN_FRAME.Inspector.NoScenes'),
                noAudioNodes: L('LUMENN_FRAME.Inspector.NoAudioNodes'),
                editTransition: L('LUMENN_FRAME.Edge.EditTransition'),
                transitionScope: L('LUMENN_FRAME.Inspector.TransitionScope'),
                audioOnly: L('LUMENN_FRAME.Inspector.AudioOnly'),
                sceneOnly: L('LUMENN_FRAME.Inspector.SceneOnly'),
                beatBoth: L('LUMENN_FRAME.Inspector.BeatBoth'),
            },
        };
    }
    #audioLabel(src) {
        if (!src?.audioType)
            return {
                name: game.i18n.localize('LUMENN_FRAME.Beat.NoAudio'),
                badge: '',
            };
        if (src.audioType === 'playlist') {
            const p = game.playlists.get(src.audioId);
            return {
                name: p?.name ?? game.i18n.localize('LUMENN_FRAME.Beat.InvalidAudio'),
                badge: 'PLAYLIST',
            };
        }
        for (const p of game.playlists ?? []) {
            const s = p.sounds?.get(src.audioId);
            if (s)
                return {
                    name: s.name,
                    badge: 'TRACK',
                };
        }
        const byUuid = LumennCompat.resolveUuidSync(src.audioId);
        return {
            name: byUuid?.name ?? game.i18n.localize('LUMENN_FRAME.Beat.InvalidAudio'),
            badge: 'TRACK',
        };
    }
    /** O HUD aponta para este editor: fecha junto para não agir num app fechado. */
    _onClose(options) {
        super._onClose(options);
        this.#destinationsHud?.close();
    }
    async _onRender(context, options) {
        await super._onRender(context, options);
        this.#closeNodeMenu();
        this.#groupDragOverrides = null;
        this.#dragDrop.forEach((d) => d.bind(this.element));
        const root = this.element;
        // Dock da biblioteca: começa recolhido e lembra o estado entre renders.
        const dock = root.querySelector('.lf-library-dock');
        if (dock) {
            dock.open = this.#libraryDockOpen;
            dock.addEventListener('toggle', () => (this.#libraryDockOpen = dock.open));
        }
        root.querySelectorAll('[data-action]').forEach((el) =>
            el.addEventListener('click', (e) => this.#action(e))
        );
        root.querySelectorAll('[data-group-toggle]').forEach((el) =>
            el.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                const groupId = e.currentTarget.dataset.groupToggle;
                if (!groupId) return;
                if (this.#collapsedGroups.has(groupId)) this.#collapsedGroups.delete(groupId);
                else {
                    this.#collapsedGroups.add(groupId);
                    const selected =
                        this.#selected.kind === 'node'
                            ? LumennGraphStore.getNode(this.#graphId, this.#selected.id)
                            : null;
                    if (selected?.parentId === groupId)
                        this.#selected = {
                            kind: null,
                            id: null,
                        };
                }
                this.render();
            })
        );
        root.querySelectorAll('[data-group-lock]').forEach((el) =>
            el.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                const groupId = e.currentTarget.dataset.groupLock;
                if (!groupId) return;
                if (this.#lockedGroups.has(groupId)) this.#lockedGroups.delete(groupId);
                else this.#lockedGroups.add(groupId);
                this.render();
            })
        );
        root.querySelectorAll('[data-hive-field]').forEach((el) =>
            el.addEventListener('change', (e) => this.#hiveFieldChange(e))
        );
        root.querySelectorAll('[data-hive-drag]').forEach((el) =>
            el.addEventListener('dragstart', (e) => {
                e.dataTransfer.setData('application/x-lumenn-hive', el.dataset.hiveDrag);
                e.dataTransfer.effectAllowed = 'copy';
            })
        );
        root.querySelectorAll('[data-tool]').forEach((el) =>
            el.addEventListener('click', (e) => {
                const tool = e.currentTarget.dataset.tool;
                this.#tool = tool;
                this.#selected = {
                    kind: null,
                    id: null,
                };
                this.render();
            })
        );
        const selector = root.querySelector('select[data-graph-selector]');
        selector?.addEventListener('change', (e) => {
            this.#graphId = e.target.value;
            this.#resetTrail();
            this.#editStack = [];
            this.#collapsedGroups.clear();
            this.#lockedGroups.clear();
            this.#selected = {
                kind: null,
                id: null,
            };
            this.render();
        });
        root.querySelectorAll('.lf-node').forEach((node) => this.#bindNode(root, node));
        root.querySelectorAll('[data-port]').forEach((port) =>
            port.addEventListener('pointerdown', (e) => this.#startConnect(e, port))
        ); // Trilho de portas com rolagem: a roda sobre ele não pode virar pan/zoom do canvas.
        root.querySelectorAll('.lf-hub-side').forEach((el) =>
            el.addEventListener('wheel', (e) => {
                if (el.scrollHeight > el.clientHeight) e.stopPropagation();
            })
        );
        root.querySelectorAll('[data-insp]').forEach((el) =>
            el.addEventListener('change', (e) => this.#inspectorChange(e))
        );
        // Chips de atalho: escolhem no select da transição e disparam o mesmo `change` (um caminho só para gravar).
        root.querySelectorAll('[data-tr-pick]').forEach((chip) =>
            chip.addEventListener('click', () => {
                const select = chip
                    .closest('.lf-tr-scene')
                    ?.querySelector('[data-insp="transition.scene.type"]');
                if (!select || select.disabled) return;
                select.value = chip.dataset.trPick;
                select.dispatchEvent(new Event('change', { bubbles: true }));
            })
        );
        // Stinger pronto: preenche o arquivo do campo indicado; o corte vazio cai na metade do vídeo.
        root.querySelectorAll('[data-stinger-src]').forEach((chip) =>
            chip.addEventListener('click', () => {
                const input = root.querySelector(chip.dataset.stingerFor);
                if (!input || input.disabled) return;
                input.value = chip.dataset.stingerSrc;
                input.dispatchEvent(new Event('change', { bubbles: true }));
            })
        );
        root.querySelectorAll('[data-insp-input]').forEach((el) =>
            el.addEventListener('input', (e) => this.#inspectorInput(e))
        );
        root.querySelectorAll('[data-insp-action]').forEach((el) =>
            el.addEventListener('click', (e) => this.#inspectorAction(e))
        );
        root.querySelectorAll('[data-insp-swatch]').forEach((el) =>
            el.addEventListener('click', (e) => this.#inspectorSwatch(e))
        );
        this.#resizeWorld(root);
        this.#drawEdges(root);
        this.#applyCamera(root);
        this.#bindCamera(root);
        this.#observeResize(root);
        root.querySelector('.lf-viewport')?.classList.toggle(
            'connect-mode',
            this.#tool === 'connect'
        ); // Porta armada: o ghost acompanha o cursor sem captura de ponteiro.
        root.querySelector('.lf-viewport')?.addEventListener('pointermove', (e) => {
            if (!this.#connectState?.armed) return;
            this.#connectState.x = e.clientX;
            this.#connectState.y = e.clientY;
            this.#updateGhost();
        });
        root.querySelector('.lf-viewport')?.addEventListener('click', (e) =>
            this.#viewportClick(e)
        );
        root.querySelectorAll('.lf-node').forEach((node) =>
            node.addEventListener('click', (e) => this.#nodeClick(e))
        );
        root.querySelectorAll('.lf-node').forEach((node) =>
            node.addEventListener('contextmenu', (e) => {
                if (!LumennCompat.isGM()) return;
                e.preventDefault();
                e.stopPropagation();
                const beat = this.#graph()?.nodes?.find(
                    (candidate) => candidate.id === node.dataset.id
                );
                if (beat) this.#openNodeMenu(e, beat);
            })
        );
        root.querySelector('.lf-edges')?.addEventListener('click', (e) => this.#edgeClick(e));
        // Capa que não carrega (arquivo apagado/movido) vira placeholder, não ícone quebrado + alt.
        root.querySelectorAll('.lf-node-thumb img, .lf-sb-thumb img').forEach((img) =>
            img.addEventListener(
                'error',
                () => {
                    const placeholder = document.createElement('span');
                    placeholder.className = 'lf-node-thumb-ph';
                    placeholder.title = img.getAttribute('src') ?? '';
                    placeholder.innerHTML =
                        '<i class="fa-solid fa-image-slash" aria-hidden="true"></i>';
                    img.replaceWith(placeholder);
                },
                {
                    once: true,
                }
            )
        );
        root.classList.toggle('editing', this.#mode === 'edit');
        if (this.#fitPending) {
            this.#fitPending = false;
            this.#fitAll(root);
        }
        if (this.#cameraFadeIn) {
            this.#cameraFadeIn = false;
            root.querySelector('.lf-camera')?.classList.add('lf-camera-in');
        }
        root.querySelectorAll('[data-hive-enter]').forEach((el) =>
            el.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                this.#hiveEnterButton(el.dataset.hiveEnter);
            })
        );
        if (!this._workspaceAuto && LumennSettings.get('openInWorkspace') && !this.#expanded) {
            this._workspaceAuto = true;
            this.#toggleWorkspace(root);
        }
    }
    #bindNode(root, node) {
        if (!this.#editable()) return;
        node.addEventListener('dragstart', (event) => event.preventDefault());
        node.addEventListener('pointerdown', (e) => {
            if (
                e.target.closest('button') ||
                e.target.closest('[data-port]') ||
                e.target.closest('summary')
            )
                return;
            if (this.#spaceDown || e.button !== 0) return;
            if (this.#tool === 'hand') return;
            e.preventDefault();
            e.stopPropagation();
            this.#suppressNodeClick = false;
            this.#selected = {
                kind: 'node',
                id: node.dataset.id,
            };
            root.querySelectorAll('.lf-node.selected').forEach((el) =>
                el.classList.remove('selected')
            );
            node.classList.add('selected');
            node.setPointerCapture(e.pointerId);
            const viewport = root.querySelector('.lf-viewport');
            const viewportRect = viewport.getBoundingClientRect();
            const graphSnapshot = this.#graph();
            const beat = graphSnapshot?.nodes?.find(
                (candidate) => candidate.id === node.dataset.id
            );
            const isGroup = beat?.type === 'group';
            const groupChildren = isGroup ? childrenOf(graphSnapshot?.nodes ?? [], beat.id) : [];
            const base = isGroup
                ? {
                      x: node.offsetLeft,
                      y: node.offsetTop,
                  }
                : (beat?.position ?? {
                      x: 0,
                      y: 0,
                  });
            const pointerToWorld = (event) =>
                this.#screenToWorld({
                    x: event.clientX - viewportRect.left,
                    y: event.clientY - viewportRect.top,
                });
            const w0 = pointerToWorld(e);
            const grab = {
                x: w0.x - base.x,
                y: w0.y - base.y,
            };
            let next = {
                ...base,
            };
            let moved = false;
            node.classList.add('dragging');
            const move = (ev) => {
                ev.preventDefault();
                ev.stopPropagation();
                const w = pointerToWorld(ev);
                next = {
                    x: Math.round(w.x - grab.x),
                    y: Math.round(w.y - grab.y),
                };
                const dx = next.x - base.x;
                const dy = next.y - base.y;
                if (!moved && Math.hypot(dx, dy) >= 3) moved = true;
                node.style.transform = `translate3d(${dx}px, ${dy}px, 0)`;
                if (isGroup) {
                    const overrides = new Map();
                    for (const child of groupChildren) {
                        const position = {
                            x: Math.round((child.position?.x ?? 0) + dx),
                            y: Math.round((child.position?.y ?? 0) + dy),
                        };
                        overrides.set(child.id, position);
                        this.#pendingEdgeNodes.set(child.id, position);
                        const element = root.querySelector(`.lf-node[data-id="${child.id}"]`);
                        if (element) {
                            element.style.left = `${position.x}px`;
                            element.style.top = `${position.y}px`;
                        }
                    }
                    this.#groupDragOverrides = overrides;
                    this.#edgeGraphSnapshot = graphSnapshot;
                    this.#scheduleEdgeDraw(root);
                    return;
                }
                this.#scheduleEdgeDraw(root, node.dataset.id, next, graphSnapshot);
            };
            const up = async (ev) => {
                ev.preventDefault();
                ev.stopPropagation();
                if (node.hasPointerCapture?.(ev.pointerId))
                    node.releasePointerCapture(ev.pointerId);
                node.removeEventListener('pointermove', move);
                node.removeEventListener('pointerup', up);
                node.removeEventListener('pointercancel', up);
                node.classList.remove('dragging');
                node.style.transform = '';
                if (!isGroup) {
                    node.style.left = `${next.x}px`;
                    node.style.top = `${next.y}px`;
                }
                this.#suppressNodeClick = moved;
                if (this.#edgeFrame !== null) cancelAnimationFrame(this.#edgeFrame);
                this.#edgeFrame = null;
                this.#pendingEdgeNodes.clear();
                this.#edgeGraphSnapshot = null;
                if (isGroup) {
                    if (!moved) {
                        this.#groupDragOverrides = null;
                        return;
                    }
                    const patches = movePositions(groupChildren, {
                        x: next.x - base.x,
                        y: next.y - base.y,
                    });
                    patches.unshift({
                        id: beat.id,
                        position: {
                            x: next.x,
                            y: next.y,
                        },
                    });
                    this.#groupDragOverrides = null;
                    const updated = await LumennGraphStore.updateNodes(this.#graphId, patches);
                    node.style.transform = '';
                    if (!updated.length) {
                        this.render();
                        return;
                    }
                    this.#resizeWorld(root);
                    this.render();
                    return;
                }
                this.#updateIncidentEdges(root, graphSnapshot, new Map([[node.dataset.id, next]]));
                const updated = await LumennGraphStore.updateNode(this.#graphId, node.dataset.id, {
                    position: next,
                });
                if (!updated) {
                    node.style.left = `${base.x}px`;
                    node.style.top = `${base.y}px`;
                    this.#drawEdges(root);
                    return;
                }
                this.#resizeWorld(root);
                if (beat?.parentId) this.render();
            };
            node.addEventListener('pointermove', move);
            node.addEventListener('pointerup', up, {
                once: true,
            });
            node.addEventListener('pointercancel', up, {
                once: true,
            });
        });
    }
    #nodeClick(e) {
        const nodeEl = e.target.closest?.('.lf-node');
        if (!nodeEl) return;
        if (
            e.target.closest('button') ||
            e.target.closest('[data-port]') ||
            e.target.closest('summary')
        )
            return;
        if (this.#suppressNodeClick) {
            this.#suppressNodeClick = false;
            e.preventDefault();
            e.stopPropagation();
            return;
        }
        const id = nodeEl.dataset.id;
        if (!id) return;
        // Mesma função da dica e do escurecimento: o clique nunca desmente o que a interface mostra.
        const { intent } = nodeClickIntent({
            mode: this.#mode,
            isGM: LumennCompat.isGM(),
            tool: this.#tool,
            nodeType: nodeEl.dataset.type,
            isLinked: this.#isNavigable(id),
            isPlayable: nodeEl.classList.contains('playable'),
        });
        // O GM salta de qualquer nó para qualquer nó; o jogador segue pelas ligações.
        if (intent === 'jump') return void this.#jumpTo(this.#graphId, id);
        if (intent === 'follow') return void this.#navigateTo(id);
        if (intent === 'play') return void this.#playAudioNode(id);
        if (intent === 'select') this.#focusNode(id, true);
    }
    #focusNode(nodeId, boostZoom = false) {
        const viewport = this.element.querySelector('.lf-viewport');
        const graph = this.#graph();
        const bounds = this.#nodeBounds(nodeId, null, graph);
        if (!viewport || !bounds) return;
        const targetZoom = boostZoom ? Math.max(this.#camera.zoom, 1.25) : this.#camera.zoom;
        this.#camera = focusCameraOnBounds(
            this.#camera,
            {
                width: viewport.clientWidth,
                height: viewport.clientHeight,
            },
            bounds,
            targetZoom
        );
        this.#selected = {
            kind: 'node',
            id: nodeId,
        };
        this.render();
    }
    #edgeClick(e) {
        const hit = e.target.closest?.('.lf-edge-hit');
        if (!hit?.dataset?.edgeId) return;
        if (this.#mode === 'live') {
            if (!LumennCompat.isGM()) return;
            const edge = LumennGraphStore.getEdge(this.#graphId, hit.dataset.edgeId);
            if (!edge) return;
            e.preventDefault();
            e.stopPropagation();
            this.#selected = {
                kind: 'edge',
                id: edge.id,
            };
            this.render();
            return;
        }
        e.preventDefault();
        e.stopPropagation();
        this.#selected = {
            kind: 'edge',
            id: hit.dataset.edgeId,
        };
        this.render();
    }
    #viewportClick(e) {
        if (this.#suppressClick) {
            this.#suppressClick = false;
            return;
        }
        if (
            e.target.closest('.lf-node') ||
            e.target.closest('[data-port]') ||
            e.target.closest('.lf-edge-hit') ||
            e.target.closest('.lf-camera-bar')
        )
            return;
        if (this.#spaceDown) return;
        if (!this.#editable()) return;
        if (this.#connectState?.armed) {
            // Clique no vazio desarma a porta armada, como o Esc.
            this.#connectState = null;
            this.#updateGhost();
            this.render();
            return;
        }
        if (
            this.#tool === 'scene' ||
            this.#tool === 'audio' ||
            this.#tool === 'note' ||
            this.#tool === 'group' ||
            this.#tool === 'encounter'
        ) {
            const point = this.#clientToCanvas(e, this.element.querySelector('.lf-viewport'));
            this.#createNodeAt(this.#tool, point);
            return;
        }
        if (this.#selected.kind) {
            this.#selected = {
                kind: null,
                id: null,
            };
            this.render();
        }
    }
    async #createNodeAt(type, point) {
        const [w, h] = nodeSize(type, 'normal');
        const node = {
            id: `node_${foundry.utils.randomID(16)}`,
            type,
            position: {
                x: Math.round(point.x - w / 2),
                y: Math.round(point.y - h / 2),
            },
            data:
                type === 'scene'
                    ? {
                          sceneId: null,
                      }
                    : type === 'audio'
                      ? {
                            audioRole: 'music',
                            audioType: null,
                            audioId: null,
                            volume: 0.75,
                            loop: true,
                            fadeIn: null,
                            fadeOut: null,
                        }
                      : type === 'group'
                        ? {
                              title: game.i18n.localize('LUMENN_FRAME.Group.DefaultName'),
                          }
                        : type === 'encounter'
                          ? {
                                encounterType: 'event',
                                title: game.i18n.localize('LUMENN_FRAME.Encounter.Default'),
                                sceneNodeId: null,
                            }
                          : {
                                title: '',
                                body: '',
                            },
        };
        const reason = LumennGraphStore.addNodeBlockReason(this.#graphId, node);
        if (reason) return this.#warnBlock(reason);
        const created = await LumennGraphStore.addNode(this.#graphId, node);
        if (created) {
            this.#selected = {
                kind: 'node',
                id: created.id,
            };
            this.render();
        }
    }
    #warnBlock(reason) {
        const key = {
            'encounter-outside-hive': 'LUMENN_FRAME.Warn.EncounterOutsideHive',
            'hive-cycle': 'LUMENN_FRAME.Warn.HiveCycle',
        }[reason];
        if (key) ui.notifications.warn(game.i18n.localize(key));
    }
    #isNavigable(id) {
        const graph = this.#graph();
        // Fluxo é ida e volta: a ligação gravada A → B também leva de B para A.
        return !!linkBetween(graph?.edges, graph?.activeNodeId, id, { types: ['flow', 'audio'] });
    }
    #bindCamera(root) {
        const viewport = root.querySelector('.lf-viewport');
        if (!viewport) return;
        viewport.addEventListener(
            'wheel',
            (e) => {
                e.preventDefault();
                if (e.ctrlKey || e.metaKey) {
                    const s = LumennSettings.get('zoomSpeed') / 100;
                    const factor = Math.pow(1 + s, -e.deltaY * 0.01);
                    this.#zoomAt(this.#clientToScreen(e, viewport), this.#camera.zoom * factor);
                    return;
                }
                const delta = wheelPanDelta(e, viewport.clientHeight);
                this.#camera.panX -= delta.x;
                this.#camera.panY -= delta.y;
                this.#applyCamera(root);
            },
            {
                passive: false,
            }
        );
        viewport.addEventListener('pointerdown', (e) => {
            const isPan = (this.#spaceDown && e.button === 0) || e.button === 1;
            if (!isPan) return;
            e.preventDefault();
            this.#suppressClick = true;
            viewport.setPointerCapture(e.pointerId);
            this.#panState = {
                id: e.pointerId,
                x: e.clientX,
                y: e.clientY,
            };
            viewport.classList.add('panning');
        });
        viewport.addEventListener('pointermove', (e) => {
            if (!this.#panState || this.#panState.id !== e.pointerId) return;
            this.#camera.panX += e.clientX - this.#panState.x;
            this.#camera.panY += e.clientY - this.#panState.y;
            this.#panState.x = e.clientX;
            this.#panState.y = e.clientY;
            this.#applyCamera(root);
        });
        const endPan = (e) => {
            if (this.#panState?.id === e.pointerId) {
                this.#panState = null;
                viewport.classList.remove('panning');
            }
        };
        viewport.addEventListener('pointerup', endPan);
        viewport.addEventListener('pointercancel', endPan);
        root.querySelectorAll('[data-camera]').forEach((btn) =>
            btn.addEventListener('click', (e) => {
                const act = e.currentTarget.dataset.camera;
                const center = {
                    x: viewport.clientWidth / 2,
                    y: viewport.clientHeight / 2,
                };
                if (act === 'zoom-in') this.#zoomAt(center, this.#camera.zoom * ZOOM_STEP);
                else if (act === 'zoom-out') this.#zoomAt(center, this.#camera.zoom / ZOOM_STEP);
                else if (act === 'reset') this.#zoomAt(center, 1);
                else if (act === 'fit') this.#fitAll(root);
            })
        );
    }
    #observeResize(root) {
        const viewport = root.querySelector('.lf-viewport');
        if (!viewport) return;
        this.#resizeObserver?.disconnect();
        this.#resizeObserver = new ResizeObserver(() => {
            this.#resizeWorld(root);
            this.#drawEdges(root);
        });
        this.#resizeObserver.observe(viewport);
    }
    #resizeWorld(root) {
        const viewport = root.querySelector('.lf-viewport');
        const world = root.querySelector('.lf-camera');
        if (!viewport || !world) return;
        const graph = this.#graph();
        let maxX = viewport.clientWidth,
            maxY = viewport.clientHeight;
        for (const n of graph?.nodes ?? []) {
            const bounds = this.#nodeBounds(n.id, null, graph);
            if (!bounds) continue;
            maxX = Math.max(maxX, bounds.x + bounds.width + 400);
            maxY = Math.max(maxY, bounds.y + bounds.height + 400);
        }
        world.style.width = `${maxX}px`;
        world.style.height = `${maxY}px`;
    }
    #nodeBounds(nodeId, positionOverride = null, graph = null) {
        const source = graph ?? this.#graph();
        const node =
            source?.nodes?.find((candidate) => candidate.id === nodeId) ??
            LumennGraphStore.getNode(this.#graphId, nodeId);
        if (!node) return null;
        if (node.type === 'group') {
            const bounds = groupBounds(
                source?.nodes ?? [],
                node.id,
                nodeSize,
                GROUP_PADDING,
                (child) => this.#groupDragOverrides?.get(child.id) ?? child.position
            );
            if (bounds) return bounds;
        }
        const [w, h] = nodeSize(node.type, node.size);
        const p = positionOverride ?? node.position;
        return {
            x: p.x,
            y: p.y,
            width: w,
            height: h,
        };
    }
    #navigableSet(graph) {
        if (this.#mode !== 'live' || !graph?.activeNodeId) return new Set();
        return linkedFrom(graph.edges, graph.activeNodeId);
    }
    #isGroupOpen(groupId, graph) {
        if (this.#mode === 'edit') return !this.#collapsedGroups.has(groupId);
        return groupOpenFor(
            groupId,
            graph?.nodes ?? [],
            graph?.activeNodeId ?? null,
            this.#navigableSet(graph),
            this.#lockedGroups
        );
    }
    #collapsedSet(graph) {
        const set = new Set();
        for (const node of graph?.nodes ?? []) {
            if (node.type === 'group' && !this.#isGroupOpen(node.id, graph)) set.add(node.id);
        }
        return set;
    }
    #effectiveEdgeIds(edge, graph, collapsed = null, parents = null) {
        const closed = collapsed ?? this.#collapsedSet(graph);
        const map = parents ?? parentMap(graph?.nodes ?? []);
        return {
            from: effectiveEndpoint(edge.from, map, closed),
            to: effectiveEndpoint(edge.to, map, closed),
        };
    }
    #portAnchor(nodeId, port, positionOverride = null, graph = null) {
        const bounds = this.#nodeBounds(nodeId, positionOverride, graph);
        if (!bounds)
            return {
                x: 0,
                y: 0,
            };
        const { x, y, width: w, height: h } = bounds;
        if (port === 'flow-out')
            return {
                x: x + w,
                y: y + h * 0.3,
            };
        if (port === 'flow-in')
            return {
                x,
                y: y + h * 0.3,
            };
        if (port === 'audio-out')
            return {
                x: x + w,
                y: y + h * 0.62,
            };
        return {
            x,
            y: y + h * 0.62,
        };
    }
    #edgeGeometry(edge, graph, positionOverrides = null, collapsed = null, parents = null) {
        const fromPosition = positionOverrides?.get(edge.from) ?? null;
        const toPosition = positionOverrides?.get(edge.to) ?? null;
        const ids = this.#effectiveEdgeIds(edge, graph, collapsed, parents);
        const fromBounds = this.#nodeBounds(ids.from, fromPosition, graph);
        const toBounds = this.#nodeBounds(ids.to, toPosition, graph);
        if (!fromBounds || !toBounds)
            return {
                d: '',
                midX: 0,
                midY: 0,
                nx: 0,
                ny: 0,
                start: {
                    x: 0,
                    y: 0,
                },
                end: {
                    x: 0,
                    y: 0,
                },
            };
        const fromCenter = {
            x: fromBounds.x + fromBounds.width / 2,
            y: fromBounds.y + fromBounds.height / 2,
        };
        const toCenter = {
            x: toBounds.x + toBounds.width / 2,
            y: toBounds.y + toBounds.height / 2,
        };
        const a = directionalRectAnchor(fromBounds, toCenter, 'right');
        const b = directionalRectAnchor(toBounds, fromCenter, 'left');
        const hasReverse =
            edge.type === 'flow' &&
            graph.edges.some(
                (candidate) =>
                    candidate.type === 'flow' &&
                    candidate.from === edge.to &&
                    candidate.to === edge.from
            );
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const length = Math.max(1, Math.hypot(dx, dy));
        const nx = -dy / length;
        const ny = dx / length;
        const bend =
            edge.type === 'flow' && hasReverse
                ? edge.from < edge.to
                    ? 54
                    : -54
                : edge.type === 'audio'
                  ? 18
                  : 0;
        const c1x = a.x + dx * 0.33 + nx * bend;
        const c1y = a.y + dy * 0.33 + ny * bend;
        const c2x = a.x + dx * 0.66 + nx * bend;
        const c2y = a.y + dy * 0.66 + ny * bend;
        return {
            d: `M ${a.x} ${a.y} C ${c1x} ${c1y}, ${c2x} ${c2y}, ${b.x} ${b.y}`,
            midX: (a.x + b.x) / 2 + nx * bend,
            midY: (a.y + b.y) / 2 + ny * bend,
            nx,
            ny,
            start: a,
            end: b,
        };
    }
    #drawEdges(root) {
        if (this.#edgeFrame !== null) cancelAnimationFrame(this.#edgeFrame);
        this.#edgeFrame = null;
        this.#pendingEdgeNodes.clear();
        this.#edgeGraphSnapshot = null;
        const svg = root.querySelector('.lf-edges');
        const graph = this.#graph();
        if (!svg) return;
        svg.innerHTML = '';
        const collapsed = this.#collapsedSet(graph);
        const parents = parentMap(graph?.nodes ?? []);
        let hotEdges = 0;
        // Retângulos dos cards: o rótulo (sob os cards, ADR-002) só pode ocupar o vão entre eles.
        const nodeRects = (graph?.nodes ?? [])
            .map((node) => this.#nodeBounds(node.id, null, graph))
            .filter(Boolean);
        for (const e of graph?.edges ?? []) {
            const from = graph.nodes.find((node) => node.id === e.from);
            const to = graph.nodes.find((node) => node.id === e.to);
            if (!from || !to) continue;
            const ids = this.#effectiveEdgeIds(e, graph, collapsed, parents);
            if (ids.from === ids.to) continue;
            const {
                d,
                midX,
                midY,
                nx,
                ny,
                start: edgeStart,
                end: edgeEnd,
            } = this.#edgeGeometry(e, graph, null, collapsed, parents);
            if (e.type === 'audio') {
                const role = from.data?.audioRole === 'sfx' ? 'sfx' : 'music';
                const rolePath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
                rolePath.setAttribute('d', d);
                rolePath.setAttribute('fill', 'none');
                rolePath.setAttribute('class', `lf-edge-audio-role lf-edge-audio-role-${role}`);
                rolePath.setAttribute('data-edge-id', e.id);
                rolePath.setAttribute('vector-effect', 'non-scaling-stroke');
                svg.appendChild(rolePath);
            }
            const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
            path.setAttribute('d', d);
            path.setAttribute('fill', 'none');
            path.setAttribute('class', `lf-edge lf-edge-${e.type}`);
            path.setAttribute('data-edge-id', e.id);
            path.setAttribute('vector-effect', 'non-scaling-stroke');
            const selected = this.#selected.kind === 'edge' && this.#selected.id === e.id;
            if (e.type === 'flow') {
                if (selected) path.style.stroke = '#ffffff';
                else {
                    const gradient = document.createElementNS(
                        'http://www.w3.org/2000/svg',
                        'linearGradient'
                    );
                    const gradientId = `lf-flow-${e.id}`;
                    gradient.setAttribute('id', gradientId);
                    gradient.setAttribute('x1', '0%');
                    gradient.setAttribute('x2', '100%');
                    gradient.setAttribute('y1', '0%');
                    gradient.setAttribute('y2', '0%');
                    const start = document.createElementNS('http://www.w3.org/2000/svg', 'stop');
                    start.setAttribute('offset', '0%');
                    const fromActive =
                        ids.from === graph.activeNodeId ||
                        childrenOf(graph.nodes, ids.from).some(
                            (kid) => kid.id === graph.activeNodeId
                        );
                    start.setAttribute('stop-color', fromActive ? '#ffd166' : '#f0a321');
                    const end = document.createElementNS('http://www.w3.org/2000/svg', 'stop');
                    end.setAttribute('offset', '100%');
                    end.setAttribute('stop-color', '#8b6a28');
                    gradient.append(start, end);
                    const defs =
                        svg.querySelector('defs') ??
                        document.createElementNS('http://www.w3.org/2000/svg', 'defs');
                    if (!defs.parentNode) svg.prepend(defs);
                    defs.appendChild(gradient);
                    path.style.stroke = `url(#${gradientId})`;
                }
                path.setAttribute('stroke-width', selected ? 4 : 3);
                path.setAttribute('opacity', selected ? 1 : 0.8);
            } else {
                path.style.stroke = selected ? '#ff7b7b' : '#ef4444';
                path.setAttribute('stroke-width', selected ? 3.2 : 2.4);
                path.setAttribute('opacity', selected ? 1 : 0.9);
                path.setAttribute('transform', `translate(${nx * 2.5} ${ny * 2.5})`);
                const left = path.cloneNode(true);
                left.classList.add('lf-edge-audio-left');
                left.style.stroke = '#ffffff';
                left.setAttribute('transform', `translate(${-nx * 2.5} ${-ny * 2.5})`);
                svg.appendChild(left);
            }
            svg.appendChild(path);
            // Sinapse "quente": sai do nó ativo (Ao Vivo) ou toca o nó selecionado. Teto de 24 por desenho.
            const touchesSelected =
                this.#selected.kind === 'node' &&
                (e.from === this.#selected.id || e.to === this.#selected.id);
            const leavesActive = this.#mode === 'live' && e.from === graph.activeNodeId;
            if ((touchesSelected || leavesActive) && hotEdges < 24) {
                hotEdges++;
                const pulse = path.cloneNode(false);
                pulse.removeAttribute('style');
                pulse.removeAttribute('transform');
                pulse.setAttribute('class', `lf-edge-pulse lf-edge-pulse-${e.type}`);
                pulse.setAttribute('pointer-events', 'none');
                svg.appendChild(pulse);
            }
            for (const [edgeEndName, point] of [
                ['start', edgeStart],
                ['end', edgeEnd],
            ]) {
                const dock = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
                dock.setAttribute('cx', point.x);
                dock.setAttribute('cy', point.y);
                dock.setAttribute('r', e.type === 'flow' ? 3.5 : 3);
                dock.setAttribute('class', `lf-edge-dock lf-edge-dock-${e.type}`);
                dock.setAttribute('data-edge-id', e.id);
                dock.setAttribute('data-edge-end', edgeEndName);
                dock.setAttribute('vector-effect', 'non-scaling-stroke');
                svg.appendChild(dock);
            }
            if (
                e.type === 'flow' &&
                LumennSettings.get('showTransitionLabels') &&
                this.#camera.zoom >= 0.45
            ) {
                // O rótulo mora sob os cards (ADR-002): encurta ao vão visível entre eles.
                const label = fitEdgeLabel(this.#edgeLabelText(e), {
                    span: labelRoom(
                        {
                            x: midX,
                            y: midY - 6,
                        },
                        nodeRects
                    ),
                    zoom: this.#camera.zoom,
                });
                if (label) {
                    const lx = midX;
                    const ly = midY - 6;
                    const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
                    text.setAttribute('x', lx);
                    text.setAttribute('y', ly);
                    text.setAttribute('text-anchor', 'middle');
                    text.setAttribute('font-size', '11');
                    text.setAttribute('font-family', 'var(--lf-font-body)');
                    text.style.fill = 'var(--lf-text)';
                    text.style.stroke = '#101014';
                    text.setAttribute('stroke-width', '3');
                    text.setAttribute('stroke-linejoin', 'round');
                    text.setAttribute('paint-order', 'stroke');
                    text.setAttribute('class', 'lf-edge-label');
                    text.setAttribute('data-edge-id', e.id);
                    text.textContent = label;
                    svg.appendChild(text);
                }
            }
            const hit = document.createElementNS('http://www.w3.org/2000/svg', 'path');
            hit.setAttribute('d', d);
            hit.setAttribute('fill', 'none');
            hit.setAttribute('stroke', 'transparent');
            hit.setAttribute('stroke-width', '24');
            hit.setAttribute('class', 'lf-edge-hit');
            hit.setAttribute('data-edge-id', e.id);
            hit.setAttribute('vector-effect', 'non-scaling-stroke');
            // Rótulo completo na dica: o desenhado pode estar encurtado para caber entre os cards.
            const fullLabel = e.type === 'flow' ? this.#edgeLabelText(e) : '';
            hit.setAttribute(
                'title',
                `${this.#nodeLabel(from)} → ${this.#nodeLabel(to)}${fullLabel ? ` · ${fullLabel}` : ''} · ${game.i18n.localize('LUMENN_FRAME.Edge.EditTransition')}`
            );
            svg.appendChild(hit);
        }
        const ghost = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        ghost.setAttribute('class', 'lf-ghost');
        ghost.setAttribute('fill', 'none');
        ghost.setAttribute('stroke', 'var(--lf-teal)');
        ghost.setAttribute('stroke-width', '2');
        ghost.setAttribute('stroke-dasharray', '6 4');
        ghost.setAttribute('d', this.#connectState ? this.#ghostPath() : '');
        svg.appendChild(ghost);
    }
    #updateIncidentEdges(root, graph, positionOverrides) {
        const svg = root.querySelector('.lf-edges');
        if (!svg || !graph) return;
        const dirtyNodes = new Set(positionOverrides.keys());
        const collapsed = this.#collapsedSet(graph);
        const parents = parentMap(graph?.nodes ?? []);
        for (const edge of graph.edges ?? []) {
            if (!dirtyNodes.has(edge.from) && !dirtyNodes.has(edge.to)) continue;
            const ids = this.#effectiveEdgeIds(edge, graph, collapsed, parents);
            if (ids.from === ids.to) continue;
            const geometry = this.#edgeGeometry(edge, graph, positionOverrides, collapsed, parents);
            const elements = svg.querySelectorAll(`[data-edge-id="${edge.id}"]`);
            for (const element of elements) {
                if (element.tagName.toLowerCase() === 'text') {
                    element.setAttribute('x', geometry.midX);
                    element.setAttribute('y', geometry.midY - 6);
                    continue;
                }
                if (element.tagName.toLowerCase() === 'circle') {
                    const point =
                        element.dataset.edgeEnd === 'start' ? geometry.start : geometry.end;
                    element.setAttribute('cx', point.x);
                    element.setAttribute('cy', point.y);
                    continue;
                }
                element.setAttribute('d', geometry.d);
                if (
                    edge.type !== 'audio' ||
                    element.classList.contains('lf-edge-hit') ||
                    element.classList.contains('lf-edge-audio-role')
                )
                    continue;
                const side = element.classList.contains('lf-edge-audio-left') ? -2.5 : 2.5;
                element.setAttribute(
                    'transform',
                    `translate(${geometry.nx * side} ${geometry.ny * side})`
                );
            }
        }
    }
    #scheduleEdgeDraw(root = this.element, nodeId = null, position = null, graphSnapshot = null) {
        if (nodeId && position) this.#pendingEdgeNodes.set(nodeId, position);
        if (graphSnapshot) this.#edgeGraphSnapshot = graphSnapshot;
        if (this.#edgeFrame !== null) return;
        this.#edgeFrame = requestAnimationFrame(() => {
            this.#edgeFrame = null;
            if (!this.#pendingEdgeNodes.size) {
                this.#drawEdges(root);
                return;
            }
            const overrides = new Map(this.#pendingEdgeNodes);
            this.#pendingEdgeNodes.clear();
            const graph = this.#edgeGraphSnapshot ?? this.#graph();
            this.#edgeGraphSnapshot = null;
            this.#updateIncidentEdges(root, graph, overrides);
        });
    }
    #ghostPath() {
        if (!this.#connectState) return '';
        const from = this.#connectState.armed
            ? this.#armedAnchor(this.#connectState)
            : (this.#connectState.anchor ??
              this.#portAnchor(this.#connectState.nodeId, this.#connectState.port));
        const viewport = this.element.querySelector('.lf-viewport');
        const to = this.#screenToWorld(
            this.#clientToScreen(
                {
                    clientX: this.#connectState.x,
                    clientY: this.#connectState.y,
                },
                viewport
            )
        );
        const midX = (from.x + to.x) / 2;
        return `M ${from.x} ${from.y} C ${midX} ${from.y}, ${midX} ${to.y}, ${to.x} ${to.y}`;
    }
    #updateGhost() {
        const svg = this.element.querySelector('.lf-edges');
        const ghost = svg?.querySelector('.lf-ghost');
        if (ghost) ghost.setAttribute('d', this.#ghostPath());
    }
    #edgeLabelText(e) {
        const t = e.transition;
        if (!t) return null;
        const L = (k) => game.i18n.localize(k);
        const type = t.scene?.type ?? 'cut';
        const sceneName =
            type === 'cut'
                ? L('LUMENN_FRAME.Edge.Cut')
                : (LumennCompat.getSceneTransitions().find((d) => d.id === type)?.label ?? type);
        return formatEdgeLabel(t, {
            L,
            sceneName,
        });
    }
    #startConnect(e, port) {
        if (!this.#editable() || this.#tool === 'hand') return;
        e.preventDefault();
        e.stopPropagation();
        const nodeId = port.dataset.node;
        const kind = port.dataset.port;
        if (this.#connectState?.armed) {
            // Ligação em série: o clique numa porta decide criar, alternar ou rearmar.
            if (kind === 'flow-out') return this.#armPort(port, e);
            if (kind === 'flow-in' && nodeId !== this.#connectState.nodeId)
                return this.#armedConnect(e, nodeId, port.dataset.entryPort || null);
            return;
        } // Entradas só recebem: arrasto nasce de saída de fluxo ou de áudio.
        if (kind !== 'flow-out' && kind !== 'audio-out') return;
        const viewport = this.element.querySelector('.lf-viewport');
        viewport.setPointerCapture(e.pointerId);
        this.#connectState = {
            nodeId,
            port: kind,
            exitPortId: port.dataset.exitPort || null,
            anchor: this.#portWorldAnchor(port, nodeId, kind),
            x: e.clientX,
            y: e.clientY,
            moved: false,
            targetNodeId: null,
            targetPort: null,
            targetEntryPort: null,
        };
        this.#updateGhost();
        const move = (ev) => {
            const state = this.#connectState;
            if (!state) return;
            state.x = ev.clientX;
            state.y = ev.clientY;
            if (Math.hypot(ev.clientX - e.clientX, ev.clientY - e.clientY) >= 3) state.moved = true;
            this.#updateGhost();
            this.#highlightTarget(ev);
        };
        const up = (ev) => {
            viewport.removeEventListener('pointermove', move);
            viewport.removeEventListener('pointerup', up);
            viewport.removeEventListener('pointercancel', up);
            this.#finishConnect(ev);
        };
        viewport.addEventListener('pointermove', move);
        viewport.addEventListener('pointerup', up, {
            once: true,
        });
        viewport.addEventListener('pointercancel', up, {
            once: true,
        });
    }
    /** Centro do soquete em coordenadas do canvas (o ghost nasce no anel, não no card). */
    #portWorldAnchor(portEl, nodeId, kind) {
        const viewport = this.element.querySelector('.lf-viewport');
        const rect = portEl?.getBoundingClientRect?.();
        if (!viewport || !rect?.width) return this.#portAnchor(nodeId, kind);
        const canvasRect = viewport.getBoundingClientRect();
        return this.#screenToWorld({
            x: rect.left + rect.width / 2 - canvasRect.left,
            y: rect.top + rect.height / 2 - canvasRect.top,
        });
    }
    /** Âncora do ghost armado: relê o soquete no DOM para seguir zoom, pan e re-render. */
    #armedAnchor(state) {
        const selector = state.exitPortId
            ? `.lf-hub-port[data-node="${state.nodeId}"][data-exit-port="${state.exitPortId}"]`
            : `.lf-ports [data-port="flow-out"][data-node="${state.nodeId}"]`;
        const portEl = this.element?.querySelector(selector) ?? null;
        if (portEl) return this.#portWorldAnchor(portEl, state.nodeId, 'flow-out');
        return state.anchor ?? this.#portAnchor(state.nodeId, 'flow-out');
    }
    /** Arma uma porta de saída: o ghost segue o cursor até criar (clique) ou desarmar (Esc/vazio). */
    #armPort(portEl, ev = null) {
        const nodeId = portEl?.dataset?.node ?? null;
        if (!nodeId) return;
        this.#armState(
            {
                nodeId,
                exitPortId: portEl.dataset.exitPort || null,
                anchor: this.#portWorldAnchor(portEl, nodeId, 'flow-out'),
            },
            ev
        );
    }
    #armState({ nodeId, exitPortId, anchor }, ev = null) {
        this.#connectState = {
            nodeId,
            port: 'flow-out',
            exitPortId,
            anchor,
            x: ev?.clientX ?? 0,
            y: ev?.clientY ?? 0,
            moved: true,
            armed: true,
            targetNodeId: null,
            targetPort: null,
            targetEntryPort: null,
        };
        this.render();
    }
    /** Clique numa entrada com uma saída armada: cria e desarma, encadeia (Shift) ou alterna (Ctrl). */
    async #armedConnect(ev, nodeId, entryPortId) {
        const state = this.#connectState;
        if (!state?.armed) return;
        const intent = connectIntent({
            target: nodeId,
            ctrlKey: ev.ctrlKey || ev.metaKey,
            shiftKey: ev.shiftKey,
        });
        const graph = this.#graph();
        const existing =
            (graph?.edges ?? []).find(
                (edge) => edge.type === 'flow' && edge.from === state.nodeId && edge.to === nodeId
            ) ?? null;
        if (intent.action === 'toggle' && existing) {
            await LumennGraphStore.deleteEdge(this.#graphId, existing.id);
        } else if (existing) {
            // Já ligada: só repara a porta, sem duplicar a aresta.
            await LumennGraphStore.updateEdge(this.#graphId, existing.id, {
                ...(state.exitPortId
                    ? {
                          exitPortId: state.exitPortId,
                      }
                    : {}),
                ...(entryPortId
                    ? {
                          portId: entryPortId,
                      }
                    : {}),
            });
        } else {
            const edge = {
                id: `edge_${foundry.utils.randomID(16)}`,
                type: 'flow',
                from: state.nodeId,
                to: nodeId,
            };
            if (state.exitPortId) edge.exitPortId = state.exitPortId;
            if (entryPortId) edge.portId = entryPortId;
            await LumennGraphStore.addEdge(this.#graphId, edge);
        }
        if (intent.keepArmed) {
            state.x = ev.clientX;
            state.y = ev.clientY;
        } else {
            this.#connectState = null;
        }
        this.render();
    }
    #highlightTarget(ev) {
        const target = this.#findConnectTarget(ev.clientX, ev.clientY);
        const state = this.#connectState;
        if (!state) return;
        const nodeId = target?.nodeId ?? null;
        const port = target?.port ?? null;
        const entryPort = target?.entryPort ?? null;
        if (
            state.targetNodeId === nodeId &&
            state.targetPort === port &&
            state.targetEntryPort === entryPort
        )
            return;
        state.targetNodeId = nodeId;
        state.targetPort = port;
        state.targetEntryPort = entryPort;
        const root = this.element;
        root.querySelectorAll('.lf-node.target-hi').forEach((n) => n.classList.remove('target-hi'));
        if (nodeId) root.querySelector(`.lf-node[data-id="${nodeId}"]`)?.classList.add('target-hi');
    }
    #findConnectTarget(clientX, clientY, connectState = this.#connectState) {
        const state = connectState;
        if (!state) return null;
        const expected = state.port === 'flow-out' ? 'flow-in' : 'audio-in';
        const direct = document
            .elementFromPoint(clientX, clientY)
            ?.closest?.(`[data-port="${expected}"]`);
        if (direct?.dataset?.node && direct.dataset.node !== state.nodeId)
            return {
                nodeId: direct.dataset.node,
                port: expected,
                entryPort: direct.dataset.entryPort ?? null,
            };
        const node = document.elementFromPoint(clientX, clientY)?.closest?.('.lf-node');
        if (node?.dataset?.id && node.dataset.id !== state.nodeId) {
            const port = node.querySelector(`[data-port="${expected}"]`);
            if (port)
                return {
                    nodeId: node.dataset.id,
                    port: expected,
                    entryPort: port.dataset.entryPort ?? null,
                };
        }
        let best = null;
        let bestDistance = Infinity;
        this.element.querySelectorAll(`[data-port="${expected}"]`).forEach((candidate) => {
            if (candidate.dataset.node === state.nodeId) return;
            const r = candidate.getBoundingClientRect();
            const pad = 30;
            const dx = Math.max(r.left - clientX, 0, clientX - r.right);
            const dy = Math.max(r.top - clientY, 0, clientY - r.bottom);
            const distance = Math.hypot(dx, dy);
            if (distance <= pad && distance < bestDistance) {
                best = {
                    nodeId: candidate.dataset.node,
                    port: expected,
                    entryPort: candidate.dataset.entryPort ?? null,
                };
                bestDistance = distance;
            }
        });
        return best;
    }
    #finishConnect(ev) {
        const viewport = this.element.querySelector('.lf-viewport');
        if (viewport?.hasPointerCapture?.(ev.pointerId)) {
            viewport.releasePointerCapture(ev.pointerId);
        }
        const state = this.#connectState;
        this.#connectState = null;
        this.#updateGhost();
        this.element
            .querySelectorAll('.lf-node.target-hi')
            .forEach((n) => n.classList.remove('target-hi'));
        if (!state) return;
        const hit = this.#findConnectTarget(ev.clientX, ev.clientY, state); // O hit test do ponto final vence o alvo guardado: o card pode ter saído de baixo do cursor.
        const toNodeId = hit?.nodeId ?? state.targetNodeId ?? null;
        const toPort = hit?.port ?? state.targetPort ?? null;
        if (!toNodeId || toNodeId === state.nodeId) {
            // Soltar no vazio depois de puxar de uma saída arma a porta (link em série).
            if (state.port === 'flow-out' && !state.moved)
                this.#armState({
                    nodeId: state.nodeId,
                    exitPortId: state.exitPortId,
                    anchor: state.anchor,
                });
            return;
        }
        const valid =
            (state.port === 'flow-out' && toPort === 'flow-in') ||
            (state.port === 'audio-out' && toPort === 'audio-in');
        if (!valid) return;
        const entryPort = hit?.entryPort ?? state.targetEntryPort ?? null;
        const edge = {
            id: `edge_${foundry.utils.randomID(16)}`,
            type: state.port === 'flow-out' ? 'flow' : 'audio',
            from: state.nodeId,
            to: toNodeId,
        };
        if (state.port === 'flow-out') {
            if (state.exitPortId) edge.exitPortId = state.exitPortId;
            if (entryPort) edge.portId = entryPort;
        }
        LumennGraphStore.addEdge(this.#graphId, edge).then((created) => {
            if (created) {
                this.#selected = {
                    kind: 'edge',
                    id: created.id,
                };
                this.render();
            }
        });
    }
    async #action(event) {
        event.preventDefault();
        const action = event.currentTarget.dataset.action;
        const root = this.element;
        if (action === 'toggle-mode') {
            this.#mode = this.#mode === 'edit' ? 'live' : 'edit';
            this.#selected = {
                kind: null,
                id: null,
            };
            return this.render();
        }
        if (action === 'workspace-toggle') return this.#toggleWorkspace(root);
        if (action === 'open-guide') return openLumennGuide();
        if (action === 'add-hive') {
            // "+ Hive" do topo: cria o Grupo-Hive no centro da vista atual.
            const viewport = this.element.querySelector('.lf-viewport');
            const r = viewport?.getBoundingClientRect();
            if (!r || !this.#editable()) return;
            const center = { clientX: r.left + r.width / 2, clientY: r.top + r.height / 2 };
            return this.#createNodeAt('group', this.#clientToCanvas(center, viewport));
        }
        if (action === 'jump-intro') return this.#jumpAnchor('intro');
        if (action === 'jump-output') return this.#jumpAnchor('output');
        if (action === 'open-destinations') return this.#openDestinations();
        if (action === 'hive-exit') return this.#exitHive(event.currentTarget.dataset.port || null);
        if (action === 'browser-open' || action === 'browser-close') {
            this.#browserOpen = action === 'browser-open';
            return this.render();
        }
        if (action === 'browser-filter') {
            this.#browserFilter = event.currentTarget.dataset.filter || 'all';
            return this.render();
        }
        if (action === 'browser-go') return this.#switchGraph(event.currentTarget.dataset.graph);
        if (action === 'nav-back' || action === 'nav-forward') {
            const from = action === 'nav-back' ? this.#history : this.#future;
            const to = action === 'nav-back' ? this.#future : this.#history;
            let target = from.pop();
            while (target && !LumennGraphStore.getGraph(target)) target = from.pop();
            if (!target) return;
            to.push(this.#graphId);
            return this.#switchGraph(target, false);
        }
        if (action === 'edit-goto') {
            // Migalha da Edição: volta direto a um ancestral. Só Edição; no Ao Vivo moveria a mesa.
            const index = Number(event.currentTarget.dataset.index);
            if (this.#mode !== 'edit' || !Number.isInteger(index) || index < 0) return;
            const target = [...this.#editStack, this.#graphId][index];
            if (!target || !LumennGraphStore.getGraph(target)) return;
            this.#editStack = this.#editStack.slice(0, index);
            this.#graphId = target;
            this.#selected = {
                kind: null,
                id: null,
            };
            this.#fitPending = true;
            this.#cameraFadeIn = true;
            return this.render();
        }
        if (action === 'edit-back') {
            const back = this.#editStack.pop();
            if (back && LumennGraphStore.getGraph(back)) this.#graphId = back;
            this.#selected = {
                kind: null,
                id: null,
            };
            this.#fitPending = true;
            this.#cameraFadeIn = true;
            return this.render();
        }
        if (!LumennCompat.isGM() || this.#mode !== 'edit') return;
        if (action === 'create-graph') {
            const raw = await foundry.applications.api.DialogV2.prompt({
                window: {
                    title: game.i18n.localize('LUMENN_FRAME.Toolbar.CreateStoryboard'),
                },
                content: `<input type="text" name="name" value="Novo Storyboard" autofocus>`,
                ok: {
                    label: game.i18n.localize('LUMENN_FRAME.Config.Save'),
                    callback: (ev, btn) => btn.form.elements.name.value,
                },
            });
            const name = (typeof raw === 'string' ? raw : (raw?.name ?? '')).toString().trim();
            if (!name) return;
            const g = await LumennGraphStore.createGraph(name);
            this.#graphId = g?.id ?? this.#graphId;
            this.#resetTrail();
            this.render();
        } else if (action === 'sort-graphs') {
            await LumennGraphStore.sortGraphsByName();
            this.render();
        } else if (action === 'rename-graph') {
            const graph = this.#graph();
            const raw = await foundry.applications.api.DialogV2.prompt({
                window: {
                    title: game.i18n.localize('LUMENN_FRAME.Toolbar.RenameStoryboard'),
                },
                content: `<input type="text" name="name" value="${String(graph?.name ?? '').replace(/"/g, '&quot;')}" autofocus>`,
                ok: {
                    label: game.i18n.localize('LUMENN_FRAME.Config.Save'),
                    callback: (ev, btn) => btn.form.elements.name.value,
                },
            });
            const name = (typeof raw === 'string' ? raw : (raw?.name ?? '')).toString().trim();
            if (name) {
                await LumennGraphStore.renameGraph(this.#graphId, name);
                this.render();
            }
        } else if (action === 'delete-graph') {
            const ok = await foundry.applications.api.DialogV2.confirm({
                title: game.i18n.localize('LUMENN_FRAME.Toolbar.DeleteStoryboard'),
                content: game.i18n.localize('LUMENN_FRAME.ConfirmDeleteStoryboard'),
                yes: {
                    label: game.i18n.localize('LUMENN_FRAME.Beat.Delete'),
                },
                no: {
                    label: game.i18n.localize('LUMENN_FRAME.Config.Cancel'),
                },
            });
            if (ok) {
                const deleted = await LumennGraphStore.deleteGraph(this.#graphId);
                if (!deleted) {
                    const where = LumennGraphStore.getHiveUsages(this.#graphId)
                        .map((use) => use.graphName)
                        .join(', ');
                    ui.notifications.warn(
                        game.i18n.format('LUMENN_FRAME.Warn.HiveInUse', {
                            where,
                        })
                    );
                    return;
                }
                this.#resetTrail();
                this.#graphId = null;
                this.#selected = {
                    kind: null,
                    id: null,
                };
                this.render();
            }
        }
    }
    #setPath(obj, path, val) {
        const parts = path.split('.');
        let cur = obj;
        for (let i = 0; i < parts.length - 1; i++) {
            if (!cur[parts[i]]) cur[parts[i]] = {};
            cur = cur[parts[i]];
        }
        cur[parts[parts.length - 1]] = val;
    }
    #mergeEdgePatch(edge, patch) {
        if (!patch.transition) return patch;
        const merged = {
            ...patch,
            transition: {
                ...(edge?.transition ?? {}),
                ...patch.transition,
                scene: {
                    ...(edge?.transition?.scene ?? {}),
                    ...(patch.transition.scene ?? {}),
                    video: {
                        ...(edge?.transition?.scene?.video ?? {}),
                        ...(patch.transition.scene?.video ?? {}),
                    },
                },
                audio: {
                    ...(edge?.transition?.audio ?? {}),
                    ...(patch.transition.audio ?? {}),
                },
            },
        };
        merged.transition.scene.color = normalizeHexColor(merged.transition.scene.color, '#000000');
        return merged;
    }
    #inspectorChange(e) {
        const path = e.currentTarget.dataset.insp;
        if (!this.#canEditInspectorPath(path)) return;
        if (
            this.#mode === 'live' &&
            path !== 'transition.scope' &&
            !path.startsWith('transition.audio.')
        )
            return;
        let val =
            e.currentTarget.type === 'checkbox' ? e.currentTarget.checked : e.currentTarget.value;
        if (typeof val === 'string' && /Duration|volume|fadeIn|fadeOut|duration|cutAt/.test(path))
            val = Number.isFinite(Number(val)) ? Number(val) : null;
        if (typeof val === 'number' && path.endsWith('cutAt'))
            val = Math.max(0, Math.min(6e4, val));
        if (typeof val === 'number' && /Duration|duration|fadeIn|fadeOut/.test(path))
            val = Math.max(0, Math.min(1e4, val));
        if (typeof val === 'number' && path.endsWith('volume')) val = Math.max(0, Math.min(1, val));
        const kind = this.#selected.kind;
        const id = this.#selected.id;
        if (!path || !kind || !id) return;
        if (path.endsWith('.color')) {
            val = normalizeHexColor(val, '#000000');
            e.currentTarget.value = val;
        }
        if (
            ['data.sceneNodeId', 'data.portId', 'data.graphId', 'exitPortId'].includes(path) &&
            val === ''
        )
            val = null;
        if (kind === 'node') {
            const node = LumennGraphStore.getNode(this.#graphId, id);
            const patch = {};
            this.#setPath(patch, path, val); // Trocar o papel redefine o loop: música repete, SFX toca uma vez.
            if (path === 'data.audioRole' && node?.type === 'audio')
                patch.data.loop = val !== 'sfx';
            if (path === 'data.graphId') {
                patch.data.portId = null;
                const reason = LumennGraphStore.retargetBlockReason(this.#graphId, id, val);
                if (val && reason) {
                    this.#warnBlock(reason);
                    return this.render();
                }
            }
            LumennGraphStore.updateNode(this.#graphId, id, {
                ...patch,
                data: {
                    ...node.data,
                    ...(patch.data ?? {}),
                },
            }).then(() => this.render());
        } else if (kind === 'edge') {
            const edge = LumennGraphStore.getEdge(this.#graphId, id);
            const patch = {};
            this.#setPath(patch, path, val);
            LumennGraphStore.updateEdge(this.#graphId, id, this.#mergeEdgePatch(edge, patch)).then(
                () => {
                    // Trocar o tipo muda os campos do Inspector (ex.: arquivo do stinger de vídeo).
                    if (path === 'transition.scene.type' || path.endsWith('.video.src'))
                        return this.render();
                    const graph = this.#graph();
                    const edge = graph?.edges?.find((candidate) => candidate.id === id);
                    if (!edge) return;
                    const label = this.element.querySelector(
                        `.lf-edge-label[data-edge-id="${id}"]`
                    );
                    if (label) label.textContent = this.#edgeLabelText(edge) ?? '';
                }
            );
        }
    }
    #inspectorInput(e) {
        clearTimeout(this._inspTimer);
        const path = e.currentTarget.dataset.inspInput;
        const val = e.currentTarget.value;
        const kind = this.#selected.kind;
        const id = this.#selected.id;
        this._inspTimer = setTimeout(() => {
            if (!path || !kind || !id || !this.#canEditInspectorPath(path)) return;
            if (this.#mode === 'live' && !path.startsWith('transition.audio.')) return;
            if (kind === 'node') {
                const node = LumennGraphStore.getNode(this.#graphId, id);
                const patch = {};
                this.#setPath(patch, path, val);
                LumennGraphStore.updateNode(this.#graphId, id, {
                    ...patch,
                    data: {
                        ...node.data,
                        ...(patch.data ?? {}),
                    },
                }).then(() => this.render());
            } else if (kind === 'edge') {
                const edge = LumennGraphStore.getEdge(this.#graphId, id);
                const patch = {};
                this.#setPath(patch, path, val);
                LumennGraphStore.updateEdge(
                    this.#graphId,
                    id,
                    this.#mergeEdgePatch(edge, patch)
                ).then(() => this.render());
            }
        }, 300);
    }
    async #inspectorAction(e) {
        const action = e.currentTarget.dataset.inspAction;
        const root = this.element;
        if (action === 'select-edge') {
            const edgeId = e.currentTarget.dataset.inspEdge;
            if (!edgeId) return;
            this.#selected = {
                kind: 'edge',
                id: edgeId,
            };
            this.render();
            return;
        }
        if (!this.#editable()) return;
        if (action === 'focus-node') {
            const nodeId = e.currentTarget.dataset.inspNode;
            this.#focusNode(nodeId);
        } else if (action === 'pick-video') {
            // FilePicker do Foundry (v13+: foundry.applications.apps.FilePicker); escreve no campo e dispara change.
            const input = root.querySelector(e.currentTarget.dataset.pickFor);
            const Picker =
                foundry.applications?.apps?.FilePicker?.implementation ?? globalThis.FilePicker;
            if (!input || !Picker) return;
            new Picker({
                type: 'video',
                current: input.value || '',
                callback: (path) => {
                    input.value = path;
                    input.dispatchEvent(
                        new Event('change', {
                            bubbles: true,
                        })
                    );
                },
            }).render(true);
        } else if (action === 'group-to-hive') {
            await this.#groupToHive(this.#selected.id);
        } else if (action.startsWith('hive-')) {
            await this.#hiveAction(action, e.currentTarget.dataset);
        } else if (action === 'set-initial') {
            LumennGraphStore.setActiveNode(this.#graphId, this.#selected.id).then(() =>
                this.render()
            );
        } else if (action === 'group-create') {
            const scene = LumennGraphStore.getNode(this.#graphId, this.#selected.id);
            if (scene?.type !== 'scene') return;
            const group = await LumennGraphStore.addNode(this.#graphId, {
                type: 'group',
                position: {
                    x: scene.position.x - GROUP_PADDING,
                    y: scene.position.y - GROUP_PADDING,
                },
                data: {
                    title: game.i18n.localize('LUMENN_FRAME.Group.DefaultName'),
                },
            });
            if (!group) return;
            await LumennGraphStore.updateNode(this.#graphId, scene.id, {
                parentId: group.id,
            });
            this.#selected = {
                kind: 'node',
                id: group.id,
            };
            this.render();
        } else if (action === 'group-add') {
            const target = root.querySelector('[data-insp-pick="groupTarget"]')?.value;
            if (!target) return;
            await LumennGraphStore.updateNode(this.#graphId, this.#selected.id, {
                parentId: target,
            });
            this.render();
        } else if (action === 'group-remove') {
            await LumennGraphStore.updateNode(this.#graphId, this.#selected.id, {
                parentId: null,
            });
            this.render();
        } else if (action === 'group-apply-rooms') {
            const groupId = this.#selected.id;
            const graph = this.#graph();
            const group = graph?.nodes?.find((n) => n.id === groupId);
            if (!group || group.type !== 'group') {
                this.render();
                return;
            }
            const checks = new Map(
                [...root.querySelectorAll('[data-insp-room]')].map((el) => [
                    el.dataset.inspRoom,
                    el.checked,
                ])
            );
            const patches = [];
            for (const node of (graph.nodes ?? []).filter((n) => n.type === 'scene')) {
                const checked = !!checks.get(node.id);
                const parentId = checked
                    ? groupId
                    : node.parentId === groupId
                      ? null
                      : (node.parentId ?? null);
                if ((node.parentId ?? null) !== parentId)
                    patches.push({
                        id: node.id,
                        parentId,
                    });
            }
            if (!patches.length) return;
            await LumennGraphStore.updateNodes(this.#graphId, patches);
            this.render();
        } else if (action === 'delete-node') {
            LumennGraphStore.deleteNode(this.#graphId, this.#selected.id).then(() => {
                this.#selected = {
                    kind: null,
                    id: null,
                };
                this.render();
            });
        } else if (action === 'delete-edge') {
            const edgeId = e.currentTarget.dataset.inspEdge ?? this.#selected.id;
            LumennGraphStore.deleteEdge(this.#graphId, edgeId).then(() => {
                this.#selected = {
                    kind: null,
                    id: null,
                };
                this.render();
            });
        } else if (action === 'add-flow') {
            const targetId = root.querySelector('[data-insp-pick="flowTarget"]')?.value;
            if (targetId && this.#selected.kind === 'node') {
                const edge = {
                    id: `edge_${foundry.utils.randomID(16)}`,
                    type: 'flow',
                    from: this.#selected.id,
                    to: targetId,
                };
                LumennGraphStore.addEdge(this.#graphId, edge).then((created) => {
                    if (created) {
                        this.#selected = {
                            kind: 'edge',
                            id: created.id,
                        };
                        this.render();
                    }
                });
            }
        } else if (action === 'attach-audio') {
            const audioId = root.querySelector('[data-insp-pick="audioAttach"]')?.value;
            if (audioId && this.#selected.kind === 'node') {
                const edge = {
                    id: `edge_${foundry.utils.randomID(16)}`,
                    type: 'audio',
                    from: audioId,
                    to: this.#selected.id,
                };
                LumennGraphStore.addEdge(this.#graphId, edge).then((created) => {
                    if (created) {
                        this.#selected = {
                            kind: 'edge',
                            id: created.id,
                        };
                        this.render();
                    }
                });
            }
        } else if (action === 'preview-transition') {
            if (this.#previewing) return;
            const edge = LumennGraphStore.getEdge(this.#graphId, this.#selected.id);
            if (edge?.type !== 'flow') return;
            const target = LumennGraphStore.getNode(this.#graphId, edge.to);
            const scene = target?.data?.sceneId ? game.scenes.get(target.data.sceneId) : null;
            const scope = ['audio', 'scene', 'both'].includes(edge.transition?.scope)
                ? edge.transition.scope
                : 'both';
            const sceneTrans = edge.transition?.scene ?? {
                type: 'cut',
                duration: 0,
            };
            const effect = filmEffectOf(sceneTrans.type);
            if (effect) {
                // Prévia de cinema: só na tela do mestre, sem trocar cena nem áudio.
                await filmPreview({
                    effect,
                    duration: sceneTrans.duration,
                    color: normalizeHexColor(sceneTrans.color, '#000000'),
                    ...filmTitle(sceneTrans, {
                        caption: target ? this.#nodeLabel(target) : '',
                        subtitle: LumennGraphStore.getGraph(this.#graphId)?.name ?? '',
                    }),
                    src: sceneTrans.video?.src ?? '',
                    cutAt: sceneTrans.video?.cutAt,
                    sound: sceneTrans.video?.sound === true,
                });
                return;
            }
            if ((scope === 'scene' || scope === 'both') && scene) {
                this.#previewing = true;
                e.currentTarget.disabled = true;
                this.element?.classList.add('lf-previewing');
                try {
                    await LumennCompat.previewSceneTransition({
                        scene,
                        type: sceneTrans.type ?? 'cut',
                        duration: sceneTrans.duration ?? 1e3,
                        color: normalizeHexColor(sceneTrans.color, '#000000'),
                    });
                } catch (error) {
                    console.error('Lumenn Frame: preview da transição falhou.', error);
                    ui.notifications.warn(game.i18n.localize('LUMENN_FRAME.WarnTransitionPreview'));
                } finally {
                    this.#previewing = false;
                    this.element?.classList.remove('lf-previewing');
                    e.currentTarget.disabled = false;
                }
            }
        } else if (action === 'add-return') {
            LumennGraphStore.addReturn(this.#graphId, this.#selected.id).then(() => this.render());
        }
    }
    #inspectorSwatch(e) {
        if (!this.#editable()) return;
        const color = e.currentTarget.dataset.color;
        if (!color) return;
        const kind = this.#selected.kind;
        const id = this.#selected.id;
        if (kind !== 'node' || !id) return;
        LumennGraphStore.updateNode(this.#graphId, id, {
            color,
        }).then(() => this.render());
    }
    #audioSourcesFor(graph, nodeId) {
        const resolve = (targetId, visited = new Set()) => {
            if (!targetId || visited.has(targetId)) return null;
            const nextVisited = new Set(visited);
            nextVisited.add(targetId);
            const node = graph?.nodes?.find((entry) => entry.id === targetId);
            if (node?.type === 'audio' && node.data?.audioType && node.data?.audioId)
                return {
                    type: node.data.audioType === 'playlist' ? 'playlist' : 'track',
                    id: node.data.audioId,
                    role: node.data.audioRole === 'sfx' ? 'sfx' : 'music',
                    loop: this.#loopOfNode(node),
                };
            const incoming = (graph?.edges ?? []).filter(
                (edge) => edge.type === 'audio' && edge.to === targetId
            );
            for (const edge of [...incoming].reverse()) {
                const source = resolve(edge.from, nextVisited);
                if (source) return source;
            }
            return null;
        };
        const root = graph?.nodes?.find((node) => node.id === nodeId);
        if (root?.type === 'audio') {
            const source = resolve(nodeId);
            return source ? [source] : [];
        }
        const incoming = (graph?.edges ?? []).filter(
            (edge) => edge.type === 'audio' && edge.to === nodeId
        );
        const candidates = incoming.map((edge) => resolve(edge.from)).filter(Boolean);
        const music = candidates.filter((source) => source.role === 'music').at(-1);
        const seenSfx = new Set();
        const sfx = candidates.filter((source) => {
            if (source.role !== 'sfx') return false;
            const key = `${source.type}:${source.id}`;
            if (seenSfx.has(key)) return false;
            seenSfx.add(key);
            return true;
        });
        return [...(music ? [music] : []), ...sfx];
    }
    #audioSourceOf(node) {
        if (node?.type !== 'audio' || !node.data?.audioType || !node.data?.audioId) return null;
        return {
            type: node.data.audioType === 'playlist' ? 'playlist' : 'track',
            id: node.data.audioId,
            role: node.data.audioRole === 'sfx' ? 'sfx' : 'music',
            loop: this.#loopOfNode(node),
        };
    }
    /** Repetição do nó: o `loop` gravado manda; sem ele, música repete e SFX toca uma vez. */
    #loopOfNode(node) {
        const role = node?.data?.audioRole === 'sfx' ? 'sfx' : 'music';
        if (node?.data?.loop === undefined || node?.data?.loop === null) return role !== 'sfx';
        return node.data.loop !== false;
    }
    #isAudioPlaying(source) {
        return !!LumennCompat.resolveAudioDoc(source)?.playing;
    }
    async #playAudioNode(id) {
        if (this.#transitioning || !LumennCompat.isGM()) return;
        const graph = this.#graph();
        const node = graph?.nodes?.find((n) => n.id === id);
        if (node?.type === 'encounter') return this.#playEncounter(graph, node);
        const source = this.#audioSourceOf(node);
        if (!source) return;
        if (!LumennCompat.resolveAudioDoc(source)) {
            ui.notifications.warn(game.i18n.localize('LUMENN_FRAME.WarnInvalidAudioSource'));
            return;
        }
        const fallbackDuration = LumennGraphStore.getDefaultCrossfadeDuration();
        const edges = (graph.edges ?? []).filter((e) => e.type === 'audio' && e.from === id);
        const edge = edges.find((e) => e.to === graph.activeNodeId) ?? edges[0];
        const cfg = {
            curve: 'linear',
            ...(edge?.transition?.audio ?? {}),
        };
        const isSfx = source.role === 'sfx';
        const crossfade = cfg.crossfadeDuration ?? fallbackDuration;
        const duration = isSfx ? (cfg.fadeInDuration ?? 0) : crossfade;
        const playing = this.#isAudioPlaying(source);
        let audioTrans;
        let current;
        if (playing) {
            audioTrans = {
                mode: 'fadeout',
                crossfadeDuration: duration,
                curve: cfg.curve,
            };
            current = [source];
        } else {
            const mode = cfg.mode === 'cut' || cfg.mode === 'fadein' ? cfg.mode : 'crossfade';
            audioTrans = {
                mode,
                crossfadeDuration: duration,
                curve: cfg.curve,
            };
            current = isSfx
                ? []
                : this.#allAudioSources(graph).filter(
                      (s) => s.role === 'music' && !(s.type === source.type && s.id === source.id)
                  );
        }
        const result = await this.#controller.goToAudio(
            current,
            playing ? [] : [source],
            audioTrans,
            fallbackDuration,
            cfg.curve
        );
        if (result === 'invalid-source')
            ui.notifications.warn(game.i18n.localize('LUMENN_FRAME.WarnInvalidAudioSource'));
        await this.render();
    }
    #allAudioSources(graph) {
        const sources = [];
        const seen = new Set();
        for (const node of graph?.nodes ?? []) {
            if (node.type !== 'audio' || !node.data?.audioType || !node.data?.audioId) continue;
            const source = {
                type: node.data.audioType === 'playlist' ? 'playlist' : 'track',
                id: node.data.audioId,
                role: node.data.audioRole === 'sfx' ? 'sfx' : 'music',
                loop: this.#loopOfNode(node),
            };
            const key = `${source.role}:${source.type}:${source.id}`;
            if (seen.has(key)) continue;
            seen.add(key);
            sources.push(source);
        }
        return sources;
    }
    #audioTransitionFor(graph, flowEdge) {
        const base = {
            mode: 'auto',
            crossfadeDuration: LumennGraphStore.getDefaultCrossfadeDuration(),
            fadeInDuration: 0,
            fadeOutDuration: 0,
            curve: 'linear',
            ...(flowEdge.transition?.audio ?? {}),
        };
        for (const audioEdge of graph?.edges ?? []) {
            if (audioEdge.type !== 'audio' || audioEdge.to !== flowEdge.to) continue;
            Object.assign(base, audioEdge.transition?.audio ?? {});
        }
        return base;
    }
    /** Áudio que pode estar tocando agora: o de todos os níveis da trilha, não só do storyboard exibido. */
    #currentAudioSources(graph) {
        const ids = new Set([graph?.id, ...this.#trail.map((level) => level.graphId)]);
        const sources = [];
        const seen = new Set();
        for (const id of ids) {
            for (const source of this.#allAudioSources(LumennGraphStore.getGraph(id))) {
                const key = `${source.role}:${source.type}:${source.id}`;
                if (seen.has(key)) continue;
                seen.add(key);
                sources.push(source);
            }
        }
        return sources;
    }
    /** Grava a sala ativa onde ela mora: na trilha (dentro de uma Hive) ou no storyboard. */
    async #commitActive(graph, id) {
        if (this.#hiveLevel(graph.id)) {
            this.#trail = setNavigationNode(this.#trail, graph.id, id);
            await this.#saveTrail();
        } else {
            await LumennGraphStore.setActiveNode(graph.id, id);
            if (this.#trail.length) this.#trail = setNavigationNode(this.#trail, graph.id, id);
        }
    }
    /**     * Troca de cena + áudio. Tipo `film:*` roda só na tela dos jogadores (socket); o mestre não     * escurece. `audioTrans.mode === "none"` deixa a música como está.     */
    async #playTransition({
        scene,
        scope,
        sceneTrans,
        audioTrans,
        currentSources,
        targetSources,
        commit,
        film = null,
    }) {
        this.#transitioning = true;
        await this.render();
        const effect = filmEffectOf(sceneTrans?.type);
        const filmPayload = effect
            ? {
                  type: 'film',
                  effect,
                  duration: sceneTrans.duration,
                  color: normalizeHexColor(sceneTrans.color, '#000000'),
                  ...filmTitle(sceneTrans, {
                      caption: film?.caption ?? '',
                      subtitle: film?.subtitle ?? '',
                  }),
                  src: sceneTrans.video?.src || (effect === 'video' ? DEFAULT_STINGER : ''),
                  cutAt: sceneTrans.video?.cutAt,
                  sound: sceneTrans.video?.sound === true,
              }
            : null;
        try {
            if (filmPayload) {
                if (effect === 'video') {
                    // Pré-carga: os jogadores baixam o vídeo antes; o mestre espera a confirmação (até 3 s).
                    LumennCompat.socketEmit({
                        type: 'film-prepare',
                        src: filmPayload.src,
                    });
                    await waitPlayersReady(
                        filmPayload.src,
                        game.users.filter((u) => u.active && !u.isGM).map((u) => u.id)
                    );
                }
                LumennCompat.socketEmit({
                    ...filmPayload,
                    phase: 'in',
                });
                await new Promise((r) =>
                    setTimeout(r, filmCutPoint(effect, filmPayload.duration, filmPayload.cutAt))
                );
                sceneTrans = {
                    type: 'cut',
                    duration: 0,
                };
            }
            LumennCompat.socketEmit({
                type: 'transition:start',
                sceneId: scene?.id ?? null,
                sceneTrans,
                audioTrans,
                scope,
            });
            const sameScene = scene?.id && canvas.scene?.id === scene.id;
            const sceneTask =
                (scope === 'scene' || scope === 'both') && scene
                    ? (async () => {
                          if (sameScene) {
                              if (LumennCompat.isGM() && !scene.active)
                                  await LumennCompat.activateScene(
                                      scene,
                                      {
                                          transition: {
                                              type: null,
                                          },
                                      },
                                      {
                                          suppressScenePlaylist: true,
                                      }
                                  );
                              return;
                          }
                          const scResult = await LumennCompat.runSceneTransition({
                              scene,
                              type: sceneTrans.type ?? 'cut',
                              duration: sceneTrans.duration ?? 1e3,
                              color: normalizeHexColor(sceneTrans.color, '#000000'),
                              playersTransition: LumennSettings.get('playerSceneFade'),
                          });
                          if (scResult === 'fallback') {
                              ui.notifications.warn(
                                  game.i18n.localize('LUMENN_FRAME.WarnSceneTransitionFallback')
                              );
                              await lumennClientSceneFade(scene.id, sceneTrans);
                          }
                      })()
                    : null;
            const touchAudio =
                (scope === 'audio' || scope === 'both') && audioTrans?.mode !== 'none';
            const audioTask = touchAudio
                ? this.#controller.goToAudio(
                      currentSources,
                      targetSources,
                      audioTrans,
                      LumennGraphStore.getDefaultCrossfadeDuration(),
                      audioTrans?.curve ?? 'linear'
                  )
                : null;
            const [, audioResult] = await Promise.all([sceneTask, audioTask]);
            if (audioResult === 'invalid-source')
                ui.notifications.warn(game.i18n.localize('LUMENN_FRAME.WarnInvalidAudioSource'));
            await commit();
            LumennCompat.socketEmit({
                type: 'transition:end',
            });
        } finally {
            if (filmPayload)
                LumennCompat.socketEmit({
                    ...filmPayload,
                    phase: 'out',
                });
            this.#transitioning = false;
            await this.render();
        }
    }
    async #navigateTo(id) {
        if (this.#transitioning) return;
        const graph = this.#graph();
        const edge = linkBetween(graph?.edges, graph?.activeNodeId, id, { types: ['flow', 'audio'] });
        if (!edge) return;
        const target = graph.nodes.find((n) => n.id === id);
        if (target?.type === 'hive-ref')
            return edge.type === 'flow' ? this.#enterHive(graph, edge, target) : undefined;
        const scope =
            edge.type === 'audio'
                ? 'audio'
                : ['audio', 'scene', 'both'].includes(edge.transition?.scope)
                  ? edge.transition.scope
                  : 'both';
        await this.#playTransition({
            scene: target?.data?.sceneId ? game.scenes.get(target.data.sceneId) : null,
            scope,
            sceneTrans: edge.transition?.scene ?? {
                type: 'cut',
                duration: 0,
            },
            audioTrans: this.#audioTransitionFor(graph, edge),
            currentSources: this.#currentAudioSources(graph),
            targetSources: this.#audioSourcesFor(graph, id),
            film: {
                caption: this.#nodeLabel(target),
                subtitle: LumennGraphStore.getGraph(graph.id)?.name ?? '',
            },
            commit: () => this.#commitActive(graph, id),
        });
    }
    /**     * Salto direto: qualquer nó para qualquer nó, sem aresta e sem nó intermediário.     * A trilha é montada de uma vez pela cadeia de `hive-ref`; a transição é única.     * Não cria link, não mexe em portas e não usa aresta como pré-requisito.     */
    async #jumpTo(graphId, nodeId = null) {
        if (!LumennCompat.isGM() || this.#transitioning) return;
        const graphs = LumennGraphStore.getAll();
        const plan = planJump(graphs, graphId, nodeId);
        if (plan.status !== 'found') return void this.#warnJump(plan);
        const target = graphs.find((graph) => graph.id === plan.graphId);
        const landing = target?.nodes?.find((n) => n.id === plan.nodeId) ?? null;
        if (!target || !landing)
            return void ui.notifications.warn(game.i18n.localize('LUMENN_FRAME.Warn.NeuralGone'));
        if (this.#mode !== 'live') {
            if (plan.graphId !== this.#graphId) await this.#switchGraph(plan.graphId);
            this.#selected = {
                kind: 'node',
                id: plan.nodeId,
            };
            this.#focusNode(plan.nodeId);
            return;
        }
        const current = this.#graph();
        if (plan.kind === 'audio' || plan.kind === 'encounter') {
            await this.#applyTrail(
                this.#jumpTrail(plan.graphId, plan.nodeId, true, graphs),
                plan.graphId
            );
            this.#selected = {
                kind: 'node',
                id: plan.nodeId,
            };
            if (plan.kind === 'encounter') await this.#playEncounter(target, landing);
            else await this.#playAudioNode(plan.nodeId);
            return;
        }
        if (plan.kind === 'note' || plan.kind === 'group') {
            await this.#applyTrail(
                this.#jumpTrail(plan.graphId, plan.nodeId, true, graphs),
                plan.graphId
            );
            this.#selected = {
                kind: 'node',
                id: plan.nodeId,
            };
            return void this.render();
        }
        if (plan.graphId === this.#graphId && plan.nodeId === current?.activeNodeId) return;
        if (plan.kind === 'hive-entry') {
            const pending = listHivePending(target, this.#worldChecks());
            if (pending.length) {
                const items = pending
                    .map(
                        (item) =>
                            item.name ??
                            this.#nodeLabel(target.nodes.find((n) => n.id === item.nodeId))
                    )
                    .join(', ');
                return void ui.notifications.warn(
                    game.i18n.format('LUMENN_FRAME.Warn.HivePending', {
                        items,
                    })
                );
            }
        }
        const trail = this.#jumpTrail(plan.graphId, plan.nodeId, false, graphs);
        const cfg =
            plan.kind === 'hive-entry' && target.hive?.transition
                ? normalizeHiveTransition(
                      target.hive.transition,
                      DEFAULT_HIVE_TRANSITIONS.transition
                  )
                : this.#jumpTransition(current, plan);
        const scope = ['audio', 'scene', 'both'].includes(cfg.scope) ? cfg.scope : 'both';
        await this.#playTransition({
            scene: landing.data?.sceneId ? game.scenes.get(landing.data.sceneId) : null,
            scope,
            sceneTrans: cfg.scene,
            audioTrans:
                cfg.audio?.mode === 'none'
                    ? cfg.audio
                    : this.#audioTransitionFor(target, {
                          to: plan.nodeId,
                          transition: cfg,
                      }),
            currentSources: this.#currentAudioSources(current),
            targetSources: this.#audioSourcesFor(target, plan.nodeId),
            film:
                cfg.caption === false
                    ? null
                    : {
                          caption: this.#nodeLabel(landing),
                          subtitle: target.name ?? '',
                      },
            commit: async () => {
                await this.#applyTrail(trail, plan.graphId, plan.nodeId);
                if (target) await this.#commitActive(target, plan.nodeId);
            },
        });
    }
    /** Transição do salto: a aresta configurada entre origem e destino, ou a padrão. */
    #jumpTransition(graph, plan) {
        const edge = linkBetween(graph?.edges, graph?.activeNodeId, plan.nodeId);
        const defaults = LumennSettings.getTransitionDefaults();
        const base = {
            scope: 'both',
            caption: true,
            scene: {
                type: defaults.sceneType,
                duration: defaults.sceneDuration,
                color: defaults.dipColor,
            },
            audio: {
                mode: defaults.audioMode,
                crossfadeDuration: defaults.crossfade,
                fadeInDuration: defaults.fadeIn,
                fadeOutDuration: defaults.fadeOut,
                curve: defaults.curve,
            },
        };
        if (!edge?.transition) return base;
        return {
            ...base,
            ...edge.transition,
            scope: ['audio', 'scene', 'both'].includes(edge.transition.scope)
                ? edge.transition.scope
                : 'both',
            scene: {
                ...base.scene,
                ...(edge.transition.scene ?? {}),
            },
            audio: {
                ...base.audio,
                ...(edge.transition.audio ?? {}),
            },
        };
    }
    /**     * Trilha do salto montada de uma vez: raiz até o grafo de destino, um nível por     * `hive-ref`, com a porta de entrada de cada Hive. Nenhuma cena intermediária roda.     */
    #jumpTrail(graphId, nodeId, keepActive = false, graphs = LumennGraphStore.getAll()) {
        const chain = [];
        const seen = new Set();
        let id = graphId;
        while (id && !seen.has(id)) {
            seen.add(id);
            chain.unshift(id);
            id = LumennGraphStore.parentGraphId(id, graphs);
        }
        const root = graphs.find((graph) => graph.id === chain[0]);
        let trail = createNavigationTrail(chain[0], root?.activeNodeId ?? null);
        for (let i = 1; i < chain.length; i++) {
            const parent = graphs.find((graph) => graph.id === chain[i - 1]);
            const child = graphs.find((graph) => graph.id === chain[i]);
            if (!parent || !child) break;
            const ref =
                (parent.nodes ?? []).find(
                    (n) => n.type === 'hive-ref' && n.data?.graphId === child.id
                ) ?? null;
            const port = hiveEntryPort(child, ref?.data?.portId ?? null);
            trail = pushNavigationLevel(trail, {
                graphId: child.id,
                activeNodeId: port?.node?.id ?? child.activeNodeId ?? null,
                viaPortId: port?.id ?? null,
                refNodeId: ref?.id ?? null,
                fromNodeId: parent.activeNodeId ?? null,
            });
        }
        const landing = graphs.find((graph) => graph.id === graphId);
        return keepActive
            ? setNavigationNode(
                  trail,
                  graphId,
                  this.#hiveLevel(graphId)?.activeNodeId ?? landing?.activeNodeId ?? null
              )
            : setNavigationNode(trail, graphId, nodeId);
    }
    /** Aplica a trilha e o grafo do salto numa escrita só; persiste para sobreviver ao F5. */
    async #applyTrail(trail, graphId, activeNodeId = null) {
        this.#trail = trail;
        this.#graphId = graphId;
        if (activeNodeId) this.#trail = setNavigationNode(this.#trail, graphId, activeNodeId);
        this.#selected = {
            kind: null,
            id: null,
        };
        this.#collapsedGroups.clear();
        this.#lockedGroups.clear();
        this.#fitPending = true;
        await this.#saveTrail();
    }
    #warnJump(plan) {
        const L = (k) => game.i18n.localize(k);
        if (plan.status === 'missing-hive')
            return void ui.notifications.warn(
                L(
                    plan.reason === 'not-hive'
                        ? 'LUMENN_FRAME.Warn.HiveNotHive'
                        : 'LUMENN_FRAME.Warn.HiveMissing'
                )
            );
        if (plan.status === 'no-entry')
            return void ui.notifications.warn(L('LUMENN_FRAME.Warn.HiveNoEntry'));
        if (plan.status === 'empty')
            return void ui.notifications.warn(L('LUMENN_FRAME.Warn.NeuralEmpty'));
        ui.notifications.warn(L('LUMENN_FRAME.Warn.NeuralGone'));
    }
    /** Botão INTRO/OUTPUT do topo: resolve a âncora na raiz e salta. */
    async #jumpAnchor(kind) {
        if (!LumennCompat.isGM()) return;
        const L = (k) => game.i18n.localize(k);
        const anchor = LumennGraphStore.anchorOf(this.#graphId, kind);
        if (anchor.status === 'not-set')
            return void ui.notifications.warn(
                game.i18n.format('LUMENN_FRAME.Warn.NeuralNoAnchor', {
                    kind: L(
                        kind === 'intro'
                            ? 'LUMENN_FRAME.Neural.Intro'
                            : 'LUMENN_FRAME.Neural.Output'
                    ),
                })
            );
        if (anchor.status !== 'found')
            return void ui.notifications.warn(L('LUMENN_FRAME.Warn.NeuralAnchorGone'));
        return this.#jumpTo(anchor.graphId, anchor.nodeId);
    }
    /** Inspector na seção de transição: aresta ativa→nó, senão a primeira que toca o nó. */
    #configureNodeTransition(node) {
        const graph = this.#graph();
        const edges = graph?.edges ?? [];
        const edge =
            linkBetween(edges, graph.activeNodeId, node.id) ??
            edges.find((e) => e.type === 'flow' && e.from === node.id) ??
            edges.find((e) => e.type === 'flow' && e.to === node.id) ??
            null;
        if (!edge)
            return void ui.notifications.warn(
                game.i18n.localize('LUMENN_FRAME.Warn.NeuralNoTransition')
            );
        this.#selected = {
            kind: 'edge',
            id: edge.id,
        };
        this.render();
    }
    async #copyNodeAddress(node) {
        const entry = LumennGraphStore.resolveAddress(node.id, (candidate) =>
            this.#nodeLabel(candidate)
        );
        if (entry.status !== 'found')
            return void ui.notifications.warn(game.i18n.localize('LUMENN_FRAME.Warn.NeuralGone'));
        try {
            if (game.clipboard?.copyPlainText) await game.clipboard.copyPlainText(entry.address);
            else await navigator.clipboard.writeText(entry.address);
            ui.notifications.info(
                game.i18n.format('LUMENN_FRAME.Info.NeuralCopied', {
                    address: entry.address,
                })
            );
        } catch {
            ui.notifications.warn(
                game.i18n.format('LUMENN_FRAME.Warn.NeuralCopyFailed', {
                    address: entry.address,
                })
            );
        }
    }
    #closeNodeMenu() {
        this.#contextCleanup?.();
        this.#contextCleanup = null;
        this.#contextMenu?.remove();
        this.#contextMenu = null;
    }
    #openNodeMenu(event, node) {
        if (!LumennCompat.isGM()) return;
        this.#closeNodeMenu();
        const L = (k) => game.i18n.localize(k);
        const rootId = LumennGraphStore.rootGraphId(this.#graphId);
        const anchors = LumennGraphStore.getGraph(rootId)?.anchors ?? {};
        const items = [
            {
                action: 'enter',
                icon: 'fa-arrow-right-to-bracket',
                label: L('LUMENN_FRAME.Neural.EnterNow'),
            },
            {
                action: 'transition',
                icon: 'fa-sliders',
                label: L('LUMENN_FRAME.Neural.ConfigureTransition'),
            },
        ];
        if (rootId === this.#graphId) {
            items.push({
                action: 'intro',
                icon: 'fa-flag',
                label: L(
                    anchors.intro === node.id
                        ? 'LUMENN_FRAME.Neural.ClearIntro'
                        : 'LUMENN_FRAME.Neural.SetIntro'
                ),
            });
            items.push({
                action: 'output',
                icon: 'fa-flag-checkered',
                label: L(
                    anchors.output === node.id
                        ? 'LUMENN_FRAME.Neural.ClearOutput'
                        : 'LUMENN_FRAME.Neural.SetOutput'
                ),
            });
        }
        if (node.type === 'hive-ref' && this.#editable())
            items.push({
                action: 'hive',
                icon: 'fa-cubes',
                label: L('LUMENN_FRAME.Neural.OpenHive'),
            });
        items.push(
            {
                action: 'copy',
                icon: 'fa-link',
                label: L('LUMENN_FRAME.Neural.CopyAddress'),
            },
            {
                action: 'hud',
                icon: 'fa-diagram-project',
                label: L('LUMENN_FRAME.Neural.OpenHud'),
            }
        );
        const menu = document.createElement('div');
        menu.className = 'lf-context-menu';
        menu.setAttribute('role', 'menu');
        menu.append(
            ...items.map((item) => {
                const button = document.createElement('button');
                button.type = 'button';
                button.dataset.menuAction = item.action;
                button.setAttribute('role', 'menuitem');
                const icon = document.createElement('i');
                icon.className = `fa-solid ${item.icon}`;
                button.append(icon, document.createTextNode(` ${item.label}`));
                return button;
            })
        );
        document.body.append(menu);
        const rect = menu.getBoundingClientRect();
        menu.style.left = `${Math.max(8, Math.min(event.clientX, window.innerWidth - rect.width - 8))}px`;
        menu.style.top = `${Math.max(8, Math.min(event.clientY, window.innerHeight - rect.height - 8))}px`;
        menu.addEventListener('click', (click) => {
            const button = click.target.closest('[data-menu-action]');
            if (!button) return;
            this.#closeNodeMenu();
            this.#nodeMenuAction(button.dataset.menuAction, node);
        });
        const outside = (click) => {
            if (!menu.contains(click.target)) this.#closeNodeMenu();
        };
        const escape = (key) => {
            if (key.key !== 'Escape') return;
            key.preventDefault();
            this.#closeNodeMenu();
        };
        document.addEventListener('pointerdown', outside, true);
        document.addEventListener('keydown', escape, true);
        this.#contextCleanup = () => {
            document.removeEventListener('pointerdown', outside, true);
            document.removeEventListener('keydown', escape, true);
        };
        this.#contextMenu = menu;
    }
    async #nodeMenuAction(action, node) {
        if (action === 'enter') return this.#jumpTo(this.#graphId, node.id);
        if (action === 'transition') return this.#configureNodeTransition(node);
        if (action === 'intro' || action === 'output') {
            const L = (k) => game.i18n.localize(k);
            if (LumennGraphStore.rootGraphId(this.#graphId) !== this.#graphId)
                return void ui.notifications.warn(L('LUMENN_FRAME.Warn.NeuralAnchorRoot'));
            const current = LumennGraphStore.getGraph(this.#graphId)?.anchors?.[action] ?? null;
            const next = current === node.id ? null : node.id;
            const saved = await LumennGraphStore.setAnchor(this.#graphId, action, next);
            if (!saved) return void ui.notifications.warn(L('LUMENN_FRAME.Warn.NeuralAnchorRoot'));
            ui.notifications.info(
                game.i18n.format(
                    next
                        ? 'LUMENN_FRAME.Info.NeuralAnchorSet'
                        : 'LUMENN_FRAME.Info.NeuralAnchorCleared',
                    {
                        kind: L(
                            action === 'intro'
                                ? 'LUMENN_FRAME.Neural.Intro'
                                : 'LUMENN_FRAME.Neural.Output'
                        ),
                        name: this.#nodeLabel(node),
                    }
                )
            );
            return this.render();
        }
        if (action === 'hive') return this.#hiveEnterButton(node.id);
        if (action === 'copy') return this.#copyNodeAddress(node);
        if (action === 'hud') return this.#openDestinations();
    }
    /** HUD de Destinos (GM): janela própria, uma instância por app. */
    async #openDestinations() {
        if (!LumennCompat.isGM()) return;
        if (this.#destinationsHud?.rendered) return void this.#destinationsHud.bringToFront();
        const labelOf = (candidate) => this.#nodeLabel(candidate);
        const hud = new LumennNeuralHud({
            entries: () =>
                LumennGraphStore.listDestinations({
                    excludeGraphId: this.#graphId,
                    labelOf,
                }),
            current: () => {
                const here = LumennGraphStore.resolveAddress(this.#graphId, labelOf);
                const graph = LumennGraphStore.getGraph(this.#graphId);
                return {
                    graphId: this.#graphId,
                    title: graph?.name ?? '',
                    address: here.status === 'found' ? here.address : '',
                };
            },
            // Só nós de cena com Scene existente podem ser pré-carregados.
            sceneIdOf: (entry) => {
                if (!entry?.nodeId) return '';
                const node = LumennGraphStore.getGraph(entry.graphId)?.nodes?.find(
                    (candidate) => candidate.id === entry.nodeId
                );
                const sceneId = node?.data?.sceneId ?? '';
                return sceneId && game.scenes.get(sceneId) ? sceneId : '';
            },
            preloads: this.#preloads,
            relations: () => graphRelations(LumennGraphStore.getAll(), this.#graphId, parentGraphId),
            recentIds: () => {
                const list = LumennSettings.get('recentDestinations');
                return Array.isArray(list) ? list : [];
            },
            remember: (id) => {
                const list = LumennSettings.get('recentDestinations');
                void LumennSettings.set('recentDestinations', pushRecent(Array.isArray(list) ? list : [], id));
            },
            enter: (entry) => {
                const plan = planJump(LumennGraphStore.getAll(), entry.graphId, entry.nodeId);
                if (plan.status !== 'found') return this.#warnJump(plan);
                return this.#jumpTo(plan.graphId, plan.nodeId);
            },
            onClosed: () => {
                if (this.#destinationsHud === hud) this.#destinationsHud = null;
                this.#focusViewport();
            },
        });
        this.#destinationsHud = hud;
        await hud.render({
            force: true,
        });
    }
    #onPreloadChange(sceneId, state, error) {
        this.#destinationsHud?.paintScene(sceneId, state);
        if (state !== 'error') return;
        const name = game.scenes.get(sceneId)?.name ?? sceneId;
        console.error('Lumenn Frame: pré-load falhou.', error);
        ui.notifications.warn(
            game.i18n.format('LUMENN_FRAME.Warn.NeuralPreloadFailed', {
                name,
            })
        );
    }
    /** "Onde estou": o modelo puro do contexto neural, já com os textos da interface. */
    #neuralView(activeGraph) {
        if (!activeGraph?.id)
            return {
                found: false,
            };
        const L = (key) => game.i18n.localize(key);
        const ctx = buildNeuralContext(LumennGraphStore.getAll(), activeGraph.id, {
            labelOf: (node) => this.#nodeLabel(node),
        });
        if (!ctx.found) return ctx;
        const kindKey = `LUMENN_FRAME.Neural.Kind.${ctx.kind}`;
        const anchorText = (anchor) =>
            anchor.status === 'found'
                ? anchor.here
                    ? anchor.name
                    : `${anchor.name} · ${L('LUMENN_FRAME.Neural.InAnotherLevel')}`
                : L('LUMENN_FRAME.Neural.AnchorUnset');
        return {
            ...ctx,
            isHive: ctx.kind !== 'storyboard',
            kindLabel: game.i18n.has(kindKey) ? L(kindKey) : ctx.kind,
            introSet: ctx.anchors.intro.status === 'found',
            outputSet: ctx.anchors.output.status === 'found',
            introText: anchorText(ctx.anchors.intro),
            outputText: anchorText(ctx.anchors.output),
            destinationsText: game.i18n.format('LUMENN_FRAME.Neural.DestinationsCount', {
                count: ctx.destinations,
            }),
        };
    }
    /** Foco de volta ao canvas depois de fechar o HUD ou o menu. */
    #focusViewport() {
        const viewport = this.element?.querySelector('.lf-viewport');
        if (!viewport) return;
        if (!viewport.hasAttribute('tabindex')) viewport.setAttribute('tabindex', '-1');
        viewport.focus({
            preventScroll: true,
        });
    }
    /** Zoom de câmera para dentro do nó antes de trocar de storyboard (efeito de "entrar"). */
    async #zoomInto(nodeId) {
        const root = this.element;
        const camEl = root?.querySelector('.lf-camera');
        const viewport = root?.querySelector('.lf-viewport');
        const bounds = this.#nodeBounds(nodeId, null, this.#graph());
        if (!camEl || !viewport || !bounds) return;
        const target = focusCameraOnBounds(
            this.#camera,
            {
                width: viewport.clientWidth,
                height: viewport.clientHeight,
            },
            bounds,
            clampGraphZoom(Math.max(this.#camera.zoom * 2.5, 2.5))
        );
        camEl.style.transition = 'transform 420ms cubic-bezier(.6,0,.9,.4), opacity 420ms ease-in';
        this.#camera = target;
        this.#applyCamera(root);
        camEl.style.opacity = '0';
        await new Promise((r) => setTimeout(r, 430));
        this.#cameraFadeIn = true;
    }
    /** Entra na Hive pela porta, com a transição de entrada dela. `edge` pode faltar (botão Entrar). */
    async #enterHive(graph, edge, refNode) {
        const L = (k) => game.i18n.localize(k);
        const hive = LumennGraphStore.getGraph(refNode.data?.graphId);
        if (!hive) return void ui.notifications.warn(L('LUMENN_FRAME.Warn.HiveMissing'));
        if (!hive.isHive) return void ui.notifications.warn(L('LUMENN_FRAME.Warn.HiveNotHive'));
        const port = hiveEntryPort(hive, edge?.portId ?? refNode.data?.portId);
        if (!port?.node) return void ui.notifications.warn(L('LUMENN_FRAME.Warn.HiveNoEntry'));
        const pending = listHivePending(hive, this.#worldChecks());
        if (pending.length) {
            const items = pending
                .map(
                    (item) =>
                        item.name ?? this.#nodeLabel(hive.nodes.find((n) => n.id === item.nodeId))
                )
                .join(', ');
            return void ui.notifications.warn(
                game.i18n.format('LUMENN_FRAME.Warn.HivePending', {
                    items,
                })
            );
        }
        const cfg = hive.hive?.transition
            ? normalizeHiveTransition(hive.hive.transition, DEFAULT_HIVE_TRANSITIONS.transition)
            : {
                  ...normalizeHiveTransition(null, DEFAULT_HIVE_TRANSITIONS.transition),
                  ...(edge?.transition ?? {}),
              };
        const scope = ['audio', 'scene', 'both'].includes(cfg.scope) ? cfg.scope : 'both';
        await this.#zoomInto(refNode.id);
        await this.#playTransition({
            scene: port.node.data?.sceneId ? game.scenes.get(port.node.data.sceneId) : null,
            scope,
            sceneTrans: cfg.scene,
            audioTrans:
                cfg.audio?.mode === 'none'
                    ? cfg.audio
                    : this.#audioTransitionFor(hive, {
                          ...(edge ?? {}),
                          to: port.node.id,
                          transition: cfg,
                      }),
            currentSources: this.#currentAudioSources(graph),
            targetSources: this.#audioSourcesFor(hive, port.node.id),
            film:
                cfg.caption === false
                    ? null
                    : {
                          caption: hive.name,
                          subtitle: port.name,
                      },
            commit: async () => {
                const fromNodeId = graph.activeNodeId;
                await this.#commitActive(graph, refNode.id);
                this.#trail = pushNavigationLevel(this.#trail, {
                    graphId: hive.id,
                    activeNodeId: port.node.id,
                    viaPortId: port.id,
                    refNodeId: refNode.id,
                    fromNodeId,
                });
                this.#graphId = hive.id;
                this.#selected = {
                    kind: null,
                    id: null,
                };
                this.#collapsedGroups.clear();
                this.#lockedGroups.clear();
                this.#fitPending = true;
                await this.#saveTrail();
            },
        });
    }
    /**     * Sai da Hive. Com porta de saída ligada no pai (aresta com `exitPortId`), vai direto para o destino     * dela; sem destino, volta ao nó Hive. Padrão: cutscene de filme só nos jogadores, música intocada.     */
    async #exitHive(portId = null) {
        if (this.#transitioning || !LumennCompat.isGM() || this.#trail.length < 2) return;
        const level = this.#trail.at(-1);
        const parentLevel = this.#trail.at(-2);
        const hive = LumennGraphStore.getGraph(level.graphId);
        const parent = LumennGraphStore.getGraph(parentLevel.graphId);
        const ref = parent?.nodes?.find((n) => n.id === level.refNodeId) ?? null;
        const roomPorts = hiveExitPortsAt(hive, level.activeNodeId);
        const port = portId
            ? ((hive?.hive?.ports ?? []).find((p) => p.id === portId) ?? null)
            : roomPorts.length === 1
              ? roomPorts[0]
              : null;
        const exitEdge = ref ? resolveHiveExitEdge(parent, ref.id, port?.id ?? null) : null;
        const target = exitEdge ? (parent.nodes.find((n) => n.id === exitEdge.to) ?? null) : null;
        const cfg = normalizeHiveTransition(hive?.hive?.exit, DEFAULT_HIVE_TRANSITIONS.exit);
        const resume = parent && ref ? this.#audioSourcesFor(parent, ref.id) : [];
        const fallback = resume.length
            ? resume
            : parent && level.fromNodeId
              ? this.#audioSourcesFor(parent, level.fromNodeId)
              : [];
        if (this.#mode === 'live') this.#cameraFadeIn = true;
        await this.#playTransition({
            scene: target?.data?.sceneId ? game.scenes.get(target.data.sceneId) : null,
            scope: target ? 'both' : 'audio',
            sceneTrans: cfg.scene,
            audioTrans: cfg.audio,
            currentSources: this.#currentAudioSources(hive),
            targetSources: target ? this.#audioSourcesFor(parent, target.id) : fallback,
            film:
                cfg.caption === false
                    ? null
                    : {
                          caption: target ? this.#nodeLabel(target) : (parent?.name ?? ''),
                          subtitle:
                              port?.name && target && port.name !== this.#nodeLabel(target)
                                  ? port.name
                                  : (hive?.name ?? ''),
                      },
            commit: async () => {
                this.#trail = popNavigationLevel(this.#trail).trail;
                this.#graphId = parentLevel.graphId;
                this.#selected = {
                    kind: null,
                    id: null,
                };
                this.#fitPending = true;
                if (target) await this.#commitActive(this.#graph(), target.id);
                await this.#saveTrail();
            },
        });
    }
    /** Troca o storyboard exibido como num seletor de fases: guarda histórico, limpa trilha e seleção. */
    #switchGraph(graphId, record = true) {
        if (!graphId || !LumennGraphStore.getGraph(graphId)) return;
        if (record && graphId !== this.#graphId) {
            if (this.#graphId) this.#history.push(this.#graphId);
            this.#future = [];
        }
        this.#graphId = graphId;
        this.#browserOpen = false;
        this.#resetTrail();
        this.#editStack = [];
        this.#collapsedGroups.clear();
        this.#lockedGroups.clear();
        this.#selected = {
            kind: null,
            id: null,
        };
        this.#fitPending = true;
        this.#cameraFadeIn = true;
        return this.render();
    }
    #graphThumb(graph) {
        for (const node of graph?.nodes ?? []) {
            if (node.type !== 'scene' || !node.data?.sceneId) continue;
            const scene = game.scenes.get(node.data.sceneId);
            const src = scene?.thumbnail || LumennCompat.sceneBackgroundSrc(scene);
            if (src) return src;
        }
        return null;
    }
    #browserView(graphs, currentId) {
        const filter = this.#browserFilter;
        const cards = graphs
            .filter((g) => filter === 'all' || (filter === 'hives' ? g.isHive : !g.isHive))
            .map((g) => ({
                id: g.id,
                name: g.name,
                isHive: g.isHive === true,
                isCurrent: g.id === currentId,
                scenes: (g.nodes ?? []).filter((n) => n.type === 'scene').length,
                thumb: this.#graphThumb(g),
            }));
        return {
            open: this.#browserOpen,
            cards,
            tabs: ['all', 'boards', 'hives'].map((id) => ({
                id,
                active: id === filter,
            })),
        };
    }
    /** Grupo vira Hive: salas viram um storyboard inteiro, o Grupo vira um nó só com portas automáticas. */
    async #groupToHive(groupId) {
        const L = (k) => game.i18n.localize(k);
        const group = LumennGraphStore.getNode(this.#graphId, groupId);
        if (group?.type !== 'group') return;
        const ok = await foundry.applications.api.DialogV2.confirm({
            window: {
                title: L('LUMENN_FRAME.Group.ToHive'),
            },
            content: `<p>${L('LUMENN_FRAME.Group.ToHiveConfirm')}</p>`,
            rejectClose: false,
        });
        if (!ok) return;
        const plan = await LumennGraphStore.convertGroupToHive(this.#graphId, groupId, (node) =>
            this.#nodeLabel(node)
        );
        if (!plan) return void ui.notifications.warn(L('LUMENN_FRAME.Warn.GroupEmpty'));
        ui.notifications.info(
            game.i18n.format('LUMENN_FRAME.Info.GroupToHive', {
                name: plan.hive.name,
                entries: plan.entries.length,
                exits: plan.exits.length,
            })
        );
        this.#selected = {
            kind: 'node',
            id: plan.refNode.id,
        };
        this.#fitPending = true;
        this.render();
    }
    /** Botão Entrar do card: na Edição abre a Hive por dentro; no Ao Vivo entra nela. */
    async #hiveEnterButton(refNodeId) {
        const graph = this.#graph();
        const ref = graph?.nodes?.find((n) => n.id === refNodeId);
        if (!ref || ref.type !== 'hive-ref') return;
        if (this.#mode === 'live') {
            if (this.#transitioning || !LumennCompat.isGM()) return;
            const edge = linkBetween(graph.edges, graph.activeNodeId, ref.id);
            return this.#enterHive(graph, edge, ref);
        }
        const hive = LumennGraphStore.getGraph(ref.data?.graphId);
        if (!hive)
            return void ui.notifications.warn(game.i18n.localize('LUMENN_FRAME.Warn.HiveMissing'));
        await this.#zoomInto(ref.id);
        this.#editStack.push(this.#graphId);
        this.#graphId = hive.id;
        this.#selected = {
            kind: null,
            id: null,
        };
        this.#fitPending = true;
        this.render();
    }
    /** Clique no Encontro: toca a música dele sem trocar de cena; de novo, volta à música da sala. */
    async #playEncounter(graph, node) {
        const sources = this.#audioSourcesFor(graph, node.id);
        if (!sources.length)
            return void ui.notifications.warn(
                game.i18n.localize('LUMENN_FRAME.Warn.EncounterNoAudio')
            );
        const playing = sources.some((source) => this.#isAudioPlaying(source));
        const fallback = LumennGraphStore.getDefaultCrossfadeDuration();
        const edge = (graph.edges ?? []).find((e) => e.type === 'audio' && e.to === node.id);
        const cfg = {
            curve: 'linear',
            ...(edge?.transition?.audio ?? {}),
        };
        const room = graph.activeNodeId ? this.#audioSourcesFor(graph, graph.activeNodeId) : [];
        const result = await this.#controller.goToAudio(
            this.#currentAudioSources(graph),
            playing ? room : sources,
            {
                mode: 'crossfade',
                crossfadeDuration: cfg.crossfadeDuration ?? fallback,
                curve: cfg.curve,
            },
            fallback,
            cfg.curve
        );
        if (result === 'invalid-source')
            ui.notifications.warn(game.i18n.localize('LUMENN_FRAME.WarnInvalidAudioSource'));
        await this.render();
    }
    async #insertHive(hiveId, point = null) {
        if (!this.#editable()) return;
        const L = (k) => game.i18n.localize(k);
        if (hiveId === this.#graphId)
            return void ui.notifications.warn(L('LUMENN_FRAME.Warn.HiveSelf'));
        const viewport = this.element.querySelector('.lf-viewport');
        const center =
            point ??
            this.#screenToWorld({
                x: viewport.clientWidth / 2,
                y: viewport.clientHeight / 2,
            });
        const [w, h] = nodeSize('hive-ref', 'normal');
        const node = {
            id: `node_${foundry.utils.randomID(16)}`,
            type: 'hive-ref',
            position: {
                x: Math.round(center.x - w / 2),
                y: Math.round(center.y - h / 2),
            },
            data: {
                graphId: hiveId,
                portId: null,
            },
        };
        const reason = LumennGraphStore.addNodeBlockReason(this.#graphId, node);
        if (reason) return void this.#warnBlock(reason);
        const created = await LumennGraphStore.addNode(this.#graphId, node);
        if (!created) return;
        this.#selected = {
            kind: 'node',
            id: created.id,
        };
        this.render();
    }
    async #hiveAction(action, data) {
        const L = (k) => game.i18n.localize(k);
        const graph = LumennGraphStore.getGraph(this.#graphId);
        if (!graph) return;
        if (action === 'hive-mark') {
            await LumennGraphStore.markHive(graph.id);
        } else if (action === 'hive-unmark') {
            const ok = await LumennGraphStore.unmarkHive(graph.id);
            if (!ok)
                ui.notifications.warn(
                    game.i18n.format('LUMENN_FRAME.Warn.HiveInUse', {
                        where: LumennGraphStore.getHiveUsages(graph.id)
                            .map((use) => use.graphName)
                            .join(', '),
                    })
                );
        } else if (action === 'hive-port-add') {
            const rooms = graph.nodes.filter((n) => n.type === 'scene');
            if (!rooms.length)
                return void ui.notifications.warn(L('LUMENN_FRAME.Warn.HivePortNoRoom'));
            const ports = [
                ...(graph.hive?.ports ?? []),
                {
                    name: `${L('LUMENN_FRAME.Hive.PortDefaultName')} ${(graph.hive?.ports?.length ?? 0) + 1}`,
                    direction: 'entry',
                    nodeId: rooms[0].id,
                },
            ];
            await LumennGraphStore.updateHive(graph.id, {
                ports,
            });
        } else if (action === 'hive-port-remove') {
            await LumennGraphStore.updateHive(graph.id, {
                ports: (graph.hive?.ports ?? []).filter((port) => port.id !== data.portId),
            });
        } else if (action === 'hive-insert') {
            return this.#insertHive(data.hiveId);
        } else if (action === 'hive-open') {
            return this.#switchGraph(data.hiveId);
        } else if (action === 'hive-export') {
            return this.#exportHive(data.hiveId ?? graph.id);
        } else if (action === 'hive-import') {
            return this.#importHive();
        } else if (action === 'hive-relink') {
            const value = this.element.querySelector(`[data-hive-relink="${data.nodeId}"]`)?.value;
            const node = LumennGraphStore.getNode(graph.id, data.nodeId);
            if (!value || !node) return;
            const next = {
                ...node.data,
            };
            delete next.pendingName;
            if (node.type === 'scene') next.sceneId = value;
            else next.audioId = value;
            await LumennGraphStore.updateNode(graph.id, node.id, {
                data: next,
            });
        }
        this.render();
    }
    /** Edita nome, direção e sala das portas, e a transição padrão da Hive. */
    async #hiveFieldChange(e) {
        if (!this.#editable()) return;
        const el = e.currentTarget;
        const graph = LumennGraphStore.getGraph(this.#graphId);
        if (!graph?.isHive) return;
        if (el.dataset.hivePort) {
            const ports = (graph.hive?.ports ?? []).map((port) =>
                port.id === el.dataset.hivePort
                    ? {
                          ...port,
                          [el.dataset.hiveField]: el.value || null,
                      }
                    : port
            );
            await LumennGraphStore.updateHive(graph.id, {
                ports,
            });
        } else {
            const root = this.element;
            const field = (name) => root.querySelector(`[data-hive-field="${name}"]`);
            const num = (name, fallback) => {
                const value = Number(field(name)?.value);
                return Number.isFinite(value) ? Math.max(0, Math.min(1e4, value)) : fallback;
            }; // Entrada (transition) e saída (exit) têm os mesmos campos: tipo, duração, música e legenda.
            const build = (kind, defaults, current) => {
                const music = field(`${kind}.music`)?.value;
                return {
                    scope: 'both',
                    caption: field(`${kind}.caption`)
                        ? field(`${kind}.caption`).checked
                        : defaults.caption,
                    scene: {
                        type: field(`${kind}.type`)?.value || defaults.scene.type,
                        duration: num(`${kind}.duration`, defaults.scene.duration),
                        color: current?.scene?.color ?? '#000000',
                        video: {
                            src:
                                field(`${kind}.videoSrc`)?.value ??
                                current?.scene?.video?.src ??
                                '',
                            cutAt: field(`${kind}.cutAt`)
                                ? Math.max(
                                      0,
                                      Math.min(6e4, Number(field(`${kind}.cutAt`).value) || 0)
                                  )
                                : (current?.scene?.video?.cutAt ?? null),
                            sound: field(`${kind}.videoSound`)
                                ? field(`${kind}.videoSound`).checked
                                : current?.scene?.video?.sound === true,
                        },
                    },
                    audio: {
                        mode: ['none', 'auto', 'crossfade', 'cut'].includes(music)
                            ? music
                            : defaults.audio.mode,
                        crossfadeDuration: num(
                            `${kind}.crossfade`,
                            defaults.audio.crossfadeDuration
                        ),
                        curve: 'linear',
                    },
                };
            };
            await LumennGraphStore.updateHive(graph.id, {
                transition: build(
                    'transition',
                    DEFAULT_HIVE_TRANSITIONS.transition,
                    graph.hive?.transition
                ),
                exit: build('exit', DEFAULT_HIVE_TRANSITIONS.exit, graph.hive?.exit),
            });
        }
        this.render();
    }
    async #exportHive(hiveId) {
        const L = (k) => game.i18n.localize(k);
        const graph = LumennGraphStore.getGraph(hiveId);
        if (!graph?.isHive) return;
        const payload = buildHiveExport(graph, {
            sceneName: (id) => game.scenes.get(id)?.name ?? null,
            audioRef: (data) => {
                if (!data?.audioId || !data?.audioType) return null;
                if (data.audioType === 'playlist') {
                    const playlist = game.playlists.get(data.audioId);
                    return playlist
                        ? {
                              type: 'playlist',
                              name: playlist.name,
                          }
                        : null;
                }
                const sound = LumennCompat.resolveUuidSync(data.audioId);
                return sound
                    ? {
                          type: 'track',
                          name: sound.name,
                      }
                    : null;
            },
        });
        const check = validateHiveExport(payload);
        if (!check.valid)
            return void ui.notifications.warn(
                game.i18n.format('LUMENN_FRAME.Warn.HiveExportInvalid', {
                    errors: check.errors.join('; '),
                })
            );
        const json = JSON.stringify(payload, null, 2);
        // App desktop: link `blob:` abre "Obter um aplicativo" no Windows. Lá o arquivo vai só pelo upload.
        if (!this.#isDesktop())
            foundry.utils.saveDataToFile(
                json,
                'application/json',
                hiveExportFileName(graph.name).replace(/\.json$/, '.lumenn-hive.json')
            );
        const saved = await this.#archiveHive(graph, json);
        ui.notifications.info(
            game.i18n.format('LUMENN_FRAME.Info.HiveExported', {
                path: saved.path ?? L('LUMENN_FRAME.Hive.Downloaded'),
                entry: saved.entryName ?? L('LUMENN_FRAME.Config.None'),
            })
        );
    }
    /** Guarda a exportação: JSON no dataPath (desktop) e entrada no compêndio do mundo. */
    async #archiveHive(graph, json) {
        // Falha não pode ser silenciosa: o GM precisa saber que o arquivo ou o compêndio não foi gravado.
        const warn = (where, error) => {
            console.error(`Lumenn Frame: falha ao gravar a Hive (${where})`, error);
            ui.notifications.warn(`Lumenn Frame: ${where}: ${error?.message ?? error}`);
            return null;
        };
        const entry = await this.#writeHiveJournal(graph, json).catch((error) => warn('compêndio', error));
        const path = this.#isDesktop()
            ? await this.#uploadHiveJson(json, hiveExportFileName(graph.name)).catch((error) =>
                  warn('arquivo', error)
              )
            : null;
        return {
            path,
            entryName: entry?.name ?? null,
        };
    }
    #isDesktop() {
        return (
            !!globalThis.process?.versions?.electron ||
            /Electron\//.test(globalThis.navigator?.userAgent ?? '')
        );
    }
    async #uploadHiveJson(json, fileName) {
        const Picker =
            foundry.applications?.apps?.FilePicker?.implementation ?? globalThis.FilePicker;
        if (!Picker?.upload) return null;
        const folder = `worlds/${game.world.id}/lumenn-exports`;
        try {
            await Picker.createDirectory('data', folder);
        } catch {
            // A pasta já existe: o servidor recusa criar duas vezes.
        }
        const file = new File([json], fileName, {
            type: 'application/json',
        });
        const response = await Picker.upload(
            'data',
            folder,
            file,
            {},
            {
                notify: false,
            }
        );
        return typeof response?.path === 'string' ? response.path : null;
    }
    /** Compêndio de mundo com uma entrada por exportação; o payload inteiro fica na flag. */
    async #writeHiveJournal(graph, json) {
        // Namespace primeiro: o global foi depreciado no v13 e some no v15.
        const Pack =
            foundry.documents?.collections?.CompendiumCollection ?? globalThis.CompendiumCollection;
        if (!Pack?.createCompendium) return null;
        const pack =
            game.packs.get(HIVE_PACK.collection) ??
            (await Pack.createCompendium({
                name: HIVE_PACK.name,
                label: game.i18n.localize('LUMENN_FRAME.Hive.PackLabel'),
                type: 'JournalEntry',
                package: 'world',
            }));
        if (!pack) return null;
        // Reexportar a mesma Hive atualiza a entrada dela em vez de criar outra com o mesmo nome.
        const docs = await pack.getDocuments();
        const existing = docs.find((doc) => doc.getFlag(MODULE_ID, 'hiveId') === graph.id);
        const page = existing?.pages?.contents?.[0];
        if (existing) {
            await existing.update({ name: graph.name, [`flags.${MODULE_ID}.hive`]: JSON.parse(json) });
            if (page) await page.update({ name: graph.name, 'text.content': this.#hiveJournalBody(graph) });
            return existing;
        }
        return JournalEntry.create(
            {
                name: graph.name,
                pages: [
                    {
                        name: graph.name,
                        type: 'text',
                        text: {
                            content: this.#hiveJournalBody(graph),
                        },
                    },
                ],
                flags: {
                    [MODULE_ID]: {
                        hiveId: graph.id,
                        hive: JSON.parse(json),
                    },
                },
            },
            {
                pack: pack.collection,
            }
        );
    }
    #hiveJournalBody(graph) {
        const L = (k) => game.i18n.localize(k);
        const esc = (value) => foundry.utils.escapeHTML(String(value ?? ''));
        const ports = (graph.hive?.ports ?? [])
            .map(
                (port) =>
                    `<li>${esc(port.name || L('LUMENN_FRAME.Hive.PortDefaultName'))} &mdash; ${L(port.direction === 'exit' ? 'LUMENN_FRAME.Hive.PortExit' : 'LUMENN_FRAME.Hive.PortEntry')}</li>`
            )
            .join('');
        const rooms = (graph.nodes ?? []).filter((node) => node.type === 'scene').length;
        return `<p><strong>${esc(graph.name)}</strong></p><p>${rooms} ${L('LUMENN_FRAME.Hive.Rooms')}</p><ul>${ports}</ul>`;
    }
    async #importHive() {
        const file = await foundry.applications.api.DialogV2.prompt({
            window: {
                title: game.i18n.localize('LUMENN_FRAME.Hive.ImportTitle'),
            },
            content: `<p>${game.i18n.localize('LUMENN_FRAME.Hive.ImportHint')}</p><input type="file" name="file" accept=".json,application/json">`,
            ok: {
                label: game.i18n.localize('LUMENN_FRAME.Hive.Import'),
                callback: (ev, btn) => btn.form.elements.file.files[0] ?? null,
            },
            rejectClose: false,
        });
        if (!file || typeof file.text !== 'function') return;
        const fail = (errors) =>
            ui.notifications.warn(
                game.i18n.format('LUMENN_FRAME.Warn.HiveImportInvalid', {
                    errors,
                })
            );
        let payload;
        try {
            payload = JSON.parse(await file.text());
        } catch (error) {
            return void fail(String(error?.message ?? error));
        }
        if (payload?.format !== HIVE_EXPORT_FORMAT) return void fail(HIVE_EXPORT_FORMAT);
        const check = validateHiveExport(payload);
        if (!check.valid) return void fail(check.errors.join('; '));
        const world = {
            scenes: [...game.scenes.values()].map((s) => ({
                id: s.id,
                name: s.name,
            })),
            audio: [...game.playlists.values()].flatMap((p) => [
                {
                    id: p.id,
                    name: p.name,
                    type: 'playlist',
                },
                ...[...p.sounds.values()].map((s) => ({
                    id: s.uuid,
                    name: s.name,
                    type: 'track',
                })),
            ]),
        };
        const { graph, pending } = planHiveImport(
            payload.hives[0],
            world,
            (prefix) => `${prefix}_${foundry.utils.randomID(16)}`
        );
        const saved = await LumennGraphStore.importHive(graph);
        if (!saved) return;
        ui.notifications.info(
            game.i18n.format('LUMENN_FRAME.Info.HiveImported', {
                name: graph.name,
                count: pending.length,
            })
        );
        this.#graphId = graph.id;
        this.#resetTrail();
        this.#selected = {
            kind: null,
            id: null,
        };
        this.#fitPending = true;
        this.render();
    }
    #nodeLabel(node) {
        if (node.type === 'group')
            return node.data?.title || game.i18n.localize('LUMENN_FRAME.Group.DefaultName');
        if (node.type === 'scene') {
            const s = node.data?.sceneId ? game.scenes.get(node.data.sceneId) : null;
            return s?.name ?? 'Scene';
        }
        if (node.type === 'audio') return this.#audioLabel(node.data).name;
        if (node.type === 'hive-ref') {
            const hive = LumennGraphStore.getGraph(node.data?.graphId);
            return hive?.isHive ? hive.name : game.i18n.localize('LUMENN_FRAME.Hive.Missing');
        }
        if (node.type === 'encounter')
            return node.data?.title || game.i18n.localize('LUMENN_FRAME.Encounter.Default');
        return node.data?.title || 'Note';
    }
    #buildInspector(graph) {
        const base = {
            colors: COLORS,
            sizes: SIZES,
            liveAudioEditing: this.#canEditLiveAudio(),
            scenes: [...game.scenes.values()].map((s) => ({
                id: s.id,
                name: s.name,
            })),
            playlistsForAudio: [...game.playlists.values()].map((p) => ({
                id: p.id,
                name: p.name,
                sounds: [...p.sounds.values()].map((s) => ({
                    uuid: s.uuid,
                    name: s.name,
                })),
            })),
        };
        if (this.#selected.kind === 'node') {
            const node = graph?.nodes?.find((n) => n.id === this.#selected.id);
            if (node) {
                const edges = (graph?.edges ?? [])
                    .filter((e) => e.from === node.id || e.to === node.id)
                    .map((e) => ({
                        ...e,
                        fromLabel: this.#nodeLabel(graph.nodes.find((n) => n.id === e.from)),
                        toLabel: this.#nodeLabel(graph.nodes.find((n) => n.id === e.to)),
                    }));
                return {
                    ...base,
                    kind: 'node',
                    node,
                    nodeType: node.type,
                    audioRole: node.data?.audioRole === 'sfx' ? 'sfx' : 'music',
                    nodeEdges: edges,
                    hasConnections: ['scene', 'hive-ref', 'encounter'].includes(node.type),
                    hasFlowOut: ['scene', 'hive-ref'].includes(node.type),
                    hiveRefOptions:
                        node.type === 'hive-ref'
                            ? LumennGraphStore.getHives()
                                  .filter((h) => h.id !== graph.id)
                                  .map((h) => ({
                                      id: h.id,
                                      name: h.name,
                                      selected: h.id === node.data?.graphId,
                                  }))
                            : [],
                    hiveRefPorts:
                        node.type === 'hive-ref'
                            ? (LumennGraphStore.getGraph(node.data?.graphId)?.hive?.ports ?? [])
                                  .filter((p) => p.direction !== 'exit' && p.nodeId)
                                  .map((p) => ({
                                      id: p.id,
                                      name:
                                          p.name ||
                                          game.i18n.localize('LUMENN_FRAME.Hive.PortDefaultName'),
                                      selected: p.id === node.data?.portId,
                                  }))
                            : [],
                    encounterRooms:
                        node.type === 'encounter'
                            ? (graph?.nodes ?? [])
                                  .filter((n) => n.type === 'scene')
                                  .map((n) => ({
                                      id: n.id,
                                      name: this.#nodeLabel(n),
                                      selected: n.id === node.data?.sceneNodeId,
                                  }))
                            : [],
                    encounterTypes:
                        node.type === 'encounter'
                            ? ['combat', 'event', 'npc'].map((t) => ({
                                  id: t,
                                  name: game.i18n.localize(`LUMENN_FRAME.Encounter.${t}`),
                                  selected: t === (node.data?.encounterType ?? 'event'),
                              }))
                            : [],
                    flowTargets: (graph?.nodes ?? [])
                        .filter(
                            (n) => (n.type === 'scene' || n.type === 'hive-ref') && n.id !== node.id
                        )
                        .map((n) => ({
                            id: n.id,
                            name: this.#nodeLabel(n),
                        })),
                    audioNodes: (graph?.nodes ?? [])
                        .filter((n) => n.type === 'audio')
                        .map((n) => ({
                            id: n.id,
                            name: this.#nodeLabel(n),
                        })),
                    groups: (graph?.nodes ?? [])
                        .filter((n) => n.type === 'group' && n.id !== node.id)
                        .map((n) => ({
                            id: n.id,
                            name: this.#nodeLabel(n),
                        })),
                    groupCount:
                        node.type === 'group' ? childrenOf(graph?.nodes ?? [], node.id).length : 0,
                    groupScenes:
                        node.type === 'group'
                            ? (graph?.nodes ?? [])
                                  .filter((n) => n.type === 'scene')
                                  .map((n) => ({
                                      id: n.id,
                                      name: this.#nodeLabel(n),
                                      inGroup: n.parentId === node.id,
                                  }))
                            : [],
                };
            }
        }
        if (this.#selected.kind === 'edge') {
            const edge = graph?.edges?.find((e) => e.id === this.#selected.id);
            if (edge) {
                const from = graph.nodes.find((n) => n.id === edge.from);
                const to = graph.nodes.find((n) => n.id === edge.to);
                const reverse =
                    edge.type === 'flow' &&
                    graph.edges.some(
                        (x) => x.type === 'flow' && x.from === edge.to && x.to === edge.from
                    );
                const transitionScope = ['audio', 'scene', 'both'].includes(edge.transition?.scope)
                    ? edge.transition.scope
                    : 'both'; // Porta de saída da aresta: só existe se o nó de origem for um Hive.
                const refHive =
                    edge.type === 'flow' && from?.type === 'hive-ref'
                        ? LumennGraphStore.getGraph(from.data?.graphId)
                        : null;
                const exitPorts = refHive?.isHive
                    ? portHubView(refHive, graph.edges, from.id).exits
                    : [];
                return {
                    ...base,
                    kind: 'edge',
                    edge,
                    sceneColor: normalizeHexColor(edge.transition?.scene?.color, '#000000'),
                    edgeType: edge.type,
                    exitPorts: exitPorts.map((port) => ({
                        id: port.id,
                        name: port.name || game.i18n.localize('LUMENN_FRAME.Hive.PortDefaultName'),
                        selected: port.id === edge.exitPortId,
                    })),
                    hasExitPorts: exitPorts.length > 0, // Porta apagada depois: a aresta fica órfã e o Inspector avisa.
                    exitPortOrphan:
                        !!edge.exitPortId && !exitPorts.some((port) => port.id === edge.exitPortId),
                    audioTransition: edge.transition?.audio ?? {
                        mode: 'auto',
                        crossfadeDuration: LumennGraphStore.getDefaultCrossfadeDuration(),
                        fadeInDuration: 0,
                        fadeOutDuration: 0,
                        curve: 'linear',
                    },
                    transitionScope,
                    fromLabel: from ? this.#nodeLabel(from) : edge.from,
                    toLabel: to ? this.#nodeLabel(to) : edge.to,
                    reverse,
                    sceneTransitions: LumennCompat.getSceneTransitions(),
                    transitionGroups: this.#transitionOptions(
                        edge.transition?.scene?.type ?? 'cut'
                    ),
                    quickTransitions: this.#quickTransitions(edge.transition?.scene?.type ?? 'cut'),
                    stingers: this.#stingerChips(edge.transition?.scene?.video?.src),
                    isFilm: !!filmEffectOf(edge.transition?.scene?.type),
                    isVideo: filmEffectOf(edge.transition?.scene?.type) === 'video',
                    // Título do filme (cutscene e afins): texto, subtítulo, fonte, cor e tamanho.
                    title: edge.transition?.scene?.title ?? {},
                    titleColor: normalizeHexColor(edge.transition?.scene?.title?.color, '#f4efe6'),
                    titleFonts: TITLE_FONTS.map((font) => ({
                        id: font,
                        selected: font === edge.transition?.scene?.title?.font,
                    })),
                    hasNativeTransitions: LumennCompat.hasNativeSceneTransitions(),
                    canPreviewTransition:
                        edge.type === 'flow' &&
                        transitionScope !== 'audio' &&
                        (!!to?.data?.sceneId || !!filmEffectOf(edge.transition?.scene?.type)),
                    curveOptions: ['linear', 'equal-power'],
                };
            }
        }
        return {
            ...base,
            kind: 'graph',
            audioNodeIndex: (graph?.nodes ?? [])
                .filter((node) => node.type === 'audio')
                .map((node) => ({
                    id: node.id,
                    name: this.#nodeLabel(node),
                })),
            hive: this.#hiveInspector(graph, base),
        };
    }
    #hiveInspector(graph, base) {
        if (!graph) return null;
        const L = (k) => game.i18n.localize(k);
        const rooms = (graph.nodes ?? [])
            .filter((n) => n.type === 'scene')
            .map((n) => ({
                id: n.id,
                name: this.#nodeLabel(n),
            }));
        const own = graph.hive?.transition ?? null;
        const checks = this.#worldChecks();
        const pending = graph.isHive
            ? listHivePending(graph, checks).map((item) => {
                  const node = graph.nodes.find((n) => n.id === item.nodeId);
                  const isScene = item.kind === 'scene';
                  const sounds = base.playlistsForAudio.flatMap((p) =>
                      p.sounds.map((s) => ({
                          id: s.uuid,
                          name: `${p.name} / ${s.name}`,
                      }))
                  );
                  const options = isScene
                      ? base.scenes
                      : node?.data?.audioType === 'playlist'
                        ? base.playlistsForAudio.map((p) => ({
                              id: p.id,
                              name: p.name,
                          }))
                        : sounds;
                  return {
                      nodeId: item.nodeId,
                      label: item.name ?? this.#nodeLabel(node),
                      kindLabel: isScene
                          ? L('LUMENN_FRAME.Inspector.Scene')
                          : L('LUMENN_FRAME.Inspector.Audio'),
                      options: [...options].sort((a, b) =>
                          String(a.name).localeCompare(String(b.name), game.i18n?.lang, {
                              sensitivity: 'base',
                              numeric: true,
                          })
                      ),
                  };
              })
            : [];
        return {
            isHive: graph.isHive === true,
            rooms,
            hasRooms: rooms.length > 0,
            ports: (graph.hive?.ports ?? []).map((port) => ({
                ...port,
                isEntry: port.direction !== 'exit',
                rooms: rooms.map((room) => ({
                    ...room,
                    selected: room.id === port.nodeId,
                })),
            })),
            transition: this.#transitionView(
                normalizeHiveTransition(own, DEFAULT_HIVE_TRANSITIONS.transition)
            ),
            exit: this.#transitionView(
                normalizeHiveTransition(graph.hive?.exit, DEFAULT_HIVE_TRANSITIONS.exit)
            ),
            pending,
            library: LumennGraphStore.getHives().map((hive) => ({
                id: hive.id,
                name: hive.name,
                rooms: (hive.nodes ?? []).filter((n) => n.type === 'scene').length,
                isCurrent: hive.id === graph.id,
                usedIn: LumennGraphStore.getHiveUsages(hive.id)
                    .map((use) => use.graphName)
                    .join(', '),
            })),
        };
    }
    /** Lista de tipos de transição: Cinema (Lumenn, só jogadores) e Foundry (nativas). */
    /** Todas as transições conhecidas: id → rótulo (cinema, corte e as registradas no Foundry). */
    #transitionCatalog() {
        const L = (k) => game.i18n.localize(k);
        const catalog = new Map([['cut', L('LUMENN_FRAME.Edge.Cut')]]);
        for (const effect of FILM_EFFECTS) catalog.set(`${FILM_PREFIX}${effect.id}`, L(effect.label));
        for (const item of LumennCompat.getSceneTransitions()) catalog.set(item.id, item.label);
        return catalog;
    }
    /** Select agrupado por intenção, não por origem técnica; o que sobrar cai em "Efeitos". */
    #transitionOptions(selected) {
        const L = (k) => game.i18n.localize(k);
        const catalog = this.#transitionCatalog();
        const used = new Set();
        const pick = (ids) =>
            ids
                .filter((id) => catalog.has(id) && !used.has(id))
                .map((id) => {
                    used.add(id);
                    return { id, label: catalog.get(id), selected: selected === id };
                });
        const film = FILM_EFFECTS.map((effect) => `${FILM_PREFIX}${effect.id}`);
        const groups = [
            { group: L('LUMENN_FRAME.TransitionGroup.Motion'), items: pick(TRANSITION_GROUPS.motion) },
            { group: L('LUMENN_FRAME.TransitionGroup.Rpg'), items: pick(TRANSITION_GROUPS.rpg) },
            { group: L('LUMENN_FRAME.TransitionGroup.Cinema'), items: pick(film) },
        ];
        groups.push({ group: L('LUMENN_FRAME.TransitionGroup.Effects'), items: pick([...catalog.keys()]) });
        return groups.filter((group) => group.items.length);
    }
    /** Chips de atalho com as transições mais usadas. */
    #quickTransitions(selected) {
        const catalog = this.#transitionCatalog();
        return QUICK_TRANSITIONS.filter(([id]) => catalog.has(id)).map(([id, icon, short]) => ({
            id,
            icon,
            label: game.i18n.localize(`LUMENN_FRAME.TransitionChip.${short}`),
            title: catalog.get(id),
            selected: selected === id,
        }));
    }
    /**
     * Grava uma transição pronta (compêndio "Lumenn Frame: Transições") na ligação selecionada.
     * @returns {Promise<boolean>} true se gravou.
     */
    async applyTransitionPreset(preset) {
        const L = (k) => game.i18n.localize(k);
        if (!preset?.scene?.type) return false;
        if (!this.#editable()) {
            ui.notifications.warn(L('LUMENN_FRAME.Preset.NotEditable'));
            return false;
        }
        const edge =
            this.#selected.kind === 'edge' ? LumennGraphStore.getEdge(this.#graphId, this.#selected.id) : null;
        if (!edge || edge.type !== 'flow') {
            ui.notifications.warn(L('LUMENN_FRAME.Preset.SelectEdge'));
            return false;
        }
        const scene = foundry.utils.deepClone(preset.scene);
        // Trocar de stinger para outro tipo não deixa arquivo de vídeo velho para trás.
        if (!scene.video) scene.video = { src: '' };
        await LumennGraphStore.updateEdge(
            this.#graphId,
            edge.id,
            this.#mergeEdgePatch(edge, { transition: { scene } })
        );
        await this.render();
        ui.notifications.info(game.i18n.format('LUMENN_FRAME.Preset.Applied', { name: preset.name }));
        return true;
    }
    /** Chips dos stingers prontos, com o que está em uso aceso. */
    #stingerChips(src) {
        return STINGERS.map((s) => ({
            id: s.id,
            icon: s.icon,
            label: game.i18n.localize(s.label),
            src: stingerSrc(s.id),
            on: src === stingerSrc(s.id),
        }));
    }
    #transitionView(cfg) {
        const music = cfg.audio?.mode ?? 'auto';
        return {
            type: cfg.scene?.type,
            isFilm: !!filmEffectOf(cfg.scene?.type),
            isVideo: filmEffectOf(cfg.scene?.type) === 'video',
            video: {
                src: cfg.scene?.video?.src ?? '',
                cutAt: cfg.scene?.video?.cutAt ?? '',
                sound: cfg.scene?.video?.sound === true,
            },
            stingers: this.#stingerChips(cfg.scene?.video?.src),
            duration: cfg.scene?.duration ?? 1e3,
            crossfade: cfg.audio?.crossfadeDuration ?? 2e3,
            caption: cfg.caption !== false,
            music: ['none', 'auto', 'crossfade', 'cut'].map((id) => ({
                id,
                label: game.i18n.localize(`LUMENN_FRAME.Film.Music.${id}`),
                selected: id === music,
            })),
            options: this.#transitionOptions(cfg.scene?.type),
        };
    }
    #worldChecks() {
        return {
            hasScene: (id) => !!game.scenes.get(id),
            hasAudio: (data) =>
                !!LumennCompat.resolveAudioDoc({
                    type: data.audioType === 'playlist' ? 'playlist' : 'track',
                    id: data.audioId,
                }),
        };
    }
}
