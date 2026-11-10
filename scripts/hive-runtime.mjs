const DIRECTIONS = new Set(['entry', 'exit']);

function normalizeName(value) {
    return String(value ?? '')
        .trim()
        .toLocaleLowerCase();
}

/** Portas da Hive: o store guarda em `graph.hive.ports`; exportações antigas, em `ports`. */
export function portsOf(hive) {
    if (Array.isArray(hive?.hive?.ports)) return hive.hive.ports;
    return Array.isArray(hive?.ports) ? hive.ports : [];
}

function refsOf(hive) {
    const explicit = Array.isArray(hive?.references) ? hive.references : [];
    const nodes = Array.isArray(hive?.nodes) ? hive.nodes : [];
    const nodeRefs = nodes
        .filter((node) => node?.type === 'hive-ref' && (node?.data?.graphId || node?.data?.hiveId))
        .map((node) => node.data.graphId ?? node.data.hiveId);
    return [...new Set([...explicit, ...nodeRefs].filter(Boolean))];
}
/** Detecta referências diretas ou indiretas entre Hives exportadas. */
export function detectHiveCycles(hives) {
    const byId = new Map((hives ?? []).filter((hive) => hive?.id).map((hive) => [hive.id, hive]));
    const cycles = [];
    const visiting = new Set();
    const visited = new Set();

    function visit(id, path) {
        if (visiting.has(id)) {
            const start = path.indexOf(id);
            cycles.push([...path.slice(start), id]);
            return;
        }
        if (visited.has(id)) return;
        visiting.add(id);
        const hive = byId.get(id);
        for (const refId of refsOf(hive)) {
            if (byId.has(refId)) visit(refId, [...path, id]);
        }
        visiting.delete(id);
        visited.add(id);
    }
    for (const id of byId.keys()) visit(id, []);
    return cycles;
}
/** Resolve uma porta por id ou nome e devolve a sala interna de destino. */
export function resolveHivePort(hive, portRef) {
    const ports = portsOf(hive);
    const wanted = normalizeName(portRef);
    const port = ports.find(
        (candidate) => candidate?.id === portRef || normalizeName(candidate?.name) === wanted
    );
    if (!port?.nodeId) return null;
    return {
        ...port,
        node: (hive.nodes ?? []).find((node) => node?.id === port.nodeId) ?? null,
    };
}
/** Cria uma trilha imutável; o nível raiz representa o storyboard-pai. */
export function createNavigationTrail(graphId, activeNodeId = null) {
    return [
        {
            graphId,
            activeNodeId,
            viaPortId: null,
            refNodeId: null,
            fromNodeId: null,
        },
    ];
}
/**
 * Empilha um nível de Hive. `refNodeId` é o nó hive-ref do pai por onde se entrou;
 * `fromNodeId`, a sala do pai que estava ativa antes (música dela retoma na saída).
 */
export function pushNavigationLevel(trail, level) {
    if (!level?.graphId) return [...(trail ?? [])];
    return [
        ...(trail ?? []),
        {
            graphId: level.graphId,
            activeNodeId: level.activeNodeId ?? null,
            viaPortId: level.viaPortId ?? null,
            refNodeId: level.refNodeId ?? null,
            fromNodeId: level.fromNodeId ?? null,
        },
    ];
}
export function popNavigationLevel(trail) {
    const current = [...(trail ?? [])];
    if (current.length <= 1)
        return {
            trail: current,
            level: current[0] ?? null,
        };
    const level = current.pop();
    return {
        trail: current,
        level,
    };
}
export function setNavigationNode(trail, graphId, activeNodeId) {
    return (trail ?? []).map((level) =>
        level.graphId === graphId
            ? {
                  ...level,
                  activeNodeId: activeNodeId ?? null,
              }
            : {
                  ...level,
              }
    );
}
export function currentNavigationLevel(trail) {
    return (trail ?? []).at(-1) ?? null;
}
/** Casa referências exportadas com documentos do mundo pelo nome. */
export function matchNamedResources(entries, worldResources) {
    const resources = new Map();
    for (const resource of worldResources ?? []) {
        const key = normalizeName(resource?.name);
        if (!key) continue;
        const list = resources.get(key) ?? [];
        list.push(resource);
        resources.set(key, list);
    }
    const matches = [];
    const pending = [];
    for (const entry of entries ?? []) {
        const candidates = resources.get(normalizeName(entry?.name)) ?? [];
        if (candidates.length === 1) {
            matches.push({
                entry,
                resource: candidates[0],
            });
        } else {
            pending.push({
                entry,
                reason: candidates.length ? 'ambiguous' : 'missing',
                candidates,
            });
        }
    }
    return {
        matches,
        pending,
    };
}
/** Valida Hives antes de gravar ou importar um arquivo. */
export function validateHiveExport(payload) {
    const hives = Array.isArray(payload?.hives)
        ? payload.hives
        : payload?.hive
          ? [payload.hive]
          : [];
    const errors = [];
    const ids = new Set();
    if (!hives.length) errors.push('hives ausente ou vazio');
    for (const hive of hives) {
        if (!hive?.id) errors.push('Hive sem id');
        if (hive?.id && ids.has(hive.id)) errors.push(`id de Hive duplicado: ${hive.id}`);
        if (hive?.id) ids.add(hive.id);
        const portIds = new Set();
        const portNames = new Set();
        for (const node of hive?.nodes ?? []) {
            if (node?.type === 'hive-ref')
                errors.push(`Hive aninhada não é suportada: ${hive?.id ?? '?'}`);
        }
        for (const port of portsOf(hive)) {
            if (!port?.id || !port?.nodeId)
                errors.push(`porta inválida na Hive ${hive?.id ?? '?'}`);
            if (port?.id && portIds.has(port.id)) errors.push(`porta duplicada: ${port.id}`);
            if (port?.id) portIds.add(port.id);
            const name = normalizeName(port?.name);
            if (!name || portNames.has(name))
                errors.push(`nome de porta duplicado ou vazio na Hive ${hive?.id ?? '?'}`);
            if (name) portNames.add(name);
            if (port?.direction && !DIRECTIONS.has(port.direction)) {
                errors.push(`direção de porta inválida: ${port.direction}`);
            }
            if (port?.nodeId && !(hive.nodes ?? []).some((node) => node?.id === port.nodeId)) {
                errors.push(`porta aponta para sala ausente: ${port.nodeId}`);
            }
        }
    }
    for (const cycle of detectHiveCycles(hives))
        errors.push(`ciclo de Hive: ${cycle.join(' -> ')}`);
    return {
        valid: errors.length === 0,
        errors,
    };
}
