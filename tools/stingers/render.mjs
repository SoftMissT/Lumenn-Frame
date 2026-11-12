#!/usr/bin/env node
// Renderiza os stingers do Lumenn Frame (WebM VP9 com alfa) desenhando cada quadro em RGBA
// e enviando ao FFmpeg. Uso: node tools/stingers/render.mjs [caminho-do-ffmpeg] [id...]
// No ponto de corte (metade do tempo) todo stinger cobre a tela 100% opaco: é ali que a
// cena troca por baixo sem o jogador ver.
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const W = 1280;
const H = 720;
const FPS = 30;
const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'assets', 'stingers');

const clamp = (x, a = 0, b = 1) => (x < a ? a : x > b ? b : x);
const ss = (e0, e1, x) => {
    const t = clamp((x - e0) / (e1 - e0));
    return t * t * (3 - 2 * t);
};
const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);
const mix = (a, b, t) => a + (b - a) * t;
const hex = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];

/** Gerador determinístico (mulberry32): o mesmo stinger sai igual a cada renderização. */
function rng(seed) {
    let a = seed >>> 0;
    return () => {
        a = (a + 0x6d2b79f5) >>> 0;
        let t = a;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

/** Ruído fractal (value noise, 5 oitavas) normalizado para 0..1, com o mesmo tamanho do quadro. */
function fbmField(seed, scale = 3) {
    const r = rng(seed);
    const G = 256;
    const lattice = new Float32Array(G * G).map(() => r());
    const at = (x, y) => lattice[(((y % G) + G) % G) * G + (((x % G) + G) % G)];
    const noise = (x, y) => {
        const xi = Math.floor(x);
        const yi = Math.floor(y);
        const xf = x - xi;
        const yf = y - yi;
        const u = xf * xf * (3 - 2 * xf);
        const v = yf * yf * (3 - 2 * yf);
        return mix(mix(at(xi, yi), at(xi + 1, yi), u), mix(at(xi, yi + 1), at(xi + 1, yi + 1), u), v);
    };
    const field = new Float32Array(W * H);
    let lo = Infinity;
    let hi = -Infinity;
    for (let y = 0; y < H; y++) {
        for (let x = 0; x < W; x++) {
            let f = 0;
            let amp = 0.5;
            let freq = scale / H;
            for (let o = 0; o < 5; o++) {
                f += amp * noise(x * freq + o * 17.3, y * freq + o * 31.7);
                amp *= 0.5;
                freq *= 2;
            }
            field[y * W + x] = f;
            if (f < lo) lo = f;
            if (f > hi) hi = f;
        }
    }
    for (let i = 0; i < field.length; i++) field[i] = (field[i] - lo) / (hi - lo);
    return field;
}

/**
 * Equaliza um campo para distribuição uniforme 0..1 (por posição no ranking). Sem isso o ruído
 * fractal se concentra no meio e o limiar cobre a tela inteira em poucos quadros; equalizado,
 * a fração coberta é exatamente 1 - limiar e acompanha a curva de tempo.
 */
function equalize(field) {
    const idx = Uint32Array.from(field.keys()).sort((a, b) => field[a] - field[b]);
    const out = new Float32Array(field.length);
    const n = field.length - 1;
    for (let r = 0; r < idx.length; r++) out[idx[r]] = r / n;
    return out;
}

/** Distância do centro normalizada (0 no centro, 1 no canto). */
const radial = (() => {
    const f = new Float32Array(W * H);
    const maxR = Math.hypot(W / 2, H / 2);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) f[y * W + x] = Math.hypot(x - W / 2, y - H / 2) / maxR;
    return f;
})();

/** Fases padrão: entra até 45%, cobre tudo até 55%, sai até 100%. */
const phaseIn = (t) => ease(clamp(t / 0.45));
const phaseOut = (t) => ease(clamp((t - 0.55) / 0.45));

// Cada stinger: pixel(i, x, y, t) -> [r, g, b, a] (0..255, a 0..1), mais preparo opcional.
const STINGERS = {
    /** Tinta: manchas orgânicas de nanquim tomam a tela, com borda vermelho-sangue. */
    ink: {
        seconds: 1.6,
        setup() {
            return { a: equalize(fbmField(11, 2.6)), b: equalize(fbmField(29, 2.6)) };
        },
        pixel(i, x, y, t, s) {
            const base = hex('#07060a');
            const rimC = hex('#8a1426');
            if (t < 0.5) {
                const th = 1.08 - phaseIn(t) * 1.2;
                const n = s.a[i];
                const a = ss(th - 0.012, th + 0.012, n);
                const rim = clamp(1 - Math.abs(n - th - 0.03) / 0.05) * (1 - phaseIn(t) * 0.6);
                return [mix(base[0], rimC[0], rim), mix(base[1], rimC[1], rim), mix(base[2], rimC[2], rim), a];
            }
            const th = phaseOut(t) * 1.2 - 0.1;
            const n = s.b[i];
            const a = ss(th - 0.012, th + 0.012, n);
            const rim = clamp(1 - Math.abs(n - th - 0.03) / 0.05) * phaseOut(t);
            return [mix(base[0], rimC[0], rim), mix(base[1], rimC[1], rim), mix(base[2], rimC[2], rim), a];
        },
    },
    /** Filme queimado: a película queima das bordas, carboniza e abre um furo incandescente no centro. */
    burn: {
        seconds: 1.8,
        setup() {
            const a = fbmField(7, 3.2);
            const b = fbmField(43, 3.2);
            const inF = new Float32Array(W * H);
            const outF = new Float32Array(W * H);
            for (let i = 0; i < inF.length; i++) {
                inF[i] = a[i] * 0.55 + radial[i] * 0.45;
                outF[i] = b[i] * 0.55 + (1 - radial[i]) * 0.45;
            }
            return { inF: equalize(inF), outF: equalize(outF) };
        },
        pixel(i, x, y, t, s) {
            const char = hex('#130804');
            const hot = [hex('#fff6d8'), hex('#ffc04a'), hex('#e0560f'), hex('#5a1806')];
            const ramp = (d) => {
                // d: distância para dentro da área queimada (0 = borda incandescente).
                if (d < 0.012) return hot[0].map((c, k) => mix(c, hot[1][k], d / 0.012));
                if (d < 0.03) return hot[1].map((c, k) => mix(c, hot[2][k], (d - 0.012) / 0.018));
                if (d < 0.06) return hot[2].map((c, k) => mix(c, hot[3][k], (d - 0.03) / 0.03));
                if (d < 0.1) return hot[3].map((c, k) => mix(c, char[k], (d - 0.06) / 0.04));
                return char;
            };
            const glowC = hex('#ff8a2a');
            let f;
            let th;
            if (t < 0.5) {
                f = s.inF[i];
                th = 1.02 - phaseIn(t) * 1.15;
                const d = f - th;
                if (d >= 0) return [...ramp(d), 1];
                const glow = clamp(1 + d / 0.05) * 0.55;
                return [glowC[0], glowC[1], glowC[2], glow * ss(0, 0.2, t)];
            }
            f = s.outF[i];
            th = phaseOut(t) * 1.15 - 0.08;
            const d = f - th;
            if (d >= 0) return [...ramp(d), 1];
            const glow = clamp(1 + d / 0.05) * 0.55 * (1 - phaseOut(t));
            return [glowC[0], glowC[1], glowC[2], glow];
        },
    },
    /** Vazamento de luz: manchas quentes atravessam a lente e estouram em branco no corte. */
    leak: {
        seconds: 1.6,
        setup() {
            const blobs = [
                { c: hex('#ff7a18'), y: 0.35, r: 0.42, x0: -0.4, x1: 1.3 },
                { c: hex('#ffd27a'), y: 0.7, r: 0.38, x0: 1.4, x1: -0.2 },
                { c: hex('#ff3d6e'), y: 0.2, r: 0.3, x0: 1.2, x1: 0.1 },
                { c: hex('#fff1d6'), y: 0.55, r: 0.5, x0: -0.3, x1: 0.9 },
            ];
            return { blobs, grain: rng(5) };
        },
        pixel(i, x, y, t, s) {
            const env = Math.sin(Math.PI * clamp(t)) ** 1.5;
            let r = 0;
            let g = 0;
            let b = 0;
            let w = 0;
            const nx = x / W;
            const ny = y / H;
            for (const bl of s.blobs) {
                const bx = mix(bl.x0, bl.x1, ease(t));
                const d2 = ((nx - bx) * 1.6) ** 2 + (ny - bl.y) ** 2;
                const k = Math.exp(-d2 / (bl.r * bl.r)) * env;
                r += bl.c[0] * k;
                g += bl.c[1] * k;
                b += bl.c[2] * k;
                w += k;
            }
            const flash = ss(0.36, 0.47, t) * (1 - ss(0.53, 0.66, t));
            const a = clamp(Math.max(w * 0.95, flash));
            const cream = hex('#fff6e8');
            const n = w > 0 ? 1 / w : 0;
            const cr = clamp(mix(r * n, cream[0], flash) / 255) * 255;
            const cg = clamp(mix(g * n, cream[1], flash) / 255) * 255;
            const cb = clamp(mix(b * n, cream[2], flash) / 255) * 255;
            return [cr, cg, cb, a];
        },
    },
    /** Corte de espada (RPG): um risco de luz rasga a tela em diagonal, lâminas negras fecham e reabrem. */
    slash: {
        seconds: 1.5,
        setup() {
            const ang = -0.38;
            return { ca: Math.cos(ang), sa: Math.sin(ang), maxD: Math.hypot(W, H) / 2 };
        },
        pixel(i, x, y, t, s) {
            const u = x - W / 2;
            const v = y - H / 2;
            const dLine = -u * s.sa + v * s.ca;
            const along = u * s.ca + v * s.sa;
            const ad = Math.abs(dLine);
            const steel = hex('#0a0b10');
            const edgeC = hex('#e9f3ff');
            const accent = hex('#7fd0ff');
            // Risco de luz (0..20%): a cabeça corre de um canto ao outro.
            const head = mix(-s.maxD, s.maxD, ease(clamp(t / 0.2)));
            const streakOn = t < 0.5 ? (along < head ? 1 : 0) * (1 - ss(0.4, 0.5, t)) : 0;
            const core = clamp(1 - ad / 2.5);
            const glow = Math.exp(-ad / 14) * 0.85;
            const streakA = streakOn * Math.max(core, glow);
            // Lâminas: fecham entre 18% e 45%, reabrem entre 55% e 100%.
            const gap =
                t < 0.5 ? mix(s.maxD, 0, ease(clamp((t - 0.18) / 0.27))) : mix(0, s.maxD, ease(clamp((t - 0.55) / 0.45)));
            const plate = ss(gap - 1.2, gap + 1.2, ad);
            const plateEdge = clamp(1 - Math.abs(ad - gap) / 3) * (gap > 2 ? 1 : 0);
            const seam = t >= 0.42 && t <= 0.62 ? Math.exp(-ad / 10) * (1 - ss(0.5, 0.62, t)) : 0;
            const shade = 0.75 + 0.25 * (along / s.maxD);
            let c = steel.map((k) => k * shade);
            let a = plate;
            const light = Math.max(plateEdge * plate, seam);
            c = c.map((k, j) => mix(k, edgeC[j], light));
            if (streakA > a) {
                const sc = edgeC.map((k, j) => mix(accent[j], k, core));
                const blend = streakA * (1 - a);
                c = c.map((k, j) => mix(k, sc[j], blend / Math.max(1e-3, a + blend)));
                a = a + blend;
            }
            return [c[0], c[1], c[2], clamp(a)];
        },
    },
    /** Glitch digital: faixas corrompidas varrem a tela com sangria de RGB e linhas de varredura. */
    glitch: {
        seconds: 1.4,
        setup() {
            const r = rng(91);
            const rows = new Int16Array(H);
            const bands = [];
            for (let y = 0; y < H; ) {
                const h = 6 + Math.floor(r() * 48);
                const id = bands.length;
                bands.push({
                    tin: r() * 0.36,
                    tout: 0.56 + r() * 0.36,
                    dir: r() < 0.5 ? 1 : -1,
                    tint: r() < 0.5 ? hex('#18f0ff') : hex('#ff2bd6'),
                });
                for (let k = 0; k < h && y < H; k++, y++) rows[y] = id;
            }
            return { rows, bands, frameNoise: rng(17) };
        },
        frame(t, s) {
            s.jitter = Math.floor(s.frameNoise() * 1e6);
        },
        pixel(i, x, y, t, s) {
            const b = s.bands[s.rows[y]];
            const base = hex('#050509');
            const sweepIn = clamp((t - b.tin) / 0.09);
            const sweepOut = clamp((t - b.tout) / 0.09);
            const nx = b.dir > 0 ? x / W : 1 - x / W;
            const coveredIn = nx < sweepIn;
            const coveredOut = nx < sweepOut;
            let a = coveredIn && !coveredOut ? 1 : 0;
            if (t >= 0.45 && t <= 0.55) a = 1;
            const edgeIn = sweepIn > 0 && sweepIn < 1 ? clamp(1 - Math.abs(nx - sweepIn) * W / 8) : 0;
            const edgeOut = sweepOut > 0 && sweepOut < 1 ? clamp(1 - Math.abs(nx - sweepOut) * W / 8) : 0;
            const edge = Math.max(edgeIn, edgeOut);
            let c = base;
            if (edge > 0) {
                c = b.tint;
                a = Math.max(a, edge);
            }
            // Blocos de ruído piscando perto das bordas ativas.
            const bx = (x >> 4) * 73856093;
            const by = (y >> 3) * 19349663;
            const h = ((bx ^ by ^ s.jitter) >>> 0) % 1000;
            const active = (sweepIn > 0 && sweepIn < 1) || (sweepOut > 0 && sweepOut < 1);
            if (active && h < 18) {
                c = h < 6 ? hex('#ffffff') : b.tint;
                a = Math.max(a, 0.9);
            }
            const scan = y % 3 === 0 ? 0.6 : 1;
            return [c[0] * scan, c[1] * scan, c[2] * scan, a];
        },
    },
    /** Hiperespaço: estrelas viram riscos a partir do centro e a luz engole a tela. */
    hyper: {
        seconds: 1.6,
        setup() {
            const r = rng(64);
            const BINS = 720;
            const bins = Array.from({ length: BINS }, () => ({ on: r() < 0.45, b: 0.4 + r() * 0.6, off: r() * 0.3 }));
            const ang = new Float32Array(W * H);
            for (let y = 0; y < H; y++)
                for (let x = 0; x < W; x++) ang[y * W + x] = (Math.atan2(y - H / 2, x - W / 2) + Math.PI) / (2 * Math.PI);
            return { bins, BINS, ang };
        },
        pixel(i, x, y, t, s) {
            const r = radial[i];
            const bin = s.bins[Math.min(s.BINS - 1, Math.floor(s.ang[i] * s.BINS))];
            const blue = hex('#9fd4ff');
            const white = hex('#f4fbff');
            let streak = 0;
            if (bin.on) {
                const speed = ease(clamp(t / 0.5));
                const tail = clamp(speed * 1.4 - bin.off);
                const head = clamp(tail + 0.05 + speed * 0.5);
                streak = r > tail * 0.9 && r < head ? bin.b * (1 - ss(0.75, 1, t)) : 0;
            }
            const fillIn = ss(0, 0.03, ease(clamp((t - 0.22) / 0.23)) * 1.2 - r);
            const fillOut = 1 - ease(clamp((t - 0.55) / 0.3));
            const fill = t < 0.5 ? fillIn : fillOut;
            const a = clamp(Math.max(fill, streak));
            const k = clamp(fill + streak * 0.5);
            return [mix(blue[0], white[0], k), mix(blue[1], white[1], k), mix(blue[2], white[2], k), a];
        },
    },
};

async function render(id, ffmpeg) {
    const st = STINGERS[id];
    const frames = Math.round(st.seconds * FPS);
    const state = st.setup?.() ?? {};
    const out = join(OUT, `${id}.webm`);
    const ff = spawn(
        ffmpeg,
        [
            '-y', '-loglevel', 'error',
            '-f', 'rawvideo', '-pix_fmt', 'rgba', '-s', `${W}x${H}`, '-r', String(FPS), '-i', '-',
            '-c:v', 'libvpx-vp9', '-pix_fmt', 'yuva420p', '-b:v', '0', '-crf', '30',
            '-row-mt', '1', '-deadline', 'good', '-cpu-used', '2', '-auto-alt-ref', '0',
            '-metadata', `title=Lumenn Frame stinger ${id}`,
            out,
        ],
        { stdio: ['pipe', 'inherit', 'inherit'] }
    );
    const done = new Promise((res, rej) => ff.on('close', (c) => (c ? rej(new Error(`ffmpeg ${id}: ${c}`)) : res())));
    const buf = Buffer.alloc(W * H * 4);
    for (let f = 0; f < frames; f++) {
        const t = f / (frames - 1);
        st.frame?.(t, state);
        for (let y = 0, i = 0; y < H; y++) {
            for (let x = 0; x < W; x++, i++) {
                const [r, g, b, a] = st.pixel(i, x, y, t, state);
                const o = i * 4;
                buf[o] = r;
                buf[o + 1] = g;
                buf[o + 2] = b;
                buf[o + 3] = Math.round(clamp(a) * 255);
            }
        }
        if (!ff.stdin.write(buf)) await new Promise((r) => ff.stdin.once('drain', r));
    }
    ff.stdin.end();
    await done;
    return { id, out, ms: Math.round(st.seconds * 1000), cutAt: Math.round((st.seconds * 1000) / 2) };
}

const [ffmpeg = 'ffmpeg', ...only] = process.argv.slice(2);
mkdirSync(OUT, { recursive: true });
for (const id of only.length ? only : Object.keys(STINGERS)) {
    const r = await render(id, ffmpeg);
    console.log(`${r.id}: ${r.out} (${r.ms} ms, corte em ${r.cutAt} ms)`);
}
