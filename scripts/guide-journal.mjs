const MODULE_ID = 'lumenn-frame';
export const GUIDE_JOURNAL_NAME = 'Lumenn Frame — Guia passo a passo';

const GUIDE_HTML = `
<h1>Lumenn Frame — Guia passo a passo</h1>
<p>Use este roteiro para montar um storyboard e conduzir a sessão.</p>
<h2>1. Montar o storyboard</h2>
<ol>
  <li>Abra o Lumenn Frame pelo botão do módulo.</li>
  <li>Fique em <strong>Edição</strong>.</li>
  <li>Arraste Scenes, Playlists ou Pastas da barra lateral para o canvas.</li>
  <li>Arraste de <strong>FLOW OUT</strong> para <strong>FLOW IN</strong> para ligar as cenas.</li>
  <li>Use o Inspector para escolher cena, áudio, transição e nota.</li>
</ol>
<h2>2. Foco e zoom</h2>
<ol>
  <li>Clique uma vez com o botão esquerdo em um nó para selecioná-lo e centralizá-lo.</li>
  <li>O foco aumenta o zoom quando necessário; o canvas aceita até 300%.</li>
  <li>Use a roda do mouse ou os botões <strong>−</strong> e <strong>+</strong> para ajustar.</li>
  <li>Arraste com o botão esquerdo para mover o nó. Clique sem arrastar não grava posição.</li>
</ol>
<h2>3. Conduzir ao vivo</h2>
<ol>
  <li>Troque para <strong>Ao Vivo</strong>.</li>
  <li>Clique em um destino navegável para ativar a Scene e aplicar a transição.</li>
  <li>Clique em um nó de áudio para tocar ou fazer fade out.</li>
  <li>O grupo Hive abre quando a cena ativa ou o destino está dentro dele.</li>
</ol>
<p><strong>Regra:</strong> o clique de foco automático vale na Edição. No Ao Vivo, o clique executa a navegação ou o áudio.</p>`;

export function buildGuideJournalData() {
    const format = globalThis.CONST?.JOURNAL_ENTRY_PAGE_FORMATS?.HTML ?? 1;
    const observer = globalThis.CONST?.DOCUMENT_OWNERSHIP_LEVELS?.OBSERVER ?? 2;
    return {
        name: GUIDE_JOURNAL_NAME,
        ownership: { default: observer },
        flags: { [MODULE_ID]: { guide: true } },
        pages: [{
            name: 'Guia rápido',
            type: 'text',
            text: { format, content: GUIDE_HTML },
        }],
    };
}

export async function openLumennGuide() {
    const existing = game.journal?.find?.((journal) =>
        journal.getFlag?.(MODULE_ID, 'guide') === true || journal.name === GUIDE_JOURNAL_NAME
    );
    const journal = existing ?? (game.user?.isGM && globalThis.JournalEntry?.create
        ? await JournalEntry.create(buildGuideJournalData())
        : null);
    if (!journal) {
        ui.notifications?.warn?.(game.i18n.localize('LUMENN_FRAME.GuideUnavailable'));
        return null;
    }
    journal.sheet?.render(true);
    return journal;
}
