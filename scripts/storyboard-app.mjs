import { LumennBeatStore } from "./beat-store.mjs";
import { LumennTransitionController } from "./transition-controller.mjs";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;
const { DragDrop, TextEditor } = foundry.applications.ux;

// Dimensões do Beat e folga do mundo (canvas) — sistema único de coordenadas.
const BEAT_W = 120;
const BEAT_H = 190;
const WORLD_PAD = 80;

/** GM storyboard editor/live controller. Domain state remains in BeatStore. */
export class LumennStoryboardApp extends HandlebarsApplicationMixin(ApplicationV2) {
  #controller = new LumennTransitionController();
  #storyboardId = null;
  #mode = "edit";
  #transitioning = false;
  #pendingLinkId = null;
  #resizeObserver = null;
  #dragDrop;

  static DEFAULT_OPTIONS = {
    id: "lumenn-storyboard",
    classes: ["lumenn-frame", "storyboard", "app", "window-app"],
    title: "Lumenn Frame",
    tag: "div",
    position: { width: 1000, height: 720 },
    window: { resizable: true },
    dragDrop: [
      { dropSelector: ".lf-canvas" },
    ],
  };

  static PARTS = {
    main: { template: "modules/lumenn-frame/templates/storyboard.hbs" },
  };

  constructor(options = {}) {
    super(options);
    this.#dragDrop = this.#createDragDropHandlers();
    // Escape cancela o modo de linkagem pendente.
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && this.#pendingLinkId) {
        this.#pendingLinkId = null;
        this.render();
      }
    });
  }

  /* ── Drag/Drop wiring (ApplicationV2 manual pattern) ─────────────── */

  #createDragDropHandlers() {
    return this.options.dragDrop.map((d) => {
      d.permissions = {
        drop: this.#canDrop.bind(this),
      };
      d.callbacks = {
        dragover: this.#onDragOver.bind(this),
        dragleave: this.#onDragLeave.bind(this),
        drop: this.#onDrop.bind(this),
      };
      return new DragDrop(d);
    });
  }

  #canDrop() { return !!game.user?.isGM && this.#mode === "edit"; }

  #onDragOver(event) {
    event.preventDefault();
    this.element.querySelector(".lf-canvas")?.classList.add("drag-over");
  }

  #onDragLeave(event) {
    this.element.querySelector(".lf-canvas")?.classList.remove("drag-over");
  }

  async #onDrop(event) {
    event.preventDefault();
    this.element.querySelector(".lf-canvas")?.classList.remove("drag-over");
    if (!game.user?.isGM || this.#mode !== "edit") return;

    const data = TextEditor.getDragEventData(event);
    const uuid = data?.uuid;
    if (!uuid) return;
    let doc;
    try { doc = await fromUuid(uuid); } catch { return; }
    if (!doc) return;

    const viewport = this.element.querySelector(".lf-canvas");
    const point = this.#clientToCanvas(event, viewport);
    const position = {
      x: Math.max(0, Math.round(point.x - BEAT_W / 2)),
      y: Math.max(0, Math.round(point.y - 30)),
    };

    // ── Drop on a specific beat: override scene/audio ──
    const targetNode = event.target?.closest?.(".beat-node");
    if (targetNode?.dataset?.id) {
      const patch = {};
      if (doc.documentName === "Scene") patch.sceneId = doc.id;
      else if (doc.documentName === "Playlist") patch.audioSource = { type: "playlist", id: doc.id };
      else if (doc.documentName === "PlaylistSound") patch.audioSource = { type: "track", id: doc.uuid };
      else return;
      await LumennBeatStore.updateBeat(this.#storyboardId, targetNode.dataset.id, patch);
      return this.render();
    }

    // ── Drop on empty canvas: create beats, auto-link sequence, auto-set start ──
    const docs = this.#resolveDropDocs(doc);
    const created = [];
    let offsetX = 0;
    for (const d of docs) {
      const beatData = { position: { x: position.x + offsetX, y: position.y } };
      if (d.documentName === "Scene") beatData.sceneId = d.id;
      else if (d.documentName === "Playlist") beatData.audioSource = { type: "playlist", id: d.id };
      else if (d.documentName === "PlaylistSound") beatData.audioSource = { type: "track", id: d.uuid };
      else continue;
      const beat = await LumennBeatStore.createBeat(this.#storyboardId, beatData);
      if (beat) created.push(beat);
      offsetX += BEAT_W + 20;
    }
    // Automatização: sequência de drops vira uma cadeia linkada
    for (let i = 0; i < created.length - 1; i++) {
      await LumennBeatStore.connectBeats(this.#storyboardId, created[i].id, created[i + 1].id);
    }
    // Primeiro beat criado vira o start se ainda não houver
    const s = LumennBeatStore.getStoryboard(this.#storyboardId);
    if (created.length && !s?.activeBeatId) {
      await LumennBeatStore.setActiveBeat(this.#storyboardId, created[0].id);
    }
    this.render();
  }

  #resolveDropDocs(doc) {
    if (doc.documentName === "Folder") {
      return doc.contents.filter((c) => ["Scene", "Playlist", "PlaylistSound"].includes(c.documentName));
    }
    return [doc];
  }

  /** Converte coordenadas de evento (client) para o sistema do WORLD do canvas. */
  #clientToCanvas(event, viewport) {
    const rect = viewport?.getBoundingClientRect() ?? { left: 0, top: 0 };
    return {
      x: event.clientX - rect.left + (viewport?.scrollLeft ?? 0),
      y: event.clientY - rect.top + (viewport?.scrollTop ?? 0),
    };
  }

  /** Expande o WORLD até conter todos os Beats (mínimo = viewport). */
  #resizeWorld(root) {
    const viewport = root.querySelector(".lf-canvas");
    const world = root.querySelector(".beats-canvas");
    if (!viewport || !world) return;
    const s = LumennBeatStore.getStoryboard(this.#storyboardId);
    let maxX = 0;
    let maxY = 0;
    for (const b of s?.beats ?? []) {
      const p = b.position ?? { x: 0, y: 0 };
      maxX = Math.max(maxX, p.x + BEAT_W + WORLD_PAD);
      maxY = Math.max(maxY, p.y + BEAT_H + WORLD_PAD);
    }
    world.style.width = `${Math.max(viewport.clientWidth, maxX)}px`;
    world.style.height = `${Math.max(viewport.clientHeight, maxY)}px`;
  }

  #beatCenter(beat) {
    const p = beat.position ?? { x: 80, y: 80 };
    return { x: p.x + BEAT_W / 2, y: p.y + 30 };
  }

  /* ── Context ─────────────────────────────────────────────────────── */

  async _prepareContext() {
    let storyboards = LumennBeatStore.getAll();
    if (storyboards.length === 0 && game.user?.isGM) {
      await LumennBeatStore.createStoryboard();
      storyboards = LumennBeatStore.getAll();
    }
    const activeStoryboard = storyboards.find((s) => s.id === this.#storyboardId) ?? storyboards[0] ?? null;
    if (activeStoryboard) this.#storyboardId = activeStoryboard.id;

    const activeBeat = activeStoryboard?.beats.find((b) => b.id === activeStoryboard.activeBeatId) ?? null;

    const playlists = [...game.playlists.values()].map((p) => ({
      id: p.id,
      name: p.name,
      sounds: [...p.sounds.values()].map((ps) => ({ id: ps.id, uuid: ps.uuid, name: ps.name })),
    }));

    const beats = (activeStoryboard?.beats ?? []).map((b) => {
      const scene = b.sceneId ? game.scenes.get(b.sceneId) : null;
      const isActive = b.id === activeStoryboard.activeBeatId;
      const isConnected = !!activeBeat?.connections?.includes(b.id);
      return {
        ...b,
        position: b.position ?? { x: 80, y: 80 },
        isActive,
        isConnected,
        isNavigable: this.#mode === "live" && isConnected,
        isDimmed: this.#mode === "live" && !isActive && !isConnected,
        sceneName: scene?.name ?? (b.sceneId ? game.i18n.localize("LUMENN_FRAME.Beat.InvalidScene") : game.i18n.localize("LUMENN_FRAME.Beat.NoScene")),
        sceneThumb: scene?.thumbnail ?? scene?.background?.src ?? null,
        audioLabel: this.#audioLabel(b.audioSource, playlists),
        audioKind: b.audioSource?.type ?? null,
        isValid: this.#valid(b),
      };
    });

    const L = (key) => game.i18n.localize(key);

    return {
      storyboards,
      activeStoryboard,
      beats,
      playlists,
      mode: this.#mode,
      isGM: !!game.user?.isGM,
      transitioning: this.#transitioning,
      linkingBeatId: this.#pendingLinkId,
      needsStartBeat: !!activeStoryboard && !activeStoryboard.activeBeatId,
      label: {
        createStoryboard: L("LUMENN_FRAME.Toolbar.CreateStoryboard"),
        renameStoryboard: L("LUMENN_FRAME.Toolbar.RenameStoryboard"),
        createBeat: L("LUMENN_FRAME.Toolbar.CreateBeat"),
        deleteStoryboard: L("LUMENN_FRAME.Toolbar.DeleteStoryboard"),
        editMode: L("LUMENN_FRAME.Toolbar.EditMode"),
        liveMode: L("LUMENN_FRAME.Toolbar.LiveMode"),
        needsStartBeat: L("LUMENN_FRAME.Toolbar.NeedsStartBeat"),
        start: L("LUMENN_FRAME.Beat.SetStart"),
        edit: L("LUMENN_FRAME.Beat.Edit"),
        delete: L("LUMENN_FRAME.Beat.Delete"),
        link: L("LUMENN_FRAME.Beat.Link"),
        go: L("LUMENN_FRAME.Beat.Go"),
        invalid: L("LUMENN_FRAME.Beat.Invalid"),
        transitioning: L("LUMENN_FRAME.Transitioning"),
        emptyState: L("LUMENN_FRAME.EmptyState"),
        emptyHint: L("LUMENN_FRAME.EmptyHint"),
        dropHint: L("LUMENN_FRAME.DropHint"),
        linkingHint: L("LUMENN_FRAME.LinkingHint"),
      },
    };
  }

  /* ── Render + actions ────────────────────────────────────────────── */

  async _onRender(context, options) {
    await super._onRender(context, options);
    this.#dragDrop.forEach((d) => d.bind(this.element));
    const root = this.element;
    root.querySelectorAll("[data-action]").forEach((el) => el.addEventListener("click", (e) => this.#action(e)));
    const selector = root.querySelector("select[data-storyboard-selector]");
    selector?.addEventListener("change", (e) => { this.#storyboardId = e.target.value; this.render(); });
    this.#installInternalDrag(root);
    this.#installLiveNavigation(root);
    this.#resizeWorld(root);
    this.#drawConnectors(root);
    this.#observeResize(root);
  }

  #observeResize(root) {
    const viewport = root.querySelector(".lf-canvas");
    if (!viewport) return;
    this.#resizeObserver?.disconnect();
    this.#resizeObserver = new ResizeObserver(() => {
      this.#resizeWorld(root);
      this.#drawConnectors(root);
    });
    this.#resizeObserver.observe(viewport);
  }

  #installLiveNavigation(root) {
    if (this.#mode !== "live") return;
    root.querySelectorAll(".beat-node[data-navigable]").forEach((node) => node.addEventListener("click", (e) => {
      if (e.target.closest("button")) return;
      this.#navigate(node.dataset.id);
    }));
  }

  async #action(event) {
    event.preventDefault();
    const action = event.currentTarget.dataset.action;
    const id = event.currentTarget.dataset.id;
    if (!game.user?.isGM) return;
    if (action === "toggle-mode") { this.#mode = this.#mode === "edit" ? "live" : "edit"; this.#pendingLinkId = null; return this.render(); }
    // Modo Ao Vivo não permite nenhuma alteração estrutural.
    if (this.#mode !== "edit") return;
    if (action === "create-storyboard") return this.#createStoryboard();
    if (action === "rename-storyboard") return this.#renameStoryboard();
    if (action === "delete-storyboard") return this.#confirmDeleteStoryboard();
    if (action === "create-beat") {
      const viewport = this.element.querySelector(".lf-canvas");
      let position;
      if (event.target.closest?.(".lf-canvas")) {
        const p = this.#clientToCanvas(event, viewport);
        position = { x: Math.max(0, p.x - BEAT_W / 2), y: Math.max(0, p.y - 30) };
      } else {
        const s = LumennBeatStore.getStoryboard(this.#storyboardId);
        const maxX = Math.max(0, ...(s?.beats ?? []).map((b) => (b.position?.x ?? 0) + BEAT_W + 20));
        position = { x: maxX, y: 40 };
      }
      await LumennBeatStore.createBeat(this.#storyboardId, { position });
      return this.render();
    }
    if (action === "set-start-beat") { await LumennBeatStore.setActiveBeat(this.#storyboardId, id); return this.render(); }
    if (action === "edit-beat") return this.#editBeat(id);
    if (action === "delete-beat") return this.#confirmDeleteBeat(id);
    if (action === "connect-beat") return this.#toggleConnection(id);
  }

  async #navigate(id) {
    if (this.#transitioning) return;
    this.#transitioning = true;
    await this.render();
    try {
      const result = await this.#controller.goToBeat(this.#storyboardId, id, "ao-vivo");
      if (result.audioResult === "invalid-source") ui.notifications.warn(game.i18n.localize("LUMENN_FRAME.WarnInvalidAudioSource"));
    } finally {
      this.#transitioning = false;
      await this.render();
    }
  }

  async #toggleConnection(id) {
    const s = LumennBeatStore.getStoryboard(this.#storyboardId);
    if (!s || !s.beats.some((b) => b.id === id)) return;
    // Sem pendente → inicia o modo de linkagem a partir deste nó
    if (!this.#pendingLinkId) {
      this.#pendingLinkId = id;
      return this.render();
    }
    // Clicou no mesmo nó de novo → cancela
    if (this.#pendingLinkId === id) {
      this.#pendingLinkId = null;
      return this.render();
    }
    const from = this.#pendingLinkId;
    this.#pendingLinkId = null;
    const fromBeat = s.beats.find((b) => b.id === from);
    if (fromBeat.connections.includes(id)) await LumennBeatStore.disconnectBeats(this.#storyboardId, from, id);
    else await LumennBeatStore.connectBeats(this.#storyboardId, from, id);
    this.render();
  }

  #editBeat(id) {
    const beat = LumennBeatStore.getStoryboard(this.#storyboardId)?.beats.find((b) => b.id === id);
    if (beat) new BeatConfigDialog(this.#storyboardId, beat).render(true);
  }

  /* ── Delete confirmations ────────────────────────────────────────── */

  async #promptName(title, initial) {
    const raw = await foundry.applications.api.DialogV2.prompt({
      window: { title },
      content: `<input type="text" name="name" value="${String(initial).replace(/"/g, "&quot;")}" autofocus>`,
      ok: {
        label: game.i18n.localize("LUMENN_FRAME.Config.Save"),
        callback: (event, button) => button.form.elements.name.value,
      },
    });
    // Normalização defensiva — nunca aceitar objeto/shape inesperado como nome.
    const name = typeof raw === "string" ? raw : (raw?.name ?? raw?.value ?? "");
    return name.toString().trim();
  }

  async #createStoryboard() {
    const name = await this.#promptName(game.i18n.localize("LUMENN_FRAME.Toolbar.CreateStoryboard"), "Novo Storyboard");
    if (!name) return;
    const s = await LumennBeatStore.createStoryboard(name);
    this.#storyboardId = s?.id ?? this.#storyboardId;
    this.render();
  }

  async #renameStoryboard() {
    const s = LumennBeatStore.getStoryboard(this.#storyboardId);
    if (!s) return;
    const name = await this.#promptName(game.i18n.localize("LUMENN_FRAME.Toolbar.RenameStoryboard"), s.name);
    if (!name) return;
    await LumennBeatStore.renameStoryboard(this.#storyboardId, name);
    this.render();
  }

  async #confirmDeleteStoryboard() {
    const confirmed = await foundry.applications.api.DialogV2.confirm({
      title: game.i18n.localize("LUMENN_FRAME.Toolbar.DeleteStoryboard"),
      content: game.i18n.localize("LUMENN_FRAME.ConfirmDeleteStoryboard"),
      yes: { label: game.i18n.localize("LUMENN_FRAME.Beat.Delete") },
      no: { label: game.i18n.localize("LUMENN_FRAME.Config.Cancel") },
    });
    if (confirmed) { await LumennBeatStore.deleteStoryboard(this.#storyboardId); this.#storyboardId = null; this.render(); }
  }

  async #confirmDeleteBeat(id) {
    const confirmed = await foundry.applications.api.DialogV2.confirm({
      title: game.i18n.localize("LUMENN_FRAME.Beat.Delete"),
      content: game.i18n.localize("LUMENN_FRAME.ConfirmDeleteBeat"),
      yes: { label: game.i18n.localize("LUMENN_FRAME.Beat.Delete") },
      no: { label: game.i18n.localize("LUMENN_FRAME.Config.Cancel") },
    });
    if (confirmed) { await LumennBeatStore.deleteBeat(this.#storyboardId, id); this.render(); }
  }

  /* ── Internal beat repositioning (pointer events) ────────────────── */

  #installInternalDrag(root) {
    if (this.#mode !== "edit") return;
    const canvas = root.querySelector(".beats-canvas");
    canvas?.querySelectorAll(".beat-node").forEach((node) => node.addEventListener("pointerdown", (e) => {
      if (e.target.closest("button")) return;
      // Em modo de linkagem pendente, clicar em outro nó completa a conexão
      if (this.#pendingLinkId) {
        this.#toggleConnection(node.dataset.id);
        return;
      }
      e.preventDefault();
      node.setPointerCapture(e.pointerId);
      const beat = LumennBeatStore.getStoryboard(this.#storyboardId)?.beats.find((b) => b.id === node.dataset.id);
      const start = { x: e.clientX, y: e.clientY, ...(beat?.position ?? { x: 0, y: 0 }) };
      let rafId = null;
      const move = (ev) => {
        node.style.left = `${start.x + ev.clientX - e.clientX}px`;
        node.style.top = `${start.y + ev.clientY - e.clientY}px`;
        // Atualiza conectores em tempo real, throttled via requestAnimationFrame.
        if (rafId == null) rafId = requestAnimationFrame(() => { rafId = null; this.#drawConnectors(root); });
      };
      const up = async (ev) => {
        node.releasePointerCapture(ev.pointerId);
        node.removeEventListener("pointermove", move);
        node.removeEventListener("pointerup", up);
        const x = Math.max(0, start.x + ev.clientX - e.clientX);
        const y = Math.max(0, start.y + ev.clientY - e.clientY);
        await LumennBeatStore.updateBeat(this.#storyboardId, node.dataset.id, { position: { x, y } });
        this.#resizeWorld(root);
        this.#drawConnectors(root);
      };
      node.addEventListener("pointermove", move);
      node.addEventListener("pointerup", up, { once: true });
    }));
  }

  /* ── SVG connectors ─────────────────────────────────────────────── */

  #drawConnectors(root) {
    const svg = root.querySelector("svg.connectors");
    const s = LumennBeatStore.getStoryboard(this.#storyboardId);
    if (!svg || !s) return;
    svg.innerHTML = "";
    for (const b of s.beats) {
      for (const id of b.connections ?? []) {
        const t = s.beats.find((x) => x.id === id);
        if (!t) continue;
        const bp = this.#beatCenter(b);
        const tp = this.#beatCenter(t);
        const x1 = bp.x, y1 = bp.y, x2 = tp.x, y2 = tp.y;
        const dx = x2 - x1, dy = y2 - y1;
        const cx = x1 + dx * 0.5, cy = y1 + dy * 0.5 - Math.abs(dx) * 0.15;
        const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
        path.setAttribute("d", `M ${x1} ${y1} Q ${cx} ${cy} ${x2} ${y2}`);
        path.setAttribute("stroke", b.id === s.activeBeatId ? "var(--lf-amber)" : "var(--lf-muted)");
        path.setAttribute("stroke-width", "2");
        path.setAttribute("fill", "none");
        path.setAttribute("opacity", b.id === s.activeBeatId ? "0.8" : "0.35");
        svg.appendChild(path);
        // arrowhead
        const angle = Math.atan2(y2 - cy, x2 - cx);
        const ax = x2 - 8 * Math.cos(angle), ay = y2 - 8 * Math.sin(angle);
        const arrow = document.createElementNS("http://www.w3.org/2000/svg", "polygon");
        const p1x = x2, p1y = y2;
        const p2x = ax - 5 * Math.cos(angle - Math.PI / 6), p2y = ay - 5 * Math.sin(angle - Math.PI / 6);
        const p3x = ax - 5 * Math.cos(angle + Math.PI / 6), p3y = ay - 5 * Math.sin(angle + Math.PI / 6);
        arrow.setAttribute("points", `${p1x},${p1y} ${p2x},${p2y} ${p3x},${p3y}`);
        arrow.setAttribute("fill", b.id === s.activeBeatId ? "var(--lf-amber)" : "var(--lf-muted)");
        arrow.setAttribute("opacity", b.id === s.activeBeatId ? "0.8" : "0.35");
        svg.appendChild(arrow);
      }
    }
  }

  #audioLabel(src, playlists) {
    if (!src) return game.i18n.localize("LUMENN_FRAME.Beat.NoAudio");
    if (src.type === "playlist") return playlists.find((p) => p.id === src.id)?.name ?? game.i18n.localize("LUMENN_FRAME.Beat.InvalidAudio");
    return playlists.flatMap((p) => p.sounds).find((s) => s.uuid === src.id)?.name ?? game.i18n.localize("LUMENN_FRAME.Beat.InvalidAudio");
  }

  #valid(b) {
    if (b.sceneId && !game.scenes.get(b.sceneId)) return false;
    if (!b.audioSource) return true;
    try { return b.audioSource.type === "playlist" ? !!game.playlists.get(b.audioSource.id) : !!fromUuidSync(b.audioSource.id); } catch { return false; }
  }
}

/* ═══════════════════════════════════════════════════════════════════════
   BeatConfigDialog — edit a single beat's scene + audio
   ═══════════════════════════════════════════════════════════════════════ */

class BeatConfigDialog extends HandlebarsApplicationMixin(ApplicationV2) {
  #storyboardId;
  #beat;

  static DEFAULT_OPTIONS = {
    id: "lumenn-beat-config",
    classes: ["lumenn-frame", "beat-config", "app", "window-app"],
    title: "LUMENN_FRAME.Config.Title",
    tag: "form",
    position: { width: 440, height: "auto" },
  };

  static PARTS = {
    form: { template: "modules/lumenn-frame/templates/beat-config.hbs" },
  };

  constructor(storyboardId, beat) {
    super({});
    this.#storyboardId = storyboardId;
    this.#beat = beat;
  }

  async _prepareContext() {
    const scene = this.#beat.sceneId ? game.scenes.get(this.#beat.sceneId) : null;
    const L = (key) => game.i18n.localize(key);
    return {
      beat: this.#beat,
      scenePreview: scene?.thumbnail ?? scene?.background?.src ?? null,
      scenePreviewName: scene?.name ?? null,
      scenes: [...game.scenes.values()].map((s) => ({ id: s.id, name: s.name, thumb: s.thumbnail, selected: s.id === this.#beat.sceneId })),
      playlists: [...game.playlists.values()].map((p) => ({
        id: p.id,
        name: p.name,
        selected: p.id === this.#beat.audioSource?.id && this.#beat.audioSource?.type === "playlist",
        sounds: [...p.sounds.values()].map((ps) => ({ uuid: ps.uuid, name: ps.name, selected: ps.uuid === this.#beat.audioSource?.id && this.#beat.audioSource?.type === "track" })),
      })),
      defaultCrossfade: LumennBeatStore.getDefaultCrossfadeDuration(),
      label: {
        title: L("LUMENN_FRAME.Config.Title"),
        scene: L("LUMENN_FRAME.Config.Scene"),
        audioType: L("LUMENN_FRAME.Config.AudioType"),
        none: L("LUMENN_FRAME.Config.None"),
        track: L("LUMENN_FRAME.Config.Track"),
        playlist: L("LUMENN_FRAME.Config.Playlist"),
        audioTrack: L("LUMENN_FRAME.Config.AudioTrack"),
        audioPlaylist: L("LUMENN_FRAME.Config.AudioPlaylist"),
        crossfade: L("LUMENN_FRAME.Config.Crossfade"),
        crossfadeHint: L("LUMENN_FRAME.Config.CrossfadeHint"),
        save: L("LUMENN_FRAME.Config.Save"),
      },
    };
  }

  async _onRender(context, options) {
    await super._onRender(context, options);
    const audioType = this.element.querySelector('[name="audioType"]');
    const sync = () => {
      const type = audioType?.value ?? "none";
      this.element.querySelectorAll(".bc-tab").forEach((tab) => tab.classList.toggle("active", tab.dataset.audioType === type));
      this.element.querySelectorAll(".bc-tab-panel").forEach((panel) => { panel.style.display = panel.dataset.panel === type ? "flex" : "none"; });
    };
    this.element.querySelectorAll(".bc-tab").forEach((tab) => tab.addEventListener("click", () => { audioType.value = tab.dataset.audioType; sync(); }));
    sync();
    this.element.addEventListener("submit", (e) => {
      e.preventDefault();
      const d = Object.fromEntries(new FormData(e.currentTarget));
      const source = d.audioType === "track" && d.audioTrackId
        ? { type: "track", id: d.audioTrackId }
        : d.audioType === "playlist" && d.audioPlaylistId
          ? { type: "playlist", id: d.audioPlaylistId }
          : null;
      LumennBeatStore.updateBeat(this.#storyboardId, this.#beat.id, {
        sceneId: d.sceneId || null,
        audioSource: source,
        crossfadeDuration: d.crossfadeDuration ? Number(d.crossfadeDuration) : null,
      }).then(() => this.close());
    });
  }
}
