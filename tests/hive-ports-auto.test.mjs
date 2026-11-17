import test from 'node:test';
import assert from 'node:assert/strict';
import { ensureHivePorts, canRemovePort, landingRoom } from '../scripts/hive-ports.mjs';
import { sanitizeHivePorts } from '../scripts/hive-io.mjs';

test('sanitizeHivePorts preserva `auto` e não inventa o campo', () => {
    const nodes = [{ id: 'A' }];
    const out = sanitizeHivePorts(
        [
            { id: 'p1', name: 'Entrada', direction: 'entry', nodeId: 'A', auto: true },
            { id: 'p2', name: 'Saída', direction: 'exit', nodeId: 'A' },
            { id: 'p3', name: 'x', direction: 'exit', nodeId: 'A', auto: 'sim' },
        ],
        nodes,
        (p) => `${p}-novo`
    );
    assert.equal(out[0].auto, true);
    assert.equal('auto' in out[1], false);
    assert.equal('auto' in out[2], false);
});

const mk = () => {
    let n = 0;
    return { newId: (p) => `${p}${++n}`, labelOf: (d) => (d === 'exit' ? 'Saída' : 'Entrada') };
};
const room = (id, x = 0, y = 0) => ({ id, type: 'scene', position: { x, y } });
const hiveOf = (nodes, ports = [], anchors = {}) => ({ nodes, anchors, hive: { ports } });

test('Hive vazia ou sem sala: nada muda', () => {
    const g = hiveOf([{ id: 'n', type: 'note' }]);
    const out = ensureHivePorts(g, mk());
    assert.equal(out.changed, false);
    assert.deepEqual(out.ports, []);
    assert.equal(ensureHivePorts({}, mk()).changed, false);
});

test('uma sala: nasce entrada e saída automáticas nela', () => {
    const out = ensureHivePorts(hiveOf([room('A')]), mk());
    assert.equal(out.changed, true);
    assert.equal(out.ports.length, 2);
    assert.deepEqual(out.ports.map((p) => [p.direction, p.nodeId, p.auto]), [
        ['entry', 'A', true],
        ['exit', 'A', true],
    ]);
});

test('várias salas: a INTRO ganha; sem INTRO, a mais ao topo e à esquerda', () => {
    const nodes = [room('A', 300, 0), room('B', 100, 0), room('C', 0, 200)];
    assert.equal(landingRoom(hiveOf(nodes)).id, 'B');
    assert.equal(landingRoom(hiveOf(nodes, [], { intro: 'C' })).id, 'C');
    assert.equal(ensureHivePorts(hiveOf(nodes, [], { intro: 'C' }), mk()).ports[0].nodeId, 'C');
});

test('idempotente: a segunda rodada não muda nada', () => {
    const g = hiveOf([room('A'), room('B', 10, 0)]);
    const first = ensureHivePorts(g, mk());
    const again = ensureHivePorts(hiveOf(g.nodes, first.ports), mk());
    assert.equal(again.changed, false);
    assert.equal(again.ports, first.ports);
});

test('porta do mestre vale e não é sobrescrita; só falta o lado que não existe', () => {
    const manual = { id: 'p1', name: 'Portão', direction: 'entry', nodeId: 'B' };
    const out = ensureHivePorts(hiveOf([room('A'), room('B', 50, 50)], [manual]), mk());
    assert.equal(out.ports[0], manual);
    assert.equal(out.ports.length, 2);
    assert.equal(out.ports[1].direction, 'exit');
});

test('porta manual sem sala não é religada, mas o lado ganha porta nova', () => {
    const dangling = { id: 'p1', name: 'Velha', direction: 'entry', nodeId: 'sumiu' };
    const out = ensureHivePorts(hiveOf([room('A')], [dangling]), mk());
    assert.equal(out.ports[0], dangling);
    assert.ok(out.ports.some((p) => p.direction === 'entry' && p.nodeId === 'A' && p.auto));
});

test('porta auto cuja sala foi apagada é religada à sala de pouso', () => {
    const auto = { id: 'p1', name: 'Entrada', direction: 'entry', nodeId: 'sumiu', auto: true };
    const out = ensureHivePorts(hiveOf([room('A')], [auto]), mk());
    assert.equal(out.changed, true);
    assert.equal(out.ports.find((p) => p.id === 'p1').nodeId, 'A');
    assert.equal(out.ports.filter((p) => p.direction === 'entry').length, 1);
});

test('nomes não colidem com porta já existente', () => {
    const manual = { id: 'p1', name: 'Entrada', direction: 'exit', nodeId: 'A' };
    const out = ensureHivePorts(hiveOf([room('A')], [manual]), mk());
    const entry = out.ports.find((p) => p.direction === 'entry');
    assert.equal(entry.name, 'Entrada 2');
});

test('canRemovePort: a última de cada lado fica; havendo outra, pode sair', () => {
    const ports = [
        { id: 'e1', direction: 'entry', nodeId: 'A' },
        { id: 'e2', direction: 'entry', nodeId: 'A' },
        { id: 'x1', direction: 'exit', nodeId: 'A' },
    ];
    const g = hiveOf([room('A')], ports);
    assert.equal(canRemovePort(g, 'e1').ok, true);
    assert.deepEqual(canRemovePort(g, 'x1'), { ok: false, reason: 'last' });
    assert.deepEqual(canRemovePort(g, 'nao-existe'), { ok: false, reason: 'missing' });
});

test('canRemovePort: Hive sem sala deixa apagar qualquer porta', () => {
    const g = hiveOf([], [{ id: 'e1', direction: 'entry', nodeId: null }]);
    assert.equal(canRemovePort(g, 'e1').ok, true);
});
