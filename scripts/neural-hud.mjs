import { buildHudModel, HUD_FILTERS, secondaryAddress } from './neural-hud-model.mjs';
import { normalizeAddress } from './neural-address.mjs';
const KIND_ICONS = {
    scene: 'fa-image',
    audio: 'fa-music',
    note: 'fa-note-sticky',
    group: 'fa-object-group',
    encounter: 'fa-bolt',
    'hive-ref': 'fa-cubes',
    storyboard: 'fa-film',
    hive: 'fa-cubes',
    'mini-hive': 'fa-cubes',
    universe: 'fa-globe',
    planet: 'fa-earth-americas',
    country: 'fa-map',
};
const FILTER_ICONS = {
    all: 'fa-layer-group',
    scene: 'fa-image',
    hive: 'fa-cubes',
    audio: 'fa-music',
    other: 'fa-note-sticky',
};
const PRELOAD_ACTIONS = {
    idle: ['fa-download', 'LUMENN_FRAME.Neural.Preload'],
    loading: ['fa-xmark', 'LUMENN_FRAME.Neural.PreloadCancel'],
    error: ['fa-rotate-right', 'LUMENN_FRAME.Neural.PreloadRetry'],
    cancelled: ['fa-rotate-right', 'LUMENN_FRAME.Neural.PreloadRetry'],
};
const L = (key) => game.i18n.localize(key);
const esc = (value) => foundry.utils.escapeHTML(String(value ?? ''));
/**
 * HUD de Destinos do GM. Janela própria (ApplicationV2): sem botões falsos de DialogV2.
 *
 * @typedef {object} NeuralHudSource
 * @property {() => Array<object>} entries                Destinos do índice neural.
 * @property {() => {graphId: string|null, title: string, address: string}} current
 * @property {(entry: object) => string} sceneIdOf       Scene pré-carregável do destino ('' se nenhuma).
 * @property {{state: Function, start: Function, cancel: Function}} preloads
 * @property {(entry: object) => unknown} enter           Salto direto.
 * @property {() => Map<string, string>} [relations]      Parentesco de cada grafo com o atual.
 * @property {() => Array<string>} [recentIds]            Destinos recentes, mais novo primeiro.
 * @property {(id: string) => void} [remember]           Registra um destino como recente.
 * @property {() => void} [onClosed]
 */
export class LumennNeuralHud extends foundry.applications.api.ApplicationV2 {
    static DEFAULT_OPTIONS = {
        id: 'lumenn-neural-hud',
        classes: ['lumenn-frame', 'lf-hud-dialog'],
        window: {
            icon: 'fa-solid fa-diagram-project',
            resizable: true,
        },
        position: {
            width: 720,
            height: 620,
        },
    };
    /** @type {NeuralHudSource} */
    #source;
    #query = '';
    #filter = 'all';
    #entries = [];
    constructor(source, options = {}) {
        super(options);
        this.#source = source;
    }
    get title() {
        return L('LUMENN_FRAME.Neural.Destinations');
    }
    async _renderHTML() {
        const current = this.#source.current();
        const root = document.createElement('div');
        root.className = 'lf-hud';
        root.innerHTML = `
			<header class="lf-hud-head">
				<p class="lf-hud-crumb"><span class="lf-hud-crumb-label">${esc(L('LUMENN_FRAME.Neural.Here'))}</span><i class="fa-solid fa-location-dot" aria-hidden="true"></i><span>${esc(current.address || current.title)}</span></p>
				<label class="lf-hud-searchbox"><i class="fa-solid fa-magnifying-glass" aria-hidden="true"></i><input type="search" class="lf-hud-search" placeholder="${esc(L('LUMENN_FRAME.Neural.Search'))}" aria-label="${esc(L('LUMENN_FRAME.Neural.Search'))}" value="${esc(this.#query)}"></label>
				<div class="lf-hud-filters" role="tablist" aria-label="${esc(L('LUMENN_FRAME.Neural.Filters'))}"></div>
			</header>
			<ul class="lf-hud-list" role="listbox" aria-label="${esc(L('LUMENN_FRAME.Neural.Destinations'))}"></ul>
			<p class="lf-hud-empty" hidden><i class="fa-solid fa-satellite-dish" aria-hidden="true"></i>${esc(L('LUMENN_FRAME.Neural.NoDestinations'))}</p>
			<footer class="lf-hud-keys">${L('LUMENN_FRAME.Neural.KeysHint')}</footer>
			<p class="lf-hud-live" role="status" aria-live="polite"></p>`;
        return root;
    }
    _replaceHTML(result, content) {
        content.replaceChildren(result);
    }
    async _onRender(context, options) {
        await super._onRender(context, options);
        this.#entries = this.#source.entries();
        const root = this.element;
        const input = root.querySelector('.lf-hud-search');
        input.addEventListener('input', () => {
            this.#query = input.value;
            this.#drawList();
        });
        root.querySelector('.lf-hud-filters').addEventListener('click', (event) => {
            const chip = event.target.closest('[data-lf-filter]');
            if (!chip) return;
            this.#filter = chip.dataset.lfFilter;
            this.#drawList();
        });
        root.querySelector('.lf-hud-list').addEventListener('click', (event) =>
            this.#onListClick(event)
        );
        this.#drawList();
        input.focus();
    }
    async _onFirstRender(context, options) {
        await super._onFirstRender(context, options);
        // `this.element` persiste entre renders: o teclado liga uma vez só.
        this.element.addEventListener('keydown', (event) => this.#onKey(event));
    }
    _onClose(options) {
        super._onClose(options);
        this.#source.onClosed?.();
    }
    /** Repinta as linhas de uma cena quando o estado do pré-load muda. */
    paintScene(sceneId, state) {
        const root = this.element;
        if (!root) return;
        for (const row of root.querySelectorAll('.lf-hud-row[data-scene]'))
            if (row.dataset.scene === sceneId) this.#paintRow(row);
        if (!state || state === 'idle') return;
        const live = root.querySelector('.lf-hud-live');
        if (live)
            live.textContent = game.i18n.format('LUMENN_FRAME.Neural.PreloadAnnounce', {
                name: game.scenes.get(sceneId)?.name ?? sceneId,
                state: L(`LUMENN_FRAME.Neural.PreloadState.${state}`),
            });
    }
    #model() {
        const current = this.#source.current();
        return buildHudModel(this.#entries, {
            query: this.#query,
            filter: this.#filter,
            currentGraphId: current.graphId,
            currentTitle: current.title,
            currentAddress: current.address,
            normalize: normalizeAddress,
            relations: this.#source.relations?.() ?? null,
            recentIds: this.#source.recentIds?.() ?? [],
        });
    }
    /** Grupo "Recentes" no topo: os últimos saltos pelo HUD, com o endereço completo. */
    #recentHtml(recent) {
        if (!recent?.length) return '';
        const rows = recent.map((entry) => this.#rowHtml(entry, { address: entry.address })).join('');
        return `<li class="lf-hud-group lf-hud-recent" role="presentation"><ul role="presentation"><li class="lf-hud-group-title" role="presentation"><i class="fa-solid fa-clock-rotate-left" aria-hidden="true"></i><span class="lf-hud-name">${esc(L('LUMENN_FRAME.Neural.Recent'))}</span></li>${rows}</ul></li>`;
    }
    /** Selo de parentesco com o lugar atual (filha, acima, irmã). "Aqui" tem selo próprio. */
    #relationBadge(relation) {
        if (!['child', 'parent', 'sibling'].includes(relation)) return '';
        return `<span class="lf-hud-rel lf-hud-rel-${relation}">${esc(L(`LUMENN_FRAME.Neural.Rel.${relation}`))}</span>`;
    }
    #drawList() {
        const root = this.element;
        if (!root) return;
        const model = this.#model();
        this.#filter = model.filter;
        root.querySelector('.lf-hud-filters').innerHTML = HUD_FILTERS.map(
            (key) =>
                `<button type="button" class="lf-hud-chip" role="tab" data-lf-filter="${key}" aria-selected="${key === model.filter}"${model.counts[key] || key === 'all' ? '' : ' disabled'}><i class="fa-solid ${FILTER_ICONS[key]}" aria-hidden="true"></i><span>${esc(L(`LUMENN_FRAME.Neural.Filter.${key}`))}</span><b>${model.counts[key]}</b></button>`
        ).join('');
        const list = root.querySelector('.lf-hud-list');
        list.innerHTML =
            this.#recentHtml(model.recent) + model.groups.map((group) => this.#groupHtml(group)).join('');
        root.querySelector('.lf-hud-empty').hidden = model.total > 0;
        for (const row of list.querySelectorAll('.lf-hud-row')) this.#paintRow(row);
    }
    #groupHtml(group) {
        const head = group.entry
            ? this.#rowHtml(group.entry, {
                  graph: true,
                  title: group.title,
                  address: group.address !== group.title ? group.address : '',
                  badge: this.#relationBadge(group.relation),
              })
            : `<li class="lf-hud-group-title" role="presentation"><i class="fa-solid fa-cubes" aria-hidden="true"></i><span class="lf-hud-name">${esc(group.title)}</span>${group.isCurrent ? `<span class="lf-hud-here">${esc(L('LUMENN_FRAME.Neural.YouAreHere'))}</span>` : this.#relationBadge(group.relation)}</li>`;
        const items = group.items
            .map((item) =>
                this.#rowHtml(item, {
                    address: secondaryAddress(item, group.address),
                })
            )
            .join('');
        return `<li class="lf-hud-group${group.isCurrent ? ' is-current' : ''}" role="presentation"><ul role="presentation">${head}${items}</ul></li>`;
    }
    #rowHtml(entry, { graph = false, title = entry.name, address = '', badge = '' } = {}) {
        const sceneId = this.#source.sceneIdOf(entry);
        return `<li class="lf-hud-row${graph ? ' lf-hud-row--graph' : ''}" role="option" tabindex="-1" data-id="${esc(entry.id)}" data-scene="${esc(sceneId)}">
			<i class="fa-solid ${KIND_ICONS[entry.kind] ?? 'fa-location-dot'} lf-hud-kind" aria-hidden="true"></i>
			<span class="lf-hud-text"><span class="lf-hud-name">${esc(title)}${badge}</span>${address ? `<span class="lf-hud-addr">${esc(address)}</span>` : ''}</span>
			<span class="lf-hud-state" data-lf-state></span>
			<span class="lf-hud-actions">
				<button type="button" class="lf-hud-preload" data-lf-preload tabindex="-1"></button>
				<button type="button" class="lf-hud-enter" data-lf-enter tabindex="-1"><i class="fa-solid fa-arrow-right-to-bracket" aria-hidden="true"></i><span>${esc(L('LUMENN_FRAME.Neural.Enter'))}</span></button>
			</span>
		</li>`;
    }
    /** Chip + botão de pré-load conforme o estado da cena. */
    #paintRow(row) {
        const sceneId = row.dataset.scene;
        const state = sceneId ? this.#source.preloads.state(sceneId) : 'none';
        row.dataset.state = state;
        const chip = row.querySelector('[data-lf-state]');
        if (chip)
            chip.textContent = ['loading', 'ready', 'error', 'cancelled'].includes(state)
                ? L(`LUMENN_FRAME.Neural.PreloadState.${state}`)
                : '';
        const button = row.querySelector('[data-lf-preload]');
        if (!button) return;
        const action = PRELOAD_ACTIONS[state];
        // Sem cena ou já pronta: o botão some, mas guarda a coluna.
        button.disabled = !action;
        if (!action) return void button.replaceChildren();
        const icon = document.createElement('i');
        icon.className = `fa-solid ${action[0]}`;
        icon.setAttribute('aria-hidden', 'true');
        const label = document.createElement('span');
        label.textContent = L(action[1]);
        button.replaceChildren(icon, label);
    }
    #entryOf(row) {
        return this.#entries.find((entry) => entry.id === row?.dataset.id) ?? null;
    }
    #togglePreload(row) {
        const sceneId = row?.dataset.scene;
        if (!sceneId)
            return void ui.notifications.warn(L('LUMENN_FRAME.Warn.NeuralPreloadNoScene'));
        const preloads = this.#source.preloads;
        if (preloads.state(sceneId) === 'loading') preloads.cancel(sceneId);
        else preloads.start(sceneId);
    }
    async #enter(row) {
        const entry = this.#entryOf(row);
        if (!entry) return;
        this.#source.remember?.(entry.id);
        await this.close();
        await this.#source.enter(entry);
    }
    #onListClick(event) {
        const row = event.target.closest('.lf-hud-row');
        if (!row) return;
        if (event.target.closest('[data-lf-preload]')) return void this.#togglePreload(row);
        if (event.target.closest('[data-lf-enter]')) return void this.#enter(row);
        row.focus();
    }
    #rows() {
        return [...(this.element?.querySelectorAll('.lf-hud-row') ?? [])];
    }
    #onKey(event) {
        const input = this.element.querySelector('.lf-hud-search');
        const rows = this.#rows();
        const row = event.target.closest?.('.lf-hud-row');
        const index = row ? rows.indexOf(row) : -1;
        switch (event.key) {
            case 'Escape':
                event.preventDefault();
                event.stopPropagation();
                return void this.close();
            case 'ArrowDown':
            case 'ArrowUp': {
                if (!rows.length) return;
                event.preventDefault();
                const step = event.key === 'ArrowDown' ? 1 : -1;
                if (index === 0 && step < 0) return void input.focus();
                const next = index < 0 ? (step > 0 ? 0 : rows.length - 1) : index + step;
                return void rows[Math.max(0, Math.min(rows.length - 1, next))].focus();
            }
            case 'Enter':
                event.preventDefault();
                return void this.#enter(row ?? rows[0]);
            case 'p':
            case 'P':
                if (!row) return;
                event.preventDefault();
                return void this.#togglePreload(row);
        }
    }
}
