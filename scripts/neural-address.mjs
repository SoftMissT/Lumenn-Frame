import { hiveEntryPort } from './hive-io.mjs';
/**
 * Endereço neural e salto direto. Sem Foundry: entra dado, sai dado.
 * A hierarquia (universo/planeta/país/hive) organiza o endereço; nunca é caminho
 * obrigatório. O resolver acha o destino pelo id ou pelo endereço humano e não
 * cria link, não muda cena e não altera portas.
 */
const ANCHOR_KINDS = new Set(['intro', 'output']);
/** Caixa, acento e espaço não separam dois endereços iguais. */
export function normalizeAddress(value) {
    return String(value ?? '')
        .normalize('NFKD')
        .replace(/[\u0300-\u036f]/g, '')
        .split('/')
        .map((part) => part.trim().replace(/\s+/g, ' '))
        .filter(Boolean)
        .join('/')
        .toLowerCase();
}
/** Rótulo de reserva: o resolvido usa `data.title` porque cena/áudio exigem o mundo. */
function defaultLabel(node) {
    const data = node?.data ?? {};
    return String(data.title || data.sceneName || data.pendingName || node?.id || '');
}
/** Tipo do grafo: o gravado manda; Hive marcada continua `hive`; o resto é storyboard. */
export function graphKind(graph) {
    const kind = typeof graph?.kind === 'string' ? graph.kind.trim() : '';
    if (kind) return kind;
    return graph?.isHive === true ? 'hive' : 'storyboard';
}
/** Grafo pai: o primeiro pai que contém um `hive-ref` para este grafo. */
export function parentGraphId(graphs, graphId) {
    if (!graphId || !(graphs ?? []).some((graph) => graph?.id === graphId)) return null;
    const parent = (graphs ?? []).find(
        (graph) =>
            graph?.id !== graphId &&
            (graph.nodes ?? []).some(
                (node) => node?.type === 'hive-ref' && node?.data?.graphId === graphId
            )
    );
    return parent?.id ?? null;
}
/** Sobe por `hive-ref` até a raiz. Ciclo devolve null em vez de girar. */
export function rootGraphId(graphs, graphId) {
    let id = graphId;
    const seen = new Set();
    while (id) {
        if (seen.has(id)) return null;
        seen.add(id);
        const parent = parentGraphId(graphs, id);
        if (!parent) return id;
        id = parent;
    }
    return null;
}
/** Endereço do grafo: o gravado ou o nome; sem endereço, o nome do pai vem antes. */
export function graphAddress(graphs, graphId, seen = new Set()) {
    const graph = (graphs ?? []).find((candidate) => candidate?.id === graphId);
    if (!graph) return '';
    const own = String(graph.address ?? '').trim();
    if (own) return own;
    const name = String(graph.name ?? graph.id ?? '').trim();
    if (seen.has(graphId)) return name;
    seen.add(graphId);
    const parent = parentGraphId(graphs, graph.id);
    if (!parent) return name;
    const parentAddress = graphAddress(graphs, parent, seen);
    return parentAddress && name ? `${parentAddress} / ${name}` : parentAddress || name;
}
/**
 * Índice achatado de destinos: uma entrada por grafo e uma por nó.
 * `id` é o id do grafo ou do nó; `graphId` e `nodeId` dizem onde ele mora.
 * Endereço duplicado não apaga ninguém: a primeira entrada vence e a repetida
 * vem marcada com `duplicate: true` para a interface avisar.
 */
export function buildAddressIndex(graphs, { labelOf = defaultLabel } = {}) {
    const entries = [];
    const ids = new Set();
    const addresses = new Set();
    const push = (entry) => {
        const duplicate = ids.has(entry.id) || addresses.has(normalizeAddress(entry.address));
        ids.add(entry.id);
        addresses.add(normalizeAddress(entry.address));
        entries.push(
            duplicate
                ? {
                      ...entry,
                      duplicate: true,
                  }
                : entry
        );
    };
    for (const graph of graphs ?? []) {
        if (!graph?.id) continue;
        const address = graphAddress(graphs, graph.id);
        push({
            id: graph.id,
            graphId: graph.id,
            nodeId: null,
            address,
            kind: graphKind(graph),
            name: String(graph.name ?? graph.id),
        });
        for (const node of graph.nodes ?? []) {
            if (!node?.id) continue;
            const name = String(labelOf(node, graph) ?? node.id);
            const nodeAddress = String(node.address ?? '').trim();
            push({
                id: node.id,
                graphId: graph.id,
                nodeId: node.id,
                address: nodeAddress || [address, name].filter(Boolean).join(' / '),
                kind: String(node.type ?? 'node'),
                name,
            });
        }
    }
    return entries;
}
/** Acha por id (sempre) ou por endereço normalizado. Nunca avalia texto. */
export function resolveAddress(index, addressOrId) {
    const value = String(addressOrId ?? '').trim();
    if (!value)
        return {
            status: 'not-found',
            address: value,
        };
    const byId = (index ?? []).find((entry) => entry?.id === value);
    const match =
        byId ??
        (index ?? []).find((entry) => normalizeAddress(entry?.address) === normalizeAddress(value));
    if (!match)
        return {
            status: 'not-found',
            address: value,
        };
    return {
        status: 'found',
        id: match.id,
        graphId: match.graphId,
        nodeId: match.nodeId,
        address: match.address,
        kind: match.kind,
        name: match.name,
        duplicate: match.duplicate === true,
    };
}
/** Lista para o HUD. O grafo atual sai da lista; os nós dele ficam (locais internos). */
export function listDestinations(index, { excludeGraphId = null } = {}) {
    return (index ?? []).filter(
        (entry) => !(excludeGraphId && entry?.graphId === excludeGraphId && entry?.nodeId === null)
    );
}
/** Âncora da campanha: mora na raiz, mesmo quando o grafo atual é uma Hive. */
export function anchorOf(graphs, graphId, kind) {
    if (!ANCHOR_KINDS.has(kind))
        return {
            status: 'invalid',
            graphId: null,
            nodeId: null,
        };
    const rootId = rootGraphId(graphs, graphId);
    const root = (graphs ?? []).find((graph) => graph?.id === rootId);
    const nodeId = root?.anchors?.[kind] ?? null;
    if (!nodeId)
        return {
            status: 'not-set',
            graphId: rootId,
            nodeId: null,
        };
    if (!(root.nodes ?? []).some((node) => node?.id === nodeId))
        return {
            status: 'not-found',
            graphId: rootId,
            nodeId,
        };
    return {
        status: 'found',
        graphId: rootId,
        nodeId,
    };
}
/**
 * Destino efetivo de um salto. `hive-ref` entra pela porta de entrada da Hive;
 * grafo sem nó cai no nó ativo (ou na primeira cena). Devolve só o destino
 * final: nenhum nó intermediário existe no plano.
 */
export function planJump(graphs, graphId, nodeId = null) {
    const list = graphs ?? [];
    const graph = list.find((candidate) => candidate?.id === graphId);
    if (!graph)
        return {
            status: 'not-found',
            graphId,
            nodeId,
        };
    if (!nodeId) {
        const active = (graph.nodes ?? []).find((node) => node?.id === graph.activeNodeId);
        const landing =
            active ??
            (graph.nodes ?? []).find((node) => node?.type === 'scene') ??
            (graph.nodes ?? [])[0] ??
            null;
        if (!landing)
            return {
                status: 'empty',
                graphId,
            };
        return {
            status: 'found',
            graphId,
            nodeId: landing.id,
            kind: landing.type,
            via: 'graph',
        };
    }
    const node = (graph.nodes ?? []).find((candidate) => candidate?.id === nodeId);
    if (!node)
        return {
            status: 'not-found',
            graphId,
            nodeId,
        };
    if (node.type !== 'hive-ref')
        return {
            status: 'found',
            graphId,
            nodeId,
            kind: node.type,
            via: 'node',
        };
    const hive = list.find((candidate) => candidate?.id === node.data?.graphId);
    if (!hive?.isHive)
        return {
            status: 'missing-hive',
            graphId,
            nodeId,
            reason: hive ? 'not-hive' : 'missing',
        };
    const port = hiveEntryPort(hive, node.data?.portId);
    if (!port?.node)
        return {
            status: 'no-entry',
            graphId,
            nodeId,
            hiveId: hive.id,
        };
    return {
        status: 'found',
        graphId: hive.id,
        nodeId: port.node.id,
        kind: 'hive-entry',
        via: 'hive-ref',
        refNodeId: node.id,
        portId: port.id,
    };
}
