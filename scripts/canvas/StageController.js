import { Logger } from "../core/Logger.js";
import { RenderScheduler } from "../render/RenderScheduler.js";

/**
 * Propietario de la `PIXI.Application` del editor.
 *
 * Es la única clase que crea y destruye el renderer. Aísla también las
 * diferencias entre PIXI 7 y 8, que afectan sobre todo al exportador
 * (`renderer.extract` pasa de síncrono a asíncrono en PIXI 8).
 */
export class StageController {
  #app = null;
  #host = null;
  #scheduler = null;
  #resizeObserver = null;

  /**
   * @param {HTMLElement} hostElement contenedor del canvas
   */
  async init(hostElement) {
    this.#host = hostElement;

    const { clientWidth, clientHeight } = hostElement;
    const width = Math.max(clientWidth || 800, 1);
    const height = Math.max(clientHeight || 600, 1);

    this.#app = new PIXI.Application({
      width,
      height,
      // Fondo totalmente transparente: la garantía de transparencia del
      // exportador empieza aquí.
      backgroundAlpha: 0,
      antialias: true,
      autoStart: false,
      autoDensity: true,
      resolution: Math.min(globalThis.devicePixelRatio || 1, 2)
    });

    const view = this.#app.view;
    view.classList.add("itc-canvas");
    hostElement.appendChild(view);

    this.#scheduler = new RenderScheduler(this.#app.renderer, this.#app.stage);

    this.#observeResize();

    Logger.info(`PIXI ${PIXI.VERSION} inicializado (${width}×${height})`);
    return this.#app;
  }

  get app() {
    return this.#app;
  }

  get stage() {
    return this.#app?.stage;
  }

  get renderer() {
    return this.#app?.renderer;
  }

  get scheduler() {
    return this.#scheduler;
  }

  get width() {
    return this.#app?.renderer.width ?? 0;
  }

  get height() {
    return this.#app?.renderer.height ?? 0;
  }

  /** Versión mayor de PIXI. El exportador la usa para elegir la ruta correcta. */
  get pixiMajor() {
    return Number.parseInt(PIXI.VERSION?.split(".")[0] ?? "7", 10);
  }

  resize(width, height) {
    if (!this.#app) return;
    const w = Math.max(Math.floor(width), 1);
    const h = Math.max(Math.floor(height), 1);
    this.#app.renderer.resize(w, h);
    this.#scheduler.invalidate();
  }

  #observeResize() {
    if (!globalThis.ResizeObserver) return;
    this.#resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        if (width > 0 && height > 0) this.resize(width, height);
      }
    });
    this.#resizeObserver.observe(this.#host);
  }

  /**
   * Destruye el renderer.
   *
   * `texture: false` es deliberado: las texturas pertenecen a `TextureCache`,
   * que las libera por recuento de referencias. Destruirlas aquí invalidaría
   * las que otro editor abierto pudiera estar usando.
   */
  destroy() {
    this.#resizeObserver?.disconnect();
    this.#resizeObserver = null;

    this.#scheduler?.destroy();
    this.#scheduler = null;

    if (this.#app) {
      try {
        this.#app.destroy(true, { children: true, texture: false, baseTexture: false });
      } catch (err) {
        Logger.warn("Error al destruir la PIXI.Application", err);
      }
      this.#app = null;
    }

    this.#host = null;
  }
}
