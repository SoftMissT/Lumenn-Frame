import {
  LumennAudioEngine,
  LumennInvalidAudioSourceError,
} from "./audio-engine.mjs";

/**
 * LumennTransitionController — peça que conhece o motor de áudio.
 * No Graph Editor 2.0, o fluxo (Scene) é conduzido pelo app; este controller
 * concentra apenas a decisão/execução de áudio dirigida por modo, sem conhecer
 * Scenes nem UI. Validação de permissão/modo vive no app e no socket.
 */
export class LumennTransitionController {
  #engine = new LumennAudioEngine();

  get engine() {
    return this.#engine;
  }

  /**
   * Transição de áudio dirigida por modo, operando sobre listas de fontes
   * resolvidas dos Audio Nodes anexados a cada Scene.
   * @param {Array<{type:"track"|"playlist", id:string}|null>} currentSources
   * @param {Array<{type:"track"|"playlist", id:string}|null>} targetSources
   * @param {{mode?:string, crossfadeDuration?:number}|null} audioTrans
   * @param {number} defaultFade ms (usado quando a edge não define)
   * @returns {Promise<string>} kept|faded-out|started|crossfaded|ignored|invalid-source|error
   */
  async goToAudio(
    currentSources,
    targetSources,
    audioTrans,
    defaultFade = 3000,
    defaultCurve = "linear",
  ) {
    const mode = audioTrans?.mode ?? "auto";
    const duration = audioTrans?.crossfadeDuration ?? defaultFade;
    const curve = audioTrans?.curve ?? defaultCurve;
    try {
      return await this.#engine.applyMode(
        mode,
        currentSources,
        targetSources,
        duration,
        curve,
      );
    } catch (err) {
      if (err instanceof LumennInvalidAudioSourceError) return "invalid-source";
      console.error("lumenn-frame: falha na transição de áudio", err);
      return "error";
    }
  }
}
