/**
 * Base de todas las capas del grafo de escena.
 *
 * Una capa posee un `PIXI.Container` y sabe reconstruirse a partir del modelo.
 * Nunca lee el modelo por su cuenta: se le pasa en `apply()`, de modo que la
 * capa es una función pura del estado y no puede desincronizarse.
 */
export class Layer {
  /** @type {PIXI.Container} */
  container;

  #name;

  constructor(name) {
    this.#name = name;
    this.container = new PIXI.Container();
    this.container.name = `itc-${name}`;
    this.container.sortableChildren = false;
  }

  get name() {
    return this.#name;
  }

  get visible() {
    return this.container.visible;
  }

  set visible(value) {
    this.container.visible = value;
  }

  /**
   * Actualiza la capa desde el modelo.
   * @param {import("../../model/TokenProject.js").TokenProject} _project
   * @param {object} _context datos derivados compartidos (ratio, texturas…)
   */
  apply(_project, _context) {}

  /** Libera recursos propios. Las texturas las gestiona TextureCache. */
  destroy() {
    this.container.destroy({ children: true, texture: false, baseTexture: false });
    this.container = null;
  }
}
