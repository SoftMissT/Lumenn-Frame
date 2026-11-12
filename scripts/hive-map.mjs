/**
 * Modelo do "Ver Hive" (conceito, seção 02): o storyboard aberto visto como mapa.
 * Cada nó Hive do nível atual vira um cartão com os locais dentro, sub-hives e portas.
 * Puro: recebe o grafo e um leitor de grafos; não toca no Foundry.
 */

const MAX_PLACES = 4;

function countPorts(hive) {
    const ports = hive?.hive?.ports ?? [];
    return {
        entries: ports.filter((port) => port?.direction === 'entry').length,
        exits: ports.filter((port) => port?.direction === 'exit').length,
    };
}

/**
 * @param {object} graph storyboard aberto
 * @param {(id: string) => object|null} getGraph leitor de grafos (Hives referenciadas)
 * @param {(node: object) => string} nameOf nome legível de um nó de cena
 */
export function hiveMap(graph, getGraph, nameOf = (node) => node?.data?.title ?? node?.id ?? '') {
    const nodes = graph?.nodes ?? [];
    const hives = nodes
        .filter((node) => node?.type === 'hive-ref')
        .map((ref) => {
            const hive = getGraph(ref.data?.graphId);
            const inner = hive?.nodes ?? [];
            const scenes = inner.filter((node) => node?.type === 'scene');
            return {
                refId: ref.id,
                graphId: ref.data?.graphId ?? null,
                name: hive?.name ?? null,
                missing: !hive,
                places: scenes.slice(0, MAX_PLACES).map((node) => nameOf(node)),
                more: Math.max(0, scenes.length - MAX_PLACES),
                sceneCount: scenes.length,
                subHives: inner.filter((node) => node?.type === 'hive-ref').length,
                ...countPorts(hive),
            };
        });
    const ports = countPorts(graph);
    return {
        name: graph?.name ?? '',
        isHive: graph?.isHive === true,
        sceneCount: nodes.filter((node) => node?.type === 'scene').length,
        hiveCount: hives.length,
        ...ports,
        hives,
    };
}
