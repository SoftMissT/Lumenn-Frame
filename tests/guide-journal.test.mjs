import test from 'node:test';
import assert from 'node:assert/strict';
import {
    GUIDE_JOURNAL_NAME,
    GUIDE_VERSION,
    buildGuideJournalData,
} from '../scripts/guide-journal.mjs';
test('guia gera um Journal de uma página com passos de foco, zoom e Ao Vivo', () => {
    const data = buildGuideJournalData();
    assert.equal(data.name, GUIDE_JOURNAL_NAME);
    assert.equal(data.pages[0].type, 'text');
    assert.match(data.pages[0].text.content, /Clique uma vez com o botão esquerdo/);
    assert.match(data.pages[0].text.content, /até 300%/);
    assert.match(data.pages[0].text.content, /Ao Vivo/);
});
test('guia explica a pipeline da Hive e marca a versão para atualizar guias antigos', () => {
    const { content } = buildGuideJournalData().pages[0].text;
    for (const step of [
        'Virar Hive',
        'Portas automáticas',
        'Biblioteca de Hives',
        'Entrar',
        'cutscene',
        'Exportar/Importar',
    ]) {
        assert.match(content, new RegExp(step));
    }
    assert.equal(buildGuideJournalData().flags['lumenn-frame'].guideVersion, GUIDE_VERSION);
});
