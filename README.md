# Lumenn Frame

[![Release](https://img.shields.io/github/v/release/SoftMissT/Lumenn-Frame?label=release)](https://github.com/SoftMissT/Lumenn-Frame/releases/latest)
[![Foundry VTT](https://img.shields.io/badge/Foundry_VTT-13.350_--_14.999-orange)](#compatibilidade)
[![License](https://img.shields.io/github/license/SoftMissT/Lumenn-Frame)](LICENSE)

<p align="center">
  <img src="assets/lumenn_frame.webp" alt="Grafo cinematográfico do Lumenn Frame com nós de cenas, áudio e notas / Lumenn Frame cinematic graph with scene, audio and note nodes" width="100%">
</p>

**Português** · [English](#english)

---

## O que é

O Lumenn Frame é um **editor de storyboard para o Foundry VTT**. Em vez de
procurar cenas e playlists no meio da sessão, você monta antes, num quadro
visual, o caminho que a história pode seguir: quais cenas existem, que música
toca em cada uma e como se passa de uma para outra. Na hora do jogo, o mestre
clica na próxima cena e o módulo faz a troca com a transição e o áudio que você
já deixou preparados.

**É para quem:** mestres (GM) que querem sessões mais fluidas e cinematográficas,
sem ficar caçando arquivos enquanto a mesa espera.

> Alvo principal: Foundry VTT 14.367. Compatibilidade declarada: 13.350–14.999.
> O módulo está em fase 0.0.x: os checks estáticos passam, mas o teste completo
> no Foundry com mestre e jogador ainda está pendente (veja
> [Estado do projeto](#estado-do-projeto)).

## Como funciona em 30 segundos

Você desenha um **grafo**: caixas (nós) ligadas por linhas (conexões).

```text
 [Música: Fogueira] ──AUDIO──▶ [Cena: Acampamento] ──FLOW──▶ [Cena: Floresta]
                                                      (Dissolver 1.0s · Auto 3.0s)
```

- **Nós** são as peças: uma **Cena** do Foundry, um **Áudio** (playlist ou faixa)
  ou uma **Nota** sua.
- **Conexões** dizem como as peças se relacionam. **FLOW** é o caminho da
  história (de qual cena para qual). **AUDIO** liga um áudio a uma cena.
- O texto sobre a linha FLOW resume a transição: efeito de cena e duração,
  depois o comportamento do áudio.
- Dois modos: **Edição** (você monta) e **Ao Vivo** (você joga e navega).

## Instalação

1. No Foundry, abra **Add-on Modules → Install Module**.
2. Cole a URL abaixo em **Manifest URL** e clique em **Install**:

   ```text
   https://github.com/SoftMissT/Lumenn-Frame/releases/latest/download/module.json
   ```

3. Abra seu mundo, vá em **Manage Modules**, habilite **Lumenn Frame** e salve.
4. Recarregue a página (F5).

Para atualizar, reinstale pela mesma URL ou use o botão de atualização do
Foundry. Seus storyboards ficam salvos no mundo e não são apagados.

## Seu primeiro storyboard (5 minutos)

1. **Abra o editor.** Na barra de ferramentas à esquerda, no grupo de Tokens,
   clique no botão com ícone de filme **Lumenn Frame** (só o GM o vê). Também
   funciona por macro: `game.modules.get("lumenn-frame").api.openStoryboard()`.
2. **Crie um storyboard** com o botão **+** no topo (ele nasce vazio).
3. **Traga as peças.** Arraste **Scenes**, **Playlists** ou faixas da barra
   lateral do Foundry para o canvas. Arrastar uma **pasta** traz o conteúdo dela
   (as subpastas entram conforme a configuração de importação recursiva).
4. **Ligue as cenas.** Arraste de uma porta de saída (**FLOW OUT**, laranja) até
   a entrada (**FLOW IN**, amarela) da próxima cena.
5. **Ligue o áudio.** Arraste da saída de um nó de Áudio (**AUDIO OUT**,
   vermelha) até a entrada de áudio (**AUDIO IN**, branca) da cena onde ele deve
   tocar.
6. **Configure a transição.** Clique na linha FLOW. No painel **Inspector**
   (à direita), escolha o escopo, o efeito de cena, a duração e o comportamento
   do áudio.
7. **Marque o início.** Selecione a primeira cena e clique em **Início** no Inspector.
8. **Jogue.** Mude para **Ao Vivo**. Os destinos possíveis ganham contorno
   verde-limão; clique em um deles e a transição acontece.

## Conceitos em uma tabela

| Termo | O que significa |
| :---- | :-------------- |
| **Storyboard** | Um grafo completo. Você pode ter vários (um por capítulo, por exemplo). |
| **Nó de Cena** | Representa uma Scene do Foundry. É um ponto de navegação da sessão. |
| **Nó de Áudio** | Uma Playlist ou uma faixa. Tem função **Música** (contínua) ou **Efeito sonoro (SFX)**. |
| **Nó de Nota** | Anotação sua no quadro. Não participa da navegação. |
| **FLOW** | Linha direcional que define o caminho entre duas cenas e a transição dele. |
| **AUDIO** | Linha que liga um nó de Áudio a uma cena. |
| **Beat** | Escopo de transição "cena e áudio juntos". |
| **Inspector** | Painel à direita onde você edita o nó ou a linha selecionados. |
| **Edição / Ao Vivo** | Montar o storyboard / navegar por ele durante a sessão. |
| **Nó inicial** | Onde o Ao Vivo começa. Aparece com contorno verde. |

As conexões são **direcionais**: `A → B` não cria automaticamente `B → A`. Para
poder voltar, use **Adicionar retorno B → A** na linha.

## Transições: o que acontece quando você clica

Cada linha FLOW tem a sua própria transição. Ao navegar para uma cena:

1. O módulo aplica o **efeito de cena** escolhido (ou corta direto).
2. Em paralelo, troca o **áudio** conforme o modo definido.
3. A cena de destino passa a ser a cena ativa do mundo.

### Escopo

| Escopo | O que a linha faz |
| :----- | :---------------- |
| **Cena** | Troca somente a cena. |
| **Áudio** | Troca somente o áudio. |
| **Beat** (cena + áudio) | Troca os dois juntos. É o padrão. |

### Efeito de cena

| Opção | Observação |
| :---- | :--------- |
| **Corte** | Troca instantânea, sem efeito. |
| Efeitos nativos do Foundry 14 | Dissolver, Ondas, Redemoinho, Pontos e outros, conforme a sua versão. |
| **Zoom In**, **Zoom Out**, **Dissolver cruzado** | Três efeitos próprios do Lumenn, no mesmo pipeline das transições nativas. |

A **duração** é em milissegundos (1000 = 1 segundo). O campo **Cor** só vale
para transições que usam cor de fundo, hoje o "Dip to Color" de reserva; o
Foundry 14 não tem essa transição nativa, então ela cai num fade preto simples.
No Foundry 13 a lista é menor (Corte, Fade e Dip).

### Áudio

| Modo | Efeito |
| :--- | :----- |
| **Auto** | O módulo decide: mantém se o áudio é o mesmo, faz o atual sumir se a cena de destino não tem áudio, faz o novo entrar se nada tocava e faz crossfade se o áudio muda. |
| **Keep** (Manter) | Mantém a música que já toca e ainda dispara os SFX da cena de destino. |
| **Cut** (Corte) | Para o que não faz parte do destino na hora e começa o novo sem fade. |
| **Crossfade** | O atual some enquanto o novo entra, na duração definida. |
| **Fade Out** | O que toca some e nada novo começa. |
| **Fade In** | O atual para na hora e o novo entra com fade. |

Há também a **curva** do fade (`linear` ou `equal-power`). Uma cena aceita **uma
música principal** e **vários SFX** ao mesmo tempo. Se várias músicas chegam à
mesma cena, vale a ligação criada por último. Um nó de Playlist inicia **uma
faixa** (`Playlist#playSound`), não a playlist inteira.

### Como ler o texto sobre a linha

| Texto | Significado |
| :---- | :---------- |
| `Dissolver 1.0s · Auto 3.0s` | Cena com Dissolver de 1 segundo; áudio em Auto com 3 segundos. |
| `Corte · Manter` | Troca seca de cena; o áudio continua como está. |
| `Cena · Ondas 1.5s` | A linha só troca cena (escopo Cena). |
| `Áudio · Crossfade 2.0s` | A linha só troca áudio (escopo Áudio). |

Dá para esconder esses textos em **Mostrar labels de transição nas edges**, nas
configurações.

## Modo Ao Vivo

- Só o **GM** conduz. O nó ativo fica com contorno **verde**; os destinos
  possíveis, com contorno **verde-limão**.
- Nós sem caminho a partir do ativo ficam **esmaecidos** (opcional).
- Há uma opção para **confirmar** cada transição antes de executar.
- Clique em um **nó de Áudio** para acionar a música ou o SFX sem trocar de cena: a música faz **crossfade** a partir da que está tocando (usa o modo e a duração da linha AUDIO desse nó com a cena ativa); o SFX toca por cima; clicar de novo em um que está tocando faz fade out. O nó que está tocando fica com brilho.
- Cena e música andam **juntas**: ao navegar, o efeito de cena e o crossfade começam ao mesmo tempo.
- Se a Scene tiver playlist própria (aba de áudio da Scene no Foundry), o módulo suspende essa troca automática durante a navegação do storyboard, para a música seguir o que está nas linhas AUDIO e não ser cortada.
- No Ao Vivo ainda é possível ajustar as **transições de áudio** da linha
  selecionada, sem sair do modo.
- Com **Fade de cena para jogadores** ligado, os jogadores veem o mesmo efeito
  de cena que o GM escolheu.

## Cores e símbolos

| Cor | Significado |
| :-- | :---------- |
| Âmbar | Cena e conexão FLOW |
| Amarelo / Laranja | Porta FLOW IN / FLOW OUT |
| Violeta | Música e rota musical |
| Ciano | Efeito sonoro (SFX) e sua rota |
| Azul | Nota |
| Verde | Nó inicial/ativo |
| Verde-limão | Destino navegável no modo Ao Vivo |
| Branco | Seleção, AUDIO IN e canal esquerdo |
| Vermelho | AUDIO OUT e canal direito |
| Rosa | Destino válido durante uma conexão |

A legenda no canto do canvas repete essas cores. As linhas têm uma área de
clique maior que o traço: clique em qualquer ponto para selecioná-las. Também é
possível abrir uma conexão pelo bloco **Entradas / Saídas** do Inspector de um
nó, útil quando o grafo está muito cheio.

## Navegação do canvas

| Entrada | Ação |
| :------ | :--- |
| Roda do mouse / trackpad | Deslocar o canvas |
| `Shift` + roda | Deslocar na horizontal |
| `Ctrl`/`Cmd` + roda | Zoom no cursor |
| `Espaço` + arrastar, ou botão do meio | Mover a câmera |
| `-`, `100%`, `+` | Controlar o zoom |
| `Fit` | Enquadrar todos os nós |
| `Expandir` | Usar o espaço completo da janela |

O zoom mínimo é 20%. A lista **Nós de áudio** do Inspector localiza qualquer
nó de áudio em grafos grandes.

## Configurações principais

Em **Game Settings → Configure Settings → Lumenn Frame** você define os padrões
de novas conexões e do editor:

| Configuração | Para quê |
| :----------- | :------- |
| Transição de Cena padrão / Duração padrão | Valores iniciais de cada nova linha FLOW |
| Modo de Áudio padrão, Crossfade, Fade In/Out, Curva | Valores iniciais do áudio |
| Mostrar labels de transição nas edges | Liga/desliga o texto sobre as linhas |
| Confirmar transição de cena (Ao Vivo) | Pede confirmação antes de trocar |
| Esmaecer nós inalcançáveis (Ao Vivo) | Destaca só os caminhos possíveis |
| Fade de cena para jogadores | Jogadores veem o mesmo efeito de cena |
| Importação recursiva de pastas / Auto-conectar Scenes | Como pastas arrastadas viram nós |
| Zoom inicial, Velocidade do zoom, Abrir em modo Workspace | Conforto do editor |

## Problemas comuns

**Não vejo o botão do Lumenn Frame.** Ele aparece só para o GM, no grupo de
Tokens da barra à esquerda. Confirme que o módulo está habilitado no mundo.

**No Ao Vivo, clico num nó e nada acontece.** Só são navegáveis os nós com
contorno verde-limão, ligados ao nó ativo por uma linha FLOW. Defina o nó
inicial antes (botão **Início** no Inspector).

**A transição que escolhi não aparece.** Confira se o escopo da linha é **Cena**
ou **Beat** e se o efeito escolhido existe na sua versão do Foundry. Até a v0.0.29 o efeito escolhido na linha não chegava a tocar no Foundry 14 (a animação terminava sem rodar e a Scene aplicava o efeito dela); isso foi corrigido na v0.0.30. Depois de atualizar, recarregue a página (F5).

**O áudio não troca.** O nó de Áudio precisa estar **ligado por uma linha AUDIO**
à cena de destino e ter uma fonte escolhida (playlist ou faixa). Veja também o
modo de áudio da linha FLOW.

**Os jogadores não veem o efeito.** Ligue **Fade de cena para jogadores** nas
configurações.

## Privacidade e segurança

Os storyboards, **inclusive o texto das Notas**, são guardados nas
configurações do mundo. Isso significa que **não são secretos de verdade**:
jogadores com conhecimento técnico podem ler esses dados pelo navegador. A Nota
só fica escondida na interface do editor, que é exclusiva do GM. **Não guarde
segredos de campanha nas Notas.**

Detalhes, limitações conhecidas e como reportar uma vulnerabilidade estão em
[SECURITY.md](SECURITY.md).

## Estado do projeto

A versão pública mais recente está em
[Releases](https://github.com/SoftMissT/Lumenn-Frame/releases/latest). As
versões 0.0.x são pré-validação: os testes estáticos passam, mas ainda falta o
teste com dois clientes (GM e jogador) no Foundry real:

- transições reais de áudio e cena no Foundry 14.367;
- persistência após recarregar o mundo;
- sincronização entre GM e jogador;
- teste rápido no Foundry 13.350+.

### Compatibilidade

| Foundry | Estado |
| :------ | :----- |
| 14.367 | Alvo principal declarado no manifesto |
| 13.350+ | Compatibilidade retroativa pretendida |
| Abaixo de 13.350 | Não suportado |
| 15 ou superior | Ainda não declarado |

As diferenças entre versões ficam em `scripts/foundry-compat.mjs`. A matriz
técnica está em [COMPATIBILITY.md](COMPATIBILITY.md); o histórico de mudanças,
em [CHANGELOG.md](CHANGELOG.md).

## Para quem desenvolve

```text
lang/       traduções pt-BR e en
macros/     testes executados dentro do Foundry
scripts/    editor, persistência, áudio e compatibilidade
styles/     interface do editor
templates/  templates Handlebars
tests/      testes unitários (Node)
```

Verificações antes de abrir um PR:

```powershell
node --test (Get-ChildItem tests -Filter *.test.mjs).FullName
Get-ChildItem scripts -Filter *.mjs | ForEach-Object { node --check $_.FullName }
Get-Content module.json -Raw | ConvertFrom-Json | Out-Null
git diff --check
```

O teste de áudio roda no console do Foundry com `macros/test-audio-engine.mjs`.
Testes estáticos não substituem o teste real com dois clientes. Arquivos ZIP não
fazem parte do código-fonte: os pacotes instaláveis ficam nas
[Releases](https://github.com/SoftMissT/Lumenn-Frame/releases).

## Ajuda, ideias e bugs

Abra uma [issue](https://github.com/SoftMissT/Lumenn-Frame/issues) contando a
versão do Foundry, a versão do módulo e o que aconteceu. **Vulnerabilidades não
devem ir em issue pública:** siga o [SECURITY.md](SECURITY.md).

## Licença

GPL-3.0. Consulte [LICENSE](LICENSE).

---

<a id="english"></a>

# Lumenn Frame (English)

[Português](#lumenn-frame) · **English**

## What it is

Lumenn Frame is a **storyboard editor for Foundry VTT**. Instead of hunting for
scenes and playlists in the middle of a session, you build the story's possible
paths ahead of time on a visual board: which scenes exist, which music plays in
each, and how you move from one to the next. At the table, the GM clicks the
next scene and the module performs the switch with the transition and audio you
already prepared.

**Who it is for:** game masters (GMs) who want smoother, more cinematic sessions
without making the table wait.

> Primary target: Foundry VTT 14.367. Declared compatibility: 13.350–14.999.
> The module is in its 0.0.x stage: static checks pass, but the full test in
> Foundry with a GM and a player is still pending (see
> [Project status](#project-status)).

## How it works in 30 seconds

You draw a **graph**: boxes (nodes) joined by lines (connections).

```text
 [Music: Campfire] ──AUDIO──▶ [Scene: Camp] ──FLOW──▶ [Scene: Forest]
                                         (Dissolve 1.0s · Auto 3.0s)
```

- **Nodes** are the pieces: a Foundry **Scene**, an **Audio** (playlist or
  track), or a **Note** of yours.
- **Connections** say how pieces relate. **FLOW** is the story path (which scene
  leads to which). **AUDIO** attaches audio to a scene.
- The text over a FLOW line summarizes its transition: the scene effect and
  duration, then the audio behavior.
- Two modes: **Edit** (you build) and **Live** (you play and navigate).

## Installation

1. In Foundry, open **Add-on Modules → Install Module**.
2. Paste the URL below into **Manifest URL** and click **Install**:

   ```text
   https://github.com/SoftMissT/Lumenn-Frame/releases/latest/download/module.json
   ```

3. Open your world, go to **Manage Modules**, enable **Lumenn Frame** and save.
4. Reload the page (F5).

To update, reinstall from the same URL or use Foundry's update button. Your
storyboards are saved in the world and are not deleted.

## Your first storyboard (5 minutes)

1. **Open the editor.** In the left toolbar, in the Tokens group, click the
   film-icon **Lumenn Frame** button (only the GM sees it). A macro works too:
   `game.modules.get("lumenn-frame").api.openStoryboard()`.
2. **Create a storyboard** with the **+** button at the top (it starts empty).
3. **Bring in the pieces.** Drag **Scenes**, **Playlists** or tracks from
   Foundry's sidebar onto the canvas. Dragging a **folder** brings its contents
   (subfolders follow the recursive-import setting).
4. **Connect the scenes.** Drag from a scene's output port (**FLOW OUT**,
   orange) to the next scene's input (**FLOW IN**, yellow).
5. **Connect the audio.** Drag from an Audio node's output (**AUDIO OUT**, red)
   to the scene's audio input (**AUDIO IN**, white) where it should play.
6. **Set the transition.** Click the FLOW line. In the **Inspector** (right
   panel), pick the scope, the scene effect, the duration and the audio
   behavior.
7. **Mark the start.** Select the first scene and click **Start** in the Inspector.
8. **Play.** Switch to **Live**. Reachable destinations get a lime outline; click
   one and the transition runs.

## Concepts at a glance

| Term | Meaning |
| :--- | :------ |
| **Storyboard** | One complete graph. You can have several (one per chapter, say). |
| **Scene node** | Stands for a Foundry Scene. It is a navigation point in the session. |
| **Audio node** | A Playlist or a single track. Its role is **Music** (continuous) or **Sound effect (SFX)**. |
| **Note node** | A note on the board. It does not take part in navigation. |
| **FLOW** | A directional line defining the path between two scenes and its transition. |
| **AUDIO** | A line attaching an Audio node to a scene. |
| **Beat** | The "scene and audio together" transition scope. |
| **Inspector** | The right-hand panel where you edit the selected node or line. |
| **Edit / Live** | Build the storyboard / navigate it during the session. |
| **Initial node** | Where Live mode starts. Shown with a green outline. |

Connections are **directional**: `A → B` does not automatically create `B → A`.
To be able to go back, use **Add return B → A** on the line.

## Transitions: what happens when you click

Each FLOW line has its own transition. When you navigate to a scene:

1. The module applies the chosen **scene effect** (or cuts straight away).
2. In parallel, it switches the **audio** according to the chosen mode.
3. The destination scene becomes the world's active scene.

### Scope

| Scope | What the line does |
| :---- | :----------------- |
| **Scene** | Switches only the scene. |
| **Audio** | Switches only the audio. |
| **Beat** (scene + audio) | Switches both together. This is the default. |

### Scene effect

| Option | Note |
| :----- | :--- |
| **Cut** | Instant switch, no effect. |
| Foundry 14 native effects | Dissolve, Waves, Swirl, Dots and others, depending on your version. |
| **Zoom In**, **Zoom Out**, **Cross Dissolve** | Three Lumenn effects, in the same pipeline as the native transitions. |

**Duration** is in milliseconds (1000 = 1 second). The **Color** field only
matters for transitions that use a background color, currently the fallback
"Dip to Color"; Foundry 14 has no native version of it, so it falls back to a
plain black fade. On Foundry 13 the list is shorter (Cut, Fade and Dip).

### Audio

| Mode | Effect |
| :--- | :----- |
| **Auto** | The module decides: keeps it if the audio is the same, fades the current audio out if the destination scene has none, fades the new audio in if nothing was playing, and crossfades if the audio changes. |
| **Keep** | Keeps the music already playing and still triggers the destination scene's SFX. |
| **Cut** | Stops whatever is not part of the destination right away and starts the new audio with no fade. |
| **Crossfade** | The current audio fades out while the new one fades in, over the set duration. |
| **Fade Out** | What is playing fades out and nothing new starts. |
| **Fade In** | The current audio stops immediately and the new one fades in. |

There is also a fade **curve** (`linear` or `equal-power`). A scene accepts **one
main music track** and **several SFX** at once. If several music tracks reach the
same scene, the most recently created connection wins. A Playlist node starts
**one track** (`Playlist#playSound`), not the whole playlist.

### Reading the text over a line

| Text | Meaning |
| :--- | :------ |
| `Dissolve 1.0s · Auto 3.0s` | Scene dissolves for 1 second; audio in Auto with 3 seconds. |
| `Cut · Keep` | Hard scene cut; the audio keeps playing as is. |
| `Scene · Waves 1.5s` | The line only switches the scene (Scene scope). |
| `Audio · Crossfade 2.0s` | The line only switches the audio (Audio scope). |

You can hide these texts with **Show transition labels on edges** in the
settings.

## Live mode

- Only the **GM** drives it. The active node has a **green** outline; possible
  destinations have a **lime** outline.
- Nodes with no path from the active one are **dimmed** (optional).
- There is an option to **confirm** each transition before it runs.
- Click an **Audio node** to trigger music or an SFX without changing scene: music **crossfades** from whatever is playing (it uses the mode and duration of that node's AUDIO line to the active scene); an SFX plays on top; clicking one that is already playing fades it out. The playing node glows.
- Scene and music move **together**: when you navigate, the scene effect and the crossfade start at the same time.
- If a Scene has its own playlist (the Scene's audio tab in Foundry), the module suspends that automatic switch while it drives the storyboard, so the music follows the AUDIO lines and is not cut.
- In Live mode you can still adjust the **audio transitions** of the selected
  line without leaving the mode.
- With **Scene fade for players** on, players see the same scene effect the GM
  picked.

## Colors and symbols

| Color | Meaning |
| :---- | :------ |
| Amber | Scene and FLOW connection |
| Yellow / Orange | FLOW IN / FLOW OUT port |
| Violet | Music and its route |
| Cyan | Sound effect (SFX) and its route |
| Blue | Note |
| Green | Initial/active node |
| Lime | Navigable destination in Live mode |
| White | Selection, AUDIO IN and left channel |
| Red | AUDIO OUT and right channel |
| Pink | Valid target while connecting |

The legend in the corner of the canvas repeats these colors. Lines have a
click area larger than the visible stroke: click anywhere on one to select it.
You can also open a connection from the **Incoming / Outgoing** block in a node's
Inspector, handy when the graph is crowded.

## Canvas navigation

| Input | Action |
| :---- | :----- |
| Mouse wheel / trackpad | Pan the canvas |
| `Shift` + wheel | Pan horizontally |
| `Ctrl`/`Cmd` + wheel | Zoom at the cursor |
| `Space` + drag, or middle button | Move the camera |
| `-`, `100%`, `+` | Control zoom |
| `Fit` | Frame all nodes |
| `Expand` | Use the whole window |

Minimum zoom is 20%. The Inspector's **Audio nodes** list finds any audio node
in large graphs.

## Main settings

In **Game Settings → Configure Settings → Lumenn Frame** you set the defaults
for new connections and for the editor:

| Setting | What it is for |
| :------ | :------------- |
| Default scene transition / default duration | Starting values for every new FLOW line |
| Default audio mode, crossfade, fade in/out, curve | Starting values for audio |
| Show transition labels on edges | Toggles the text over the lines |
| Confirm scene transition (Live) | Asks before switching |
| Dim unreachable nodes (Live) | Highlights only the possible paths |
| Scene fade for players | Players see the same scene effect |
| Recursive folder import / Auto-connect Scenes | How dragged folders become nodes |
| Initial zoom, zoom speed, open in workspace mode | Editor comfort |

## Troubleshooting

**I can't see the Lumenn Frame button.** It shows only for the GM, in the Tokens
group of the left toolbar. Make sure the module is enabled in the world.

**In Live mode I click a node and nothing happens.** Only nodes with a lime
outline, linked to the active node by a FLOW line, are navigable. Set the
initial node first (the **Start** button in the Inspector).

**The transition I picked does not show.** Check that the line's scope is
**Scene** or **Beat** and that the effect exists in your Foundry version. Up to v0.0.29 the effect chosen on the line did not actually play on Foundry 14 (the animation ended without running and the Scene applied its own effect); this was fixed in v0.0.30. After updating, reload the page (F5).

**The audio does not switch.** The Audio node must be **connected by an AUDIO
line** to the destination scene and must have a source chosen (playlist or
track). Also check the FLOW line's audio mode.

**Players do not see the effect.** Turn on **Scene fade for players** in the
settings.

## Privacy and security

Storyboards, **including the text of Notes**, are stored in the world's
settings. That means they are **not truly secret**: players with technical
knowledge can read that data through the browser. A Note is only hidden in the
editor interface, which is GM-only. **Do not keep campaign secrets in Notes.**

Details, known limitations and how to report a vulnerability are in
[SECURITY.md](SECURITY.md).

## Project status

The latest public version is on
[Releases](https://github.com/SoftMissT/Lumenn-Frame/releases/latest). 0.0.x
versions are pre-validation: static tests pass, but the two-client test (GM and
player) in real Foundry is still missing:

- real audio and scene transitions on Foundry 14.367;
- persistence after reloading the world;
- GM-to-player synchronization;
- a smoke test on Foundry 13.350+.

### Compatibility

| Foundry | Status |
| :------ | :----- |
| 14.367 | Primary target declared in the manifest |
| 13.350+ | Backward compatibility intended |
| Below 13.350 | Not supported |
| 15 or later | Not declared yet |

Version differences live in `scripts/foundry-compat.mjs`. The technical matrix is
in [COMPATIBILITY.md](COMPATIBILITY.md); the change history is in
[CHANGELOG.md](CHANGELOG.md).

## For developers

```text
lang/       pt-BR and en translations
macros/     tests run inside Foundry
scripts/    editor, persistence, audio and compatibility
styles/     editor interface
templates/  Handlebars templates
tests/      unit tests (Node)
```

Checks before opening a PR:

```powershell
node --test (Get-ChildItem tests -Filter *.test.mjs).FullName
Get-ChildItem scripts -Filter *.mjs | ForEach-Object { node --check $_.FullName }
Get-Content module.json -Raw | ConvertFrom-Json | Out-Null
git diff --check
```

The audio test runs in Foundry's console with `macros/test-audio-engine.mjs`.
Static tests do not replace the real two-client test. ZIP files are not part of
the source code: installable packages are attached to
[Releases](https://github.com/SoftMissT/Lumenn-Frame/releases).

## Help, ideas and bugs

Open an [issue](https://github.com/SoftMissT/Lumenn-Frame/issues) with your
Foundry version, the module version and what happened. **Do not report
vulnerabilities in a public issue:** follow [SECURITY.md](SECURITY.md).

## License

GPL-3.0. See [LICENSE](LICENSE).
