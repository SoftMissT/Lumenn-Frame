import test from 'node:test';
import assert from 'node:assert/strict';
import {
    createNavigationTrail,
    currentNavigationLevel,
    detectHiveCycles,
    matchNamedResources,
    popNavigationLevel,
    pushNavigationLevel,
    resolveHivePort,
    setNavigationNode,
    validateHiveExport,
} from '../scripts/hive-runtime.mjs';
test('detecta ciclo direto e indireto entre Hives', () => {
    assert.deepEqual(
        detectHiveCycles([
            {
                id: 'a',
                references: ['a'],
            },
            {
                id: 'b',
                references: ['c'],
            },
            {
                id: 'c',
                references: ['b'],
            },
        ]),
        [
            ['a', 'a'],
            ['b', 'c', 'b'],
        ]
    );
});
test('resolve porta por nome sem perder a sala interna', () => {
    const hive = {
        nodes: [
            {
                id: 'gym',
                type: 'scene',
            },
        ],
        ports: [
            {
                id: 'p1',
                name: 'Ginásio',
                direction: 'entry',
                nodeId: 'gym',
            },
        ],
    };
    assert.deepEqual(resolveHivePort(hive, 'ginásio'), {
        id: 'p1',
        name: 'Ginásio',
        direction: 'entry',
        nodeId: 'gym',
        node: {
            id: 'gym',
            type: 'scene',
        },
    });
});
test('trilha empilha, atualiza a sala ativa e desempilha sem mutar a original', () => {
    const root = createNavigationTrail('parent', 'outside');
    const nested = pushNavigationLevel(root, {
        graphId: 'school',
        activeNodeId: 'gate',
        viaPortId: 'in',
        refNodeId: 'ref',
        fromNodeId: 'outside',
    });
    const moved = setNavigationNode(nested, 'school', 'gym');
    const popped = popNavigationLevel(moved);
    assert.equal(currentNavigationLevel(moved).activeNodeId, 'gym');
    assert.equal(currentNavigationLevel(moved).refNodeId, 'ref');
    assert.equal(currentNavigationLevel(moved).fromNodeId, 'outside');
    assert.equal(popped.level.graphId, 'school');
    assert.deepEqual(popped.trail, root);
    assert.equal(currentNavigationLevel(root).activeNodeId, 'outside');
});
test('casamento por nome separa match único, pendente ausente e ambíguo', () => {
    const result = matchNamedResources(
        [
            {
                name: 'Entrada',
            },
            {
                name: 'Som',
            },
            {
                name: 'Duplicado',
            },
        ],
        [
            {
                id: 'scene-1',
                name: 'entrada',
            },
            {
                id: 'audio-1',
                name: 'Som',
            },
            {
                id: 'a',
                name: 'Duplicado',
            },
            {
                id: 'b',
                name: 'Duplicado',
            },
        ]
    );
    assert.deepEqual(
        result.matches.map(({ resource }) => resource.id),
        ['scene-1', 'audio-1']
    );
    assert.deepEqual(
        result.pending.map(({ reason }) => reason),
        ['ambiguous']
    );
});
test('validação rejeita porta órfã, direção inválida e ciclo', () => {
    const result = validateHiveExport({
        hives: [
            {
                id: 'a',
                references: ['b'],
                nodes: [
                    {
                        id: 'scene',
                        type: 'scene',
                    },
                ],
                ports: [
                    {
                        id: 'in',
                        name: 'Entrada',
                        direction: 'entry',
                        nodeId: 'missing',
                    },
                    {
                        id: 'out',
                        name: 'Entrada',
                        direction: 'side',
                        nodeId: 'scene',
                    },
                ],
            },
            {
                id: 'b',
                references: ['a'],
                nodes: [],
                ports: [],
            },
        ],
    });
    assert.equal(result.valid, false);
    assert.ok(result.errors.some((error) => error.includes('ciclo de Hive')));
    assert.ok(result.errors.some((error) => error.includes('sala ausente')));
    assert.ok(result.errors.some((error) => error.includes('direção')));
});
