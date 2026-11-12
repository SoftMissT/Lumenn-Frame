import test, { mock } from 'node:test';
import assert from 'node:assert/strict';
import { LumennAudioEngine } from '../scripts/audio-engine.mjs';
function library(playlistSpecs) {
    const byUuid = new Map();
    const playlists = new Map();
    for (const [id, name, sounds] of playlistSpecs) {
        const playlist = {
            documentName: 'Playlist',
            id,
            uuid: `Playlist.${id}`,
            name,
            playing: false,
            sounds: {
                contents: [],
                find(fn) {
                    return this.contents.find(fn);
                },
                filter(fn) {
                    return this.contents.filter(fn);
                },
            },
            async update(patch) {
                Object.assign(this, patch);
            },
            async updateEmbeddedDocuments(_type, updates) {
                for (const patch of updates) {
                    const sound = this.sounds.contents.find((entry) => entry.id === patch._id);
                    if (sound) Object.assign(sound, patch);
                }
            },
            async playSound(sound) {
                this.playing = true;
                sound.playing = true;
            },
            async stopAll() {
                this.playing = false;
                for (const sound of this.sounds.contents) sound.playing = false;
            },
        };
        for (const [soundId, soundName, playing = false, repeat = true] of sounds) {
            const sound = {
                documentName: 'PlaylistSound',
                id: soundId,
                uuid: `Playlist.${id}.PlaylistSound.${soundId}`,
                name: soundName,
                playing,
                repeat,
                fade: 0,
                parent: playlist,
                async update(patch) {
                    Object.assign(this, patch);
                },
            };
            playlist.sounds.contents.push(sound);
            byUuid.set(sound.uuid, sound);
        }
        playlists.set(id, playlist);
    }
    return { playlists, byUuid };
}
const music = (sound, loop = true) => ({ type: 'track', id: sound.uuid, role: 'music', loop });
const sfx = (sound, loop = false) => ({ type: 'track', id: sound.uuid, role: 'sfx', loop });
function setup(specs) {
    const lib = library(specs);
    const saved = { game: globalThis.game, fromUuidSync: globalThis.fromUuidSync };
    globalThis.game = { playlists: lib.playlists };
    globalThis.fromUuidSync = (uuid) => lib.byUuid.get(uuid) ?? null;
    return {
        ...lib,
        restore() {
            globalThis.game = saved.game;
            globalThis.fromUuidSync = saved.fromUuidSync;
        },
    };
}
test('música e SFX em playlists separadas tocam juntos e trocar música não corta o SFX', async () => {
    const env = setup([
        [
            'music',
            'Trilha',
            [
                ['a', 'Tema A'],
                ['b', 'Tema B'],
            ],
        ],
        ['sfx', 'Efeitos', [['boom', 'Porta']]],
    ]);
    mock.timers.enable({ apis: ['setTimeout'] });
    try {
        const themeA = env.byUuid.get('Playlist.music.PlaylistSound.a');
        const themeB = env.byUuid.get('Playlist.music.PlaylistSound.b');
        const boom = env.byUuid.get('Playlist.sfx.PlaylistSound.boom');
        const engine = new LumennAudioEngine();
        assert.equal(
            await engine.applyMode('crossfade', [], [music(themeA), sfx(boom)], 100),
            'crossfaded'
        );
        assert.equal(themeA.playing, true);
        assert.equal(boom.playing, true, 'SFX entra junto com a música');
        assert.equal(boom.repeat, false, 'loop:false vira repeat:false');
        assert.equal(
            await engine.applyMode('crossfade', [music(themeA)], [music(themeB), sfx(boom)], 100),
            'crossfaded'
        );
        assert.equal(themeA.playing, false, 'a música antiga sai');
        assert.equal(themeB.playing, true, 'a música nova entra');
        assert.equal(boom.playing, true, 'o SFX continua tocando');
    } finally {
        mock.timers.reset();
        env.restore();
    }
});
test('SFX de uma vez restaura o repeat do documento ao parar', async () => {
    const env = setup([['sfx', 'Efeitos', [['boom', 'Porta', false, true]]]]);
    mock.timers.enable({ apis: ['setTimeout'] });
    try {
        const boom = env.byUuid.get('Playlist.sfx.PlaylistSound.boom');
        const engine = new LumennAudioEngine();
        await engine.applyMode('cut', [], [sfx(boom)], 0);
        assert.equal(boom.repeat, false);
        await engine.applyMode('fadeout', [sfx(boom)], [], 0);
        assert.equal(boom.playing, false);
        assert.equal(boom.repeat, true, 'valor do usuário volta depois do uso');
    } finally {
        mock.timers.reset();
        env.restore();
    }
});
test('parar uma Playlist para só os sons que o módulo iniciou', async () => {
    const env = setup([
        [
            'sfx',
            'Efeitos',
            [
                ['mine', 'Porta'],
                ['foreign', 'Ambiente', true],
            ],
        ],
    ]);
    mock.timers.enable({ apis: ['setTimeout'] });
    try {
        const playlist = env.playlists.get('sfx');
        const mine = env.byUuid.get('Playlist.sfx.PlaylistSound.mine');
        const foreign = env.byUuid.get('Playlist.sfx.PlaylistSound.foreign');
        const engine = new LumennAudioEngine();
        let stopAllCalls = 0;
        playlist.stopAll = async () => {
            stopAllCalls += 1;
        };
        await engine.applyMode('cut', [], [{ type: 'playlist', id: 'sfx', role: 'sfx' }], 0);
        assert.equal(mine.playing, true);
        await engine.applyMode('fadeout', [{ type: 'playlist', id: 'sfx', role: 'sfx' }], [], 0);
        assert.equal(mine.playing, false, 'o som do módulo para');
        assert.equal(foreign.playing, true, 'som de fora do módulo continua');
        assert.equal(stopAllCalls, 0, 'nunca chama stopAll');
        assert.equal(playlist.playing, false);
    } finally {
        mock.timers.reset();
        env.restore();
    }
});
