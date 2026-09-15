/**
 * LumennCompat — camada central de compatibilidade Foundry.
 *
 * PRIMÁRIO:  Foundry VTT 14.367 (API canônica).
 * RETROATIVO: Foundry VTT 13.350+ (adapter apenas onde há diferença verificada).
 * Faixa: 13.350 → 14.999.
 *
 * Regra: cada método documenta a implementação V14, o fallback V13 e a fonte.
 * Nenhuma API exclusiva de uma geração é usada fora desta camada.
 */

export const SOCKET_NAME = "module.lumenn-frame";

export const LumennCompat = {
  /** Geração do Foundry (ex.: 14). V14 é a referência canônica. */
  getGeneration() {
    return game.release?.generation ?? 14;
  },

  isV14() {
    return (game.release?.generation ?? 14) >= 14;
  },

  isGM() {
    return game.user?.isGM ?? false;
  },

  userId() {
    return game.userId;
  },

  /**
   * Extrai o payload do drag (sidebar) de forma compatível.
   * V14: `foundry.applications.ux.TextEditor.getDragEventData(event)`.
   * V13: mesmo namespace (idêntico). Fallback: parse manual do `text/plain`.
   * Fonte: Context7 (ApplicationV2/DragDrop), idêntico v13→v14.
   */
  getDragData(event) {
    const TE = foundry.applications?.ux?.TextEditor;
    if (TE?.getDragEventData) return TE.getDragEventData(event);
    try {
      return JSON.parse(event.dataTransfer?.getData("text/plain") || "null");
    } catch {
      return null;
    }
  },

  /**
   * Resolve UUID -> documento (await).
   * V14: `fromUuid` global. V13: idêntico. Fonte: Context7 (Documents id vs uuid).
   */
  async resolveUuid(uuid) {
    if (!uuid) return null;
    try {
      return await fromUuid(uuid);
    } catch {
      return null;
    }
  },

  /** V14/V13: `fromUuidSync` global (idêntico). Fonte: Context7. */
  resolveUuidSync(uuid) {
    if (!uuid) return null;
    try {
      return fromUuidSync(uuid);
    } catch {
      return null;
    }
  },

  /**
   * Ativa uma Scene (GM only).
   * V14: `Scene#activate()`. V13: idêntico. Fonte: Research-Lumenn-Frame (doc oficial).
   */
  async activateScene(scene) {
    if (!scene?.activate) return null;
    return scene.activate();
  },

  /** Pré-carrega uma Scene. V14: `Scene#preload()`. V13: idêntico. Fallback: no-op. */
  preloadScene(scene) {
    if (scene?.preload) return Promise.resolve(scene.preload());
    return Promise.resolve(null);
  },

  /**
   * Atualiza um PlaylistSound (fade/playing).
   * V14: `PlaylistSound#update({fadeDuration, playing})`. V13: idêntico (schema de documento).
   * Fonte: Research-Lumenn-Frame + audio-engine.mjs (verificado).
   */
  async updatePlaylistSound(sound, data) {
    if (!sound?.update) return null;
    return sound.update(data);
  },

  /**
   * Lê fadeDuration de um PlaylistSound sem assumir shape.
   * V14: `sound.fadeDuration`. V13: idêntico; fallback `sound.data.fadeDuration`.
   */
  getPlaylistSoundFade(sound) {
    if (!sound) return null;
    return sound.fadeDuration ?? sound.data?.fadeDuration ?? null;
  },

  /** Grava fadeDuration de forma tolerante ao shape (v13/v14). */
  setPlaylistSoundFade(sound, value) {
    if (sound?.update) return sound.update({ fadeDuration: value });
    return null;
  },

  /* ── Sockets (module socket) ─────────────────────────────────────── */
  // V14: `game.socket.emit/on` com `"socket": true` no manifest. V13: idêntico.
  // Fonte: Context7 (sockets).

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

  /** Alias semântico: broadcast de uma transição narrativa para os clientes. */
  broadcastTransition(payload) {
    return this.socketEmit({ type: "transition", ...payload });
  },

  get activeGM() {
    return game.users?.activeGM ?? null;
  },

  /** Tamanho da viewport (navegador) para Workspace expandido. */
  getViewportSize() {
    return { width: window.innerWidth, height: window.innerHeight };
  },

  /**
   * Expande uma ApplicationV2 para ocupar quase toda a viewport.
   * V14: `ApplicationV2#setPosition({left, top, width, height})`. V13: idêntico.
   * Fonte: Context7 (ApplicationV2 position/setPosition).
   */
  expandWorkspace(app) {
    const { width, height } = this.getViewportSize();
    const prev = { ...(app.position ?? {}) };
    app.setPosition({ left: 8, top: 8, width: width - 16, height: height - 16 });
    return prev;
  },
};