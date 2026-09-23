# Lumenn Frame

[![Release](https://img.shields.io/github/v/release/SoftMissT/Lumenn-Frame?label=release)](https://github.com/SoftMissT/Lumenn-Frame/releases/latest)
[![Foundry VTT](https://img.shields.io/badge/Foundry_VTT-13.350_--_14.999-orange)](#compatibilidade)
[![License](https://img.shields.io/github/license/SoftMissT/Lumenn-Frame)](LICENSE)

<p align="center">
  <img src="assets/lumenn_frame.webp" alt="Grafo cinematográfico do Lumenn Frame com nós de cenas, áudio e notas" width="100%">
</p>

Editor de storyboard cinematográfico para Foundry VTT. Organize cenas, músicas e
anotações em um grafo visual; depois navegue pela sessão a partir das conexões,
com transições de cena e continuidade de áudio no mesmo fluxo.

> Alvo principal: Foundry VTT 14.367. Compatibilidade declarada: 13.350–14.999.

## Por que usar

O Lumenn Frame transforma a preparação da sessão em um mapa narrativo operável:

- **Planeje visualmente:** cenas, áudio e notas ficam no mesmo canvas.
- **Conecte a intenção:** cada linha define um caminho e uma transição própria.
- **Execute ao vivo:** o GM navega pelo storyboard sem abandonar o Foundry.
- **Mantenha o ritmo:** música, SFX e transições acompanham a troca de cena.

## Recursos principais

- Canvas amplo com pan, zoom e enquadramento automático.
- Nós de **Cena**, **Áudio** e **Nota**.
- Conexões **FLOW** para o fluxo narrativo.
- Conexões **AUDIO** para rotear playlists e faixas.
- Transições configuráveis por linha, sem alterar todos os caminhos do storyboard.
- Modos **Edição** e **Ao Vivo**.
- Sincronização GM ? jogadores pelo socket do módulo.
- Migração automática dos storyboards antigos para o schema v2.

<details>
<summary>Visão rápida dos elementos</summary>

| Elemento  | Papel                                              |
| :-------- | :------------------------------------------------- |
| **Cena**  | Destino visual e ponto de navegação da sessão      |
| **Áudio** | Playlist, faixa musical ou SFX roteado por conexão |
| **Nota**  | Anotação privada para contexto e preparação        |
| **FLOW**  | Caminho narrativo com transição configurável       |
| **AUDIO** | Rota de continuidade, corte, fade ou crossfade     |

</details>

## Instalação

No Foundry, abra **Install Module**, cole a URL abaixo em **Manifest URL** e instale:

```text
https://github.com/SoftMissT/Lumenn-Frame/releases/latest/download/module.json
```

Depois, habilite **Lumenn Frame** no mundo e recarregue a página.

## Primeiros passos

1. Abra o Lumenn Frame pelos controles de cena.
2. No modo **Edição**, crie ou arraste nós de Cena e Áudio.
3. Arraste de uma porta **OUT** para uma porta **IN** compatível.
4. Clique na linha criada para abrir sua transição no Inspector.
5. Escolha se a FLOW executa **Áudio**, **Cena** ou **Beat** cena e áudio juntos.
6. Defina o nó inicial e mude para **Ao Vivo** para navegar pelo storyboard.

Uma conexão também pode ser reaberta pelo bloco **Entradas / Saídas** do
Inspector de qualquer nó. Isso evita depender de acertar visualmente uma linha
quando o grafo estiver muito cheio.

## Nós, conexões e transições

| Elemento | Função                               | Navegação ao vivo            |
| :------- | :----------------------------------- | :--------------------------- |
| Cena     | Representa uma Scene do Foundry      | Sim                          |
| Áudio    | Playlist ou PlaylistSound            | Sim, quando ligada por AUDIO |
| Nota     | Anotação privada do mestre           | Não                          |
| FLOW     | Define caminho e transição narrativa | Sim                          |
| AUDIO    | Roteia áudio e sua transição         | Sim entre os nós ligados     |

As conexões são direcionais: `A ? B` não cria automaticamente `B ? A`.

### Cores das linhas, nós e portas

Cada cor possui uma função única e permanece visível mesmo quando o nó é
selecionado ou está ativo:

| Cor         | Significado                        |
| :---------- | :--------------------------------- |
| Âmbar       | Cena e conexão FLOW                |
| Amarelo     | Porta FLOW IN                      |
| Laranja     | Porta FLOW OUT                     |
| Violeta     | Música e rota musical              |
| Ciano       | Efeito sonoro (SFX) e sua rota     |
| Azul        | Nota                               |
| Verde       | Nó inicial/ativo                   |
| Verde-limão | Destino navegável no modo Ao Vivo  |
| Branco      | Seleção, AUDIO IN e canal esquerdo |
| Vermelho    | AUDIO OUT e canal direito          |
| Rosa        | Destino válido durante uma conexão |

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

No Foundry v14, o select também inclui três filtros próprios do Lumenn:
**Zoom In**, **Zoom Out** e **Dissolver cruzado**. Eles usam o mesmo pipeline
`canvas.transition.run` das transições nativas; em clientes jogadores, a
transição é reproduzida localmente sem ativar a Scene globalmente.

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

## Navegação do canvas

| Entrada                  | Ação                             |
| :----------------------- | :------------------------------- |
| Roda do mouse / trackpad | Deslocar o canvas                |
| `Shift` + roda           | Deslocar horizontalmente         |
| `Ctrl`/`Cmd` + roda      | Zoom centralizado no cursor      |
| `Espaço` + arrastar      | Mover a câmera                   |
| Botão do meio + arrastar | Mover a câmera                   |
| `-`, `100%`, `+`         | Controlar zoom                   |
| `Fit`                    | Enquadrar todos os nós           |
| `Expandir`               | Usar o espaço completo da janela |

O zoom mínimo é 20% para permitir uma visão geral de grafos extensos. No
Inspector do storyboard, a lista **Nós de áudio** centraliza e seleciona qualquer
Audio Node mesmo em grafos grandes.

## Estado do projeto

A versão pública mais recente está disponível em
[Releases](https://github.com/SoftMissT/Lumenn-Frame/releases/latest).

O manifesto já declara o alvo Foundry 14.367 e compatibilidade retroativa com
13.350+. O gate de runtime com dois clientes continua sendo acompanhado
separadamente dos checks estáticos:

- transições reais de áudio e cena no Foundry 14.367;
- persistência após recarregar o mundo;
- sincronização entre GM e jogador;
- smoke test no Foundry 13.350+.

## Compatibilidade

| Foundry          | Estado                                |
| :--------------- | :------------------------------------ |
| 14.367           | Alvo principal declarado no manifesto |
| 13.350+          | Compatibilidade retroativa pretendida |
| Abaixo de 13.350 | Não suportado                         |
| 15 ou superior   | Ainda não declarado                   |

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

## Licença

GPL-3.0. Consulte [LICENSE](LICENSE).
