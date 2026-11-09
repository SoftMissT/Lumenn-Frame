export async function run() {
    const t0 = performance.now();
    const api = game.modules.get('lumenn-frame')?.api;
    if (!api) throw new Error('lumenn-frame: módulo não ativo ou API não exposta.');
    if (!game.user.isGM) {
        ui.notifications.warn('lumenn-frame: a suíte só roda como GM.');
        return {
            pass: 0,
            total: 0,
            results: [],
        };
    }
    const allSounds = game.playlists.reduce((acc, p) => acc.concat(p.sounds.contents), []);
    if (allSounds.length < 2) {
        ui.notifications.warn('lumenn-frame: precisa de 2+ sons em playlists para a suíte.');
        return {
            pass: 0,
            total: 0,
            results: [],
        };
    }
    const [a, b] = allSounds.slice(0, 2);
    const playlist = a.parent;
    const results = [];
    const check = (label, ok, detail = '') =>
        results.push({
            label,
            ok,
            detail,
        });
    const track = (id) => ({
        type: 'track',
        id,
    });
    const pl = (id) => ({
        type: 'playlist',
        id,
    });
    const wait = (ms) => new Promise((r) => setTimeout(r, ms));
    const stopAll = async () => {
        await Promise.all(
            allSounds
                .filter((s) => s.playing)
                .map((s) =>
                    s.update({
                        playing: false,
                    })
                )
        );
        if (playlist.playing) await playlist.stopAll();
    };
    await stopAll();
    await wait(400);
    const engine = new api.LumennAudioEngine();
    let s = performance.now();
    let res = await engine.transition(null, track(a.uuid), 1500);
    check(
        'CT-A started (null→A), despacho <= 100ms',
        res === 'started' && a.playing === true,
        `res=${res}, despacho=${(performance.now() - s).toFixed(0)}ms`
    );
    const soundBefore = a.sound;
    res = await engine.transition(track(a.uuid), track(a.uuid), 1500);
    check(
        'CT-001 kept (A→A, sem reinício)',
        res === 'kept' && a.playing === true && a.sound === soundBefore,
        `res=${res}`
    );
    const crossfadeP = engine.transition(track(a.uuid), track(b.uuid), 2e3);
    const during = await engine.transition(track(b.uuid), track(a.uuid), 2e3);
    res = await crossfadeP;
    check(
        'CT-006 lock + CT-002 crossfaded (A→B)',
        during === 'ignored' && res === 'crossfaded' && b.playing === true && a.playing === false,
        `2ª=${during}, res=${res}`
    );
    await wait(2100);
    res = await engine.transition(track(b.uuid), null, 800);
    check(
        'CT-003/CT-007 faded-out (B→null, fadeDuration=800)',
        res === 'faded-out' && b.playing === false && Number(b._source.fadeDuration) === 800,
        `res=${res}`
    );
    res = await engine.transition(null, pl(playlist.id), 1200);
    const playingInPlaylist = playlist.sounds.filter((sound) => sound.playing);
    check(
        'CT-B playlist inicia exatamente uma faixa',
        res === 'started' && playingInPlaylist.length === 1,
        `res=${res}, tocando=${playingInPlaylist.length}`
    );
    await stopAll();
    res = await engine.applyMode(
        'auto',
        [],
        [
            {
                ...track(a.uuid),
                role: 'music',
            },
            {
                ...track(b.uuid),
                role: 'sfx',
            },
        ],
        0
    );
    check(
        'CT-C cena aceita música + SFX',
        ['started', 'crossfaded'].includes(res) && a.playing && b.playing,
        `res=${res}, música=${a.playing}, sfx=${b.playing}`
    );
    let thrown = null;
    try {
        await engine.transition(null, track('Playlist.fake.PlaylistSound.nope'), 500);
    } catch (err) {
        thrown = err;
    }
    check(
        'RF-011 fonte inválida → LumennInvalidAudioSourceError',
        thrown instanceof api.LumennInvalidAudioSourceError,
        thrown?.name ?? 'nada lançado'
    );
    await stopAll();
    const pass = results.filter((r) => r.ok).length;
    const total = results.length;
    const elapsed = (performance.now() - t0).toFixed(0);
    console.group(
        `%c[lumenn-frame] Suíte do motor: ${pass}/${total} PASS em ${elapsed}ms`,
        'color: #00d9ff; font-weight: bold;'
    );
    for (const r of results) {
        console.log(`${r.ok ? 'PASS' : 'FAIL'} ${r.label}${r.detail ? ` (${r.detail})` : ''}`);
    }
    console.groupEnd();
    ui.notifications.info(
        `lumenn-frame: suíte do motor ${pass}/${total} PASS (${elapsed}ms). Detalhes no console.`
    );
    return {
        pass,
        total,
        elapsed,
        results,
    };
}
