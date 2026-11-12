import { matchNamedResources, portsOf, resolveHivePort } from './hive-runtime.mjs';

/** Regras puras da Hive no editor e no Ao Vivo. Sem Foundry: entra dado, sai dado. */
export const HIVE_EXPORT_FORMAT = 'lumenn-frame-hive';
const DIRECTIONS = new Set(['entry', 'exit']);
const PORTABLE_TYPES = new Set(['scene', 'audio', 'note', 'group', 'encounter']);
const WORLD_KEYS = ['sourceFolderId', 'sourceFolderPath'];

/**
 * Transições padrão de uma Hive nova: entra com íris de cinema e a música da Hive;
 * sai em cutscene de filme sem mexer na música. `audio.mode: 'none'` = música intocada.
 */
export const DEFAULT_HIVE_TRANSITIONS = Object.freeze({
    transition: {
        scope: 'both',
        caption: true,
        scene: { type: 'film:iris', duration: 1600, color: '#000000' },
        audio: { mode: 'auto', crossfadeDuration: 2000, curve: 'linear' },
    },
    exit: {
        scope: 'both',
        caption: true,
        scene: { type: 'film:cutscene', duration: 2600, color: '#000000' },
        audio: { mode: 'none', crossfadeDuration: 2000, curve: 'linear' },
    },
});

/** Configuração antiga (`style: 'cutscene'`) vira o tipo de cinema equivalente. */
export function normalizeHiveTransition(config, fallback) {
    const base = structuredClone(fallback);
    if (!config) return base;
    const scene = { ...base.scene, ...(config.scene ?? {}) };
    if (config.style === 'cutscene') scene.type = 'film:cutscene';
    return {
        ...base,
        ...config,
        scene,
        audio: { ...base.audio, ...(config.audio ?? {}) },
        caption: config.caption !== false,
    };
}

/**
 * Transforma um Grupo em Hive: as salas viram um storyboard inteiro e o Grupo vira um nó só.
 * - FLOW de fora para uma sala vira porta de entrada (a aresta passa a apontar para o nó Hive);
 * - FLOW de uma sala para fora vira porta de saída (a aresta sai do nó Hive com `exitPortId`);
 * - áudio que só toca dentro do Grupo vai junto; áudio usado dentro e fora é copiado.
 * Puro: devolve { hive, parent, refNode, entries, exits } ou null se o Grupo não existe ou está vazio.
 */
export function planGroupToHive(
    graph,
    groupId,
    { newId, labelOf = (node) => node?.data?.title ?? node?.id }
) {
    const nodes = graph?.nodes ?? [];
    const edges = graph?.edges ?? [];
    const group = nodes.find((node) => node.id === groupId && node.type === 'group');
    if (!group) return null;
    const members = new Set(
        nodes.filter((node) => node.parentId === groupId).map((node) => node.id)
    );
    if (!members.size) return null;
    const moved = new Set();
    const copies = new Map();
    for (const node of nodes) {
        if (node.type === 'group') continue;
        if (node.type !== 'audio') {
            if (members.has(node.id)) moved.add(node.id);
            continue;
        }
        const targets = edges
            .filter((edge) => edge.type === 'audio' && edge.from === node.id)
            .map((edge) => edge.to);
        const inside = targets.some((id) => members.has(id));
        const outside = targets.some((id) => !members.has(id));
        if (inside && outside) copies.set(node.id, newId('node'));
        else if (inside || (members.has(node.id) && !targets.length)) moved.add(node.id);
    }
    const inHive = (id) => moved.has(id) || copies.has(id);
    const hiveIdOf = (id) => copies.get(id) ?? id;
    const hiveNodes = nodes
        .filter((node) => inHive(node.id))
        .map((node) => ({
            ...node,
            id: hiveIdOf(node.id),
            parentId: null,
            data: { ...(node.data ?? {}) },
        }));
    const minX = Math.min(...hiveNodes.map((node) => node.position?.x ?? 0));
    const minY = Math.min(...hiveNodes.map((node) => node.position?.y ?? 0));
    for (const node of hiveNodes) {
        node.position = {
            x: Math.round((node.position?.x ?? 0) - minX + 100),
            y: Math.round((node.position?.y ?? 0) - minY + 100),
        };
    }
    const hiveGraphId = newId('graph');
    const refId = newId('node');
    const entries = new Map();
    const exits = [];
    const hiveEdges = [];
    const parentEdges = [];
    for (const edge of edges) {
        const fromIn = inHive(edge.from);
        const toIn = moved.has(edge.to);
        if (edge.type === 'audio' && copies.has(edge.from)) {
            if (members.has(edge.to))
                hiveEdges.push({ ...edge, id: newId('edge'), from: hiveIdOf(edge.from) });
            else parentEdges.push(edge);
            continue;
        }
        if (fromIn && toIn) {
            hiveEdges.push({ ...edge, from: hiveIdOf(edge.from), to: hiveIdOf(edge.to) });
        } else if (!fromIn && members.has(edge.to) && edge.type === 'flow') {
            let port = entries.get(edge.to);
            if (!port) {
                port = {
                    id: newId('port'),
                    name: String(labelOf(nodes.find((n) => n.id === edge.to)) ?? ''),
                    direction: 'entry',
                    nodeId: edge.to,
                };
                entries.set(edge.to, port);
            }
            parentEdges.push({ ...edge, to: refId, portId: port.id });
        } else if (members.has(edge.from) && !inHive(edge.to) && edge.type === 'flow') {
            const target = nodes.find((n) => n.id === edge.to);
            const port = {
                id: newId('port'),
                name: String(labelOf(target) ?? ''),
                direction: 'exit',
                nodeId: edge.from,
            };
            exits.push(port);
            parentEdges.push({ ...edge, from: refId, exitPortId: port.id });
        } else if (!fromIn && !inHive(edge.to)) {
            parentEdges.push(edge);
        }
    }
    const entryPorts = [...entries.values()];
    const firstRoom =
        entryPorts[0]?.nodeId ??
        hiveNodes.find((node) => node.type === 'scene')?.id ??
        hiveNodes[0]?.id ??
        null;
    const anchor = group.position ?? { x: minX, y: minY };
    const refNode = {
        id: refId,
        type: 'hive-ref',
        parentId: group.parentId ?? null,
        position: { x: Math.round(anchor.x ?? 0), y: Math.round(anchor.y ?? 0) },
        color: '#8b5cf6',
        size: 'normal',
        notes: '',
        data: { graphId: hiveGraphId, portId: entryPorts[0]?.id ?? null },
    };
    const parentNodes = nodes
        .filter((node) => node.id !== groupId && !moved.has(node.id))
        .map((node) => (node.parentId === groupId ? { ...node, parentId: null } : node));
    parentNodes.push(refNode);
    const keep = new Set(parentNodes.map((node) => node.id));
    return {
        hive: {
            id: hiveGraphId,
            name: group.data?.title || 'Hive',
            activeNodeId: firstRoom,
            isHive: true,
            hive: {
                ports: [...entryPorts, ...exits],
                transition: structuredClone(DEFAULT_HIVE_TRANSITIONS.transition),
                exit: structuredClone(DEFAULT_HIVE_TRANSITIONS.exit),
            },
            nodes: hiveNodes,
            edges: hiveEdges,
        },
        parent: {
            nodes: parentNodes,
            edges: parentEdges.filter((edge) => keep.has(edge.from) && keep.has(edge.to)),
            activeNodeId: moved.has(graph.activeNodeId) ? refId : (graph.activeNodeId ?? null),
        },
        refNode,
        entries: entryPorts,
        exits,
    };
}

/**
 * Para onde sair: aresta FLOW do nó Hive no pai ligada à porta usada; sem marca de porta,
 * a única aresta de saída serve. Devolve a aresta ou null (aí volta ao próprio nó Hive).
 */
export function resolveHiveExitEdge(parentGraph, refNodeId, portId) {
    const outgoing = (parentGraph?.edges ?? []).filter(
        (edge) => edge.type === 'flow' && edge.from === refNodeId
    );
    const byPort = portId ? outgoing.find((edge) => edge.exitPortId === portId) : null;
    return byPort ?? (outgoing.length === 1 ? outgoing[0] : null);
}

/** Porta de entrada: a pedida (se for de entrada) ou a primeira com sala existente. */
export function hiveEntryPort(hive, portRef = null) {
    const wanted = portRef ? resolveHivePort(hive, portRef) : null;
    if (wanted?.node && wanted.direction !== 'exit') return wanted;
    for (const port of portsOf(hive)) {
        if (port?.direction === 'exit') continue;
        const resolved = resolveHivePort(hive, port.id);
        if (resolved?.node) return resolved;
    }
    return null;
}

/** Portas de saída que moram na sala informada. */
export function hiveExitPortsAt(hive, nodeId) {
    return portsOf(hive).filter((port) => port?.direction === 'exit' && port.nodeId === nodeId);
}

/**
 * Trilho de portas do card do nó Hive: entradas e saídas com o contador de arestas ligadas.
 * `edges` são as arestas do storyboard-pai, onde mora o nó `hive-ref`.
 */
export function portHubView(hive, edges, refNodeId) {
    const ports = portsOf(hive);
    const directionOf = (port) => (port?.direction === 'exit' ? 'exit' : 'entry');
    // Aresta legada sem `portId` entra pela porta padrão, como `hiveEntryPort` faz.
    const fallbackEntry =
        ports.find((port) => directionOf(port) === 'entry' && port.nodeId)?.id ?? null;
    const counts = { entry: new Map(), exit: new Map() };
    const bump = (map, id) => {
        if (id) map.set(id, (map.get(id) ?? 0) + 1);
    };
    for (const edge of edges ?? []) {
        if (edge?.type !== 'flow') continue;
        if (edge.to === refNodeId) bump(counts.entry, edge.portId ?? fallbackEntry);
        if (edge.from === refNodeId && edge.exitPortId) bump(counts.exit, edge.exitPortId);
    }
    const side = (direction) =>
        ports
            .filter((port) => directionOf(port) === direction)
            .map((port) => ({
                id: port.id,
                name: port.name ?? '',
                direction,
                socket: direction === 'exit' ? 'flow-out' : 'flow-in',
                nodeId: port.nodeId ?? null,
                links: counts[direction].get(port.id) ?? 0,
            }));
    return { entries: side('entry'), exits: side('exit') };
}

/** Arestas de saída do nó Hive cuja porta já não existe (arestas órfãs). */
export function orphanExitEdges(hive, edges, refNodeId) {
    const ids = new Set(portsOf(hive).map((port) => port?.id));
    return (edges ?? []).filter(
        (edge) =>
            edge?.type === 'flow' &&
            edge.from === refNodeId &&
            !!edge.exitPortId &&
            !ids.has(edge.exitPortId)
    );
}

/**
 * Intenção de um clique numa porta depois de armar uma saída:
 * simples cria e desarma; Shift cria e continua; Ctrl alterna (cria/remove) e continua.
 */
export function connectIntent({ target, ctrlKey = false, shiftKey = false }) {
    if (!target) return { action: 'disarm', keepArmed: false };
    if (ctrlKey) return { action: 'toggle', keepArmed: true };
    return { action: 'create', keepArmed: shiftKey === true };
}

/** Nome do arquivo exportado: `<hive>-<timestamp>.json`, sem acento nem separador proibido. */
export function hiveExportFileName(name, date = new Date()) {
    const slug = String(name ?? 'hive')
        .normalize('NFKD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^\p{L}\p{N}_-]+/gu, '-')
        .replace(/^-+|-+$/g, '');
    const stamp = date.toISOString().replace(/[:.]/g, '-').slice(0, 19);
    return `${slug || 'hive'}-${stamp}.json`;
}

/** Normaliza as portas gravadas: id garantido, direção válida, sala existente ou nula. */
export function sanitizeHivePorts(ports, nodes, newId) {
    const nodeIds = new Set((nodes ?? []).map((node) => node?.id));
    const seen = new Set();
    const clean = [];
    for (const port of ports ?? []) {
        const id = String(port?.id || newId('port'));
        if (seen.has(id)) continue;
        seen.add(id);
        clean.push({
            id,
            name: String(port?.name ?? '').trim(),
            direction: DIRECTIONS.has(port?.direction) ? port.direction : 'entry',
            nodeId: nodeIds.has(port?.nodeId) ? port.nodeId : null,
        });
    }
    return clean;
}

/**
 * Itens da Hive que não apontam para algo existente no mundo: cena ou áudio importado
 * sem par, ou apagado depois. `hasScene(id)` e `hasAudio(data)` vêm do Foundry.
 */
export function listHivePending(hive, { hasScene, hasAudio }) {
    const pending = [];
    for (const node of hive?.nodes ?? []) {
        const name = node?.data?.pendingName ?? null;
        if (node?.type === 'scene') {
            const broken = node.data?.sceneId ? !hasScene(node.data.sceneId) : !!name;
            if (broken) pending.push({ nodeId: node.id, kind: 'scene', name });
        } else if (node?.type === 'audio') {
            const broken = node.data?.audioId ? !hasAudio(node.data) : !!name;
            if (broken) pending.push({ nodeId: node.id, kind: 'audio', name });
        }
    }
    return pending;
}

/**
 * Arquivo portátil de uma Hive: ids de cena e áudio do mundo viram nomes.
 * `resolvers.sceneName(id)` e `resolvers.audioRef(data)` ({ type, name }) vêm do Foundry.
 */
export function buildHiveExport(graph, resolvers) {
    const nodes = (graph?.nodes ?? []).map((node) => {
        const data = { ...(node.data ?? {}) };
        for (const key of WORLD_KEYS) delete data[key];
        if (node.type === 'scene') {
            data.sceneName = resolvers.sceneName(data.sceneId) ?? data.pendingName ?? null;
            delete data.sceneId;
        } else if (node.type === 'audio') {
            const ref = resolvers.audioRef(data);
            data.audioName = ref?.name ?? data.pendingName ?? null;
            if (ref?.type) data.audioType = ref.type;
            delete data.audioId;
        }
        delete data.pendingName;
        return { ...node, data };
    });
    return {
        format: HIVE_EXPORT_FORMAT,
        version: 1,
        hives: [
            {
                id: graph.id,
                name: graph.name,
                activeNodeId: graph.activeNodeId ?? null,
                kind: graph.kind ?? (graph.isHive ? 'hive' : 'storyboard'),
                address: graph.address ?? null,
                anchors: graph.anchors
                    ? {
                          intro: graph.anchors.intro ?? null,
                          output: graph.anchors.output ?? null,
                      }
                    : null,
                hive: {
                    ports: portsOf(graph).map((port) => ({ ...port })),
                    transition: graph.hive?.transition ?? null,
                    exit: graph.hive?.exit ?? null,
                },
                nodes,
                edges: (graph.edges ?? []).map((edge) => ({ ...edge })),
            },
        ],
    };
}

/**
 * Prepara a Hive importada: ids novos em tudo, cenas e áudios casados pelo nome.
 * `world` = { scenes: [{id, name}], audio: [{id, name, type}] }; `newId(prefix)` gera ids.
 * Devolve { graph, pending }; o que não casa fica sem id e com `data.pendingName`.
 */
export function planHiveImport(hiveData, world, newId) {
    const nodeIds = new Map();
    const mapNode = (id) => (id && nodeIds.has(id) ? nodeIds.get(id) : null);
    for (const node of hiveData?.nodes ?? []) {
        if (PORTABLE_TYPES.has(node?.type)) nodeIds.set(node.id, newId('node'));
    }
    const pending = [];
    const nodes = [];
    for (const node of hiveData?.nodes ?? []) {
        if (!nodeIds.has(node?.id)) continue;
        const id = nodeIds.get(node.id);
        const data = { ...(node.data ?? {}) };
        if (node.type === 'scene') {
            const name = data.sceneName ?? null;
            delete data.sceneName;
            const { matches, pending: miss } = matchNamedResources(
                name ? [{ name }] : [],
                world?.scenes ?? []
            );
            data.sceneId = matches[0]?.resource.id ?? null;
            if (name && !data.sceneId) {
                data.pendingName = name;
                pending.push({ nodeId: id, kind: 'scene', name, reason: miss[0]?.reason });
            }
        } else if (node.type === 'audio') {
            const name = data.audioName ?? null;
            delete data.audioName;
            const pool = (world?.audio ?? []).filter((item) => item.type === data.audioType);
            const { matches, pending: miss } = matchNamedResources(name ? [{ name }] : [], pool);
            data.audioId = matches[0]?.resource.id ?? null;
            if (name && !data.audioId) {
                data.pendingName = name;
                pending.push({ nodeId: id, kind: 'audio', name, reason: miss[0]?.reason });
            }
        } else if (node.type === 'encounter') {
            data.sceneNodeId = mapNode(data.sceneNodeId);
        }
        nodes.push({ ...node, id, parentId: mapNode(node.parentId), data });
    }
    const keep = new Set(nodes.map((node) => node.id));
    // Portas ganham ids novos: as arestas precisam apontar para os ids novos, não para o arquivo.
    const portIds = new Map(
        portsOf(hiveData)
            .filter((port) => port?.id)
            .map((port) => [port.id, newId('port')])
    );
    const edges = (hiveData?.edges ?? [])
        .map((edge) => ({
            ...edge,
            id: newId('edge'),
            from: mapNode(edge.from),
            to: mapNode(edge.to),
            ...(edge.portId ? { portId: portIds.get(edge.portId) ?? null } : {}),
            ...(edge.exitPortId ? { exitPortId: portIds.get(edge.exitPortId) ?? null } : {}),
        }))
        .filter((edge) => keep.has(edge.from) && keep.has(edge.to));
    const ports = sanitizeHivePorts(
        portsOf(hiveData).map((port) => ({
            ...port,
            id: portIds.get(port?.id) ?? newId('port'),
            nodeId: mapNode(port.nodeId),
        })),
        nodes,
        newId
    );
    const anchors = hiveData?.anchors
        ? {
              intro: mapNode(hiveData.anchors.intro),
              output: mapNode(hiveData.anchors.output),
          }
        : null;
    return {
        graph: {
            id: newId('graph'),
            name: hiveData?.name || 'Hive',
            activeNodeId: mapNode(hiveData?.activeNodeId),
            isHive: true,
            ...(hiveData?.kind ? { kind: String(hiveData.kind) } : {}),
            ...(hiveData?.address ? { address: String(hiveData.address) } : {}),
            ...(anchors && (anchors.intro || anchors.output) ? { anchors } : {}),
            hive: {
                ports,
                transition: hiveData?.hive?.transition ?? null,
                exit: hiveData?.hive?.exit ?? null,
            },
            nodes,
            edges,
        },
        pending,
    };
}
