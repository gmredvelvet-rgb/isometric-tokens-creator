import { Layer } from "./Layer.js";
import { MODEL_CENTER } from "../../config/constants.js";

/**
 * Ayudas visuales de edición: caja delimitadora, tiradores, marcador de pivote
 * y gizmo de ejes X/Y/Z.
 *
 * Los colores siguen la convención de Blender/Unreal, que es la que el usuario
 * ya tiene interiorizada:
 *   X → rojo, Y → verde, Z → azul.
 *
 * Excluida de la exportación (es hermana de `compositionRoot`).
 */
export class OverlayLayer extends Layer {
  static AXIS_X = 0xe0483a;
  static AXIS_Y = 0x4ac26b;
  static AXIS_Z = 0x3d8bfd;
  static BOX = 0xc9d1d9;
  static HANDLE_FILL = 0xf0f3f6;

  static HANDLE_SIZE = 12;
  static AXIS_LENGTH = 150;

  #box;
  #handles;
  #gizmo;
  #pivot;

  /** Posiciones de los tiradores en coordenadas de modelo, para el hit-test. */
  handlePositions = [];

  constructor() {
    super("overlay");
    this.#box = new PIXI.Graphics();
    this.#handles = new PIXI.Graphics();
    this.#gizmo = new PIXI.Graphics();
    this.#pivot = new PIXI.Graphics();
    this.container.addChild(this.#box, this.#handles, this.#gizmo, this.#pivot);
  }

  apply(project, { artworkBounds }) {
    this.#drawBox(artworkBounds);
    this.#drawHandles(artworkBounds);
    this.#drawGizmo(project);
    this.#drawPivot(project);
  }

  #drawBox(bounds) {
    const g = this.#box;
    g.clear();
    if (!bounds) return;

    g.lineStyle(1.5, OverlayLayer.BOX, 0.75);
    g.drawRect(bounds.x, bounds.y, bounds.width, bounds.height);
  }

  #drawHandles(bounds) {
    const g = this.#handles;
    g.clear();
    this.handlePositions = [];
    if (!bounds) return;

    const { x, y, width: w, height: h } = bounds;
    const s = OverlayLayer.HANDLE_SIZE;

    const points = [
      { id: "nw", x, y },
      { id: "n", x: x + w / 2, y },
      { id: "ne", x: x + w, y },
      { id: "e", x: x + w, y: y + h / 2 },
      { id: "se", x: x + w, y: y + h },
      { id: "s", x: x + w / 2, y: y + h },
      { id: "sw", x, y: y + h },
      { id: "w", x, y: y + h / 2 }
    ];

    g.lineStyle(1.5, 0x1c1f24, 1);
    g.beginFill(OverlayLayer.HANDLE_FILL, 1);
    for (const p of points) {
      g.drawRect(p.x - s / 2, p.y - s / 2, s, s);
      this.handlePositions.push({ ...p, size: s });
    }
    g.endFill();
  }

  /**
   * Gizmo de tres ejes.
   *
   * X e Y siguen las diagonales del rombo isométrico (que es como se mueve
   * realmente el token en la escena); Z es vertical en pantalla.
   */
  #drawGizmo(project) {
    const g = this.#gizmo;
    g.clear();

    const cx = MODEL_CENTER + project.artwork.x;
    const cy = MODEL_CENTER + project.artwork.y - project.artwork.z;
    const len = OverlayLayer.AXIS_LENGTH;

    // Direcciones isométricas de los ejes de suelo, normalizadas.
    const dx = { x: 0.866, y: 0.5 };
    const dy = { x: -0.866, y: 0.5 };

    this.#axis(g, cx, cy, dx.x * len, dx.y * len, OverlayLayer.AXIS_X);
    this.#axis(g, cx, cy, dy.x * len, dy.y * len, OverlayLayer.AXIS_Y);
    this.#axis(g, cx, cy, 0, -len, OverlayLayer.AXIS_Z);

    // Nodo central: arrastrar aquí mueve libremente.
    g.lineStyle(1.5, 0x1c1f24, 1);
    g.beginFill(0xf0f3f6, 1);
    g.drawRect(cx - 5, cy - 5, 10, 10);
    g.endFill();
  }

  #axis(g, x, y, dx, dy, color) {
    g.lineStyle(2.5, color, 1);
    g.moveTo(x, y);
    g.lineTo(x + dx, y + dy);

    // Punta de flecha.
    const len = Math.hypot(dx, dy);
    if (len < 1) return;
    const ux = dx / len;
    const uy = dy / len;
    const tipX = x + dx;
    const tipY = y + dy;
    const size = 12;

    g.beginFill(color, 1);
    g.moveTo(tipX, tipY);
    g.lineTo(tipX - ux * size - uy * size * 0.45, tipY - uy * size + ux * size * 0.45);
    g.lineTo(tipX - ux * size + uy * size * 0.45, tipY - uy * size - ux * size * 0.45);
    g.closePath();
    g.endFill();
  }

  #drawPivot(project) {
    const g = this.#pivot;
    g.clear();

    const x = MODEL_CENTER + project.artwork.x;
    const y = MODEL_CENTER + project.artwork.y - project.artwork.z;

    g.lineStyle(1.5, 0xe0a33a, 0.9);
    g.drawCircle(x, y, 7);
    g.moveTo(x - 11, y);
    g.lineTo(x + 11, y);
    g.moveTo(x, y - 11);
    g.lineTo(x, y + 11);
  }
}
