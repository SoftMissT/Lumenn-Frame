import { hiveEntryPort, resolveHiveExitEdge } from './hive-io.mjs';

/**
 * Para onde a saída de uma Hive leva (puro). `parent` é o grafo onde mora o nó `hive-ref`
 * da Hive de origem; `portId` é a porta de saída usada. Estados:
 *  - `back`: sem aresta de saída; volta ao nó Hive no pai;
 *  - `node`: destino comum (cena, etc.) no pai;
 *  - `hive`: destino é OUTRA Hive; `entry` é a porta de entrada onde aterrissar;
 *  - `hive-missing` | `hive-not-hive` | `hive-no-entry`: não dá para entrar; a mesa fica onde está.
 */
export function planExitLanding({ parent, refId, portId = null, getGraph }) {
    const edge = refId ? resolveHiveExitEdge(parent, refId, portId) : null;
    const target = edge ? ((parent?.nodes ?? []).find((node) => node.id === edge.to) ?? null) : null;
    if (!target) return { status: 'back', edge: null, target: null };
    if (target.type !== 'hive-ref') return { status: 'node', edge, target };
    const hive = getGraph(target.data?.graphId ?? target.data?.hiveId) ?? null;
    if (!hive) return { status: 'hive-missing', edge, target, hive: null };
    if (!hive.isHive) return { status: 'hive-not-hive', edge, target, hive };
    const entry = hiveEntryPort(hive, edge.portId ?? target.data?.portId ?? null);
    if (!entry?.node) return { status: 'hive-no-entry', edge, target, hive };
    return { status: 'hive', edge, target, hive, entry };
}
