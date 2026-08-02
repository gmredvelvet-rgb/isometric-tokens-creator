/**
 * Planificador de render.
 *
 * La `PIXI.Application` del editor arranca con `autoStart: false`: sin
 * interacción, el coste de CPU y GPU es cero. Cualquier número de llamadas a
 * `invalidate()` dentro del mismo frame se colapsa en un único render.
 */
export class RenderScheduler {
  #renderer;
  #stage;
  #frameId = null;
  #enabled = true;
  #renderCount = 0;

  constructor(renderer, stage) {
    this.#renderer = renderer;
    this.#stage = stage;
  }

  /** Solicita un render en el próximo frame. Idempotente dentro del frame. */
  invalidate() {
    if (!this.#enabled || this.#frameId !== null) return;
    this.#frameId = requestAnimationFrame(() => {
      this.#frameId = null;
      this.renderNow();
    });
  }

  /** Render inmediato y síncrono. Lo usa el exportador. */
  renderNow() {
    if (!this.#enabled || !this.#renderer) return;
    this.#renderer.render(this.#stage);
    this.#renderCount += 1;
  }

  /**
   * Suspende el render. Se usa durante la exportación para que el viewport no
   * se repinte a mitad de la manipulación del grafo de escena.
   */
  suspend() {
    this.#enabled = false;
    if (this.#frameId !== null) {
      cancelAnimationFrame(this.#frameId);
      this.#frameId = null;
    }
  }

  resume({ render = true } = {}) {
    this.#enabled = true;
    if (render) this.invalidate();
  }

  destroy() {
    this.suspend();
    this.#renderer = null;
    this.#stage = null;
  }

  /** Diagnóstico. */
  get renderCount() {
    return this.#renderCount;
  }
}
