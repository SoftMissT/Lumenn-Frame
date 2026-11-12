export const SOCKET_NAME = 'module.lumenn-frame';
export const LumennCompat = {
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
    getDragData(event) {
        const TE = foundry.applications?.ux?.TextEditor;
        if (TE?.getDragEventData) return TE.getDragEventData(event);
        try {
            return JSON.parse(event.dataTransfer?.getData('text/plain') || 'null');
        } catch {
            return null;
        }
    },
    async resolveUuid(uuid) {
        if (!uuid) return null;
        try {
            return await fromUuid(uuid);
        } catch {
            return null;
        }
    },
    resolveUuidSync(uuid) {
        if (!uuid) return null;
        try {
            return fromUuidSync(uuid);
        } catch {
            return null;
        }
    },
    async activateScene(scene, viewOptions, { suppressScenePlaylist = false } = {}) {
        if (!scene?.activate) return null;
        const playlists = game.playlists;
        const suppress = suppressScenePlaylist && typeof playlists?._onChangeScene === 'function';
        const hadOwn = suppress && Object.hasOwn(playlists, '_onChangeScene');
        const original = suppress ? playlists._onChangeScene : null;
        if (suppress) playlists._onChangeScene = async () => {};
        try {
            return viewOptions
                ? await scene.activate({
                      viewOptions,
                  })
                : await scene.activate();
        } finally {
            if (suppress) {
                if (hadOwn) playlists._onChangeScene = original;
                else delete playlists._onChangeScene;
            }
        }
    },
    resolveAudioDoc(source) {
        try {
            if (source?.type === 'playlist') return game.playlists?.get(source.id) ?? null;
            if (source?.type === 'track' && source.id) {
                if (source.id.includes('.')) return fromUuidSync(source.id) ?? null;
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
    /**
     * Carrega texturas e o primeiro som da cena só neste cliente.
     * `Scene` não tem `preload()`: a API é `game.scenes.preload(id, …)`.
     * v14 recebe `{broadcast}`; v13 recebe `push` booleano. Nunca transmite.
     */
    preloadScene(scene) {
        if (!scene?.id) return Promise.resolve(null);
        const scenes = game.scenes;
        if (typeof scenes?.preload === 'function')
            return Promise.resolve(scenes.preload(scene.id, this.isV14() ? { broadcast: false } : false));
        if (typeof scene.preload === 'function') return Promise.resolve(scene.preload());
        return Promise.resolve(null);
    },
    /** Fundo principal da cena: v14 mora no nível inicial; v13 no próprio documento. */
    sceneBackgroundSrc(scene) {
        if (!scene) return '';
        // v14 depreciou `Scene#background` (some no v16): não tocar o getter lá.
        if (this.isV14()) return scene.initialLevel?.background?.src ?? '';
        return scene.background?.src ?? '';
    },
    /**
     * O core engole falha de textura (`allSettled` + `console.warn`): sem esta checagem,
     * fundo 404 apareceria como "pronto". Lança se o fundo não entrou no cache.
     */
    assertScenePreloaded(scene) {
        const src = this.sceneBackgroundSrc(scene);
        if (!src) return;
        const loader = foundry.canvas?.TextureLoader?.loader;
        if (typeof loader?.getCache !== 'function') return;
        if (!loader.getCache(src)) throw new Error(`Lumenn Frame: fundo não carregou (${src}).`);
    },
    async updatePlaylistSound(sound, data) {
        if (!sound?.update) return null;
        return sound.update(data);
    },
    getPlaylistSoundFade(sound) {
        if (!sound) return null;
        return sound.fade ?? sound.fadeDuration ?? sound.data?.fade ?? null;
    },
    setPlaylistSoundFade(sound, value) {
        if (sound?.update)
            return sound.update({
                fade: value,
            });
        return null;
    },
    socketOn(handler) {
        if (game.socket?.on) {
            game.socket.on(SOCKET_NAME, handler);
            return true;
        }
        return false;
    },
    /** `options.recipients` (ids de usuário) entrega só a eles; sem isso, vai a todos. */
    socketEmit(payload, options) {
        if (game.socket?.emit) {
            if (options) game.socket.emit(SOCKET_NAME, payload, options);
            else game.socket.emit(SOCKET_NAME, payload);
            return true;
        }
        return false;
    },
    broadcastTransition(payload) {
        return this.socketEmit({
            type: 'transition',
            ...payload,
        });
    },
    get activeGM() {
        return game.users?.activeGM ?? null;
    },
    getViewportSize() {
        return {
            width: window.innerWidth,
            height: window.innerHeight,
        };
    },
    expandWorkspace(app) {
        const { width, height } = this.getViewportSize();
        const prev = {
            ...(app.position ?? {}),
        };
        app.setPosition({
            left: 8,
            top: 8,
            width: width - 16,
            height: height - 16,
        });
        return prev;
    },
    getSceneTransitions() {
        const registry = CONFIG.Canvas?.sceneTransitions;
        if (registry && Object.keys(registry).length) {
            return Object.values(registry).map((d) => {
                const id = d.id ?? d.transitionType;
                const rawLabel = d.label ?? id;
                const localized = game.i18n?.localize?.(rawLabel) ?? rawLabel;
                const fallback = {
                    crosshatch: 'Crosshatch',
                    dots: 'Pontos',
                    fade: 'Dissolver',
                    glitch: 'Glitch',
                    hole: 'Buraco',
                    holeSwirl: 'Espiral',
                    hologram: 'Holograma',
                    morph: 'Morfose',
                    swirl: 'Redemoinho',
                    waterDrop: "Gota d'água",
                    waves: 'Ondas',
                    whiteNoise: 'Ruído branco',
                    wind: 'Vento',
                };
                return {
                    id,
                    label: localized !== rawLabel ? localized : (fallback[id] ?? id),
                    defaultDuration: d.defaultDuration ?? 1e3,
                };
            });
        }
        return [
            {
                id: 'cut',
                label: 'Cut',
                defaultDuration: 0,
            },
            {
                id: 'fade',
                label: 'Fade',
                defaultDuration: 1e3,
            },
            {
                id: 'dip',
                label: 'Dip to Color',
                defaultDuration: 800,
            },
        ];
    },
    hasNativeSceneTransitions() {
        return !!(
            CONFIG.Canvas?.sceneTransitions && Object.keys(CONFIG.Canvas.sceneTransitions).length
        );
    },
    hasSceneTransition(type) {
        const registry = CONFIG.Canvas?.sceneTransitions ?? {};
        return (
            !!type &&
            (!!registry[type] ||
                Object.values(registry).some((d) => (d.id ?? d.transitionType) === type))
        );
    },
    async waitForSceneTransition(scene, { timeout = 1e4, startWindow = 600 } = {}) {
        const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
        const t0 = performance.now();
        const ready = () => canvas.scene?.id === scene?.id && canvas.ready && !canvas.loading;
        while (!ready() && performance.now() - t0 < timeout) await sleep(30);
        const t1 = performance.now();
        while (!canvas.transition?.isRunning && performance.now() - t1 < startWindow)
            await sleep(16);
        if (canvas.transition?.isRunning) await canvas.transition.promise;
    },
    async runSceneTransition({
        scene,
        type,
        duration = 1e3,
        color = '#000000',
        activate = true,
        playersTransition = true,
    }) {
        const tr = type ?? 'cut';
        const cutOptions = {
            transition: {
                type: null,
            },
        };
        const canActivate = () => activate && this.isGM() && !!scene && !scene.active;
        const keep = {
            suppressScenePlaylist: true,
        };
        if (scene && tr !== 'cut' && this.hasSceneTransition(tr) && scene.view) {
            const options = {
                transition: {
                    type: tr,
                    duration,
                },
            };
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
                return 'native';
            } catch (error) {
                console.error('Lumenn Frame: falha na transição nativa; usando fallback.', error);
            }
        }
        if (tr === 'cut') {
            if (scene) {
                if (canActivate()) await this.activateScene(scene, cutOptions, keep);
                else if (scene.view) await scene.view(cutOptions);
            }
            return 'cut';
        }
        console.warn(`Lumenn Frame: transition "${tr}" unavailable; using fallback.`);
        return 'fallback';
    },
    async previewSceneTransition({ scene, type, duration = 1e3, color = '#000000' }) {
        const previous = canvas.scene ?? null;
        if (!scene) return 'missing-scene';
        try {
            const result = await this.runSceneTransition({
                scene,
                type,
                duration,
                color,
                activate: false,
            });
            if (result === 'fallback' && scene.view) {
                await scene.view();
                await new Promise((resolve) => setTimeout(resolve, Math.max(0, duration)));
            }
            return result;
        } finally {
            if (previous?.id && canvas.scene?.id !== previous.id && previous.view) {
                await previous.view({
                    transition: {
                        type: null,
                    },
                });
            }
        }
    },
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
        if (typeof folder?.getSubfolders === 'function') {
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
