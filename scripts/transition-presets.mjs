/**
 * Transições prontas do Lumenn Frame. Cada uma vira uma macro do compêndio
 * `lumenn-frame.lumenn-transitions`: com uma ligação selecionada no editor, a macro grava
 * a transição de cena nela. Puro: sem Foundry, testável em Node.
 */
import { STINGER_DIR, stingerSrc } from './film-transitions.mjs';

const ICONS = 'icons/svg';
const thumb = (id) => `${STINGER_DIR}/${id}.webp`;
const stinger = (id, name, ms) => ({
    id: `stinger-${id}`,
    name: `Stinger · ${name}`,
    img: thumb(id),
    scene: { type: 'film:video', duration: ms, video: { src: stingerSrc(id) } },
});

export const TRANSITION_PRESETS = Object.freeze([
    stinger('ink', 'Tinta', 1600),
    stinger('burn', 'Filme queimado', 1800),
    stinger('leak', 'Luz vazada', 1600),
    stinger('slash', 'Corte de espada', 1500),
    stinger('glitch', 'Glitch', 1400),
    stinger('hyper', 'Hiperespaço', 1600),
    {
        id: 'cutscene',
        name: 'Cinema · Cutscene com título',
        img: `${ICONS}/book.svg`,
        scene: {
            type: 'film:cutscene',
            duration: 2600,
            title: { font: 'Orbitron', color: '#ffd166', size: 96 },
        },
    },
    { id: 'battle', name: 'RPG · Batalha', img: `${ICONS}/combat.svg`, scene: { type: 'film:battle', duration: 1600 } },
    { id: 'iris', name: 'Cinema · Íris', img: `${ICONS}/eye.svg`, scene: { type: 'film:iris', duration: 1600 } },
    { id: 'curtain', name: 'Cinema · Cortina', img: `${ICONS}/door-closed.svg`, scene: { type: 'film:curtain', duration: 1800 } },
    {
        id: 'cross-dissolve',
        name: 'Câmera · Dissolver cruzado',
        img: `${ICONS}/clockwork.svg`,
        scene: { type: 'lumenn-cross-dissolve', duration: 1000 },
    },
    { id: 'zoom-in', name: 'Câmera · Zoom in', img: `${ICONS}/upgrade.svg`, scene: { type: 'lumenn-zoom-in', duration: 1000 } },
    { id: 'zoom-out', name: 'Câmera · Zoom out', img: `${ICONS}/downgrade.svg`, scene: { type: 'lumenn-zoom-out', duration: 1000 } },
    { id: 'bounce-in', name: 'Câmera · Bounce in', img: `${ICONS}/sun.svg`, scene: { type: 'lumenn-bounce-in', duration: 1100 } },
    { id: 'slide', name: 'Câmera · Deslizar', img: `${ICONS}/wing.svg`, scene: { type: 'lumenn-slide', duration: 900 } },
    { id: 'pixelate', name: 'RPG · Pixel retrô', img: `${ICONS}/dice-target.svg`, scene: { type: 'lumenn-pixelate', duration: 1200 } },
]);

export const presetById = (id) => TRANSITION_PRESETS.find((p) => p.id === id) ?? null;

/** Texto da macro: chama a API pública com o id do preset. */
export function presetMacroCommand(id) {
    return `// Lumenn Frame: selecione uma ligação no editor e rode esta macro.\nawait game.modules.get('lumenn-frame')?.api?.applyTransition(${JSON.stringify(id)});`;
}

/** Dados da macro do compêndio (o `_id` estável deixa reconstruir o pacote sem duplicar). */
export function presetMacroData(preset, index) {
    return {
        _id: `lfTransition${String(index).padStart(4, '0')}`,
        name: preset.name,
        type: 'script',
        img: preset.img,
        command: presetMacroCommand(preset.id),
        sort: (index + 1) * 100,
        flags: { 'lumenn-frame': { transitionPreset: preset.id } },
    };
}
