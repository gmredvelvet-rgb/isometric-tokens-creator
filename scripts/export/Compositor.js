import { MODEL_SIZE, MODEL_CENTER } from "../config/constants.js";
import { Logger } from "../core/Logger.js";
import { BaseLayer } from "../canvas/layers/BaseLayer.js";

/**
 * Prepara el grafo de escena para exportar y verifica que el resultado quedará
 * alineado.
 *
 * === Las tres reglas ===
 *
 * Derivadas de la matriz de composición de isometric-perspective (ver
 * `IsoPerspectiveBridge`), gobiernan la geometría del PNG exportado:
 *
 *  R1  El lienzo debe ser cuadrado. Con textura cuadrada, el cálculo de
 *      `sx`/`sy` de isometric-perspective devuelve 1 para *todos* los valores
 *      de `texture.fit`, lo que hace el resultado inmune a esa configuración
 *      — la causa más común de desalineación.
 *
 *  R2  El centro de la elipse de contacto debe caer en el centro exacto del
 *      lienzo. isometric-perspective sitúa el ancla del mesh en el centro de
 *      la celda, así que esto permite `offsetX = offsetY = 0`.
 *
 *  R3  El aspecto de la elipse debe ser `ratio : 1`, para que se superponga
 *      exactamente al rombo de la celda.
 *
 * Estas reglas se comprueban con aserciones ejecutables, no sólo se documentan.
 */
export class Compositor {
  #sceneGraph;

  constructor(sceneGraph) {
    this.#sceneGraph = sceneGraph;
  }

  /**
   * Aísla `compositionRoot` para renderizarlo a tamaño de exportación.
   *
   * Se exporta **el mismo nodo** que el usuario está viendo, no una
   * reconstrucción paralela: no hay dos rutas de código que puedan divergir.
   *
   * @param {number} size lado del PNG en píxeles
   * @returns {() => void} función que restaura el estado anterior
   */
  prepare(size) {
    const root = this.#sceneGraph.compositionRoot;
    const parent = root.parent;
    const index = parent ? parent.getChildIndex(root) : -1;

    const saved = {
      x: root.position.x,
      y: root.position.y,
      scaleX: root.scale.x,
      scaleY: root.scale.y,
      alpha: root.alpha,
      visible: root.visible
    };

    // El contenido ocupa 0..MODEL_SIZE; escalar mapea exactamente a 0..size.
    const scale = size / MODEL_SIZE;
    root.position.set(0, 0);
    root.scale.set(scale, scale);
    root.alpha = 1;
    root.visible = true;

    return () => {
      root.position.set(saved.x, saved.y);
      root.scale.set(saved.scaleX, saved.scaleY);
      root.alpha = saved.alpha;
      root.visible = saved.visible;
      if (parent && index >= 0) parent.setChildIndex(root, index);
    };
  }

  get container() {
    return this.#sceneGraph.compositionRoot;
  }

  /**
   * Verifica R1/R2/R3 antes de codificar el PNG.
   *
   * Informa del valor concreto que falla en lugar de producir un token
   * desalineado en silencio.
   *
   * @returns {{ok: boolean, issues: string[]}}
   */
  verify(project, ratio) {
    const issues = [];
    const size = project.export.size;

    // R1 — lienzo cuadrado.
    if (!Number.isFinite(size) || size <= 0) {
      issues.push(`R1: tamaño de exportación inválido (${size}).`);
    }

    // R2/R3 — geometría de la elipse de contacto.
    const sprite = this.#sceneGraph.layers.base.sprite;
    if (sprite) {
      const contact = BaseLayer.resolveContact(project.assets.base.contact, ratio);

      // La elipse se sitúa por construcción en el centro, desplazada sólo por
      // la elevación de la base.
      const centerY = MODEL_CENTER - project.base.elevation;
      if (Math.abs(centerY - MODEL_CENTER) > 0.5) {
        issues.push(
          `R2: la elevación de la base (${project.base.elevation}) desplaza el punto de ` +
            `contacto ${Math.abs(centerY - MODEL_CENTER).toFixed(1)}px fuera del centro. ` +
            `El token quedará desalineado en la escena.`
        );
      }

      const rxPx = contact.rx * sprite.texture.width;
      const ryPx = contact.ry * sprite.texture.height;
      if (ryPx > 0) {
        const actual = rxPx / ryPx;
        if (Math.abs(actual - ratio) > 0.05) {
          issues.push(
            `R3: el aspecto de la elipse de la base es ${actual.toFixed(4)}, pero la ` +
              `proyección activa exige ${ratio.toFixed(4)}. Revisa el punto de contacto de la base.`
          );
        }
      }
    }

    for (const issue of issues) Logger.warn(issue);
    return { ok: issues.length === 0, issues };
  }
}
