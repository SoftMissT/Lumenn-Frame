const MODULE_ID = "lumenn-frame";

/**
 * LumennSettings — registro central e acesso a configurações do módulo.
 *
 * REGRA: Settings = DEFAULTS para NOVOS nodes/edges. A FLOW edge é a
 * configuração REAL da transição; alterar um setting global NUNCA sobrescreve
 * edges já configuradas.
 *
 * Nada de `game.settings.get()` espalhado pelo app — use estes getters.
 */
export class LumennSettings {
  static register() {
    const L = (k) => game.i18n.localize(k);

    /* ── Transitions ── */
    game.settings.register(MODULE_ID, "defaultSceneTransitionType", {
      name: L("LUMENN_FRAME.Settings.SceneTransitionType.Name"),
      hint: L("LUMENN_FRAME.Settings.SceneTransitionType.Hint"),
      scope: "world", config: true, type: String,
      choices: { cut: L("LUMENN_FRAME.Edge.Cut"), fade: L("LUMENN_FRAME.Edge.Fade") },
      default: "fade",
    });
    game.settings.register(MODULE_ID, "defaultSceneFadeDuration", {
      name: L("LUMENN_FRAME.Settings.SceneFadeDuration.Name"),
      hint: L("LUMENN_FRAME.Settings.SceneFadeDuration.Hint"),
      scope: "world", config: true, type: Number,
      range: { min: 100, max: 10000, step: 100 }, default: 1000,
    });
    game.settings.register(MODULE_ID, "defaultAudioMode", {
      name: L("LUMENN_FRAME.Settings.AudioMode.Name"),
      hint: L("LUMENN_FRAME.Settings.AudioMode.Hint"),
      scope: "world", config: true, type: String,
      choices: {
        auto: L("LUMENN_FRAME.Edge.Auto"),
        keep: L("LUMENN_FRAME.Edge.Keep"),
        crossfade: L("LUMENN_FRAME.Edge.Crossfade"),
        fadeout: L("LUMENN_FRAME.Edge.FadeOut"),
      },
      default: "auto",
    });
    game.settings.register(MODULE_ID, "defaultCrossfadeDuration", {
      name: L("LUMENN_FRAME.Settings.CrossfadeDuration.Name"),
      hint: L("LUMENN_FRAME.Settings.CrossfadeDuration.Hint"),
      scope: "world", config: true, type: Number,
      range: { min: 500, max: 10000, step: 250 }, default: 3000,
    });
    game.settings.register(MODULE_ID, "defaultAudioFadeIn", {
      name: L("LUMENN_FRAME.Settings.AudioFadeIn.Name"),
      hint: L("LUMENN_FRAME.Settings.AudioFadeIn.Hint"),
      scope: "world", config: true, type: Number,
      range: { min: 0, max: 10000, step: 100 }, default: 1000,
    });
    game.settings.register(MODULE_ID, "defaultAudioFadeOut", {
      name: L("LUMENN_FRAME.Settings.AudioFadeOut.Name"),
      hint: L("LUMENN_FRAME.Settings.AudioFadeOut.Hint"),
      scope: "world", config: true, type: Number,
      range: { min: 0, max: 10000, step: 100 }, default: 1000,
    });

    /* ── Graph Editor ── */
    game.settings.register(MODULE_ID, "defaultSceneNodeSize", {
      name: L("LUMENN_FRAME.Settings.SceneNodeSize.Name"),
      scope: "world", config: true, type: String,
      choices: { compact: "compact", normal: "normal", large: "large" }, default: "normal",
    });
    game.settings.register(MODULE_ID, "defaultAudioNodeSize", {
      name: L("LUMENN_FRAME.Settings.AudioNodeSize.Name"),
      scope: "world", config: true, type: String,
      choices: { compact: "compact", normal: "normal", large: "large" }, default: "normal",
    });
    game.settings.register(MODULE_ID, "defaultNoteNodeSize", {
      name: L("LUMENN_FRAME.Settings.NoteNodeSize.Name"),
      scope: "world", config: true, type: String,
      choices: { compact: "compact", normal: "normal", large: "large" }, default: "normal",
    });
    game.settings.register(MODULE_ID, "defaultSceneColor", {
      name: L("LUMENN_FRAME.Settings.SceneColor.Name"),
      scope: "world", config: true, type: String, default: "#f0a321",
    });
    game.settings.register(MODULE_ID, "defaultAudioColor", {
      name: L("LUMENN_FRAME.Settings.AudioColor.Name"),
      scope: "world", config: true, type: String, default: "#2dd4bf",
    });
    game.settings.register(MODULE_ID, "defaultNoteColor", {
      name: L("LUMENN_FRAME.Settings.NoteColor.Name"),
      scope: "world", config: true, type: String, default: "#73707c",
    });
    game.settings.register(MODULE_ID, "initialZoom", {
      name: L("LUMENN_FRAME.Settings.InitialZoom.Name"),
      scope: "world", config: true, type: Number,
      range: { min: 25, max: 200, step: 5 }, default: 100,
    });
    game.settings.register(MODULE_ID, "zoomSpeed", {
      name: L("LUMENN_FRAME.Settings.ZoomSpeed.Name"),
      scope: "world", config: true, type: Number,
      range: { min: 5, max: 30, step: 1 }, default: 10,
    });
    game.settings.register(MODULE_ID, "openInWorkspace", {
      name: L("LUMENN_FRAME.Settings.OpenInWorkspace.Name"),
      scope: "world", config: true, type: Boolean, default: false,
    });

    /* ── Live Mode ── */
    game.settings.register(MODULE_ID, "dimUnreachable", {
      name: L("LUMENN_FRAME.Settings.DimUnreachable.Name"),
      scope: "world", config: true, type: Boolean, default: true,
    });
    game.settings.register(MODULE_ID, "showTransitionLabels", {
      name: L("LUMENN_FRAME.Settings.ShowTransitionLabels.Name"),
      scope: "world", config: true, type: Boolean, default: true,
    });
    game.settings.register(MODULE_ID, "confirmSceneTransition", {
      name: L("LUMENN_FRAME.Settings.ConfirmTransition.Name"),
      scope: "world", config: true, type: Boolean, default: false,
    });
    game.settings.register(MODULE_ID, "playerSceneFade", {
      name: L("LUMENN_FRAME.Settings.PlayerSceneFade.Name"),
      scope: "world", config: true, type: Boolean, default: true,
    });
    game.settings.register(MODULE_ID, "playerAudioSync", {
      name: L("LUMENN_FRAME.Settings.PlayerAudioSync.Name"),
      scope: "world", config: true, type: Boolean, default: true,
    });
  }

  static get(key) {
    return game.settings.get(MODULE_ID, key);
  }

  static getTransitionDefaults() {
    return {
      sceneType: this.get("defaultSceneTransitionType"),
      sceneDuration: this.get("defaultSceneFadeDuration"),
      audioMode: this.get("defaultAudioMode"),
      crossfade: this.get("defaultCrossfadeDuration"),
      fadeIn: this.get("defaultAudioFadeIn"),
      fadeOut: this.get("defaultAudioFadeOut"),
    };
  }

  static getNodeDefaults(type) {
    const cap = type.charAt(0).toUpperCase() + type.slice(1);
    return {
      color: this.get(`default${cap}Color`),
      size: this.get(`default${cap}NodeSize`),
    };
  }

  static getCameraDefaults() {
    return { zoom: this.get("initialZoom") / 100, speed: this.get("zoomSpeed") };
  }

  static getLiveDefaults() {
    return {
      dim: this.get("dimUnreachable"),
      labels: this.get("showTransitionLabels"),
      confirm: this.get("confirmSceneTransition"),
      playerFade: this.get("playerSceneFade"),
      playerAudio: this.get("playerAudioSync"),
    };
  }
}