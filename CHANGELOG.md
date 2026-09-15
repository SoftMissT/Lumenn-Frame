# Changelog

As versões 0.0.x permanecem pré-validação de runtime em Foundry real. Semver: 0.0.x até a primeira validação; então 0.1.0.

## [0.0.6] 2026-09-15

### Correção

- Templates `storyboard.hbs` e `beat-config.hbs` renderizavam múltiplos elementos raiz — ApplicationV2 exige um único elemento por `PARTS`. Embrulhados em `<div class="lf-root">` e `<div class="bc-body">`.
- Layout flex movido para `.lf-root`; `BeatConfigDialog` sem `form.closeOnSubmit` redundante.

## [0.0.5] 2026-09-15

> Consolidação final: 0.0.3/0.0.4 foram tags de trabalho intermediárias.

### UI/UX — Cinematic Edit Bay

- Redesign completo do canvas: tema dark near-black (`#0c0c0f`), film grain, vignette, conectores bezier com seta, fontes Modesto Condensed + Montserrat.
- Thumbnails de Scene nos Beat cards (16:9) + ícone de tipo de áudio (faixa/playlist).
- Seletor de fonte de áudio com **abas** "Nenhum / Faixa / Playlist" (PDR Decisão #4).
- Empty state com instruções de drag-and-drop.

### Drag & Drop

- Arrastar Scene da sidebar → cria Beat; sobre Beat existente → substitui Scene.
- Arrastar Playlist/PlaylistSound → define a fonte de áudio do Beat.
- `DragDrop` (ApplicationV2) em `foundry.applications.ux`.

### Conformidade SDD (reconciliação)

- **Navegação ao vivo** (US-002/RF-004): clique no Beat conectado (modo Ao Vivo) → `Scene.activate()` + transição de áudio.
- **Indicador de transição** (US-D001): overlay "Transicionando…" durante o crossfade.
- **Beats não-conectados esmaecidos** (PDR Clarification #2/RF-010) no modo Ao Vivo.
- **Ações de edição ocultas no Ao Vivo** (US-D002).
- **Confirmação de delete** (storyboard + Beat) via `DialogV2.confirm`.
- **i18n completo** en/pt-BR em todos os templates e settings.

### Correções

- `DragDrop` importado de `foundry.applications.ux` (não `applications.api`).
- Manifest apontando para `releases/latest/download/module.json` (convenção do repo), com `module.json` + zip como assets do release.
- Settings `name`/`hint` localizados via i18n.

### SDD

- Arquivos canônicos `Specs/Requirements/Blueprint` restaurados (RF-013, `currentMode`, CT-009/010/011).
- Emenda do motor dirigido por documento propagada ao **Specs §4.1** + **Blueprint §3.3**.

### Gate antes de subir versão

- [ ] Rodar `macros/test-audio-engine.mjs` em mundo real (v14.367 e, se possível, 13.350+).
- [ ] CT-001..CT-011 manuais conforme Specs §5.

## [0.0.2] 2026-09-14

### Correção de HUD e controles

- Corrigido o hook para `getSceneControlButtons`, compatível com Foundry v13/v14.
- Corrigido o callback do botão para `onChange`, mantendo fallback `onClick`.
- Corrigida a resolução de faixas por ID embutido de `PlaylistSound` ou UUID completo.
- Canvas, controles de música, CRUD e modos Edição/Ao Vivo mantidos no pacote.
- README atualizado para refletir o fluxo funcional.

**Validação:** `node --check`, imports ESM, JSON do manifesto e `git diff --check` aprovados.

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
