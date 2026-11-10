/**
 * Transições de cinema do Lumenn Frame. Rodam só na tela dos jogadores (por socket);
 * a tela do mestre continua livre. A troca de cena acontece no ponto de corte, com a tela coberta.
 * Valor gravado na aresta: `film:<efeito>` (ex.: `film:iris`). O efeito `video` toca um stinger
 * `.webm` (de preferência com transparência) e troca a cena no `cutAt` informado.
 */
export const FILM_PREFIX = 'film:';
export const FILM_EFFECTS = Object.freeze([
    { id: 'cutscene', label: 'LUMENN_FRAME.Film.Cutscene', duration: 2600 },
    { id: 'video', label: 'LUMENN_FRAME.Film.Video', duration: 2000 },
    { id: 'iris', label: 'LUMENN_FRAME.Film.Iris', duration: 1600 },
    { id: 'wipe', label: 'LUMENN_FRAME.Film.Wipe', duration: 1400 },
    { id: 'curtain', label: 'LUMENN_FRAME.Film.Curtain', duration: 1800 },
    { id: 'blinds', label: 'LUMENN_FRAME.Film.Blinds', duration: 1400 },
    { id: 'flash', label: 'LUMENN_FRAME.Film.Flash', duration: 900 },
    { id: 'dream', label: 'LUMENN_FRAME.Film.Dream', duration: 2000 },
    { id: 'burn', label: 'LUMENN_FRAME.Film.Burn', duration: 1800 },
]);
const IDS = new Set(FILM_EFFECTS.map((effect) => effect.id));
const OVERLAY_ID = 'lumenn-film';
const BLINDS = 8;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** `film:iris` → `iris`; qualquer outro tipo → null (fica com o Foundry). */
export function filmEffectOf(type) {
    if (typeof type !== 'string' || !type.startsWith(FILM_PREFIX)) return null;
    const id = type.slice(FILM_PREFIX.length);
    return IDS.has(id) ? id : null;
}
function totalOf(duration, effect) {
    const fallback = FILM_EFFECTS.find((item) => item.id === effect)?.duration ?? 1600;
    return Number(duration) > 0 ? Number(duration) : fallback;
}
/** Metade da duração para cobrir a tela; a outra metade para revelar a cena nova. */
export function filmHalf(duration, effect) {
    return Math.max(200, Math.round(totalOf(duration, effect) / 2));
}
/**
 * Momento (ms) em que a cena troca. Vídeo: o ponto de corte informado, limitado à duração;
 * sem ponto de corte, o meio do vídeo. Demais efeitos: metade da duração.
 */
export function filmCutPoint(effect, duration, cutAt) {
    if (effect !== 'video') return filmHalf(duration, effect);
    const total = totalOf(duration, effect);
    const cut = cutAt === null || cutAt === '' ? NaN : Number(cutAt);
    return Number.isFinite(cut) && cut >= 0 ? Math.min(cut, total) : Math.round(total / 2);
}

/* -- Stinger de vídeo: pré-carga e confirmação dos jogadores ------------------- */

const preloaded = new Map();
const waiters = new Map();

/** Jogador: carrega o vídeo antes da transição. Resolve com true quando dá para tocar. */
export function filmPrepare({ src } = {}) {
    if (!src) return Promise.resolve(false);
    if (preloaded.has(src)) return preloaded.get(src).ready;
    const video = document.createElement('video');
    video.preload = 'auto';
    video.playsInline = true;
    video.muted = true;
    const ready = new Promise((resolve) => {
        const done = (ok) => {
            video.oncanplaythrough = null;
            video.onerror = null;
            resolve(ok);
        };
        video.oncanplaythrough = () => done(true);
        video.onerror = () => done(false);
        setTimeout(() => done(video.readyState >= 3), 4000);
    });
    video.src = src;
    video.load();
    preloaded.set(src, { video, ready });
    return ready;
}

/** Mestre: espera a confirmação de pré-carga de cada jogador (ou o tempo limite). */
export function waitPlayersReady(src, userIds, timeout = 3000) {
    const pending = new Set(userIds ?? []);
    if (!src || !pending.size) return Promise.resolve([]);
    return new Promise((resolve) => {
        const ready = [];
        const finish = () => {
            waiters.delete(src);
            resolve(ready);
        };
        waiters.set(src, (userId) => {
            if (!pending.delete(userId)) return;
            ready.push(userId);
            if (!pending.size) finish();
        });
        setTimeout(finish, timeout);
    });
}
/** Mestre: registra a confirmação vinda do socket. */
export function filmNotifyReady({ src, userId } = {}) {
    waiters.get(src)?.(userId);
}

/* -- Overlay ---------------------------------------------------------------- */

function overlay() {
    let el = document.getElementById(OVERLAY_ID);
    if (el) return el;
    el = document.createElement('div');
    el.id = OVERLAY_ID;
    el.setAttribute('aria-hidden', 'true');
    const strips = Array.from({ length: BLINDS }, (_, i) => `<i style="--i:${i}"></i>`).join('');
    el.innerHTML = `<div class="lff-veil"></div><div class="lff-panel lff-left"></div><div class="lff-panel lff-right"></div><div class="lff-blinds">${strips}</div><div class="lff-stage"></div><div class="lff-bar lff-top"></div><div class="lff-bar lff-bottom"></div><div class="lff-grain"></div><div class="lff-caption"><strong></strong><span></span></div>`;
    document.body.appendChild(el);
    return el;
}

async function playVideo(el, { src, sound = false, volume = 0.8 }) {
    const stage = el.querySelector('.lff-stage');
    stage.replaceChildren();
    await filmPrepare({ src });
    const video = preloaded.get(src)?.video;
    if (!video) return null;
    video.muted = !sound;
    video.volume = Math.max(0, Math.min(1, Number(volume) || 0.8));
    video.currentTime = 0;
    stage.appendChild(video);
    try {
        await video.play();
    } catch {
        video.muted = true;
        await video.play().catch(() => null);
    }
    return video;
}

/** Cobre a tela com o efeito; devolve quando chega o ponto de corte. */
export async function filmIn({
    effect,
    duration,
    cutAt,
    caption = '',
    subtitle = '',
    color = '#000000',
    src = '',
    sound = false,
    volume,
} = {}) {
    if (!IDS.has(effect)) return 0;
    const el = overlay();
    const half = filmHalf(duration, effect);
    el.className = `lff-effect-${effect}`;
    el.dataset.start = String(performance.now());
    el.dataset.total = String(totalOf(duration, effect));
    el.style.setProperty('--lff-ms', `${half}ms`);
    el.style.setProperty('--lff-color', color || '#000000');
    el.querySelector('.lff-caption strong').textContent = caption ?? '';
    el.querySelector('.lff-caption span').textContent = subtitle ?? '';
    el.classList.add('lff-active');
    void el.offsetWidth;
    el.classList.add('lff-in');
    if (effect === 'video') {
        const video = await playVideo(el, { src, sound, volume });
        if (video && Number.isFinite(video.duration) && video.duration > 0) el.dataset.total = String(Math.round(video.duration * 1000));
        const cut = filmCutPoint('video', Number(el.dataset.total), cutAt);
        await sleep(Math.max(0, cut - (performance.now() - Number(el.dataset.start))));
        return cut;
    }
    await sleep(half);
    return half;
}

/** Revela a cena nova; devolve quando o overlay sumiu. */
export async function filmOut({ effect, duration } = {}) {
    const el = document.getElementById(OVERLAY_ID);
    if (!el || !IDS.has(effect)) return;
    if (effect === 'video') {
        const elapsed = performance.now() - Number(el.dataset.start || 0);
        await sleep(Math.max(0, Number(el.dataset.total || 0) - elapsed));
        el.querySelector('.lff-stage video')?.pause();
        el.querySelector('.lff-stage')?.replaceChildren();
        el.className = '';
        return;
    }
    const half = filmHalf(duration, effect);
    el.style.setProperty('--lff-ms', `${half}ms`);
    el.classList.remove('lff-in');
    el.classList.add('lff-out');
    await sleep(half);
    el.className = '';
}

/** Prévia para o mestre: mostra o efeito inteiro na tela dele, sem trocar cena nem áudio. */
export async function filmPreview(options) {
    await filmIn(options);
    await sleep(350);
    await filmOut(options);
}
