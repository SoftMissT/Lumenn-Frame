/**
 * LumennAudioEngine — Motor de continuidade de áudio.
 * Decide e executa transições entre Beats: manter, crossfade, fade-out.
 * Não conhece Scenes, UI ou game.settings — recebe tudo por parâmetro.
 */
export class LumennAudioEngine {
  #activeSound = null;
  #transitioning = false;

  get isTransitioning() {
    return this.#transitioning;
  }

  /**
   * @param {{ type: "track"|"playlist", id: string }|null} currentSource
   * @param {{ type: "track"|"playlist", id: string }|null} targetSource
   * @param {number} crossfadeDuration ms
   * @returns {Promise<"kept"|"crossfaded"|"faded-out"|"started"|"error">}
   */
  async transition(currentSource, targetSource, crossfadeDuration = 3000) {
    if (this.#transitioning) return "kept";
    this.#transitioning = true;

    try {
      const current = currentSource ? this.#resolveSound(currentSource) : null;
      const target = targetSource ? this.#resolveSound(targetSource) : null;

      if (!current && !target) return "kept";

      if (current && target && this.#sameSource(currentSource, targetSource)) {
        if (!current.playing) await current.play();
        return "kept";
      }

      if (current && !target) {
        await current.fade(0, { duration: crossfadeDuration });
        await current.stop();
        this.#activeSound = null;
        return "faded-out";
      }

      if (!current && target) {
        target.volume = 0;
        await target.play();
        await target.fade(1, { duration: crossfadeDuration });
        this.#activeSound = target;
        return "started";
      }

      if (current && target) {
        target.volume = 0;
        await target.play();
        await Promise.all([
          current.fade(0, { duration: crossfadeDuration }),
          target.fade(1, { duration: crossfadeDuration }),
        ]);
        await current.stop();
        this.#activeSound = target;
        return "crossfaded";
      }

      return "kept";
    } catch (err) {
      console.error("lumenn-frame: audio-engine transition error", err);
      return "error";
    } finally {
      this.#transitioning = false;
    }
  }

  stop() {
    if (this.#activeSound && this.#activeSound.playing) {
      this.#activeSound.stop();
    }
    this.#activeSound = null;
  }

  #resolveSound(source) {
    if (source.type === "track") {
      const ps = fromUuidSync(source.id);
      return ps?.sound ?? null;
    }
    if (source.type === "playlist") {
      const playlist = fromUuidSync(source.id);
      if (!playlist?.sounds?.size) return null;
      const first = playlist.sounds.find((s) => s.sound?.playing) ?? playlist.sounds.first();
      return first?.sound ?? null;
    }
    return null;
  }

  #sameSource(a, b) {
    return a && b && a.type === b.type && a.id === b.id;
  }
}
