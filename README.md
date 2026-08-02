# Isometric Token Creator

Editor visual para Foundry VTT v13 que compone **base + personaje + sombra** y
exporta un PNG transparente **alineado con la proyección isométrica** de
[`isometric-perspective`](https://github.com/arlosmolten/isometric-perspective).

Compatible con **D&D 5e**, **Pathfinder 2e** y cualquier sistema.

---

## Qué resuelve

Colocar arte de criatura sobre una peana isométrica a mano es tedioso y casi
nunca queda alineado: el token flota, se hunde o sobresale de la celda. Este
módulo compone la imagen y garantiza la alineación **por construcción**, sin
que haya que tocar offsets manualmente.

## La regla que lo hace funcionar

Leyendo el código de `isometric-perspective` se comprueba que la composición
`stage × mesh` es una **escala pura alineada a los ejes**:

```
True Isometric →  diag(√6/2, √2/2)      cociente H/V = √3  = ratio
Dimetric (2:1) →  diag(1.2649, 0.6325)  cociente H/V = 2.0 = ratio
```

Es decir: el arte del token se ve **recto** en pantalla y ocupa un cuadrado
cuyo ancho equivale a la diagonal horizontal del rombo de la celda.

De ahí salen las tres reglas del exportador:

| | Regla | Por qué |
|---|---|---|
| **R1** | Lienzo cuadrado | Con textura cuadrada, `sx = sy = 1` para *todos* los valores de `texture.fit`. Inmuniza el resultado frente a esa configuración, que es la causa más común de desalineación. |
| **R2** | Elipse de contacto en el centro exacto | `isometric-perspective` sitúa el ancla del mesh en el centro de la celda, así que `offsetX = offsetY = 0` basta. |
| **R3** | Aspecto de la elipse = `ratio : 1` | Para que la peana se superponga exactamente al rombo de la celda. |

El `Compositor` comprueba estas reglas con **aserciones ejecutables** (modo
depuración), no sólo las documenta.

La derivación completa está en [`docs/ARQUITECTURA.md`](docs/ARQUITECTURA.md) §6.3.

---

## Instalación

Copia la carpeta en `Data/modules/` y actívala en el mundo. No requiere
compilación: es ESM nativo.

**Dependencia blanda:** si `isometric-perspective` no está instalado, el editor
funciona igual usando la proyección por defecto (True Isometric, `ratio = √3`).

## Uso

Tres puntos de entrada:

- **Barra de controles de escena** → botón del cubo
- **Cabecera de la ficha de actor** → «Crear token isométrico»
- **HUD del token** seleccionado

Flujo: elige base → importa el personaje (arrastrar o FilePicker) → ajusta →
**Guardar token** o **Exportar imagen**.

### Formatos de origen

| Formato | Comportamiento |
|---|---|
| PNG, WebP, JPG | Imagen estática |
| GIF | Se usa **un solo fotograma** (el primero) |
| **WebM, MP4, OGV** | Se extrae **un fotograma**, elegible con el deslizador |

La salida siempre es un **PNG (o WebP) estático**. Al importar un vídeo aparece
un selector de *Fotograma* en el panel de importación: por defecto se toma el
del **25 %** de la duración, porque muchos WebM de efectos empiezan en negro o
completamente transparentes y el primer fotograma sería inútil.

El canal alfa del WebM (VP8/VP9) se conserva, así que los packs de tokens
animados con transparencia funcionan bien como origen.

El fotograma elegido se guarda en el `.itcproj`: reabrir el proyecto reproduce
exactamente la misma imagen.

> Exportar tokens **animados** (APNG / WebP animado / WebM) sigue siendo Fase 6.

### Atajos

| Acción | Atajo |
|---|---|
| Deshacer / Rehacer | `Ctrl+Z` / `Ctrl+Shift+Z` |
| Guardar proyecto | `Ctrl+S` |
| Cancelar arrastre | `Esc` |
| Desplazar vista | `Mayús` + arrastrar, o botón central |
| Zoom | rueda del ratón |
| Anular ajuste magnético | mantener `Alt` |
| Paso ×10 / ÷10 en los `±` | `Mayús` / `Alt` |
| Restablecer un control | doble clic en su etiqueta |

---

## Bases (peanas)

Suelta tus PNG en `assets/bases/<categoría>/` y **aparecerán solas** en el
selector: el módulo escanea las carpetas al arrancar el mundo, no hace falta
editar ningún fichero. Detalles y requisitos geométricos en
[`assets/bases/README.md`](assets/bases/README.md).

---

## Compatibilidad entre sistemas

El núcleo es **agnóstico**: produce una imagen y escribe campos estándar de
Foundry (`texture.*`). Lo único específico de cada sistema es de dónde se lee
el tamaño de la criatura, y eso vive aislado en `SystemAdapter`:

| Sistema | Ruta del tamaño |
|---|---|
| PF2e | `actor.system.traits.size.value` (objeto) |
| D&D 5e | `actor.system.traits.size` (string) |
| Genérico | acepta ambas formas |

Añadir otro sistema no requiere tocar el módulo:

```js
class MiSistema extends game.itc.BaseSystemAdapter {
  static systemId = "mi-sistema";
  getSizeKey(actor) { return actor.system.tamaño; }
}
game.itc.registerSystemAdapter(MiSistema);
```

---

## API

Disponible en `game.itc` y en `game.modules.get("isometric-tokens-creator").api`.

```js
await game.itc.open();                     // abrir el editor
await game.itc.open({ actor });            // con sugerencias del actor
await game.itc.openProject(ruta);          // abrir un .itcproj
game.itc.getRatio();                       // ratio de la proyección activa
game.itc.diagnostics();                    // informe del entorno
```

### Hooks

| Hook | Cancelable |
|---|---|
| `isometric-tokens-creator.editorReady` | no |
| `isometric-tokens-creator.projectChanged` | no |
| `isometric-tokens-creator.beforeExport` | **sí** |
| `isometric-tokens-creator.afterExport` | no |
| `isometric-tokens-creator.beforeApplyToken` | **sí** |
| `isometric-tokens-creator.baseLibraryLoaded` | no |

---

## Herramientas de desarrollo

```bash
node tools/verify-architecture.js .    # imports, exports, ciclos y capas
node tools/generate-bases.js assets/bases
```

`verify-architecture.js` comprueba que todo import resuelva, que todo nombre
importado exista realmente como export, que no haya ciclos, y que se respete la
regla de capas (un nivel sólo importa de niveles iguales o inferiores).

---

## Estado

Implementación completa de las fases 0–5 del documento de arquitectura:
41 módulos ES, sin ciclos, sin imports muertos, capas verificadas.

**Todavía no se ha ejecutado dentro de Foundry.** La verificación hasta ahora
es estática (sintaxis, resolución de imports, cobertura de traducciones,
geometría de las bases). Las tres comprobaciones de la Fase 0 del documento
—versión de PIXI y si `extract.canvas` es asíncrono, forma de
`getSceneControlButtons` en v13, y namespace real de `FilePicker`— están
resueltas defensivamente en el código, pero deben confirmarse en ejecución con
`game.itc.diagnostics()`.

## Licencia

MIT
