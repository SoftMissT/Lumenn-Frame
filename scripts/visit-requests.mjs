/**
 * Pedidos de visita (Neural Hive v3, Fase 4). Puro: sem Foundry, sem DOM.
 *
 * Fluxo de experiência, não controle de acesso: o core já entrega o documento da cena
 * a todo cliente. Aqui o jogador pede, o GM decide, e a visita abre só para quem pediu.
 */
export const VISIT_STATES = Object.freeze([
    'pending',
    'approved',
    'declined',
    'cancelled',
    'expired',
]);
export const VISIT_TTL_MS = 120_000;
const TRANSITIONS = {
    approve: 'approved',
    decline: 'declined',
    cancel: 'cancelled',
    expire: 'expired',
};
/** Só um pedido pendente muda de estado; os finais ficam como estão. */
export function nextVisitState(state, event) {
    if (state !== 'pending') return state;
    return TRANSITIONS[event] ?? state;
}
/**
 * Cenas que o GM liberou para visita: nós de cena com `data.visitable === true` e Scene existente.
 * Uma linha por cena, mesmo que ela apareça em vários storyboards.
 */
export function visitableDestinations(graphs, { sceneName = () => null } = {}) {
    const byScene = new Map();
    for (const graph of graphs ?? []) {
        for (const node of graph?.nodes ?? []) {
            if (node?.type !== 'scene' || node.data?.visitable !== true) continue;
            const sceneId = node.data?.sceneId;
            const name = sceneId ? sceneName(sceneId) : null;
            if (!sceneId || !name || byScene.has(sceneId)) continue;
            byScene.set(sceneId, {
                sceneId,
                name,
                graphId: graph.id,
                nodeId: node.id,
            });
        }
    }
    return [...byScene.values()].sort((a, b) =>
        a.name.localeCompare(b.name, undefined, {
            sensitivity: 'base',
        })
    );
}
/**
 * Valida um pedido recebido pelo GM. `senderId` vem do servidor, não do payload.
 * @returns {{ok: true} | {ok: false, reason: 'malformed'|'spoofed'|'gm-sender'|'forbidden'|'already-here'}}
 */
export function validateVisitRequest({
    payload,
    senderId,
    senderIsGM,
    allowedSceneIds,
    activeSceneId,
}) {
    if (!payload?.requestId || !payload?.sceneId || !payload?.userId)
        return {
            ok: false,
            reason: 'malformed',
        };
    if (!senderId || payload.userId !== senderId)
        return {
            ok: false,
            reason: 'spoofed',
        };
    if (senderIsGM)
        return {
            ok: false,
            reason: 'gm-sender',
        };
    if (!allowedSceneIds?.has?.(payload.sceneId))
        return {
            ok: false,
            reason: 'forbidden',
        };
    if (payload.sceneId === activeSceneId)
        return {
            ok: false,
            reason: 'already-here',
        };
    return {
        ok: true,
    };
}
/** Fila do GM: um pedido pendente por jogador; pedido novo cancela o anterior. */
export function createVisitQueue({ now = () => Date.now(), ttl: initialTtl = VISIT_TTL_MS } = {}) {
    let ttl = initialTtl;
    /** @type {Map<string, {id:string, userId:string, sceneId:string, state:string, createdAt:number, expiresAt:number}>} */
    const requests = new Map();
    const settle = (request, event) => {
        const state = nextVisitState(request.state, event);
        if (state === request.state) return null;
        request.state = state;
        return {
            ...request,
        };
    };
    return {
        ttl: () => ttl,
        /** Vale para pedidos novos; os que já estão na fila mantêm o prazo. */
        setTtl(ms) {
            if (Number.isFinite(ms) && ms > 0) ttl = ms;
        },
        add({ id, userId, sceneId }) {
            const replaced = [];
            for (const request of requests.values())
                if (request.userId === userId && request.state === 'pending') {
                    const done = settle(request, 'cancel');
                    if (done) replaced.push(done);
                }
            const at = now();
            const request = {
                id,
                userId,
                sceneId,
                state: 'pending',
                createdAt: at,
                expiresAt: at + ttl,
            };
            requests.set(id, request);
            return {
                request: {
                    ...request,
                },
                replaced,
            };
        },
        /** `cancel` só vale para o dono do pedido. */
        resolve(id, event, { byUserId = null } = {}) {
            const request = requests.get(id);
            if (!request) return null;
            if (event === 'cancel' && byUserId !== request.userId) return null;
            return settle(request, event);
        },
        expireDue() {
            const at = now();
            const expired = [];
            for (const request of requests.values())
                if (request.state === 'pending' && request.expiresAt <= at)
                    expired.push(settle(request, 'expire'));
            return expired.filter(Boolean);
        },
        pending() {
            return [...requests.values()]
                .filter((request) => request.state === 'pending')
                .sort((a, b) => a.createdAt - b.createdAt)
                .map((request) => ({
                    ...request,
                }));
        },
        get(id) {
            const request = requests.get(id);
            return request
                ? {
                      ...request,
                  }
                : null;
        },
    };
}
