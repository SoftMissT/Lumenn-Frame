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

  /* ── Scene transitions (V14 canônico) ────────────────────────────── */

  /**
   * Enumera transições de Scene disponíveis em runtime.
   * V14: `CONFIG.Canvas.sceneTransitions` (registry de SceneTransitionDefinition).
   * V13: fallback Lumenn { cut, fade, dip }. Nunca hardcoda lista presumida.
   */
  getSceneTransitions() {
    const registry = CONFIG.Canvas?.sceneTransitions;
    if (registry && Object.keys(registry).length) {
      return Object.values(registry).map((d) => ({
        id: d.id ?? d.transitionType,
        label: d.label,
        defaultDuration: d.defaultDuration ?? 1000,
      }));
    }
    return [
      { id: "cut", label: "Cut", defaultDuration: 0 },
      { id: "fade", label: "Fade", defaultDuration: 1000 },
      { id: "dip", label: "Dip to Color", defaultDuration: 800 },
    ];
  },

  /** true se a build expõe o registry nativo de transições de Scene. */
  hasNativeSceneTransitions() {
    return !!(CONFIG.Canvas?.sceneTransitions && Object.keys(CONFIG.Canvas.sceneTransitions).length);
  },

  /**
   * Executa a transição de Scene.
   * V14: `canvas.transition.run({nextScene, activate, duration, transitionType})`
   *      usando o registry nativo (feature-detected).
   * V13/fallback: retorna "cut" | "fallback" — o chamador aplica o fade Lumenn
   *      (fade/dip-to-color) via overlay. Nunca finge transição que o fallback
   *      não implementa.
   * @returns {Promise<"native"|"cut"|"fallback"|null>}
   */
  async runSceneTransition({ scene, type, duration = 1000, color = "#000000" }) {
    const tr = type ?? "cut";
    const native =
      CONFIG.Canvas?.sceneTransitions?.[tr] ??
      Object.values(CONFIG.Canvas?.sceneTransitions ?? {}).find(
        (d) => (d.id ?? d.transitionType) === tr,
      );
    if (native && canvas.transition?.run && scene) {
      await canvas.transition.run({
        nextScene: scene,
        activate: true,
        duration,
        transitionType: tr,
        ...(tr === "dip" ? { color } : {}),
      });
      return "native";
    }
    if (tr === "cut") {
      if (scene) await this.activateScene(scene);
      return "cut";
    }
    return "fallback";
  },

  /* ── Folders (recursivo) ─────────────────────────────────────────── */

  /**
   * Coleta documentos de uma pasta e de TODAS as subpastas (árvore completa).
   * V14/V13: `folder.getSubfolders(true)`; fallback por `children` recursivo.
   * Dedup por uuid. Não filtra por tipo aqui (caller filtra).
   */
  collectFolderDocuments(folder) {
    const docs = [];
    const seen = new Set();
    const push = (d) => {
      if (d && d.uuid && !seen.has(d.uuid)) {
        seen.add(d.uuid);
        docs.push(d);
      }
    };
    for (const d of folder?.contents ?? []) push(d);
    let subs = [];
    if (typeof folder?.getSubfolders === "function") {
      subs = folder.getSubfolders(true) ?? [];
    } else {
      const walk = (f) => {
        for (const c of f?.children ?? []) {
          subs.push(c);
          walk(c);
        }
      };
      walk(folder);
    }
    for (const sub of subs) for (const d of sub.contents ?? []) push(d);
    return docs;
  },
};