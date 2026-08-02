import { MODEL_SIZE, EVENTS } from "../config/constants.js";

/**
 * Cámara del viewport: pan y zoom.
 *
 * Transforma `viewportRoot`, nunca el contenido. El modelo permanece siempre
 * en su espacio canónico de 1024 unidades, de modo que hacer zoom no altera
 * ni un solo valor del proyecto.
 */
export class CameraController {
  static MIN_ZOOM = 0.1;
  static MAX_ZOOM = 8;

  #root;
  #bus;
  #stage;

  #zoom = 1;
  #panX = 0;
  #panY = 0;

  constructor(viewportRoot, stageController, bus) {
    this.#root = viewportRoot;
    this.#stage = stageController;
    this.#bus = bus;
  }

  get zoom() {
    return this.#zoom;
  }

  /** Encaja el lienzo del modelo en el viewport, con un margen. */
  fitToView(margin = 0.9) {
    const w = this.#stage.width;
    const h = this.#stage.height;
    if (w <= 0 || h <= 0) return;

    this.#zoom = (Math.min(w, h) / MODEL_SIZE) * margin;
    this.#panX = (w - MODEL_SIZE * this.#zoom) / 2;
    this.#panY = (h - MODEL_SIZE * this.#zoom) / 2;
    this.#commit();
  }

  /**
   * Zoom centrado en un punto de pantalla, de modo que el punto bajo el cursor
   * permanece bajo el cursor.
   */
  zoomAt(screenX, screenY, factor) {
    const next = Math.min(
      CameraController.MAX_ZOOM,
      Math.max(CameraController.MIN_ZOOM, this.#zoom * factor)
    );
    if (next === this.#zoom) return;

    const modelX = (screenX - this.#panX) / this.#zoom;
    const modelY = (screenY - this.#panY) / this.#zoom;

    this.#zoom = next;
    this.#panX = screenX - modelX * this.#zoom;
    this.#panY = screenY - modelY * this.#zoom;
    this.#commit();
  }

  panBy(dx, dy) {
    this.#panX += dx;
    this.#panY += dy;
    this.#commit();
  }

  reset() {
    this.fitToView();
  }

  /** Pantalla → espacio del modelo. Lo usan el hit-test y los gizmos. */
  screenToModel(x, y) {
    return {
      x: (x - this.#panX) / this.#zoom,
      y: (y - this.#panY) / this.#zoom
    };
  }

  modelToScreen(x, y) {
    return {
      x: x * this.#zoom + this.#panX,
      y: y * this.#zoom + this.#panY
    };
  }

  /** Convierte un desplazamiento de pantalla a unidades de modelo. */
  screenDeltaToModel(dx, dy) {
    return { x: dx / this.#zoom, y: dy / this.#zoom };
  }

  #commit() {
    this.#root.position.set(this.#panX, this.#panY);
    this.#root.scale.set(this.#zoom, this.#zoom);
    this.#bus.emit(EVENTS.VIEWPORT_CAMERA, {
      zoom: this.#zoom,
      panX: this.#panX,
      panY: this.#panY
    });
  }
}
