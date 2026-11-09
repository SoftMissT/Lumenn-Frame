import { LumennAudioEngine, LumennInvalidAudioSourceError } from './audio-engine.mjs';
export class LumennTransitionController {
    #engine = new LumennAudioEngine();
    get engine() {
        return this.#engine;
    }
    async goToAudio(
        currentSources,
        targetSources,
        audioTrans,
        defaultFade = 3e3,
        defaultCurve = 'linear'
    ) {
        const mode = audioTrans?.mode ?? 'auto';
        const duration = audioTrans?.crossfadeDuration ?? defaultFade;
        const curve = audioTrans?.curve ?? defaultCurve;
        try {
            return await this.#engine.applyMode(
                mode,
                currentSources,
                targetSources,
                duration,
                curve
            );
        } catch (err) {
            if (err instanceof LumennInvalidAudioSourceError) return 'invalid-source';
            console.error('lumenn-frame: falha na transição de áudio', err);
            return 'error';
        }
    }
}
