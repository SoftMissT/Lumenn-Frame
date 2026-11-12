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
  <li>O grupo abre quando a cena ativa ou o destino está dentro dele.</li>
</ol>
<h2>4. Hive: um Grupo vira um storyboard inteiro</h2>
<ol>
  <li><strong>Criar:</strong> monte um Grupo com as salas (cenas, músicas, notas). Selecione o Grupo e clique <strong>Virar Hive</strong>.</li>
  <li><strong>Portas automáticas:</strong> setas que entravam no Grupo viram <strong>portas de entrada</strong>; setas que saíam viram <strong>portas de saída</strong>. Renomeie no Inspector, sem nada selecionado, se quiser.</li>
  <li><strong>Um nó só:</strong> no storyboard-pai o Grupo vira um nó Hive com nome e capa, ligado às mesmas setas.</li>
  <li><strong>Ver por dentro:</strong> clique <strong>Entrar</strong> no nó. Na Edição você edita a Hive inteira; use <strong>Voltar para</strong> na barra do topo.</li>
  <li><strong>Trocar de storyboard:</strong> clique no nome do storyboard no topo para abrir o seletor (todos, só storyboards ou só Hives) e use ‹ › para voltar e avançar.</li>
  <li><strong>Biblioteca:</strong> o painel <strong>Biblioteca de Hives</strong> fica no canto do canvas. Arraste uma Hive para outro storyboard ou use <strong>Adicionar ao canvas</strong>. Editar a Hive atualiza todos os usos.</li>
  <li><strong>Jogar:</strong> no Ao Vivo, clique no nó Hive (ou em <strong>Entrar</strong>): a câmera entra no nó e a transição de entrada roda. Dentro, navegue pelas salas e clique nos Encontros para tocar a música deles.</li>
  <li><strong>Sair:</strong> na sala da porta de saída, clique <strong>Sair por …</strong> na barra da trilha. Os jogadores veem uma <strong>cutscene de filme</strong> (faixas de cinema e título); sua tela de mestre não escurece e a música fica como está. A cena vai direto para o destino da seta no pai.</li>
  <li><strong>Transições de cinema:</strong> em qualquer seta e na entrada/saída da Hive escolha entre os efeitos <strong>Cinema (Lumenn)</strong> (cutscene, íris, varredura, cortinas, persiana, flash, sonho, película queimando) e as nativas do Foundry. Os de cinema aparecem só para os jogadores; use <strong>Preview</strong> na seta para ver na sua tela. Em cada um você define duração e o que acontece com a música.</li>
  <li><strong>Exportar/Importar:</strong> leve a Hive para outro mundo. Cenas e áudios são casados pelo nome; o que faltar aparece em <strong>Pendentes</strong> para religar.</li>
</ol>
<h2>5. Stinger de vídeo (transição feita no editor)</h2>
<ol>
  <li>No editor de vídeo, faça a transição com 1 a 3 s e fundo transparente. Marque o momento em que ela cobre a tela toda: esse é o <strong>ponto de corte</strong>.</li>
  <li>Exporte em <strong>WebM VP9 com transparência</strong>, 1920×1080. Se o editor só exporta .mov com alfa, converta: <code>ffmpeg -i entrada.mov -c:v libvpx-vp9 -pix_fmt yuva420p -b:v 2M saida.webm</code>.</li>
  <li>Coloque o arquivo na pasta de dados do Foundry. Na seta (ou na entrada/saída da Hive) escolha <strong>Stinger de vídeo (.webm)</strong>, clique na pasta para escolher o arquivo e informe o ponto de corte em milissegundos.</li>
  <li>Os jogadores baixam o vídeo antes; a cena troca no ponto de corte, por baixo do vídeo. O vídeo toca mudo, a menos que você marque <strong>Tocar o som do vídeo</strong>.</li>
</ol>
<p><strong>Regra:</strong> o clique de foco automático vale na Edição. No Ao Vivo, o clique executa a navegação ou o áudio.</p>`;
export const GUIDE_VERSION = 4;

export function buildGuideJournalData() {
    const format = globalThis.CONST?.JOURNAL_ENTRY_PAGE_FORMATS?.HTML ?? 1;
    const observer = globalThis.CONST?.DOCUMENT_OWNERSHIP_LEVELS?.OBSERVER ?? 2;
    return {
        name: GUIDE_JOURNAL_NAME,
        ownership: { default: observer },
        flags: { [MODULE_ID]: { guide: true, guideVersion: GUIDE_VERSION } },
        pages: [
            {
                name: 'Guia rápido',
                type: 'text',
                text: { format, content: GUIDE_HTML },
            },
        ],
    };
}

export async function openLumennGuide() {
    const existing = game.journal?.find?.(
        (journal) =>
            journal.getFlag?.(MODULE_ID, 'guide') === true || journal.name === GUIDE_JOURNAL_NAME
    );
    const journal =
        existing ??
        (game.user?.isGM && globalThis.JournalEntry?.create
            ? await JournalEntry.create(buildGuideJournalData())
            : null);
    if (!journal) {
        ui.notifications?.warn?.(game.i18n.localize('LUMENN_FRAME.GuideUnavailable'));
        return null;
    }
    // Guia antigo: o GM atualiza o texto da página no lugar, sem criar outro Journal.
    if (
        existing &&
        game.user?.isGM &&
        (existing.getFlag?.(MODULE_ID, 'guideVersion') ?? 1) < GUIDE_VERSION
    ) {
        const page = existing.pages?.contents?.[0] ?? existing.pages?.find?.(() => true);
        if (page) await page.update({ 'text.content': GUIDE_HTML });
        await existing.setFlag?.(MODULE_ID, 'guideVersion', GUIDE_VERSION);
    }
    journal.sheet?.render(true);
    return journal;
}
