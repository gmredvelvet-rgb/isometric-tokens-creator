import { MODULE_ID, PROJECTIONS } from "./config/constants.js";
import { Logger } from "./core/Logger.js";
import { IsoTokenEditor } from "./apps/IsoTokenEditor.js";
import { TokenProject } from "./model/TokenProject.js";
import { BaseLibrary } from "./assets/BaseLibrary.js";
import { ProjectManager } from "./io/ProjectManager.js";
import { IsoPerspectiveBridge } from "./integration/IsoPerspectiveBridge.js";
import { SystemAdapter, BaseSystemAdapter } from "./integration/SystemAdapter.js";

/** Editor abierto, si lo hay. Sólo tiene sentido uno a la vez. */
let activeEditor = null;

/**
 * API pública del módulo, expuesta en `game.itc` y en
 * `game.modules.get("isometric-tokens-creator").api`.
 *
 * Este contrato sólo crece: las versiones futuras añaden, nunca cambian de
 * forma incompatible.
 */
export const API = {
  /**
   * Abre el editor.
   * @param {object} [options]
   * @param {Actor}  [options.actor]   actor de origen, para sugerencias
   * @param {TokenProject} [options.project] proyecto a cargar
   */
  async open({ actor = null, project = null } = {}) {
    if (activeEditor?.rendered) {
      activeEditor.bringToFront?.();
      return activeEditor;
    }

    activeEditor = new IsoTokenEditor({ actor, project });
    await activeEditor.render(true);
    return activeEditor;
  },

  /** Abre el editor con un proyecto guardado. */
  async openProject(path) {
    const project = await ProjectManager.open(path);
    return this.open({ project });
  },

  /** Editor abierto, o `null`. */
  get editor() {
    return activeEditor?.rendered ? activeEditor : null;
  },

  /** Proyecto vacío con los valores por defecto. */
  createProject(data = {}) {
    return new TokenProject(data);
  },

  // --- Consultas ----------------------------------------------------------

  /** Proyección isométrica activa (tipo, ángulos y `ratio`). */
  getProjection(scene = canvas?.scene) {
    return IsoPerspectiveBridge.getProjection(scene);
  },

  /**
   * Cociente entre las diagonales del rombo de celda.
   * Es la constante que gobierna toda la geometría del módulo.
   */
  getRatio(scene = canvas?.scene) {
    return IsoPerspectiveBridge.getRatio(scene);
  },

  get projections() {
    return foundry.utils.deepClone(PROJECTIONS);
  },

  get bases() {
    return BaseLibrary;
  },

  get projects() {
    return ProjectManager;
  },

  get systems() {
    return SystemAdapter;
  },

  /**
   * Añade soporte para otro sistema de juego sin modificar este módulo.
   *
   * ```js
   * class MiSistema extends game.itc.BaseSystemAdapter {
   *   static systemId = "mi-sistema";
   *   getSizeKey(actor) { return actor.system.tamaño; }
   * }
   * game.itc.registerSystemAdapter(MiSistema);
   * ```
   */
  registerSystemAdapter(AdapterClass) {
    SystemAdapter.register(AdapterClass);
  },

  BaseSystemAdapter,

  /**
   * Diagnóstico. Verifica el entorno y devuelve lo que el módulo detecta.
   * Útil al reportar incidencias.
   */
  diagnostics() {
    const projection = IsoPerspectiveBridge.getProjection();
    const matrix = IsoPerspectiveBridge.getCompositionMatrix();

    const report = {
      module: game.modules.get(MODULE_ID)?.version,
      foundry: game.version,
      pixi: globalThis.PIXI?.VERSION ?? "no disponible",
      pixiExtractIsAsync: null,
      system: { id: game.system.id, adapter: SystemAdapter.current.id },
      isoPerspective: {
        installed: IsoPerspectiveBridge.isActive,
        worldEnabled: IsoPerspectiveBridge.isWorldIsometric,
        sceneEnabled: IsoPerspectiveBridge.isSceneIsometric()
      },
      projection,
      compositionMatrix: matrix,
      // La composición stage × mesh debe ser una escala pura: los términos
      // cruzados han de ser cero y el cociente de la diagonal debe ser `ratio`.
      matrixIsPureScale: Math.abs(matrix.b) < 1e-6 && Math.abs(matrix.c) < 1e-6,
      matrixRatio: Math.abs(matrix.d) > 1e-9 ? Math.abs(matrix.a / matrix.d) : null,
      bases: { builtin: BaseLibrary.all.filter((b) => b.builtin).length, user: BaseLibrary.userBases.length }
    };

    // ¿`extract.canvas` devuelve una Promise en esta instalación?
    try {
      const extract = canvas?.app?.renderer?.extract;
      report.pixiExtractIsAsync = extract
        ? PngEncoderProbe(extract)
        : "canvas no inicializado";
    } catch {
      report.pixiExtractIsAsync = "no se pudo determinar";
    }

    Logger.info("Diagnóstico:", report);
    return report;
  }
};

/** Deduce si `extract.canvas` es asíncrono sin llegar a renderizar nada. */
function PngEncoderProbe(extract) {
  const source = extract.canvas?.toString?.() ?? "";
  if (source.includes("async")) return true;
  const major = Number.parseInt(PIXI.VERSION?.split(".")[0] ?? "7", 10);
  return major >= 8;
}

/** Se llama al cerrar el editor para soltar la referencia. */
export function clearActiveEditor() {
  activeEditor = null;
}
