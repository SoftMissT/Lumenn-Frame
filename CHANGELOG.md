# Changelog

As versões 0.0.x permanecem pré-validação de runtime em Foundry real. Semver: 0.0.x até a primeira validação; então 0.1.0.

## [0.0.26] - 2026-09-22 transições customizadas e HUD navegável

### Fixed

- A roda do mouse e o trackpad agora deslocam o canvas; `Shift` desloca no eixo
  horizontal e `Ctrl`/`Cmd` aplica zoom sob o cursor.
- O limite mínimo de zoom foi reduzido para 20%, permitindo enquadrar grafos
  extensos sem perder os controles de retorno a 100% e `Fit`.
- As conexões passam a ancorar dinamicamente no perímetro dos nós conforme a
  direção relativa: uma edge vinda de baixo permanece na borda inferior, sem
  forçar todas as linhas para um único port lateral.
- Pequenos docks no SVG deixam visível o ponto real de encaixe de cada edge sem
  alterar a semântica persistida `OUT ? IN`.
- O Inspector deixou de crescer para fora da HUD: ganhou largura mínima útil,
  `min-height: 0` e rolagem vertical real.
- Rótulos das transições nativas agora passam por i18n, com fallback legível
  para `Dissolver`, `Ondas`, `Redemoinho`, `Pontos` e equivalentes.
- O registry v14 agora recebe três efeitos próprios do Lumenn: `Zoom In`,
  `Zoom Out` e `Cross Dissolve`, implementados como filtros WebGL do pipeline
  de transição do Foundry.
- Jogadores reproduzem os efeitos customizados localmente pelo socket sem
  tentar ativar a Scene globalmente.

## [0.0.25] - 2026-09-22 canvas interativo e SVG incremental

### Fixed

- Arrastar um nó usa `translate3d` durante o gesto e grava `left/top` somente ao soltar, evitando layout completo a cada evento de ponteiro.
- O SVG deixa de ser destruído e recriado durante o arraste: somente as
  geometrias das conexões incidentes ao nó movido são atualizadas, uma vez por
  frame com `requestAnimationFrame`.
- O término de um arraste não é mais interpretado como clique no nó, evitando
  renderização integral do editor e ativação acidental de cena.
- O gesto do nó deixa de propagar para o viewport/DragDrop do Foundry;
  thumbnails não iniciam drag nativo e cada card possui contenção de layout,
  impedindo que mover um nó desloque ou anexe outro.
- Leituras de nós durante o desenho reutilizam o snapshot do Graph, em vez de
  clonar o setting mundial repetidamente para cada extremidade de cada edge.
- Cores vazias ou inválidas são normalizadas antes de alimentar
  `<input type="color">`, removendo o erro repetido de formato `#rrggbb`.
- Patches de campos aninhados agora preservam o restante de `transition.scene`
  e `transition.audio`; editar um controle não apaga os demais.
- Alterações de uma transição conectada atualizam seu label sem renderizar toda
  a ApplicationV2.
- O zoom mínimo do `Fit` passou de 40% para 55%, mantendo cards, textos e ports
  operáveis; grafos maiores continuam navegáveis por pan.

### Runtime Validation Pending

- Medir arraste e pan em Foundry 14.367 com o Graph real de 20 nós / 47 edges.
- Confirmar seleção, conexão e edição pós-arraste em GM e visualização em
  jogador conectado.

## [0.0.24] - 2026-09-22 áudio, transições e paleta semântica

### Fixed

- O clique em uma FLOW/AUDIO edge não propaga mais até o viewport e, portanto,
  não perde a seleção imediatamente após abrir o Inspector.
- A área invisível de clique das conexões aumentou de 16 px para 24 px.
- As conexões de um nó agora também abrem a transição pelo bloco
  **Entradas / Saídas** do Inspector.
- `Playlist#playAll` foi removido do motor: Playlist inicia uma única faixa por
  `Playlist#playSound`.
- A resolução de áudio escolhe uma única fonte de destino e encerra fontes
  concorrentes controladas pelo storyboard, evitando reprodução em massa.
- Zoom mínimo elevado para 40% e adicionado índice de Audio Nodes no Inspector,
  com foco e seleção centralizados.
- Audio Nodes agora possuem função **Música** (violeta) ou **SFX** (ciano).
  Cada cena aceita uma música principal e múltiplos efeitos simultâneos; os fios
  estéreo continuam branco/vermelho.
- Paleta semântica completa no grafo: Cena/FLOW âmbar, FLOW IN amarelo,
  FLOW OUT laranja, Música violeta, SFX ciano, Nota azul, nó ativo verde,
  seleção branca e alvo de conexão rosa. Tipo, direção e estado usam camadas
  visuais separadas para que uma indicação não esconda a outra.

### Documentation

- README reestruturado em pt-BR com instalação, fluxo rápido, semântica das
  conexões, controles de transição, compatibilidade e estrutura do repositório.
- ZIPs locais de builds anteriores foram removidos; os artefatos continuam nas
  Releases do GitHub e permanecem ignorados por `*.zip`.
- Removido `SHA256SUMS.txt` obsoleto, que ainda descrevia somente a v0.0.18;
  checksums passam a acompanhar a validação de cada Release.

## [0.0.18] - 2026-09-15

> **Hotfix bloqueador de fade.** Correção do schema de fade do PlaylistSound/Playlist (V13 e V14). Nenhuma feature nova.

### Fixed

- **`PlaylistSound` / `Playlist` fade**: o campo persistido é **`fade`**; `fadeDuration` é accessor computado (**NUNCA gravar**). Todas as escritas do engine e de `LumennCompat.setPlaylistSoundFade` agora usam `{ fade: duration }`.
- **Autoridade única de fade por transição**: Track ? `PlaylistSound.fade`; Playlist ? `Playlist.fade` (`playAll`/`stopAll`). Não aplica fade de Playlist + fade de Track simultaneamente (evita double-fade composto).
- **Preserva configuração do usuário**: valor anterior de `fade` é salvo antes da transição e **restaurado** ao final (`#savedFades`/`#restoreFades` em `applyMode`/`transition`).
- Matriz `COMPATIBILITY.md` atualizada (campo `fade`, leitura via accessor).
- Zero writes de `fadeDuration` como campo de documento (restantes são `crossfadeDuration`, conceito de edge).

### Runtime Validation Pending

- Crossfade audível (Track?Track, Track?Playlist, Playlist?Track, Playlist?Playlist)
- Enumerar `CONFIG.Canvas.sceneTransitions` no 14.367
- Persistência real (F5 / restart) · GM?Player (2 clientes) · smoke 13.350

## [0.0.17] - 2026-09-15

> Hotfix funcional (persistência, transições V14, áudio, pastas recursivas). Build para Foundry 14.367 (primário), 13.350+ retrocompatível.

### Persistence

- **Clone profundo em TODAS as escritas do store** (`foundry.utils.duplicate`) e em `getAll()` elimina aliasing do objeto retornado por `game.settings.get` e estados stale entre write/read/render
- Migração v1?v2 continua idempotente + backup (`legacyBackup`); schema v2 intocado
- Teste manual de persistência documentado (criar grafo ? F5 ? reload ? reaparecer idêntico)

### Scene Transitions (V14 canônico)

- **Biblioteca dinâmica**: Inspector consulta `CONFIG.Canvas.sceneTransitions` em runtime (feature-detected) e constrói o dropdown a partir do registry real da build não hardcoda Cut/Fade
- `LumennCompat.runSceneTransition`: usa `canvas.transition.run({nextScene, activate, duration, transitionType})` quando disponível; fallback Lumenn `cut`/`fade`/`dip-to-color` (V13)
- **Dip to Color** com color picker (default `#000000`)
- Badge `V14 Native` / `Compatibility fallback` no Inspector
- **Preview Transition** (demonstra sem alterar o Graph)
- Transição continua pertencendo à edge (`A?B`/`B?A` independentes)

### Audio

- Modo **Cut** (para/imediato + inicia/imediato) adicionado ao engine
- **Curve** (`linear` / `equal-power`): linear efetivo via fade de documento; equal-power é PARTIAL (persistido, executa linear)
- **Uma fonte musical principal por Scene**: 2ª AUDIO edge é rejeitada com aviso (MVP)
- Autoridade única de fade por fonte (não duplica Playlist+Track fades na mesma fonte)

### Folder Import

- **Recursivo**: `Folder#getSubfolders(true)` (fallback `children` walk) coleta subpastas em qualquer profundidade
- `sourceFolderId` / `sourceFolderPath` preservados nos nodes importados
- Layout em grid por Settings (colunas/gap)
- Opções: `Import Playlist Tracks as Nodes`, `Auto-connect Imported Scenes` (OFF por padrão)

### UI / Settings

- **Sem emoticons**: toolbar e tags usam Font Awesome (`fa-mouse-pointer`, `fa-hand`, `fa-share-nodes`, `fa-image`, `fa-music`, `fa-note-sticky`)
- Settings expandidas (dip color, crossfade curve, import, auto-connect) com terminologia de Graph/FLOW (sem "Beat")

### Runtime Validation Pending

- Crossfade de áudio real (audível) · transições nativas V14 enumeradas no runtime · sync GM?Player (2 clientes) · QA 14.367 · smoke 13.350

## [0.0.16] - 2026-09-15

> Graph Editor usability hotfix (runtime validation). Build for Foundry 14.367 (primary), 13.350+ backward compatible.

### Fixed / Added

- **Ports visíveis e clicáveis** em modo Edição (FLOW âmbar / AUDIO teal, hit area =24px via `::after`, `overflow: visible` no node com wrapper interno clippado, hover forte)
- **Connect tool** com tooltip "Conectar" + status bar contextual (`Conectar: arraste FLOW OUT ? FLOW IN` / `Áudio: arraste AUDIO OUT ? AUDIO IN`)
- **Connection drag** confiável: alvo rastreado durante o move (fallback `elementFromPoint`), ghost edge, target highlight, auto-seleção da edge nova ? Inspector da transição abre imediatamente
- **Fallback UX no Inspector**: Scene Node mostra `Conexões` outgoing `[+ Adicionar destino]`, `[Associar áudio]`, lista incoming/outgoing com delete
- **Edge selection** melhorada: hit path 16px, hover ilumina a linha (cursor pointer), tooltip `A ? B editar transição`
- **Transition Inspector completo**: Scene (Cut/Fade + duration) e Audio (Auto/Keep/Crossfade/Fade Out/Fade In + crossfade, fade in, fade out) campos sempre visíveis
- **Labels nas FLOW edges** no centro do grafo: `Fade 1.0s · ? Auto 3.0s` (ocultas em zoom < 45%; configurável via setting)
- **Settings completas** (novo `scripts/settings.mjs`): Transitions (scene type/fade duration, audio mode/crossfade/fade in/fade out), Graph Editor (node sizes/colors, initial zoom, zoom speed, open in workspace), Live (dim unreachable, transition labels, confirm transition, player fade, player audio sync)
- **Defaults centralizados**: novas FLOW edges usam os defaults das Settings (via `LumennSettings.getTransitionDefaults`); novos nodes usam cor/tamanho das Settings; alterar setting global **não** sobrescreve edges existentes
- Zoom inicial/velocidade da roda vindos das Settings; abrir em Workspace opcional
- Confirmação opcional de transição em Live (setting)

### Compatibility

- Primary target Foundry 14.367 · minimum 13.350 · maximum 14.999
- V14-first architecture; V13 adapter in `foundry-compat.mjs`

### Runtime Validation Pending

- Real audio crossfade (audible runtime test)
- Scene fade overlay timing
- GM ? Player two-client test
- Foundry 14.367 runtime QA (GM + Player)
- Foundry 13.350 compatibility smoke test

## [0.0.15] - 2026-09-15

> Graph Editor 2.0 **public runtime validation release** for Foundry VTT 14.367 (primary), backward compatible with 13.350+. This is the current `Latest` channel build.

### Graph Editor 2.0

- Infinite canvas + camera (pan Space+drag / middle mouse, cursor-centered zoom 25–200%, `- 100% + Fit`)
- Workspace expansion (`Expand`/`Restore`) via `ApplicationV2.setPosition`
- Scene / Audio / Note Nodes with per-node colors and sizes (`compact`/`normal`/`large`)
- Contextual Inspector (graph / node / edge)
- Ports (FLOW IN/OUT, AUDIO IN/OUT) + drag port?port connections (ghost + target highlight + Escape)
- Directional FLOW edges (`A?B`/`B?A` independent, offset curves) and AUDIO attachment edges
- Selectable edges + transition Inspector
- `Add return B ? A`
- Edit / Live modes with structural guards; Live navigation only through outgoing FLOW edges
- Per-edge Scene transition (Cut/Fade + duration) and Audio transition (Auto/Keep/Crossfade/Fade Out/Fade In + crossfade duration)
- Drag/drop: Scene?Scene Node, Playlist/PlaylistSound?Audio Node, Folder?grid
- Graph Schema v2 + automatic legacy (schema v1) migration with backup
- GM ? Player sync infrastructure (module socket `module.lumenn-frame`, `socket: true`)
- Foundry compatibility layer (`foundry-compat.mjs`) + `COMPATIBILITY.md` (V14-first / V13 fallback)

### Compatibility

- Primary target Foundry 14.367 (manifest `verified`)
- Minimum Foundry 13.350 · Maximum Foundry 14.999
- V14-first architecture; V13 adapter only for verified differences

### Runtime Validation Pending

- Real audio crossfade (audible runtime test)
- Scene fade overlay timing
- GM ? Player two-client test
- Foundry 14.367 runtime QA (GM + Player)
- Foundry 13.350 compatibility smoke test

## [0.0.15-alpha.2] - 2026-09-15

> Graph Editor 2.0 runtime validation build for Foundry VTT 14.367 (primary), backward compatible with 13.350+. **Not a stable release.**

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
- Reciprocal flow support (`A?B` / `B?A` independent)
- Selectable edges (thick hit target)
- Transition Inspector
- `Add return B ? A` action
- Graph Schema v2 (`graphs`: nodes[] + edges[])
- Legacy migration (schema v1 ? v2, backup + idempotent)
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
- GM ? Player synchronization requires two-client QA
- Foundry 14.367 runtime QA pending
- Foundry 13.350 compatibility smoke test pending

## [0.0.15-alpha.1]

> **ALPHA / runtime validation build** Graph Editor 2.0, **Phase A: Camera only**. Nenhuma feature de Fase B (schema v2, ports, Inspector, novos node types) incluída.

### Graph Editor 2.0 Phase A: Camera

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

> Runtime idêntico ao `0.0.14-beta.1` (nenhum script/style/template alterado). Esta tag é uma entrada limpa de teste via GitHub: instale pelo manifesto da tag `https://github.com/SoftMissT/Lumenn-Frame/releases/download/v0.0.14-beta.2/module.json` e rode o QA.

### Documentação (Specs locais SDD gitignored, fora do pacote)

- **FLOW EDGES formalizado** nas Specs (§3.4): o storyboard é um **grafo direcionado** `A -> B` não implica `B -> A`; recíproca exige as duas arestas; branching/ciclos/múltiplas entradas-saídas válidos; `activeBeatId` nunca restringe edges em Edição; `connections[]` = outgoing FLOW edges; self-edge proibida; Ao Vivo segue só outgoing.
- **CT-FLOW-01..05** adicionados às Specs (§5) como checklist do QA de grafo.

### QA de runtime escopo

1. Responsividade (1920/1600/1366 + resize) toolbar sem cortes, toggle acessível.
2. Drop: Scene/Playlist/Folder em canvas vazio e existente.
3. Grafo: A?B, B?A, branching A?B/C/D, ciclo A?B?C?A (CT-FLOW-01..05).
4. Move + scroll + resize conectores corretos.
5. Persistência após reload (positions, sceneId, audioSource, connections, activeBeatId).
6. Modos Edição/Ao Vivo guards estruturais.

## 0.0.14-beta.1

### Fixed / Testing

> Build de validação de runtime os bugs abaixo estão corrigidos no código, mas esta versão ainda depende do QA manual no Foundry (responsividade, drop, grafo, scroll, persistência, modos).

- responsive toolbar (flex-wrap, grupos semânticos não corta mais controles)
- scrollable storyboard world (viewport + world; nós fora do primeiro viewport ficam acessíveis)
- unified canvas coordinates (drop/drag/connectors no mesmo espaço do WORLD)
- generic Beat-to-Beat linking (qualquer nó pode ser origem; `activeBeatId` não interfere)
- async BeatStore persistence (await em todas as escritas; sem race write/read)
- linking feedback / Escape cancellation
- Foundry v13 drag/drop namespace cleanup (`foundry.applications.ux.TextEditor`)
- Edit/Live structural guards

## [0.0.13] 2026-09-15

### Correções

- **Link de qualquer nó ? qualquer nó**: o fluxo antigo conectava apenas a partir do Beat inicial (`activeBeat`), impossibilitando linkar nós arbitrários. Novo modo de linkagem pendente: clicar ? num Beat A destaca A em teal e entra em modo "linking"; clicar ? (ou no corpo) de um Beat B cria a conexão A?B; clicar no mesmo nó cancela.
- **Drag em storyboard vazio**: `dropSelector` era `".beats-canvas"`, mas com zero Beats o template renderiza o empty state sem esse elemento o drop era ignorado em silêncio. Agora `dropSelector: ".lf-canvas"` (sempre presente) e handlers de dragover/drop usam `.lf-canvas`.
- **Automatização de drops**: soltar uma pasta (vários docs) cria os Beats em sequência com offset de 140px, **auto-linka em cadeia** (0?1, 1?2, …) e **auto-define o primeiro como start** quando o storyboard ainda não tem Beat ativo.
- **HUD cortada/pequena**: janela padrão aumentada para 1000×720; `.lf-root` passou a preencher via `position: absolute; inset: 0` (não depende mais de `height:100%` do `.window-content`, que podia colapsar); vignette suavizada (era `#0c0c0fcc` a 80% escurecia as bordas e parecia cortada).

## [0.0.12] 2026-09-15

### Correções

- **Janela arrastável**: o `.lf-titlebar` custom do template duplicava o header auto-gerado pelo ApplicationV2, criando duas áreas de drag conflitantes e bloqueando o arraste nativo. Removido do template; o `.window-header` do framework agora é a única área de drag.
- **Seletor de storyboard clicável**: o `<select>` foi movido do titlebar removido para a toolbar, com `pointer-events: auto` explícito no CSS (`lumenn-frame.css`) os overlays de grain/vignette não bloqueiam mais o clique.
- **Renomear storyboard**: novo `LumennBeatStore.renameStoryboard(storyboardId, name)` + action `rename-storyboard` com `DialogV2.prompt`. Criar storyboard agora também pede o nome (antes nascia fixo como "Novo Storyboard").
- **Drag de pastas**: `#onDrop` agora trata `documentName === "Folder"` `#resolveDropDocs` itera `folder.contents` e cria um Beat para cada Scene/Playlist/PlaylistSound, com offset horizontal de 140px para não empilhar.
- **`#onDrop` limpo**: removido o fallback `event.dataTransfer.getData("text/plain")` `TextEditor.getDragEventData` já parseia o payload JSON da sidebar.
- i18n: `Toolbar.RenameStoryboard` + hints atualizados (en/pt-BR) para mencionar pastas.

## [0.0.11] 2026-09-15

### Correções

- **Tema escuro de volta (janela branca)**: o wrapper `.window-content` do framework tem background claro + padding padrão que pintavam por cima do tema. Agora estilizado direto (`.lumenn-frame.storyboard .window-content` ? ink, sem padding) + `.window-header` dark com título âmbar mesmo padrão do CSB V2.
- **Ações de beat sempre visíveis em modo edição**: link (conectar), editar (crossfade/transição), start e deletar estavam em `display:none` até hover invisíveis = "não existem". Agora `display:flex` fixo.
- **Dropdown de storyboard sempre funcional**: com zero storyboards o select nem renderizava. GM abre o app sem storyboards ? um é criado automaticamente no primeiro open.

## [0.0.10] 2026-09-15

### Correções

- **Drag-drop de Cena/Playlist funcional**: o payload do drag da sidebar é JSON (`TextEditor.getDragEventData` ? `{type, uuid}`), não UUID puro. `#onDrop` agora resolve `data.uuid` com fallback para `text/plain` antes `fromUuid(raw)` recebia JSON, retornava null e o drop era ignorado em silêncio.
- **Notifications sobrepostas pela janela escura**: z-indexes internos (49/50/51/60) escapavam do stacking context da janela e pintavam por cima dos overlays do sistema. `.lumenn-frame.storyboard` agora tem `isolation: isolate` (stacking context próprio) e z-indexes internos reduzidos para escala local (1–7).
- `dragSelector: ".beat-node"` removido do `dragDrop` reposicionamento interno já é pointer events; dragstart nativo era peso morto.

## [0.0.9] 2026-09-15

### Correção

- CSS: removido `position: relative`, `display: flex`, `height: 100%` de `.lumenn-frame.storyboard` (especificidade 0,2,0) que **sobrescreviam** `.app` do Foundry (especificidade 0,1,0) janela perdia o posicionamento nativo em `#ui-middle` e cobria o HUD.
- `.lf-root` (template root) virou o container real: `height:100%; width:100%; position:relative`. Overlays (`::before`/`::after`) movidos para `.lf-root` para manter o contexto de posicionamento.

## [0.0.8] 2026-09-15

### Correção

- JS: `classes` agora inclui `"app"` e `"window-app"` (storyboard e beat-config). Sem isso, o Foundry não posiciona a janela dentro de `#ui-middle` nem gerencia o `z-index` nativo janela cobria os scene controls e conflitava com overlays do sistema.

## [0.0.7] 2026-09-15

### Correção

- CSS: variáveis movidas de `:root` (seletor global) para `.lumenn-frame` `:root` em Foundry v13+ interfere na camada de temas.
- CSS: cadeia de altura corrigida (`display:flex` + `min-height:0` no container, `.lf-root` e `.lf-canvas`) canvas colapsava para 0 de altura e a janela ficava escura/vazia.

## [0.0.6] 2026-09-15

### Correção

- Templates `storyboard.hbs` e `beat-config.hbs` renderizavam múltiplos elementos raiz ApplicationV2 exige um único elemento por `PARTS`. Embrulhados em `<div class="lf-root">` e `<div class="bc-body">`.
- Layout flex movido para `.lf-root`; `BeatConfigDialog` sem `form.closeOnSubmit` redundante.

## [0.0.5] 2026-09-15

> Consolidação final: 0.0.3/0.0.4 foram tags de trabalho intermediárias.

### UI/UX Cinematic Edit Bay

- Redesign completo do canvas: tema dark near-black (`#0c0c0f`), film grain, vignette, conectores bezier com seta, fontes Modesto Condensed + Montserrat.
- Thumbnails de Scene nos Beat cards (16:9) + ícone de tipo de áudio (faixa/playlist).
- Seletor de fonte de áudio com **abas** "Nenhum / Faixa / Playlist" (PDR Decisão #4).
- Empty state com instruções de drag-and-drop.

### Drag & Drop

- Arrastar Scene da sidebar ? cria Beat; sobre Beat existente ? substitui Scene.
- Arrastar Playlist/PlaylistSound ? define a fonte de áudio do Beat.
- `DragDrop` (ApplicationV2) em `foundry.applications.ux`.

### Conformidade SDD (reconciliação)

- **Navegação ao vivo** (US-002/RF-004): clique no Beat conectado (modo Ao Vivo) ? `Scene.activate()` + transição de áudio.
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

- Manifesto `module.json` (`lumenn-frame`, compatibilidade **13.350 ? 14.999**, verified 14.367 stable atual).
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

- `macros/test-audio-engine.mjs`: CT-001/002/003/006/007 + started + playlist inteira + fonte inválida; mede despacho (RNF-002 = 100ms); restaura o estado ao final.
- Classes expostas em `game.modules.get("lumenn-frame").api`.

### APIs verificadas na doc oficial (bloqueios do Research/Specs §8 fechados)

- v13: `Scene#activate()`; `PlaylistSound#sound` (lazy); `PlaylistSound#update({fadeDuration, playing})`; `Playlist#playAll/stopAll`; `Playlist#updateEmbeddedDocuments`.
- Stable atual da faixa: **v14.367** (18/08/2026). APIs usadas são estáveis v13?v14 (documentos + ApplicationV2).

### Emenda técnica (pendente de propagação ao Specs §4.1)

Transições via documento em vez de `Sound#fade()` direto fades locais não sincronizam entre clientes. O patch de `fadeDuration` persiste no som (necessário para RF-006/RF-012).

### Gate antes de subir versão

- [ ] Rodar `macros/test-audio-engine.mjs` em mundo real (v14.367 e, se possível, 13.350+).
- [ ] CT-001..CT-008 manuais conforme Specs §5.

## [0.0.19] escopo de transição e correção do grafo

- FLOW edges agora distinguem `audio`, `scene` e `both` (Beat).
- AUDIO edges podem associar múltiplas fontes à mesma Scene; crossfade continua sendo resolvido em lote pelo motor.
- Conectores SVG receberam curvas recíprocas, espessura não escalável, seta nativa e área de seleção ampla.
- HUD e nós foram ampliados; caracteres emoji foram removidos da interface/documentação.
- Escopo `audio` não ativa Scene; troca de Scene só ocorre em `scene`/`both`.
- Validação estática aprovada; QA Foundry ainda pendente para diferenciar redraw de Canvas e reload de página.

## [0.0.20] - 2026-09-21 conexão entre nós de áudio

- Nós de áudio agora exibem `AUDIO IN` e `AUDIO OUT` em lados distintos.
- Corrigido CSS que colocava o `OUT` no lado esquerdo, impedindo conexões `Áudio ? Áudio`.
- O runtime resolve cadeias de áudio conectadas até a Scene de destino.
- Validação estática aprovada; validação runtime no Foundry permanece pendente.

## [0.0.21] - 2026-09-21 interação do grafo

- Removidas as setas visuais das conexões; a direção continua definida por `OUT ? IN`.
- Liberado o pointer capture ao finalizar uma conexão, evitando travar o canvas após o arraste.

## [0.0.22] - 2026-09-21 transições completas e conectividade

- Linhas de áudio agora mostram os canais esquerdo (branco) e direito (vermelho), com `AUDIO IN` branco e `AUDIO OUT` vermelho.
- Conexões podem encaixar no corpo/lado compatível do nó, sem exigir precisão no círculo da porta.
- Transições de áudio ficaram editáveis também na associação de áudio; durações são limitadas a 10 segundos.
- Seleção/arraste de nós reforçados e linhas mantêm espessura/contraste em zoom baixo.

## [0.0.23] - 2026-09-21 arraste e nó inicial

- Redraw das conexões durante o arraste limitado a um `requestAnimationFrame`, evitando reconstruções repetidas do SVG e gradientes no mesmo gesto.
- O nó continua acompanhando o ponteiro localmente e persiste a posição somente ao soltar.

### Nó inicial de áudio/cena

- O modo Ao Vivo agora considera `FLOW` e `AUDIO` como saídas navegáveis.
- Um Audio Node marcado como inicial passa a fornecer sua própria fonte de áudio; não fica sem origem nem bloqueia o grafo.
- AUDIO ? Scene executa áudio sem forçar troca de cena; FLOW continua controlando cena/beat.
