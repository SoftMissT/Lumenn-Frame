/**
 * Áudio herdado pela Hive (puro). A música ligada ao nó `hive-ref` no pai vale para as
 * salas da Hive que não têm música própria. SFX é sempre local; música própria sempre vence.
 */

const hiveIdOf = (node) => node?.data?.graphId ?? node?.data?.hiveId ?? null;

/** O nó `hive-ref` que aponta para o grafo, com o grafo-pai onde ele mora. */
export function findHiveRef(graphs, graphId) {
    for (const parent of graphs ?? []) {
        if (!parent || parent.id === graphId) continue;
        const ref = (parent.nodes ?? []).find((node) => node?.type === 'hive-ref' && hiveIdOf(node) === graphId);
        if (ref) return { parent, ref };
    }
    return null;
}

const isMusic = (source) => source?.role !== 'sfx';

/**
 * Fontes efetivas do nó: as do próprio grafo; sem música, soma a música do nó da Hive no
 * pai (e, subindo, a do pai do pai). `audioSourcesIn(graph, nodeId)` devolve `[{role,...}]`.
 * `parentOf(graphId)` (opcional) diz por qual nó `hive-ref` entramos de fato (`{ graphId, nodeId }`);
 * sem ele, vale o primeiro `hive-ref` que aponta para a Hive.
 */
export function effectiveAudioSources({ graphs, graphId, nodeId, audioSourcesIn, parentOf }) {
    const byId = new Map((graphs ?? []).map((graph) => [graph?.id, graph]));
    const upFrom = (id) => {
        const hint = parentOf?.(id);
        const parent = hint ? byId.get(hint.graphId) : null;
        const ref = parent?.nodes?.find((node) => node?.id === hint.nodeId);
        return parent && ref ? { parent, ref } : findHiveRef(graphs, id);
    };
    const walk = (currentGraphId, currentNodeId, seen) => {
        const graph = byId.get(currentGraphId);
        const own = graph ? audioSourcesIn(graph, currentNodeId) ?? [] : [];
        if (own.some(isMusic) || seen.has(currentGraphId)) return own;
        const up = upFrom(currentGraphId);
        if (!up) return own;
        const nextSeen = new Set(seen).add(currentGraphId);
        const inherited = walk(up.parent.id, up.ref.id, nextSeen).filter(isMusic);
        return inherited.length ? [...inherited.slice(-1), ...own] : own;
    };
    return walk(graphId, nodeId, new Set());
}
