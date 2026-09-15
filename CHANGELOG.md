# Changelog

As versões 0.0.x permanecem pré-validação de runtime em Foundry real. Semver: 0.0.x até a primeira validação; então 0.1.0.

## [0.0.15-alpha.2] - 2026-09-15

> Graph Editor 2.0 — runtime validation build for Foundry VTT 14.367 (primary), backward compatible with 13.350+. **Not a stable release.**

### Added

- Workspace expansion (`Expand`/`Restore`)
- Infinite canvas / camera
- Pan (Space + drag, middle mouse)
- Zoom (cursor-centered)
- Fit All / 100% reset
- Scene Nodes
- Audio Nodes
- Note Nodes
- Per-node colors
- Per-node sizes (`compact` / `normal` / `large`)
- Inspector (contextual: graph / node / edge)
- FLOW ports
- AUDIO ports
- Port-to-port connection UX (ghost + target highlight + Escape)
- Directional FLOW edges
- AUDIO attachment edges
- Reciprocal flow support (`A→B` / `B→A` independent)
- Selectable edges (thick hit target)
- Transition Inspector
- `Add return B → A` action
- Graph Schema v2 (`graphs`: nodes[] + edges[])
- Legacy migration (schema v1 → v2, backup + idempotent)
- Foundry compatibility layer (`scripts/foundry-compat.mjs`)
- Module socket infrastructure (`socket: true`)

### Transitions

- Per-FLOW-edge Scene transition configuration (`Cut` / `Fade`)
- Per-FLOW-edge Audio transition configuration (`Auto` / `Keep` / `Crossfade` / `Fade Out` / `Fade In`)
- Configurable Scene transition duration
- Configurable Audio crossfade duration
- Audio source resolution through Audio Nodes

### Compatibility

- Primary target Foundry 14.367
- Minimum Foundry 13.350
- Maximum Foundry 14.999
- V14-first compatibility architecture
- V13 compatibility adapter (`foundry-compat.mjs`)
- `COMPATIBILITY.md` matrix (V14 implementation / V13 fallback / source)

### Changed

- Beat-centric data model replaced by Graph Schema v2
- Audio is now represented by dedicated Audio Nodes (not a generic Beat field)
- Node actions moved toward the contextual Inspector (away from tiny per-card buttons)
- Camera navigation replaces scroll-bound canvas behavior

### Known Validation Gaps

- Real audio crossfade still requires runtime QA
- Scene fade overlay requires runtime QA
- GM → Player synchronization requires two-client QA
- Foundry 14.367 runtime QA pending
- Foundry 13.350 compatibility smoke test pending

## [0.0.15-alpha.1]

> **ALPHA / runtime validation build** — Graph Editor 2.0, **Phase A: Camera only**. Nenhuma feature de Fase B (schema v2, ports, Inspector, novos node types) incluída.

### Graph Editor 2.0 — Phase A: Camera

- viewport/camera/world architecture
- pan with Space + drag
- pan with middle mouse
- cursor-centered zoom
- zoom controls
- reset 100%
- Fit All
- world/screen coordinate conversion
- node drag aware of zoom
- edges transformed with camera
- camera state local to client

**QA de runtime (AT-CAM-01..15):** abrir grafo existente; space/meio-botão pan sem alterar positions; zoom centrado no cursor; botões -/+/100%/Fit; node drag aderente em 25–200%; edges presas aos nós sob pan/zoom; 20+ nós fluido; nenhum `game.settings.set` durante pan/zoom; console sem exceptions.

## 0.0.14-beta.2

### Runtime validation build (QA)

> Runtime idêntico ao `0.0.14-beta.1` (nenhum script/style/template alterado). Esta tag é uma entrada limpa de teste via GitHub: instale pelo manifesto da tag — `https://github.com/SoftMissT/Lumenn-Frame/releases/download/v0.0.14-beta.2/module.json` — e rode o QA.

### Documentação (Specs locais — SDD gitignored, fora do pacote)

- **FLOW EDGES formalizado** nas Specs (§3.4): o storyboard é um **grafo direcionado** — `A -> B` não implica `B -> A`; recíproca exige as duas arestas; branching/ciclos/múltiplas entradas-saídas válidos; `activeBeatId` nunca restringe edges em Edição; `connections[]` = outgoing FLOW edges; self-edge proibida; Ao Vivo segue só outgoing.
- **CT-FLOW-01..05** adicionados às Specs (§5) como checklist do QA de grafo.

### QA de runtime — escopo

1. Responsividade (1920/1600/1366 + resize) — toolbar sem cortes, toggle acessível.
2. Drop: Scene/Playlist/Folder em canvas vazio e existente.
3. Grafo: A→B, B→A, branching A→B/C/D, ciclo A→B→C→A (CT-FLOW-01..05).
4. Move + scroll + resize — conectores corretos.
5. Persistência após reload (positions, sceneId, audioSource, connections, activeBeatId).
6. Modos Edição/Ao Vivo — guards estruturais.

## 0.0.14-beta.1

### Fixed / Testing

> Build de validação de runtime — os bugs abaixo estão corrigidos no código, mas esta versão ainda depende do QA manual no Foundry (responsividade, drop, grafo, scroll, persistência, modos).

- responsive toolbar (flex-wrap, grupos semânticos — não corta mais controles)
- scrollable storyboard world (viewport + world; nós fora do primeiro viewport ficam acessíveis)
- unified canvas coordinates (drop/drag/connectors no mesmo espaço do WORLD)
- generic Beat-to-Beat linking (qualquer nó pode ser origem; `activeBeatId` não interfere)
- async BeatStore persistence (await em todas as escritas; sem race write/read)
- linking feedback / Escape cancellation
- Foundry v13 drag/drop namespace cleanup (`foundry.applications.ux.TextEditor`)
- Edit/Live structural guards

## [0.0.13] 2026-09-15

### Correções

- **Link de qualquer nó → qualquer nó**: o fluxo antigo conectava apenas a partir do Beat inicial (`activeBeat`), impossibilitando linkar nós arbitrários. Novo modo de linkagem pendente: clicar ⟗ num Beat A destaca A em teal e entra em modo "linking"; clicar ⟗ (ou no corpo) de um Beat B cria a conexão A→B; clicar no mesmo nó cancela.
- **Drag em storyboard vazio**: `dropSelector` era `".beats-canvas"`, mas com zero Beats o template renderiza o empty state sem esse elemento — o drop era ignorado em silêncio. Agora `dropSelector: ".lf-canvas"` (sempre presente) e handlers de dragover/drop usam `.lf-canvas`.
- **Automatização de drops**: soltar uma pasta (vários docs) cria os Beats em sequência com offset de 140px, **auto-linka em cadeia** (0→1, 1→2, …) e **auto-define o primeiro como start** quando o storyboard ainda não tem Beat ativo.
- **HUD cortada/pequena**: janela padrão aumentada para 1000×720; `.lf-root` passou a preencher via `position: absolute; inset: 0` (não depende mais de `height:100%` do `.window-content`, que podia colapsar); vignette suavizada (era `#0c0c0fcc` a 80% — escurecia as bordas e parecia cortada).

## [0.0.12] 2026-09-15

### Correções

- **Janela arrastável**: o `.lf-titlebar` custom do template duplicava o header auto-gerado pelo ApplicationV2, criando duas áreas de drag conflitantes e bloqueando o arraste nativo. Removido do template; o `.window-header` do framework agora é a única área de drag.
- **Seletor de storyboard clicável**: o `<select>` foi movido do titlebar removido para a toolbar, com `pointer-events: auto` explícito no CSS (`lumenn-frame.css`) — os overlays de grain/vignette não bloqueiam mais o clique.
- **Renomear storyboard**: novo `LumennBeatStore.renameStoryboard(storyboardId, name)` + action `rename-storyboard` com `DialogV2.prompt`. Criar storyboard agora também pede o nome (antes nascia fixo como "Novo Storyboard").
- **Drag de pastas**: `#onDrop` agora trata `documentName === "Folder"` — `#resolveDropDocs` itera `folder.contents` e cria um Beat para cada Scene/Playlist/PlaylistSound, com offset horizontal de 140px para não empilhar.
- **`#onDrop` limpo**: removido o fallback `event.dataTransfer.getData("text/plain")` — `TextEditor.getDragEventData` já parseia o payload JSON da sidebar.
- i18n: `Toolbar.RenameStoryboard` + hints atualizados (en/pt-BR) para mencionar pastas.

## [0.0.11] 2026-09-15

### Correções

- **Tema escuro de volta (janela branca)**: o wrapper `.window-content` do framework tem background claro + padding padrão que pintavam por cima do tema. Agora estilizado direto (`.lumenn-frame.storyboard .window-content` → ink, sem padding) + `.window-header` dark com título âmbar — mesmo padrão do CSB V2.
- **Ações de beat sempre visíveis em modo edição**: link (conectar), editar (crossfade/transição), start e deletar estavam em `display:none` até hover — invisíveis = "não existem". Agora `display:flex` fixo.
- **Dropdown de storyboard sempre funcional**: com zero storyboards o select nem renderizava. GM abre o app sem storyboards → um é criado automaticamente no primeiro open.

## [0.0.10] 2026-09-15

### Correções

- **Drag-drop de Cena/Playlist funcional**: o payload do drag da sidebar é JSON (`TextEditor.getDragEventData` → `{type, uuid}`), não UUID puro. `#onDrop` agora resolve `data.uuid` com fallback para `text/plain` — antes `fromUuid(raw)` recebia JSON, retornava null e o drop era ignorado em silêncio.
- **Notifications sobrepostas pela janela escura**: z-indexes internos (49/50/51/60) escapavam do stacking context da janela e pintavam por cima dos overlays do sistema. `.lumenn-frame.storyboard` agora tem `isolation: isolate` (stacking context próprio) e z-indexes internos reduzidos para escala local (1–7).
- `dragSelector: ".beat-node"` removido do `dragDrop` — reposicionamento interno já é pointer events; dragstart nativo era peso morto.

## [0.0.9] 2026-09-15

### Correção

- CSS: removido `position: relative`, `display: flex`, `height: 100%` de `.lumenn-frame.storyboard` (especificidade 0,2,0) que **sobrescreviam** `.app` do Foundry (especificidade 0,1,0) — janela perdia o posicionamento nativo em `#ui-middle` e cobria o HUD.
- `.lf-root` (template root) virou o container real: `height:100%; width:100%; position:relative`. Overlays (`::before`/`::after`) movidos para `.lf-root` para manter o contexto de posicionamento.

## [0.0.8] 2026-09-15

### Correção

- JS: `classes` agora inclui `"app"` e `"window-app"` (storyboard e beat-config). Sem isso, o Foundry não posiciona a janela dentro de `#ui-middle` nem gerencia o `z-index` nativo — janela cobria os scene controls e conflitava com overlays do sistema.

## [0.0.7] 2026-09-15

### Correção

- CSS: variáveis movidas de `:root` (seletor global) para `.lumenn-frame` — `:root` em Foundry v13+ interfere na camada de temas.
- CSS: cadeia de altura corrigida (`display:flex` + `min-height:0` no container, `.lf-root` e `.lf-canvas`) — canvas colapsava para 0 de altura e a janela ficava escura/vazia.

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
