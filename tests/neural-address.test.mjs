import test from 'node:test';
import assert from 'node:assert/strict';
import {
    anchorOf,
    buildAddressIndex,
    graphAddress,
    listDestinations,
    normalizeAddress,
    parentGraphId,
    planJump,
    resolveAddress,
    rootGraphId,
} from '../scripts/neural-address.mjs';
const labelOf = (node) => node.data?.title ?? node.id;
const campaign = () => [
    {
        id: 'root',
        name: 'Campanha',
        activeNodeId: 'n1',
        anchors: { intro: 'n1', output: 'n2' },
        nodes: [
            { id: 'n1', type: 'scene', data: { title: 'Abertura' } },
            { id: 'n2', type: 'scene', data: { title: 'Créditos' } },
            { id: 'ref', type: 'hive-ref', data: { graphId: 'h40' } },
        ],
        edges: [],
    },
    {
        id: 'h40',
        name: 'Hive-40',
        isHive: true,
        activeNodeId: 'z500',
        nodes: [
            { id: 'z500', type: 'scene', data: { title: 'Z500' } },
            { id: 'gate', type: 'scene', data: { title: 'Portão' } },
        ],
        hive: { ports: [{ id: 'p1', name: 'Portão', direction: 'entry', nodeId: 'gate' }] },
        edges: [],
    },
    {
        id: 'h400',
        name: 'Hive-400',
        isHive: true,
        address: 'Universo / Planeta / Brasil / Hive-400',
        activeNodeId: 'n30',
        nodes: [
            {
                id: 'n30',
                type: 'scene',
                data: { title: 'Nó 30' },
                address: 'Universo/Planeta/Brasil/Hive-400/Nó 30',
            },
        ],
        hive: { ports: [] },
        edges: [],
    },
];
test('endereço normaliza caixa, acento e espaço', () => {
    assert.equal(
        normalizeAddress('  Universo / São   João /Hive-40 '),
        'universo/sao joao/hive-40'
    );
    assert.equal(normalizeAddress(null), '');
});
test('grafo sem endereço herda o caminho do pai; Hive marcada é kind hive', () => {
    const graphs = campaign();
    assert.equal(graphAddress(graphs, 'root'), 'Campanha');
    assert.equal(graphAddress(graphs, 'h40'), 'Campanha / Hive-40');
    assert.equal(
        graphAddress(graphs, 'h400'),
        'Universo / Planeta / Brasil / Hive-400',
        'endereço gravado vence a derivação'
    );
    const index = buildAddressIndex(graphs, { labelOf });
    assert.equal(index.find((entry) => entry.id === 'root').kind, 'storyboard');
    assert.equal(index.find((entry) => entry.id === 'h40').kind, 'hive');
    assert.equal(index.find((entry) => entry.id === 'z500').address, 'Campanha / Hive-40 / Z500');
});
test('ID sempre resolve: grafo, nó e nó aninhado', () => {
    const index = buildAddressIndex(campaign(), { labelOf });
    assert.deepEqual(resolveAddress(index, 'root'), {
        status: 'found',
        id: 'root',
        graphId: 'root',
        nodeId: null,
        address: 'Campanha',
        kind: 'storyboard',
        name: 'Campanha',
        duplicate: false,
    });
    assert.equal(resolveAddress(index, 'z500').graphId, 'h40');
    assert.equal(resolveAddress(index, 'z500').nodeId, 'z500');
    assert.equal(resolveAddress(index, 'h400').address, 'Universo / Planeta / Brasil / Hive-400');
});
test('endereço exato, com acento e caixa diferente, acha o mesmo nó', () => {
    const index = buildAddressIndex(campaign(), { labelOf });
    const exact = resolveAddress(index, 'Campanha / Hive-40 / Z500');
    const loose = resolveAddress(index, '  campanha/hive-40/z500  ');
    assert.equal(exact.status, 'found');
    assert.equal(exact.nodeId, 'z500');
    assert.equal(loose.nodeId, 'z500');
    assert.equal(
        resolveAddress(index, 'universo / planeta / brasil / hive-400 / nó 30').nodeId,
        'n30',
        'endereço do nó vence a derivação'
    );
});
test('endereço duplicado: o primeiro vence e o repetido vem marcado', () => {
    const graphs = [
        {
            id: 'g',
            name: 'Sala',
            nodes: [
                { id: 'a', type: 'scene', data: { title: 'Porta' } },
                { id: 'b', type: 'scene', data: { title: 'Porta' } },
            ],
        },
    ];
    const index = buildAddressIndex(graphs, { labelOf });
    assert.equal(resolveAddress(index, 'Sala / Porta').nodeId, 'a');
    assert.equal(resolveAddress(index, 'Sala / Porta').duplicate, false);
    assert.equal(index.find((entry) => entry.id === 'b').duplicate, true);
    assert.equal(resolveAddress(index, 'Sala / Nada').status, 'not-found');
    assert.equal(resolveAddress(index, '__proto__').status, 'not-found');
});
test('pai sobe pelo hive-ref; ciclo não trava e a raiz devolve null', () => {
    const graphs = campaign();
    assert.equal(parentGraphId(graphs, 'h40'), 'root');
    assert.equal(parentGraphId(graphs, 'root'), null);
    assert.equal(parentGraphId(graphs, 'fantasma'), null);
    assert.equal(rootGraphId(graphs, 'h40'), 'root');
    const cycle = [
        { id: 'a', nodes: [{ id: 'ra', type: 'hive-ref', data: { graphId: 'b' } }] },
        { id: 'b', nodes: [{ id: 'rb', type: 'hive-ref', data: { graphId: 'a' } }] },
    ];
    assert.equal(rootGraphId(cycle, 'a'), null);
    assert.equal(parentGraphId(cycle, 'a'), 'b');
});
test('âncora mora na raiz e resolve de dentro da Hive', () => {
    const graphs = campaign();
    assert.deepEqual(anchorOf(graphs, 'root', 'intro'), {
        status: 'found',
        graphId: 'root',
        nodeId: 'n1',
    });
    assert.equal(anchorOf(graphs, 'h40', 'output').nodeId, 'n2');
    assert.equal(anchorOf(graphs, 'root', 'bogus').status, 'invalid');
    assert.equal(anchorOf(graphs, 'root', 'intro').status, 'found');
    const empty = [{ id: 'root', name: 'Vazio', nodes: [] }];
    assert.equal(anchorOf(empty, 'root', 'intro').status, 'not-set');
    const dangling = [{ id: 'root', name: 'Solto', anchors: { intro: 'sumiu' }, nodes: [] }];
    assert.equal(anchorOf(dangling, 'root', 'intro').status, 'not-found');
});
test('lista de destinos exclui o grafo atual e mantém os nós internos', () => {
    const index = buildAddressIndex(campaign(), { labelOf });
    const listed = listDestinations(index, { excludeGraphId: 'root' });
    assert.equal(
        listed.some((entry) => entry.id === 'root'),
        false
    );
    assert.equal(
        listed.some((entry) => entry.id === 'n1'),
        true
    );
    assert.equal(
        listDestinations(index).some((entry) => entry.id === 'root'),
        true
    );
});
test('salto direto de Hive-40/Z500 para Hive-400/Nó 30 devolve só o destino', () => {
    const plan = planJump(campaign(), 'h400', 'n30');
    assert.deepEqual(plan, {
        status: 'found',
        graphId: 'h400',
        nodeId: 'n30',
        kind: 'scene',
        via: 'node',
    });
});
test('hive-ref entra pela porta de entrada da Hive', () => {
    const plan = planJump(campaign(), 'root', 'ref');
    assert.equal(plan.status, 'found');
    assert.equal(plan.graphId, 'h40');
    assert.equal(plan.nodeId, 'gate');
    assert.equal(plan.kind, 'hive-entry');
    assert.equal(plan.via, 'hive-ref');
    assert.equal(plan.refNodeId, 'ref');
    assert.equal(plan.portId, 'p1');
});
test('salto para grafo usa o nó ativo; grafo vazio não inventa destino', () => {
    assert.equal(planJump(campaign(), 'h40').nodeId, 'z500');
    assert.equal(planJump(campaign(), 'h400').nodeId, 'n30');
    assert.deepEqual(planJump([{ id: 'v', nodes: [] }], 'v'), { status: 'empty', graphId: 'v' });
});
test('salto recusa destino inexistente, Hive ausente e Hive sem porta', () => {
    assert.equal(planJump(campaign(), 'nao-existe').status, 'not-found');
    assert.equal(planJump(campaign(), 'root', 'nao-existe').status, 'not-found');
    const missing = campaign();
    missing[0].nodes.push({ id: 'quebrado', type: 'hive-ref', data: { graphId: 'sumiu' } });
    assert.deepEqual(planJump(missing, 'root', 'quebrado'), {
        status: 'missing-hive',
        graphId: 'root',
        nodeId: 'quebrado',
        reason: 'missing',
    });
    const noPort = campaign();
    noPort[1].hive.ports = [];
    assert.equal(planJump(noPort, 'root', 'ref').status, 'no-entry');
});

test('resolver e salto não mutam o storyboard nem criam link', () => {
    const graphs = campaign();
    const before = structuredClone(graphs);
    const index = buildAddressIndex(graphs, { labelOf });
    resolveAddress(index, 'Campanha / Hive-40 / Z500');
    listDestinations(index, { excludeGraphId: 'root' });
    anchorOf(graphs, 'h40', 'intro');
    planJump(graphs, 'h400', 'n30');
    planJump(graphs, 'root', 'ref');
    assert.deepEqual(graphs, before);
});
