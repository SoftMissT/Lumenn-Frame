/**
 * Ligação de fluxo é ida e volta (blueprint Neural Hive v3): A → B gravada uma vez
 * também leva de B para A, com a mesma transição. Áudio continua de mão única.
 * Puro: sem Foundry.
 */

/**
 * A ligação usada para ir de `from` até `to`: a gravada nesse sentido; senão, a de
 * fluxo gravada no sentido contrário. `types` filtra o sentido direto.
 * @returns {object|null}
 */
export function linkBetween(edges, from, to, { types = ['flow'] } = {}) {
    if (!from || !to || from === to) return null;
    const list = edges ?? [];
    return (
        list.find((edge) => types.includes(edge?.type) && edge.from === from && edge.to === to) ??
        list.find((edge) => edge?.type === 'flow' && edge.from === to && edge.to === from) ??
        null
    );
}

/** Vizinhos alcançáveis a partir de `nodeId`: saídas diretas dos `types` + fluxo no contrário. */
export function linkedFrom(edges, nodeId, { types = ['flow', 'audio'] } = {}) {
    const set = new Set();
    if (!nodeId) return set;
    for (const edge of edges ?? []) {
        if (types.includes(edge?.type) && edge.from === nodeId && edge.to) set.add(edge.to);
        if (edge?.type === 'flow' && edge.to === nodeId && edge.from) set.add(edge.from);
    }
    set.delete(nodeId);
    return set;
}
