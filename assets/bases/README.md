# Bases (peanas)

Suelta aquí tus PNG y aparecerán en el selector del editor. **No hace falta
editar ningún fichero**: el módulo escanea estas carpetas al arrancar el mundo.

```
assets/bases/
├── stone/     ← piedra
├── wood/      ← madera
├── snow/      ← nieve
├── lava/      ← lava
├── sand/      ← arena
├── metal/     ← metal
├── custom/    ← lo que no encaje en las anteriores
└── bases.json ← opcional: sólo para declarar el punto de contacto exacto
```

La categoría la determina la carpeta. El nombre visible se deduce del nombre
del archivo (`stone-cobbles-01.png` → «Stone Cobbles 01»).

Formatos aceptados: PNG, WebP, JPG, GIF. **Usa PNG con transparencia real.**

Tras copiar archivos, recarga el mundo (F5) para que se detecten.

---

## Cómo debe estar dibujada una base

El módulo alinea la peana por su **elipse de contacto**: la zona donde toca el
suelo. Para que el token encaje en la celda isométrica sin correcciones
manuales, esa elipse debe cumplir:

> **ancho / alto = `ratio` de la proyección**
>
> - True Isometric → **√3 ≈ 1.7320** (la más habitual)
> - Dimetric (2:1) → 2.0
> - Overhead (√2:1) → 1.4142
> - Projection (3:2) → 1.5

Con `ratio = √3`, una elipse de 1000 px de ancho debe medir **577 px de alto**.

Si la elipse no cumple la proporción, la base se verá bien en el editor pero el
token quedará ligeramente desalineado sobre la rejilla de la escena. Con el
**modo depuración** activado (ajustes del módulo), el editor avisa en consola
con el valor concreto que ha encontrado.

### Consejo práctico

Lo más sencillo es dibujar la base en un **lienzo cuadrado**, con la elipse
centrada y ocupando todo el ancho. Ésa es la convención que el módulo asume
cuando no puede determinar nada mejor.

Si tu peana tiene grosor lateral, borde decorativo o perspectiva propia, el
centro de la elipse **no** coincidirá con el centro de la imagen. En ese caso
el módulo lo estima automáticamente a partir del recuadro alfa la primera vez
que seleccionas la base. Si la estimación no te convence, declárala a mano en
`bases.json` (ver abajo).

---

## bases.json (opcional)

Sólo hace falta si quieres control exacto sobre el punto de contacto, o
etiquetas traducibles. Las bases no declaradas aquí funcionan igual.

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
      "label": "Adoquines de piedra",
      "src": "assets/bases/stone/stone-01.png",
      "contact": { "cx": 0.5, "cy": 0.5, "rx": 0.4883, "ry": 0.2819 },
      "ratio": 1.7320508
    }
  ]
}
```

`contact` va **normalizado de 0 a 1** sobre las dimensiones de la imagen:

| Campo | Significado |
|---|---|
| `cx`, `cy` | centro de la elipse de contacto |
| `rx` | semieje horizontal |
| `ry` | semieje vertical (debe valer `rx / ratio` si la imagen es cuadrada) |

`label` puede ser texto literal o una clave de traducción (`ITC.Base.…`)
definida en `lang/es.json` y `lang/en.json`.

---

## Regenerar las bases de ejemplo

Las bases incluidas se generan proceduralmente con geometría exacta:

```bash
node tools/generate-bases.js assets/bases
```

El script imprime la desviación respecto al `ratio` exigido, que debe ser cero.
