const MODULE_ID = "lumenn-frame";
const SCHEMA_VERSION = 2;

import { LumennSettings } from "./settings.mjs";

const DEFAULT_COLORS = { scene: "#f0a321", audio: "#2dd4bf", note: "#73707c" };

/**
 * LumennGraphStore — CRUD de Graphs (Schema v2: nodes[] + edges[]) sobre
 * game.settings (escopo world), com migração não-destrutiva do schema v1
 * (Beats) e backup obrigatório. Todas as escritas são assíncronas (await).
 */
export class LumennGraphStore {
  static #GRAPHS_KEY = "graphs";
  static #LEGACY_KEY = "storyboards";
  static #LEGACY_BACKUP_KEY = "legacyBackup";

  static registerSettings() {
    game.settings.register(MODULE_ID, LumennGraphStore.#GRAPHS_KEY, {
      name: "Graphs",
      scope: "world",
      config: false,
      type: Object,
      default: { schemaVersion: SCHEMA_VERSION, graphs: [] },
    });
    game.settings.register(MODULE_ID, LumennGraphStore.#LEGACY_BACKUP_KEY, {
      name: "Legacy Backup (v1)",
      scope: "world",
      config: false,
      type: String,
      default: "",
    });
  }

static getAll() {
    const data = foundry.utils.duplicate(game.settings.get(MODULE_ID, LumennGraphStore.#GRAPHS_KEY));
    return data?.graphs ?? [];
  }

  static getGraph(graphId) {
    return this.getAll().find((g) => g.id === graphId) ?? null;
  }

  static getNode(graphId, nodeId) {
    return this.getGraph(graphId)?.nodes?.find((n) => n.id === nodeId) ?? null;
  }

  static getEdge(graphId, edgeId) {
    return this.getGraph(graphId)?.edges?.find((e) => e.id === edgeId) ?? null;
  }

  static getDefaultCrossfadeDuration() {
    return LumennSettings.get("defaultCrossfadeDuration");
  }

  static getDefaultColors() {
    return {
      scene: LumennSettings.get("defaultSceneColor") ?? DEFAULT_COLORS.scene,
      audio: LumennSettings.get("defaultAudioColor") ?? DEFAULT_COLORS.audio,
      note: LumennSettings.get("defaultNoteColor") ?? DEFAULT_COLORS.note,
    };
  }

  /* ── CRUD de Graphs ─────────────────────────────────────────────── */

  static async createGraph(name = "Novo Storyboard") {
    if (!game.user.isGM) return null;
    const data = foundry.utils.duplicate(game.settings.get(MODULE_ID, LumennGraphStore.#GRAPHS_KEY));
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
    const data = foundry.utils.duplicate(game.settings.get(MODULE_ID, LumennGraphStore.#GRAPHS_KEY));
    const graph = data.graphs.find((g) => g.id === graphId);
    if (!graph) return false;
    graph.name = name;
    await game.settings.set(MODULE_ID, LumennGraphStore.#GRAPHS_KEY, data);
    return true;
  }

  static async deleteGraph(graphId) {
    if (!game.user.isGM) return false;
    const data = foundry.utils.duplicate(game.settings.get(MODULE_ID, LumennGraphStore.#GRAPHS_KEY));
    data.graphs = data.graphs.filter((g) => g.id !== graphId);
    await game.settings.set(MODULE_ID, LumennGraphStore.#GRAPHS_KEY, data);
    return true;
  }

  /* ── CRUD de Nodes ──────────────────────────────────────────────── */

  static async addNode(graphId, node) {
    if (!game.user.isGM) return null;
    const data = foundry.utils.duplicate(game.settings.get(MODULE_ID, LumennGraphStore.#GRAPHS_KEY));
    const graph = data.graphs.find((g) => g.id === graphId);
    if (!graph) return null;
    // Defaults das Settings aplicados quando o caller não os define.
    const d = LumennSettings.getNodeDefaults(node.type);
    const n = {
      id: node.id ?? `node_${foundry.utils.randomID(16)}`,
      type: node.type,
      position: node.position ?? { x: 80, y: 80 },
      color: node.color ?? d.color,
      size: node.size ?? d.size,
      notes: node.notes ?? "",
      data: node.data ?? (node.type === "audio" ? { audioType: null, audioId: null, volume: 0.75, loop: true, fadeIn: null, fadeOut: null } : {}),
    };
    graph.nodes.push(n);
    await game.settings.set(MODULE_ID, LumennGraphStore.#GRAPHS_KEY, data);
    return n;
  }

  static async updateNode(graphId, nodeId, patch) {
    if (!game.user.isGM) return null;
    const data = foundry.utils.duplicate(game.settings.get(MODULE_ID, LumennGraphStore.#GRAPHS_KEY));
    const graph = data.graphs.find((g) => g.id === graphId);
    const node = graph?.nodes?.find((n) => n.id === nodeId);
    if (!node) return null;
    Object.assign(node, patch);
    await game.settings.set(MODULE_ID, LumennGraphStore.#GRAPHS_KEY, data);
    return node;
  }

  static async deleteNode(graphId, nodeId) {
    if (!game.user.isGM) return false;
    const data = foundry.utils.duplicate(game.settings.get(MODULE_ID, LumennGraphStore.#GRAPHS_KEY));
    const graph = data.graphs.find((g) => g.id === graphId);
    if (!graph) return false;
    graph.nodes = graph.nodes.filter((n) => n.id !== nodeId);
    graph.edges = graph.edges.filter(
      (e) => e.from !== nodeId && e.to !== nodeId,
    );
    if (graph.activeNodeId === nodeId) graph.activeNodeId = null;
    await game.settings.set(MODULE_ID, LumennGraphStore.#GRAPHS_KEY, data);
    return true;
  }

  static async setActiveNode(graphId, nodeId) {
    if (!game.user.isGM) return;
    const data = foundry.utils.duplicate(game.settings.get(MODULE_ID, LumennGraphStore.#GRAPHS_KEY));
    const graph = data.graphs.find((g) => g.id === graphId);
    if (!graph) return;
    graph.activeNodeId = nodeId;
    await game.settings.set(MODULE_ID, LumennGraphStore.#GRAPHS_KEY, data);
  }

  /* ── CRUD de Edges ──────────────────────────────────────────────── */

  static async addEdge(graphId, edge) {
    if (!game.user.isGM) return null;
    const data = foundry.utils.duplicate(game.settings.get(MODULE_ID, LumennGraphStore.#GRAPHS_KEY));
    const graph = data.graphs.find((g) => g.id === graphId);
    if (!graph) return null;
    const dup = graph.edges.some(
      (e) => e.type === edge.type && e.from === edge.from && e.to === edge.to,
    );
    if (dup || edge.from === edge.to) return null;
if (edge.type === "flow" && !edge.transition) {
      const t = LumennSettings.getTransitionDefaults();
      edge.transition = {
        scene: { type: t.sceneType, duration: t.sceneDuration, color: t.dipColor },
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
    const data = foundry.utils.duplicate(game.settings.get(MODULE_ID, LumennGraphStore.#GRAPHS_KEY));
    const graph = data.graphs.find((g) => g.id === graphId);
    const edge = graph?.edges?.find((e) => e.id === edgeId);
    if (!edge) return null;
    Object.assign(edge, patch);
    await game.settings.set(MODULE_ID, LumennGraphStore.#GRAPHS_KEY, data);
    return edge;
  }

  static async deleteEdge(graphId, edgeId) {
    if (!game.user.isGM) return false;
    const data = foundry.utils.duplicate(game.settings.get(MODULE_ID, LumennGraphStore.#GRAPHS_KEY));
    const graph = data.graphs.find((g) => g.id === graphId);
    if (!graph) return false;
    graph.edges = graph.edges.filter((e) => e.id !== edgeId);
    await game.settings.set(MODULE_ID, LumennGraphStore.#GRAPHS_KEY, data);
    return true;
  }

  /** Cria a aresta recíproca B->A a partir de uma FLOW edge A->B (se não existir). */
  static async addReturn(graphId, edgeId) {
    const data = foundry.utils.duplicate(game.settings.get(MODULE_ID, LumennGraphStore.#GRAPHS_KEY));
    const graph = data.graphs.find((g) => g.id === graphId);
    const edge = graph?.edges?.find((e) => e.id === edgeId);
    if (!edge || edge.type !== "flow") return null;
    const reverse = graph.edges.find(
      (e) => e.type === "flow" && e.from === edge.to && e.to === edge.from,
    );
    if (reverse) return reverse;
    const created = {
      id: `edge_${foundry.utils.randomID(16)}`,
      type: "flow",
      from: edge.to,
      to: edge.from,
      transition: JSON.parse(JSON.stringify(edge.transition ?? {})),
    };
    graph.edges.push(created);
    await game.settings.set(MODULE_ID, LumennGraphStore.#GRAPHS_KEY, data);
    return created;
  }

  /* ── Migração Schema v1 (Beats) → v2 (Graphs) ───────────────────── */

  /**
   * Migra o setting legado `storyboards` (schema v1) para `graphs` (v2),
   * sem apagar o legado. Não-destrutiva e idempotente: se já existe
   * schemaVersion 2, não faz nada.
   */
  static async migrate() {
    const data = foundry.utils.duplicate(game.settings.get(MODULE_ID, LumennGraphStore.#GRAPHS_KEY));
    if (data?.schemaVersion === SCHEMA_VERSION) return { migrated: false };

    const legacy =
      game.settings.get(MODULE_ID, LumennGraphStore.#LEGACY_KEY) ?? [];
    const next = { schemaVersion: SCHEMA_VERSION, graphs: [] };

    if (legacy.length) {
      // Backup obrigatório do legado antes de qualquer escrita v2.
      await game.settings.set(
        MODULE_ID,
        LumennGraphStore.#LEGACY_BACKUP_KEY,
        JSON.stringify(legacy),
      );
      const colors = this.getDefaultColors();
      const defaultFade = this.getDefaultCrossfadeDuration();

      for (const sb of legacy) {
        const graph = {
          id: `graph_${foundry.utils.randomID(16)}`,
          name: sb.name ?? "Novo Storyboard",
          activeNodeId: sb.activeBeatId ?? null,
          nodes: [],
          edges: [],
        };
        const audioMap = new Map();

        // Passo 1: Beats -> Scene Nodes (reutiliza o id do Beat como node id).
        for (const beat of sb.beats ?? []) {
          graph.nodes.push({
            id: beat.id,
            type: "scene",
            position: { ...(beat.position ?? { x: 80, y: 80 }) },
            color: colors.scene,
            size: "normal",
            notes: "",
            data: { sceneId: beat.sceneId ?? null },
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
              type: "audio",
              position: {
                x: (beat.position?.x ?? 80) + 320,
                y: beat.position?.y ?? 80,
              },
              color: colors.audio,
              size: "normal",
              notes: "",
              data: {
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
            type: "audio",
            from: audioId,
            to: beat.id,
          });
        }

        // Passo 3: connections -> FLOW edges (transição inicial vinda do crossfade do Beat).
        for (const beat of sb.beats ?? []) {
          for (const targetId of beat.connections ?? []) {
            graph.edges.push({
              id: `edge_${foundry.utils.randomID(16)}`,
              type: "flow",
              from: beat.id,
              to: targetId,
              transition: {
                scene: { type: "cut", duration: 0 },
                audio: {
                  mode: "auto",
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
    return { migrated: legacy.length > 0 };
  }
}
