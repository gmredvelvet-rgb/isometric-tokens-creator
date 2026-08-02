import { EVENTS } from "../config/constants.js";

/**
 * Contenedor del modelo con notificación por rutas.
 *
 * Los suscriptores se registran por *prefijo de ruta* (`"artwork"`,
 * `"shadow.blur"`), de modo que cambiar `artwork.x` no despierta al panel de
 * sombra. Ésta es la pieza que hace posible "nunca rerenderizar todo".
 *
 * Nadie escribe aquí directamente: sólo los Commands, para que el historial
 * de deshacer sea completo por construcción.
 */
export class Store {
  #project;
  #bus;
  #batchDepth = 0;
  #batchedPaths = new Set();

  constructor(project, bus) {
    this.#project = project;
    this.#bus = bus;
  }

  /** El proyecto vivo. Tratar como sólo lectura fuera de los Commands. */
  get state() {
    return this.#project;
  }

  /** Sustituye el proyecto entero (abrir fichero, nuevo proyecto). */
  replace(project) {
    this.#project = project;
    this.#bus.emit(EVENTS.MODEL_REPLACED, { project });
  }

  /**
   * Lee por ruta con puntos.
   * @param {string} path p.ej. `"artwork.pivot.x"`
   */
  get(path) {
    return foundry.utils.getProperty(this.#project, path);
  }

  /**
   * Escribe por ruta y notifica.
   * @returns {string[]} rutas cambiadas (vacío si el valor no cambió)
   */
  set(path, value) {
    const previous = this.get(path);
    if (Store.equals(previous, value)) return [];

    foundry.utils.setProperty(this.#project, path, value);
    this.#project.touch?.();
    this.#notify([path]);
    return [path];
  }

  /**
   * Agrupa varias escrituras en una sola notificación.
   * Útil para operaciones compuestas (reset, autofit) que tocan muchas rutas.
   *
   * @param {() => void} fn
   * @returns {string[]} todas las rutas cambiadas
   */
  batch(fn) {
    this.#batchDepth += 1;
    try {
      fn();
    } finally {
      this.#batchDepth -= 1;
    }

    if (this.#batchDepth === 0 && this.#batchedPaths.size > 0) {
      const paths = [...this.#batchedPaths];
      this.#batchedPaths.clear();
      this.#bus.emit(EVENTS.MODEL_CHANGED, { paths });
      return paths;
    }
    return [];
  }

  /**
   * Suscripción filtrada por prefijo de ruta.
   *
   * @param {string|string[]} pathPrefix `""` para escuchar todo
   * @param {(paths: string[]) => void} handler
   * @returns {() => void} cancelar suscripción
   */
  subscribe(pathPrefix, handler) {
    const prefixes = (Array.isArray(pathPrefix) ? pathPrefix : [pathPrefix]).filter(
      (p) => p !== undefined && p !== null
    );

    return this.#bus.on(EVENTS.MODEL_CHANGED, ({ paths }) => {
      if (prefixes.length === 0 || prefixes.some((p) => p === "")) {
        handler(paths);
        return;
      }
      const matched = paths.filter((path) =>
        prefixes.some((prefix) => path === prefix || path.startsWith(`${prefix}.`))
      );
      if (matched.length > 0) handler(matched);
    });
  }

  #notify(paths) {
    if (this.#batchDepth > 0) {
      for (const p of paths) this.#batchedPaths.add(p);
      return;
    }
    this.#bus.emit(EVENTS.MODEL_CHANGED, { paths });
  }

  /** Comparación estructural somera, suficiente para los tipos del modelo. */
  static equals(a, b) {
    if (a === b) return true;
    if (typeof a === "number" && typeof b === "number") {
      return Math.abs(a - b) < 1e-9;
    }
    if (a && b && typeof a === "object" && typeof b === "object") {
      return JSON.stringify(a) === JSON.stringify(b);
    }
    return false;
  }
}
