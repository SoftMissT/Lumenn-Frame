import { LumennGraphStore } from "./graph-store.mjs";
import { LumennTransitionController } from "./transition-controller.mjs";
import { LumennCompat } from "./foundry-compat.mjs";
import { LumennSettings } from "./settings.mjs";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;
const { DragDrop } = foundry.applications.ux;

const MIN_ZOOM = 0.25;
const MAX_ZOOM = 2.0;
const ZOOM_STEP = 1.25;

const NODE_SIZES = {
  scene: { compact: [200, 140], normal: [260, 175], large: [340, 220] },
  audio: { compact: [180, 110], normal: [230, 135], large: [300, 170] },
  note: { compact: [170, 110], normal: [210, 140], large: [280, 180] },
};

const COLORS = [
  "#f0a321",
  "#2dd4bf",
  "#e45656",
  "#7aa2f7",
  "#bb9af7",
  "#9ece6a",
  "#73707c",
  "#ffffff",
];
const SIZES = ["compact", "normal", "large"];

function nodeSize(type, size) {
  return NODE_SIZES[type]?.[size] ?? NODE_SIZES[type]?.normal ?? [260, 175];
}

function fadeOverlay() {
  let el = document.getElementById("lumenn-fade");
  if (!el) {
    el = document.createElement("div");
    el.id = "lumenn-fade";
    el.style.cssText =
      "position:fixed;inset:0;background:#000;opacity:0;pointer-events:none;z-index:99999;transition:opacity .01s linear;";
    document.body.appendChild(el);
  }
  return el;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Aplica o fade de transição de Scene no cliente (GM executa; players espelham via socket). */
export async function lumennClientSceneFade(sceneId, sceneTrans = {}) {
  const el = fadeOverlay();
  const duration =
    sceneTrans?.type === "fade" ? (sceneTrans?.duration ?? 500) : 0;
  if (duration <= 0) return;
  el.style.transition = `opacity ${duration}ms ease`;
  el.style.opacity = "1";
  await sleep(duration);
  if (sceneId && LumennCompat.isGM())
    await LumennCompat.activateScene(game.scenes.get(sceneId));
  await sleep(40);
  el.style.opacity = "0";
  await sleep(duration);
}

/**
 * LumennGraphApp Graph Editor 2.0 (canvas + câmera + nodes + ports + edges + Inspector).
 * Editor visual dirigido por GM; modo Ao Vivo conduz transições por FLOW edges.
 */
export class LumennGraphApp extends HandlebarsApplicationMixin(ApplicationV2) {
  #controller = new LumennTransitionController();
  #graphId = null;
  #mode = "edit";
  #tool = "select";
  #camera = { panX: 0, panY: 0, zoom: 1 };
  #panState = null;
  #spaceDown = false;
  #resizeObserver = null;
  #dragDrop;
  #selected = { kind: null, id: null };
  #connectState = null;
  #expanded = false;
  #prevPosition = null;
  #transitioning = false;
  #suppressClick = false;

  static DEFAULT_OPTIONS = {
    id: "lumenn-storyboard",
    classes: ["lumenn-frame", "graph-editor", "app", "window-app"],
    title: "Lumenn Frame",
    tag: "div",
    position: { width: 1280, height: 820 },
    window: { resizable: true },
    dragDrop: [{ dropSelector: ".lf-viewport" }],
  };

  static PARTS = {
    main: { template: "modules/lumenn-frame/templates/storyboard.hbs" },
  };

  constructor(options = {}) {
    super(options);
    this.#dragDrop = this.#createDragDropHandlers();
    // Zoom inicial vindo das Settings (default 100%).
    this.#camera.zoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, LumennSettings.getCameraDefaults().zoom));
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        if (this.#connectState) {
          this.#connectState = null;
          this.#updateGhost();
        }
        if (this.#selected.kind) {
          this.#selected = { kind: null, id: null };
          this.render();
        }
      }
      if (e.code === "Space") {
        const t = e.target;
        if (
          t &&
          (t.matches?.("input, textarea, select") || t.isContentEditable)
        )
          return;
        if (!this.#spaceDown) {
          this.#spaceDown = true;
          this.element?.classList.add("space-hold");
        }
        e.preventDefault();
      }
    });
    document.addEventListener("keyup", (e) => {
      if (e.code === "Space") {
        this.#spaceDown = false;
        this.element?.classList.remove("space-hold");
      }
    });
  }

  #editable() {
    return this.#mode === "edit" && LumennCompat.isGM();
  }

  /* ── Drag/Drop wiring ───────────────────────────────────────────── */

  #createDragDropHandlers() {
    return this.options.dragDrop.map((d) => {
      d.permissions = { drop: () => this.#editable() };
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
    this.element.querySelector(".lf-viewport")?.classList.add("drag-over");
  }
  #onDragLeave() {
    this.element.querySelector(".lf-viewport")?.classList.remove("drag-over");
  }

  async #onDrop(event) {
    event.preventDefault();
    this.element.querySelector(".lf-viewport")?.classList.remove("drag-over");
    if (!this.#editable()) return;
    const data = LumennCompat.getDragData(event);
    const doc = await LumennCompat.resolveUuid(data?.uuid);
    if (!doc) return;

    const viewport = this.element.querySelector(".lf-viewport");
    const point = this.#clientToCanvas(event, viewport);
    const dropNode = event.target?.closest?.(".lf-node");
    if (dropNode?.dataset?.id)
      return this.#attachDrop(dropNode.dataset.id, doc);

    const items = this.#resolveDropItems(doc);
    if (!items.length) return;
    const graph = LumennGraphStore.getGraph(this.#graphId);
    const imp = LumennSettings.getImportDefaults();
    const created = [];
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      const [w, h] = nodeSize(item.type, "normal");
      const col = i % imp.columns;
      const row = Math.floor(i / imp.columns);
      const node = {
        id: `node_${foundry.utils.randomID(16)}`,
        type: item.type,
        position: {
          x: Math.round(point.x + col * (w + imp.gap)),
          y: Math.round(point.y + row * (h + imp.gap)),
        },
        data: { ...(item.data ?? {}) },
      };
      const createdNode = await LumennGraphStore.addNode(this.#graphId, node);
      if (createdNode) created.push(createdNode);
    }
    if (created.length && !graph?.activeNodeId)
      await LumennGraphStore.setActiveNode(this.#graphId, created[0].id);
    // Auto-connect (default OFF): encadeia Scene Nodes na ordem do import.
    if (imp.autoConnect) {
      const scenes = created.filter((n) => n.type === "scene");
      for (let i = 0; i < scenes.length - 1; i++) {
        await LumennGraphStore.addEdge(this.#graphId, {
          id: `edge_${foundry.utils.randomID(16)}`,
          type: "flow",
          from: scenes[i].id,
          to: scenes[i + 1].id,
        });
      }
    }
    this.#selected = { kind: "node", id: created[0]?.id ?? null };
    this.render();
  }

  #attachDrop(nodeId, doc) {
    const node = LumennGraphStore.getNode(this.#graphId, nodeId);
    if (!node) return;
    if (node.type === "scene" && doc.documentName === "Scene") {
      LumennGraphStore.updateNode(this.#graphId, nodeId, {
        data: { ...node.data, sceneId: doc.id },
      }).then(() => this.render());
    } else if (
      node.type === "scene" &&
      ["Playlist", "PlaylistSound"].includes(doc.documentName)
    ) {
      const [w] = nodeSize("audio", "normal");
      LumennGraphStore.addNode(this.#graphId, {
        id: `node_${foundry.utils.randomID(16)}`,
        type: "audio",
        position: { x: node.position.x + w + 40, y: node.position.y },
        data: {
          audioType: doc.documentName === "Playlist" ? "playlist" : "track",
          audioId: doc.documentName === "Playlist" ? doc.id : doc.uuid,
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
              type: "audio",
              from: audioNode.id,
              to: nodeId,
            }),
        )
        .then(() => this.render());
    }
  }

  #resolveDropItems(doc) {
    const imp = LumennSettings.getImportDefaults();
    const items = [];
    const audioDefaults = { volume: 0.75, loop: true, fadeIn: null, fadeOut: null };
    const push = (d, rootFolder) => {
      const folder = d.folder ?? rootFolder;
      const meta = {
        sourceFolderId: folder?.id ?? null,
        sourceFolderPath: folder?.path ?? null,
      };
      if (d.documentName === "Scene") {
        items.push({ type: "scene", data: { sceneId: d.id, ...meta } });
      } else if (d.documentName === "Playlist") {
        if (imp.tracksAsNodes) {
          for (const s of d.sounds ?? []) {
            items.push({ type: "audio", data: { audioType: "track", audioId: s.uuid, ...audioDefaults, ...meta } });
          }
        } else {
          items.push({ type: "audio", data: { audioType: "playlist", audioId: d.id, ...audioDefaults, ...meta } });
        }
      } else if (d.documentName === "PlaylistSound") {
        items.push({ type: "audio", data: { audioType: "track", audioId: d.uuid, ...audioDefaults, ...meta } });
      }
    };
    if (doc.documentName === "Folder") {
      const list =
        imp.recursive && typeof doc.getSubfolders === "function"
          ? LumennCompat.collectFolderDocuments(doc)
          : [...doc.contents];
      for (const d of list) push(d, doc);
    } else {
      push(doc, null);
    }
    return items;
  }

  /* ── Coordinates / Camera ────────────────────────────────────────── */

  #clientToScreen(event, viewport) {
    const r = viewport?.getBoundingClientRect() ?? { left: 0, top: 0 };
    return { x: event.clientX - r.left, y: event.clientY - r.top };
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
    const camEl = root.querySelector(".lf-camera");
    if (camEl)
      camEl.style.transform = `translate(${this.#camera.panX}px, ${this.#camera.panY}px) scale(${this.#camera.zoom})`;
    const pct = root.querySelector("[data-camera-percent]");
    if (pct) pct.textContent = `${Math.round(this.#camera.zoom * 100)}%`;
  }

  #zoomAt(screenPoint, zoom) {
    const cam = this.#camera;
    const w = this.#screenToWorld(screenPoint);
    zoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, zoom));
    cam.panX = screenPoint.x - w.x * zoom;
    cam.panY = screenPoint.y - w.y * zoom;
    cam.zoom = zoom;
    this.#applyCamera();
  }

  #fitAll(root) {
    const viewport = root.querySelector(".lf-viewport");
    if (!viewport) return;
    const graph = LumennGraphStore.getGraph(this.#graphId);
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
      const [w, h] = nodeSize(n.type, n.size);
      minX = Math.min(minX, n.position.x);
      minY = Math.min(minY, n.position.y);
      maxX = Math.max(maxX, n.position.x + w);
      maxY = Math.max(maxY, n.position.y + h);
    }
    const contentW = Math.max(1, maxX - minX);
    const contentH = Math.max(1, maxY - minY);
    const availW = Math.max(1, viewport.clientWidth - PAD * 2);
    const availH = Math.max(1, viewport.clientHeight - PAD * 2);
    let zoom = Math.min(availW / contentW, availH / contentH);
    zoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, zoom));
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
        ? game.i18n.localize("LUMENN_FRAME.Workspace.Restore")
        : game.i18n.localize("LUMENN_FRAME.Workspace.Expand");
  }

  /* ── Context ─────────────────────────────────────────────────────── */

  async _prepareContext() {
    if (LumennCompat.isGM() && !LumennGraphStore.getAll().length) {
      await LumennGraphStore.createGraph();
    }
    const graphs = LumennGraphStore.getAll();
    const activeGraph =
      graphs.find((g) => g.id === this.#graphId) ?? graphs[0] ?? null;
    if (activeGraph) this.#graphId = activeGraph.id;

    const L = (k) => game.i18n.localize(k);
    const navigable = new Set();
    if (this.#mode === "live" && activeGraph?.activeNodeId) {
      for (const e of activeGraph.edges ?? []) {
        if (e.type === "flow" && e.from === activeGraph.activeNodeId)
          navigable.add(e.to);
      }
    }

    const nodes = (activeGraph?.nodes ?? []).map((n) => {
      const [w, h] = nodeSize(n.type, n.size);
      const out = {
        ...n,
        width: w,
        height: h,
        isActive: n.id === activeGraph.activeNodeId,
        isNavigable: this.#mode === "live" && navigable.has(n.id),
        isDimmed:
          this.#mode === "live" &&
          LumennSettings.get("dimUnreachable") &&
          n.id !== activeGraph.activeNodeId &&
          !navigable.has(n.id),
        selected: this.#selected.kind === "node" && this.#selected.id === n.id,
        targetHi: this.#connectState?.targetHi === n.id,
      };
      if (n.type === "scene") {
        const scene = n.data?.sceneId ? game.scenes.get(n.data.sceneId) : null;
        out.sceneName =
          scene?.name ??
          (n.data?.sceneId
            ? L("LUMENN_FRAME.Beat.InvalidScene")
            : L("LUMENN_FRAME.Beat.NoScene"));
        out.sceneThumb = scene?.thumbnail ?? scene?.background?.src ?? null;
      } else if (n.type === "audio") {
        const label = this.#audioLabel(n.data);
        out.audioLabel = label.name;
        out.audioBadge = label.badge;
      }
      return out;
    });

    const inspector = this.#buildInspector(activeGraph);

    // Hint contextual de conexão (descobribilidade dos ports).
    let connectHint = null;
    if (this.#editable() && this.#connectState) {
      connectHint = this.#connectState.port.startsWith("flow")
        ? L("LUMENN_FRAME.Connect.HintFlowDrag")
        : L("LUMENN_FRAME.Connect.HintAudioDrag");
    } else if (this.#editable() && this.#tool === "connect") {
      connectHint = L("LUMENN_FRAME.Connect.HintIdle");
    }

    return {
      graphs,
      activeGraph,
      nodes,
      edgeCount: activeGraph?.edges?.length ?? 0,
      mode: this.#mode,
      tool: this.#tool,
      isGM: LumennCompat.isGM(),
      editable: this.#editable(),
      selectedKind: this.#selected.kind,
      connecting: !!this.#connectState,
      showConnectHint: !!connectHint,
      connectHint,
      transitioning: this.#transitioning,
      showEdgeLabels: LumennSettings.get("showTransitionLabels"),
      inspector,
      navigableIds: [...navigable],
      label: {
        editMode: L("LUMENN_FRAME.Toolbar.EditMode"),
        liveMode: L("LUMENN_FRAME.Toolbar.LiveMode"),
        expand: L("LUMENN_FRAME.Workspace.Expand"),
        restore: L("LUMENN_FRAME.Workspace.Restore"),
        emptyState: L("LUMENN_FRAME.EmptyState"),
        emptyHint: L("LUMENN_FRAME.EmptyHint"),
        dropHint: L("LUMENN_FRAME.DropHint"),
        select: L("LUMENN_FRAME.Tool.Select"),
        hand: L("LUMENN_FRAME.Tool.Hand"),
        connect: L("LUMENN_FRAME.Tool.Connect"),
        addScene: L("LUMENN_FRAME.Tool.AddScene"),
        addAudio: L("LUMENN_FRAME.Tool.AddAudio"),
        addNote: L("LUMENN_FRAME.Tool.AddNote"),
        graph: L("LUMENN_FRAME.Inspector.Graph"),
        scene: L("LUMENN_FRAME.Inspector.Scene"),
        audio: L("LUMENN_FRAME.Inspector.Audio"),
        note: L("LUMENN_FRAME.Inspector.Note"),
        flowEdge: L("LUMENN_FRAME.Inspector.FlowEdge"),
        audioEdge: L("LUMENN_FRAME.Inspector.AudioEdge"),
        none: L("LUMENN_FRAME.Config.None"),
        save: L("LUMENN_FRAME.Config.Save"),
        delete: L("LUMENN_FRAME.Beat.Delete"),
        setInitial: L("LUMENN_FRAME.Beat.SetStart"),
        addReturn: L("LUMENN_FRAME.Edge.AddReturn"),
        bidirectional: L("LUMENN_FRAME.Edge.Bidirectional"),
        color: L("LUMENN_FRAME.Inspector.Color"),
        size: L("LUMENN_FRAME.Inspector.Size"),
        notes: L("LUMENN_FRAME.Inspector.Notes"),
        name: L("LUMENN_FRAME.Inspector.Name"),
        sceneTrans: L("LUMENN_FRAME.Inspector.SceneTransition"),
        audioTrans: L("LUMENN_FRAME.Inspector.AudioTransition"),
        cut: L("LUMENN_FRAME.Edge.Cut"),
        fade: L("LUMENN_FRAME.Edge.Fade"),
        duration: L("LUMENN_FRAME.Inspector.Duration"),
        audioMode: L("LUMENN_FRAME.Inspector.AudioMode"),
        auto: L("LUMENN_FRAME.Edge.Auto"),
        keep: L("LUMENN_FRAME.Edge.Keep"),
        crossfade: L("LUMENN_FRAME.Edge.Crossfade"),
        fadeout: L("LUMENN_FRAME.Edge.FadeOut"),
        fadein: L("LUMENN_FRAME.Edge.FadeIn"),
        crossfadeDur: L("LUMENN_FRAME.Inspector.CrossfadeDur"),
        volume: L("LUMENN_FRAME.Inspector.Volume"),
        loop: L("LUMENN_FRAME.Inspector.Loop"),
        title: L("LUMENN_FRAME.Inspector.Title"),
        body: L("LUMENN_FRAME.Inspector.Body"),
        source: L("LUMENN_FRAME.Inspector.Source"),
        sceneDoc: L("LUMENN_FRAME.Config.Scene"),
        createGraph: L("LUMENN_FRAME.Toolbar.CreateStoryboard"),
        renameGraph: L("LUMENN_FRAME.Toolbar.RenameStoryboard"),
        deleteGraph: L("LUMENN_FRAME.Toolbar.DeleteStoryboard"),
        transition: L("LUMENN_FRAME.Transitioning"),
        from: L("LUMENN_FRAME.Edge.From"),
        to: L("LUMENN_FRAME.Edge.To"),
        fadeIn: L("LUMENN_FRAME.Inspector.FadeIn"),
        fadeOut: L("LUMENN_FRAME.Inspector.FadeOut"),
        connections: L("LUMENN_FRAME.Inspector.Connections"),
        outgoing: L("LUMENN_FRAME.Inspector.Outgoing"),
        incoming: L("LUMENN_FRAME.Inspector.Incoming"),
        addDestination: L("LUMENN_FRAME.Inspector.AddDestination"),
        attachAudio: L("LUMENN_FRAME.Inspector.AttachAudio"),
        noScenes: L("LUMENN_FRAME.Inspector.NoScenes"),
        noAudioNodes: L("LUMENN_FRAME.Inspector.NoAudioNodes"),
        editTransition: L("LUMENN_FRAME.Edge.EditTransition"),
      },
    };
  }

  #audioLabel(src) {
    if (!src?.audioType)
      return {
        name: game.i18n.localize("LUMENN_FRAME.Beat.NoAudio"),
        badge: "",
      };
    if (src.audioType === "playlist") {
      const p = game.playlists.get(src.audioId);
      return {
        name: p?.name ?? game.i18n.localize("LUMENN_FRAME.Beat.InvalidAudio"),
        badge: "PLAYLIST",
      };
    }
    for (const p of game.playlists ?? []) {
      const s = p.sounds?.get(src.audioId);
      if (s) return { name: s.name, badge: "TRACK" };
    }
    const byUuid = LumennCompat.resolveUuidSync(src.audioId);
    return {
      name:
        byUuid?.name ?? game.i18n.localize("LUMENN_FRAME.Beat.InvalidAudio"),
      badge: "TRACK",
    };
  }

  /* ── Render + bindings ──────────────────────────────────────────── */

  async _onRender(context, options) {
    await super._onRender(context, options);
    this.#dragDrop.forEach((d) => d.bind(this.element));
    const root = this.element;

    root
      .querySelectorAll("[data-action]")
      .forEach((el) => el.addEventListener("click", (e) => this.#action(e)));
    root.querySelectorAll("[data-tool]").forEach((el) =>
      el.addEventListener("click", (e) => {
        const tool = e.currentTarget.dataset.tool;
        this.#tool = tool;
        this.#selected = { kind: null, id: null };
        this.render();
      }),
    );
    const selector = root.querySelector("select[data-graph-selector]");
    selector?.addEventListener("change", (e) => {
      this.#graphId = e.target.value;
      this.#selected = { kind: null, id: null };
      this.render();
    });

    root
      .querySelectorAll(".lf-node")
      .forEach((node) => this.#bindNode(root, node));
    root
      .querySelectorAll("[data-port]")
      .forEach((port) =>
        port.addEventListener("pointerdown", (e) =>
          this.#startConnect(e, port),
        ),
      );
    root
      .querySelectorAll("[data-insp]")
      .forEach((el) =>
        el.addEventListener("change", (e) => this.#inspectorChange(e)),
      );
    root
      .querySelectorAll("[data-insp-input]")
      .forEach((el) =>
        el.addEventListener("input", (e) => this.#inspectorInput(e)),
      );
    root
      .querySelectorAll("[data-insp-action]")
      .forEach((el) =>
        el.addEventListener("click", (e) => this.#inspectorAction(e)),
      );
    root
      .querySelectorAll("[data-insp-swatch]")
      .forEach((el) =>
        el.addEventListener("click", (e) => this.#inspectorSwatch(e)),
      );

    this.#resizeWorld(root);
    this.#drawEdges(root);
    this.#applyCamera(root);
    this.#bindCamera(root);
    this.#observeResize(root);
    root
      .querySelector(".lf-viewport")
      ?.classList.toggle("connect-mode", this.#tool === "connect");
    root
      .querySelector(".lf-viewport")
      ?.addEventListener("click", (e) => this.#viewportClick(e));
    root
      .querySelectorAll(".lf-node")
      .forEach((node) =>
        node.addEventListener("click", (e) => this.#nodeClick(e)),
      );
    root
      .querySelector(".lf-edges")
      ?.addEventListener("click", (e) => this.#edgeClick(e));

    // Classe de modo para CSS (ports visíveis em edição, etc).
    root.classList.toggle("editing", this.#mode === "edit");
    // Workspace automático na 1ª abertura, se configurado.
    if (!this._workspaceAuto && LumennSettings.get("openInWorkspace") && !this.#expanded) {
      this._workspaceAuto = true;
      this.#toggleWorkspace(root);
    }
  }

  #bindNode(root, node) {
    if (!this.#editable()) return;
    node.addEventListener("pointerdown", (e) => {
      if (e.target.closest("button") || e.target.closest("[data-port]")) return;
      if (this.#spaceDown || e.button !== 0) return;
      if (this.#tool === "hand") return;
      e.preventDefault();
      this.#suppressClick = true;
      node.setPointerCapture(e.pointerId);
      const viewport = root.querySelector(".lf-viewport");
      const beat = LumennGraphStore.getNode(this.#graphId, node.dataset.id);
      const base = beat?.position ?? { x: 0, y: 0 };
      const w0 = this.#screenToWorld(this.#clientToScreen(e, viewport));
      const grab = { x: w0.x - base.x, y: w0.y - base.y };
      const move = (ev) => {
        const w = this.#screenToWorld(this.#clientToScreen(ev, viewport));
        node.style.left = `${Math.round(w.x - grab.x)}px`;
        node.style.top = `${Math.round(w.y - grab.y)}px`;
        this.#drawEdges(root);
      };
      const up = async (ev) => {
        node.releasePointerCapture(ev.pointerId);
        node.removeEventListener("pointermove", move);
        node.removeEventListener("pointerup", up);
        const w = this.#screenToWorld(this.#clientToScreen(ev, viewport));
        await LumennGraphStore.updateNode(this.#graphId, node.dataset.id, {
          position: {
            x: Math.round(w.x - grab.x),
            y: Math.round(w.y - grab.y),
          },
        });
        this.#resizeWorld(root);
        this.#drawEdges(root);
      };
      node.addEventListener("pointermove", move);
      node.addEventListener("pointerup", up, { once: true });
    });
  }

  #nodeClick(e) {
    const nodeEl = e.target.closest?.(".lf-node");
    if (!nodeEl) return;
    if (e.target.closest("button") || e.target.closest("[data-port]")) return;
    if (this.#mode === "live") {
      if (nodeEl.dataset.id && this.#isNavigable(nodeEl.dataset.id))
        this.#navigateTo(nodeEl.dataset.id);
      return;
    }
    if (this.#tool === "connect") return;
    this.#selected = { kind: "node", id: nodeEl.dataset.id };
    this.render();
  }

  #edgeClick(e) {
    const hit = e.target.closest?.(".lf-edge-hit");
    if (!hit?.dataset?.edgeId) return;
    if (this.#mode === "live") return;
    this.#selected = { kind: "edge", id: hit.dataset.edgeId };
    this.render();
  }

  #viewportClick(e) {
    if (this.#suppressClick) {
      this.#suppressClick = false;
      return;
    }
    if (
      e.target.closest(".lf-node") ||
      e.target.closest("[data-port]") ||
      e.target.closest(".lf-camera-bar")
    )
      return;
    if (this.#spaceDown) return;
    if (!this.#editable()) return;
    if (
      this.#tool === "scene" ||
      this.#tool === "audio" ||
      this.#tool === "note"
    ) {
      const point = this.#clientToCanvas(
        e,
        this.element.querySelector(".lf-viewport"),
      );
      this.#createNodeAt(this.#tool, point);
      return;
    }
    if (this.#selected.kind) {
      this.#selected = { kind: null, id: null };
      this.render();
    }
  }

  async #createNodeAt(type, point) {
    const [w, h] = nodeSize(type, "normal");
    const node = {
      id: `node_${foundry.utils.randomID(16)}`,
      type,
      position: {
        x: Math.round(point.x - w / 2),
        y: Math.round(point.y - h / 2),
      },
      data:
        type === "scene"
          ? { sceneId: null }
          : type === "audio"
            ? {
                audioType: null,
                audioId: null,
                volume: 0.75,
                loop: true,
                fadeIn: null,
                fadeOut: null,
              }
            : { title: "", body: "" },
    };
    const created = await LumennGraphStore.addNode(this.#graphId, node);
    if (created) {
      this.#selected = { kind: "node", id: created.id };
      this.render();
    }
  }

  #isNavigable(id) {
    const graph = LumennGraphStore.getGraph(this.#graphId);
    return !!graph?.edges?.some(
      (e) => e.type === "flow" && e.from === graph.activeNodeId && e.to === id,
    );
  }

  /* ── Camera bindings ────────────────────────────────────────────── */

  #bindCamera(root) {
    const viewport = root.querySelector(".lf-viewport");
    if (!viewport) return;
    viewport.addEventListener(
      "wheel",
      (e) => {
        e.preventDefault();
        const s = LumennSettings.get("zoomSpeed") / 100;
        const factor = Math.pow(1 + s, -e.deltaY * 0.01);
        this.#zoomAt(
          this.#clientToScreen(e, viewport),
          this.#camera.zoom * factor,
        );
      },
      { passive: false },
    );
    viewport.addEventListener("pointerdown", (e) => {
      const isPan = (this.#spaceDown && e.button === 0) || e.button === 1;
      if (!isPan) return;
      e.preventDefault();
      this.#suppressClick = true;
      viewport.setPointerCapture(e.pointerId);
      this.#panState = { id: e.pointerId, x: e.clientX, y: e.clientY };
      viewport.classList.add("panning");
    });
    viewport.addEventListener("pointermove", (e) => {
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
        viewport.classList.remove("panning");
      }
    };
    viewport.addEventListener("pointerup", endPan);
    viewport.addEventListener("pointercancel", endPan);

    root.querySelectorAll("[data-camera]").forEach((btn) =>
      btn.addEventListener("click", (e) => {
        const act = e.currentTarget.dataset.camera;
        const center = {
          x: viewport.clientWidth / 2,
          y: viewport.clientHeight / 2,
        };
        if (act === "zoom-in")
          this.#zoomAt(center, this.#camera.zoom * ZOOM_STEP);
        else if (act === "zoom-out")
          this.#zoomAt(center, this.#camera.zoom / ZOOM_STEP);
        else if (act === "reset") this.#zoomAt(center, 1);
        else if (act === "fit") this.#fitAll(root);
      }),
    );
  }

  #observeResize(root) {
    const viewport = root.querySelector(".lf-viewport");
    if (!viewport) return;
    this.#resizeObserver?.disconnect();
    this.#resizeObserver = new ResizeObserver(() => {
      this.#resizeWorld(root);
      this.#drawEdges(root);
    });
    this.#resizeObserver.observe(viewport);
  }

  #resizeWorld(root) {
    const viewport = root.querySelector(".lf-viewport");
    const world = root.querySelector(".lf-camera");
    if (!viewport || !world) return;
    const graph = LumennGraphStore.getGraph(this.#graphId);
    let maxX = viewport.clientWidth,
      maxY = viewport.clientHeight;
    for (const n of graph?.nodes ?? []) {
      const [w, h] = nodeSize(n.type, n.size);
      maxX = Math.max(maxX, n.position.x + w + 80);
      maxY = Math.max(maxY, n.position.y + h + 80);
    }
    world.style.width = `${maxX}px`;
    world.style.height = `${maxY}px`;
  }

  /* ── Edges ──────────────────────────────────────────────────────── */

  #portAnchor(nodeId, port) {
    const node = LumennGraphStore.getNode(this.#graphId, nodeId);
    if (!node) return { x: 0, y: 0 };
    const [w, h] = nodeSize(node.type, node.size);
    const p = node.position;
    if (port === "flow-out") return { x: p.x + w, y: p.y + h * 0.3 };
    if (port === "flow-in") return { x: p.x, y: p.y + h * 0.3 };
    if (port === "audio-out") return { x: p.x + w, y: p.y + h * 0.62 };
    return { x: p.x, y: p.y + h * 0.62 };
  }

  #drawEdges(root) {
    const svg = root.querySelector(".lf-edges");
    const graph = LumennGraphStore.getGraph(this.#graphId);
    if (!svg) return;
    svg.innerHTML = "";
    for (const e of graph?.edges ?? []) {
      const from = LumennGraphStore.getNode(this.#graphId, e.from);
      const to = LumennGraphStore.getNode(this.#graphId, e.to);
      if (!from || !to) continue;
      const a =
        e.type === "flow"
          ? this.#portAnchor(e.from, "flow-out")
          : this.#portAnchor(e.from, "audio-out");
      const b =
        e.type === "flow"
          ? this.#portAnchor(e.to, "flow-in")
          : this.#portAnchor(e.to, "audio-in");
      const hasReverse =
        e.type === "flow" &&
        graph.edges.some(
          (x) => x.type === "flow" && x.from === e.to && x.to === e.from,
        );
      const bend = e.type === "flow" ? (e.from < e.to ? 36 : -36) : 18;
      const midX = (a.x + b.x) / 2;
      const d = `M ${a.x} ${a.y} C ${midX} ${a.y + bend}, ${midX} ${b.y + bend}, ${b.x} ${b.y}`;

      const path = document.createElementNS(
        "http://www.w3.org/2000/svg",
        "path",
      );
      path.setAttribute("d", d);
      path.setAttribute("fill", "none");
      path.setAttribute("class", "lf-edge");
      path.setAttribute("data-edge-id", e.id);
      const selected =
        this.#selected.kind === "edge" && this.#selected.id === e.id;
      if (e.type === "flow") {
        path.style.stroke = selected
          ? "#ffffff"
          : from.id === graph.activeNodeId
            ? "var(--lf-amber)"
            : "var(--lf-muted)";
        path.setAttribute("stroke-width", selected ? 3 : 2);
        path.setAttribute("opacity", selected ? 1 : 0.8);
        const angle = Math.atan2(b.y - a.y, b.x - a.x);
        const ax = b.x - 8 * Math.cos(angle),
          ay = b.y - 8 * Math.sin(angle);
        const arrow = document.createElementNS(
          "http://www.w3.org/2000/svg",
          "polygon",
        );
        arrow.setAttribute(
          "points",
          `${b.x},${b.y} ${ax - 5 * Math.cos(angle - Math.PI / 6)},${ay - 5 * Math.sin(angle - Math.PI / 6)} ${ax - 5 * Math.cos(angle + Math.PI / 6)},${ay - 5 * Math.sin(angle + Math.PI / 6)}`,
        );
        arrow.style.fill = selected
          ? "#ffffff"
          : from.id === graph.activeNodeId
            ? "var(--lf-amber)"
            : "var(--lf-muted)";
        arrow.setAttribute("opacity", selected ? 1 : 0.8);
        svg.appendChild(arrow);
      } else {
        path.style.stroke = selected ? "#ffffff" : "var(--lf-teal)";
        path.setAttribute("stroke-width", selected ? 2.5 : 1.5);
        path.setAttribute("stroke-dasharray", "6 4");
        path.setAttribute("opacity", selected ? 1 : 0.7);
      }
      svg.appendChild(path);

      // Label central da FLOW edge (config da transição visível no grafo).
      if (e.type === "flow" && LumennSettings.get("showTransitionLabels") && this.#camera.zoom >= 0.45) {
        const label = this.#edgeLabelText(e);
        if (label) {
          const lx = midX;
          const ly = (a.y + b.y) / 2 + bend - 4;
          const text = document.createElementNS(
            "http://www.w3.org/2000/svg",
            "text",
          );
          text.setAttribute("x", lx);
          text.setAttribute("y", ly);
          text.setAttribute("text-anchor", "middle");
          text.setAttribute("font-size", "11");
          text.setAttribute("font-family", "var(--lf-font-body)");
          text.style.fill = "var(--lf-text)";
          text.style.stroke = "#101014";
          text.setAttribute("stroke-width", "3");
          text.setAttribute("stroke-linejoin", "round");
          text.setAttribute("paint-order", "stroke");
          text.setAttribute("class", "lf-edge-label");
          text.textContent = label;
          svg.appendChild(text);
        }
      }

      const hit = document.createElementNS(
        "http://www.w3.org/2000/svg",
        "path",
      );
      hit.setAttribute("d", d);
      hit.setAttribute("fill", "none");
      hit.setAttribute("stroke", "transparent");
      hit.setAttribute("stroke-width", "16");
      hit.setAttribute("class", "lf-edge-hit");
      hit.setAttribute("data-edge-id", e.id);
      hit.setAttribute(
        "title",
        `${this.#nodeLabel(from)} → ${this.#nodeLabel(to)} — ${game.i18n.localize("LUMENN_FRAME.Edge.EditTransition")}`,
      );
      svg.appendChild(hit);
    }
    const ghost = document.createElementNS(
      "http://www.w3.org/2000/svg",
      "path",
    );
    ghost.setAttribute("class", "lf-ghost");
    ghost.setAttribute("fill", "none");
    ghost.setAttribute("stroke", "var(--lf-teal)");
    ghost.setAttribute("stroke-width", "2");
    ghost.setAttribute("stroke-dasharray", "6 4");
    ghost.setAttribute("d", this.#connectState ? this.#ghostPath() : "");
    svg.appendChild(ghost);
  }

  #ghostPath() {
    if (!this.#connectState) return "";
    const from = this.#portAnchor(
      this.#connectState.nodeId,
      this.#connectState.port,
    );
    const viewport = this.element.querySelector(".lf-viewport");
    const to = this.#screenToWorld(
      this.#clientToScreen(
        { clientX: this.#connectState.x, clientY: this.#connectState.y },
        viewport,
      ),
    );
    const midX = (from.x + to.x) / 2;
    return `M ${from.x} ${from.y} C ${midX} ${from.y}, ${midX} ${to.y}, ${to.x} ${to.y}`;
  }

  #updateGhost() {
    const svg = this.element.querySelector(".lf-edges");
    const ghost = svg?.querySelector(".lf-ghost");
    if (ghost) ghost.setAttribute("d", this.#ghostPath());
  }

  /** Texto do label central da FLOW edge: "Fade 1.0s · ♫ Auto 3.0s". */
  #edgeLabelText(e) {
    const t = e.transition;
    if (!t) return null;
    const L = (k) => game.i18n.localize(k);
    const sec = (v) => `${((v ?? 0) / 1000).toFixed(1)}s`;
    const sceneLbl = (t.scene?.type === "fade" ? L("LUMENN_FRAME.Edge.Fade") : L("LUMENN_FRAME.Edge.Cut"));
    const modeKey = {
      auto: "LUMENN_FRAME.Edge.Auto",
      keep: "LUMENN_FRAME.Edge.Keep",
      crossfade: "LUMENN_FRAME.Edge.Crossfade",
      fadeout: "LUMENN_FRAME.Edge.FadeOut",
      fadein: "LUMENN_FRAME.Edge.FadeIn",
      cut: "LUMENN_FRAME.Edge.Cut",
    }[t.audio?.mode ?? "auto"];
    return `${sceneLbl} ${sec(t.scene?.duration)} · ${L(modeKey)} ${sec(t.audio?.crossfadeDuration)}`;
  }

  /* ── Connect (port → port) ──────────────────────────────────────── */

  #startConnect(e, port) {
    if (!this.#editable() || this.#tool === "hand") return;
    e.preventDefault();
    e.stopPropagation();
    const viewport = this.element.querySelector(".lf-viewport");
    viewport.setPointerCapture(e.pointerId);
    this.#connectState = {
      nodeId: port.dataset.node,
      port: port.dataset.port,
      x: e.clientX,
      y: e.clientY,
      targetNodeId: null,
      targetPort: null,
    };
    this.#updateGhost();
    const move = (ev) => {
      this.#connectState.x = ev.clientX;
      this.#connectState.y = ev.clientY;
      this.#updateGhost();
      this.#highlightTarget(ev);
    };
    const up = (ev) => {
      viewport.removeEventListener("pointermove", move);
      viewport.removeEventListener("pointerup", up);
      this.#finishConnect(ev);
    };
    viewport.addEventListener("pointermove", move);
    viewport.addEventListener("pointerup", up, { once: true });
  }

  #highlightTarget(ev) {
    const el = document
      .elementFromPoint(ev.clientX, ev.clientY)
      ?.closest?.("[data-port]");
    const nodeId = el?.dataset?.node ?? null;
    const port = el?.dataset?.port ?? null;
    if (this.#connectState.targetNodeId === nodeId) return;
    this.#connectState.targetNodeId = nodeId;
    this.#connectState.targetPort = port;
    const root = this.element;
    root
      .querySelectorAll(".lf-node.target-hi")
      .forEach((n) => n.classList.remove("target-hi"));
    if (nodeId)
      root
        .querySelector(`.lf-node[data-id="${nodeId}"]`)
        ?.classList.add("target-hi");
  }

  #finishConnect(ev) {
    const state = this.#connectState;
    this.#connectState = null;
    this.#updateGhost();
    this.element
      .querySelectorAll(".lf-node.target-hi")
      .forEach((n) => n.classList.remove("target-hi"));
    if (!state) return;
    // Usa o alvo rastreado durante o move; fallback elementFromPoint.
    const hitEl = document
      .elementFromPoint(ev.clientX, ev.clientY)
      ?.closest?.("[data-port]");
    const toNodeId = state.targetNodeId ?? hitEl?.dataset?.node ?? null;
    const toPort = state.targetPort ?? hitEl?.dataset?.port ?? null;
    if (!toNodeId || toNodeId === state.nodeId) return;
    const valid =
      (state.port === "flow-out" && toPort === "flow-in") ||
      (state.port === "audio-out" && toPort === "audio-in");
    if (!valid) return;
    const edge = {
      id: `edge_${foundry.utils.randomID(16)}`,
      type: state.port === "flow-out" ? "flow" : "audio",
      from: state.nodeId,
      to: toNodeId,
    };
    // MVP: uma fonte musical principal por Scene — rejeita a 2ª AUDIO edge.
    if (edge.type === "audio") {
      const graph = LumennGraphStore.getGraph(this.#graphId);
      const already = (graph?.edges ?? []).some(
        (e) => e.type === "audio" && e.to === toNodeId,
      );
      if (already) {
        ui.notifications.warn(
          game.i18n.localize("LUMENN_FRAME.WarnSingleAudioAttachment"),
        );
        this.render();
        return;
      }
    }
    LumennGraphStore.addEdge(this.#graphId, edge).then((created) => {
      if (created) {
        // Auto-seleciona a edge nova → Inspector da transição abre imediatamente.
        this.#selected = { kind: "edge", id: created.id };
        this.render();
      }
    });
  }

  /* ── Top-bar actions ─────────────────────────────────────────────── */

  async #action(event) {
    event.preventDefault();
    const action = event.currentTarget.dataset.action;
    const root = this.element;
    if (action === "toggle-mode") {
      this.#mode = this.#mode === "edit" ? "live" : "edit";
      this.#selected = { kind: null, id: null };
      return this.render();
    }
    if (action === "workspace-toggle") return this.#toggleWorkspace(root);
    if (!LumennCompat.isGM() || this.#mode !== "edit") return;
    if (action === "create-graph") {
      const raw = await foundry.applications.api.DialogV2.prompt({
        window: {
          title: game.i18n.localize("LUMENN_FRAME.Toolbar.CreateStoryboard"),
        },
        content: `<input type="text" name="name" value="Novo Storyboard" autofocus>`,
        ok: {
          label: game.i18n.localize("LUMENN_FRAME.Config.Save"),
          callback: (ev, btn) => btn.form.elements.name.value,
        },
      });
      const name = (typeof raw === "string" ? raw : (raw?.name ?? ""))
        .toString()
        .trim();
      if (!name) return;
      const g = await LumennGraphStore.createGraph(name);
      this.#graphId = g?.id ?? this.#graphId;
      this.render();
    }
  }

  #setPath(obj, path, val) {
    const parts = path.split(".");
    let cur = obj;
    for (let i = 0; i < parts.length - 1; i++) {
      if (!cur[parts[i]]) cur[parts[i]] = {};
      cur = cur[parts[i]];
    }
    cur[parts[parts.length - 1]] = val;
  }

  #inspectorChange(e) {
    const path = e.currentTarget.dataset.insp;
    let val =
      e.currentTarget.type === "checkbox"
        ? e.currentTarget.checked
        : e.currentTarget.value;
    if (
      typeof val === "string" &&
      /Duration|volume|fadeIn|fadeOut|duration/.test(path)
    )
      val = Number(val) || null;
    const kind = this.#selected.kind;
    const id = this.#selected.id;
    if (!path || !kind || !id) return;
    if (kind === "node") {
      const node = LumennGraphStore.getNode(this.#graphId, id);
      const patch = {};
      this.#setPath(patch, path, val);
      LumennGraphStore.updateNode(this.#graphId, id, {
        ...patch,
        data: { ...node.data, ...(patch.data ?? {}) },
      }).then(() => this.render());
    } else if (kind === "edge") {
      const patch = {};
      this.#setPath(patch, path, val);
      LumennGraphStore.updateEdge(this.#graphId, id, patch).then(() =>
        this.render(),
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
      if (!path || !kind || !id) return;
      if (kind === "node") {
        const node = LumennGraphStore.getNode(this.#graphId, id);
        const patch = {};
        this.#setPath(patch, path, val);
        LumennGraphStore.updateNode(this.#graphId, id, {
          ...patch,
          data: { ...node.data, ...(patch.data ?? {}) },
        }).then(() => this.render());
      } else if (kind === "edge") {
        const patch = {};
        this.#setPath(patch, path, val);
        LumennGraphStore.updateEdge(this.#graphId, id, patch).then(() =>
          this.render(),
        );
      }
    }, 300);
  }

  #inspectorAction(e) {
    if (!this.#editable()) return;
    const action = e.currentTarget.dataset.inspAction;
    const root = this.element;
    if (action === "set-initial") {
      LumennGraphStore.setActiveNode(this.#graphId, this.#selected.id).then(
        () => this.render(),
      );
    } else if (action === "delete-node") {
      LumennGraphStore.deleteNode(this.#graphId, this.#selected.id).then(() => {
        this.#selected = { kind: null, id: null };
        this.render();
      });
    } else if (action === "delete-edge") {
      const edgeId = e.currentTarget.dataset.inspEdge ?? this.#selected.id;
      LumennGraphStore.deleteEdge(this.#graphId, edgeId).then(() => {
        this.#selected = { kind: null, id: null };
        this.render();
      });
    } else if (action === "add-flow") {
      const targetId = root.querySelector('[data-insp-pick="flowTarget"]')?.value;
      if (targetId && this.#selected.kind === "node") {
        const edge = { id: `edge_${foundry.utils.randomID(16)}`, type: "flow", from: this.#selected.id, to: targetId };
        LumennGraphStore.addEdge(this.#graphId, edge).then((created) => {
          if (created) { this.#selected = { kind: "edge", id: created.id }; this.render(); }
        });
      }
    } else if (action === "attach-audio") {
      const audioId = root.querySelector('[data-insp-pick="audioAttach"]')?.value;
      if (audioId && this.#selected.kind === "node") {
        const graph = LumennGraphStore.getGraph(this.#graphId);
        const already = (graph?.edges ?? []).some(
          (e) => e.type === "audio" && e.to === this.#selected.id,
        );
        if (already) {
          ui.notifications.warn(
            game.i18n.localize("LUMENN_FRAME.WarnSingleAudioAttachment"),
          );
          return;
        }
        const edge = { id: `edge_${foundry.utils.randomID(16)}`, type: "audio", from: audioId, to: this.#selected.id };
        LumennGraphStore.addEdge(this.#graphId, edge).then((created) => {
          if (created) { this.#selected = { kind: "edge", id: created.id }; this.render(); }
        });
      }
    } else if (action === "preview-transition") {
      const edge = LumennGraphStore.getEdge(this.#graphId, this.#selected.id);
      if (edge?.type !== "flow") return;
      const target = LumennGraphStore.getNode(this.#graphId, edge.to);
      const scene = target?.data?.sceneId
        ? game.scenes.get(target.data.sceneId)
        : null;
      const sceneTrans = edge.transition?.scene ?? { type: "cut", duration: 0 };
      LumennCompat.runSceneTransition({
        scene,
        type: sceneTrans.type ?? "cut",
        duration: sceneTrans.duration ?? 1000,
        color: sceneTrans.color ?? "#000000",
      });
    } else if (action === "add-return") {
      LumennGraphStore.addReturn(this.#graphId, this.#selected.id).then(() =>
        this.render(),
      );
    } else if (action === "rename-graph") {
      const graph = LumennGraphStore.getGraph(this.#graphId);
      foundry.applications.api.DialogV2.prompt({
        window: {
          title: game.i18n.localize("LUMENN_FRAME.Toolbar.RenameStoryboard"),
        },
        content: `<input type="text" name="name" value="${String(graph?.name ?? "").replace(/"/g, "&quot;")}" autofocus>`,
        ok: {
          label: game.i18n.localize("LUMENN_FRAME.Config.Save"),
          callback: (ev, btn) => btn.form.elements.name.value,
        },
      }).then((raw) => {
        const name = (typeof raw === "string" ? raw : (raw?.name ?? ""))
          .toString()
          .trim();
        if (name)
          LumennGraphStore.renameGraph(this.#graphId, name).then(() =>
            this.render(),
          );
      });
    } else if (action === "delete-graph") {
      foundry.applications.api.DialogV2.confirm({
        title: game.i18n.localize("LUMENN_FRAME.Toolbar.DeleteStoryboard"),
        content: game.i18n.localize("LUMENN_FRAME.ConfirmDeleteStoryboard"),
        yes: { label: game.i18n.localize("LUMENN_FRAME.Beat.Delete") },
        no: { label: game.i18n.localize("LUMENN_FRAME.Config.Cancel") },
      }).then((ok) => {
        if (ok)
          LumennGraphStore.deleteGraph(this.#graphId).then(() => {
            this.#graphId = null;
            this.#selected = { kind: null, id: null };
            this.render();
          });
      });
    }
  }

  #inspectorSwatch(e) {
    if (!this.#editable()) return;
    const color = e.currentTarget.dataset.color;
    if (!color) return;
    const kind = this.#selected.kind;
    const id = this.#selected.id;
    if (kind !== "node" || !id) return;
    LumennGraphStore.updateNode(this.#graphId, id, { color }).then(() =>
      this.render(),
    );
  }

  /* ── Live navigation ────────────────────────────────────────────── */

  #audioSourcesFor(graph, nodeId) {
    const sources = [];
    for (const e of graph?.edges ?? []) {
      if (e.type !== "audio" || e.to !== nodeId) continue;
      const n = graph.nodes.find((x) => x.id === e.from);
      if (n?.type === "audio" && n.data?.audioType && n.data?.audioId) {
        sources.push({
          type: n.data.audioType === "playlist" ? "playlist" : "track",
          id: n.data.audioId,
        });
      }
    }
    return sources;
  }

  async #navigateTo(id) {
    if (this.#transitioning) return;
    const graph = LumennGraphStore.getGraph(this.#graphId);
    const edge = graph?.edges?.find(
      (e) => e.type === "flow" && e.from === graph.activeNodeId && e.to === id,
    );
    if (!edge) return;
    if (LumennSettings.get("confirmSceneTransition")) {
      const ok = await foundry.applications.api.DialogV2.confirm({
        title: game.i18n.localize("LUMENN_FRAME.Toolbar.LiveMode"),
        content: game.i18n.localize("LUMENN_FRAME.ConfirmTransition"),
        yes: { label: game.i18n.localize("LUMENN_FRAME.Edge.Go") },
        no: { label: game.i18n.localize("LUMENN_FRAME.Config.Cancel") },
      });
      if (!ok) return;
    }
    this.#transitioning = true;
    await this.render();
    try {
      const sceneTrans = edge.transition?.scene ?? { type: "cut", duration: 0 };
      const audioTrans = edge.transition?.audio ?? {
        mode: "auto",
        crossfadeDuration: LumennGraphStore.getDefaultCrossfadeDuration(),
      };
      const targetNode = graph.nodes.find((n) => n.id === id);
      const scene = targetNode?.data?.sceneId
        ? game.scenes.get(targetNode.data.sceneId)
        : null;
      const currentSources = this.#audioSourcesFor(graph, graph.activeNodeId);
      const targetSources = this.#audioSourcesFor(graph, id);
      LumennCompat.socketEmit({
        type: "transition:start",
        sceneId: scene?.id ?? null,
        sceneTrans,
        audioTrans,
      });
      // Scene transition: V14 nativa quando disponível; fallback Lumenn fade/dip.
      const scResult = await LumennCompat.runSceneTransition({
        scene,
        type: sceneTrans.type ?? "cut",
        duration: sceneTrans.duration ?? 1000,
        color: sceneTrans.color ?? "#000000",
      });
      if (scResult === "fallback") {
        await lumennClientSceneFade(scene?.id ?? null, sceneTrans);
      }
      const result = await this.#controller.goToAudio(
        currentSources,
        targetSources,
        audioTrans,
        LumennGraphStore.getDefaultCrossfadeDuration(),
        audioTrans?.curve ?? "linear",
      );
      if (result === "invalid-source")
        ui.notifications.warn(
          game.i18n.localize("LUMENN_FRAME.WarnInvalidAudioSource"),
        );
      await LumennGraphStore.setActiveNode(this.#graphId, id);
      LumennCompat.socketEmit({ type: "transition:end" });
    } finally {
      this.#transitioning = false;
      await this.render();
    }
  }

  /* ── Inspector context ──────────────────────────────────────────── */

  #nodeLabel(node) {
    if (node.type === "scene") {
      const s = node.data?.sceneId ? game.scenes.get(node.data.sceneId) : null;
      return s?.name ?? "Scene";
    }
    if (node.type === "audio") return this.#audioLabel(node.data).name;
    return node.data?.title || "Note";
  }

  #buildInspector(graph) {
    const base = {
      colors: COLORS,
      sizes: SIZES,
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
    if (this.#selected.kind === "node") {
      const node = graph?.nodes?.find((n) => n.id === this.#selected.id);
      if (node) {
        const edges = (graph?.edges ?? [])
          .filter((e) => e.from === node.id || e.to === node.id)
          .map((e) => ({
            ...e,
            fromLabel: this.#nodeLabel(
              graph.nodes.find((n) => n.id === e.from),
            ),
            toLabel: this.#nodeLabel(graph.nodes.find((n) => n.id === e.to)),
          }));
        return {
          ...base,
          kind: "node",
          node,
          nodeType: node.type,
          nodeEdges: edges,
          flowTargets: (graph?.nodes ?? [])
            .filter((n) => n.type === "scene" && n.id !== node.id)
            .map((n) => ({ id: n.id, name: this.#nodeLabel(n) })),
          audioNodes: (graph?.nodes ?? [])
            .filter((n) => n.type === "audio")
            .map((n) => ({ id: n.id, name: this.#nodeLabel(n) })),
        };
      }
    }
    if (this.#selected.kind === "edge") {
      const edge = graph?.edges?.find((e) => e.id === this.#selected.id);
      if (edge) {
        const from = graph.nodes.find((n) => n.id === edge.from);
        const to = graph.nodes.find((n) => n.id === edge.to);
        const reverse =
          edge.type === "flow" &&
          graph.edges.some(
            (x) =>
              x.type === "flow" && x.from === edge.to && x.to === edge.from,
          );
        return {
          ...base,
          kind: "edge",
          edge,
          edgeType: edge.type,
          fromLabel: from ? this.#nodeLabel(from) : edge.from,
          toLabel: to ? this.#nodeLabel(to) : edge.to,
          reverse,
          sceneTransitions: LumennCompat.getSceneTransitions(),
          hasNativeTransitions: LumennCompat.hasNativeSceneTransitions(),
          curveOptions: ["linear", "equal-power"],
        };
      }
    }
    return { ...base, kind: "graph" };
  }
}
