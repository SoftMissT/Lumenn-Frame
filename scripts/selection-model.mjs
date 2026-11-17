/**
 * Seleção múltipla do editor (puro: sem Foundry, sem DOM).
 * `primary` é o item que o Inspector mostra e sempre pertence a `ids`.
 * Toda operação devolve uma seleção nova; a anterior não muda.
 */

export function createSelection() {
    return { ids: new Set(), primary: null };
}

const make = (ids, primary) => {
    const set = new Set(ids);
    return { ids: set, primary: primary != null && set.has(primary) ? primary : ([...set].at(-1) ?? null) };
};

export const replace = (_sel, id) => (id == null ? createSelection() : make([id], id));

export function add(sel, id) {
    if (id == null) return make(sel.ids, sel.primary);
    return make([...sel.ids, id], id);
}

export function toggle(sel, id) {
    if (id == null) return make(sel.ids, sel.primary);
    if (!sel.ids.has(id)) return add(sel, id);
    const rest = [...sel.ids].filter((entry) => entry !== id);
    return make(rest, sel.primary === id ? rest.at(-1) : sel.primary);
}

export const clear = () => createSelection();

export function selectAll(_sel, ids) {
    const list = [...(ids ?? [])];
    return make(list, list.at(-1));
}

/** Clique em um nó: sem modificador substitui, Shift soma, Ctrl/Cmd alterna. */
export function applyClick(sel, id, { shiftKey = false, ctrlKey = false, metaKey = false } = {}) {
    if (ctrlKey || metaKey) return toggle(sel, id);
    if (shiftKey) return add(sel, id);
    return replace(sel, id);
}

/** Retângulo normalizado: o arrasto pode ir em qualquer direção. */
export function normalizeRect({ x1, y1, x2, y2 }) {
    return {
        left: Math.min(x1, x2),
        top: Math.min(y1, y2),
        right: Math.max(x1, x2),
        bottom: Math.max(y1, y2),
    };
}

/**
 * Ids dos nós cujo retângulo (no mundo) cruza o retângulo da seleção.
 * `sizeOf(node)` devolve `{ w, h }`; sem ele vale o tamanho gravado ou 0 (ponto).
 */
export function rectHits(nodes, rect, { sizeOf } = {}) {
    const box = normalizeRect(rect);
    const hits = [];
    for (const node of nodes ?? []) {
        const x = Number(node?.position?.x);
        const y = Number(node?.position?.y);
        if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
        const size = sizeOf?.(node) ?? { w: node?.size?.w ?? 0, h: node?.size?.h ?? 0 };
        const w = Number(size.w) || 0;
        const h = Number(size.h) || 0;
        if (x <= box.right && x + w >= box.left && y <= box.bottom && y + h >= box.top) hits.push(node.id);
    }
    return hits;
}

/** Tira da seleção o que sumiu do grafo. */
export function prune(sel, existingIds) {
    const alive = new Set(existingIds ?? []);
    const kept = [...sel.ids].filter((id) => alive.has(id));
    if (kept.length === sel.ids.size) return sel;
    return make(kept, alive.has(sel.primary) ? sel.primary : kept.at(-1));
}

/** Soma ou alterna o resultado do retângulo, conforme o modificador usado no arrasto. */
export function applyRect(sel, hitIds, { shiftKey = false, ctrlKey = false, metaKey = false } = {}) {
    if (ctrlKey || metaKey) return hitIds.reduce((acc, id) => toggle(acc, id), sel);
    if (shiftKey) return hitIds.reduce((acc, id) => add(acc, id), sel);
    return selectAll(sel, hitIds);
}
