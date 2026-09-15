/**
 * LumennAudioEngine — Motor de continuidade de áudio (v0.1.2).
 *
 * Transições são dirigidas por documentos (PlaylistSound/Playlist .update),
 * não por Sound#fade local: manipulação direta de Sound não é transmitida aos
 * outros clientes — jogadores não ouviriam o crossfade.
 *
 * SCHEMA DE FADE (correto, V13 e V14):
 * - `PlaylistSoundData.fade?: number` — campo persistido.
 * - `PlaylistSound#fadeDuration` — accessor computado (NUNCA gravar).
 * - `PlaylistData.fade?: number` — fade da Playlist; combina com o fade do Track
 *   (double-fade). Por isso o Lumenn aplica fade em UM nível por transição:
 *   Track → `PlaylistSound.fade`; Playlist → `Playlist.fade` (playAll/stopAll).
 *
 * Preservação: o valor anterior de `fade` é salvo antes da transição e
 * restaurado ao final — a configuração de Playlist/Track do usuário não é
 * alterada permanentemente.
 *
 * Não conhece Scenes, UI ou game.settings — recebe tudo por parâmetro.
 * Fonte atual inválida = silêncio (navegação não quebra); fonte destino
 * inválida lança LumennInvalidAudioSourceError.
 */
export class LumennInvalidAudioSourceError extends Error {
  constructor(source) {
    super(
      `Fonte de áudio inválida ou excluída: ${source?.type ?? "?"}:${source?.id ?? "?"}`,
    );
    this.name = "LumennInvalidAudioSourceError";
    this.source = source;
  }
}

export class LumennAudioEngine {
  #transitioning = false;
  #savedFades = new Map();

  get isTransitioning() {
    return this.#transitioning;
  }

  /**
   * Decide e executa a transição de áudio entre duas fontes (Specs §4.1).
   * Mantido para compatibilidade; o fluxo atual do Graph Editor usa applyMode.
   */
  async transition(currentSource, targetSource, crossfadeDuration = 3000) {
    if (this.#transitioning) return "ignored";
    this.#transitioning = true;
    try {
      const current = currentSource ? this.#resolve(currentSource) : null;
      const target = targetSource ? this.#resolveStrict(targetSource) : null;

      if (
        currentSource &&
        targetSource &&
        this.#sameSource(currentSource, targetSource)
      ) {
        if (current && !current.playing)
          await this.#start(current, crossfadeDuration);
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
      await this.#restoreFades();
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
      if (source.type === "playlist")
        return game.playlists.get(source.id) ?? null;
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

  /* ── Save/restore do fade do usuário ─────────────────────────────── */

  #saveFade(doc) {
    if (!doc?.uuid || this.#savedFades.has(doc.uuid)) return;
    // Lê o campo persistido (`fade`); `fadeDuration` é accessor equivalente.
    this.#savedFades.set(doc.uuid, doc.fade ?? doc.fadeDuration ?? 0);
  }

  async #restoreFades() {
    const fades = [...this.#savedFades.entries()];
    this.#savedFades.clear();
    await Promise.all(
      fades.map(async ([uuid, prev]) => {
        const doc = fromUuidSync(uuid);
        if (doc?.update) await doc.update({ fade: prev });
      }),
    );
  }

  /* ── Start/stop dirigidos por documento, autoridade única de fade ── */

  /**
   * Inicia uma fonte. Track → grava `PlaylistSound.fade`; Playlist → grava
   * `Playlist.fade` (uma única autoridade, evitando double-fade com playAll).
   */
  async #start(doc, duration) {
    if (doc.documentName === "PlaylistSound") {
      this.#saveFade(doc);
      await doc.update({ fade: duration, playing: true });
      return;
    }
    this.#saveFade(doc);
    await doc.update({ fade: duration });
    await doc.playAll();
  }

  /** Para uma fonte. Mesma política de autoridade única do fade. */
  async #stop(doc, duration) {
    if (doc.documentName === "PlaylistSound") {
      this.#saveFade(doc);
      await doc.update({ fade: duration, playing: false });
      return;
    }
    this.#saveFade(doc);
    await doc.update({ fade: duration });
    await doc.stopAll();
  }

  /**
   * Transição de áudio dirigida por modo, com múltiplas fontes (Audio Nodes).
   * @param {"auto"|"keep"|"cut"|"crossfade"|"fadeout"|"fadein"} mode
   * @param {Array<{type:"track"|"playlist", id:string}|null>} currentSources
   * @param {Array<{type:"track"|"playlist", id:string}|null>} targetSources
   * @param {number} duration ms
   * @param {"linear"|"equal-power"} curve — só "linear" é efetivo via fade de
   *        documento do Foundry; "equal-power" é PARTIAL (persistido, executa linear).
   * @returns {Promise<string>} kept|faded-out|started|crossfaded|cut|ignored|invalid-source|error
   */
  async applyMode(mode, currentSources, targetSources, duration = 3000, curve = "linear") {
    if (this.#transitioning) return "ignored";
    this.#transitioning = true;
    try {
      const current = (currentSources ?? [])
        .map((s) => (s ? this.#resolve(s) : null))
        .filter(Boolean);
      const target = (targetSources ?? [])
        .map((s) => (s ? this.#resolve(s) : null))
        .filter(Boolean);
      const stopAll = () =>
        Promise.all(current.map((d) => this.#stop(d, duration)));
      const startAll = () =>
        Promise.all(target.map((d) => this.#start(d, duration)));

      switch (mode) {
        case "keep":
          for (const d of current)
            if (!d.playing) await this.#start(d, duration);
          return "kept";
        case "cut":
          // Fonte anterior termina e nova inicia imediatamente (fade 0).
          await Promise.all([
            ...current.map((d) => this.#stop(d, 0)),
            ...target.map((d) => this.#start(d, 0)),
          ]);
          return "cut";
        case "fadeout":
          await stopAll();
          return "faded-out";
        case "fadein":
          await startAll();
          return "started";
        case "crossfade":
          await Promise.all([
            ...current.map((d) => this.#stop(d, duration)),
            ...target.map((d) => this.#start(d, duration)),
          ]);
          return "crossfaded";
        case "auto":
        default: {
          const same =
            current.length === target.length &&
            current.length > 0 &&
            current.every((c) =>
              target.some(
                (t) => t.id === c.id && t.documentName === c.documentName,
              ),
            );
          if (same) {
            for (const d of target)
              if (!d.playing) await this.#start(d, duration);
            return "kept";
          }
          if (!target.length && current.length) {
            await stopAll();
            return "faded-out";
          }
          if (!current.length && target.length) {
            await startAll();
            return "started";
          }
          if (!current.length && !target.length) return "kept";
          await Promise.all([
            ...current.map((d) => this.#stop(d, duration)),
            ...target.map((d) => this.#start(d, duration)),
          ]);
          return "crossfaded";
        }
      }
    } catch (err) {
      if (err instanceof LumennInvalidAudioSourceError) return "invalid-source";
      console.error("lumenn-frame: falha no applyMode", err);
      return "error";
    } finally {
      this.#transitioning = false;
      await this.#restoreFades();
    }
  }
}