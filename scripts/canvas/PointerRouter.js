/**
 * Enrutador de eventos de puntero del viewport.
 *
 * Decide, para cada gesto, si lo atiende el gizmo de transformación o la
 * cámara. Trabaja sobre el elemento DOM del canvas en lugar del sistema de
 * interacción de PIXI: así el arrastre sigue funcionando aunque el cursor
 * salga del canvas, que es el comportamiento esperado en un editor.
 */
export class PointerRouter {
  #element;
  #camera;
  #controls;
  #scheduler;

  #panning = false;
  #lastScreen = { x: 0, y: 0 };
  #bound = {};

  constructor({ element, camera, controls, scheduler }) {
    this.#element = element;
    this.#camera = camera;
    this.#controls = controls;
    this.#scheduler = scheduler;
  }

  attach() {
    this.#bound.down = (e) => this.#onPointerDown(e);
    this.#bound.move = (e) => this.#onPointerMove(e);
    this.#bound.up = (e) => this.#onPointerUp(e);
    this.#bound.wheel = (e) => this.#onWheel(e);
    this.#bound.key = (e) => this.#onKeyDown(e);
    this.#bound.context = (e) => e.preventDefault();

    this.#element.addEventListener("pointerdown", this.#bound.down);
    // En window, no en el canvas: el arrastre debe sobrevivir a salir del área.
    window.addEventListener("pointermove", this.#bound.move);
    window.addEventListener("pointerup", this.#bound.up);
    this.#element.addEventListener("wheel", this.#bound.wheel, { passive: false });
    this.#element.addEventListener("contextmenu", this.#bound.context);
    window.addEventListener("keydown", this.#bound.key);
  }

  detach() {
    this.#element?.removeEventListener("pointerdown", this.#bound.down);
    window.removeEventListener("pointermove", this.#bound.move);
    window.removeEventListener("pointerup", this.#bound.up);
    this.#element?.removeEventListener("wheel", this.#bound.wheel);
    this.#element?.removeEventListener("contextmenu", this.#bound.context);
    window.removeEventListener("keydown", this.#bound.key);
    this.#bound = {};
  }

  #localCoords(event) {
    const rect = this.#element.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  }

  #onPointerDown(event) {
    const local = this.#localCoords(event);
    this.#lastScreen = local;

    // Botón central o derecho, o espacio: siempre pan.
    if (event.button === 1 || event.button === 2 || event.shiftKey) {
      this.#panning = true;
      this.#element.style.cursor = "grabbing";
      event.preventDefault();
      return;
    }

    if (event.button !== 0) return;

    const model = this.#camera.screenToModel(local.x, local.y);
    const hit = this.#controls.hitTest(model.x, model.y);

    if (hit) {
      this.#controls.begin(hit, model.x, model.y);
      this.#element.setPointerCapture?.(event.pointerId);
    } else {
      // Clic en vacío: pan. Es lo que espera cualquiera que venga de un editor
      // gráfico.
      this.#panning = true;
      this.#element.style.cursor = "grabbing";
    }
    event.preventDefault();
  }

  #onPointerMove(event) {
    const local = this.#localCoords(event);

    if (this.#panning) {
      this.#camera.panBy(local.x - this.#lastScreen.x, local.y - this.#lastScreen.y);
      this.#lastScreen = local;
      this.#scheduler.invalidate();
      return;
    }

    if (this.#controls.isDragging) {
      const model = this.#camera.screenToModel(local.x, local.y);
      this.#controls.update(model.x, model.y, { bypassSnap: event.altKey });
      this.#scheduler.invalidate();
      return;
    }

    // Sin arrastre: sólo actualizar el cursor según lo que haya debajo.
    const model = this.#camera.screenToModel(local.x, local.y);
    const hit = this.#controls.hitTest(model.x, model.y);
    this.#element.style.cursor = hit ? this.#cursorFor(hit) : "grab";
  }

  #onPointerUp(event) {
    if (this.#panning) {
      this.#panning = false;
      this.#element.style.cursor = "grab";
      return;
    }
    if (this.#controls.isDragging) {
      this.#controls.end();
      this.#element.releasePointerCapture?.(event.pointerId);
      this.#scheduler.invalidate();
    }
  }

  #onWheel(event) {
    event.preventDefault();
    const local = this.#localCoords(event);
    const factor = event.deltaY < 0 ? 1.12 : 1 / 1.12;
    this.#camera.zoomAt(local.x, local.y, factor);
    this.#scheduler.invalidate();
  }

  #onKeyDown(event) {
    if (event.key === "Escape" && this.#controls.isDragging) {
      this.#controls.cancel();
      this.#scheduler.invalidate();
      event.preventDefault();
    }
  }

  #cursorFor(hit) {
    if (hit.mode === "scale") {
      const diagonal = { nw: "nwse-resize", se: "nwse-resize", ne: "nesw-resize", sw: "nesw-resize" };
      const straight = { n: "ns-resize", s: "ns-resize", e: "ew-resize", w: "ew-resize" };
      return diagonal[hit.handleId] ?? straight[hit.handleId] ?? "pointer";
    }
    return "move";
  }
}
