export const FILM_PREFIX = 'film:';
export const FILM_EFFECTS = Object.freeze([
    {
        id: 'cutscene',
        label: 'LUMENN_FRAME.Film.Cutscene',
        duration: 2600,
    },
    {
        id: 'video',
        label: 'LUMENN_FRAME.Film.Video',
        duration: 2e3,
    },
    {
        id: 'iris',
        label: 'LUMENN_FRAME.Film.Iris',
        duration: 1600,
    },
    {
        id: 'wipe',
        label: 'LUMENN_FRAME.Film.Wipe',
        duration: 1400,
    },
    {
        id: 'curtain',
        label: 'LUMENN_FRAME.Film.Curtain',
        duration: 1800,
    },
    {
        id: 'blinds',
        label: 'LUMENN_FRAME.Film.Blinds',
        duration: 1400,
    },
    {
        id: 'flash',
        label: 'LUMENN_FRAME.Film.Flash',
        duration: 900,
    },
    {
        id: 'dream',
        label: 'LUMENN_FRAME.Film.Dream',
        duration: 2e3,
    },
    {
        id: 'burn',
        label: 'LUMENN_FRAME.Film.Burn',
        duration: 1800,
    },
    {
        id: 'battle',
        label: 'LUMENN_FRAME.Film.Battle',
        duration: 1600,
    },
]);
/**
 * Stingers prontos (WebM VP9 com alfa, gerados por `tools/stingers/render.mjs`). Todos cobrem
 * a tela 100% na metade do vídeo, que é o corte padrão quando `cutAt` fica vazio.
 */
export const STINGER_DIR = 'modules/lumenn-frame/assets/stingers';
export const STINGERS = Object.freeze([
    { id: 'ink', icon: 'fa-droplet', label: 'LUMENN_FRAME.Stinger.Ink' },
    { id: 'burn', icon: 'fa-fire', label: 'LUMENN_FRAME.Stinger.Burn' },
    { id: 'leak', icon: 'fa-sun', label: 'LUMENN_FRAME.Stinger.Leak' },
    { id: 'slash', icon: 'fa-khanda', label: 'LUMENN_FRAME.Stinger.Slash' },
    { id: 'glitch', icon: 'fa-tv', label: 'LUMENN_FRAME.Stinger.Glitch' },
    { id: 'hyper', icon: 'fa-meteor', label: 'LUMENN_FRAME.Stinger.Hyper' },
]);
export const stingerSrc = (id) => `${STINGER_DIR}/${id}.webm`;
/** Stinger sem arquivo escolhido toca a Tinta em vez de uma tela vazia. */
export const DEFAULT_STINGER = stingerSrc('ink');
const IDS = new Set(FILM_EFFECTS.map((effect) => effect.id));
const OVERLAY_ID = 'lumenn-film';
const BLINDS = 8;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
export function filmEffectOf(type) {
    if (typeof type !== 'string' || !type.startsWith(FILM_PREFIX)) return null;
    const id = type.slice(FILM_PREFIX.length);
    return IDS.has(id) ? id : null;
}

function totalOf(duration, effect) {
    const fallback = FILM_EFFECTS.find((item) => item.id === effect)?.duration ?? 1600;
    return Number(duration) > 0 ? Number(duration) : fallback;
}
export function filmHalf(duration, effect) {
    return Math.max(200, Math.round(totalOf(duration, effect) / 2));
}
export function filmCutPoint(effect, duration, cutAt) {
    if (effect !== 'video') return filmHalf(duration, effect);
    const total = totalOf(duration, effect);
    const cut = cutAt === null || cutAt === '' ? NaN : Number(cutAt);
    return Number.isFinite(cut) && cut >= 0 ? Math.min(cut, total) : Math.round(total / 2);
}
const SAFE_FONT = /^[\p{L}\p{N} _-]{1,48}$/u;
const SAFE_COLOR = /^#[0-9a-f]{6}$/i;
/**
 * Título do filme. O configurado na transição (`scene.title`) vence o automático
 * (nome do destino). Fonte, cor e tamanho só passam se forem valores seguros para CSS.
 * @returns {{caption: string, subtitle: string, titleFont: string, titleColor: string, titleSize: number}}
 */
export function filmTitle(sceneTrans, { caption = '', subtitle = '' } = {}) {
    const title = sceneTrans?.title ?? {};
    const text = String(title.text ?? '').trim();
    const sub = String(title.subtitle ?? '').trim();
    const font = String(title.font ?? '').trim();
    const size = Number(title.size);
    return {
        caption: text || String(caption ?? ''),
        subtitle: text ? sub : sub || String(subtitle ?? ''),
        titleFont: SAFE_FONT.test(font) ? font : '',
        titleColor: SAFE_COLOR.test(String(title.color ?? '')) ? title.color : '',
        titleSize: Number.isFinite(size) && size > 0 ? Math.min(200, Math.max(16, Math.round(size))) : 0,
    };
}
const preloaded = new Map();
const waiters = new Map();
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
        setTimeout(() => done(video.readyState >= 3), 4e3);
    });
    video.src = src;
    video.load();
    preloaded.set(src, {
        video,
        ready,
    });
    return ready;
}
export function waitPlayersReady(src, userIds, timeout = 3e3) {
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
export function filmNotifyReady({ src, userId } = {}) {
    waiters.get(src)?.(userId);
}

function overlay() {
    let el = document.getElementById(OVERLAY_ID);
    if (el) return el;
    el = document.createElement('div');
    el.id = OVERLAY_ID;
    el.setAttribute('aria-hidden', 'true');
    const strips = Array.from(
        {
            length: BLINDS,
        },
        (_, i) => `<i style="--i:${i}"></i>`
    ).join('');
    el.innerHTML = `<div class="lff-veil"></div><div class="lff-panel lff-left"></div><div class="lff-panel lff-right"></div><div class="lff-blinds">${strips}</div><div class="lff-stage"></div><div class="lff-swirl"></div><div class="lff-bar lff-top"></div><div class="lff-bar lff-bottom"></div><div class="lff-grain"></div><div class="lff-caption"><strong></strong><span></span></div>`;
    document.body.appendChild(el);
    return el;
}
async function playVideo(el, { src, sound = false, volume = 0.8 }) {
    const stage = el.querySelector('.lff-stage');
    stage.replaceChildren();
    await filmPrepare({
        src,
    });
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
    titleFont = '',
    titleColor = '',
    titleSize = 0,
} = {}) {
    if (!IDS.has(effect)) return 0;
    const el = overlay();
    // Título configurável: valores já validados por filmTitle; vazio volta ao padrão do CSS.
    const captionEl = el.querySelector('.lff-caption');
    captionEl.style.setProperty('--lff-title-font', SAFE_FONT.test(titleFont) ? `'${titleFont}'` : '');
    captionEl.style.setProperty('--lff-title-color', SAFE_COLOR.test(titleColor) ? titleColor : '');
    captionEl.style.setProperty('--lff-title-size', Number(titleSize) > 0 ? `${Number(titleSize)}px` : '');
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
        const video = await playVideo(el, {
            src: src || DEFAULT_STINGER,
            sound,
            volume,
        });
        if (video && Number.isFinite(video.duration) && video.duration > 0)
            el.dataset.total = String(Math.round(video.duration * 1e3));
        const cut = filmCutPoint('video', Number(el.dataset.total), cutAt);
        await sleep(Math.max(0, cut - (performance.now() - Number(el.dataset.start))));
        return cut;
    }
    await sleep(half);
    return half;
}
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
export async function filmPreview(options) {
    await filmIn(options);
    await sleep(350);
    await filmOut(options);
}
