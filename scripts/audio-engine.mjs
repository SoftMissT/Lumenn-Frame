/**
 * LumennAudioEngine — Motor de continuidade de áudio (v0.1.1).
 *
 * Transições são dirigidas por documentos (PlaylistSound/Playlist .update),
 * não por Sound#fade local: manipulação direta de Sound não é transmitida aos
 * outros clientes — jogadores não ouviriam o crossfade. O estado `playing` +
 * `fadeDuration` dos documentos é sincronizado pelo próprio Foundry em todos
 * os clientes, e cada cliente executa o fade nativamente.
 *
 * APIs v13 verificadas na doc oficial (2026-09-14):
 * - Scene#activate(); Playlist#playAll/stopAll; Playlist#updateEmbeddedDocuments
 * - PlaylistSound#sound é lazy ("created lazily when playback is required")
 * - PlaylistSound#update({fadeDuration, playing}) dispara fade sincronizado
 *
 * Não conhece Scenes, UI ou game.settings — recebe tudo por parâmetro
 * (Blueprint §3.3). Fonte atual inválida é tratada como silêncio (RF-011,
 * a navegação não pode quebrar); fonte destino inválida lança
 * LumennInvalidAudioSourceError (Specs §4.1).
 *
 * Nota: o patch de fadeDuration persiste no documento do som — efeito
 * colateral necessário para fade global com duração por Beat (RF-006/RF-012).
 */
export class LumennInvalidAudioSourceError extends Error {
  constructor(source) {
    super(`Fonte de áudio inválida ou excluída: ${source?.type ?? "?"}:${source?.id ?? "?"}`);
    this.name = "LumennInvalidAudioSourceError";
    this.source = source;
  }
}

export class LumennAudioEngine {
  #transitioning = false;

  get isTransitioning() {
    return this.#transitioning;
  }

  /**
   * Decide e executa a transição de áudio entre dois Beats (Specs §4.1).
   * @param {{ type: "track"|"playlist", id: string }|null} currentSource
   * @param {{ type: "track"|"playlist", id: string }|null} targetSource
   * @param {number} crossfadeDuration ms
   * @returns {Promise<"kept"|"crossfaded"|"faded-out"|"started"|"ignored">}
   * "ignored" = RF-008 (transição em andamento neste storyboard).
   * @throws {LumennInvalidAudioSourceError} se targetSource não resolve.
   */
  async transition(currentSource, targetSource, crossfadeDuration = 3000) {
    if (this.#transitioning) return "ignored";
    this.#transitioning = true;
    try {
      const current = currentSource ? this.#resolve(currentSource) : null;
      const target = targetSource ? this.#resolveStrict(targetSource) : null;

      if (currentSource && targetSource && this.#sameSource(currentSource, targetSource)) {
        if (current && !current.playing) await this.#start(current, crossfadeDuration);
        return "kept";
      }
      if (current && !target) {
        await this.#stop(current, crossfadeDuration);
        return "faded-out";
      }
      if (!current && target) {
        await this.#start(target, crossfadeDuration);
        return "started";
      }
      if (!current && !target) return "kept";
      await Promise.all([
        this.#stop(current, crossfadeDuration),
        this.#start(target, crossfadeDuration),
      ]);
      return "crossfaded";
    } finally {
      this.#transitioning = false;
    }
  }

  #sameSource(a, b) {
    return a.type === b.type && a.id === b.id;
  }

  #resolve(source) {
    try {
      if (source.type === "track") {
        // O schema aceita tanto UUID completo quanto o ID embutido de uma faixa.
        if (source.id.includes(".")) return fromUuidSync(source.id) ?? null;
        for (const playlist of game.playlists ?? []) {
          const sound = playlist.sounds?.get(source.id);
          if (sound) return sound;
        }
        return null;
      }
      if (source.type === "playlist") return game.playlists.get(source.id) ?? null;
    } catch {
      return null;
    }
    return null;
  }

  #resolveStrict(source) {
    const doc = this.#resolve(source);
    if (!doc) throw new LumennInvalidAudioSourceError(source);
    return doc;
  }

  async #start(doc, duration) {
    if (doc.documentName === "PlaylistSound") {
      await doc.update({ fadeDuration: duration, playing: true });
      return;
    }
    await doc.updateEmbeddedDocuments(
      "PlaylistSound",
      doc.sounds.map((s) => ({ _id: s.id, fadeDuration: duration })),
    );
    await doc.playAll();
  }

  async #stop(doc, duration) {
    if (doc.documentName === "PlaylistSound") {
      await doc.update({ fadeDuration: duration, playing: false });
      return;
    }
    const playing = doc.sounds.filter((s) => s.playing);
    if (playing.length) {
      await doc.updateEmbeddedDocuments(
        "PlaylistSound",
        playing.map((s) => ({ _id: s.id, fadeDuration: duration })),
      );
    }
    await doc.stopAll();
  }
}
