# Lumenn Frame

Módulo standalone para Foundry VTT v13+. Dá ao mestre um storyboard visual de cenas (Beats) com continuidade de áudio.

Versão atual: **0.0.1**. O módulo inclui HUD de GM, canvas visual de Beats, CRUD persistido em `game.settings`, conexões, arrastar nós e transição manual de Scene com continuidade de áudio/crossfade.

## Instalação

1. Foundry VTT **v13.350+** (verificado em v13; máximo 14.999).
2. Instalar via manifesto:

```
https://github.com/SoftMissT/Lumenn-Frame/releases/latest/download/module.json
```

3. Ativar **Lumenn Frame** na configuração do mundo.

## Uso (GM)

Abra o controle **Lumenn Frame** na barra de controles da Scene. Crie um
Storyboard e Beats, arraste-os no canvas e use **Editar** para selecionar Scene,
faixa/Playlist e duração do crossfade. Defina um Beat como **Início** e use
**Vincular** para criar as conexões permitidas. Troque para **Ao Vivo** e clique
em **Ir** apenas nos Beats conectados; a Scene é ativada e o áudio é mantido,
cruzado ou suavemente encerrado conforme a fonte configurada. Jogadores não
recebem controles de edição ou transição.

## Desenvolvimento

Pasta do módulo deve se chamar `lumenn-frame` (igual ao `id` do manifesto).

```
lumenn-frame/
  module.json
  scripts/lumenn-frame.mjs
  styles/lumenn-frame.css
  templates/
  lang/
```

## Licença

GPL-3.0. Ver `LICENSE`.
