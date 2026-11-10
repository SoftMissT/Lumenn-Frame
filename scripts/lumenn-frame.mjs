import { LumennAudioEngine, LumennInvalidAudioSourceError } from './audio-engine.mjs';
import { LumennTransitionController } from './transition-controller.mjs';
import { LumennGraphStore } from './graph-store.mjs';
import { LumennSettings } from './settings.mjs';
import { LumennCompat, SOCKET_NAME } from './foundry-compat.mjs';
import { LumennGraphApp, lumennClientSceneFade } from './storyboard-app.mjs';
import { registerHandlebarsHelpers } from './handlebars-helpers.mjs';
import { registerLumennTransitions } from './custom-transitions.mjs';
import { filmIn, filmNotifyReady, filmOut, filmPrepare } from './film-transitions.mjs';
const MODULE_ID = 'lumenn-frame';
Hooks.once('init', () => {
    registerLumennTransitions();
    registerHandlebarsHelpers();
    LumennSettings.register();
    LumennGraphStore.registerSettings();
    game.modules.get(MODULE_ID).api = {
        openStoryboard() {
            new LumennGraphApp().render({
                force: true,
            });
        },
        LumennAudioEngine,
        LumennInvalidAudioSourceError,
        LumennTransitionController,
        LumennGraphStore,
        LumennGraphApp,
    };
    Hooks.on('getSceneControlButtons', (controls) => {
        const tokenControl = Array.isArray(controls)
            ? controls.find((c) => c.name === 'token')
            : (controls.tokens ?? controls.token);
        if (!tokenControl) return;
        const open = () => game.modules.get(MODULE_ID).api.openStoryboard();
        const tool = {
            name: 'lumenn-frame',
            title: 'Lumenn Frame',
            icon: 'fas fa-film',
            button: true,
            visible: !!game.user?.isGM,
            onChange: open,
            onClick: open,
        };
        if (Array.isArray(tokenControl.tools)) tokenControl.tools.push(tool);
        else
            tokenControl.tools = {
                ...(tokenControl.tools ?? {}),
                'lumenn-frame': tool,
            };
    });
});
Hooks.once('ready', () => {
    if (game.user?.isGM) {
        LumennGraphStore.migrate().then((result) => {
            if (result?.migrated) ui.notifications.info(game.i18n.localize('LUMENN_FRAME.Migrated'));
            else if (result?.blocked) ui.notifications.warn(game.i18n.localize('LUMENN_FRAME.WarnMigrationBlocked'));
            else if (result?.unreadable) ui.notifications.warn(game.i18n.localize('LUMENN_FRAME.WarnMigrationUnreadable'));
        });
    }
    LumennCompat.socketOn((payload) => {
        if (!payload?.type) return;
        if (LumennCompat.isGM()) {
            if (payload.type === 'film-ready') filmNotifyReady(payload);
            return;
        }
        // Stinger de vídeo: carrega antes e avisa o mestre que está pronto.
        if (payload.type === 'film-prepare') {
            filmPrepare(payload).then((ok) =>
                LumennCompat.socketEmit({ type: 'film-ready', src: payload.src, userId: game.user.id, ok })
            );
            return;
        }
        // Transição de cinema: só jogadores (o GM já saiu acima).
        if (payload.type === 'film') {
            if (payload.phase === 'in') filmIn(payload);
            else filmOut(payload);
            return;
        }
        if (payload.type === 'transition:start') {
            const scope = payload.scope ?? 'both';
            if ((scope === 'scene' || scope === 'both') && LumennSettings.get('playerSceneFade')) {
                lumennClientSceneFade(payload.sceneId ?? null, payload.sceneTrans ?? {});
            }
        }
    });
});
