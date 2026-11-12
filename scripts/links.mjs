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
    // Volta gravada em dobro (dado antigo) não vale: a ligação que o mestre vê e edita
    // é a mesma nos dois sentidos (lição 23: a interface não pode mentir sobre o clique).
    const twins = flowTwins(edges);
    const list = (edges ?? []).filter((edge) => !twins.has(edge?.id));
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

/**
 * Ligações de fluxo gravadas em dobro (A → B e B → A, de antes da 0.1.0). Para cada par,
 * a primeira gravada vale; a outra é a "gêmea" que o editor esconde e o Inspector unifica.
 * @returns {Map<string, string>} id da gêmea escondida → id da ligação que fica
 */
export function flowTwins(edges) {
    const twins = new Map();
    const seen = new Map();
    for (const edge of edges ?? []) {
        if (edge?.type !== 'flow' || !edge.from || !edge.to) continue;
        const keeper = seen.get(`${edge.to}>${edge.from}`);
        if (keeper && !twins.has(keeper)) twins.set(edge.id, keeper);
        else seen.set(`${edge.from}>${edge.to}`, edge.id);
    }
    return twins;
}

/** A ligação de fluxo já gravada no sentido contrário de `from → to`, ou null. */
export function reverseFlow(edges, from, to) {
    return (edges ?? []).find((edge) => edge?.type === 'flow' && edge.from === to && edge.to === from) ?? null;
}