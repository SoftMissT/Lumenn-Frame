/**
 * LumennCompat — camada central de compatibilidade Foundry v13.350 ↔ v14.999.
 *
 * REGRA ZERO: toda diferença de API entre gerações fica concentrada aqui.
 * O resto do módulo usa somente as APIs internas expostas por este objeto.
 * Feature detection quando possível; generation check apenas quando necessário.
 */

export const SOCKET_NAME = "module.lumenn-frame";

export const LumennCompat = {
  /** Geração do Foundry (ex.: 13, 14). */
  getGeneration() {
    return game.release?.generation ?? 13;
  },

  isV14() {
    return (game.release?.generation ?? 13) >= 14;
  },

  isGM() {
    return game.user?.isGM ?? false;
  },

  userId() {
    return game.userId;
  },

  /** Extrai o payload do drag de forma compatível v13/v14. */
  getDragData(event) {
    const TE = foundry.applications?.ux?.TextEditor;
    if (TE?.getDragEventData) return TE.getDragEventData(event);
    try {
      return JSON.parse(event.dataTransfer?.getData("text/plain") || "null");
    } catch {
      return null;
    }
  },

  /** Resolve um UUID para o documento (await). */
  async resolveUuid(uuid) {
    if (!uuid) return null;
    try {
      return await fromUuid(uuid);
    } catch {
      return null;
    }
  },

  /** Resolve um UUID sincronamente. */
  resolveUuidSync(uuid) {
    if (!uuid) return null;
    try {
      return fromUuidSync(uuid);
    } catch {
      return null;
    }
  },

  /** Ativa uma Scene (GM). */
  async activateScene(scene) {
    if (!scene?.activate) return null;
    return scene.activate();
  },

  /** Pré-carrega uma Scene, se a API existir. */
  preloadScene(scene) {
    if (scene?.preload) return Promise.resolve(scene.preload());
    return Promise.resolve(null);
  },

  /** Atualiza um PlaylistSound (fade/playing) de forma compatível. */
  async updatePlaylistSound(sound, data) {
    if (!sound?.update) return null;
    return sound.update(data);
  },

  /** Lê o fadeDuration de um PlaylistSound sem assumir shape. */
  getPlaylistSoundFade(sound) {
    if (!sound) return null;
    return sound.fadeDuration ?? sound.data?.fadeDuration ?? null;
  },

  /* ── Sockets (module socket, v13+; requer "socket": true no manifest) ── */

  socketOn(handler) {
    if (game.socket?.on) {
      game.socket.on(SOCKET_NAME, handler);
      return true;
    }
    return false;
  },

  socketEmit(payload) {
    if (game.socket?.emit) {
      game.socket.emit(SOCKET_NAME, payload);
      return true;
    }
    return false;
  },

  get activeGM() {
    return game.users?.activeGM ?? null;
  },

  /** Tamanho da viewport do navegador (para Workspace expandido). */
  getViewportSize() {
    return { width: window.innerWidth, height: window.innerHeight };
  },
};
