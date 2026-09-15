import { LumennBeatStore } from "./beat-store.mjs";
import { LumennAudioEngine, LumennInvalidAudioSourceError } from "./audio-engine.mjs";

/**
 * LumennTransitionController — única peça que conhece o motor de áudio e
 * Scene.activate() (Specs §2.3). Valida permissão (RF-009) e conectividade
 * (RF-010) antes de agir. Fonte inválida não quebra a navegação (RF-011):
 * a Scene ainda é ativada e o Beat é sinalizado na UI.
 */
export class LumennTransitionController {
  #engine = new LumennAudioEngine();

  get engine() {
    return this.#engine;
  }

  /**
   * Navega para um Beat conectado ao ativo (Specs §4.2).
   * @returns {Promise<{sceneChanged: boolean, audioResult: string}>}
   * audioResult: "kept" | "crossfaded" | "faded-out" | "started" |
   *              "ignored" | "invalid-source" | "error"
   */
  async goToBeat(storyboardId, targetBeatId, currentMode = "ao-vivo") {
    const ignored = { sceneChanged: false, audioResult: "ignored" };
    if (currentMode !== "ao-vivo") return ignored;
    if (!game.user.isGM) return ignored;

    const storyboard = LumennBeatStore.getStoryboard(storyboardId);
    if (!storyboard) return ignored;
    const currentBeat = storyboard.beats.find((b) => b.id === storyboard.activeBeatId) ?? null;
    if (!currentBeat) return ignored;
    if (!currentBeat.connections.includes(targetBeatId)) return ignored;

    const targetBeat = storyboard.beats.find((b) => b.id === targetBeatId);
    if (!targetBeat) return ignored;

    let sceneChanged = false;
    if (targetBeat.sceneId) {
      const scene = game.scenes.get(targetBeat.sceneId);
      if (scene) {
        await scene.activate();
        sceneChanged = true;
      }
    }

    const duration = LumennBeatStore.getBeatCrossfadeDuration(targetBeat);
    let audioResult;
    try {
      audioResult = await this.#engine.transition(
        currentBeat.audioSource,
        targetBeat.audioSource,
        duration,
      );
    } catch (err) {
      if (err instanceof LumennInvalidAudioSourceError) {
        audioResult = "invalid-source";
        ui.notifications.warn(game.i18n.localize("LUMENN_FRAME.WarnInvalidAudioSource"));
      } else {
        console.error("lumenn-frame: falha na transição de áudio", err);
        audioResult = "error";
      }
    }

    LumennBeatStore.setActiveBeat(storyboardId, targetBeatId);
    return { sceneChanged, audioResult };
  }
}
