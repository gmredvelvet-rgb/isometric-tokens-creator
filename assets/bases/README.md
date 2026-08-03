# Bases

Drop your PNGs in here and they show up in the editor's picker. There is no index file
to edit — the module scans these folders when the world starts.

```
assets/bases/
├── stone/
├── wood/
├── snow/
├── lava/
├── sand/
├── metal/
├── custom/     ← anything that doesn't fit the categories above
└── bases.json  ← optional, only needed to declare an exact contact point
```

The folder decides the category. The display name comes from the filename
(`stone-cobbles-01.png` → "Stone Cobbles 01").

Accepted formats: PNG, WebP, JPG, GIF. **Use PNG with real transparency.**

Reload the world (F5) after adding files so they get picked up.

---

## How a base needs to be drawn

The module aligns a base by its **contact ellipse** — the part that meets the ground.
For the token to sit in an isometric cell without manual correction, that ellipse has
to satisfy:

> **width / height = the projection's `ratio`**
>
> - True Isometric → **√3 ≈ 1.7320** (the common case)
> - Dimetric (2:1) → 2.0
> - Overhead (√2:1) → 1.4142
> - Projection (3:2) → 1.5

At `ratio = √3`, an ellipse 1000 px wide needs to be **577 px tall**.

Get the proportion wrong and the base will look fine in the editor while the token sits
slightly off the scene grid. Turn on **debug mode** in the module settings and the
editor will report the value it actually measured in the console.

### Practical advice

The simplest approach is to draw the base on a **square canvas**, ellipse centred and
spanning the full width. That is the convention the module assumes when it has nothing
better to go on.

If your base has side thickness, a decorative rim, or perspective of its own, the centre
of the ellipse will not line up with the centre of the image. The module estimates it
from the alpha bounding box the first time you select the base. If the estimate is off,
declare it by hand in `bases.json`.

---

## bases.json (optional)

Only needed if you want exact control over the contact point, or translatable labels.
Bases not listed here work fine.

```json
{
  "version": 1,
  "categories": [
    { "id": "stone", "label": "ITC.BaseCat.Stone", "icon": "fa-cube" }
  ],
  "bases": [
    {
      "id": "stone-01",
      "category": "stone",
      "label": "Stone Cobbles",
      "src": "assets/bases/stone/stone-01.png",
      "contact": { "cx": 0.5, "cy": 0.5, "rx": 0.4883, "ry": 0.2819 },
      "ratio": 1.7320508
    }
  ]
}
```

`contact` is **normalised 0–1** against the image dimensions:

| Field | Meaning |
|---|---|
| `cx`, `cy` | centre of the contact ellipse |
| `rx` | horizontal semi-axis |
| `ry` | vertical semi-axis (should equal `rx / ratio` on a square image) |

`label` accepts either literal text or a translation key (`ITC.Base.…`) defined in
`lang/en.json` and `lang/es.json`.

---

## Regenerating the sample bases

The bundled bases are generated procedurally with exact geometry:

```bash
node tools/generate-bases.js assets/bases
```

The script prints the deviation from the required `ratio`, which should be zero.
