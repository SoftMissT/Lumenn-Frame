# Spike: levar o jogador a uma cena (visita real)

Data: 2026-11-17. Foundry 14.367, mundo de teste isolado (`D:\FoundryData-Test`, :30001), GM `llm` e
jogador `QA Jogador` em dois clientes. Objetivo: o jogador aprovado **está** na cena (não olha uma
janela com imagem), a mesa não mexe e a volta é garantida.

## Problema da 0.1.0

`Scene#view()` numa cena inativa deixava o canvas **preto** para o jogador sem token, com o aviso
"There is no Token in this Scene which gives you visibility of the area." (hipótese H2 do blueprint).

## Matriz medida (`scene.view()` no cliente do jogador, cena "QA Sala 2", inativa)

| `tokenVision` | token na cena | permissão padrão | resultado |
| :-- | :-- | :-- | :-- |
| ligada | não | NONE | exibe a cena, **aviso `TOKEN.WarningNoVision`, canvas preto** |
| ligada | sim (sem dono, não é do jogador) | NONE | idem (sem dono = sem visão) |
| desligada | não | NONE | exibe, sem aviso, mapa desenha |
| desligada | sim | NONE | exibe, sem aviso |
| ligada | não | OBSERVER | exibe, aviso, canvas preto (a permissão não muda nada) |
| desligada | não | OBSERVER | exibe, sem aviso |

Em todas: `view()` não lança erro, `canvas.ready` fica `true`, a cena aparece na navegação do jogador
(`navigation: true`) e `game.scenes.active.view()` o devolve à mesa.

Não medido: token realmente **do jogador** (dono), Foundry 13.350, cena fora da navegação.

## Opções do blueprint

- **A. Token visitante**: o GM cria e apaga um token do personagem do jogador. Escreve no mundo, precisa
  de restauração se o GM cair.
- **B. Desligar `tokenVision` na cena**: escreve no mundo para todos; contador e restauração.
- **C. `view()` + imagem**: o fallback antigo.
- **D. (nova, escolhida) Override local**: `scene.updateSource({ tokenVision: false })` **antes** de
  `scene.view()`, só no cliente do jogador. `updateSource` não grava no servidor.

## Decisão (D1): opção D

Medido: com a visão ligada no servidor, o override local faz o mapa desenhar e some o aviso; o servidor
continua com `tokenVision: true`; ao voltar, `updateSource({ tokenVision: true })` religa o valor local.
Sem token, sem flag na cena, sem restauração à prova de queda: **não há estado no servidor para
restaurar**. Recarregar o cliente do jogador também descarta o override.

Limites: se o GM editar o documento da cena durante a visita o valor local pode voltar ao do servidor
(o canvas escurece de novo; "Voltar à mesa" resolve). Não é controle de acesso: o documento da cena já
chega a todo cliente.

## Verificado ponta a ponta (2 clientes)

1. Jogador pede, GM aprova: jogador na Sala 2, faixa "Voltar à mesa", sem aviso, mapa desenhado;
   o GM continua na Sala 1 e o servidor com visão ligada.
2. **Voltar à mesa**: volta à cena ativa, faixa some, visão local religada.
3. GM ativa outra cena no meio da visita: o jogador acompanha, a faixa some, visão local religada.
4. Jogador não vê Notas no grafo nem o painel de Notas.

## Reexecutar

`macros/spike-visita.mjs` (macro do GM): roda a matriz com um segundo cliente conectado.
