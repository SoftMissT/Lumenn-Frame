/**
 * Fontes do módulo (SIL OFL 1.1, licença em assets/fonts/<família>/OFL.txt).
 * Registradas em CONFIG.fontDefinitions: aparecem também no editor de texto,
 * notas e desenhos do Foundry, e no seletor de fonte do título da cutscene.
 */
const BASE = 'modules/lumenn-frame/assets/fonts';

export const LUMENN_FONTS = Object.freeze({
    Orbitron: [{ urls: [`${BASE}/orbitron/Orbitron-VariableFont_wght.ttf`], weight: '400 900' }],
    Rajdhani: [
        { urls: [`${BASE}/rajdhani/Rajdhani-Regular.ttf`], weight: '400' },
        { urls: [`${BASE}/rajdhani/Rajdhani-SemiBold.ttf`], weight: '600' },
        { urls: [`${BASE}/rajdhani/Rajdhani-Bold.ttf`], weight: '700' },
    ],
    'Bebas Neue': [{ urls: [`${BASE}/bebas-neue/BebasNeue-Regular.ttf`], weight: '400' }],
    'Noto Serif JP': [{ urls: [`${BASE}/noto-serif-jp/NotoSerifJP-Bold.ttf`], weight: '700' }],
});

/** Fontes oferecidas no título da cutscene: as do módulo primeiro, depois as do core. */
export const TITLE_FONTS = Object.freeze([
    'Orbitron',
    'Bebas Neue',
    'Rajdhani',
    'Noto Serif JP',
    'Bruno Ace',
    'Modesto Condensed',
    'Signika',
    'Amiri',
]);

export function registerLumennFonts() {
    const defs = (globalThis.CONFIG ??= {}).fontDefinitions;
    if (!defs) return [];
    for (const [family, fonts] of Object.entries(LUMENN_FONTS)) {
        // Não sobrescreve uma família que o mundo ou outro módulo já definiu.
        if (!defs[family]) defs[family] = { editor: true, fonts: fonts.map((font) => ({ ...font })) };
    }
    return Object.keys(LUMENN_FONTS);
}
