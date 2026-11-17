/**
 * Portas automáticas da Hive (puro). Regra: Hive com ao menos uma sala (nó `scene`) tem
 * entrada e saída válidas. O mestre renomeia, move e apaga, exceto a última de cada lado.
 * `hive` é o grafo: `nodes`, `anchors.intro` e `hive.ports`.
 */

const DIRECTIONS = ['entry', 'exit'];

const roomsOf = (graph) => (graph?.nodes ?? []).filter((node) => node?.type === 'scene');

const isValid = (port, roomIds) => !!port?.nodeId && roomIds.has(port.nodeId);

/** Sala de pouso das portas novas: a INTRO, senão a mais ao topo e à esquerda. */
export function landingRoom(graph) {
    const rooms = roomsOf(graph);
    if (!rooms.length) return null;
    const intro = graph?.anchors?.intro;
    const marked = intro ? rooms.find((room) => room.id === intro) : null;
    if (marked) return marked;
    const at = (room) => [Number(room?.position?.y) || 0, Number(room?.position?.x) || 0];
    return [...rooms].sort((a, b) => at(a)[0] - at(b)[0] || at(a)[1] - at(b)[1])[0];
}

function uniqueName(base, taken) {
    if (!taken.has(base)) return base;
    for (let n = 2; ; n += 1) {
        const candidate = `${base} ${n}`;
        if (!taken.has(candidate)) return candidate;
    }
}

/**
 * Garante entrada e saída. Idempotente; não mexe em porta do mestre, só preenche o que
 * falta e religa porta `auto` cuja sala sumiu. Hive sem sala não ganha porta (sem destino).
 * `labelOf(direction)` devolve o nome base; `newId(prefix)` gera o id.
 */
export function ensureHivePorts(graph, { newId, labelOf }) {
    const current = graph?.hive?.ports ?? [];
    const landing = landingRoom(graph);
    if (!landing) return { ports: current, changed: false };
    const roomIds = new Set(roomsOf(graph).map((room) => room.id));
    let changed = false;
    const ports = current.map((port) => {
        if (port?.auto && !isValid(port, roomIds)) {
            changed = true;
            return { ...port, nodeId: landing.id };
        }
        return port;
    });
    const taken = new Set(ports.map((port) => port?.name).filter(Boolean));
    for (const direction of DIRECTIONS) {
        const has = ports.some((port) => (port?.direction === 'exit' ? 'exit' : 'entry') === direction && isValid(port, roomIds));
        if (has) continue;
        const name = uniqueName(labelOf(direction), taken);
        taken.add(name);
        ports.push({ id: newId('port'), name, direction, nodeId: landing.id, auto: true });
        changed = true;
    }
    return { ports: changed ? ports : current, changed };
}

/** Pode apagar? Não a última porta válida de um lado numa Hive que tem sala. */
export function canRemovePort(graph, portId) {
    const ports = graph?.hive?.ports ?? [];
    const port = ports.find((entry) => entry?.id === portId);
    if (!port) return { ok: false, reason: 'missing' };
    const roomIds = new Set(roomsOf(graph).map((room) => room.id));
    if (!roomIds.size || !isValid(port, roomIds)) return { ok: true };
    const side = port.direction === 'exit' ? 'exit' : 'entry';
    const others = ports.filter(
        (entry) => entry?.id !== portId && (entry?.direction === 'exit' ? 'exit' : 'entry') === side && isValid(entry, roomIds)
    );
    return others.length ? { ok: true } : { ok: false, reason: 'last' };
}
