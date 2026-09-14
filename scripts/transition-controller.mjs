import { LumennBeatStore } from "./beat-store.mjs";
import { LumennAudioEngine } from "./audio-engine.mjs";

/**
 * LumennTransitionController — única peça que conhece o motor de áudio e Scene.activate().
 * Valida permissão e conectividade antes de agir.
 */
export class LumennTransitionController {
  #engine;
  #storyboardId;

  constructor(storyboardId) {
    this.#engine = new LumennAudioEngine();
    this.#storyboardId = storyboardId;
  }

  get engine() {
    return this.#engine;
  }

  get storyboardId() {
    return this.#storyboardId;
  }

  /**
   * Navega para um Beat conectado.
   * @param {string} targetBeatId
   * @returns {Promise<{ sceneChanged: boolean, audioResult: string }>}
   */
  async goToBeat(targetBeatId) {
    if (!game.user.isGM) return { sceneChanged: false, audioResult: "kept" };

    const currentBeat = LumennBeatStore.getActiveBeat(this.#storyboardId);
    if (!currentBeat) return { sceneChanged: false, audioResult: "kept" };

    if (!currentBeat.connections.includes(targetBeatId)) {
      return { sceneChanged: false, audioResult: "kept" };
    }

    const targetBeat = LumennBeatStore.getStoryboard(this.#storyboardId)
      ?.beats.find((b) => b.id === targetBeatId);
    if (!targetBeat) return { sceneChanged: false, audioResult: "kept" };

    let sceneChanged = false;
    if (targetBeat.sceneId) {
      const scene = game.scenes.get(targetBeat.sceneId);
      if (scene) {
        await scene.activate();
        sceneChanged = true;
      }
    }

    const duration = LumennBeatStore.getBeatCrossfadeDuration(targetBeat);
    const audioResult = await this.#engine.transition(
      currentBeat.audioSource,
      targetBeat.audioSource,
      duration,
    );

    LumennBeatStore.setActiveBeat(this.#storyboardId, targetBeatId);

    return { sceneChanged, audioResult };
  }

  stopAudio() {
    this.#engine.stop();
  }
}
