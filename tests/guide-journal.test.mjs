import test from 'node:test';
import assert from 'node:assert/strict';
import { GUIDE_JOURNAL_NAME, buildGuideJournalData } from '../scripts/guide-journal.mjs';

test('guia gera um Journal de uma página com passos de foco, zoom e Ao Vivo', () => {
    const data = buildGuideJournalData();
    assert.equal(data.name, GUIDE_JOURNAL_NAME);
    assert.equal(data.pages[0].type, 'text');
    assert.match(data.pages[0].text.content, /Clique uma vez com o botão esquerdo/);
    assert.match(data.pages[0].text.content, /até 300%/);
    assert.match(data.pages[0].text.content, /Ao Vivo/);
});
