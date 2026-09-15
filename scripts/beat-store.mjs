const MODULE_ID = "lumenn-frame";

/**
 * LumennBeatStore — CRUD de storyboards/Beats sobre game.settings (escopo world).
 * Toda operação de escrita verifica game.user.isGM.
 */
export class LumennBeatStore {
  static #STORYBOARDS_KEY = "storyboards";
  static #DEFAULT_CROSSFADE_KEY = "defaultCrossfadeDuration";

  static registerSettings() {
    game.settings.register(MODULE_ID, LumennBeatStore.#STORYBOARDS_KEY, {
      name: "Storyboards",
      scope: "world",
      config: false,
      type: Array,
      default: [],
    });

    game.settings.register(MODULE_ID, LumennBeatStore.#DEFAULT_CROSSFADE_KEY, {
      name: "LUMENN_FRAME.Settings.DefaultCrossfade.Name",
      hint: "LUMENN_FRAME.Settings.DefaultCrossfade.Hint",
      scope: "world",
      config: true,
      type: Number,
      default: 3000,
      range: { min: 500, max: 10000, step: 250 },
    });
  }

  static getAll() {
    return game.settings.get(MODULE_ID, LumennBeatStore.#STORYBOARDS_KEY);
  }

  static getStoryboard(storyboardId) {
    return this.getAll().find((s) => s.id === storyboardId) ?? null;
  }

  static createStoryboard(name = "Novo Storyboard") {
    if (!game.user.isGM) return null;
    const storyboards = this.getAll();
    const storyboard = {
      id: `storyboard_${foundry.utils.randomID(16)}`,
      name,
      beats: [],
      activeBeatId: null,
    };
    storyboards.push(storyboard);
    game.settings.set(MODULE_ID, LumennBeatStore.#STORYBOARDS_KEY, storyboards);
    return storyboard;
  }

  static deleteStoryboard(storyboardId) {
    if (!game.user.isGM) return false;
    const storyboards = this.getAll().filter((s) => s.id !== storyboardId);
    game.settings.set(MODULE_ID, LumennBeatStore.#STORYBOARDS_KEY, storyboards);
    return true;
  }

  static createBeat(storyboardId, beatData = {}) {
    if (!game.user.isGM) return null;
    const storyboards = this.getAll();
    const storyboard = storyboards.find((s) => s.id === storyboardId);
    if (!storyboard) return null;

    const beat = {
      id: `beat_${foundry.utils.randomID(16)}`,
      sceneId: beatData.sceneId ?? null,
      audioSource: beatData.audioSource ?? null,
      crossfadeDuration: beatData.crossfadeDuration ?? null,
      connections: beatData.connections ?? [],
      position: beatData.position ?? { x: 100, y: 100 },
    };
    storyboard.beats.push(beat);
    game.settings.set(MODULE_ID, LumennBeatStore.#STORYBOARDS_KEY, storyboards);
    return beat;
  }

  static updateBeat(storyboardId, beatId, patch) {
    if (!game.user.isGM) return null;
    const storyboards = this.getAll();
    const storyboard = storyboards.find((s) => s.id === storyboardId);
    if (!storyboard) return null;

    const beat = storyboard.beats.find((b) => b.id === beatId);
    if (!beat) return null;

    Object.assign(beat, patch);
    game.settings.set(MODULE_ID, LumennBeatStore.#STORYBOARDS_KEY, storyboards);
    return beat;
  }

  static deleteBeat(storyboardId, beatId) {
    if (!game.user.isGM) return false;
    const storyboards = this.getAll();
    const storyboard = storyboards.find((s) => s.id === storyboardId);
    if (!storyboard) return false;

    storyboard.beats = storyboard.beats.filter((b) => b.id !== beatId);
    storyboard.beats.forEach((b) => {
      b.connections = b.connections.filter((c) => c !== beatId);
    });
    if (storyboard.activeBeatId === beatId) storyboard.activeBeatId = null;
    game.settings.set(MODULE_ID, LumennBeatStore.#STORYBOARDS_KEY, storyboards);
    return true;
  }

  static connectBeats(storyboardId, fromBeatId, toBeatId) {
    if (!game.user.isGM) return false;
    const storyboards = this.getAll();
    const storyboard = storyboards.find((s) => s.id === storyboardId);
    if (!storyboard) return false;

    const fromBeat = storyboard.beats.find((b) => b.id === fromBeatId);
    const toBeat = storyboard.beats.find((b) => b.id === toBeatId);
    if (!fromBeat || !toBeat) return false;

    if (!fromBeat.connections.includes(toBeatId)) {
      fromBeat.connections.push(toBeatId);
    }
    game.settings.set(MODULE_ID, LumennBeatStore.#STORYBOARDS_KEY, storyboards);
    return true;
  }

  static disconnectBeats(storyboardId, fromBeatId, toBeatId) {
    if (!game.user.isGM) return false;
    const storyboards = this.getAll();
    const storyboard = storyboards.find((s) => s.id === storyboardId);
    if (!storyboard) return false;

    const fromBeat = storyboard.beats.find((b) => b.id === fromBeatId);
    if (!fromBeat) return false;

    fromBeat.connections = fromBeat.connections.filter((c) => c !== toBeatId);
    game.settings.set(MODULE_ID, LumennBeatStore.#STORYBOARDS_KEY, storyboards);
    return true;
  }

  static getActiveBeat(storyboardId) {
    const storyboard = this.getStoryboard(storyboardId);
    if (!storyboard?.activeBeatId) return null;
    return storyboard.beats.find((b) => b.id === storyboard.activeBeatId) ?? null;
  }

  static setActiveBeat(storyboardId, beatId) {
    if (!game.user.isGM) return;
    const storyboards = this.getAll();
    const storyboard = storyboards.find((s) => s.id === storyboardId);
    if (!storyboard) return;
    storyboard.activeBeatId = beatId;
    game.settings.set(MODULE_ID, LumennBeatStore.#STORYBOARDS_KEY, storyboards);
  }

  static getDefaultCrossfadeDuration() {
    return game.settings.get(MODULE_ID, LumennBeatStore.#DEFAULT_CROSSFADE_KEY);
  }

  static getBeatCrossfadeDuration(beat) {
    return beat.crossfadeDuration ?? this.getDefaultCrossfadeDuration();
  }
}
