/**
 * Macro de teste (contexto: macro de GM, Foundry 14). Reexecuta a matriz do spike da visita
 * (`docs/spikes/visita-view.md`). Precisa de um jogador conectado em outro navegador: o GM altera a
 * cena de teste e o jogador roda a parte "no cliente do jogador" no console dele.
 *
 * Uso: troque SALA pelo nome de uma cena inativa de um MUNDO DE TESTE. Ela grava `tokenVision` e a
 * permissão padrão dessa cena; não rode em mesa real.
 */
const SALA = 'QA Sala 2';
const scene = game.scenes.getName(SALA);
if (!scene) return ui.notifications.error(`Cena "${SALA}" não existe.`);

const combos = [
    { vision: true, perm: 0 },
    { vision: false, perm: 0 },
    { vision: true, perm: 2 },
    { vision: false, perm: 2 },
];
for (const { vision, perm } of combos) {
    await scene.update({ tokenVision: vision, 'ownership.default': perm });
    console.log(`Cena pronta: tokenVision=${vision}, permissão=${perm}. Rode no console do JOGADOR:`);
    console.log(
        `(async()=>{const s=game.scenes.get('${scene.id}');await s.view();await new Promise(r=>setTimeout(r,3500));` +
            `console.log({viewing:canvas.scene?.id===s.id,ready:canvas.ready});await game.scenes.active.view();})()`
    );
    await new Promise((resolve) => setTimeout(resolve, 15000));
}
// O caminho final (opção D) é o que o módulo usa: LumennCompat.visitScene(scene) -> { restore }.
