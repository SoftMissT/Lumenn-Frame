import {
    anchorOf,
    buildAddressIndex,
    graphAddress,
    graphKind,
    listDestinations,
    parentGraphId,
    rootGraphId,
} from './neural-address.mjs';
/** Chave de contagem por tipo de nó: o que o GM chama de "célula". */
function cellKey(type) {
    if (type === 'scene' || type === 'audio' || type === 'note' || type === 'group') return type;
    if (type === 'hive-ref') return 'hive';
    if (type === 'encounter') return 'encounter';
    return 'other';
}
/** Trilha de ancestrais (raiz → grafo atual), pelos `hive-ref`. Ciclo para sem repetir. */
export function ancestorChain(graphs, graphId) {
    const chain = [];
    const seen = new Set();
    let id = graphId;
    while (id && !seen.has(id)) {
        seen.add(id);
        const graph = (graphs ?? []).find((candidate) => candidate?.id === id);
        if (!graph) break;
        chain.unshift({
            graphId: graph.id,
            name: String(graph.name ?? graph.id),
        });
        id = parentGraphId(graphs, id);
    }
    return chain;
}
/**
 * Painel "Onde estou": o que o GM precisa saber sem escolher origem à mão.
 * Células = nós; sinapses = ligações; membranas = portas da Hive.
 *
 * @param {Array<object>} graphs
 * @param {string} graphId
 * @param {object} [options]
 * @param {(node: object, graph: object) => string} [options.labelOf]
 */
export function buildNeuralContext(graphs, graphId, { labelOf } = {}) {
    const graph = (graphs ?? []).find((candidate) => candidate?.id === graphId);
    if (!graph)
        return {
            found: false,
            graphId,
        };
    const nodes = graph.nodes ?? [];
    const edges = graph.edges ?? [];
    const cells = {
        scene: 0,
        audio: 0,
        note: 0,
        hive: 0,
        group: 0,
        encounter: 0,
        other: 0,
    };
    for (const node of nodes) cells[cellKey(node?.type)]++;
    const links = {
        flow: 0,
        audio: 0,
    };
    for (const edge of edges)
        if (edge?.type === 'audio') links.audio++;
        else links.flow++;
    const ports = {
        entry: 0,
        exit: 0,
    };
    for (const port of graph.hive?.ports ?? []) {
        if (port?.direction === 'exit') ports.exit++;
        else ports.entry++;
    }
    const anchor = (kind) => {
        const found = anchorOf(graphs, graphId, kind);
        const nodeId = found.status === 'found' ? found.nodeId : null;
        const rootId = rootGraphId(graphs, graphId);
        const root = (graphs ?? []).find((candidate) => candidate?.id === rootId);
        const node = (root?.nodes ?? []).find((candidate) => candidate?.id === nodeId);
        return {
            status: found.status,
            nodeId,
            graphId: found.graphId,
            name: node ? String(labelOf?.(node, root) ?? node.data?.title ?? node.id) : '',
            here: !!nodeId && found.graphId === graphId,
        };
    };
    const index = buildAddressIndex(
        graphs,
        labelOf
            ? {
                  labelOf,
              }
            : undefined
    );
    // Destinos = tudo o que o GM pode saltar a partir daqui, menos o próprio grafo.
    const destinations = listDestinations(index, {
        excludeGraphId: graphId,
    }).filter((entry) => !(entry.graphId === graphId && entry.nodeId === null)).length;
    const outgoing = (graph.activeNodeId ? edges : [])
        .filter((edge) => edge?.from === graph.activeNodeId)
        .map((edge) => {
            const target = nodes.find((node) => node?.id === edge.to);
            return target
                ? {
                      edgeId: edge.id,
                      nodeId: target.id,
                      type: edge.type === 'audio' ? 'audio' : 'flow',
                      name: String(labelOf?.(target, graph) ?? target.data?.title ?? target.id),
                  }
                : null;
        })
        .filter(Boolean);
    return {
        found: true,
        graphId,
        name: String(graph.name ?? graph.id),
        kind: graphKind(graph),
        address: graphAddress(graphs, graphId),
        crumbs: ancestorChain(graphs, graphId),
        cells: {
            ...cells,
            total: nodes.length,
        },
        links: {
            ...links,
            total: edges.length,
        },
        ports,
        anchors: {
            intro: anchor('intro'),
            output: anchor('output'),
        },
        destinations,
        outgoing,
    };
}
