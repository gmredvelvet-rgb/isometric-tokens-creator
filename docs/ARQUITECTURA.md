# ISOMETRIC TOKEN CREATOR — Documento Técnico de Arquitectura

**Módulo:** `isometric-tokens-creator`
**Target:** Foundry VTT v13 · PIXI 7 · JavaScript ES2022 (ESM, sin build step)
**Sistemas:** PF2e · D&D5e · Agnóstico
**Dependencia blanda:** `isometric-perspective` v0.9.7+ (ArlosMolten / WarpSpeedNyanCat)
**Estado:** Borrador para aprobación — v1.0
**Fecha:** 2026-07-31

---

## 0. Resumen ejecutivo y hallazgo clave

Este documento especifica un editor visual de tokens isométricos que compone
`base + artwork + sombra` sobre un canvas PIXI y exporta un PNG transparente
alineado **exactamente** con la proyección de `isometric-perspective`.

Antes de escribir arquitectura leí el código real de `isometric-perspective`
(instalado en `modules/isometric-perspective`) y derivé su matriz de composición.
El resultado condiciona todo el diseño, así que va primero:

> ### Regla de Oro
>
> Cuando una escena es isométrica, `isometric-perspective` aplica al *stage* una
> rotación + skew, y al *mesh* del token una **contra-transformación** exacta.
> La composición de ambas es una **escala pura alineada a los ejes** — sin
> rotación ni skew residual.
>
> Consecuencia: **el arte del token se ve recto en pantalla**, y ocupa un
> cuadrado cuyo ancho es igual a la **diagonal horizontal del rombo de rejilla**.
>
> Por tanto, si exportamos un **PNG cuadrado** cuya **elipse de contacto de la
> base está centrada en el centro exacto del lienzo** y tiene una relación de
> aspecto de **exactamente `ratio : 1`** (√3 : 1 en True Isometric), el token
> encaja perfecto en la celda **con cero flags de corrección**
> (`offsetX = 0`, `offsetY = 0`, `anchor = 0.5/0.5`).

La derivación completa está en la **§6.3**. Esa constante `ratio` es el eje
central del módulo: la rejilla del viewport, la plantilla de bases, el
gizmo y el exportador se derivan todos de ella.

---

## 1. Arquitectura completa

### 1.1 Principios rectores

| Principio | Aplicación concreta |
|---|---|
| **MVC estricto** | El *Model* (`TokenProject`) es datos puros serializables. La *View* (PIXI + DOM) nunca posee estado. El *Controller* solo emite Commands. |
| **Command Pattern** | Toda mutación del modelo pasa por un `Command` con `execute()`/`undo()`. Undo/Redo es gratis y total. |
| **Event Bus** | Las capas no se conocen entre sí. Se comunican por eventos tipados. Cero imports circulares. |
| **Render bajo demanda** | PIXI en modo `autoStart: false`. Se renderiza solo cuando un dirty-flag lo pide. |
| **Nada hardcodeado** | Bases, rutas, proyección, precisión, atajos: todo desde `settings` o manifiestos JSON. |
| **Sin build step** | ESM nativo. Se instala copiando la carpeta. Depurable en el navegador tal cual. |
| **Degradación elegante** | Si `isometric-perspective` no está activo, el módulo sigue funcionando en modo "ratio manual". |

### 1.2 Capas del sistema

```
┌──────────────────────────────────────────────────────────────────┐
│  NIVEL 9 · APLICACIÓN (ApplicationV2 + HandlebarsApplicationMixin)│
│  IsoTokenEditor · NumericSlider · api.js                         │
├──────────────────────────────────────────────────────────────────┤
│  NIVEL 8 · ASSETS        BaseLibrary · BaseManifest              │
├──────────────────────────────────────────────────────────────────┤
│  NIVEL 7 · IO            ImageImporter · DropHandler             │
│                          FilePickerService · ProjectManager      │
├──────────────────────────────────────────────────────────────────┤
│  NIVEL 6 · EXPORT        Compositor · PngEncoder                 │
│                          FileUploader · TokenApplier             │
├──────────────────────────────────────────────────────────────────┤
│  NIVEL 5 · CANVAS        StageController · SceneGraph · Layers   │
│                          CameraController · PointerRouter        │
│                          TransformControls · SnapService         │
├──────────────────────────────────────────────────────────────────┤
│  NIVEL 4 · RENDER        RenderScheduler · TextureCache          │
│                          ShadowFilterFactory                     │
├──────────────────────────────────────────────────────────────────┤
│  NIVEL 3 · COMANDOS      Command · SetPropertyCommand            │
│                          MacroCommand · HistoryManager           │
├──────────────────────────────────────────────────────────────────┤
│  NIVEL 2 · MODELO        TokenProject · schema (versionado)      │
├──────────────────────────────────────────────────────────────────┤
│  NIVEL 1 · ADAPTADORES   IsoPerspectiveBridge · SystemAdapter    │
│                          ControlsRegistration                    │
├──────────────────────────────────────────────────────────────────┤
│  NIVEL 0 · NÚCLEO        EventBus · Store · Logger               │
│                          constants · settings                    │
└──────────────────────────────────────────────────────────────────┘
```

**Regla de dependencias:** un nivel **solo** puede importar de niveles iguales o
inferiores. La comunicación ascendente es siempre vía `EventBus`.

Verificado mecánicamente por `tools/verify-architecture.js`, que comprueba
además que todo import resuelva, que todo nombre importado exista realmente
como export, y que no haya ciclos.

> **Corrección respecto al borrador de este documento.** El borrador situaba
> `integration/` en la capa más alta. La implementación demostró que es falso:
> `IsoPerspectiveBridge` y `SystemAdapter` son adaptadores de *lectura* que sólo
> dependen del núcleo, y a los que consultan el modelo y el exportador. Su sitio
> es el nivel 1. `ControlsRegistration` vive en la misma carpeta pero no importa
> nada hacia arriba: recibe la fábrica del editor inyectada desde `main.js`,
> precisamente para no crear el ciclo.
>
> `config` y `core` comparten el nivel 0 a propósito: `Logger` necesita
> `constants` y `settings` necesita `Logger`. Son un núcleo indivisible.

---

## 2. Árbol de carpetas

```
isometric-tokens-creator/
├── module.json
├── README.md
├── CHANGELOG.md
├── LICENSE
│
├── docs/
│   ├── ARQUITECTURA.md              ← este documento
│   ├── COMPATIBILIDAD.md            ← contrato con isometric-perspective
│   └── FORMATO-PROYECTO.md          ← esquema .itcproj
│
├── lang/
│   ├── en.json
│   └── es.json
│
├── styles/
│   ├── itc-variables.css            ← design tokens (colores, spacing, radios)
│   ├── itc-app.css                  ← layout 3 columnas + header + footer
│   ├── itc-panels.css               ← paneles, secciones colapsables
│   ├── itc-widgets.css              ← slider+input+±, swatches, dropzone
│   └── itc-viewport.css             ← overlay del viewport, toolbar flotante
│
├── templates/
│   ├── editor.hbs                   ← shell raíz
│   └── parts/
│       ├── header.hbs
│       ├── base-selector.hbs
│       ├── importer.hbs
│       ├── viewport.hbs
│       ├── inspector-character.hbs
│       ├── inspector-base.hbs
│       ├── inspector-shadow.hbs
│       ├── preview.hbs
│       └── footer.hbs
│
├── assets/
│   ├── bases/
│   │   ├── bases.json               ← manifiesto (categorías + metadatos)
│   │   ├── stone/  wood/  snow/
│   │   ├── lava/   sand/  metal/
│   └── ui/
│       └── checker.png
│
└── scripts/
    ├── main.js                      ← bootstrap: init/setup/ready
    ├── api.js                       ← API pública del módulo
    │
    ├── config/
    │   ├── constants.js             ← MODULE_ID, IDs de flags, límites
    │   ├── settings.js              ← game.settings.register(...)
    │   └── projection.js            ← tabla de proyecciones + ratio activo
    │
    ├── core/
    │   ├── EventBus.js
    │   ├── Store.js
    │   ├── Logger.js
    │   └── Result.js                ← Result<T,E> para IO sin try/catch anidado
    │
    ├── model/
    │   ├── TokenProject.js
    │   ├── LayerState.js
    │   ├── defaults.js
    │   └── schema.js                ← validación + migraciones por versión
    │
    ├── commands/
    │   ├── Command.js               ← clase base abstracta
    │   ├── HistoryManager.js
    │   ├── MacroCommand.js
    │   ├── SetPropertyCommand.js    ← genérico, con coalescencia
    │   ├── TransformCommand.js
    │   ├── SetBaseCommand.js
    │   └── SetArtworkCommand.js
    │
    ├── canvas/
    │   ├── StageController.js
    │   ├── SceneGraph.js
    │   ├── CameraController.js
    │   ├── PointerRouter.js
    │   ├── SnapService.js
    │   ├── layers/
    │   │   ├── CheckerLayer.js
    │   │   ├── IsoGridLayer.js
    │   │   ├── ShadowLayer.js
    │   │   ├── BaseLayer.js
    │   │   ├── ArtworkLayer.js
    │   │   └── OverlayLayer.js
    │   └── gizmo/
    │       ├── TransformControls.js
    │       ├── AxisGizmo.js
    │       ├── BoundingBox.js
    │       ├── HandleSet.js
    │       └── PivotMarker.js
    │
    ├── render/
    │   ├── RenderScheduler.js
    │   ├── TextureCache.js
    │   └── ShadowFilterFactory.js
    │
    ├── export/
    │   ├── Compositor.js
    │   ├── PngEncoder.js
    │   ├── FileUploader.js
    │   └── TokenApplier.js
    │
    ├── io/
    │   ├── ImageImporter.js
    │   ├── DropHandler.js
    │   ├── FilePickerService.js
    │   └── ProjectManager.js
    │
    ├── assets/
    │   ├── BaseLibrary.js
    │   └── BaseManifest.js
    │
    ├── apps/
    │   ├── IsoTokenEditor.js
    │   ├── panels/
    │   │   ├── Panel.js             ← base: mount/unmount/refresh parcial
    │   │   ├── BaseSelectorPanel.js
    │   │   ├── ImportPanel.js
    │   │   ├── InspectorPanel.js
    │   │   ├── PreviewPanel.js
    │   │   └── FooterPanel.js
    │   └── widgets/
    │       ├── NumericSlider.js     ← slider + input + botones ± (Web Component)
    │       └── ColorField.js
    │
    └── integration/
        ├── IsoPerspectiveBridge.js
        ├── SystemAdapter.js
        └── ControlsRegistration.js
```

---

## 3. Flujo de datos

### 3.1 Flujo unidireccional

```
   Interacción                Comando               Modelo
   ───────────                ───────               ──────
 [Slider / Gizmo /  ] ──emit──▶ [HistoryManager]
 [Atajo / Panel     ]              │
                                   │ execute()
                                   ▼
                            [SetPropertyCommand]
                                   │ muta
                                   ▼
                            ┌─────────────┐
                            │ TokenProject│ (única fuente de verdad)
                            └──────┬──────┘
                                   │ Store.notify(patch)
                                   ▼
                            ┌─────────────┐
                            │  EventBus   │  'model:changed' {paths:[...]}
                            └──┬───┬───┬──┘
              ┌────────────────┘   │   └────────────────┐
              ▼                    ▼                    ▼
      [SceneGraph]          [InspectorPanel]      [PreviewPanel]
      marca capas dirty     refresca solo los     marca preview
              │             inputs afectados      dirty
              ▼
      [RenderScheduler] ── requestAnimationFrame ──▶ renderer.render()
```

**Invariantes:**

1. Ningún componente escribe en `TokenProject` directamente. Solo Commands.
2. `EventBus` emite el conjunto de **rutas** cambiadas
   (`['artwork.x','artwork.y']`), no el objeto entero. Los suscriptores filtran
   con un prefijo. Esto evita re-renders totales.
3. La View es una **proyección pura** del Model. Cerrar y reabrir el editor con
   el mismo proyecto produce un resultado idéntico bit a bit.

### 3.2 Coalescencia de comandos (undo utilizable)

Arrastrar un gizmo genera ~200 eventos `pointermove`. Sin coalescencia el undo
sería inservible.

- `pointerdown` → `history.beginTransaction('move-artwork')`
- `pointermove` → `command.merge(nuevoValor)` sobre el comando en curso; el
  `undo()` conserva el valor **inicial** del gesto.
- `pointerup` → `history.commit()` → una sola entrada en el stack.

Los sliders usan la misma transacción vía eventos `input` (merge) / `change`
(commit). Se aplica el mismo criterio a la escritura por teclado con un debounce
de 400 ms.

### 3.3 Flujo de importación

```
Drop OS / Drop Foundry / FilePicker / Botón
        └──▶ DropHandler ─normaliza──▶ ImageImporter
                                           │
                    ┌──────────────────────┼──────────────────────┐
                    ▼                      ▼                      ▼
              File (OS)              path (servidor)         DragData Foundry
                    │                      │                (Actor/Item/Tile)
              createObjectURL         ruta directa           resuelve .img
                    └──────────┬───────────┴──────────────────────┘
                               ▼
                        TextureCache.load(src)
                               │  valida: tipo MIME, dimensiones, cuota
                               ▼
                    SetArtworkCommand ──▶ TokenProject.artwork
                               │
                               ▼
                    AutoFit inicial (§9.6): encaja el arte sobre la base
```

---

## 4. Componentes

### 4.1 Mapa de la interfaz (según mockup aprobado)

```
┌────────────────────────────────────────────────────────────────────────────┐
│ ⬢ ISOMETRIC TOKEN CREATOR          [badge módulo]                      [✕] │
├──────────────┬──────────────────────────────────────┬──────────────────────┤
│ 1. BASES     │  VISTA PREVIA        [🖐][⟳][◐][⊙][⊞]│ 3. CONTROLES IMAGEN  │
│  ┌──┬──┬──┐  │                                      │  Posición X  ─ 12 +  │
│  │▣ │  │  │  │        ╱▲ Z (azul)                   │  Posición Y  ─  8 +  │
│  ├──┼──┼──┤  │      ┌─╫────────┐   ┌──────────┐     │  Posición Z  ─ 35 +  │
│  │  │  │  │  │      │ ║ ARTWORK│   │ EJES     │     │  Escala   ▬▬▬●── 100%│
│  ├──┼──┼──┤  │      │ ║        │   │ Z arriba │     │  Rotación ▬▬●─── 45° │
│  │  │  │  │  │      └─╫────────┘   │ Y prof.  │     │  Opacidad ▬▬▬●─ 100% │
│  └──┴──┴──┘  │    ◀───╫═══▶ Y (verde)         │     │  [ VOLTEAR H ]       │
│  [+ MÁS...]  │        ╲▼ X (rojo)             │     ├──────────────────────┤
├──────────────┤                                      │ 4. CONTROLES BASE    │
│ 2. IMPORTAR  │            ⬭ BASE                    │  Escala   ▬▬▬●─ 110% │
│  ┌────────┐  │                                      │  Rotación ▬▬●───   0°│
│  │ ☁ drop │  │                                      │  Elevación(Z) ──   0 │
│  └────────┘  │  [↶][↷]  [⊣][⊢][⊕]      ☐ Cuadrícula│  ☑ Sombra            │
│  [EXPLORAR]  │                                      │    Intensidad ── 70% │
│  ▣ file.png  │                                      │                      │
├──────────────┴──────────────────────────┬───────────┼──────────────────────┤
│ NOMBRE DEL TOKEN  │ VISTA FINAL         │ [GUARDAR] │ VISTA EN FOUNDRY     │
│ [Dragonborn____]  │   [preview 256]     │ [EXPORTAR]│  [render isométrico] │
└───────────────────┴─────────────────────┴───────────┴──────────────────────┘
```

### 4.2 Inventario de componentes

| Componente | Tipo | Responsabilidad única |
|---|---|---|
| `IsoTokenEditor` | ApplicationV2 | Ciclo de vida, layout, orquestación de paneles |
| `BaseSelectorPanel` | Panel DOM | Grid de miniaturas, categorías, importar base |
| `ImportPanel` | Panel DOM | Dropzone, FilePicker, miniatura del archivo |
| `InspectorPanel` | Panel DOM | Secciones Personaje / Base / Sombra |
| `PreviewPanel` | Panel DOM | "Vista final" 256×256 + "Vista en Foundry" |
| `FooterPanel` | Panel DOM | Nombre, Guardar, Exportar, Aplicar |
| `NumericSlider` | Web Component | slider + input + `±`; emite `input`/`change` |
| `StageController` | PIXI | Posee la `PIXI.Application`, resize, destroy |
| `SceneGraph` | PIXI | Jerarquía de contenedores y orden Z |
| `IsoGridLayer` | PIXI | Rejilla isométrica derivada de `ratio` |
| `BaseLayer` / `ArtworkLayer` / `ShadowLayer` | PIXI | Un sprite y su transformación |
| `TransformControls` | PIXI + Control | Gizmo XYZ, bbox, handles, pivote |
| `CameraController` | Control | Pan/zoom del viewport (no del contenido) |
| `PointerRouter` | Control | Hit-test y despacho de eventos puntero |
| `Compositor` | Export | RenderTexture limpia (sin grid/gizmo/fondo) |
| `TokenApplier` | Export | Escribe imagen + flags en el TokenDocument |
| `IsoPerspectiveBridge` | Integración | Lee proyección/flags del módulo isométrico |

### 4.3 El widget `NumericSlider`

Es el widget más repetido (18 instancias). Se implementa como Custom Element
para que Handlebars lo declare de forma limpia:

```html
<itc-number label="Escala" path="artwork.scale"
            min="10" max="400" step="1" unit="%" precision="0"
            drag-scale="0.5"></itc-number>
```

Comportamiento: slider + input numérico + botones `±`; `Shift` = paso ×10,
`Alt` = paso ÷10; arrastre vertical sobre la etiqueta para ajuste fino
(mismo gesto que `createAdjustableButton` de `isometric-perspective`, para
coherencia muscular con ese módulo); doble clic = reset al valor por defecto.

---

## 5. Hooks utilizados

### 5.1 Hooks que consumimos

| Hook | Momento | Uso |
|---|---|---|
| `init` | Arranque | Registrar settings, Custom Elements, precargar plantillas |
| `setup` | Post-init | Resolver `IsoPerspectiveBridge` (¿está activo el módulo?) |
| `ready` | Mundo listo | Cargar `bases.json`, exponer `game.itc.api` |
| `getSceneControlButtons` | Construcción de controles | Añadir el botón "Isometric Token Creator" a la barra de Tokens |
| `renderActorSheet` / `renderActorSheetV2` | Ficha abierta | Botón de cabecera "Crear token isométrico" |
| `renderTokenHUD` | HUD de token | Botón directo "Editar en ITC" |
| `dropCanvasData` | Drop sobre canvas | (Fase 5) preview en escena |
| `closeIsoTokenEditor` | Cierre | Liberar PIXI, texturas y ObjectURLs |

> **Nota v13:** `getSceneControlButtons` cambió en v13 — `controls` es ahora un
> **objeto indexado por nombre** y `tools` también es un record, no un array.
> Se implementa con detección defensiva y se cubre con un test manual en Fase 1.

### 5.2 Hooks que emitimos (extensibilidad)

| Hook | Payload | Cancelable |
|---|---|---|
| `itc.editorReady` | `(editor, project)` | no |
| `itc.projectChanged` | `(project, paths[])` | no |
| `itc.beforeExport` | `(project, exportOptions)` | **sí** |
| `itc.afterExport` | `(project, {path, blob, width})` | no |
| `itc.beforeApplyToken` | `(tokenDoc, updateData)` | **sí** |
| `itc.baseLibraryLoaded` | `(BaseLibrary)` | no |

Los cancelables permiten que terceros (o nuestras propias fases futuras: IA de
recorte, auto-shadow) intercepten sin parchear.

---

## 6. APIs de Foundry necesarias · Contrato de compatibilidad

### 6.1 APIs v13 (verificadas contra módulos v13 instalados)

| Necesidad | API v13 |
|---|---|
| Ventana | `foundry.applications.api.ApplicationV2` + `foundry.applications.api.HandlebarsApplicationMixin` |
| Diálogos | `foundry.applications.api.DialogV2` |
| Plantillas | `foundry.applications.handlebars.renderTemplate` / `loadTemplates` |
| Explorador | `foundry.applications.apps.FilePicker.implementation` |
| Listar ficheros | `FilePicker.implementation.browse(source, target, opts)` |
| Subir ficheros | `FilePicker.implementation.upload(source, path, file, body, opts)` |
| Crear carpeta | `FilePicker.implementation.createDirectory(source, path)` |
| Tokens | `foundry.canvas.placeables.Token`, `TokenDocument#update` |
| Flags | `Document#getFlag` / `#setFlag` |
| Settings | `game.settings.register` / `registerMenu` |
| Renderer | `canvas.app.renderer` (PIXI) |

> **A verificar en Fase 0 (bloqueante para el exportador):** la versión exacta de
> PIXI en el v13 instalado. En PIXI 7 `renderer.extract.canvas()` es **síncrona**;
> en PIXI 8 devuelve **Promise**. El `PngEncoder` se escribe contra un adaptador
> que soporta ambas y detecta en runtime (`PIXI.VERSION`), pero conviene
> confirmarlo antes de codificar.

### 6.2 Contrato con `isometric-perspective` (leído del código fuente)

**Module ID:** `isometric-perspective`

**Flags de escena** (`scene.flags['isometric-perspective']`):

| Flag | Tipo | Significado |
|---|---|---|
| `isometricEnabled` | boolean | La escena usa proyección isométrica |
| `isometricScale` | number | Escala del fondo |
| `isometricBackground` | boolean | Transformar también el fondo |
| `projectionType` | string | Clave de `PROJECTION_TYPES` |
| `customProjection` | string | 8 números separados por comas |

**Flags de token** (`token.flags['isometric-perspective']`):

| Flag | Default | Significado |
|---|---|---|
| `offsetX` | `0` | Desplazamiento del arte, eje local X (unidades grid-100) |
| `offsetY` | `0` | Desplazamiento del arte, eje local Y |
| `scale` | `1` | Escala isométrica dinámica del arte |
| `isoAnchorX` / `isoAnchorY` | `0.5` | Anclaje isométrico (se mapea a `texture.anchorX/Y`) |
| `isoScaleDisabled` | `false` | Ignorar `document.width/height` al escalar |
| `isoTokenDisabled` | `false` | Excluir este token de la proyección |
| `tokenFlipped` | `false` | Espejo horizontal (solo tiles) |

**Ajustes de mundo relevantes:** `worldIsometricFlag` (interruptor maestro),
`enableHeightAdjustment`, `enableTokenVisuals`, `enableAutoSorting`.

**Tabla de proyecciones** (`ratio` es lo que nos importa):

| Proyección | rotation | skewX | skewY | **ratio** |
|---|---|---|---|---|
| True Isometric | −30° | 30° | 0° | **√3 ≈ 1.7320** |
| Dimetric (2:1) | −45° | 18.435° | 18.435° | **2.0** |
| Overhead (√2:1) | −45° | 9.7356° | 9.7356° | **√2 ≈ 1.4142** |
| Projection (3:2) | −45° | 11.3101° | 11.3101° | **1.5** |
| Game: Diablo 1 | −30° | 34° | 4° | 2.0503 |
| Game: Planescape | −35° | 20° | 0° | 1.4281 |
| Custom | usuario | usuario | usuario | usuario |

### 6.3 Derivación matemática (la base del exportador)

PIXI compone la matriz local como:

```
a =  cos(rotation + skewY) · scaleX      c = −sin(rotation − skewX) · scaleY
b =  sin(rotation + skewY) · scaleX      d =  cos(rotation − skewX) · scaleY
```

**Stage** (True Isometric: `rotation = −30°`, `skewX = 30°`, `skewY = 0`):

```
S = ⎡ cos(−30)   −sin(−60) ⎤ = ⎡  0.8660   0.8660 ⎤
    ⎣ sin(−30)    cos(−60) ⎦   ⎣ −0.5000   0.5000 ⎦
```

Comprobación: `ê_x → (0.866, −0.5)`, `ê_y → (0.866, 0.5)`. Una celda de lado `g`
se convierte en un rombo de **diagonal horizontal `√3·g`** y **diagonal vertical
`g`** → cociente `√3` = `ratio`. ✔ Coincide con la tabla.

**Mesh del token** — `transform.js:74-75` fija `rotation = reverseRotation = 45°`
y `skew = (0, 0)`:

```
M = ⎡ 0.7071  −0.7071 ⎤   (rotación pura de +45°)
    ⎣ 0.7071   0.7071 ⎦
```

**Composición `S · M`:**

```
S·M = ⎡ 1.2247   0.0000 ⎤ = diag( √6/2 , √2/2 )
      ⎣ 0.0000   0.7071 ⎦
```

**Es una escala pura alineada a los ejes.** Rotación y skew se cancelan
exactamente. El cociente horizontal/vertical es `1.2247 / 0.7071 = √3 = ratio`.

Y por eso `transform.js:160-161` premultiplica la altura por `ratio`:

```js
mesh.width  = |sx · W_doc · gridSize · isoScale · √2|
mesh.height = |sy · H_doc · gridSize · isoScale · √2 · ratio|
```

Tamaño final en pantalla:

```
ancho_pantalla = mesh.width  · √6/2 = sx · W_doc · gridSize · isoScale · √3
alto_pantalla  = mesh.height · √2/2 = sy · H_doc · gridSize · isoScale · √3
```

→ **iguales**. El `ratio` premultiplicado cancela exactamente la compresión
vertical del stage.

*(Verificado también con Dimetric 2:1: `S·M = diag(1.2649, 0.6325)`, cociente
exactamente 2.0. La propiedad es general para todas las proyecciones con
`reverseRotation = 45°, reverseSkew = 0`, que son todas las de la tabla.)*

**Posicionamiento** (`transform.js:179-182`):

```js
mesh.position = ( doc.x + W_doc·gridSize/2 + W_doc·isoOffset.x ,
                  doc.y + W_doc·gridSize/2 + W_doc·isoOffset.y )
```

Es decir: el **punto de anclaje del mesh cae en el centro geométrico de la huella
de celda** del token. Con `offsetX = offsetY = 0` y `anchor = (0.5, 0.5)`,
**el centro del PNG cae en el centro de la celda**.

### 6.4 Las tres reglas del exportador

De todo lo anterior se derivan las tres reglas que gobiernan el `Compositor`:

> **R1 — Lienzo cuadrado.** Exportar siempre `N × N` px. Con textura cuadrada,
> el cálculo de `sx`/`sy` de `transform.js:115-159` devuelve `sx = sy = 1` para
> *todos* los valores de `texture.fit` (`fill`, `contain`, `cover`, `width`,
> `height`). Esto hace el resultado **inmune a la configuración `fit`** del
> usuario — elimina de raíz la causa más común de desalineación.
>
> **R2 — Elipse de contacto centrada.** El centro de la elipse de contacto de la
> base debe coincidir con el centro exacto del lienzo `(N/2, N/2)`. Así
> `offsetX = offsetY = 0` y `anchor = 0.5/0.5` producen alineación perfecta
> sin flags correctivos.
>
> **R3 — Aspecto de la elipse = `ratio : 1`.** La elipse debe medir
> `ancho = N · k` y `alto = N · k / ratio`, con `k ≤ 1` el factor de cobertura
> (`baseScale`). Con `ratio = √3` y `k = 1`: `alto = 0.5774 · N`.
> Así la base se superpone exactamente al rombo de la celda.

Estas tres reglas se implementan como **aserciones ejecutables** en el
`Compositor` (modo debug), no solo como documentación.

### 6.5 Modo degradado

Si `isometric-perspective` no está instalado o `worldIsometricFlag` está en
`false`, el `IsoPerspectiveBridge` devuelve un perfil por defecto
(`True Isometric`, `ratio = √3`) y el editor funciona igual. El `TokenApplier`
omite entonces la escritura de flags del módulo isométrico.

---

## 7. Clases

### 7.1 Núcleo

```js
class EventBus {
  on(event, handler, {once=false}={}) → unsubscribe:Function
  off(event, handler)
  emit(event, payload)
  scope(prefix) → EventBus                // sub-bus con namespace
}

class Store {
  constructor(project: TokenProject)
  get state() → Readonly<TokenProject>
  get(path: string) → any                 // 'artwork.x'
  set(path: string, value): string[]      // devuelve rutas cambiadas
  batch(fn): string[]                     // agrupa notificaciones
  subscribe(pathPrefix, handler) → unsubscribe
}
```

### 7.2 Modelo

```js
class TokenProject {
  static SCHEMA_VERSION = 1;

  id: string
  name: string
  createdAt / updatedAt: number

  projection: {
    type: string          // 'True Isometric'
    ratio: number         // √3 — cacheado, autoritativo para el render
  }

  base: {
    src: string|null      // ruta relativa al mundo/módulo
    scale: number         // 1.0 = cubre el ancho completo del lienzo
    rotation: number      // grados
    elevation: number     // desplazamiento Z visual
    opacity: number
    tint: number|null
  }

  artwork: {
    src: string|null
    x, y, z: number       // Z = altura visual sobre la base
    scale: number
    rotation: number
    opacity: number
    flipH, flipV: boolean
    pivot: {x, y}         // normalizado 0..1
  }

  shadow: {
    enabled: boolean
    intensity: number
    blur: number
    offsetX, offsetY: number
    color: number
  }

  export: {
    size: number          // 512 | 1024 | 2048
    format: 'png'|'webp'
    padding: number
  }

  toJSON() → object
  static fromJSON(data) → TokenProject     // aplica migraciones de schema.js
  clone() → TokenProject
}
```

### 7.3 Comandos

```js
class Command {
  execute()                  // abstracto
  undo()                     // abstracto
  get label(): string
  canMerge(other): boolean   // default false
  merge(other): void
}

class SetPropertyCommand extends Command {
  constructor(store, path, newValue)   // captura oldValue en execute()
  canMerge(o) { return o.path === this.path }   // coalescencia de arrastre
}

class HistoryManager {
  constructor(bus, {limit = 100})
  execute(command)
  beginTransaction(label) / commit() / rollback()
  undo() / redo()
  get canUndo / canRedo: boolean
  clear()
}
```

### 7.4 Canvas y render

```js
class StageController {
  constructor(hostElement, {backgroundAlpha: 0})
  get app: PIXI.Application
  resize(w, h)
  destroy()                  // destruye app + texturas propias
}

class SceneGraph {
  root: PIXI.Container
  layers: { checker, grid, shadow, base, artwork, overlay }
  markDirty(layerName)
  applyState(project, changedPaths)   // actualiza SOLO lo afectado
}

class RenderScheduler {
  constructor(renderer, stage)
  invalidate()               // colapsa N llamadas en 1 frame vía rAF
  renderNow()
}

class TextureCache {
  static async get(src) → PIXI.Texture       // dedupe por src + refcount
  static release(src)
  static clear()
}
```

### 7.5 Exportación

```js
class Compositor {
  constructor(sceneGraph, projection)
  buildExportContainer(project) → PIXI.Container   // sin grid/gizmo/checker
  assertAlignment(container, project)              // valida R1/R2/R3 (debug)
}

class PngEncoder {
  static async encode(renderer, container, size) → Blob
  // Adaptador PIXI 7/8 para renderer.extract
}

class FileUploader {
  static async ensureDirectory(source, path)
  static async upload(blob, filename, {source, path}) → string  // ruta final
}

class TokenApplier {
  static async applyToToken(tokenDoc, imgPath, project)
  static buildUpdateData(imgPath, project) → object
}
```

### 7.6 Integración

```js
class IsoPerspectiveBridge {
  static get isActive(): boolean
  static get isWorldIsometric(): boolean
  static getProjection(scene?) → {type, ratio, rotation, skewX, skewY}
  static get ratio(): number
  static buildTokenFlags(project) → object
  static isSceneIsometric(scene) → boolean
}
```

---

## 8. Comunicación entre clases

### 8.1 Matriz de comunicación

| Origen | Destino | Mecanismo |
|---|---|---|
| Panel DOM | HistoryManager | llamada directa (`history.execute(cmd)`) |
| Gizmo | HistoryManager | llamada directa (transacción) |
| Command | Store | llamada directa (`store.set`) |
| Store | EventBus | `emit('model:changed', {paths})` |
| EventBus | SceneGraph | suscripción por prefijo |
| EventBus | Paneles / Preview | suscripción por prefijo |
| SceneGraph | RenderScheduler | `invalidate()` |
| Cualquiera | Foundry | solo vía `integration/` |

**Ninguna clase de `canvas/` importa nada de `apps/`.** La comunicación
ascendente es exclusivamente por bus. Esto es verificable con un script de lint
de dependencias que se añade en Fase 0.

### 8.2 Catálogo de eventos

```
model:changed        { paths: string[] }
model:replaced       { project }
history:changed      { canUndo, canRedo, label }
selection:changed    { target: 'artwork'|'base'|null }
viewport:camera      { zoom, panX, panY }
viewport:gridToggle  { visible }
asset:baseLoaded     { id, src }
asset:artworkLoaded  { src, width, height }
export:progress      { stage, pct }
export:done          { path }
error                { code, message, cause }
```

### 8.3 Ejemplo de traza completa

Usuario arrastra el gizmo del eje Y **8 px** hacia abajo:

```
1. PointerRouter        hit-test → handle 'axis-y' del ArtworkLayer
2. TransformControls    history.beginTransaction('Mover personaje')
3. (pointermove ×N)     delta pantalla → delta modelo (deshace zoom de cámara)
                        history.execute(new SetPropertyCommand(store,'artwork.y',v))
                        → canMerge=true → se fusiona con el comando en curso
4. Store.set            muta artwork.y, devuelve ['artwork.y']
5. EventBus             emit('model:changed', {paths:['artwork.y']})
6. SceneGraph           prefijo 'artwork' coincide → ArtworkLayer.markDirty()
                        (BaseLayer y ShadowLayer NO se tocan)
7. RenderScheduler      invalidate() → 1 render en el siguiente rAF
8. InspectorPanel       actualiza SOLO el input 'artwork.y' (sin re-render Hbs)
9. PreviewPanel         debounce 120 ms → recompone miniatura + vista Foundry
10. pointerup           history.commit() → 1 entrada de undo
```

---

## 9. Sistema de render

### 9.1 Grafo de escena

```
PIXI.Application.stage
└── viewportRoot                    ← CameraController aplica pan/zoom aquí
    ├── checkerLayer                (fondo ajedrez, EXCLUIDO del export)
    ├── gridLayer                   (rombos isométricos, EXCLUIDO)
    ├── compositionRoot             ◀── ESTO ES LO QUE SE EXPORTA
    │   ├── shadowLayer             (sombra proyectada del personaje)
    │   ├── baseLayer               (sprite de la base)
    │   └── artworkLayer            (sprite del personaje)
    └── overlayLayer                (bbox, handles, gizmo XYZ, EXCLUIDO)
```

`compositionRoot` es un contenedor real y aislado. **El exportador renderiza ese
mismo nodo**, no una reconstrucción paralela — garantía estructural de que
"lo que ves es lo que exportas" (no hay dos caminos de código que puedan
divergir).

### 9.2 Espacio de coordenadas canónico

Todo el modelo vive en un espacio normalizado de **1024 × 1024 unidades**, con
origen en el centro `(512, 512)` = punto de contacto de la base.

- Independiente de la resolución de exportación (512/1024/2048 solo escalan).
- Independiente del zoom de la cámara.
- Los valores del modelo son estables y legibles en el JSON del proyecto.

Conversión pantalla → modelo: `CameraController.screenToModel(pt)`.

### 9.3 Capa de rejilla isométrica

La rejilla dibuja rombos con `diagH / diagV = ratio` — la misma geometría exacta
que las celdas de la escena de Foundry. Se regenera solo cuando cambia `ratio`
o el zoom cruza un umbral de LOD. Se cachea como `PIXI.Graphics` con
`cacheAsBitmap` en zoom estable.

También dibuja la **elipse guía de contacto** (`ancho = N·k`,
`alto = N·k/ratio`) que materializa visualmente la regla R3.

### 9.4 Capa de sombra

Sombra proyectada del personaje sobre el plano de la base:

1. `artworkSprite` se clona en un sprite tintado de negro.
2. Se aplica compresión vertical `1/ratio` + cizalladura → cae sobre el plano.
3. `PIXI.BlurFilter` con `blur` configurable (con presupuesto de rendimiento:
   por encima de cierto radio se baja `quality`).
4. `offsetX/offsetY` desplazan según la dirección de luz.

La sombra **sí** forma parte de la exportación (está dentro de
`compositionRoot`), lo cual es correcto: es parte del arte del token.

### 9.5 Estrategia de invalidación

```js
const DIRTY = {
  ARTWORK_TRANSFORM: 1 << 0,   ARTWORK_TEXTURE: 1 << 1,
  BASE_TRANSFORM:    1 << 2,   BASE_TEXTURE:    1 << 3,
  SHADOW:            1 << 4,   GRID:            1 << 5,
  OVERLAY:           1 << 6,   CAMERA:          1 << 7,
};
```

Reglas:
- Cambiar `artwork.x` → solo `ARTWORK_TRANSFORM | SHADOW | OVERLAY`.
- Cambiar `base.opacity` → solo `BASE_TRANSFORM`.
- Nunca se recrean sprites por un cambio de transformación; se mutan sus
  propiedades.
- La `PIXI.Application` arranca con `autoStart: false`. Sin interacción, el
  coste de CPU/GPU es **cero**.

### 9.6 AutoFit inicial

Al importar un personaje se calcula un encaje razonable de una sola pasada:

1. Recortar el bounding box alfa real (evita márgenes transparentes gigantes).
2. Escalar para que la altura visible ocupe ~85 % del alto del lienzo.
3. Alinear el **centro inferior** del bbox recortado con el centro de la elipse
   de contacto.

Es una sugerencia, no una imposición: queda registrada como un Command único y
por tanto es reversible con un solo `Ctrl+Z`.

---

## 10. Exportador PNG

### 10.1 Procedimiento

```
1. Hooks.callAll('itc.beforeExport', project, opts)   → cancelable
2. compositionRoot.getBounds() snapshot
3. Guardar estado del viewport (pan/zoom/visibilidad de capas)
4. Neutralizar cámara: compositionRoot.setTransform(identidad)
5. Ocultar checker, grid, overlay (ya están FUERA de compositionRoot,
   así que basta con renderizar compositionRoot directamente)
6. RenderTexture N×N, resolution = 1, alpha premultiplicado correcto
7. renderer.render(compositionRoot, { renderTexture, clear: true })
8. extract → canvas → toBlob('image/png')       [adaptador PIXI 7/8]
9. Restaurar viewport
10. FileUploader.upload(blob, filename)
11. Hooks.callAll('itc.afterExport', project, result)
```

### 10.2 Garantía de transparencia

- `PIXI.Application({ backgroundAlpha: 0 })`.
- `RenderTexture` sin color de fondo; `clear: true` limpia a `rgba(0,0,0,0)`.
- El fondo de ajedrez es una **capa hermana** de `compositionRoot`, nunca hija →
  es imposible que se cuele en el export por error de configuración.
- Verificación automatizada en Fase 4: exportar un proyecto vacío y comprobar
  que **todos** los píxeles tienen `a === 0`.

### 10.3 Aserciones de alineación (modo debug)

Antes de codificar el PNG, con `debug` activo el `Compositor` verifica:

```js
assert(width === height,                          'R1: lienzo cuadrado');
assert(|ellipse.cx - N/2| < 0.5,                  'R2: elipse centrada X');
assert(|ellipse.cy - N/2| < 0.5,                  'R2: elipse centrada Y');
assert(|ellipse.w/ellipse.h - ratio| < 0.01,      'R3: aspecto = ratio');
```

Si alguna falla, se avisa en consola con el valor concreto en lugar de producir
un token silenciosamente desalineado.

### 10.4 Nomenclatura y rutas

```
{carpetaConfigurada}/{slug(nombreToken)}-{hash8}.png
```

El hash corto de la configuración evita colisiones y sobrescrituras accidentales
al iterar sobre el mismo personaje. Carpeta por defecto configurable:
`worlds/{mundo}/isometric-tokens/`. Se crea con `createDirectory` si no existe.

### 10.5 Aplicar al token seleccionado

```js
TokenApplier.buildUpdateData(imgPath, project) → {
  'texture.src'    : imgPath,
  'texture.fit'    : 'fill',      // irrelevante por R1, pero explícito
  'texture.anchorX': 0.5,
  'texture.anchorY': 0.5,
  'flags.isometric-perspective.offsetX'  : 0,
  'flags.isometric-perspective.offsetY'  : 0,
  'flags.isometric-perspective.scale'    : 1,
  'flags.isometric-perspective.isoAnchorX': 0.5,
  'flags.isometric-perspective.isoAnchorY': 0.5,
}
```

Los offsets se escriben **a cero de forma explícita**: si el token traía
correcciones manuales previas, deben limpiarse — con nuestro PNG ya no hacen
falta y solo desalinearían.

Alcance de la aplicación (selector en el diálogo):
- token seleccionado en el canvas,
- prototipo del actor (`actor.prototypeToken`),
- todos los tokens vinculados en todas las escenas,
- solo guardar el archivo.

---

## 11. Sistema de proyectos

### 11.1 Formato `.itcproj` (JSON)

```json
{
  "$schema": "itc-project/1",
  "schemaVersion": 1,
  "moduleVersion": "1.0.0",
  "id": "itc-9f3a...",
  "name": "Dragonborn Fighter",
  "createdAt": 1753920000000,
  "updatedAt": 1753921200000,

  "projection": { "type": "True Isometric", "ratio": 1.7320508 },

  "assets": {
    "artwork": {
      "src": "worlds/mi-mundo/art/dragonborn.png",
      "originalSize": { "w": 1024, "h": 1536 },
      "sha1": "ab12..."
    },
    "base": {
      "src": "modules/isometric-tokens-creator/assets/bases/stone/stone-01.png",
      "builtinId": "stone-01"
    }
  },

  "base":    { "scale": 1.1, "rotation": 0, "elevation": 0, "opacity": 1, "tint": null },
  "artwork": { "x": -12, "y": 8, "z": 35, "scale": 1.0, "rotation": 45,
               "opacity": 1, "flipH": false, "flipV": false,
               "pivot": { "x": 0.5, "y": 1.0 } },
  "shadow":  { "enabled": true, "intensity": 0.7, "blur": 8,
               "offsetX": 6, "offsetY": 4, "color": 0 },
  "export":  { "size": 1024, "format": "png", "padding": 0 },

  "output": { "lastPath": "worlds/mi-mundo/isometric-tokens/dragonborn-a1b2c3d4.png" }
}
```

### 11.2 Decisiones de diseño

- **Se guardan rutas, no imágenes embebidas.** Un proyecto pesa ~2 KB. Evita
  duplicar assets y respeta el flujo de ficheros de Foundry.
- **`sha1` de referencia** para detectar que el archivo original cambió o
  desapareció, y avisar al reabrir en vez de fallar en silencio.
- **`schemaVersion` + migraciones** en `model/schema.js`: cada versión futura
  añade una función `migrate_N_to_N+1`. Los proyectos antiguos siempre abren.
- **Almacenamiento:** ficheros `.itcproj` en la carpeta configurada, vía
  `FilePicker.upload`. Alternativa (Fase 3): un `JournalEntry` oculto como
  índice de proyectos recientes.

### 11.3 Operaciones

`ProjectManager`: `new()`, `save()`, `saveAs()`, `open(path)`, `listRecent()`,
`duplicate()`, `exportBundle()` *(Fase 6: ZIP con assets incluidos)*.

Autoguardado del borrador en `localStorage` cada 30 s para recuperar tras un
refresco accidental del navegador.

---

## 12. Manejo de Assets

### 12.1 Manifiesto de bases (`assets/bases/bases.json`)

```json
{
  "version": 1,
  "categories": [
    { "id": "stone", "label": "ITC.BaseCat.Stone", "icon": "fa-cube" },
    { "id": "wood",  "label": "ITC.BaseCat.Wood",  "icon": "fa-tree" },
    { "id": "snow",  "label": "ITC.BaseCat.Snow",  "icon": "fa-snowflake" },
    { "id": "lava",  "label": "ITC.BaseCat.Lava",  "icon": "fa-fire" },
    { "id": "sand",  "label": "ITC.BaseCat.Sand",  "icon": "fa-hourglass" },
    { "id": "metal", "label": "ITC.BaseCat.Metal", "icon": "fa-shield" }
  ],
  "bases": [
    {
      "id": "stone-01",
      "category": "stone",
      "label": "ITC.Base.Stone01",
      "src": "assets/bases/stone/stone-01.png",
      "thumb": "assets/bases/stone/stone-01-thumb.webp",
      "contact": { "cx": 0.5, "cy": 0.5, "rx": 0.5, "ry": 0.28868 },
      "ratio": 1.7320508
    }
  ]
}
```

El campo **`contact`** es esencial: define dónde está la elipse de contacto
**dentro del PNG de la base**, normalizada. Permite usar bases con perspectiva,
altura o borde decorativo sin romper la regla R2 — el `BaseLayer` alinea usando
`contact`, no el centro geométrico del archivo.

`ry / rx` debería valer `1 / ratio`. Si no coincide, `BaseLibrary` emite una
advertencia y ofrece corregir automáticamente.

### 12.2 Bases importadas por el usuario

Al importar una base con `+ MÁS BASES...`:
1. Se copia (o referencia) el archivo.
2. Se estima `contact` automáticamente desde el bounding box alfa.
3. Se muestra un **editor de elipse** (arrastrable) para ajustar el punto de
   contacto — es un paso rápido pero decisivo para la calidad del resultado.
4. Se persiste en un manifiesto de usuario en `world` settings, separado del
   manifiesto del módulo (que se sobrescribe en cada actualización).

### 12.3 Caché de texturas

`TextureCache` envuelve `PIXI.Assets` con recuento de referencias por `src`.
Las miniaturas del selector usan `PIXI.Texture` compartidas con el viewport
(la misma base seleccionada no se carga dos veces). Al cerrar el editor se
liberan las texturas con refcount 0 y se revocan todos los `ObjectURL`.

---

## 13. Posibles problemas

| # | Problema | Severidad | Mitigación |
|---|---|---|---|
| 1 | **Divergencia de `ratio`** entre proyecto y escena destino | Alta | `IsoPerspectiveBridge` lee el `ratio` vivo; al aplicar, si difiere del guardado, se avisa y se ofrece recomponer |
| 2 | **PIXI 7 vs 8 en `extract`** (sync vs Promise) | Alta | Adaptador con detección `PIXI.VERSION`; verificación bloqueante en Fase 0 |
| 3 | **`getSceneControlButtons` cambió de forma en v13** (record vs array) | Media | Detección defensiva del tipo; fallback a botón en ficha de actor |
| 4 | **Fuga de memoria de PIXI** al abrir/cerrar repetidamente | Alta | `destroy({children:true, texture:false})` + refcount + revoke de ObjectURLs; test de 50 ciclos en Fase 4 |
| 5 | **Imágenes enormes** (8K) agotan la VRAM | Media | Límite configurable; redimensionado previo a `MAX_TEXTURE_SIZE` del renderer |
| 6 | **CORS** al arrastrar imágenes desde una web externa | Media | Se detecta el canvas "tainted" antes de exportar y se pide guardar el archivo localmente primero |
| 7 | **Permisos de subida** para usuarios no-GM | Media | Comprobar `game.user.can('FILES_UPLOAD')`; si no, ofrecer descarga local |
| 8 | **Rutas con `%20`/acentos** en Windows | Media | Normalizar siempre con `encodeURIComponent` por segmento; suite de pruebas con nombres problemáticos |
| 9 | **Otro módulo parchea `Token.prototype._refreshSort`** (lo hace `isometric-perspective`) | Baja | No parcheamos nada del canvas de Foundry — solo escribimos documentos |
| 10 | **Base con `contact` mal definido** | Media | Aserción R3 + advertencia visible en el selector |
| 11 | **`texture.fit` inesperado** en el token destino | Baja | Neutralizado por diseño gracias a R1 (lienzo cuadrado) |
| 12 | **Undo saturado** por arrastres | Media | Coalescencia de comandos + límite de 100 entradas |
| 13 | **Blur grande** hunde el framerate | Baja | Presupuesto: se reduce `quality` del filtro por encima de un umbral |
| 14 | **PF2e escala tokens por tamaño de criatura** | Media | `SystemAdapter` aplica la convención del sistema al calcular la sugerencia inicial |
| 15 | **Reapertura con asset borrado** | Media | Verificación de `sha1`/existencia al abrir; marcador de asset faltante en la UI |

---

## 14. Estrategias de optimización

### 14.1 Render

- `autoStart: false` — cero consumo en reposo.
- Invalidación por dirty-flags, nunca "re-render todo".
- `cacheAsBitmap` en la rejilla mientras el zoom es estable.
- `PIXI.Graphics` del gizmo se reconstruye solo al cambiar de modo, no por frame.
- `resolution` del viewport limitada a `min(devicePixelRatio, 2)`.

### 14.2 Memoria

- `TextureCache` con refcount; `destroy` explícito al cerrar.
- Miniaturas WebP a 128 px, generadas una vez y cacheadas en disco.
- Un único `PIXI.Application` por editor; **no** se crea uno para la preview:
  la miniatura y la "Vista en Foundry" se generan con `RenderTexture` desde el
  mismo renderer.

### 14.3 UI

- El Handlebars completo se renderiza **una vez**. Las actualizaciones tocan
  nodos concretos (`input.value = ...`), sin re-render de plantilla.
- Suscripciones por prefijo de ruta → un cambio de `artwork.x` no despierta al
  panel de sombra.
- Preview con debounce de 120 ms; "Vista en Foundry" con debounce de 250 ms.

### 14.4 Arranque

- `bases.json` se carga en `ready`, no en `init`.
- Las miniaturas se cargan con `IntersectionObserver` (lazy) al hacer scroll.
- Las plantillas Handlebars se precargan en `init` con `loadTemplates`.

### 14.5 Presupuestos objetivo

| Métrica | Objetivo |
|---|---|
| Apertura del editor | < 400 ms |
| Latencia de arrastre del gizmo | < 16 ms (60 fps) |
| Exportación 1024×1024 | < 800 ms |
| Memoria en reposo con 1 proyecto | < 80 MB |
| Delta de memoria tras 50 ciclos abrir/cerrar | < 5 MB |

---

## 15. Roadmap por fases

Cada fase es **entregable e instalable**, y **no rompe** las anteriores. El
contrato público (`api.js`, formato `.itcproj`, eventos) solo crece; nunca cambia
de forma incompatible.

### Estado de implementación

| Fase | Estado | Notas |
|---|---|---|
| 0 · Fundación | **Implementada** | Las tres verificaciones se resolvieron *defensivamente* en el código, no observando el runtime — ver aviso abajo |
| 1 · Shell de la aplicación | **Implementada** | `IsoTokenEditor`, plantilla, CSS, `NumericSlider` |
| 2 · Modelo e historial | **Implementada** | Con coalescencia y transacciones |
| 3 · Canvas y composición | **Implementada** | Capas PIXI, cámara, importadores, autodescubrimiento de bases |
| 4 · Gizmos y exportación | **Implementada** | Gizmo XYZ, sombra, `Compositor` con aserciones R1–R3 |
| 5 · Proyectos y pulido | **Parcial** | `ProjectManager` completo; falta el editor visual de elipse de contacto |
| 6 · Expansiones | Pendiente | Puntos de extensión ya preparados |

**Verificación realizada** (`tools/verify-architecture.js` + comprobaciones ad hoc):

- 41 módulos ES, sintaxis válida
- todos los imports resuelven y todos los nombres existen como exports
- sin ciclos de dependencia
- regla de capas respetada
- sin imports muertos
- 113 claves de traducción, es/en sincronizadas, sin claves ausentes
- bases generadas con desviación **cero** respecto al `ratio` exigido por R3

> ### ⚠️ Lo que NO está verificado
>
> **El módulo no se ha ejecutado dentro de Foundry.** Toda la verificación
> anterior es estática. En particular siguen sin confirmarse en runtime las tres
> incógnitas que la §6.1 marcaba como bloqueantes:
>
> 1. **Versión de PIXI y si `extract.canvas` es asíncrono.** El `PngEncoder`
>    hace `await` sobre el resultado, que funciona en ambos casos, pero no se ha
>    observado cuál es.
> 2. **Forma de `getSceneControlButtons` en v13.** `ControlsRegistration`
>    detecta array o record en tiempo de ejecución; no se ha visto cuál llega.
> 3. **Namespace real de `FilePicker`.** Se usa
>    `foundry.applications.apps.FilePicker.implementation` con respaldo al
>    global, confirmado por uso en otros módulos v13 instalados pero no
>    ejecutado aquí.
>
> `game.itc.diagnostics()` devuelve las tres respuestas de una vez, además de
> comprobar que la matriz de composición sea efectivamente una escala pura.
> **Es lo primero que conviene ejecutar al abrir el mundo.**

---

### FASE 0 — Fundación y verificación *(bloqueante)*

- `module.json`, estructura de carpetas, `lang/en.json` + `lang/es.json`.
- `EventBus`, `Logger`, `Result`, `constants`, `settings`.
- `IsoPerspectiveBridge` (lectura de proyección y `ratio`).
- **Verificaciones bloqueantes:** versión de PIXI y comportamiento de
  `renderer.extract`; forma de `getSceneControlButtons` en v13; namespace de
  `FilePicker` en la instalación real.
- Script de lint de dependencias entre capas.

**Entregable:** el módulo carga, registra ajustes, y un botón imprime en consola
la proyección activa y el `ratio`. **Criterio de aceptación:** las tres
verificaciones documentadas con su resultado.

---

### FASE 1 — Shell de la aplicación

- `IsoTokenEditor` (ApplicationV2 + HandlebarsApplicationMixin).
- Layout de 3 columnas + cabecera + pie, tema oscuro, CSS con design tokens.
- `Panel` base y los cinco paneles vacíos pero maquetados.
- Web Component `NumericSlider` completo (slider + input + `±` + arrastre fino).
- Registro en controles de escena y en la ficha de actor.

**Entregable:** la interfaz del mockup, navegable, sin canvas.

---

### FASE 2 — Modelo, comandos e historial

- `TokenProject`, `Store`, `schema` con migraciones.
- `Command`, `HistoryManager`, `SetPropertyCommand` con coalescencia.
- Enlace bidireccional paneles ↔ modelo.
- `Ctrl+Z` / `Ctrl+Shift+Z` operativos sobre todos los controles.

**Entregable:** todos los controles del panel derecho mutan el modelo con
undo/redo correcto. Verificable con el inspector de estado en consola.

---

### FASE 3 — Canvas PIXI y composición

- `StageController`, `SceneGraph`, capas checker/grid/base/artwork.
- `IsoGridLayer` con rombos derivados de `ratio` + elipse guía de contacto.
- `TextureCache`, `RenderScheduler` con dirty-flags.
- `CameraController` (pan/zoom) y `BaseLibrary` + selector de bases funcional.
- `ImageImporter` + `DropHandler` + `FilePickerService` + AutoFit.

**Entregable:** importar personaje, elegir base, verlos compuestos y alineados;
los sliders mueven la composición en tiempo real.

---

### FASE 4 — Gizmos, exportación y aplicación

- `TransformControls`: bbox, handles, gizmo XYZ (rojo/verde/azul), pivote.
- `PointerRouter`, `SnapService`.
- `ShadowLayer` + `ShadowFilterFactory`.
- `Compositor` + `PngEncoder` + `FileUploader` con aserciones R1/R2/R3.
- `TokenApplier` con selector de alcance.
- `PreviewPanel`: miniatura 256 + **"Vista en Foundry"** WYSIWYG usando la
  matriz derivada en §6.3.
- Tests: transparencia total, fuga de memoria en 50 ciclos, alineación real
  contra una escena isométrica.

**Entregable:** flujo completo importar → componer → exportar → aplicar,
con alineación verificada en escena real. **Esta es la versión 1.0 usable.**

---

### FASE 5 — Proyectos y pulido

- `ProjectManager`: guardar/abrir/duplicar `.itcproj`, recientes, autoguardado.
- Editor de elipse de contacto para bases importadas.
- Manifiesto de bases de usuario.
- `SystemAdapter` para PF2e y D&D5e (convenciones de tamaño de criatura).
- Atajos de teclado completos, tooltips, accesibilidad de foco.

**Entregable:** herramienta completa según la especificación original.

---

### FASE 6 — Expansiones *(arquitectura ya preparada)*

Cada una encaja en un punto de extensión existente, sin refactor:

| Función | Punto de anclaje |
|---|---|
| Auto Shadow | `ShadowLayer` + análisis alfa en `ImageImporter` |
| IA de recorte de fondo | Hook `itc.beforeArtworkLoad` → nueva capa de `io/` |
| Auto Scale | `SystemAdapter` (ya lee el tamaño de criatura) |
| Batch Export | `MacroCommand` sobre una lista de `TokenProject` |
| Colecciones de bases | `BaseManifest` (ya soporta múltiples fuentes) |
| Perfiles | `TokenProject` parcial como plantilla |
| Animaciones | Nueva capa `SpriteSheetLayer` en `SceneGraph` |
| Preview en escena | Hook `dropCanvasData` + `TokenApplier` en modo efímero |

---

## Apéndice A — Constantes derivadas (referencia rápida)

Con `ratio = R` (√3 para True Isometric) y lienzo de exportación `N × N`:

| Magnitud | Fórmula | True Iso, N=1024 |
|---|---|---|
| Centro de contacto | `(N/2, N/2)` | `(512, 512)` |
| Ancho de elipse (k=1) | `N` | `1024` |
| Alto de elipse (k=1) | `N / R` | `591.2` |
| Aspecto de elipse | `R : 1` | `1.7320 : 1` |
| Tamaño en pantalla del token | `W_doc · gridSize · isoScale · R` | — |
| Diagonal H del rombo de celda | `R · gridSize` | — |
| Diagonal V del rombo de celda | `gridSize` | — |
| Matriz de composición (True Iso) | `diag(√6/2, √2/2)` | `diag(1.2247, 0.7071)` |

---

## Apéndice B — Ajustes del módulo

| Clave | Ámbito | Default | Descripción |
|---|---|---|---|
| `exportFolder` | world | `worlds/{id}/isometric-tokens` | Carpeta de salida |
| `projectFolder` | world | `worlds/{id}/itc-projects` | Carpeta de proyectos |
| `defaultExportSize` | world | `1024` | 512 / 1024 / 2048 |
| `defaultFormat` | world | `png` | png / webp |
| `userBases` | world | `[]` | Manifiesto de bases importadas |
| `snapEnabled` / `snapStep` | client | `true` / `8` | Ajuste magnético |
| `showGrid` | client | `true` | Rejilla del viewport |
| `historyLimit` | client | `100` | Entradas de undo |
| `autoApplyFlags` | world | `true` | Escribir flags de isometric-perspective |
| `debug` | client | `false` | Logs + aserciones de alineación |

---

**Fin del documento — pendiente de aprobación para comenzar la Fase 0.**
