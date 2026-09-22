# Lumenn Frame

[![Release](https://img.shields.io/github/v/release/SoftMissT/Lumenn-Frame?label=release)](https://github.com/SoftMissT/Lumenn-Frame/releases/latest)
[![Foundry VTT](https://img.shields.io/badge/Foundry_VTT-13.350_--_14.999-orange)](#compatibilidade)
[![License](https://img.shields.io/github/license/SoftMissT/Lumenn-Frame)](LICENSE)

Editor de storyboard cinematográfico para Foundry VTT. O mestre organiza cenas,
músicas e anotações em um grafo visual e controla cada troca de cena ou áudio
diretamente pela conexão entre os nós.

> O manifesto declara compatibilidade com Foundry 13.350–14.999. O teste manual
> completo em GM + jogador ainda está pendente; veja
> [Estado do projeto](#estado-do-projeto).

## O que o módulo faz

- Canvas amplo com pan, zoom e enquadramento automático.
- Nós de **Cena**, **Áudio** e **Nota**.
- Conexões **FLOW** para o fluxo narrativo.
- Conexões **AUDIO** para rotear playlists e faixas.
- Transições configuráveis por linha, sem alterar todos os caminhos do storyboard.
- Modos **Edição** e **Ao Vivo**.
- Sincronização GM → jogadores pelo socket do módulo.
- Migração automática dos storyboards antigos para o schema v2.

## Instalação

No Foundry, abra **Install Module**, cole a URL abaixo em **Manifest URL** e instale:

```text
https://github.com/SoftMissT/Lumenn-Frame/releases/latest/download/module.json
```

Depois, habilite **Lumenn Frame** no mundo e recarregue a página.

## Fluxo rápido

1. Abra o Lumenn Frame pelos controles de cena.
2. No modo **Edição**, crie ou arraste nós de Cena e Áudio.
3. Arraste de uma porta **OUT** para uma porta **IN** compatível.
4. Clique na linha criada para abrir sua transição no Inspector.
5. Escolha se a FLOW executa **Áudio**, **Cena** ou **Beat** — cena e áudio juntos.
6. Defina o nó inicial e mude para **Ao Vivo** para navegar pelo storyboard.

Uma conexão também pode ser reaberta pelo bloco **Entradas / Saídas** do
Inspector de qualquer nó. Isso evita depender de acertar visualmente uma linha
quando o grafo estiver muito cheio.

## Nós e conexões

| Elemento | Função | Navegação ao vivo |
| :-- | :-- | :-- |
| Cena | Representa uma Scene do Foundry | Sim |
| Áudio | Playlist ou PlaylistSound | Sim, quando ligada por AUDIO |
| Nota | Anotação privada do mestre | Não |
| FLOW | Define caminho e transição narrativa | Sim |
| AUDIO | Roteia áudio e sua transição | Sim entre os nós ligados |

As conexões são direcionais: `A → B` não cria automaticamente `B → A`.

### Cores das linhas, nós e portas

Cada cor possui uma função única e permanece visível mesmo quando o nó é
selecionado ou está ativo:

| Cor | Significado |
| :-- | :-- |
| Âmbar | Cena e conexão FLOW |
| Amarelo | Porta FLOW IN |
| Laranja | Porta FLOW OUT |
| Violeta | Música e rota musical |
| Ciano | Efeito sonoro (SFX) e sua rota |
| Azul | Nota |
| Verde | Nó inicial/ativo |
| Verde-limão | Destino navegável no modo Ao Vivo |
| Branco | Seleção, AUDIO IN e canal esquerdo |
| Vermelho | AUDIO OUT e canal direito |
| Rosa | Destino válido durante uma conexão |

O cabeçalho identifica o tipo do nó; as portas indicam entrada e saída; o
contorno mostra o estado. As linhas possuem uma área invisível de clique maior
que o traço visual. Clique em qualquer ponto da conexão para selecioná-la.

## Controle das transições

### FLOW

Cada FLOW possui escopo independente:

- **Áudio:** troca somente o áudio.
- **Cena:** troca somente a cena.
- **Beat:** troca cena e áudio juntos.

Também é possível configurar o tipo e a duração da transição de cena, além do
comportamento de áudio daquele caminho.

### AUDIO

Cada conexão AUDIO pode controlar:

- `Auto`
- `Keep`
- `Cut`
- `Crossfade`
- `Fade Out`
- `Fade In`
- duração de crossfade, fade in e fade out
- curva da transição

Para editar depois de conectar, clique na linha ou selecione um dos nós e abra a
conexão em **Entradas / Saídas**.

Cada Audio Node possui a função **Música** ou **Efeito sonoro (SFX)**. Uma Cena
aceita uma música principal e vários efeitos sonoros simultâneos. Quando várias
músicas chegam ao mesmo destino, a conexão musical criada mais recentemente tem
prioridade; os SFX são disparados juntos. Um nó de Playlist inicia uma faixa com
`Playlist#playSound`; ele não usa `playAll`.

## Controles do canvas

| Entrada | Ação |
| :-- | :-- |
| Roda do mouse | Zoom centralizado no cursor |
| `Espaço` + arrastar | Mover a câmera |
| Botão do meio + arrastar | Mover a câmera |
| `-`, `100%`, `+` | Controlar zoom |
| `Fit` | Enquadrar todos os nós |
| `Expandir` | Usar o espaço completo da janela |

O zoom mínimo é 40% para manter os Audio Nodes legíveis e clicáveis. No
Inspector do storyboard, a lista **Nós de áudio** centraliza e seleciona qualquer
Audio Node mesmo em grafos grandes.

## Compatibilidade

| Foundry | Estado |
| :-- | :-- |
| 14.367 | Alvo principal declarado no manifesto |
| 13.350+ | Compatibilidade retroativa pretendida |
| Abaixo de 13.350 | Não suportado |
| 15 ou superior | Ainda não declarado |

As diferenças entre versões ficam concentradas em
`scripts/foundry-compat.mjs`. Consulte [COMPATIBILITY.md](COMPATIBILITY.md) para
a matriz técnica.

## Estrutura do repositório

```text
lang/       traduções pt-BR e en
macros/     smoke tests executados dentro do Foundry
scripts/    editor, persistência, áudio e compatibilidade
styles/     interface do editor
templates/  templates Handlebars
```

Arquivos ZIP não fazem parte do código-fonte. Os pacotes instaláveis ficam
anexados às [Releases](https://github.com/SoftMissT/Lumenn-Frame/releases).

## Desenvolvimento

Verificações estáticas básicas:

```powershell
Get-ChildItem scripts -Filter *.mjs |
  ForEach-Object { node --check $_.FullName }
Get-Content module.json -Raw | ConvertFrom-Json | Out-Null
git diff --check
```

O teste de áudio deve ser executado no console do Foundry usando
`macros/test-audio-engine.mjs`. Checks estáticos não substituem o teste real com
dois clientes.

## Estado do projeto

A versão pública mais recente está disponível em
[Releases](https://github.com/SoftMissT/Lumenn-Frame/releases/latest).
Permanecem pendentes como gate de runtime:

- transições reais de áudio e cena no Foundry 14.367;
- persistência após recarregar o mundo;
- sincronização entre GM e jogador;
- smoke test no Foundry 13.350+.

## Licença

GPL-3.0. Consulte [LICENSE](LICENSE).
