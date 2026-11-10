const MODULE_ID = 'lumenn-frame';
const SCHEMA_VERSION = 2;
import { LumennSettings } from './settings.mjs';
import { childrenOf, GROUP_COLOR } from './graph-groups.mjs';
import { detectHiveCycles } from './hive-runtime.mjs';
import { planGroupToHive, sanitizeHivePorts } from './hive-io.mjs';
const DEFAULT_COLORS = {
    scene: '#f0a321',
    audio: '#2dd4bf',
    note: '#73707c',
};
const HIVE_NODE_DEFAULTS = {
    'hive-ref': {
        color: '#8b5cf6',
        size: 'normal',
    },
    encounter: {
        color: '#f43f5e',
        size: 'normal',
    },
};
/**
 * LumennGraphStore CRUD de Graphs (Schema v2: nodes[] + edges[]) sobre
 * game.settings (escopo world), com migração não-destrutiva do schema v1
 * (Beats) e backup obrigatório. Todas as escritas são assíncronas (await).
 */
export class LumennGraphStore {
    static #GRAPHS_KEY = 'graphs';
    static #LEGACY_KEY = 'storyboards';
    static #LEGACY_BACKUP_KEY = 'legacyBackup';
    static #GRAPHS_BACKUP_KEY = 'graphsBackup';
    static registerSettings() {
        game.settings.register(MODULE_ID, LumennGraphStore.#GRAPHS_KEY, {
            name: 'Graphs',
            scope: 'world',
            config: false,
            type: Object,
            default: {
                schemaVersion: SCHEMA_VERSION,
                graphs: [],
            },
        });
        game.settings.register(MODULE_ID, LumennGraphStore.#LEGACY_BACKUP_KEY, {
            name: 'Legacy Backup (v1)',
            scope: 'world',
            config: false,
            type: String,
            default: '',
        });
        game.settings.register(MODULE_ID, LumennGraphStore.#GRAPHS_BACKUP_KEY, {
            name: 'Graphs Backup (pre-migration)',
            scope: 'world',
            config: false,
            type: String,
            default: '',
        });
    }
    static getAll() {
        const data = foundry.utils.duplicate(
            game.settings.get(MODULE_ID, LumennGraphStore.#GRAPHS_KEY)
        );
        return data?.graphs ?? [];
    }
    static getGraph(graphId) {
        return this.getAll().find((g) => g.id === graphId) ?? null;
    }
    static getHives() {
        return this.getAll().filter((graph) => graph.isHive === true);
    }
    static getHiveUsages(graphId) {
        return this.getAll().flatMap((graph) =>
            (graph.nodes ?? [])
                .filter((node) => node.type === 'hive-ref' && node.data?.graphId === graphId)
                .map((node) => ({
                    graphId: graph.id,
                    graphName: graph.name,
                    nodeId: node.id,
                }))
        );
    }
    static #wouldCreateHiveCycle(graphs, ownerGraphId, targetGraphId, replacingNodeId = null) {
        if (!targetGraphId || targetGraphId === ownerGraphId) return true;
        if (!graphs.some((candidate) => candidate.id === targetGraphId && candidate.isHive))
            return true;
        const references = graphs.map((candidate) => ({
            id: candidate.id,
            references: (candidate.nodes ?? [])
                .filter(
                    (node) =>
                        node.type === 'hive-ref' &&
                        !(candidate.id === ownerGraphId && node.id === replacingNodeId)
                )
                .map((node) => node.data?.graphId)
                .filter(Boolean),
        }));
        references
            .find((candidate) => candidate.id === ownerGraphId)
            ?.references.push(targetGraphId);
        return detectHiveCycles(references).length > 0;
    }
    static getNode(graphId, nodeId) {
        return this.getGraph(graphId)?.nodes?.find((n) => n.id === nodeId) ?? null;
    }
    static getEdge(graphId, edgeId) {
        return this.getGraph(graphId)?.edges?.find((e) => e.id === edgeId) ?? null;
    }
    static getDefaultCrossfadeDuration() {
        return LumennSettings.get('defaultCrossfadeDuration');
    }
    static getDefaultColors() {
        return {
            scene: LumennSettings.get('defaultSceneColor') ?? DEFAULT_COLORS.scene,
            audio: LumennSettings.get('defaultAudioColor') ?? DEFAULT_COLORS.audio,
            note: LumennSettings.get('defaultNoteColor') ?? DEFAULT_COLORS.note,
        };
    }
    /* -- CRUD de Graphs ----------------------------------------------- */
    static async createGraph(name = 'Novo Storyboard') {
        if (!game.user.isGM) return null;
        const data = foundry.utils.duplicate(
            game.settings.get(MODULE_ID, LumennGraphStore.#GRAPHS_KEY)
        );
        const graph = {
            id: `graph_${foundry.utils.randomID(16)}`,
            name,
            activeNodeId: null,
            nodes: [],
            edges: [],
        };
        data.graphs.push(graph);
        await game.settings.set(MODULE_ID, LumennGraphStore.#GRAPHS_KEY, data);
        return graph;
    }
    static async renameGraph(graphId, name) {
        if (!game.user.isGM) return false;
        const data = foundry.utils.duplicate(
            game.settings.get(MODULE_ID, LumennGraphStore.#GRAPHS_KEY)
        );
        const graph = data.graphs.find((g) => g.id === graphId);
        if (!graph) return false;
        graph.name = name;
        await game.settings.set(MODULE_ID, LumennGraphStore.#GRAPHS_KEY, data);
        return true;
    }
    static async sortGraphsByName() {
        if (!game.user.isGM) return false;
        const data = foundry.utils.duplicate(
            game.settings.get(MODULE_ID, LumennGraphStore.#GRAPHS_KEY)
        );
        data.graphs.sort((a, b) =>
            String(a.name ?? '').localeCompare(String(b.name ?? ''), game.i18n?.lang, {
                sensitivity: 'base',
                numeric: true,
            })
        );
        await game.settings.set(MODULE_ID, LumennGraphStore.#GRAPHS_KEY, data);
        return true;
    }
    static async deleteGraph(graphId) {
        if (!game.user.isGM) return false;
        if (this.getGraph(graphId)?.isHive && this.getHiveUsages(graphId).length) return false;
        const data = foundry.utils.duplicate(
            game.settings.get(MODULE_ID, LumennGraphStore.#GRAPHS_KEY)
        );
        data.graphs = data.graphs.filter((g) => g.id !== graphId);
        await game.settings.set(MODULE_ID, LumennGraphStore.#GRAPHS_KEY, data);
        return true;
    }
    static #newId(prefix) {
        return `${prefix}_${foundry.utils.randomID(16)}`;
    }
    static #applyHive(graph, patch = {}) {
        const merged = {
            ...(graph.hive ?? {}),
            ...patch,
        };
        merged.ports = sanitizeHivePorts(
            patch.ports ?? graph.hive?.ports ?? [],
            graph.nodes,
            LumennGraphStore.#newId
        );
        graph.isHive = true;
        graph.hive = merged;
    }
    static async markHive(graphId, patch = {}) {
        if (!game.user.isGM) return null;
        const data = foundry.utils.duplicate(
            game.settings.get(MODULE_ID, LumennGraphStore.#GRAPHS_KEY)
        );
        const graph = data.graphs.find((g) => g.id === graphId);
        if (!graph) return null;
        LumennGraphStore.#applyHive(graph, patch);
        await game.settings.set(MODULE_ID, LumennGraphStore.#GRAPHS_KEY, data);
        return graph;
    }
    /** Atualiza portas e transição padrão de uma Hive já marcada. */
    static async updateHive(graphId, patch = {}) {
        if (!game.user.isGM) return null;
        const data = foundry.utils.duplicate(
            game.settings.get(MODULE_ID, LumennGraphStore.#GRAPHS_KEY)
        );
        const graph = data.graphs.find((g) => g.id === graphId);
        if (!graph?.isHive) return null;
        LumennGraphStore.#applyHive(graph, patch);
        await game.settings.set(MODULE_ID, LumennGraphStore.#GRAPHS_KEY, data);
        return graph.hive;
    }
    /** Desmarca a Hive; bloqueia enquanto algum storyboard a usa. */
    static async unmarkHive(graphId) {
        if (!game.user.isGM) return false;
        if (this.getHiveUsages(graphId).length) return false;
        const data = foundry.utils.duplicate(
            game.settings.get(MODULE_ID, LumennGraphStore.#GRAPHS_KEY)
        );
        const graph = data.graphs.find((g) => g.id === graphId);
        if (!graph?.isHive) return false;
        delete graph.isHive;
        delete graph.hive;
        await game.settings.set(MODULE_ID, LumennGraphStore.#GRAPHS_KEY, data);
        return true;
    }
    /**
     * Grupo vira Hive numa única escrita: a Hive entra na biblioteca e o Grupo, no pai,
     * vira um nó Hive ligado às mesmas setas. `labelOf(node)` dá nome às portas automáticas.
     */
    static async convertGroupToHive(graphId, groupId, labelOf) {
        if (!game.user.isGM) return null;
        const data = foundry.utils.duplicate(
            game.settings.get(MODULE_ID, LumennGraphStore.#GRAPHS_KEY)
        );
        const graph = data.graphs.find((g) => g.id === graphId);
        if (!graph) return null;
        const plan = planGroupToHive(graph, groupId, {
            newId: LumennGraphStore.#newId,
            labelOf,
        });
        if (!plan) return null;
        graph.nodes = plan.parent.nodes;
        graph.edges = plan.parent.edges;
        graph.activeNodeId = plan.parent.activeNodeId;
        data.graphs.push(plan.hive);
        await game.settings.set(MODULE_ID, LumennGraphStore.#GRAPHS_KEY, data);
        return plan;
    }
    /** Grava uma Hive montada por `planHiveImport` como storyboard novo do mundo. */
    static async importHive(graph) {
        if (!game.user.isGM || !graph?.id || graph.isHive !== true) return null;
        const data = foundry.utils.duplicate(
            game.settings.get(MODULE_ID, LumennGraphStore.#GRAPHS_KEY)
        );
        if (data.graphs.some((candidate) => candidate.id === graph.id)) return null;
        data.graphs.push(foundry.utils.duplicate(graph));
        await game.settings.set(MODULE_ID, LumennGraphStore.#GRAPHS_KEY, data);
        return graph;
    }
    /** Trilha de execução (níveis de Hive abaixo da raiz), gravada no storyboard-pai. */
    static getLiveTrail(rootId) {
        const trail = this.getGraph(rootId)?.liveTrail;
        return Array.isArray(trail) ? trail : [];
    }
    static async setLiveTrail(rootId, levels) {
        if (!game.user.isGM) return false;
        const data = foundry.utils.duplicate(
            game.settings.get(MODULE_ID, LumennGraphStore.#GRAPHS_KEY)
        );
        const graph = data.graphs.find((g) => g.id === rootId);
        if (!graph) return false;
        if (levels?.length) graph.liveTrail = levels;
        else delete graph.liveTrail;
        await game.settings.set(MODULE_ID, LumennGraphStore.#GRAPHS_KEY, data);
        return true;
    }
    /** Motivo pelo qual `addNode` recusaria o nó (para a interface avisar), ou null. */
    static addNodeBlockReason(graphId, node, graphs = this.getAll()) {
        if (!game.user.isGM) return 'not-gm';
        const graph = graphs.find((g) => g.id === graphId);
        if (!graph) return 'missing-graph';
        if (node?.type === 'encounter' && graph.isHive !== true) return 'encounter-outside-hive';
        if (
            node?.type === 'hive-ref' &&
            this.#wouldCreateHiveCycle(graphs, graphId, node.data?.graphId)
        )
            return 'hive-cycle';
        return null;
    }
    /** Motivo pelo qual trocar a Hive de um `hive-ref` seria recusado, ou null. */
    static retargetBlockReason(graphId, nodeId, targetGraphId) {
        const graphs = this.getAll();
        return this.#wouldCreateHiveCycle(graphs, graphId, targetGraphId, nodeId)
            ? 'hive-cycle'
            : null;
    }
    /* -- CRUD de Nodes ------------------------------------------------ */
    static async addNode(graphId, node) {
        if (!game.user.isGM) return null;
        const data = foundry.utils.duplicate(
            game.settings.get(MODULE_ID, LumennGraphStore.#GRAPHS_KEY)
        );
        const graph = data.graphs.find((g) => g.id === graphId);
        if (!graph) return null;
        if (this.addNodeBlockReason(graphId, node, data.graphs)) return null;
        // Defaults das Settings aplicados quando o caller não os define.
        // Grupo não tem setting próprio (evita erro de chave não registrada).
        const d =
            node.type === 'group'
                ? {
                      color: GROUP_COLOR,
                      size: 'normal',
                  }
                : (HIVE_NODE_DEFAULTS[node.type] ?? LumennSettings.getNodeDefaults(node.type));
        const n = {
            id: node.id ?? `node_${foundry.utils.randomID(16)}`,
            type: node.type,
            parentId: node.parentId ?? null,
            position: node.position ?? {
                x: 80,
                y: 80,
            },
            color: node.color ?? d.color,
            size: node.size ?? d.size,
            notes: node.notes ?? '',
            data:
                node.data ??
                (node.type === 'audio'
                    ? {
                          audioRole: 'music',
                          audioType: null,
                          audioId: null,
                          volume: 0.75,
                          loop: true,
                          fadeIn: null,
                          fadeOut: null,
                      }
                    : node.type === 'hive-ref'
                      ? {
                            graphId: node.data?.graphId ?? null,
                            portId: node.data?.portId ?? null,
                        }
                      : node.type === 'encounter'
                        ? {
                              encounterType: node.data?.encounterType ?? 'event',
                              audioId: node.data?.audioId ?? null,
                          }
                        : {}),
        };
        graph.nodes.push(n);
        await game.settings.set(MODULE_ID, LumennGraphStore.#GRAPHS_KEY, data);
        return n;
    }
    static #sanitizePatch(node, graph, patch) {
        const clean = {
            ...(patch ?? {}),
        };
        delete clean.id;
        delete clean.type;
        if (Object.prototype.hasOwnProperty.call(clean, 'parentId')) {
            const parentId = clean.parentId;
            const parent = parentId ? graph.nodes.find((n) => n.id === parentId) : null;
            const valid =
                parentId === null ||
                (node.type !== 'group' && parent?.type === 'group' && parent.id !== node.id);
            if (!valid) delete clean.parentId;
        }
        return clean;
    }
    static async updateNode(graphId, nodeId, patch) {
        if (!game.user.isGM) return null;
        const data = foundry.utils.duplicate(
            game.settings.get(MODULE_ID, LumennGraphStore.#GRAPHS_KEY)
        );
        const graph = data.graphs.find((g) => g.id === graphId);
        const node = graph?.nodes?.find((n) => n.id === nodeId);
        if (!node) return null;
        if (
            node.type === 'hive-ref' &&
            Object.prototype.hasOwnProperty.call(patch?.data ?? {}, 'graphId') &&
            this.#wouldCreateHiveCycle(data.graphs, graphId, patch.data.graphId, nodeId)
        )
            return null;
        Object.assign(node, LumennGraphStore.#sanitizePatch(node, graph, patch));
        await game.settings.set(MODULE_ID, LumennGraphStore.#GRAPHS_KEY, data);
        return node;
    }
    /** Atualiza vários nós com uma única escrita do setting (arrasto de grupo). */
    static async updateNodes(graphId, patches) {
        if (!game.user.isGM) return [];
        if (!Array.isArray(patches) || !patches.length) return [];
        const data = foundry.utils.duplicate(
            game.settings.get(MODULE_ID, LumennGraphStore.#GRAPHS_KEY)
        );
        const graph = data.graphs.find((g) => g.id === graphId);
        if (!graph) return [];
        const updated = [];
        for (const patch of patches) {
            const node = graph.nodes.find((n) => n.id === patch?.id);
            if (!node) continue;
            if (
                node.type === 'hive-ref' &&
                Object.prototype.hasOwnProperty.call(patch?.data ?? {}, 'graphId') &&
                this.#wouldCreateHiveCycle(data.graphs, graphId, patch.data.graphId, node.id)
            )
                continue;
            Object.assign(node, LumennGraphStore.#sanitizePatch(node, graph, patch));
            updated.push(node);
        }
        await game.settings.set(MODULE_ID, LumennGraphStore.#GRAPHS_KEY, data);
        return updated;
    }
    static async deleteNode(graphId, nodeId) {
        if (!game.user.isGM) return false;
        const data = foundry.utils.duplicate(
            game.settings.get(MODULE_ID, LumennGraphStore.#GRAPHS_KEY)
        );
        const graph = data.graphs.find((g) => g.id === graphId);
        if (!graph) return false;
        const node = graph.nodes.find((n) => n.id === nodeId);
        if (!node) return false;
        // Apagar grupo = desagrupar: filhos e edges internas ficam.
        if (node.type === 'group') {
            for (const child of childrenOf(graph.nodes, nodeId)) child.parentId = null;
        }
        graph.nodes = graph.nodes.filter((n) => n.id !== nodeId);
        graph.edges = graph.edges.filter((e) => e.from !== nodeId && e.to !== nodeId);
        if (graph.activeNodeId === nodeId) graph.activeNodeId = null;
        // Sala apagada: porta e Encontro que apontavam para ela ficam sem sala (nunca órfãos).
        for (const port of graph.hive?.ports ?? []) {
            if (port.nodeId === nodeId) port.nodeId = null;
        }
        for (const other of graph.nodes) {
            if (other.type === 'encounter' && other.data?.sceneNodeId === nodeId)
                other.data.sceneNodeId = null;
        }
        await game.settings.set(MODULE_ID, LumennGraphStore.#GRAPHS_KEY, data);
        return true;
    }
    static async setActiveNode(graphId, nodeId) {
        if (!game.user.isGM) return;
        const data = foundry.utils.duplicate(
            game.settings.get(MODULE_ID, LumennGraphStore.#GRAPHS_KEY)
        );
        const graph = data.graphs.find((g) => g.id === graphId);
        if (!graph) return;
        graph.activeNodeId = nodeId;
        await game.settings.set(MODULE_ID, LumennGraphStore.#GRAPHS_KEY, data);
    }
    /* -- CRUD de Edges ------------------------------------------------ */
    static async addEdge(graphId, edge) {
        if (!game.user.isGM) return null;
        const data = foundry.utils.duplicate(
            game.settings.get(MODULE_ID, LumennGraphStore.#GRAPHS_KEY)
        );
        const graph = data.graphs.find((g) => g.id === graphId);
        if (!graph) return null;
        const dup = graph.edges.some(
            (e) => e.type === edge.type && e.from === edge.from && e.to === edge.to
        );
        if (dup || edge.from === edge.to) return null;
        if (edge.type === 'flow' && !edge.transition) {
            const t = LumennSettings.getTransitionDefaults();
            edge.transition = {
                scope: 'both',
                scene: {
                    type: t.sceneType,
                    duration: t.sceneDuration,
                    color: t.dipColor,
                },
                audio: {
                    mode: t.audioMode,
                    crossfadeDuration: t.crossfade,
                    fadeInDuration: t.fadeIn,
                    fadeOutDuration: t.fadeOut,
                    curve: t.curve,
                },
            };
        }
        graph.edges.push(edge);
        await game.settings.set(MODULE_ID, LumennGraphStore.#GRAPHS_KEY, data);
        return edge;
    }
    static async updateEdge(graphId, edgeId, patch) {
        if (!game.user.isGM) return null;
        const data = foundry.utils.duplicate(
            game.settings.get(MODULE_ID, LumennGraphStore.#GRAPHS_KEY)
        );
        const graph = data.graphs.find((g) => g.id === graphId);
        const edge = graph?.edges?.find((e) => e.id === edgeId);
        if (!edge) return null;
        Object.assign(edge, patch);
        await game.settings.set(MODULE_ID, LumennGraphStore.#GRAPHS_KEY, data);
        return edge;
    }
    static async deleteEdge(graphId, edgeId) {
        if (!game.user.isGM) return false;
        const data = foundry.utils.duplicate(
            game.settings.get(MODULE_ID, LumennGraphStore.#GRAPHS_KEY)
        );
        const graph = data.graphs.find((g) => g.id === graphId);
        if (!graph) return false;
        graph.edges = graph.edges.filter((e) => e.id !== edgeId);
        await game.settings.set(MODULE_ID, LumennGraphStore.#GRAPHS_KEY, data);
        return true;
    }
    /** Cria a aresta recíproca B->A a partir de uma FLOW edge A->B (se não existir). */
    static async addReturn(graphId, edgeId) {
        if (!game.user.isGM) return null;
        const data = foundry.utils.duplicate(
            game.settings.get(MODULE_ID, LumennGraphStore.#GRAPHS_KEY)
        );
        const graph = data.graphs.find((g) => g.id === graphId);
        const edge = graph?.edges?.find((e) => e.id === edgeId);
        if (!edge || edge.type !== 'flow') return null;
        const reverse = graph.edges.find(
            (e) => e.type === 'flow' && e.from === edge.to && e.to === edge.from
        );
        if (reverse) return reverse;
        const created = {
            id: `edge_${foundry.utils.randomID(16)}`,
            type: 'flow',
            from: edge.to,
            to: edge.from,
            transition: JSON.parse(JSON.stringify(edge.transition ?? {})),
        };
        graph.edges.push(created);
        await game.settings.set(MODULE_ID, LumennGraphStore.#GRAPHS_KEY, data);
        return created;
    }
    /* -- Migração Schema v1 (Beats) ? v2 (Graphs) --------------------- */
    /**
     * Migra o setting legado `storyboards` (schema v1) para `graphs` (v2),
     * sem apagar o legado. Não-destrutiva e idempotente: se já existe
     * schemaVersion 2, não faz nada.
     */
    static async migrate() {
        if (!game.user.isGM)
            return {
                migrated: false,
                gm: false,
            };
        const data = foundry.utils.duplicate(
            game.settings.get(MODULE_ID, LumennGraphStore.#GRAPHS_KEY)
        );
        const version = Number(data?.schemaVersion ?? 0);
        if (!Number.isFinite(version))
            return {
                migrated: false,
                unreadable: true,
            };
        if (version === SCHEMA_VERSION)
            return {
                migrated: false,
            };
        // Versão futura não é legado: migrar às cegas apagaria os grafos.
        if (version > SCHEMA_VERSION)
            return {
                migrated: false,
                future: true,
            };
        // Grafos já existentes nunca são sobrescritos sem backup explícito.
        if (data?.graphs?.length) {
            const existing = game.settings.get(MODULE_ID, LumennGraphStore.#GRAPHS_BACKUP_KEY);
            if (!existing)
                await game.settings.set(
                    MODULE_ID,
                    LumennGraphStore.#GRAPHS_BACKUP_KEY,
                    JSON.stringify(data)
                );
            return {
                migrated: false,
                blocked: true,
            };
        }
        const legacy = game.settings.get(MODULE_ID, LumennGraphStore.#LEGACY_KEY) ?? [];
        const next = {
            schemaVersion: SCHEMA_VERSION,
            graphs: [],
        };
        if (legacy.length) {
            // Backup obrigatório do legado antes de qualquer escrita v2.
            await game.settings.set(
                MODULE_ID,
                LumennGraphStore.#LEGACY_BACKUP_KEY,
                JSON.stringify(legacy)
            );
            const colors = this.getDefaultColors();
            const defaultFade = this.getDefaultCrossfadeDuration();
            for (const sb of legacy) {
                const graph = {
                    id: `graph_${foundry.utils.randomID(16)}`,
                    name: sb.name ?? 'Novo Storyboard',
                    activeNodeId: sb.activeBeatId ?? null,
                    nodes: [],
                    edges: [],
                };
                const audioMap = new Map();
                // Passo 1: Beats -> Scene Nodes (reutiliza o id do Beat como node id).
                for (const beat of sb.beats ?? []) {
                    graph.nodes.push({
                        id: beat.id,
                        type: 'scene',
                        position: {
                            ...(beat.position ?? {
                                x: 80,
                                y: 80,
                            }),
                        },
                        color: colors.scene,
                        size: 'normal',
                        notes: '',
                        data: {
                            sceneId: beat.sceneId ?? null,
                        },
                    });
                }
                // Passo 2: audioSource -> Audio Node (dedup por type+id) + AUDIO edge.
                for (const beat of sb.beats ?? []) {
                    const src = beat.audioSource;
                    if (!src) continue;
                    const key = `${src.type}:${src.id}`;
                    let audioId = audioMap.get(key);
                    if (!audioId) {
                        audioId = `node_${foundry.utils.randomID(16)}`;
                        audioMap.set(key, audioId);
                        graph.nodes.push({
                            id: audioId,
                            type: 'audio',
                            position: {
                                x: (beat.position?.x ?? 80) + 320,
                                y: beat.position?.y ?? 80,
                            },
                            color: colors.audio,
                            size: 'normal',
                            notes: '',
                            data: {
                                audioRole: 'music',
                                audioType: src.type,
                                audioId: src.id,
                                volume: 0.75,
                                loop: true,
                                fadeIn: null,
                                fadeOut: null,
                            },
                        });
                    }
                    graph.edges.push({
                        id: `edge_${foundry.utils.randomID(16)}`,
                        type: 'audio',
                        from: audioId,
                        to: beat.id,
                    });
                }
                // Passo 3: connections -> FLOW edges (transição inicial vinda do crossfade do Beat).
                for (const beat of sb.beats ?? []) {
                    for (const targetId of beat.connections ?? []) {
                        graph.edges.push({
                            id: `edge_${foundry.utils.randomID(16)}`,
                            type: 'flow',
                            from: beat.id,
                            to: targetId,
                            transition: {
                                scope: 'both',
                                scene: {
                                    type: 'cut',
                                    duration: 0,
                                },
                                audio: {
                                    mode: 'auto',
                                    crossfadeDuration: beat.crossfadeDuration ?? defaultFade,
                                    fadeInDuration: null,
                                    fadeOutDuration: null,
                                },
                            },
                        });
                    }
                }
                next.graphs.push(graph);
            }
        }
        await game.settings.set(MODULE_ID, LumennGraphStore.#GRAPHS_KEY, next);
        return {
            migrated: legacy.length > 0,
        };
    }
}
