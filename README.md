# Lumenn Frame

[![Release](https://img.shields.io/github/v/release/SoftMissT/Lumenn-Frame?include_prereleases&label=Release)](https://github.com/SoftMissT/Lumenn-Frame/releases)
[![Foundry VTT](https://img.shields.io/badge/Foundry%20VTT-14.367-orange)](https://foundryvtt.com)
[![Compatibility](https://img.shields.io/badge/Compatibility-13.350--14.999-lightgrey)](#compatibility)
[![License](https://img.shields.io/github/license/SoftMissT/Lumenn-Frame)](LICENSE)
[![JavaScript](https://img.shields.io/badge/JavaScript-ES%20Modules-yellow)](#development)

Lumenn Frame is a **cinematic graph editor** for Foundry VTT. The GM builds a navigable storyboard as a node graph — Scene nodes, Audio nodes and Note nodes connected by directional flow edges — with configurable scene/audio transitions, an infinite pan/zoom canvas, a contextual Inspector and live GM-driven navigation.

## Graph Editor 2.0

A spatial node editor (interaction model inspired by Obsidian Canvas and DaVinci Resolve/Fusion — not a copy of their look):

- **Infinite canvas** with a real camera (`pan`/`zoom`/`Fit All`), not scrollbars
- **Scene / Audio / Note** node types with colors and sizes
- **Ports** and drag **port → port** connections
- **FLOW edges** (directional narrative) and **AUDIO edges** (sound attachment)
- **Inspector** panel for contextual properties
- **Edit / Live** modes with structural guards
- **GM → Player** transition synchronization via module socket

## Features

### Canvas
- Workspace mode (`Expand`/`Restore`) via `ApplicationV2.setPosition`
- Infinite graph space (positive/negative coordinates)
- Pan (Space + drag, or middle mouse)
- Cursor-centered zoom (25% – 200%)
- Fit All / 100% reset

### Nodes
- Scene Nodes (`🎬` Foundry Scene, with thumbnail)
- Audio Nodes (`♫` Playlist / PlaylistSound, distinct look)
- Note Nodes (`📝` GM annotation — not navigable)
- Per-node colors
- Per-node sizes (`compact` / `normal` / `large`)

### Graph
- Directional FLOW edges (`Scene → Scene`)
- AUDIO attachment edges (dashed, non-navigable)
- Reciprocal `A→B` / `B→A` as independent edges (offset curves)
- Selectable edges (thick invisible hit target)
- Ports (FLOW IN/OUT, AUDIO IN/OUT) with ghost curve + target highlight
- Drag port-to-port connection creation

### Inspector
- Scene properties (scene picker)
- Audio properties (source, volume, loop)
- Note editor (title/body)
- Color / size / notes
- Edge transition properties (Scene + Audio)
- `Add return B → A` / Delete / Set Initial

### Transitions
- Per-FLOW-edge Scene transition (`Cut` / `Fade`) + duration
- Per-FLOW-edge Audio transition (`Auto` / `Keep` / `Crossfade` / `Fade Out` / `Fade In`) + crossfade duration
- Audio source resolution through attached Audio Nodes

> **Experimental / runtime validation pending:** real audio crossfade, Scene fade overlay and GM→Player sync are implemented but still require runtime QA in a live world (see [Development Status](#development-status)).

### Live
- Edit / Live modes
- Navigation only through outgoing FLOW edges of the active node
- GM-driven execution (Scene activation + audio transition)
- Player synchronization infrastructure (module socket `module.lumenn-frame`)

## Node Types

| Node | Source | Navigation |
| :-- | :-- | :-- |
| 🎬 Scene Node | Foundry Scene | Yes (FLOW) |
| ♫ Audio Node | Playlist / PlaylistSound | No — attaches sound to a Scene via AUDIO edge |
| 📝 Note Node | GM annotation | No |

Legacy Beat schema is migrated into **Graph Schema v2** automatically (with backup).

## Flow & Transitions

- `Scene → Scene` = allowed narrative direction (FLOW edge).
- `A→B` does **not** imply `B→A` — both edges are independent and can coexist.
- Each FLOW edge carries its own Scene transition (`Cut`/`Fade`, duration) and Audio transition (`Auto`/`Keep`/`Crossfade`/`Fade Out`/`Fade In`, crossfade duration).
- `A→B` and `B→A` can have different transition settings.
- AUDIO edges are dashed and never navigable.

## Canvas Controls

| Input | Action |
| :-- | :-- |
| Mouse wheel | Zoom centered on cursor |
| `Space` + left drag | Pan |
| Middle mouse drag | Pan |
| `-` / `100%` / `+` / `Fit` | Camera controls (top bar) |
| `Expand` / `Restore` | Workspace (full viewport) |
| Left toolbar | Select / Hand / Connect / Scene / Audio / Note tools |

## Compatibility

**Primary target:** Foundry VTT **14.367** (manifest `verified`).
**Minimum supported:** Foundry VTT **13.350**.
**Maximum declared:** Foundry VTT **14.999**.

| Foundry version | Status |
| :-- | :-- |
| 14.367 | Primary target / manifest verified |
| 13.350+ | Backward compatibility target |
| < 13.350 | Unsupported |
| >= 15 | Unsupported |

> **Manifest compatibility** (declared range above) is distinct from **runtime validation status**. All API differences are concentrated in `scripts/foundry-compat.mjs`; see [`COMPATIBILITY.md`](COMPATIBILITY.md) for the V14-first / V13 fallback matrix. Runtime QA on 14.367 and a 13.350 smoke test are still pending (see Development Status).

## Installation

Use the **manifest URL** (do **not** paste the ZIP into the manifest field):

Current public build (`v0.0.15`, `Latest`):

```
https://github.com/SoftMissT/Lumenn-Frame/releases/latest/download/module.json
```

Specific prerelease (e.g. `v0.0.15-alpha.2`, historical):

```
https://github.com/SoftMissT/Lumenn-Frame/releases/download/v0.0.15-alpha.2/module.json
```

1. Foundry → *Install Module* → paste the manifest URL into **Manifest URL**.
2. Enable **Lumenn Frame** for the world.
3. Reload. Legacy storyboards (schema v1) are migrated automatically with backup.

## Development Status

The Graph Editor 2.0 implementation is code-complete. `v0.0.15` is the **current public runtime validation build** (`Latest` channel) — QA is still pending, so treat it as a validation release, not a fully validated stable.

Known validation gaps (pending runtime QA):

- Real audio crossfade (requires live audio test)
- Scene fade overlay timing (requires live GM test)
- GM → Player synchronization (requires two-client QA)
- Foundry **14.367** runtime QA (GM + Player)
- Foundry **13.350** compatibility smoke test
- verified `14.367` in the manifest reflects the primary target, not a completed test run

## Preview

*Screenshot of the Graph Editor 2.0 is pending runtime QA. No legacy Beat Canvas image is used here.*

## License

GPL-3.0. See [`LICENSE`](LICENSE).