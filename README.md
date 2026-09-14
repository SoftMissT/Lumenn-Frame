# Lumenn Frame

Módulo standalone para Foundry VTT v13+. Dá ao mestre um storyboard visual de cenas (Beats) com continuidade de áudio.

Versão atual: **0.0.1** — bootstrap. O módulo ativa sem erros; motor de áudio, dados e canvas ainda não estão nesta fatia.

## Instalação

1. Foundry VTT **v13.350+** (verificado em v13; máximo 14.999).
2. Instalar via manifesto:

```
https://github.com/SoftMissT/Lumenn-Frame/releases/latest/download/module.json
```

3. Ativar **Lumenn Frame** na configuração do mundo.

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
