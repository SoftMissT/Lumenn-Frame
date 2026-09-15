import { LumennBeatStore } from "./beat-store.mjs";
import { LumennTransitionController } from "./transition-controller.mjs";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

/** GM storyboard editor/live controller. Domain state remains in BeatStore. */
export class LumennStoryboardApp extends HandlebarsApplicationMixin(ApplicationV2) {
  #controller = new LumennTransitionController();
  #storyboardId = null;
  #mode = "edit";

  static DEFAULT_OPTIONS = { id: "lumenn-storyboard", classes: ["lumenn-frame", "storyboard"], title: "Lumenn Frame", tag: "div", position: { width: 900, height: 650 }, window: { resizable: true } };
  static PARTS = { main: { template: "modules/lumenn-frame/templates/storyboard.hbs" } };

  async _prepareContext() {
    const storyboards = LumennBeatStore.getAll();
    const activeStoryboard = storyboards.find(s => s.id === this.#storyboardId) ?? storyboards[0] ?? null;
    if (activeStoryboard) this.#storyboardId = activeStoryboard.id;
    const activeBeat = activeStoryboard?.beats.find(b => b.id === activeStoryboard.activeBeatId) ?? null;
    const scenes = [...game.scenes.values()].map(s => ({ id: s.id, name: s.name }));
    const playlists = [...game.playlists.values()].map(p => ({ id: p.id, name: p.name, sounds: [...p.sounds.values()].map(ps => ({ id: ps.id, uuid: ps.uuid, name: ps.name })) }));
    const beats = (activeStoryboard?.beats ?? []).map(b => ({ ...b, position: b.position ?? { x: 80, y: 80 }, isActive: b.id === activeStoryboard.activeBeatId, isConnected: !!activeBeat?.connections?.includes(b.id), sceneName: game.scenes.get(b.sceneId)?.name ?? "Cena inválida", audioLabel: this.#audioLabel(b.audioSource, playlists), isValid: this.#valid(b) }));
    return { storyboards, activeStoryboard, beats, scenes, playlists, mode: this.#mode, isGM: !!game.user?.isGM, needsStartBeat: !!activeStoryboard && !activeStoryboard.activeBeatId };
  }

  async _onRender(context, options) {
    await super._onRender(context, options);
    const root = this.element;
    root.querySelectorAll("[data-action]").forEach(el => el.addEventListener("click", e => this.#action(e)));
    const selector = root.querySelector("select[data-storyboard-selector]");
    selector?.addEventListener("change", e => { this.#storyboardId = e.target.value; this.render(); });
    this.#installDrag(root);
    this.#drawConnectors(root);
  }

  #action(event) {
    event.preventDefault();
    const action = event.currentTarget.dataset.action;
    const id = event.currentTarget.dataset.id;
    if (!game.user?.isGM) return;
    if (action === "toggle-mode") { this.#mode = this.#mode === "edit" ? "live" : "edit"; return this.render(); }
    if (action === "create-storyboard") { const s = LumennBeatStore.createStoryboard(); this.#storyboardId = s?.id ?? this.#storyboardId; return this.render(); }
    if (action === "delete-storyboard") { LumennBeatStore.deleteStoryboard(this.#storyboardId); this.#storyboardId = null; return this.render(); }
    if (action === "create-beat") { const r = this.element.querySelector(".beats-canvas")?.getBoundingClientRect(); LumennBeatStore.createBeat(this.#storyboardId, { position: { x: Math.max(10, (event.clientX - (r?.left ?? 0)) - 60), y: Math.max(10, (event.clientY - (r?.top ?? 0)) - 30) } }); return this.render(); }
    if (action === "set-start-beat") { LumennBeatStore.setActiveBeat(this.#storyboardId, id); return this.render(); }
    if (action === "edit-beat") return this.#editBeat(id);
    if (action === "delete-beat") { LumennBeatStore.deleteBeat(this.#storyboardId, id); return this.render(); }
    if (action === "connect-beat") return this.#toggleConnection(id);
    if (action === "navigate-beat" && this.#mode === "live") return this.#navigate(id);
  }

  async #navigate(id) { const result = await this.#controller.goToBeat(this.#storyboardId, id, this.#mode === "live" ? "ao-vivo" : "edicao"); if (result.audioResult === "invalid-source") ui.notifications.warn("Lumenn Frame: Beat inválido; a cena foi ativada, mas o áudio não existe."); this.render(); }
  #toggleConnection(id) { const s = LumennBeatStore.getStoryboard(this.#storyboardId); const a = s?.beats.find(b => b.id === s.activeBeatId); if (!a || a.id === id) return; if (a.connections.includes(id)) LumennBeatStore.disconnectBeats(this.#storyboardId, a.id, id); else LumennBeatStore.connectBeats(this.#storyboardId, a.id, id); this.render(); }
  #editBeat(id) { const beat = LumennBeatStore.getStoryboard(this.#storyboardId)?.beats.find(b => b.id === id); if (beat) new BeatConfigDialog(this.#storyboardId, beat).render(true); }

  #installDrag(root) {
    if (this.#mode !== "edit") return;
    const canvas = root.querySelector(".beats-canvas");
    canvas?.querySelectorAll(".beat-node").forEach(node => node.addEventListener("pointerdown", e => {
      if (e.target.closest("button")) return; e.preventDefault(); node.setPointerCapture(e.pointerId);
      const start = { x: e.clientX, y: e.clientY, ...((LumennBeatStore.getStoryboard(this.#storyboardId)?.beats.find(b => b.id === node.dataset.id)?.position) ?? { x: 0, y: 0 }) };
      const move = ev => { node.style.left = `${start.x + ev.clientX - e.clientX}px`; node.style.top = `${start.y + ev.clientY - e.clientY}px`; };
      const up = ev => { node.releasePointerCapture(ev.pointerId); node.removeEventListener("pointermove", move); node.removeEventListener("pointerup", up); LumennBeatStore.updateBeat(this.#storyboardId, node.dataset.id, { position: { x: Math.max(0, start.x + ev.clientX - e.clientX), y: Math.max(0, start.y + ev.clientY - e.clientY) } }); this.#drawConnectors(root); };
      node.addEventListener("pointermove", move); node.addEventListener("pointerup", up, { once: true });
    }));
  }
  #drawConnectors(root) { const svg = root.querySelector("svg.connectors"), s = LumennBeatStore.getStoryboard(this.#storyboardId); if (!svg || !s) return; svg.innerHTML = ""; for (const b of s.beats) for (const id of b.connections ?? []) { const t = s.beats.find(x => x.id === id); if (!t) continue; const bp = b.position ?? { x: 80, y: 80 }, tp = t.position ?? { x: 80, y: 80 }; const l = document.createElementNS("http://www.w3.org/2000/svg", "line"); l.setAttribute("x1", bp.x + 60); l.setAttribute("y1", bp.y + 30); l.setAttribute("x2", tp.x + 60); l.setAttribute("y2", tp.y + 30); l.setAttribute("stroke", b.id === s.activeBeatId ? "#00d9ff" : "#666"); l.setAttribute("stroke-width", "2"); svg.appendChild(l); } }
  #audioLabel(src, playlists) { if (!src) return "Sem áudio"; if (src.type === "playlist") return playlists.find(p => p.id === src.id)?.name ?? "Áudio inválido"; return playlists.flatMap(p => p.sounds).find(s => s.uuid === src.id)?.name ?? "Áudio inválido"; }
  #valid(b) { if (b.sceneId && !game.scenes.get(b.sceneId)) return false; if (!b.audioSource) return true; try { return b.audioSource.type === "playlist" ? !!game.playlists.get(b.audioSource.id) : !!fromUuidSync(b.audioSource.id); } catch { return false; } }
}

class BeatConfigDialog extends HandlebarsApplicationMixin(ApplicationV2) {
  #storyboardId; #beat;
  static DEFAULT_OPTIONS = { id: "lumenn-beat-config", classes: ["lumenn-frame", "beat-config"], title: "Configurar Beat", tag: "form", position: { width: 420, height: "auto" }, form: { closeOnSubmit: true } };
  static PARTS = { form: { template: "modules/lumenn-frame/templates/beat-config.hbs" } };
  constructor(storyboardId, beat) { super({}); this.#storyboardId = storyboardId; this.#beat = beat; }
  async _prepareContext() { const scenes = [...game.scenes.values()].map(s => ({ id: s.id, name: s.name, selected: s.id === this.#beat.sceneId })); const playlists = [...game.playlists.values()].map(p => ({ id: p.id, name: p.name, selected: p.id === this.#beat.audioSource?.id && this.#beat.audioSource?.type === "playlist", sounds: [...p.sounds.values()].map(ps => ({ uuid: ps.uuid, name: ps.name, selected: ps.uuid === this.#beat.audioSource?.id && this.#beat.audioSource?.type === "track" })) })); return { beat: this.#beat, scenes, playlists, defaultCrossfade: LumennBeatStore.getDefaultCrossfadeDuration() }; }
  async _onRender(context, options) { await super._onRender(context, options); const sync = () => { const type = this.element.querySelector('[name="audioType"]')?.value; this.element.querySelector('[name="audioTrackId"]').style.display = type === "track" ? "block" : "none"; this.element.querySelector('[name="audioPlaylistId"]').style.display = type === "playlist" ? "block" : "none"; }; this.element.querySelector('[name="audioType"]')?.addEventListener("change", sync); sync(); this.element.addEventListener("submit", e => { e.preventDefault(); const d = Object.fromEntries(new FormData(e.currentTarget)); const source = d.audioType === "track" && d.audioTrackId ? { type: "track", id: d.audioTrackId } : d.audioType === "playlist" && d.audioPlaylistId ? { type: "playlist", id: d.audioPlaylistId } : null; LumennBeatStore.updateBeat(this.#storyboardId, this.#beat.id, { sceneId: d.sceneId || null, audioSource: source, crossfadeDuration: d.crossfadeDuration ? Number(d.crossfadeDuration) : null }); this.close(); }); }
}
