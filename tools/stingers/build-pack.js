// Reconstrói o compêndio "Lumenn Frame: Transições" a partir de scripts/transition-presets.mjs.
// Cole no console (F12) do Foundry como GM, num mundo de TESTE com o módulo ativo.
// Os _id são fixos: rodar de novo substitui as macros em vez de duplicar.
// Depois: volte ao Setup (o LevelDB compacta ao fechar) e copie
// Data/modules/lumenn-frame/packs/lumenn-transitions para packs/ do repo (sem LOCK e LOG).
(async () => {
    const { TRANSITION_PRESETS, presetMacroData } = await import(
        '/modules/lumenn-frame/scripts/transition-presets.mjs'
    );
    const pack = game.packs.get('lumenn-frame.lumenn-transitions');
    await pack.configure({ locked: false });
    const old = (await pack.getIndex()).map((e) => e._id);
    if (old.length) await Macro.deleteDocuments(old, { pack: pack.collection });
    await Macro.createDocuments(
        TRANSITION_PRESETS.map((p, i) => presetMacroData(p, i)),
        { pack: pack.collection, keepId: true }
    );
    await pack.configure({ locked: true });
    console.log(`Lumenn Frame: ${TRANSITION_PRESETS.length} transições no compêndio.`);
})();
