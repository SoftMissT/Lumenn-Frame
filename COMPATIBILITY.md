# Lumenn Frame — Foundry Compatibility

## Direção oficial

```
PRIMARY TARGET          Foundry VTT 14.367
BACKWARD COMPATIBILITY  Foundry VTT 13.350+
SUPPORTED RANGE         13.350 → 14.999
```

**V14.367 é a API canônica.** V13.350 é compatibilidade retroativa via `scripts/foundry-compat.mjs` (`LumennCompat`), **somente** onde há diferença verificada. Nenhuma API exclusiva de uma geração fora da camada de compatibilidade.

`module.json`:
```json
"compatibility": { "minimum": "13.350", "verified": "14.367", "maximum": "14.999" }
```

> `verified: "14.367"` = meta de validação efetiva. **Pendente:** testar a implementação final no Foundry 14.367 (GM + Player) antes de declarar a build como estável. V13.350 exige smoke test de compatibilidade.

## Matriz de API

| Área | V14.367 | V13.350 | Estratégia |
| :-- | :-- | :-- | :-- |
| ApplicationV2 (DEFAULT_OPTIONS, position, setPosition) | `foundry.applications.api.ApplicationV2` | mesmo namespace | idêntico; sem adapter |
| DragDrop | `foundry.applications.ux.DragDrop` | mesmo namespace | idêntico; sem adapter |
| TextEditor.getDragEventData | `foundry.applications.ux.TextEditor.getDragEventData` | mesmo namespace | `LumennCompat.getDragData` (fallback parse manual) |
| fromUuid / fromUuidSync | globals | globals | `LumennCompat.resolveUuid/Sync` |
| Scene.activate() | `Scene#activate()` | idêntico | `LumennCompat.activateScene` |
| Scene.preload() | `Scene#preload()` | idêntico | `LumennCompat.preloadScene` (fallback no-op) |
| Playlist playAll/stopAll/updateEmbeddedDocuments | documento Playlist | idêntico | sem adapter (verificado no SDD) |
| PlaylistSound fade | campo persistido `fade`; accessor `fadeDuration` (leitura) | idêntico | `LumennCompat.updatePlaylistSound` / `setPlaylistSoundFade` (grava `{fade}`) |
| Playlist fade | campo `fade`; autoridade única (Playlist OU Sound, nunca ambos) | idêntico | engine `#start/#stop` com save/restore |
| Module socket | `game.socket`, `"socket": true` | idêntico | `LumennCompat.socketOn/Emit`, `broadcastTransition` |
| DialogV2.prompt/confirm | `foundry.applications.api.DialogV2` | mesmo namespace | sem adapter (leitura via `button.form.elements`) |
| game.settings.set | Promise | Promise | store com `await` |
| Folder drag payload (uuid) | `TextEditor.getDragEventData` | idêntico | `LumennCompat.getDragData` |
| Folder subfolders recursivo | `Folder#getSubfolders(true)` | idêntico | `LumennCompat.collectFolderDocuments` (fallback `children`) |
| Scene transitions nativas | `CONFIG.Canvas.sceneTransitions` + `canvas.transition.run` | não documentado publicamente | `LumennCompat.getSceneTransitions` / `runSceneTransition` (feature-detected; fallback cut/fade/dip) |
| ResizeObserver | DOM padrão | DOM padrão | sem adapter |

## Documentação dos métodos da camada (`foundry-compat.mjs`)

Cada método traz no JSDoc: implementação **V14**, fallback **V13**, fonte.

| Método | V14 impl | V13 fallback | Fonte |
| :-- | :-- | :-- | :-- |
| `getDragData` | `foundry.applications.ux.TextEditor.getDragEventData` | `JSON.parse(dataTransfer.getData("text/plain"))` | Context7 (DragDrop/AppV2) |
| `resolveUuid` / `resolveUuidSync` | `fromUuid` / `fromUuidSync` | — | Context7 (Documents) |
| `activateScene` | `Scene#activate()` | — | Research-Lumenn-Frame |
| `preloadScene` | `Scene#preload()` | no-op | idem |
| `updatePlaylistSound` / `setPlaylistSoundFade` | `PlaylistSound#update({fade})` | `{fade}` (campo persistido) | schema PlaylistSoundData `fade?: number` |
| `getPlaylistSoundFade` | `sound.fade` (campo) / `sound.fadeDuration` (accessor) | idêntico | leitura tolerante ao shape |
| `socketOn` / `socketEmit` / `broadcastTransition` | `game.socket` | no-op se indisponível | Context7 (sockets) |
| `expandWorkspace` | `ApplicationV2#setPosition` | — | Context7 (AppV2) |
| `getSceneTransitions` | `CONFIG.Canvas.sceneTransitions` (runtime) | fallback cut/fade/dip | feature-detected |
| `runSceneTransition` | `canvas.transition.run` | fallback cut / fade/dip Lumenn | feature-detected |
| `collectFolderDocuments` | `Folder#getSubfolders(true)` | walk `children` recursivo | v13+v14 |

## Regras
1. Usar **sempre** `LumennCompat.*` para acesso a essas APIs.
2. Adapters só após diferença **verificada** (V14 vs V13).
3. Adicionar linha aqui antes de introduzir qualquer nova API Foundry no módulo.