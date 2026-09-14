import { LumennBeatStore } from "./beat-store.mjs";
import { LumennTransitionController } from "./transition-controller.mjs";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

/**
 * LumennStoryboardApp — canvas de storyboard com Beats e conectores.
 * Dois modos: Edição (CRUD) e Ao Vivo (navegação).
 * No modo Edição, "Início" define o Beat ativo sem disparar transição —
 * é o que destrava a navegação (activeBeatId não nasce mais em deadlock).
 */
export class LumennStoryboardApp extends HandlebarsApplicationMixin(ApplicationV2) {
  #controller = new LumennTransitionController();
  #storyboardId = null;
  #mode = "edit";

  static DEFAULT_OPTIONS = {
    id: "lumenn-storyboard",
    classes: ["lumenn-frame", "storyboard"],
    title: "Lumenn Frame",
    tag: "div",
    position: { width: 800, height: 600 },
    window: { resizable: true },
  };

  static PARTS = {
    main: {
      template: "modules/lumenn-frame/templates/storyboard.hbs",
    },
  };

  get mode() {
    return this.#mode;
  }

  async _prepareContext(options) {
    const storyboards = LumennBeatStore.getAll();
    const active = this.#storyboardId
      ? LumennBeatStore.getStoryboard(this.#storyboardId)
      : storyboards[0] ?? null;

    if (active && !this.#storyboardId) {
      this.#storyboardId = active.id;
    }

    const scenes = Array.from(game.scenes.values()).map((s) => ({
      id: s.id,
      name: s.name,
      thumb: s.thumb,
    }));

    const playlists = Array.from(game.playlists.values()).map((p) => ({
      id: p.id,
      name: p.name,
      sounds: Array.from(p.sounds.values()).map((ps) => ({
        id: ps.id,
        name: ps.name,
        uuid: ps.uuid,
      })),
    }));

    const activeBeat = active?.activeBeatId
      ? active.beats.find((b) => b.id === active.activeBeatId)
      : null;

    const beats = (active?.beats ?? []).map((b) => ({
      ...b,
      isActive: b.id === active?.activeBeatId,
      isConnected: activeBeat?.connections.includes(b.id) ?? false,
      sceneName: game.scenes.get(b.sceneId)?.name ?? "—",
      audioLabel: b.audioSource?.id
        ? this.#resolveAudioLabel(b.audioSource, playlists)
        : "—",
      isValid: this.#isBeatValid(b),
    }));

    return {
      storyboards,
      activeStoryboard: active,
      beats,
      scenes,
      playlists,
      mode: this.#mode,
      isGM: game.user.isGM,
      needsStartBeat: game.user.isGM && !!active && !active.activeBeatId,
    };
  }

  async _onRender(context, options) {
    await super._onRender(context, options);

    const html = this.element;
    html.querySelectorAll("[data-action]").forEach((el) => {
      el.addEventListener("click", this.#handleAction.bind(this));
    });

    this.#renderBeats(html);
  }

  #handleAction(event) {
    event.preventDefault();
    const action = event.currentTarget.dataset.action;
    const id = event.currentTarget.dataset.id;

    switch (action) {
      case "toggle-mode":
        this.#mode = this.#mode === "edit" ? "live" : "edit";
        this.render();
        break;
      case "select-storyboard":
        this.#storyboardId = id;
        this.render();
        break;
      case "create-storyboard":
        LumennBeatStore.createStoryboard("Novo Storyboard");
        this.render();
        break;
      case "create-beat":
        this.#createBeat(event);
        break;
      case "set-start-beat":
        this.#setStartBeat(id);
        break;
      case "edit-beat":
        this.#editBeat(id);
        break;
      case "delete-beat":
        this.#deleteBeat(id);
        break;
      case "navigate-beat":
        this.#navigateToBeat(id);
        break;
      case "connect-beat":
        this.#connectBeat(id);
        break;
    }
  }

  #createBeat(event) {
    if (!this.#storyboardId || !game.user.isGM) return;
    const rect = this.element.querySelector(".beats-canvas")?.getBoundingClientRect();
    const x = rect ? event.clientX - rect.left : 100;
    const y = rect ? event.clientY - rect.top : 100;
    LumennBeatStore.createBeat(this.#storyboardId, { position: { x, y } });
    this.render();
  }

  #setStartBeat(beatId) {
    if (!this.#storyboardId || !game.user.isGM) return;
    LumennBeatStore.setActiveBeat(this.#storyboardId, beatId);
    this.render();
  }

  #editBeat(beatId) {
    if (!this.#storyboardId || !game.user.isGM) return;
    const storyboard = LumennBeatStore.getStoryboard(this.#storyboardId);
    const beat = storyboard?.beats.find((b) => b.id === beatId);
    if (!beat) return;

    new BeatConfigDialog(this.#storyboardId, beat).render(true);
  }

  #deleteBeat(beatId) {
    if (!this.#storyboardId || !game.user.isGM) return;
    LumennBeatStore.deleteBeat(this.#storyboardId, beatId);
    this.render();
  }

  async #navigateToBeat(beatId) {
    if (this.#mode !== "live" || !game.user.isGM) return;
    const result = await this.#controller.goToBeat(this.#storyboardId, beatId);
    this.render();
    if (result.sceneChanged) {
      ui.notifications.info(game.i18n.localize("LUMENN_FRAME.InfoSceneChanged"));
    }
  }

  #connectBeat(beatId) {
    if (!this.#storyboardId || !game.user.isGM) return;
    const storyboard = LumennBeatStore.getStoryboard(this.#storyboardId);
    const activeBeat = storyboard?.beats.find((b) => b.id === storyboard.activeBeatId);
    if (!activeBeat) return;

    if (activeBeat.connections.includes(beatId)) {
      LumennBeatStore.disconnectBeats(this.#storyboardId, activeBeat.id, beatId);
    } else {
      LumennBeatStore.connectBeats(this.#storyboardId, activeBeat.id, beatId);
    }
    this.render();
  }

  #renderBeats(html) {
    const canvas = html.querySelector(".beats-canvas");
    if (!canvas) return;

    const storyboard = LumennBeatStore.getStoryboard(this.#storyboardId);
    if (!storyboard) return;

    canvas.querySelectorAll(".beat-node").forEach((el) => {
      const beat = storyboard.beats.find((b) => b.id === el.dataset.id);
      if (!beat) return;
      el.style.left = `${beat.position.x}px`;
      el.style.top = `${beat.position.y}px`;
    });

    this.#drawConnectors(canvas, storyboard);
  }

  #drawConnectors(canvas, storyboard) {
    const svg = canvas.querySelector("svg.connectors");
    if (!svg) return;
    svg.innerHTML = "";

    storyboard.beats.forEach((beat) => {
      beat.connections.forEach((connId) => {
        const target = storyboard.beats.find((b) => b.id === connId);
        if (!target) return;

        const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
        line.setAttribute("x1", beat.position.x + 60);
        line.setAttribute("y1", beat.position.y + 30);
        line.setAttribute("x2", target.position.x + 60);
        line.setAttribute("y2", target.position.y + 30);
        line.setAttribute("stroke", beat.id === storyboard.activeBeatId ? "#00d9ff" : "#666");
        line.setAttribute("stroke-width", "2");
        svg.appendChild(line);
      });
    });
  }

  #resolveAudioLabel(source, playlists) {
    if (source.type === "track") {
      for (const p of playlists) {
        const sound = p.sounds.find((s) => s.uuid === source.id);
        if (sound) return sound.name;
      }
    }
    if (source.type === "playlist") {
      const pl = playlists.find((p) => p.id === source.id);
      return pl?.name ?? "—";
    }
    return "—";
  }

  #isBeatValid(beat) {
    if (beat.sceneId && !game.scenes.get(beat.sceneId)) return false;
    if (beat.audioSource?.id) {
      if (beat.audioSource.type === "track") {
        try {
          return !!fromUuidSync(beat.audioSource.id);
        } catch {
          return false;
        }
      }
      if (beat.audioSource.type === "playlist") {
        return !!game.playlists.get(beat.audioSource.id);
      }
    }
    return true;
  }
}

class BeatConfigDialog extends HandlebarsApplicationMixin(ApplicationV2) {
  #storyboardId;
  #beat;

  static DEFAULT_OPTIONS = {
    id: "lumenn-beat-config",
    classes: ["lumenn-frame", "beat-config"],
    title: "Configurar Beat",
    tag: "form",
    position: { width: 420, height: "auto" },
    window: { resizable: false },
    form: {
      handler: BeatConfigDialog.#onSubmit,
      closeOnSubmit: true,
    },
  };

  static PARTS = {
    form: {
      template: "modules/lumenn-frame/templates/beat-config.hbs",
    },
  };

  constructor(storyboardId, beat) {
    super({});
    this.#storyboardId = storyboardId;
    this.#beat = beat;
  }

  async _prepareContext() {
    const scenes = Array.from(game.scenes.values()).map((s) => ({
      id: s.id,
      name: s.name,
      selected: s.id === this.#beat.sceneId,
    }));

    const playlists = Array.from(game.playlists.values()).map((p) => ({
      id: p.id,
      name: p.name,
      selected: p.id === this.#beat.audioSource?.id && this.#beat.audioSource?.type === "playlist",
      sounds: Array.from(p.sounds.values()).map((ps) => ({
        id: ps.id,
        name: ps.name,
        uuid: ps.uuid,
        selected:
          ps.uuid === this.#beat.audioSource?.id && this.#beat.audioSource?.type === "track",
      })),
    }));

    return {
      beat: this.#beat,
      scenes,
      playlists,
      defaultCrossfade: LumennBeatStore.getDefaultCrossfadeDuration(),
    };
  }

  static async #onSubmit(event, form, formData) {
    event.preventDefault();
    const data = new FormDataExtended(form).object;

    const audioSource = data.audioType === "track"
      ? { type: "track", id: data.audioTrackId ?? null }
      : data.audioType === "playlist"
        ? { type: "playlist", id: data.audioPlaylistId ?? null }
        : null;

    LumennBeatStore.updateBeat(this._storyboardId, this._beat.id, {
      sceneId: data.sceneId ?? null,
      audioSource,
      crossfadeDuration: data.crossfadeDuration ? Number(data.crossfadeDuration) : null,
    });
  }

  get _storyboardId() {
    return this.#storyboardId;
  }

  get _beat() {
    return this.#beat;
  }
}
