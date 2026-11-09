import { LumennAudioEngine, LumennInvalidAudioSourceError } from './audio-engine.mjs';
import { LumennTransitionController } from './transition-controller.mjs';
import { LumennGraphStore } from './graph-store.mjs';
import { LumennSettings } from './settings.mjs';
import { LumennCompat, SOCKET_NAME } from './foundry-compat.mjs';
import { LumennGraphApp, lumennClientSceneFade } from './storyboard-app.mjs';
import { registerHandlebarsHelpers } from './handlebars-helpers.mjs';
import { registerLumennTransitions } from './custom-transitions.mjs';
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
        LumennGraphStore.migrate().then(({ migrated }) => {
            if (migrated) ui.notifications.info(game.i18n.localize('LUMENN_FRAME.Migrated'));
        });
    }
    LumennCompat.socketOn((payload) => {
        if (!payload?.type) return;
        if (LumennCompat.isGM()) return;
        if (payload.type === 'transition:start') {
            const scope = payload.scope ?? 'both';
            if ((scope === 'scene' || scope === 'both') && LumennSettings.get('playerSceneFade')) {
                lumennClientSceneFade(payload.sceneId ?? null, payload.sceneTrans ?? {});
            }
        }
    });
});
