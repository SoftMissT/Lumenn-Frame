import { LumennAudioEngine, LumennInvalidAudioSourceError } from './audio-engine.mjs';
import { LumennTransitionController } from './transition-controller.mjs';
import { LumennGraphStore } from './graph-store.mjs';
import { LumennSettings } from './settings.mjs';
import { LumennCompat, SOCKET_NAME } from './foundry-compat.mjs';
import { LumennGraphApp, lumennClientSceneFade } from './storyboard-app.mjs';
import { registerHandlebarsHelpers } from './handlebars-helpers.mjs';
import { registerLumennTransitions } from './custom-transitions.mjs';
import { registerLumennFonts } from './fonts.mjs';
import { presetById, TRANSITION_PRESETS } from './transition-presets.mjs';
import { filmIn, filmNotifyReady, filmOut, filmPrepare } from './film-transitions.mjs';
import { handleVisitMessage, LumennVisits, openVisitPicker, registerVisits } from './visit-ui.mjs';
const MODULE_ID = 'lumenn-frame';
Hooks.once('init', () => {
    registerLumennTransitions();
    registerLumennFonts();
    registerHandlebarsHelpers();
    LumennSettings.register();
    LumennGraphStore.registerSettings();
    game.modules.get(MODULE_ID).api = {
        openStoryboard() {
            new LumennGraphApp().render({
                force: true,
            });
        },
        /** Usada pelas macros do compêndio "Lumenn Frame: Transições". */
        async applyTransition(presetId) {
            const preset = presetById(presetId);
            if (!preset) return false;
            const app = [...(foundry.applications.instances?.values() ?? [])].find(
                (a) => a instanceof LumennGraphApp && a.rendered
            );
            if (!app) {
                ui.notifications.warn(game.i18n.localize('LUMENN_FRAME.Preset.OpenEditor'));
                return false;
            }
            return app.applyTransitionPreset(preset);
        },
        transitionPresets: TRANSITION_PRESETS,
        LumennAudioEngine,
        LumennInvalidAudioSourceError,
        LumennTransitionController,
        LumennGraphStore,
        LumennGraphApp,
        visits: LumennVisits,
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
        // Jogador: pedir uma visita a uma cena que o GM liberou (não abre o editor).
        const visitTool = {
            name: 'lumenn-visit',
            title: game.i18n.localize('LUMENN_FRAME.Visit.ToolTitle'),
            icon: 'fas fa-door-open',
            button: true,
            visible: !game.user?.isGM,
            onChange: openVisitPicker,
            onClick: openVisitPicker,
        };
        if (Array.isArray(tokenControl.tools)) tokenControl.tools.push(tool, visitTool);
        else
            tokenControl.tools = {
                ...(tokenControl.tools ?? {}),
                'lumenn-frame': tool,
                'lumenn-visit': visitTool,
            };
    });
});
Hooks.once('ready', () => {
    if (game.user?.isGM) {
        LumennGraphStore.migrate().then((result) => {
            if (result?.migrated)
                ui.notifications.info(game.i18n.localize('LUMENN_FRAME.Migrated'));
            else if (result?.blocked)
                ui.notifications.warn(game.i18n.localize('LUMENN_FRAME.WarnMigrationBlocked'));
            else if (result?.unreadable)
                ui.notifications.warn(game.i18n.localize('LUMENN_FRAME.WarnMigrationUnreadable'));
        });
    }
    // O core entrega (payload, senderUserId): a autoria vem do servidor, não do payload.
    registerVisits();
    LumennCompat.socketOn((payload, senderId) => {
        if (!payload?.type) return;
        // Pedidos de visita valem para os dois lados; cada função valida o remetente.
        if (String(payload.type).startsWith('visit:')) return void handleVisitMessage(payload, senderId);
        if (LumennCompat.isGM()) {
            // Só o próprio jogador pode se declarar pronto.
            if (payload.type === 'film-ready' && payload.userId === senderId) filmNotifyReady(payload);
            return;
        }
        // Cinema e transições só obedecem a um GM.
        if (!game.users.get(senderId)?.isGM) return;
        // Stinger de vídeo: carrega antes e avisa o mestre que está pronto.
        if (payload.type === 'film-prepare') {
            filmPrepare(payload).then((ok) =>
                LumennCompat.socketEmit({
                    type: 'film-ready',
                    src: payload.src,
                    userId: game.user.id,
                    ok,
                })
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
