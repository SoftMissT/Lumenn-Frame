/**
 * O que o clique esquerdo faz num nó. Puro: o clique, o escurecimento e a dica
 * usam esta mesma função, então nenhum dos três pode mentir sobre os outros.
 *
 * Regra de ouro: o GM no Ao Vivo salta direto para QUALQUER nó (v0.0.35); só o
 * jogador depende de ligação direta. Por isso só o jogador tem nó "bloqueado".
 */
export const CLICK_INTENTS = Object.freeze(['select', 'jump', 'follow', 'play', 'blocked', 'none']);
/** Detalhe do salto do GM: o que acontece ao chegar naquele tipo de nó. */
export function jumpDetail(nodeType, { isActive = false } = {}) {
    if (isActive) return 'here';
    switch (nodeType) {
        case 'scene':
            return 'scene';
        case 'audio':
            return 'audio';
        case 'hive-ref':
            return 'hive';
        case 'encounter':
            return 'encounter';
        default:
            return 'select';
    }
}
/**
 * @param {object} state
 * @param {'edit'|'live'} state.mode
 * @param {boolean} state.isGM
 * @param {string} [state.tool]        Ferramenta de Edição ('select', 'hand', 'connect', ...).
 * @param {string} [state.nodeType]
 * @param {boolean} [state.isActive]   O nó (ou o grupo que o contém) é o ativo.
 * @param {boolean} [state.isLinked]   Há ligação direta do nó ativo até ele.
 * @param {boolean} [state.isPlayable] Nó de áudio/encontro que o jogador pode tocar.
 * @returns {{intent: 'select'|'jump'|'follow'|'play'|'blocked'|'none', detail: string}}
 */
export function nodeClickIntent({
    mode,
    isGM,
    tool = 'select',
    nodeType = '',
    isActive = false,
    isLinked = false,
    isPlayable = false,
} = {}) {
    if (mode === 'live') {
        if (isGM)
            return {
                intent: 'jump',
                detail: jumpDetail(nodeType, {
                    isActive,
                }),
            };
        if (isLinked)
            return {
                intent: 'follow',
                detail: nodeType === 'hive-ref' ? 'hive' : 'scene',
            };
        if (isPlayable)
            return {
                intent: 'play',
                detail: 'audio',
            };
        return {
            intent: 'blocked',
            detail: isActive ? 'here' : 'unlinked',
        };
    }
    if (tool === 'connect' || tool === 'hand')
        return {
            intent: 'none',
            detail: tool,
        };
    return {
        intent: 'select',
        detail: 'select',
    };
}
/** Escurece só quando o clique realmente não faz nada: nunca para o GM. */
export function isNodeDimmed(intent, { isActive = false, enabled = true } = {}) {
    return enabled && intent === 'blocked' && !isActive;
}
/** Chave i18n da dica: `LUMENN_FRAME.Intent.<intent>.<detail>`. */
export function intentHintKey({ intent, detail }) {
    return `LUMENN_FRAME.Intent.${intent}.${detail}`;
}
