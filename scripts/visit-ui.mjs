import { LumennGraphStore } from './graph-store.mjs';
import { LumennCompat } from './foundry-compat.mjs';
import {
    createVisitQueue,
    validateVisitRequest,
    visitableDestinations,
    VISIT_TTL_MS,
} from './visit-requests.mjs';
const L = (key) => game.i18n.localize(key);
const F = (key, data) => game.i18n.format(key, data);
const esc = (value) => foundry.utils.escapeHTML(String(value ?? ''));
const ApplicationV2 = () => foundry.applications.api.ApplicationV2;
/** Estado do módulo de visitas neste cliente. */
const visits = {
    queue: createVisitQueue(),
    /** Pedido do próprio jogador: { requestId, sceneId, state }. */
    mine: null,
    picker: null,
    preview: null,
    queueWindow: null,
    timer: null,
    playerTimer: null,
};
export function visitDestinations() {
    return visitableDestinations(LumennGraphStore.getAll(), {
        sceneName: (id) => game.scenes.get(id)?.name ?? null,
    });
}
const sendResult = (request, extra = {}) =>
    LumennCompat.socketEmit(
        {
            type: 'visit:result',
            requestId: request.id,
            targetUserId: request.userId,
            sceneId: request.sceneId,
            state: request.state,
            ...extra,
        },
        {
            recipients: [request.userId],
        }
    );
/* ---------------------------------- GM ---------------------------------- */
/** Só o GM ativo processa pedidos: com 2 GMs, ninguém responde em dobro. */
const isDesignatedGM = () => LumennCompat.isGM() && game.user === game.users.activeGM;

function refreshQueueWindow() {
    if (!visits.queue.pending().length) {
        visits.queueWindow?.close();
        return;
    }
    if (visits.queueWindow?.rendered) return void visits.queueWindow.render();
    visits.queueWindow = new LumennVisitQueueWindow();
    visits.queueWindow.render({
        force: true,
    });
}

function resolveAsGM(id, event) {
    const request = visits.queue.resolve(id, event);
    if (!request) return;
    sendResult(request);
    refreshQueueWindow();
}
export class LumennVisitQueueWindow extends ApplicationV2() {
    static DEFAULT_OPTIONS = {
        id: 'lumenn-visit-queue',
        classes: ['lumenn-frame', 'lf-visit-dialog', 'lf-visit-queue'],
        window: {
            icon: 'fa-solid fa-door-open',
            minimizable: true,
        },
        position: {
            width: 400,
            height: 'auto',
            top: 90,
            left: 24,
        },
    };
    get title() {
        return L('LUMENN_FRAME.Visit.QueueTitle');
    }
    async _renderHTML() {
        const root = document.createElement('div');
        root.className = 'lf-visit';
        root.innerHTML = `<ul class="lf-visit-list">${visits.queue
            .pending()
            .map((request) => {
                const user = game.users.get(request.userId);
                const scene = game.scenes.get(request.sceneId);
                return `<li data-request="${esc(request.id)}">
					<span class="lf-visit-who"><b>${esc(user?.name ?? request.userId)}</b><i class="fa-solid fa-arrow-right" aria-hidden="true"></i><span>${esc(scene?.name ?? request.sceneId)}</span></span>
					<span class="lf-visit-actions">
						<button type="button" class="lf-visit-approve" data-approve><i class="fa-solid fa-check" aria-hidden="true"></i><span>${esc(L('LUMENN_FRAME.Visit.Approve'))}</span></button>
						<button type="button" class="lf-visit-decline" data-decline><i class="fa-solid fa-xmark" aria-hidden="true"></i><span>${esc(L('LUMENN_FRAME.Visit.Decline'))}</span></button>
					</span></li>`;
            })
            .join('')}</ul>`;
        return root;
    }
    _replaceHTML(result, content) {
        content.replaceChildren(result);
    }
    async _onRender(context, options) {
        await super._onRender(context, options);
        this.element.querySelector('.lf-visit-list')?.addEventListener('click', (event) => {
            const row = event.target.closest('li[data-request]');
            if (!row) return;
            if (event.target.closest('[data-approve]')) resolveAsGM(row.dataset.request, 'approve');
            else if (event.target.closest('[data-decline]'))
                resolveAsGM(row.dataset.request, 'decline');
        });
    }
}

function handleRequestAsGM(payload, senderId) {
    if (!isDesignatedGM()) return;
    const verdict = validateVisitRequest({
        payload,
        senderId,
        senderIsGM: !!game.users.get(senderId)?.isGM,
        allowedSceneIds: new Set(visitDestinations().map((destination) => destination.sceneId)),
        activeSceneId: game.scenes.active?.id ?? null,
    });
    if (!verdict.ok) {
        // Só responde a quem tem pedido legítimo; forjado em nome de outro é descartado em silêncio.
        if (verdict.reason === 'forbidden' || verdict.reason === 'already-here')
            sendResult(
                {
                    id: payload.requestId,
                    userId: senderId,
                    sceneId: payload.sceneId,
                    state: 'declined',
                },
                {
                    reason: verdict.reason,
                }
            );
        return;
    }
    const { request, replaced } = visits.queue.add({
        id: payload.requestId,
        userId: senderId,
        sceneId: payload.sceneId,
    });
    for (const old of replaced) sendResult(old);
    ui.notifications.info(
        F('LUMENN_FRAME.Visit.GMRequest', {
            user: game.users.get(senderId)?.name ?? senderId,
            scene: game.scenes.get(request.sceneId)?.name ?? request.sceneId,
        })
    );
    refreshQueueWindow();
}

function handleCancelAsGM(payload, senderId) {
    if (!isDesignatedGM()) return;
    if (
        visits.queue.resolve(payload?.requestId, 'cancel', {
            byUserId: senderId,
        })
    )
        refreshQueueWindow();
}
/* -------------------------------- Jogador -------------------------------- */
export class LumennVisitPreview extends ApplicationV2() {
    static DEFAULT_OPTIONS = {
        id: 'lumenn-visit-preview',
        classes: ['lumenn-frame', 'lf-visit-dialog', 'lf-visit-preview'],
        window: {
            icon: 'fa-solid fa-eye',
            resizable: true,
        },
        position: {
            width: 760,
            height: 520,
        },
    };
    #sceneId;
    constructor(sceneId, options = {}) {
        super(options);
        this.#sceneId = sceneId;
    }
    get title() {
        return game.scenes.get(this.#sceneId)?.name ?? L('LUMENN_FRAME.Visit.PreviewTitle');
    }
    async _renderHTML() {
        const scene = game.scenes.get(this.#sceneId);
        const src = LumennCompat.sceneBackgroundSrc(scene) || scene?.thumbnail || '';
        const root = document.createElement('div');
        root.className = 'lf-visit lf-visit-stage';
        root.innerHTML = `
			<p class="lf-visit-banner"><i class="fa-solid fa-eye" aria-hidden="true"></i><span>${esc(L('LUMENN_FRAME.Visit.PrivateBanner'))}</span></p>
			<div class="lf-visit-art">${src ? `<img src="${esc(src)}" alt="${esc(scene?.name)}" draggable="false">` : `<span class="lf-visit-noart"><i class="fa-solid fa-image-slash" aria-hidden="true"></i>${esc(L('LUMENN_FRAME.Visit.NoArt'))}</span>`}</div>
			<footer><button type="button" class="lf-visit-back" data-back><i class="fa-solid fa-arrow-rotate-left" aria-hidden="true"></i><span>${esc(L('LUMENN_FRAME.Visit.Back'))}</span></button></footer>`;
        return root;
    }
    _replaceHTML(result, content) {
        content.replaceChildren(result);
    }
    async _onRender(context, options) {
        await super._onRender(context, options);
        this.element.querySelector('[data-back]')?.addEventListener('click', () => this.close());
        this.element.querySelector('img')?.addEventListener(
            'error',
            (event) => {
                event.target.replaceWith(
                    Object.assign(document.createElement('span'), {
                        className: 'lf-visit-noart',
                        textContent: L('LUMENN_FRAME.Visit.NoArt'),
                    })
                );
            },
            {
                once: true,
            }
        );
    }
    _onClose(options) {
        super._onClose(options);
        if (visits.preview === this) visits.preview = null;
    }
}
export class LumennVisitPicker extends ApplicationV2() {
    static DEFAULT_OPTIONS = {
        id: 'lumenn-visit-picker',
        classes: ['lumenn-frame', 'lf-visit-dialog'],
        window: {
            icon: 'fa-solid fa-door-open',
        },
        position: {
            width: 420,
            height: 'auto',
        },
    };
    get title() {
        return L('LUMENN_FRAME.Visit.PickerTitle');
    }
    async _renderHTML() {
        const list = visitDestinations();
        const mine = visits.mine;
        const hasGM = !!game.users.activeGM;
        const status = !hasGM
            ? L('LUMENN_FRAME.Visit.NoGM')
            : mine?.state === 'pending'
              ? F('LUMENN_FRAME.Visit.Waiting', {
                    scene: game.scenes.get(mine.sceneId)?.name ?? '',
                })
              : mine && mine.state !== 'approved'
                ? L(`LUMENN_FRAME.Visit.Result.${mine.state}`)
                : '';
        const root = document.createElement('div');
        root.className = 'lf-visit';
        root.innerHTML = `
			<p class="lf-visit-hint">${esc(L('LUMENN_FRAME.Visit.PickerHint'))}</p>
			<p class="lf-visit-status" role="status" aria-live="polite">${esc(status)}</p>
			<ul class="lf-visit-list">${
                list.length
                    ? list
                          .map(
                              (
                                  destination
                              ) => `<li data-scene="${esc(destination.sceneId)}"${mine?.state === 'pending' && mine.sceneId === destination.sceneId ? ' class="is-waiting"' : ''}>
					<span class="lf-visit-who"><i class="fa-solid fa-image" aria-hidden="true"></i><b>${esc(destination.name)}</b></span>
					<span class="lf-visit-actions"><button type="button" data-ask${!hasGM || mine?.state === 'pending' ? ' disabled' : ''}><span>${esc(L('LUMENN_FRAME.Visit.Ask'))}</span></button></span></li>`
                          )
                          .join('')
                    : `<li class="lf-visit-empty">${esc(L('LUMENN_FRAME.Visit.NoneVisitable'))}</li>`
            }</ul>
			${mine?.state === 'pending' ? `<footer><button type="button" class="lf-visit-cancel" data-cancel>${esc(L('LUMENN_FRAME.Visit.Cancel'))}</button></footer>` : ''}`;
        return root;
    }
    _replaceHTML(result, content) {
        content.replaceChildren(result);
    }
    async _onRender(context, options) {
        await super._onRender(context, options);
        this.element.addEventListener('click', (event) => {
            const ask = event.target.closest('[data-ask]');
            if (ask) return void requestVisit(ask.closest('li[data-scene]').dataset.scene);
            if (event.target.closest('[data-cancel]')) cancelMyVisit();
        });
    }
    _onClose(options) {
        super._onClose(options);
        if (visits.picker === this) visits.picker = null;
    }
}
export function openVisitPicker() {
    if (LumennCompat.isGM()) return;
    if (visits.picker?.rendered) return void visits.picker.bringToFront();
    visits.picker = new LumennVisitPicker();
    visits.picker.render({
        force: true,
    });
}
const repaintPicker = () => visits.picker?.rendered && visits.picker.render();
export function requestVisit(sceneId) {
    if (LumennCompat.isGM() || !game.users.activeGM || visits.mine?.state === 'pending')
        return false;
    const requestId = foundry.utils.randomID();
    visits.mine = {
        requestId,
        sceneId,
        state: 'pending',
    };
    clearTimeout(visits.playerTimer);
    // Rede de segurança: se o GM sumir sem responder, o pedido não fica pendente para sempre.
    visits.playerTimer = setTimeout(() => {
        if (visits.mine?.requestId !== requestId || visits.mine.state !== 'pending') return;
        visits.mine.state = 'expired';
        repaintPicker();
    }, visits.queue.ttl() + 5000);
    LumennCompat.socketEmit({
        type: 'visit:request',
        requestId,
        userId: game.user.id,
        sceneId,
    });
    repaintPicker();
    return true;
}
export function cancelMyVisit() {
    const mine = visits.mine;
    if (mine?.state !== 'pending') return;
    mine.state = 'cancelled';
    LumennCompat.socketEmit({
        type: 'visit:cancel',
        requestId: mine.requestId,
    });
    repaintPicker();
}

function handleResultAsPlayer(payload, senderId) {
    // Só um GM pode decidir, e só para mim.
    if (!game.users.get(senderId)?.isGM || payload.targetUserId !== game.user.id) return;
    if (visits.mine?.requestId !== payload.requestId || visits.mine.state !== 'pending') return;
    visits.mine.state = payload.state;
    repaintPicker();
    if (payload.state === 'approved' && game.scenes.get(payload.sceneId)) {
        visits.preview?.close();
        visits.preview = new LumennVisitPreview(payload.sceneId);
        visits.preview.render({
            force: true,
        });
        ui.notifications.info(
            F('LUMENN_FRAME.Visit.Approved', {
                scene: game.scenes.get(payload.sceneId).name,
            })
        );
    } else if (payload.state !== 'approved') {
        ui.notifications.warn(L(`LUMENN_FRAME.Visit.Result.${payload.state}`));
    }
}
/* ------------------------------- Roteamento ------------------------------- */
/** Chamado pelo socket do módulo para todo `visit:*`. `senderId` vem do servidor. */
export function handleVisitMessage(payload, senderId) {
    switch (payload?.type) {
        case 'visit:request':
            return handleRequestAsGM(payload, senderId);
        case 'visit:cancel':
            return handleCancelAsGM(payload, senderId);
        case 'visit:result':
            if (!LumennCompat.isGM()) return handleResultAsPlayer(payload, senderId);
    }
}
export function registerVisits() {
    // O GM ativa outra cena: a visita privada acaba para todos, o jogador segue a mesa.
    Hooks.on('updateScene', (scene, changes) => {
        if (changes?.active === true && visits.preview) visits.preview.close();
    });
    clearInterval(visits.timer);
    if (!LumennCompat.isGM()) return;
    visits.timer = setInterval(() => {
        if (!isDesignatedGM()) return;
        const expired = visits.queue.expireDue();
        if (!expired.length) return;
        for (const request of expired) sendResult(request);
        refreshQueueWindow();
    }, 5000);
}
export const LumennVisits = {
    state: visits,
    destinations: visitDestinations,
    request: requestVisit,
    cancel: cancelMyVisit,
    openPicker: openVisitPicker,
    handle: handleVisitMessage,
    ttl: VISIT_TTL_MS,
};
