/**
 * Regras puras dos Grupos Hive (Fase 1). Sem Foundry: entra nó, sai conta.
 * A caixa do grupo é derivada dos filhos; nada de posição própria persistida.
 */
export const GROUP_COLOR = '#7aa2f7';
export const GROUP_PADDING = 40;
export function childrenOf(nodes, groupId) {
    return (nodes ?? []).filter((node) => node?.parentId === groupId);
}
export function parentMap(nodes) {
    const map = new Map();
    for (const node of nodes ?? []) {
        if (node?.parentId) map.set(node.id, node.parentId);
    }
    return map;
}
/**
 * Caixa do grupo = união dos filhos + margem. `positionOf` existe para o
 * arrasto usar posições provisórias sem tocar no store.
 */
export function groupBounds(
    nodes,
    groupId,
    sizeOf,
    padding = GROUP_PADDING,
    positionOf = (node) => node.position
) {
    const children = childrenOf(nodes, groupId);
    if (!children.length) return null;
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const child of children) {
        const [width, height] = sizeOf(child.type, child.size);
        const position = positionOf(child) ??
            child.position ?? {
                x: 0,
                y: 0,
            };
        minX = Math.min(minX, position.x);
        minY = Math.min(minY, position.y);
        maxX = Math.max(maxX, position.x + width);
        maxY = Math.max(maxY, position.y + height);
    }
    return {
        x: minX - padding,
        y: minY - padding,
        width: maxX - minX + padding * 2,
        height: maxY - minY + padding * 2,
    };
}
/** Filho de grupo fechado vira a caixa do grupo na geometria da edge. */
export function effectiveEndpoint(nodeId, parents, closedGroups) {
    if (!nodeId || !closedGroups?.size) return nodeId;
    const groupId = parents?.get?.(nodeId) ?? null;
    return groupId && closedGroups.has(groupId) ? groupId : nodeId;
}
/** Aberto se contém o nó ativo ou um filho navegável; trava local força aberto. */
export function groupOpenFor(groupId, nodes, activeId, navigableIds, lockedGroups = null) {
    if (lockedGroups?.has?.(groupId)) return true;
    return childrenOf(nodes, groupId).some(
        (child) => child.id === activeId || navigableIds?.has?.(child.id)
    );
}
export function movePositions(children, delta) {
    return (children ?? []).map((child) => ({
        id: child.id,
        position: {
            x: Math.round((child.position?.x ?? 0) + delta.x),
            y: Math.round((child.position?.y ?? 0) + delta.y),
        },
    }));
}
