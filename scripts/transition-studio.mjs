import { filmEffectOf, filmIn, filmOut, filmTitle } from './film-transitions.mjs';
import { formatMs, progressAt, studioTimeline, transitionKind } from './studio-model.mjs';

const L = (key) => game.i18n.localize(key);
const esc = (value) => foundry.utils.escapeHTML(String(value ?? ''));
/** Milissegundos → segundos para a tela (1500 → "1.5"); vazio fica vazio. */
const sec = (ms) => (ms === '' || ms == null || !Number.isFinite(Number(ms)) ? '' : String(Math.round(Number(ms) / 10) / 100));
const AUDIO_MODES = [
    ['auto', 'LUMENN_FRAME.Edge.Auto'],
    ['keep', 'LUMENN_FRAME.Edge.Keep'],
    ['cut', 'LUMENN_FRAME.Edge.Cut'],
    ['crossfade', 'LUMENN_FRAME.Edge.Crossfade'],
    ['fadeout', 'LUMENN_FRAME.Edge.FadeOut'],
    ['fadein', 'LUMENN_FRAME.Edge.FadeIn'],
];
const PRELOAD_LABEL = {
    idle: 'LUMENN_FRAME.Studio.State.idle',
    loading: 'LUMENN_FRAME.Studio.State.loading',
    ready: 'LUMENN_FRAME.Studio.State.ready',
    error: 'LUMENN_FRAME.Studio.State.error',
    cancelled: 'LUMENN_FRAME.Studio.State.cancelled',
};
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Estúdio de transição: a ligação vista como um corte de editor de vídeo.
 * Monitor com a cena A e a B de verdade, linha do tempo com o ponto de corte e
 * todos os ajustes da transição num painel; aba Cena com o pré-load visível.
 *
 * @typedef {object} StudioSource
 * @property {() => object|null} data             Estado atual da ligação (ver `openStudio`).
 * @property {(patch: object) => Promise} patchEdge
 * @property {(nodeId: string, patch: object) => Promise} patchNode
 * @property {{state: Function, start: Function, cancel: Function}} preloads
 * @property {() => Array<{id: string, from: string, to: string, effect: string, on: boolean}>} links
 * @property {(edgeId: string) => void} select   Troca a ligação mostrada.
 */
/**
 * Painel do estúdio: mora dentro do editor (workspaces Transição e Cena), não numa janela.
 * A raiz é criada uma vez e só muda de lugar a cada render do editor; mover o <canvas>
 * mantém o contexto WebGL e o estado da prévia.
 */
export class LumennStudioPanel {
    /** @type {StudioSource} */
    #source;
    #root;
    #alive = true;
    #ready = false;
    #data = null;
    #timeline = null;
    #tab = 'transition';
    #pixi = null;
    #sprite = null;
    #filter = null;
    #tex = { a: null, b: null };
    #playing = false;
    #loop = false;
    #raf = null;
    #ms = 0;
    #videoMs = new Map();
    #resize = null;
    #gen = 0;
    constructor(source) {
        this.#source = source;
        this.#root = this.#build();
    }
    /** Raiz do painel: o editor só a move para a área do workspace. */
    get root() {
        return this.#root;
    }
    get element() {
        return this.#root;
    }
    get rendered() {
        return this.#alive && this.#root.isConnected;
    }
    /** Encaixa o painel em `host`; na primeira vez, monta o monitor (precisa de tamanho real). */
    async mount(host, tab = 'transition') {
        if (!host) return;
        if (this.#root.parentElement !== host) host.replaceChildren(this.#root);
        this.#setTab(tab);
        if (this.#ready) return false;
        this.#ready = true;
        await this.#init();
        return true;
    }
    /** Só a lista da esquerda (efeito mudou, ligação nova). */
    refreshLinks() {
        this.#drawLinks();
    }
    /** Troca a ligação mostrada (lista da esquerda, duplo clique no grafo, Inspector). */
    async showEdge() {
        this.#stop();
        await this.#refresh({ textures: true });
    }
    destroy() {
        this.#alive = false;
        this.#stop();
        this.#resize?.disconnect();
        this.#pixi?.destroy(false, { children: true });
        this.#pixi = null;
        this.#root.remove();
    }
    #build() {
        const root = document.createElement('div');
        root.className = 'lf-st';
        root.innerHTML = `
			<section class="lf-st-pane lf-st-edit" data-pane="transition">
				<nav class="lf-st-links" aria-label="${esc(L('LUMENN_FRAME.Studio.Links'))}"></nav>
				<div class="lf-st-stage">
					<p class="lf-st-route"></p>
					<div class="lf-st-monitor">
						<canvas class="lf-st-canvas"></canvas>
						<div class="lf-st-film"></div>
						<span class="lf-st-tag" aria-live="polite"></span>
						<p class="lf-st-audio-only"><i class="fa-solid fa-music" aria-hidden="true"></i> ${esc(L('LUMENN_FRAME.Studio.AudioOnlyNote'))}</p>
					</div>
					<div class="lf-st-transport">
						<button type="button" class="lf-st-play" data-st="play"><i class="fa-solid fa-play" aria-hidden="true"></i> <span>${esc(L('LUMENN_FRAME.Studio.Play'))}</span></button>
						<button type="button" class="lf-st-loop" data-st="loop" aria-pressed="false"><i class="fa-solid fa-repeat" aria-hidden="true"></i> ${esc(L('LUMENN_FRAME.Studio.Loop'))}</button>
						<span class="lf-st-time" aria-live="off"></span>
					</div>
					<div class="lf-st-timeline" role="slider" tabindex="0" aria-label="${esc(L('LUMENN_FRAME.Studio.Timeline'))}" aria-valuemin="0">
						<div class="lf-st-track"><div class="lf-st-fill"></div></div>
						<div class="lf-st-marks"></div>
						<div class="lf-st-head-line"></div>
					</div>
					<div class="lf-st-sources"></div>
				</div>
				<aside class="lf-st-panel"></aside>
			</section>
			<section class="lf-st-pane lf-st-scenes" data-pane="scene" hidden></section>`;
        return root;
    }
    async #init() {
        const root = this.#root;
        root.querySelector('.lf-st-links').addEventListener('click', (event) => {
            const id = event.target.closest('[data-link]')?.dataset.link;
            if (id) this.#source.select(id);
        });
        root.querySelector('[data-st="play"]').addEventListener('click', () => this.#togglePlay());
        root.querySelector('[data-st="loop"]').addEventListener('click', (event) => {
            this.#loop = !this.#loop;
            event.currentTarget.setAttribute('aria-pressed', String(this.#loop));
        });
        this.#bindTimeline(root.querySelector('.lf-st-timeline'));
        root.querySelector('.lf-st-panel').addEventListener('change', (event) => this.#onField(event));
        root.querySelector('.lf-st-panel').addEventListener('click', (event) => this.#onPanelClick(event));
        root.querySelector('.lf-st-scenes').addEventListener('click', (event) => this.#onSceneClick(event));
        root.querySelector('.lf-st-scenes').addEventListener('change', (event) => this.#onSceneField(event));
        // Monitor na proporção da tela da mesa: o overlay de cinema cabe exato, em escala.
        const monitor = root.querySelector('.lf-st-monitor');
        monitor.style.aspectRatio = `${window.innerWidth || 16} / ${window.innerHeight || 9}`;
        this.#setupPixi(monitor);
        await this.#refresh({ textures: true });
    }
    /* -- Dados ------------------------------------------------------------ */
    async #refresh({ textures = false } = {}) {
        this.#data = this.#source.data();
        const root = this.element;
        if (!root) return;
        this.#drawLinks();
        root.classList.toggle('is-empty', !this.#data);
        if (!this.#data) {
            root.querySelector('.lf-st-route').textContent = L('LUMENN_FRAME.Studio.PickLink');
            root.querySelector('.lf-st-panel').replaceChildren();
            root.querySelector('.lf-st-scenes').replaceChildren();
            return;
        }
        const { from, to } = this.#data;
        root.querySelector('.lf-st-route').innerHTML = `<span class="lf-st-pill is-a">A</span>${esc(from.label)}<i class="fa-solid fa-arrow-right-long" aria-hidden="true"></i><span class="lf-st-pill is-b">B</span>${esc(to.label)}`;
        await this.#computeTimeline();
        this.#drawSettings();
        this.#drawSources();
        this.#drawScenes();
        if (textures) await this.#loadTextures();
        this.#setupFilter();
        this.#seek(0);
    }
    async #computeTimeline() {
        const scene = this.#data?.scene ?? {};
        const kind = transitionKind(scene.type, filmEffectOf);
        let videoMs = 0;
        if (kind === 'video') videoMs = await this.#probeVideo(this.#data.videoSrc);
        this.#timeline = studioTimeline(scene, {
            filmEffectOf,
            defaultMs: this.#data.defaultMs,
            videoMs,
        });
    }
    /** Duração real do stinger (metadados do arquivo), com cache. */
    #probeVideo(src) {
        if (!src) return Promise.resolve(0);
        if (this.#videoMs.has(src)) return Promise.resolve(this.#videoMs.get(src));
        return new Promise((resolve) => {
            const video = document.createElement('video');
            video.preload = 'metadata';
            const done = (ms) => {
                this.#videoMs.set(src, ms);
                resolve(ms);
            };
            video.onloadedmetadata = () => done(Number.isFinite(video.duration) ? Math.round(video.duration * 1000) : 0);
            video.onerror = () => done(0);
            setTimeout(() => done(0), 4000);
            video.src = src;
        });
    }
    /* -- Painel de ajustes ------------------------------------------------- */
    #drawSettings() {
        const panel = this.element?.querySelector('.lf-st-panel');
        if (!panel || !this.#data) return;
        const d = this.#data;
        const scene = d.scene ?? {};
        const kind = this.#timeline.kind;
        const groups = d.groups
            .map(
                (group) => `
				<div class="lf-st-group">
					<p class="lf-st-group-name">${esc(group.group)}</p>
					<div class="lf-st-tiles">${group.items
                        .map(
                            (item) =>
                                `<button type="button" class="lf-st-tile${item.selected ? ' is-on' : ''}" data-type="${esc(item.id)}" aria-pressed="${item.selected}">${esc(item.label)}</button>`
                        )
                        .join('')}</div>
				</div>`
            )
            .join('');
        const durationRow =
            kind === 'cut'
                ? ''
                : kind === 'video'
                  ? `<p class="lf-st-note">${esc(L('LUMENN_FRAME.Studio.VideoLength'))} <strong>${esc(formatMs(this.#timeline.duration))}</strong></p>`
                  : `<label class="lf-st-field"><span>${esc(L('LUMENN_FRAME.Inspector.Duration'))}</span>
						<span class="lf-st-range"><input type="range" min="0.2" max="5" step="0.05" data-unit="s" data-field="scene.duration" value="${sec(this.#timeline.duration)}" aria-label="${esc(L('LUMENN_FRAME.Inspector.Duration'))}">
						<span class="lf-st-unit"><input type="number" min="0.2" max="10" step="0.1" data-unit="s" data-field="scene.duration" value="${sec(this.#timeline.duration)}"><em>s</em></span></span></label>`;
        const colorRow =
            kind === 'cut'
                ? ''
                : `<label class="lf-st-field lf-st-inline"><span>${esc(L('LUMENN_FRAME.Studio.Color'))}</span><input type="color" data-field="scene.color" value="${esc(d.sceneColor)}"></label>`;
        const title = scene.title ?? {};
        const titleBlock =
            kind === 'film'
                ? `<fieldset class="lf-st-box"><legend>${esc(L('LUMENN_FRAME.Film.Title'))}</legend>
					<label class="lf-st-field"><span>${esc(L('LUMENN_FRAME.Film.TitleText'))}</span><input type="text" data-field="scene.title.text" value="${esc(title.text)}" placeholder="${esc(d.to.label)}"></label>
					<label class="lf-st-field"><span>${esc(L('LUMENN_FRAME.Film.TitleSub'))}</span><input type="text" data-field="scene.title.subtitle" value="${esc(title.subtitle)}"></label>
					<div class="lf-st-row">
						<label class="lf-st-field"><span>${esc(L('LUMENN_FRAME.Film.TitleFont'))}</span><select data-field="scene.title.font"><option value="">${esc(L('LUMENN_FRAME.Film.TitleDefault'))}</option>${d.fonts
                            .map((font) => `<option value="${esc(font)}"${title.font === font ? ' selected' : ''}>${esc(font)}</option>`)
                            .join('')}</select></label>
						<label class="lf-st-field lf-st-small"><span>${esc(L('LUMENN_FRAME.Film.TitleSize'))}</span><span class="lf-st-unit"><input type="number" min="16" max="200" step="2" data-field="scene.title.size" value="${esc(title.size ?? '')}" placeholder="64"><em>px</em></span></label>
						<label class="lf-st-field lf-st-small"><span>${esc(L('LUMENN_FRAME.Film.TitleColor'))}</span><input type="color" data-field="scene.title.color" value="${esc(d.titleColor)}"></label>
					</div>
				</fieldset>`
                : '';
        const stingerBlock =
            kind === 'video'
                ? `<fieldset class="lf-st-box"><legend>${esc(L('LUMENN_FRAME.Stinger.Ready'))}</legend>
					<div class="lf-st-tiles">${d.stingers
                        .map(
                            (s) =>
                                `<button type="button" class="lf-st-tile${s.on ? ' is-on' : ''}" data-stinger="${esc(s.src)}" aria-pressed="${s.on}"><i class="fa-solid ${esc(s.icon)}" aria-hidden="true"></i> ${esc(s.label)}</button>`
                        )
                        .join('')}</div>
					<label class="lf-st-field"><span>${esc(L('LUMENN_FRAME.Film.CutAt'))}</span><span class="lf-st-unit"><input type="number" min="0" step="0.05" data-unit="s" data-field="scene.video.cutAt" value="${sec(scene.video?.cutAt)}" placeholder="${esc(L('LUMENN_FRAME.Stinger.CutAuto'))}"><em>s</em></span></label>
				</fieldset>`
                : '';
        const audio = d.audio ?? {};
        const scopes = [
            ['both', 'LUMENN_FRAME.Inspector.BeatBoth'],
            ['scene', 'LUMENN_FRAME.Inspector.SceneOnly'],
            ['audio', 'LUMENN_FRAME.Inspector.AudioOnly'],
        ];
        const scopeRow = `<div class="lf-st-scope" role="group" aria-label="${esc(L('LUMENN_FRAME.Studio.Scope'))}">${scopes
            .map(
                ([id, key]) =>
                    `<button type="button" data-scope="${id}" class="${d.scope === id ? 'is-on' : ''}" aria-pressed="${d.scope === id}">${esc(L(key))}</button>`
            )
            .join('')}</div>`;
        const sceneBlock =
            d.scope === 'audio'
                ? `<p class="lf-st-note">${esc(L('LUMENN_FRAME.Studio.AudioOnlyNote'))}</p>`
                : `<h3 class="lf-st-h">${esc(L('LUMENN_FRAME.Studio.Type'))}</h3>
			${groups}
			<h3 class="lf-st-h">${esc(L('LUMENN_FRAME.Studio.Timing'))}</h3>
			${durationRow}${colorRow}
			${titleBlock}${stingerBlock}`;
        const audioBlock =
            d.scope === 'scene'
                ? `<p class="lf-st-note">${esc(L('LUMENN_FRAME.Studio.SceneOnlyNote'))}</p>`
                : `<div class="lf-st-row">
				<label class="lf-st-field"><span>${esc(L('LUMENN_FRAME.Studio.AudioMode'))}</span><select data-field="audio.mode">${AUDIO_MODES.map(
                    ([id, key]) => `<option value="${id}"${(audio.mode ?? 'auto') === id ? ' selected' : ''}>${esc(L(key))}</option>`
                ).join('')}</select></label>
				<label class="lf-st-field lf-st-small"><span>${esc(L('LUMENN_FRAME.Inspector.CrossfadeDur'))}</span><span class="lf-st-unit"><input type="number" min="0" max="10" step="0.1" data-unit="s" data-field="audio.crossfadeDuration" value="${sec(audio.crossfadeDuration)}"><em>s</em></span></label>
			</div>
			<div class="lf-st-row">
				<label class="lf-st-field lf-st-small"><span>${esc(L('LUMENN_FRAME.Inspector.FadeIn'))}</span><span class="lf-st-unit"><input type="number" min="0" max="10" step="0.1" data-unit="s" data-field="audio.fadeInDuration" value="${sec(audio.fadeInDuration)}"><em>s</em></span></label>
				<label class="lf-st-field lf-st-small"><span>${esc(L('LUMENN_FRAME.Inspector.FadeOut'))}</span><span class="lf-st-unit"><input type="number" min="0" max="10" step="0.1" data-unit="s" data-field="audio.fadeOutDuration" value="${sec(audio.fadeOutDuration)}"><em>s</em></span></label>
			</div>
			<label class="lf-st-field"><span>${esc(L('LUMENN_FRAME.Inspector.Curve'))}</span><select data-field="audio.curve">${['linear', 'equal-power']
                .map((curve) => `<option value="${curve}"${(audio.curve ?? 'linear') === curve ? ' selected' : ''}>${curve}</option>`)
                .join('')}</select></label>`;
        panel.innerHTML = `
			<h3 class="lf-st-h">${esc(L('LUMENN_FRAME.Studio.Scope'))}</h3>
			${scopeRow}
			${sceneBlock}
			<h3 class="lf-st-h">${esc(L('LUMENN_FRAME.Inspector.AudioTransition'))}</h3>
			${audioBlock}`;
        // Só áudio: o monitor avisa que a cena não muda nesta ligação.
        this.element?.querySelector('.lf-st-monitor')?.classList.toggle('is-audio-only', d.scope === 'audio');
    }
    /** Coluna da esquerda: todas as ligações do storyboard, como o media pool de um editor. */
    #drawLinks() {
        const nav = this.element?.querySelector('.lf-st-links');
        if (!nav) return;
        const links = this.#source.links?.() ?? [];
        nav.innerHTML = `<h3 class="lf-st-h">${esc(L('LUMENN_FRAME.Studio.Links'))}</h3>${
            links.length
                ? `<ul>${links
                      .map(
                          (link) => `<li><button type="button" data-link="${esc(link.id)}" class="${link.on ? 'is-on' : ''}" aria-current="${link.on ? 'true' : 'false'}">
						<span class="lf-st-link-route">${esc(link.from)} <i class="fa-solid fa-arrow-right-long" aria-hidden="true"></i> ${esc(link.to)}</span>
						<span class="lf-st-link-fx">${esc(link.effect)}</span>
					</button></li>`
                      )
                      .join('')}</ul>`
                : `<p class="lf-st-note">${esc(L('LUMENN_FRAME.Studio.NoLinks'))}</p>`
        }`;
    }
    #drawSources() {
        const box = this.element?.querySelector('.lf-st-sources');
        if (!box || !this.#data) return;
        const card = (side, info) => `
			<figure class="lf-st-src is-${side}">
				${info.src ? `<img src="${esc(info.src)}" alt="" loading="lazy">` : `<span class="lf-st-src-empty" aria-hidden="true"><i class="fa-solid fa-image"></i></span>`}
				<figcaption><span class="lf-st-pill is-${side}">${side.toUpperCase()}</span>${esc(info.label)}</figcaption>
			</figure>`;
        box.innerHTML = `${card('a', this.#data.from)}<i class="fa-solid fa-arrow-right-long lf-st-src-arrow" aria-hidden="true"></i>${card('b', this.#data.to)}`;
    }
    async #onField(event) {
        const field = event.target?.dataset?.field;
        if (!field || !this.#data) return;
        let value = event.target.type === 'checkbox' ? event.target.checked : event.target.value;
        if (event.target.type === 'number' || event.target.type === 'range') {
            value = value === '' ? null : Number(value);
            // Tela em segundos, dado em milissegundos.
            if (value !== null && event.target.dataset.unit === 's') value = Math.round(value * 1000);
            if (value !== null && !Number.isFinite(value)) return;
        }
        const [root, ...rest] = field.split('.');
        const patch = { transition: {} };
        let cur = (patch.transition[root] = {});
        rest.slice(0, -1).forEach((key) => (cur = cur[key] = {}));
        cur[rest.at(-1)] = value;
        await this.#save(patch);
    }
    async #onPanelClick(event) {
        const scope = event.target.closest('[data-scope]')?.dataset.scope;
        if (scope && this.#data) return this.#save({ transition: { scope } });
        const tile = event.target.closest('[data-type], [data-stinger]');
        if (!tile || !this.#data) return;
        if (tile.dataset.type) await this.#save({ transition: { scene: { type: tile.dataset.type } } });
        else await this.#save({ transition: { scene: { video: { src: tile.dataset.stinger } } } });
    }
    async #save(patch) {
        this.#stop();
        await this.#source.patchEdge(patch);
        await this.#refresh({ textures: false });
    }
    /* -- Monitor ----------------------------------------------------------- */
    #setupPixi(monitor) {
        // Render repetido não pode acumular contextos WebGL (o navegador limita ~16).
        this.#resize?.disconnect();
        this.#pixi?.destroy(false, { children: true });
        const canvas = monitor.querySelector('.lf-st-canvas');
        const { width, height } = monitor.getBoundingClientRect();
        this.#pixi = new PIXI.Application({
            view: canvas,
            width: Math.max(2, Math.round(width)),
            height: Math.max(2, Math.round(height)),
            backgroundColor: 0x0c0c0f,
            antialias: true,
            autoStart: false,
        });
        this.#sprite = new PIXI.Sprite(PIXI.Texture.EMPTY);
        this.#pixi.stage.addChild(this.#sprite);
        this.#resize = new ResizeObserver(() => {
            const r = monitor.getBoundingClientRect();
            if (!this.#pixi || r.width < 2 || r.height < 2) return;
            this.#pixi.renderer.resize(Math.round(r.width), Math.round(r.height));
            this.#fit();
            this.#showProgress(this.#lastProgress ?? 0);
        });
        this.#resize.observe(monitor);
    }
    #lastProgress = 0;
    /** Placeholder legível quando a cena não tem fundo: cor do lado + nome. */
    #placeholder(label, side) {
        const c = document.createElement('canvas');
        c.width = 1280;
        c.height = 720;
        const g = c.getContext('2d');
        const grad = g.createLinearGradient(0, 0, 1280, 720);
        grad.addColorStop(0, side === 'a' ? '#0b2a36' : '#2a2412');
        grad.addColorStop(1, side === 'a' ? '#060d14' : '#0d0b06');
        g.fillStyle = grad;
        g.fillRect(0, 0, 1280, 720);
        g.fillStyle = side === 'a' ? '#00d4f5' : '#c8a84b';
        g.font = '120px "Bebas Neue", sans-serif';
        g.textAlign = 'center';
        g.fillText(side.toUpperCase(), 640, 320);
        g.fillStyle = '#eef2ff';
        g.font = '600 44px Rajdhani, sans-serif';
        g.fillText(String(label ?? '').slice(0, 40), 640, 400);
        return PIXI.Texture.from(c);
    }
    async #loadTextures() {
        const gen = ++this.#gen;
        const load = async (info, side) => {
            if (!info?.src) return this.#placeholder(info?.label, side);
            try {
                return (await foundry.canvas.loadTexture(info.src)) ?? this.#placeholder(info.label, side);
            } catch {
                return this.#placeholder(info.label, side);
            }
        };
        const [a, b] = await Promise.all([load(this.#data.from, 'a'), load(this.#data.to, 'b')]);
        if (gen !== this.#gen) return;
        this.#tex = { a, b };
        this.#sprite.texture = a;
        this.#fit();
    }
    /** Cobre o monitor sem distorcer (como o canvas do Foundry). */
    #fit() {
        const tex = this.#sprite?.texture;
        if (!tex || !this.#pixi || tex === PIXI.Texture.EMPTY) return;
        const { width, height } = this.#pixi.screen;
        const scale = Math.max(width / tex.width, height / tex.height);
        this.#sprite.scale.set(scale);
        this.#sprite.position.set((width - tex.width * scale) / 2, (height - tex.height * scale) / 2);
    }
    #setupFilter() {
        if (!this.#sprite) return;
        this.#sprite.filters = null;
        this.#filter = null;
        if (this.#timeline?.kind !== 'shader' || !this.#tex.b) return;
        const registry = CONFIG.Canvas?.sceneTransitions ?? {};
        const cfg = registry[this.#data.scene?.type] ?? registry.fade;
        if (!cfg?.filterClass) return;
        try {
            const filter = cfg.filterClass.create();
            filter.type = cfg.filterType;
            filter.targetTexture = this.#tex.b;
            this.#filter = filter;
            this.#sprite.filters = [filter];
        } catch (error) {
            console.warn('Lumenn Frame | estúdio: filtro indisponível', error);
        }
    }
    #showProgress(p) {
        this.#lastProgress = p;
        if (!this.#pixi || !this.#tex.a) return;
        if (this.#filter) {
            this.#sprite.texture = this.#tex.a;
            this.#filter.uniforms.progress = p;
        } else {
            this.#sprite.texture = p >= 1 ? this.#tex.b : this.#tex.a;
        }
        this.#fit();
        this.#pixi.render();
        const tag = this.element?.querySelector('.lf-st-tag');
        if (tag) {
            const side = p >= 1 ? 'b' : p <= 0 ? 'a' : 'ab';
            tag.dataset.side = side;
            tag.textContent = side === 'ab' ? 'A → B' : side.toUpperCase();
        }
    }
    /* -- Linha do tempo ---------------------------------------------------- */
    #bindTimeline(bar) {
        const toMs = (event) => {
            const r = bar.getBoundingClientRect();
            return ((event.clientX - r.left) / r.width) * (this.#timeline?.duration ?? 0);
        };
        bar.addEventListener('pointerdown', (event) => {
            if (!this.#timeline?.scrubbable) return;
            this.#stop();
            bar.setPointerCapture(event.pointerId);
            this.#seek(toMs(event));
            const move = (ev) => this.#seek(toMs(ev));
            const up = () => {
                bar.removeEventListener('pointermove', move);
                bar.removeEventListener('pointerup', up);
            };
            bar.addEventListener('pointermove', move);
            bar.addEventListener('pointerup', up);
        });
        bar.addEventListener('keydown', (event) => {
            if (!this.#timeline?.scrubbable) return;
            const step = event.shiftKey ? 250 : 50;
            if (event.key === 'ArrowRight') this.#seek(this.#ms + step);
            else if (event.key === 'ArrowLeft') this.#seek(this.#ms - step);
            else if (event.key === 'Home') this.#seek(0);
            else if (event.key === 'End') this.#seek(this.#timeline.duration);
            else return;
            event.preventDefault();
        });
    }
    #seek(ms) {
        const tl = this.#timeline;
        if (!tl) return;
        this.#ms = Math.min(tl.duration, Math.max(0, ms));
        if (tl.scrubbable) this.#showProgress(progressAt(this.#ms, tl));
        else this.#showProgress(this.#ms >= tl.cut ? 1 : 0);
        this.#paintTimeline();
    }
    #paintTimeline() {
        const root = this.element;
        const tl = this.#timeline;
        if (!root || !tl) return;
        const ratio = tl.duration ? this.#ms / tl.duration : 0;
        root.querySelector('.lf-st-fill').style.width = `${ratio * 100}%`;
        root.querySelector('.lf-st-head-line').style.left = `${ratio * 100}%`;
        root.querySelector('.lf-st-time').textContent = `${formatMs(this.#ms, game.i18n.lang)} / ${formatMs(tl.duration, game.i18n.lang)}`;
        const bar = root.querySelector('.lf-st-timeline');
        bar.setAttribute('aria-valuemax', String(tl.duration));
        bar.setAttribute('aria-valuenow', String(Math.round(this.#ms)));
        bar.classList.toggle('is-locked', !tl.scrubbable);
        const marks = root.querySelector('.lf-st-marks');
        const label = {
            start: 'LUMENN_FRAME.Studio.MarkStart',
            cut: 'LUMENN_FRAME.Studio.MarkCut',
            end: 'LUMENN_FRAME.Studio.MarkEnd',
        };
        marks.innerHTML = tl.marks
            .map(
                (mark) =>
                    `<span class="lf-st-mark is-${mark.id}" style="left:${mark.ratio * 100}%"><b>${esc(L(label[mark.id]))}</b><em>${esc(formatMs(mark.at, game.i18n.lang))}</em></span>`
            )
            .join('');
    }
    /* -- Tocar -------------------------------------------------------------- */
    #togglePlay() {
        if (this.#playing) this.#stop();
        else this.#play();
    }
    #setPlayingUi(on) {
        const btn = this.element?.querySelector('[data-st="play"]');
        if (!btn) return;
        btn.classList.toggle('is-playing', on);
        btn.querySelector('i').className = `fa-solid ${on ? 'fa-stop' : 'fa-play'}`;
        btn.querySelector('span').textContent = L(on ? 'LUMENN_FRAME.Studio.Stop' : 'LUMENN_FRAME.Studio.Play');
    }
    #stop() {
        this.#playing = false;
        if (this.#raf) cancelAnimationFrame(this.#raf);
        this.#raf = null;
        this.#setPlayingUi(false);
    }
    async #play() {
        const tl = this.#timeline;
        if (!tl || !this.#data) return;
        this.#playing = true;
        this.#setPlayingUi(true);
        do {
            const t0 = performance.now();
            const tick = () => {
                if (!this.#playing) return;
                const ms = performance.now() - t0;
                this.#ms = Math.min(tl.duration, ms);
                if (tl.scrubbable) this.#showProgress(progressAt(this.#ms, tl));
                this.#paintTimeline();
                if (ms < tl.duration) this.#raf = requestAnimationFrame(tick);
            };
            this.#showProgress(0);
            this.#raf = requestAnimationFrame(tick);
            if (tl.kind === 'film' || tl.kind === 'video') await this.#playFilm();
            else await sleep(tl.duration);
            if (!this.#playing) return;
            this.#ms = tl.duration;
            this.#showProgress(1);
            this.#paintTimeline();
            await sleep(this.#loop ? 900 : 0);
        } while (this.#loop && this.#playing && this.rendered);
        this.#stop();
    }
    /** Cinema/stinger: o mesmo overlay da mesa, dentro do monitor; a cena troca no corte. */
    async #playFilm() {
        const d = this.#data;
        const effect = filmEffectOf(d.scene?.type);
        const host = this.element?.querySelector('.lf-st-film');
        if (!effect || !host) return;
        const payload = {
            effect,
            duration: this.#timeline.duration,
            color: d.sceneColor,
            ...filmTitle(d.scene, { caption: d.to.label, subtitle: d.graphName }),
            src: d.videoSrc,
            cutAt: d.scene?.video?.cutAt,
            sound: false,
            host,
        };
        await filmIn(payload);
        if (!this.#playing) return;
        this.#showProgress(1);
        await filmOut(payload);
    }
    /* -- Aba Cena ------------------------------------------------------------ */
    #setTab(tab) {
        this.#tab = tab === 'scene' ? 'scene' : 'transition';
        const root = this.element;
        // As abas moram no topo do editor (workspaces); aqui só alterna o painel visível.
        root.querySelectorAll('[data-pane]').forEach((pane) => {
            pane.hidden = pane.dataset.pane !== this.#tab;
        });
        if (this.#tab === 'scene') this.#stop();
    }
    #drawScenes() {
        const pane = this.element?.querySelector('.lf-st-scenes');
        if (!pane || !this.#data) return;
        const card = (side, info) => {
            const state = info.sceneId ? (this.#source.preloads.state(info.sceneId) ?? 'idle') : null;
            const action =
                state === 'loading' ? 'cancel' : state === 'ready' ? null : state ? 'start' : null;
            const actionLabel = {
                start: state === 'error' || state === 'cancelled' ? 'LUMENN_FRAME.Studio.PreloadRetry' : 'LUMENN_FRAME.Studio.Preload',
                cancel: 'LUMENN_FRAME.Studio.PreloadCancel',
            };
            return `
				<article class="lf-st-scene is-${side}" data-scene="${esc(info.sceneId ?? '')}">
					<div class="lf-st-scene-img">${info.src ? `<img src="${esc(info.src)}" alt="">` : `<span class="lf-st-src-empty" aria-hidden="true"><i class="fa-solid fa-image"></i></span>`}</div>
					<div class="lf-st-scene-body">
						<h3><span class="lf-st-pill is-${side}">${side.toUpperCase()}</span>${esc(info.label)}</h3>
						<p class="lf-st-scene-kind">${esc(info.sceneName ? `${L('LUMENN_FRAME.Studio.FoundryScene')}: ${info.sceneName}` : L('LUMENN_FRAME.Studio.NoScene'))}</p>
						${
                            state
                                ? `<div class="lf-st-preload" data-state="${state}">
							<span class="lf-st-dot" aria-hidden="true"></span>
							<span class="lf-st-preload-label">${esc(L(PRELOAD_LABEL[state]))}</span>
							${action ? `<button type="button" data-preload="${action}">${esc(L(actionLabel[action]))}</button>` : ''}
						</div>`
                                : ''
                        }
						${
                            side === 'b' && info.nodeId && info.kind === 'scene'
                                ? `<label class="lf-st-check"><input type="checkbox" data-visitable="${esc(info.nodeId)}"${info.visitable ? ' checked' : ''}> ${esc(L('LUMENN_FRAME.Inspector.Visitable'))}</label>`
                                : ''
                        }
						${
                            info.audio?.length
                                ? `<ul class="lf-st-audio">${info.audio
                                      .map(
                                          (a) =>
                                              `<li class="is-${esc(a.role)}"><i class="fa-solid ${a.role === 'sfx' ? 'fa-bolt' : 'fa-music'}" aria-hidden="true"></i>${esc(a.label)}</li>`
                                      )
                                      .join('')}</ul>`
                                : `<p class="lf-st-scene-kind">${esc(L('LUMENN_FRAME.Studio.NoAudio'))}</p>`
                        }
						${
                            info.sceneId
                                ? `<div class="lf-st-scene-actions">
							<button type="button" data-scene-act="config"><i class="fa-solid fa-gear" aria-hidden="true"></i> ${esc(L('LUMENN_FRAME.Studio.SceneConfig'))}</button>
							<button type="button" data-scene-act="view"><i class="fa-solid fa-eye" aria-hidden="true"></i> ${esc(L('LUMENN_FRAME.Studio.SceneView'))}</button>
						</div>`
                                : ''
                        }
					</div>
				</article>`;
        };
        pane.innerHTML = `<p class="lf-st-scenes-hint">${esc(L('LUMENN_FRAME.Studio.PreloadHint'))}</p><div class="lf-st-scene-grid">${card('a', this.#data.from)}${card('b', this.#data.to)}</div>`;
    }
    /** O tracker avisa: repinta só o selo da cena afetada. */
    paintPreload(sceneId) {
        if (this.#data && [this.#data.from.sceneId, this.#data.to.sceneId].includes(sceneId)) this.#drawScenes();
    }
    #onSceneClick(event) {
        const card = event.target.closest('[data-scene]');
        const sceneId = card?.dataset.scene;
        const preload = event.target.closest('[data-preload]')?.dataset.preload;
        if (sceneId && preload === 'start') this.#source.preloads.start(sceneId);
        if (sceneId && preload === 'cancel') this.#source.preloads.cancel(sceneId);
        const act = event.target.closest('[data-scene-act]')?.dataset.sceneAct;
        const scene = sceneId ? game.scenes.get(sceneId) : null;
        if (scene && act === 'config') scene.sheet?.render(true);
        if (scene && act === 'view') scene.view();
    }
    async #onSceneField(event) {
        const nodeId = event.target?.dataset?.visitable;
        if (!nodeId) return;
        await this.#source.patchNode(nodeId, { data: { visitable: event.target.checked } });
        await this.#refresh();
    }
}
