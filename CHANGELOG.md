# Changelog

## [0.1.1] — 2026-09-14

Correções de auditoria contra o SDD (3 críticos que travavam o módulo em runtime) + fechamento dos bloqueios de API.

### Corrigido
- **Deadlock de navegação**: `activeBeatId` nascia `null` e nada podia defini-lo — nem `goToBeat` (exige Beat ativo) nem `Link` (conecta a partir do ativo). Novo botão **"Início"** no modo Edição define o Beat ativo sem disparar transição.
- **Resolução de playlist quebrada**: motor usava `fromUuidSync()` com id cru de Playlist (que espera UUID `Playlist.xyz`). Agora resolve via `game.playlists.get()`; tracks continuam por UUID.
- **`PlaylistSound#sound` é lazy** (doc oficial v13): null até o som tocar. Motor reescrito para transições **dirigidas por documento** (`update({fadeDuration, playing})`, `Playlist#playAll/stopAll`) — Sound#fade local não é transmitido aos clientes; agora o crossfade é ouvido por todos os jogadores.
- `LumennInvalidAudioSourceError` tipado (Specs §4.1): fonte destino inválida sinaliza o Beat sem quebrar a navegação (RF-011).
- Assinatura do controller conforme Specs §2.3: `goToBeat(storyboardId, targetBeatId)`.

### Adicionado
- `macros/test-audio-engine.mjs` — suíte manual do motor (Artigo II da Constitution, Blueprint Fase 2): CT-001/002/003/006/007, started, playlist, fonte inválida; mede despacho (RNF-002 ≤ 100ms).
- Classes expostas em `game.modules.get("lumenn-frame").api` para teste isolado.

### Verificado na doc oficial v13 (bloqueios do Research/Specs §8 fechados)
- `Scene#activate()` — "Set this scene as currently active".
- `PlaylistSound#sound` — "created lazily when playback is required".
- `Playlist#playAll/stopAll`, `PlaylistSound#update({fadeDuration, playing})`, `updateEmbeddedDocuments` (batch).

### Emenda técnica (requer propagação ao Specs §4.1)
Transições usam documentos em vez de `Sound#fade()` direto: fades locais não sincronizam entre clientes. O patch de `fadeDuration` persiste no som (efeito colateral necessário para duração por Beat — RF-006/RF-012).

## [0.1.0] — 2026-09-14

Primeira implementação completa das 4 camadas (Blueprint §3.1).

- `LumennAudioEngine` (motor de continuidade), `LumennBeatStore` (CRUD via `game.settings` world), `LumennTransitionController` (orquestrador GM-only), `LumennStoryboardApp` (ApplicationV2 + Handlebars, modos Edição/Ao Vivo).
- Schema do Beat conforme Specs §3.1 (sceneId, audioSource, crossfadeDuration, connections, position).
- Settings: `storyboards` (world, oculto), `defaultCrossfadeDuration` (world, configurável).
- i18n en/pt-BR, CSS, templates Handlebars, helpers customizados.

## [0.0.1] — 2026-09-14

Bootstrap do módulo Foundry VTT.

- Manifesto `module.json` (`lumenn-frame`, compatibilidade 13.350–14.999).
- Entrypoint ESM vazio.
- Estrutura `scripts/`, `styles/`, `templates/`, `lang/` (en, pt-BR).
