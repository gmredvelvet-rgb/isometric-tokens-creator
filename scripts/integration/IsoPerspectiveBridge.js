import {
  ISO_PERSPECTIVE_ID,
  PROJECTIONS,
  DEFAULT_PROJECTION,
  REVERSE_ROTATION_DEG
} from "../config/constants.js";
import { Logger } from "../core/Logger.js";

const DEG = Math.PI / 180;

/** Parsea el formato de 8 números de `customProjection`. */
function parseCustomProjection(raw) {
  if (typeof raw !== "string") return null;
  const v = raw.split(",").map((s) => Number.parseFloat(s.trim()));
  if (v.length !== 8 || v.some(Number.isNaN)) return null;
  return { rotation: v[0], skewX: v[1], skewY: v[2], ratio: v[7] };
}

/**
 * Puente de solo lectura hacia `isometric-perspective`.
 *
 * Toda dependencia de ese módulo pasa por aquí. Si no está instalado o su
 * interruptor maestro está apagado, devolvemos un perfil por defecto y el
 * editor sigue funcionando: la dependencia es blanda por diseño.
 *
 * === Por qué esto importa ===
 *
 * isometric-perspective aplica al *stage* una rotación + skew, y al *mesh* del
 * token una contra-rotación de 45°. La composición de ambas matrices es una
 * escala pura alineada a los ejes (sin rotación ni skew residual):
 *
 *   True Isometric →  diag(√6/2, √2/2)      cociente H/V = √3 = ratio
 *   Dimetric (2:1) →  diag(1.2649, 0.6325)  cociente H/V = 2.0 = ratio
 *
 * Es decir: el arte del token se ve *recto* en pantalla, y ocupa un cuadrado
 * cuyo ancho equivale a la diagonal horizontal del rombo de la celda.
 *
 * De ahí salen las tres reglas del exportador (ver Compositor):
 *   R1  lienzo cuadrado
 *   R2  elipse de contacto centrada en el lienzo
 *   R3  aspecto de la elipse = ratio : 1
 */
export const IsoPerspectiveBridge = {
  /** ¿Está el módulo instalado y activo? */
  get isActive() {
    return game.modules.get(ISO_PERSPECTIVE_ID)?.active === true;
  },

  /** Interruptor maestro `worldIsometricFlag` del módulo isométrico. */
  get isWorldIsometric() {
    if (!this.isActive) return false;
    try {
      return game.settings.get(ISO_PERSPECTIVE_ID, "worldIsometricFlag") === true;
    } catch {
      return false;
    }
  },

  /** ¿Esta escena concreta usa proyección isométrica? */
  isSceneIsometric(scene = canvas?.scene) {
    if (!this.isActive || !scene) return false;
    return scene.getFlag(ISO_PERSPECTIVE_ID, "isometricEnabled") === true;
  },

  /**
   * Perfil de proyección activo.
   *
   * Prioridad: flag de la escena → proyección por defecto. Si la escena declara
   * `Custom Projection`, se parsean los 8 números del flag `customProjection`
   * con el mismo formato que usa isometric-perspective.
   *
   * @returns {{type:string, rotation:number, skewX:number, skewY:number, ratio:number}}
   *          ángulos en grados.
   */
  getProjection(scene = canvas?.scene) {
    const fallback = { type: DEFAULT_PROJECTION, ...PROJECTIONS[DEFAULT_PROJECTION] };
    if (!this.isActive || !scene) return fallback;

    const type = scene.getFlag(ISO_PERSPECTIVE_ID, "projectionType") ?? DEFAULT_PROJECTION;

    if (type === "Custom Projection") {
      const custom = parseCustomProjection(scene.getFlag(ISO_PERSPECTIVE_ID, "customProjection"));
      if (custom) return { type, ...custom };
      Logger.warn("Proyección personalizada ilegible; se usa la proyección por defecto.");
      return fallback;
    }

    const preset = PROJECTIONS[type];
    if (!preset) {
      Logger.warn(`Proyección desconocida "${type}"; se usa la proyección por defecto.`);
      return fallback;
    }
    return { type, ...preset };
  },

  /**
   * Cociente diagonal-horizontal / diagonal-vertical del rombo de celda.
   * Es LA constante que gobierna la geometría de todo el módulo.
   */
  getRatio(scene = canvas?.scene) {
    return this.getProjection(scene).ratio;
  },

  /**
   * Matriz de composición `stage × mesh` para la proyección dada.
   *
   * Se calcula con la misma fórmula que usa PIXI para componer rotación y
   * skew, de modo que la vista previa "Vista en Foundry" reproduce el
   * resultado real del canvas en lugar de aproximarlo.
   *
   * @returns {{a:number, b:number, c:number, d:number}} matriz 2×2
   */
  getCompositionMatrix(scene = canvas?.scene) {
    const p = this.getProjection(scene);

    // Matriz del stage, según PIXI Transform#updateLocalTransform.
    const sa = Math.cos((p.rotation + p.skewY) * DEG);
    const sb = Math.sin((p.rotation + p.skewY) * DEG);
    const sc = -Math.sin((p.rotation - p.skewX) * DEG);
    const sd = Math.cos((p.rotation - p.skewX) * DEG);

    // Contra-rotación del mesh (45° para todas las proyecciones de la tabla).
    const r = REVERSE_ROTATION_DEG * DEG;
    const ma = Math.cos(r);
    const mb = Math.sin(r);
    const mc = -Math.sin(r);
    const md = Math.cos(r);

    // Producto stage × mesh.
    return {
      a: sa * ma + sc * mb,
      b: sb * ma + sd * mb,
      c: sa * mc + sc * md,
      d: sb * mc + sd * md
    };
  },

  /**
   * Flags de isometric-perspective a escribir en el token.
   *
   * Se escriben a cero de forma explícita: nuestro PNG ya está alineado por
   * construcción, así que cualquier corrección manual previa del usuario
   * sólo lo desalinearía.
   */
  buildTokenFlags() {
    if (!this.isActive) return {};
    return {
      [`flags.${ISO_PERSPECTIVE_ID}.offsetX`]: 0,
      [`flags.${ISO_PERSPECTIVE_ID}.offsetY`]: 0,
      [`flags.${ISO_PERSPECTIVE_ID}.scale`]: 1,
      [`flags.${ISO_PERSPECTIVE_ID}.isoAnchorX`]: 0.5,
      [`flags.${ISO_PERSPECTIVE_ID}.isoAnchorY`]: 0.5
    };
  }
};
