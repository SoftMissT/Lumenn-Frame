# Lumenn Frame — Foundry Compatibility

Target: **Foundry VTT 13.350 – 14.999**.
Toda diferença de API entre gerações fica concentrada em `scripts/foundry-compat.mjs` (`LumennCompat`). Nenhum `if (game.release.generation === 13)` espalhado pelo código.

> [!warning] Status de validação
> A `v0.0.15-alpha.2` ainda **não foi testada em runtime** (nem v13 nem v14).
> `module.json` declara `verified: "13.350"` como baseline de desenvolvimento; **não** é uma afirmação de teste. O teste real de v13.350/13.351 e v14 atual (GM + Player) está pendente na test matrix.

| API                                                      | v13.350                                  | v14 atual                     | Adapter                                                     | Fallback                                         |
| :------------------------------------------------------- | :--------------------------------------- | :---------------------------- | :---------------------------------------------------------- | :----------------------------------------------- |
| `ApplicationV2` (DEFAULT_OPTIONS, position, setPosition) | ✓ (namespace `foundry.applications.api`) | não testado — mesmo namespace | `LumennCompat.getViewportSize()` p/ workspace               | —                                                |
| `DragDrop` (`foundry.applications.ux`)                   | ✓                                        | não testado                   | —                                                           | —                                                |
| `TextEditor.getDragEventData`                            | ✓ (`foundry.applications.ux.TextEditor`) | não testado                   | `LumennCompat.getDragData`                                  | `JSON.parse(dataTransfer.getData("text/plain"))` |
| `fromUuid` / `fromUuidSync`                              | ✓ (globals)                              | não testado                   | `LumennCompat.resolveUuid/Sync`                             | —                                                |
| `Scene.activate()`                                       | ✓ (verificado no SDD)                    | não testado                   | `LumennCompat.activateScene`                                | —                                                |
| `Scene.preload()`                                        | ✓                                        | não testado                   | `LumennCompat.preloadScene`                                 | no-op                                            |
| Module sockets (`game.socket`, `"socket": true`)         | ✓                                        | não testado                   | `LumennCompat.socketOn/Emit`                                | no-op se indisponível                            |
| `Playlist#playAll/stopAll/updateEmbeddedDocuments`       | ✓ (verificado no SDD)                    | não testado                   | —                                                           | —                                                |
| `PlaylistSound#update({fadeDuration, playing})`          | ✓ (verificado no SDD)                    | não testado                   | `LumennCompat.updatePlaylistSound` / `getPlaylistSoundFade` | —                                                |
| `DialogV2.prompt/confirm` (`foundry.applications.api`)   | ✓                                        | não testado                   | —                                                           | leitura via `button.form.elements`               |
| `game.settings.set` (Promise)                            | ✓                                        | não testado                   | store com `await`                                           | —                                                |
| Folder drag payload (`uuid`)                             | ✓                                        | não testado                   | `LumennCompat.getDragData`                                  | —                                                |
| `ResizeObserver`                                         | ✓ (DOM padrão)                           | ✓ (DOM padrão)                | —                                                           | —                                                |

## Regras

1. Usar **sempre** `LumennCompat.*` para acesso a essas APIs no código do módulo.
2. Feature detection quando a API permite; `getGeneration()` apenas quando necessário (hoje: nenhum uso direto além do compat).
3. Adicionar linha aqui antes de introduzir qualquer nova API Foundry no módulo.
