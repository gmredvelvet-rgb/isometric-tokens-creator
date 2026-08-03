# Isometric Token Creator

A visual editor for Foundry VTT v13 that composes **base + character + shadow** into a
transparent PNG, aligned to the isometric projection used by
[`isometric-perspective`](https://github.com/arlosmolten/isometric-perspective).

Works with **D&D 5e**, **Pathfinder 2e**, and system-agnostic worlds.

> **Early Access.** This is the first public build. It has been verified statically but
> not yet exercised across a wide range of worlds — see [Early Access](#early-access)
> before installing on a campaign you care about.

---

## The problem

Placing creature art on an isometric base by hand is tedious, and the result is almost
never quite right: the token floats above the cell, sinks into it, or spills over the
edge. You end up nudging offsets until it looks acceptable, then doing it again for the
next token.

This module composes the image and gets the alignment right by construction, so there
are no offsets to tune.

## Why the alignment holds

Reading through `isometric-perspective`, the `stage × mesh` composition turns out to be
a pure axis-aligned scale:

```
True Isometric →  diag(√6/2, √2/2)      H/V = √3  = ratio
Dimetric (2:1) →  diag(1.2649, 0.6325)  H/V = 2.0 = ratio
```

Token art therefore renders **upright** on screen, occupying a square whose width equals
the horizontal diagonal of the cell's rhombus. Three rules follow directly:

| | Rule | Reason |
|---|---|---|
| **R1** | Square canvas | With a square texture, `sx = sy = 1` for every value of `texture.fit`. This makes the output immune to that setting, which is far and away the most common cause of misalignment. |
| **R2** | Contact ellipse dead centre | `isometric-perspective` anchors the mesh at the centre of the cell, so `offsetX = offsetY = 0` is sufficient. |
| **R3** | Ellipse aspect = `ratio : 1` | Makes the base sit exactly on the cell's rhombus. |

The `Compositor` enforces these with runtime assertions in debug mode rather than just
documenting them. Full derivation in [`docs/ARQUITECTURA.md`](docs/ARQUITECTURA.md) §6.3.

---

## Requirements

- Foundry VTT **v13**
- No build step — the module ships as native ESM

`isometric-perspective` is a **soft dependency**. Without it the editor still works,
falling back to True Isometric (`ratio = √3`).

## Installation

Paste the manifest URL into Foundry's module installer:

```
https://github.com/gmredvelvet-rgb/isometric-tokens-creator/releases/latest/download/module.json
```

Or copy the folder into `Data/modules/` and enable it in your world.

## Usage

Three entry points:

- Scene controls → the cube button
- Actor sheet header → *Create isometric token*
- Token HUD, with a token selected

The flow is: pick a base, import the character (drag and drop, or the file picker),
adjust, then **Save token** or **Export image**.

### Source formats

| Format | Behaviour |
|---|---|
| PNG, WebP, JPG | Used as-is |
| GIF | First frame only |
| WebM, MP4, OGV | One frame, chosen with a slider |

Output is always a static PNG or WebP.

Importing a video adds a *Frame* control to the import panel. It defaults to 25% into
the clip rather than the first frame, because a lot of effect WebMs open on black or on
full transparency, which would give you nothing to work with. The WebM alpha channel
(VP8/VP9) is preserved, so animated token packs with transparency work well as sources.

Your frame choice is stored in the `.itcproj` file, so reopening a project reproduces
the same image.

> Exporting **animated** tokens (APNG, animated WebP, WebM) is planned for Phase 6.

### Shortcuts

| Action | Shortcut |
|---|---|
| Undo / Redo | `Ctrl+Z` / `Ctrl+Shift+Z` |
| Save project | `Ctrl+S` |
| Cancel drag | `Esc` |
| Pan | `Shift` + drag, or middle mouse |
| Zoom | Mouse wheel |
| Override snapping | Hold `Alt` |
| Step ×10 / ÷10 on `±` controls | `Shift` / `Alt` |
| Reset a control | Double-click its label |

---

## Bases

Drop your PNGs into `assets/bases/<category>/` and they appear in the picker on their
own — the module scans those folders at world startup, so there is no index file to
maintain. Geometry requirements are in [`assets/bases/README.md`](assets/bases/README.md).

---

## System compatibility

The core is system-agnostic: it produces an image and writes standard Foundry
`texture.*` fields. The only system-specific part is where creature size is read from,
and that is isolated in `SystemAdapter`:

| System | Size path |
|---|---|
| PF2e | `actor.system.traits.size.value` (object) |
| D&D 5e | `actor.system.traits.size` (string) |
| Generic | Accepts either shape |

Adding another system does not require touching the module:

```js
class MySystem extends game.itc.BaseSystemAdapter {
  static systemId = "my-system";
  getSizeKey(actor) { return actor.system.size; }
}
game.itc.registerSystemAdapter(MySystem);
```

---

## API

Exposed on `game.itc` and on `game.modules.get("isometric-tokens-creator").api`.

```js
await game.itc.open();                     // open the editor
await game.itc.open({ actor });            // prefilled from an actor
await game.itc.openProject(path);          // open an .itcproj
game.itc.getRatio();                       // active projection ratio
game.itc.diagnostics();                    // environment report
```

### Hooks

| Hook | Cancellable |
|---|---|
| `isometric-tokens-creator.editorReady` | no |
| `isometric-tokens-creator.projectChanged` | no |
| `isometric-tokens-creator.beforeExport` | **yes** |
| `isometric-tokens-creator.afterExport` | no |
| `isometric-tokens-creator.beforeApplyToken` | **yes** |
| `isometric-tokens-creator.baseLibraryLoaded` | no |

---

## Development tools

```bash
node tools/verify-architecture.js .    # imports, exports, cycles, layering
node tools/generate-bases.js assets/bases
```

`verify-architecture.js` checks that every import resolves, that every imported name
actually exists as an export, that there are no cycles, and that the layering rule holds
(a layer may only import from layers at or below its own level).

---

## Early Access

Phases 0–5 of the architecture document are implemented: 41 ES modules, no cycles, no
dead imports, layering verified.

**What that verification does not cover is runtime behaviour inside Foundry.** Everything
checked so far is static — syntax, import resolution, translation coverage, base
geometry. Three specific questions from Phase 0 are handled defensively in code but have
not been confirmed against a live client:

- the PIXI version, and whether `extract.canvas` is async
- the shape of `getSceneControlButtons` in v13
- the real namespace of `FilePicker` in v13

If any of them behaves differently than assumed, the failure will be loud and early
rather than silent. Run `game.itc.diagnostics()` after enabling the module and it will
tell you what it found.

I am releasing it this way on purpose. The geometry is the hard part and it is settled;
what remains is contact with the variety of setups people actually run. If you hit
something, an issue with your Foundry version, game system, and the output of
`game.itc.diagnostics()` is genuinely useful and will get fixed quickly.

**[Report an issue →](https://github.com/gmredvelvet-rgb/isometric-tokens-creator/issues)**

## Support

Development is funded through [Patreon](https://www.patreon.com/gmredvelvet). Supporters
get early builds and a direct line for bug reports and feature requests.

The module itself is not gated: every feature works whether or not a licence is active.
An unlicensed world sees an occasional reminder, and nothing else changes.

## Licence

MIT
