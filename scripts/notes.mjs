/**
 * Notas do mestre (puro). Nota é anotação do GM: criar, escrever sem perder foco, ler no jogo.
 */

const TEXT_PATHS = new Set(['data.title', 'data.body']);

/**
 * Editar este campo no Inspector precisa redesenhar o editor inteiro? Não para texto de Nota
 * (o cartão é atualizado no lugar) nem para as anotações livres (`notes`, não aparecem em cartão).
 * Redesenhar recria o `<textarea>` e o mestre perde o foco e o cursor no meio da frase.
 */
export function shouldRerenderForPath(path, nodeType) {
    if (path === 'notes') return false;
    if (nodeType === 'note' && TEXT_PATHS.has(path)) return false;
    return true;
}

const isNote = (node) => node?.type === 'note';

/**
 * Notas para o painel do Ao Vivo: primeiro as ligadas ao nó ativo (`data.anchorNodeId`),
 * depois as soltas. Nota ligada a um nó que sumiu vira solta (nunca órfã e invisível).
 */
export function notesFor(graph, activeNodeId) {
    const nodes = graph?.nodes ?? [];
    const alive = new Set(nodes.map((node) => node.id));
    const anchored = [];
    const loose = [];
    for (const node of nodes.filter(isNote)) {
        const anchor = node.data?.anchorNodeId ?? null;
        const entry = {
            id: node.id,
            title: String(node.data?.title ?? ''),
            body: String(node.data?.body ?? ''),
        };
        if (anchor && alive.has(anchor)) {
            if (anchor === activeNodeId) anchored.push({ ...entry, anchored: true });
        } else {
            loose.push({ ...entry, anchored: false });
        }
    }
    return { anchored, loose, all: [...anchored, ...loose] };
}

/** Nós a que uma Nota pode ser ligada (tudo menos outras Notas). */
export function anchorOptions(graph, labelOf) {
    return (graph?.nodes ?? [])
        .filter((node) => !isNote(node))
        .map((node) => ({ id: node.id, name: labelOf(node) }));
}
