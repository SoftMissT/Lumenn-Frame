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
 *   Track → `PlaylistSound.fade`; Playlist → `Playlist.fade`
 *   (`playSound`/`stopAll`). `playAll` nunca é usado porque inicia todas as
 *   faixas simultaneamente.
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
   * `Playlist.fade` (uma única autoridade, evitando double-fade).
   */
  async #start(doc, duration, exclusive = true) {
    if (doc.documentName === "PlaylistSound") {
      this.#saveFade(doc);
      if (!exclusive) {
        await doc.update({ fade: duration, playing: true });
        return;
      }
      await doc.update({ fade: duration });
      const playlist = doc.parent;
      const competing = playlist?.sounds?.filter(
        (sound) => sound.id !== doc.id && sound.playing,
      ) ?? [];
      if (competing.length && playlist?.updateEmbeddedDocuments) {
        await playlist.updateEmbeddedDocuments(
          "PlaylistSound",
          competing.map((sound) => ({ _id: sound.id, playing: false })),
        );
      } else if (competing.length) {
        await Promise.all(competing.map((sound) => sound.update({ playing: false })));
      }
      if (playlist?.playSound) await playlist.playSound(doc);
      else await doc.update({ playing: true });
      return;
    }
    if (!exclusive) {
      const sounds = doc.sounds?.contents ?? [...(doc.sounds?.values?.() ?? [])];
      const sound = sounds[0] ?? null;
      if (sound) await this.#start(sound, duration, false);
      return;
    }
    this.#saveFade(doc);
    await doc.update({ fade: duration });
    // Playlist#playAll inicia TODAS as faixas ao mesmo tempo. Para usar uma
    // Playlist como fonte narrativa, iniciamos somente uma faixa e deixamos o
    // próprio Playlist#playSound aplicar as regras do modo da playlist.
    const sounds = doc.sounds?.contents ?? [...(doc.sounds?.values?.() ?? [])];
    const sound = sounds.find((entry) => entry.playing) ?? sounds[0] ?? null;
    if (sound) {
      const competing = sounds.filter(
        (entry) => entry.id !== sound.id && entry.playing,
      );
      if (competing.length && doc.updateEmbeddedDocuments) {
        await doc.updateEmbeddedDocuments(
          "PlaylistSound",
          competing.map((entry) => ({ _id: entry.id, playing: false })),
        );
      } else if (competing.length) {
        await Promise.all(competing.map((entry) => entry.update({ playing: false })));
      }
      if (!sound.playing) await doc.playSound(sound);
    }
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
   * Transição dirigida por modo. Há no máximo uma música principal, enquanto
   * múltiplos efeitos sonoros podem tocar junto com ela.
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
      const uniqueEntries = (sources, strict = false) => {
        const entries = [];
        const seen = new Set();
        for (const source of sources ?? []) {
          if (!source) continue;
          const doc = strict ? this.#resolveStrict(source) : this.#resolve(source);
          if (!doc) continue;
          const key = doc.uuid ?? `${doc.documentName}:${doc.id}`;
          if (seen.has(key)) continue;
          seen.add(key);
          entries.push({
            doc,
            role: source.role === "sfx" ? "sfx" : "music",
          });
        }
        return entries;
      };
      const current = uniqueEntries(currentSources)
        .filter((entry) => entry.doc.playing);
      const requested = uniqueEntries(targetSources, true);
      const musicTarget = requested
        .filter((entry) => entry.role === "music")
        .at(-1) ?? null;
      const sfxTargets = requested.filter((entry) => entry.role === "sfx");
      const targets = [...(musicTarget ? [musicTarget] : []), ...sfxTargets];
      const keyOf = (entry) => entry?.doc?.uuid ??
        `${entry?.doc?.documentName}:${entry?.doc?.id}`;
      const stopOutside = async (desired, fade) => {
        const desiredKeys = new Set(desired.map(keyOf));
        await Promise.all(
          current
            .filter((entry) => !desiredKeys.has(keyOf(entry)))
            .map((entry) => this.#stop(entry.doc, fade)),
        );
      };
      const startMissing = async (desired, fade) => {
        for (const entry of desired) {
          if (!entry.doc.playing)
            await this.#start(entry.doc, fade, entry.role === "music");
        }
      };

      switch (mode) {
        case "keep": {
          const keeper = current.find((entry) => entry.role === "music") ??
            musicTarget;
          const desired = [...(keeper ? [keeper] : []), ...sfxTargets];
          await stopOutside(desired, 0);
          await startMissing(desired, duration);
          return "kept";
        }
        case "cut":
          await stopOutside(targets, 0);
          await startMissing(targets, 0);
          return "cut";
        case "fadeout":
          await Promise.all(current.map((entry) => this.#stop(entry.doc, duration)));
          return "faded-out";
        case "fadein":
          await stopOutside(targets, 0);
          await startMissing(targets, duration);
          return "started";
        case "crossfade":
          await stopOutside(targets, duration);
          await startMissing(targets, duration);
          return "crossfaded";
        case "auto":
        default: {
          const currentKeys = new Set(current.map(keyOf));
          const targetKeys = new Set(targets.map(keyOf));
          const same = currentKeys.size === targetKeys.size &&
            [...currentKeys].every((key) => targetKeys.has(key));
          if (same && targets.length) return "kept";
          if (!targets.length && current.length) {
            await Promise.all(current.map((entry) => this.#stop(entry.doc, duration)));
            return "faded-out";
          }
          if (!current.length && targets.length) {
            await startMissing(targets, duration);
            return "started";
          }
          if (!current.length && !targets.length) return "kept";
          await stopOutside(targets, duration);
          await startMissing(targets, duration);
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
