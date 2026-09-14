# Changelog

Todas as entregas abaixo estão dentro da **0.0.1** (em desenvolvimento a versão só sobe depois do gate de validação em Foundry real). Semver: 0.0.x até a primeira validação de runtime; então 0.1.0.

## [0.0.1] 2026-09-14

### Bootstrap

- Manifesto `module.json` (`lumenn-frame`, compatibilidade **13.350 → 14.999**, verified 14.367 stable atual).
- Estrutura `scripts/`, `styles/`, `templates/`, `lang/` (en, pt-BR).

### Implementação (4 camadas, Blueprint §3.1)

- `LumennAudioEngine` motor de continuidade isolado (manter/crossfade/fade-out).
- `LumennBeatStore` CRUD sobre `game.settings` escopo `world`; schema do Beat conforme Specs §3.1.
- `LumennTransitionController` `goToBeat(storyboardId, targetBeatId)`; GM-only (RF-009), conexão validada (RF-010), fonte inválida não quebra navegação (RF-011).
- `LumennStoryboardApp` + `BeatConfigDialog` **ApplicationV2 + HandlebarsApplicationMixin** em todas as janelas; modos Edição/Ao Vivo.
- Settings: `storyboards` (world, oculto), `defaultCrossfadeDuration` (world, configurável, RF-012).

### Correções de auditoria SDD (3 críticos de runtime)

- **Deadlock de navegação**: `activeBeatId` nascia `null` e nada o definia. Botão **"Início"** (modo Edição) define o Beat ativo sem disparar transição.
- **Playlist quebrada**: `fromUuidSync()` com id cru de Playlist não resolve agora `game.playlists.get()` (tracks seguem por UUID).
- **`PlaylistSound#sound` é lazy** (doc oficial: "created lazily when playback is required") motor reescrito para **transições dirigidas por documento** (`update({fadeDuration, playing})`, `Playlist#playAll/stopAll`). `Sound#fade` local não é transmitido entre clientes; com documento, todos os jogadores ouvem o crossfade.
- `LumennInvalidAudioSourceError` tipado (Specs §4.1).

### Artigo II motor validável isoladamente

- `macros/test-audio-engine.mjs`: CT-001/002/003/006/007 + started + playlist inteira + fonte inválida; mede despacho (RNF-002 ≤ 100ms); restaura o estado ao final.
- Classes expostas em `game.modules.get("lumenn-frame").api`.

### APIs verificadas na doc oficial (bloqueios do Research/Specs §8 fechados)

- v13: `Scene#activate()`; `PlaylistSound#sound` (lazy); `PlaylistSound#update({fadeDuration, playing})`; `Playlist#playAll/stopAll`; `Playlist#updateEmbeddedDocuments`.
- Stable atual da faixa: **v14.367** (18/08/2026). APIs usadas são estáveis v13→v14 (documentos + ApplicationV2).

### Emenda técnica (pendente de propagação ao Specs §4.1)

Transições via documento em vez de `Sound#fade()` direto fades locais não sincronizam entre clientes. O patch de `fadeDuration` persiste no som (necessário para RF-006/RF-012).

### Gate antes de subir versão

- [ ] Rodar `macros/test-audio-engine.mjs` em mundo real (v14.367 e, se possível, 13.350+).
- [ ] CT-001..CT-008 manuais conforme Specs §5.
