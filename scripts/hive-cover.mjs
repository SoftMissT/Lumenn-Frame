import { graphKind } from './neural-address.mjs';

/**
 * Capa de uma Hive (puro). A capa do mestre (`graph.hive.cover`) vence; sem ela, a primeira
 * cena com par no mundo: primeiro as salas diretas, depois descendo pelas sub-Hives.
 * `hasScene(id)` vem do Foundry. Devolve `{ sceneId, img }`, ambos nulos se não há capa.
 */
export function coverFor(graphs, graphId, { hasScene = () => true } = {}) {
    const byId = new Map((graphs ?? []).map((graph) => [graph?.id, graph]));
    const manual = byId.get(graphId)?.hive?.cover;
    if (manual?.img) return { sceneId: null, img: String(manual.img) };
    if (manual?.sceneId && hasScene(manual.sceneId)) return { sceneId: manual.sceneId, img: null };

    const seen = new Set();
    const find = (id) => {
        if (seen.has(id)) return null;
        seen.add(id);
        const nodes = byId.get(id)?.nodes ?? [];
        for (const node of nodes) {
            if (node?.type === 'scene' && node.data?.sceneId && hasScene(node.data.sceneId)) return node.data.sceneId;
        }
        for (const node of nodes) {
            if (node?.type !== 'hive-ref') continue;
            const child = node.data?.graphId ?? node.data?.hiveId;
            const found = child ? find(child) : null;
            if (found) return found;
        }
        return null;
    };
    return { sceneId: find(graphId), img: null };
}

/** Sufixo de chave de idioma do substantivo do grafo: `Hive` ou `Storyboard`. */
export function graphNoun(graph) {
    return graphKind(graph) === 'hive' ? 'Hive' : 'Storyboard';
}
