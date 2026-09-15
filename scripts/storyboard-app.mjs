import { LumennBeatStore } from "./beat-store.mjs";
import { LumennTransitionController } from "./transition-controller.mjs";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;
const { DragDrop } = foundry.applications.ux;

/** GM storyboard editor/live controller. Domain state remains in BeatStore. */
export class LumennStoryboardApp extends HandlebarsApplicationMixin(ApplicationV2) {
  #controller = new LumennTransitionController();
  #storyboardId = null;
  #mode = "edit";
  #transitioning = false;
  #dragDrop;

  static DEFAULT_OPTIONS = {
    id: "lumenn-storyboard",
    classes: ["lumenn-frame", "storyboard", "app", "window-app"],
    title: "Lumenn Frame",
    tag: "div",
    position: { width: 900, height: 650 },
    window: { resizable: true },
    dragDrop: [
      { dropSelector: ".beats-canvas" },
    ],
  };

  static PARTS = {
    main: { template: "modules/lumenn-frame/templates/storyboard.hbs" },
  };

  constructor(options = {}) {
    super(options);
    this.#dragDrop = this.#createDragDropHandlers();
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
    this.element.querySelector(".beats-canvas")?.classList.add("drag-over");
  }

  #onDragLeave(event) {
    this.element.querySelector(".beats-canvas")?.classList.remove("drag-over");
  }

  async #onDrop(event) {
    event.preventDefault();
    this.element.querySelector(".beats-canvas")?.classList.remove("drag-over");
    if (!game.user?.isGM || this.#mode !== "edit") return;

    // Sidebar drags carry JSON: {type: "Scene"|"Playlist"|"PlaylistSound", uuid, ...}
    const data = TextEditor.getDragEventData(event);
    const uuid = data?.uuid ?? event.dataTransfer?.getData("text/plain") ?? "";
    if (!uuid) return;
    let doc;
    try { doc = await fromUuid(uuid); } catch { return; }
    if (!doc) return;

    const canvas = this.element.querySelector(".beats-canvas");
    const rect = canvas?.getBoundingClientRect();
    const position = {
      x: Math.max(10, Math.round((event.clientX - (rect?.left ?? 0)) - 60)),
      y: Math.max(10, Math.round((event.clientY - (rect?.top ?? 0)) - 30)),
    };

    // ── Drop on a specific beat: override scene/audio ──
    const targetNode = event.target?.closest?.(".beat-node");
    if (targetNode?.dataset?.id) {
      const patch = {};
      if (doc.documentName === "Scene") patch.sceneId = doc.id;
      else if (doc.documentName === "Playlist") patch.audioSource = { type: "playlist", id: doc.id };
      else if (doc.documentName === "PlaylistSound") patch.audioSource = { type: "track", id: doc.uuid };
      else return;
      LumennBeatStore.updateBeat(this.#storyboardId, targetNode.dataset.id, patch);
      return this.render();
    }

    // ── Drop on empty canvas: create new beat ──
    const beatData = { position };
    if (doc.documentName === "Scene") beatData.sceneId = doc.id;
    else if (doc.documentName === "Playlist") beatData.audioSource = { type: "playlist", id: doc.id };
    else if (doc.documentName === "PlaylistSound") beatData.audioSource = { type: "track", id: doc.uuid };
    else return;

    LumennBeatStore.createBeat(this.#storyboardId, beatData);
    this.render();
  }

  /* ── Context ─────────────────────────────────────────────────────── */

  async _prepareContext() {
    let storyboards = LumennBeatStore.getAll();
    if (storyboards.length === 0 && game.user?.isGM) {
      LumennBeatStore.createStoryboard();
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
      needsStartBeat: !!activeStoryboard && !activeStoryboard.activeBeatId,
      label: {
        createStoryboard: L("LUMENN_FRAME.Toolbar.CreateStoryboard"),
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
    this.#drawConnectors(root);
  }

  #installLiveNavigation(root) {
    if (this.#mode !== "live") return;
    root.querySelectorAll(".beat-node[data-navigable]").forEach((node) => node.addEventListener("click", (e) => {
      if (e.target.closest("button")) return;
      this.#navigate(node.dataset.id);
    }));
  }

  #action(event) {
    event.preventDefault();
    const action = event.currentTarget.dataset.action;
    const id = event.currentTarget.dataset.id;
    if (!game.user?.isGM) return;
    if (action === "toggle-mode") { this.#mode = this.#mode === "edit" ? "live" : "edit"; return this.render(); }
    if (action === "create-storyboard") { const s = LumennBeatStore.createStoryboard(); this.#storyboardId = s?.id ?? this.#storyboardId; return this.render(); }
    if (action === "delete-storyboard") return this.#confirmDeleteStoryboard();
    if (action === "create-beat") { const r = this.element.querySelector(".beats-canvas")?.getBoundingClientRect(); LumennBeatStore.createBeat(this.#storyboardId, { position: { x: Math.max(10, (event.clientX - (r?.left ?? 0)) - 60), y: Math.max(10, (event.clientY - (r?.top ?? 0)) - 30) } }); return this.render(); }
    if (action === "set-start-beat") { LumennBeatStore.setActiveBeat(this.#storyboardId, id); return this.render(); }
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

  #toggleConnection(id) {
    const s = LumennBeatStore.getStoryboard(this.#storyboardId);
    const a = s?.beats.find((b) => b.id === s.activeBeatId);
    if (!a || a.id === id) return;
    if (a.connections.includes(id)) LumennBeatStore.disconnectBeats(this.#storyboardId, a.id, id);
    else LumennBeatStore.connectBeats(this.#storyboardId, a.id, id);
    this.render();
  }

  #editBeat(id) {
    const beat = LumennBeatStore.getStoryboard(this.#storyboardId)?.beats.find((b) => b.id === id);
    if (beat) new BeatConfigDialog(this.#storyboardId, beat).render(true);
  }

  /* ── Delete confirmations ────────────────────────────────────────── */

  async #confirmDeleteStoryboard() {
    const confirmed = await foundry.applications.api.DialogV2.confirm({
      title: game.i18n.localize("LUMENN_FRAME.Toolbar.DeleteStoryboard"),
      content: game.i18n.localize("LUMENN_FRAME.ConfirmDeleteStoryboard"),
      yes: { label: game.i18n.localize("LUMENN_FRAME.Beat.Delete") },
      no: { label: game.i18n.localize("LUMENN_FRAME.Config.Cancel") },
    });
    if (confirmed) { LumennBeatStore.deleteStoryboard(this.#storyboardId); this.#storyboardId = null; this.render(); }
  }

  async #confirmDeleteBeat(id) {
    const confirmed = await foundry.applications.api.DialogV2.confirm({
      title: game.i18n.localize("LUMENN_FRAME.Beat.Delete"),
      content: game.i18n.localize("LUMENN_FRAME.ConfirmDeleteBeat"),
      yes: { label: game.i18n.localize("LUMENN_FRAME.Beat.Delete") },
      no: { label: game.i18n.localize("LUMENN_FRAME.Config.Cancel") },
    });
    if (confirmed) { LumennBeatStore.deleteBeat(this.#storyboardId, id); this.render(); }
  }

  /* ── Internal beat repositioning (pointer events) ────────────────── */

  #installInternalDrag(root) {
    if (this.#mode !== "edit") return;
    const canvas = root.querySelector(".beats-canvas");
    canvas?.querySelectorAll(".beat-node").forEach((node) => node.addEventListener("pointerdown", (e) => {
      if (e.target.closest("button")) return;
      e.preventDefault();
      node.setPointerCapture(e.pointerId);
      const beat = LumennBeatStore.getStoryboard(this.#storyboardId)?.beats.find((b) => b.id === node.dataset.id);
      const start = { x: e.clientX, y: e.clientY, ...(beat?.position ?? { x: 0, y: 0 }) };
      const move = (ev) => { node.style.left = `${start.x + ev.clientX - e.clientX}px`; node.style.top = `${start.y + ev.clientY - e.clientY}px`; };
      const up = (ev) => {
        node.releasePointerCapture(ev.pointerId);
        node.removeEventListener("pointermove", move);
        node.removeEventListener("pointerup", up);
        const x = Math.max(0, start.x + ev.clientX - e.clientX);
        const y = Math.max(0, start.y + ev.clientY - e.clientY);
        LumennBeatStore.updateBeat(this.#storyboardId, node.dataset.id, { position: { x, y } });
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
        const bp = b.position ?? { x: 80, y: 80 };
        const tp = t.position ?? { x: 80, y: 80 };
        const x1 = bp.x + 60, y1 = bp.y + 30, x2 = tp.x + 60, y2 = tp.y + 30;
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
      });
      this.close();
    });
  }
}
