import { MODEL_CENTER } from "../../config/constants.js";
import { SetPropertyCommand } from "../../commands/Command.js";
import { SnapService } from "../SnapService.js";

/**
 * Manipulación directa del personaje en el viewport.
 *
 * Cada gesto completo (pointerdown → pointerup) produce **una sola** entrada de
 * deshacer, gracias a las transacciones del historial. Sin eso, arrastrar el
 * gizmo generaría cientos de entradas y el Ctrl+Z sería inservible.
 *
 * Modos:
 *   - `axis-x` / `axis-y` : movimiento restringido a una diagonal isométrica
 *   - `axis-z`            : altura visual sobre la base
 *   - `free`              : movimiento libre en el plano
 *   - `scale-*`           : escalado desde un tirador de la caja
 */
export class TransformControls {
  static MODE = {
    NONE: "none",
    FREE: "free",
    AXIS_X: "axis-x",
    AXIS_Y: "axis-y",
    AXIS_Z: "axis-z",
    SCALE: "scale"
  };

  /** Radio de captura de los ejes del gizmo, en unidades de modelo. */
  static AXIS_HIT_RADIUS = 14;

  #store;
  #history;
  #sceneGraph;

  #mode = TransformControls.MODE.NONE;
  #dragStart = null;
  #initial = null;

  /**
   * Trabaja en coordenadas de modelo: la conversión desde pantalla la hace
   * `PointerRouter` con la cámara, así que aquí no hace falta conocerla.
   */
  constructor({ store, history, sceneGraph }) {
    this.#store = store;
    this.#history = history;
    this.#sceneGraph = sceneGraph;
  }

  get isDragging() {
    return this.#mode !== TransformControls.MODE.NONE;
  }

  /**
   * Determina qué elemento hay bajo el cursor.
   * @returns {{mode: string, handleId?: string}|null}
   */
  hitTest(modelX, modelY) {
    const project = this.#store.state;
    const cx = MODEL_CENTER + project.artwork.x;
    const cy = MODEL_CENTER + project.artwork.y - project.artwork.z;

    // 1. Tiradores de escala (máxima prioridad: son pequeños y explícitos).
    const handles = this.#sceneGraph.layers.overlay.handlePositions;
    for (const h of handles) {
      if (Math.abs(modelX - h.x) <= h.size && Math.abs(modelY - h.y) <= h.size) {
        return { mode: TransformControls.MODE.SCALE, handleId: h.id };
      }
    }

    // 2. Nodo central del gizmo → movimiento libre.
    if (Math.abs(modelX - cx) <= 10 && Math.abs(modelY - cy) <= 10) {
      return { mode: TransformControls.MODE.FREE };
    }

    // 3. Ejes.
    const len = 150;
    const axes = [
      { mode: TransformControls.MODE.AXIS_X, dx: 0.866 * len, dy: 0.5 * len },
      { mode: TransformControls.MODE.AXIS_Y, dx: -0.866 * len, dy: 0.5 * len },
      { mode: TransformControls.MODE.AXIS_Z, dx: 0, dy: -len }
    ];

    for (const axis of axes) {
      if (this.#nearSegment(modelX, modelY, cx, cy, cx + axis.dx, cy + axis.dy)) {
        return { mode: axis.mode };
      }
    }

    // 4. Cuerpo del personaje → movimiento libre.
    const bounds = this.#sceneGraph.layers.artwork.getModelBounds(project);
    if (
      bounds &&
      modelX >= bounds.x &&
      modelX <= bounds.x + bounds.width &&
      modelY >= bounds.y &&
      modelY <= bounds.y + bounds.height
    ) {
      return { mode: TransformControls.MODE.FREE };
    }

    return null;
  }

  /** Comienza un gesto. */
  begin(hit, modelX, modelY) {
    const project = this.#store.state;

    this.#mode = hit.mode;
    this.#dragStart = { x: modelX, y: modelY };
    this.#initial = {
      x: project.artwork.x,
      y: project.artwork.y,
      z: project.artwork.z,
      scale: project.artwork.scale
    };

    this.#history.beginTransaction(this.#labelForMode(hit.mode));
  }

  /**
   * Actualiza durante el arrastre.
   * @param {boolean} bypassSnap `true` mientras se mantiene Alt
   */
  update(modelX, modelY, { bypassSnap = false } = {}) {
    if (!this.isDragging) return;

    const dx = modelX - this.#dragStart.x;
    const dy = modelY - this.#dragStart.y;

    switch (this.#mode) {
      case TransformControls.MODE.FREE:
        this.#set("artwork.x", SnapService.apply(this.#initial.x + dx, bypassSnap));
        this.#set("artwork.y", SnapService.apply(this.#initial.y + dy, bypassSnap));
        break;

      case TransformControls.MODE.AXIS_X: {
        // Proyección del arrastre sobre la diagonal isométrica (0.866, 0.5).
        const t = dx * 0.866 + dy * 0.5;
        this.#set("artwork.x", SnapService.apply(this.#initial.x + t * 0.866, bypassSnap));
        this.#set("artwork.y", SnapService.apply(this.#initial.y + t * 0.5, bypassSnap));
        break;
      }

      case TransformControls.MODE.AXIS_Y: {
        const t = dx * -0.866 + dy * 0.5;
        this.#set("artwork.x", SnapService.apply(this.#initial.x + t * -0.866, bypassSnap));
        this.#set("artwork.y", SnapService.apply(this.#initial.y + t * 0.5, bypassSnap));
        break;
      }

      case TransformControls.MODE.AXIS_Z:
        // Arrastrar hacia arriba aumenta la altura.
        this.#set("artwork.z", SnapService.apply(this.#initial.z - dy, bypassSnap));
        break;

      case TransformControls.MODE.SCALE:
        this.#updateScale(modelX, modelY, bypassSnap);
        break;
    }
  }

  /**
   * Escalado desde un tirador.
   *
   * Se compara la distancia al pivote al empezar y ahora: es estable, no
   * acumula error y funciona igual para los ocho tiradores.
   */
  #updateScale(modelX, modelY, bypassSnap) {
    const project = this.#store.state;
    const px = MODEL_CENTER + project.artwork.x;
    const py = MODEL_CENTER + project.artwork.y - project.artwork.z;

    const startDist = Math.hypot(this.#dragStart.x - px, this.#dragStart.y - py);
    if (startDist < 1) return;

    const nowDist = Math.hypot(modelX - px, modelY - py);
    let next = this.#initial.scale * (nowDist / startDist);
    next = Math.max(0.05, Math.min(10, next));

    if (!bypassSnap) next = Math.round(next * 100) / 100;
    this.#set("artwork.scale", next);
  }

  /** Cierra el gesto dejando una única entrada de historial. */
  end() {
    if (!this.isDragging) return;
    this.#history.commit();
    this.#mode = TransformControls.MODE.NONE;
    this.#dragStart = null;
    this.#initial = null;
  }

  /** Cancela el gesto y revierte todo lo hecho (tecla Escape). */
  cancel() {
    if (!this.isDragging) return;
    this.#history.rollback();
    this.#mode = TransformControls.MODE.NONE;
    this.#dragStart = null;
    this.#initial = null;
  }

  #set(path, value) {
    this.#history.execute(new SetPropertyCommand(this.#store, path, value));
  }

  #labelForMode(mode) {
    const labels = {
      [TransformControls.MODE.FREE]: "Mover personaje",
      [TransformControls.MODE.AXIS_X]: "Mover en X",
      [TransformControls.MODE.AXIS_Y]: "Mover en Y",
      [TransformControls.MODE.AXIS_Z]: "Ajustar altura",
      [TransformControls.MODE.SCALE]: "Escalar personaje"
    };
    return labels[mode] ?? "Transformar";
  }

  /** Distancia punto–segmento, para capturar los ejes del gizmo. */
  #nearSegment(px, py, x1, y1, x2, y2) {
    const vx = x2 - x1;
    const vy = y2 - y1;
    const lenSq = vx * vx + vy * vy;
    if (lenSq === 0) return false;

    let t = ((px - x1) * vx + (py - y1) * vy) / lenSq;
    t = Math.max(0, Math.min(1, t));

    const dist = Math.hypot(px - (x1 + t * vx), py - (y1 + t * vy));
    return dist <= TransformControls.AXIS_HIT_RADIUS;
  }
}
