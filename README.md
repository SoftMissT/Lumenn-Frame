# Lumenn Frame

Módulo standalone para Foundry VTT v13+ (13.350 – 14.999). Dá ao mestre um **editor de grafo cinematográfico** de cenas com continuidade de áudio: um canvas navegável (câmera pan/zoom) com Scene Nodes, Audio Nodes e Note Nodes conectados por FLOW edges (navegação narrativa) e AUDIO edges (associação sonora).

Versão atual: **0.0.15-alpha.2** (Graph Editor 2.0 — build de validação). Persistência em `game.settings` (schema v2), migração automática do schema v1 (Beats), sincronização GM/Player por socket.

## Instalação

1. Foundry VTT **v13.350+** (mínimo 13.350, máximo 14.999; verified 13.350 como baseline de desenvolvimento).
2. Instalar via manifesto:

```
https://github.com/SoftMissT/Lumenn-Frame/releases/latest/download/module.json
```

3. Ativar **Lumenn Frame** na configuração do mundo.

> Para instalar uma build específica (alpha/beta), use o manifesto da tag:
> `https://github.com/SoftMissT/Lumenn-Frame/releases/download/<TAG>/module.json`

## Uso (GM)

Abra o controle **Lumenn Frame** na barra de controles da Scene.

### Editar (modo Edição)
- **Câmera**: roda do mouse = zoom centrado no cursor; `Space` + arrastar ou botão do meio = pan; `- 100% + Fit` na barra superior; `Expandir` ocupa a viewport inteira.
- **Ferramentas** (barra esquerda): `Select` (mover/arrastar nós), `Hand`, `Connect` (arrastar port→port), `Scene`, `Audio`, `Note` (clicar no canvas cria o nó).
- **Scene Node**: arraste uma Scene da sidebar para o canvas, ou use a ferramenta Scene e escolha a cena no Inspector.
- **Audio Node**: arraste uma Playlist/PlaylistSound da sidebar (vira Audio Node com associação sonora), ou use a ferramenta Audio.
- **Note Node**: anotações visuais do GM — não participam da navegação.
- **Conectar**: ferramenta Connect → arraste do port `OUT` de um nó para o `IN` de outro. FLOW edge (`Scene→Scene`) = navegação; AUDIO edge (tracejada) = trilha associada. `Escape` cancela.
- **Transições por edge**: selecione a linha e use o Inspector para definir Scene Transition (Cut/Fade + duração) e Audio Transition (Auto/Keep/Crossfade/Fade Out/Fade In + duração). `[Adicionar retorno B → A]` cria a aresta inversa.
- **Inspector**: painel direito contextual — cor, tamanho, notas, cena/fonte de áudio, e botões (Set Initial / Delete / etc).

### Ao Vivo (modo Live)
- Pan/zoom/seleção informativa permitidos; edição, criação, delete e connect bloqueados.
- O nó ativo é destacado; apenas os **FLOW outgoing** do nó ativo ficam navegáveis (demais esmaecidos).
- Clique num nó navegável → executa a transição da edge: fade de cena (se configurado) + crossfade de áudio + sincronização via socket para os jogadores.
- Jogadores não recebem controles de edição; espelham o fade de cena.

## Migração
Storyboards antigos (schema v1, Beats) são migrados automaticamente para o schema v2 (Graphs) com **backup** (`legacyBackup`) e sem destruir o legado.

## Compatibilidade Foundry
Toda diferença de API v13/v14 fica concentrada em `scripts/foundry-compat.mjs` (`LumennCompat`); tabela detalhada em `COMPATIBILITY.md`.

## Desenvolvimento

Pasta do módulo deve se chamar `lumenn-frame` (igual ao `id` do manifesto).

```
lumenn-frame/
  module.json
  scripts/
    lumenn-frame.mjs
    foundry-compat.mjs
    graph-store.mjs
    storyboard-app.mjs
    audio-engine.mjs
    transition-controller.mjs
    handlebars-helpers.mjs
  styles/lumenn-frame.css
  templates/
  lang/
```

## Licença

GPL-3.0. Ver `LICENSE`.