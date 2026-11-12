/**
 * Modelo puro do HUD de Destinos: agrupa por grafo, filtra por tipo e busca.
 * Não toca em Foundry nem em DOM; o HUD só desenha o que sai daqui.
 */
export const HUD_FILTERS = Object.freeze(['all', 'scene', 'hive', 'audio', 'other']);
const HIVE_KINDS = new Set([
    'hive',
    'mini-hive',
    'hive-ref',
    'storyboard',
    'universe',
    'planet',
    'country',
    'group',
]);
/** Em qual filtro um `kind` de destino cai. */
export function filterOfKind(kind) {
    if (kind === 'scene') return 'scene';
    if (kind === 'audio') return 'audio';
    if (HIVE_KINDS.has(kind)) return 'hive';
    return 'other';
}
const identity = (value) => String(value ?? '').toLowerCase();
/** Ordem dos grupos no HUD: onde estou, o que está dentro, o que está acima, ao lado, o resto. */
export const RELATION_ORDER = Object.freeze({ here: 0, child: 1, parent: 2, sibling: 3, other: 4 });
export const RECENT_MAX = 5;
/**
 * Parentesco de cada grafo com o atual, pelos `hive-ref`: here, parent, child, sibling.
 * Grafo sem relação fica de fora (o modelo trata como `other`).
 * @param {Array<object>} graphs
 * @param {string|null} currentId
 * @param {(graphs: Array<object>, id: string) => string|null} parentOf
 */
export function graphRelations(graphs, currentId, parentOf) {
    const relations = new Map();
    if (!currentId || typeof parentOf !== 'function') return relations;
    relations.set(currentId, 'here');
    const parent = parentOf(graphs, currentId);
    if (parent) relations.set(parent, 'parent');
    for (const graph of graphs ?? []) {
        if (!graph?.id || relations.has(graph.id)) continue;
        const itsParent = parentOf(graphs, graph.id);
        if (itsParent === currentId) relations.set(graph.id, 'child');
        else if (parent && itsParent === parent) relations.set(graph.id, 'sibling');
    }
    return relations;
}
/** Recentes: o último vai para a frente, sem repetir, com teto. Puro: devolve lista nova. */
export function pushRecent(list, id, max = RECENT_MAX) {
    if (!id) return [...(list ?? [])].slice(0, max);
    return [id, ...(list ?? []).filter((item) => item !== id)].slice(0, max);
}
/**
 * @param {Array<{id:string, graphId:string, nodeId:string|null, name:string, address:string, kind:string}>} entries
 * @param {object} [options]
 * @param {string} [options.query]           Texto da busca.
 * @param {string} [options.filter]          Um de HUD_FILTERS.
 * @param {string|null} [options.currentGraphId]
 * @param {string} [options.currentTitle]    Nome do grafo atual (a entrada dele sai da lista).
 * @param {string} [options.currentAddress]
 * @param {(value: string) => string} [options.normalize]
 * @param {Map<string, string>} [options.relations]  De `graphRelations`.
 * @param {Array<string>} [options.recentIds]        Ids dos destinos recentes, mais novo primeiro.
 */
export function buildHudModel(
    entries,
    {
        query = '',
        filter = 'all',
        currentGraphId = null,
        currentTitle = '',
        currentAddress = '',
        normalize = identity,
        relations = null,
        recentIds = [],
    } = {}
) {
    const wanted = HUD_FILTERS.includes(filter) ? filter : 'all';
    // Palavras soltas: todas precisam aparecer, em qualquer ordem ("hive sala 2").
    const tokens = normalize(query)
        .split(/[\s/]+/)
        .filter(Boolean);
    const matches = (entry) => {
        if (!tokens.length) return true;
        const haystack = normalize(`${entry.name} ${entry.address}`);
        return tokens.every((token) => haystack.includes(token));
    };
    const counts = Object.fromEntries(HUD_FILTERS.map((key) => [key, 0]));
    const groups = new Map();
    const groupOf = (graphId) => {
        if (!groups.has(graphId))
            groups.set(graphId, {
                graphId,
                title: graphId === currentGraphId ? currentTitle : '',
                address: graphId === currentGraphId ? currentAddress : '',
                entry: null,
                isCurrent: graphId === currentGraphId,
                items: [],
            });
        return groups.get(graphId);
    };
    // 1ª passada: título/endereço de cada grupo vem da entrada do próprio grafo.
    for (const entry of entries ?? []) {
        if (!entry?.graphId || entry.nodeId !== null) continue;
        const group = groupOf(entry.graphId);
        group.title = entry.name;
        group.address = entry.address;
    }
    // 2ª passada: busca e filtro. Contagens ignoram o filtro, respeitam a busca.
    for (const entry of entries ?? []) {
        if (!entry?.graphId) continue;
        const kindFilter = filterOfKind(entry.kind);
        if (!matches(entry)) continue;
        counts[kindFilter]++;
        counts.all++;
        if (wanted !== 'all' && kindFilter !== wanted) continue;
        const group = groupOf(entry.graphId);
        if (entry.nodeId === null) group.entry = entry;
        else
            group.items.push({
                ...entry,
                filter: kindFilter,
            });
    }
    const list = [...groups.values()]
        .filter((group) => group.entry || group.items.length)
        .map((group) => ({
            ...group,
            title: group.title || group.graphId,
            relation: group.isCurrent ? 'here' : (relations?.get(group.graphId) ?? 'other'),
        }))
        .sort(
            (a, b) =>
                RELATION_ORDER[a.relation] - RELATION_ORDER[b.relation] ||
                a.address.localeCompare(b.address, undefined, {
                    sensitivity: 'base',
                })
        );
    const total = list.reduce((sum, group) => sum + group.items.length + (group.entry ? 1 : 0), 0);
    // Recentes respeitam busca e filtro; destino que sumiu do índice some daqui também.
    const recent = [];
    for (const id of recentIds ?? []) {
        const entry = (entries ?? []).find((candidate) => candidate?.id === id);
        if (!entry || !matches(entry)) continue;
        if (wanted !== 'all' && filterOfKind(entry.kind) !== wanted) continue;
        recent.push(entry);
        if (recent.length >= RECENT_MAX) break;
    }
    return {
        groups: list,
        recent,
        counts,
        total,
        filter: wanted,
    };
}
/** Endereço só vale a pena mostrar quando foge do padrão "grupo / nome". */
export function secondaryAddress(entry, groupAddress) {
    const expected = [groupAddress, entry?.name].filter(Boolean).join(' / ');
    return entry?.address && entry.address !== expected ? entry.address : '';
}
