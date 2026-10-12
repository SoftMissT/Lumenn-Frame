/**
 * LumennCompat camada central de compatibilidade Foundry.
 *
 * PRIMÁRIO:  Foundry VTT 14.367 (API canônica).
 * RETROATIVO: Foundry VTT 13.350+ (adapter apenas onde há diferença verificada).
 * Faixa: 13.350 ? 14.999.
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
   * Fonte: Context7 (ApplicationV2/DragDrop), idêntico v13?v14.
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
   * V14: `Scene#activate({viewOptions})`; `viewOptions.transition` é a transição
   *      explícita que todo cliente usa ao desenhar a Scene (vence a da Scene).
   * V13: `Scene#activate()` sem opções (argumento ignorado).
   * Fonte: Research-Lumenn-Frame (doc oficial) + foundry.mjs 14.367 (Scene#activate).
   *
   * `suppressScenePlaylist`: no instante da ativação o Foundry chama
   * `PlaylistCollection#_onChangeScene`, que para a faixa da Scene anterior e
   * inicia a da nova com `update({playing})`, usando o `fade` de cada faixa
   * (tipicamente ~0 ms): vira um corte por cima do crossfade do Lumenn. Com a
   * opção, esse hook interno é suspenso somente durante a ativação (o storyboard
   * é quem conduz o áudio). Sem o método (outra versão), nada é suspenso.
   */
  async activateScene(scene, viewOptions, { suppressScenePlaylist = false } = {}) {
    if (!scene?.activate) return null;
    const playlists = game.playlists;
    const suppress =
      suppressScenePlaylist && typeof playlists?._onChangeScene === "function";
    const hadOwn = suppress && Object.hasOwn(playlists, "_onChangeScene");
    const original = suppress ? playlists._onChangeScene : null;
    if (suppress) playlists._onChangeScene = async () => {};
    try {
      return viewOptions
        ? await scene.activate({ viewOptions })
        : await scene.activate();
    } finally {
      if (suppress) {
        if (hadOwn) playlists._onChangeScene = original;
        else delete playlists._onChangeScene;
      }
    }
  },

  /**
   * Resolve a fonte de áudio do storyboard ({type, id}) para o documento.
   * track: UUID completo ou id embutido; playlist: id. Inválida = null.
   */
  resolveAudioDoc(source) {
    try {
      if (source?.type === "playlist") return game.playlists?.get(source.id) ?? null;
      if (source?.type === "track" && source.id) {
        if (source.id.includes(".")) return fromUuidSync(source.id) ?? null;
        for (const playlist of game.playlists ?? []) {
          const sound = playlist.sounds?.get(source.id);
          if (sound) return sound;
        }
      }
    } catch {
      return null;
    }
    return null;
  },

  /** Pré-carrega uma Scene. V14: `Scene#preload()`. V13: idêntico. Fallback: no-op. */
  preloadScene(scene) {
    if (scene?.preload) return Promise.resolve(scene.preload());
    return Promise.resolve(null);
  },

  /**
   * Atualiza um PlaylistSound (fade/playing).
   * V14: `PlaylistSound#update({fade, playing})` campo persistido é `fade`;
   *      `fadeDuration` é accessor computado (NUNCA gravar). V13: idêntico.
   * Fonte: schema PlaylistSoundData (`fade?: number`) + accessor `fadeDuration`.
   */
  async updatePlaylistSound(sound, data) {
    if (!sound?.update) return null;
    return sound.update(data);
  },

  /**
   * Lê o fade de um PlaylistSound sem assumir shape.
   * Campo persistido: `fade`. Accessor computado: `fadeDuration` (válido para LEITURA).
   */
  getPlaylistSoundFade(sound) {
    if (!sound) return null;
    return sound.fade ?? sound.fadeDuration ?? sound.data?.fade ?? null;
  },

  /** Grava o fade persistido (campo `fade`) nunca `fadeDuration`. */
  setPlaylistSoundFade(sound, value) {
    if (sound?.update) return sound.update({ fade: value });
    return null;
  },

  /* -- Sockets (module socket) --------------------------------------- */
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
    app.setPosition({
      left: 8,
      top: 8,
      width: width - 16,
      height: height - 16,
    });
    return prev;
  },

  /* -- Scene transitions (V14 canônico) ------------------------------ */

  /**
   * Enumera transições de Scene disponíveis em runtime.
   * V14: `CONFIG.Canvas.sceneTransitions` (registry de SceneTransitionDefinition).
   * V13: fallback Lumenn { cut, fade, dip }. Nunca hardcoda lista presumida.
   */
  getSceneTransitions() {
    const registry = CONFIG.Canvas?.sceneTransitions;
    if (registry && Object.keys(registry).length) {
      return Object.values(registry).map((d) => {
        const id = d.id ?? d.transitionType;
        const rawLabel = d.label ?? id;
        const localized = game.i18n?.localize?.(rawLabel) ?? rawLabel;
        const fallback = {
          crosshatch: "Crosshatch",
          dots: "Pontos",
          fade: "Dissolver",
          glitch: "Glitch",
          hole: "Buraco",
          holeSwirl: "Espiral",
          hologram: "Holograma",
          morph: "Morfose",
          swirl: "Redemoinho",
          waterDrop: "Gota d'água",
          waves: "Ondas",
          whiteNoise: "Ruído branco",
          wind: "Vento",
        };
        return {
          id,
          label: localized !== rawLabel ? localized : (fallback[id] ?? id),
          defaultDuration: d.defaultDuration ?? 1000,
        };
      });
    }
    return [
      { id: "cut", label: "Cut", defaultDuration: 0 },
      { id: "fade", label: "Fade", defaultDuration: 1000 },
      { id: "dip", label: "Dip to Color", defaultDuration: 800 },
    ];
  },

  /** true se a build expõe o registry nativo de transições de Scene. */
  hasNativeSceneTransitions() {
    return !!(
      CONFIG.Canvas?.sceneTransitions &&
      Object.keys(CONFIG.Canvas.sceneTransitions).length
    );
  },

  /** true se `type` é uma transição registrada nesta build (nativa ou do Lumenn). */
  hasSceneTransition(type) {
    const registry = CONFIG.Canvas?.sceneTransitions ?? {};
    return (
      !!type &&
      (!!registry[type] ||
        Object.values(registry).some((d) => (d.id ?? d.transitionType) === type))
    );
  },

  /**
   * Aguarda a animação de transição do canvas desta Scene terminar.
   * O `Canvas#draw` inicia a animação DEPOIS de `canvasReady` e sem aguardá-la:
   * nem `Scene#view()` nem `Scene#activate()` esperam o efeito acabar. Espera a
   * Scene ficar pronta, dá uma janela curta para a animação começar e então
   * aguarda `canvas.transition.promise`. Sem animação, volta logo.
   */
  async waitForSceneTransition(scene, { timeout = 10000, startWindow = 600 } = {}) {
    const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
    const t0 = performance.now();
    const ready = () =>
      canvas.scene?.id === scene?.id && canvas.ready && !canvas.loading;
    while (!ready() && performance.now() - t0 < timeout) await sleep(30);
    const t1 = performance.now();
    while (!canvas.transition?.isRunning && performance.now() - t1 < startWindow)
      await sleep(16);
    if (canvas.transition?.isRunning) await canvas.transition.promise;
  },

  /**
   * Troca de Scene com a transição escolhida na edge.
   *
   * V14: o efeito é pedido pelo caminho canônico do core, `viewOptions.transition`
   *      em `Scene#view()` / `Scene#activate()`; o `Canvas#draw` captura e anima.
   *      NÃO usa `canvas.transition.run({nextScene})`: no 14.367 o `#animateTransition`
   *      do draw chama `transition._reset()` enquanto o run mantém o lock e destrói
   *      a captura dele (medido no Foundry real: o run terminava ~14 ms depois do
   *      `_play`, sem animar; `view({transition})` animou os 1000 ms).
   * Ativação (GM): `activate({viewOptions})` leva o mesmo efeito a TODOS os
   *      clientes. Com `playersTransition: false` o GM vê o efeito em `view()` e a
   *      ativação sai com `type: null` (jogadores trocam sem efeito).
   *      A playlist da Scene do Foundry é suspensa na ativação (ver `activateScene`).
   * V13/fallback: retorna "cut" | "fallback"; o chamador aplica o fade Lumenn
   *      (overlay). Nunca finge transição que o fallback não implementa.
   * @returns {Promise<"native"|"cut"|"fallback">}
   */
  async runSceneTransition({
    scene,
    type,
    duration = 1000,
    color = "#000000",
    activate = true,
    playersTransition = true,
  }) {
    const tr = type ?? "cut";
    const cutOptions = { transition: { type: null } };
    const canActivate = () => activate && this.isGM() && !!scene && !scene.active;
    const keep = { suppressScenePlaylist: true };

    if (scene && tr !== "cut" && this.hasSceneTransition(tr) && scene.view) {
      const options = { transition: { type: tr, duration } };
      try {
        await this.preloadScene(scene);
        if (canActivate() && !playersTransition) {
          await scene.view(options);
          await this.waitForSceneTransition(scene);
          await this.activateScene(scene, cutOptions, keep);
        } else if (canActivate()) {
          await this.activateScene(scene, options, keep);
          await this.waitForSceneTransition(scene);
        } else {
          await scene.view(options);
          await this.waitForSceneTransition(scene);
        }
        return "native";
      } catch (error) {
        console.error("Lumenn Frame: falha na transição nativa; usando fallback.", error);
      }
    }
    if (tr === "cut") {
      if (scene) {
        // `type: null` desliga a transição própria da Scene: cut é corte seco.
        if (canActivate()) await this.activateScene(scene, cutOptions, keep);
        else if (scene.view) await scene.view(cutOptions);
      }
      return "cut";
    }
    console.warn(`Lumenn Frame: transition "${tr}" unavailable; using fallback.`);
    return "fallback";
  },

  /**
   * Reproduz uma transição somente neste cliente e restaura a Scene visualizada.
   * Nunca ativa a Scene globalmente, emite socket ou altera áudio/storyboard.
   */
  async previewSceneTransition({ scene, type, duration = 1000, color = "#000000" }) {
    const previous = canvas.scene ?? null;
    if (!scene) return "missing-scene";
    try {
      const result = await this.runSceneTransition({
        scene,
        type,
        duration,
        color,
        activate: false,
      });
      if (result === "fallback" && scene.view) {
        await scene.view();
        await new Promise((resolve) => setTimeout(resolve, Math.max(0, duration)));
      }
      return result;
    } finally {
      if (previous?.id && canvas.scene?.id !== previous.id && previous.view) {
        await previous.view({ transition: { type: null } });
      }
    }
  },

  /* -- Folders (recursivo) ------------------------------------------- */

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
