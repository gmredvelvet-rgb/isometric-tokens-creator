import { Layer } from "./Layer.js";
import { MODEL_SIZE } from "../../config/constants.js";

/**
 * Fondo de ajedrez que indica transparencia.
 *
 * Es una capa *hermana* de `compositionRoot`, nunca hija: por construcción es
 * imposible que se cuele en el PNG exportado, sin depender de acordarse de
 * ocultarla.
 */
export class CheckerLayer extends Layer {
  static CELL = 32;
  static LIGHT = 0x2a2d33;
  static DARK = 0x232529;

  #graphics;

  constructor() {
    super("checker");
    this.#graphics = new PIXI.Graphics();
    this.container.addChild(this.#graphics);
    this.#draw();
  }

  #draw() {
    const g = this.#graphics;
    const cell = CheckerLayer.CELL;
    const cells = Math.ceil(MODEL_SIZE / cell);

    g.clear();
    g.beginFill(CheckerLayer.LIGHT);
    g.drawRect(0, 0, MODEL_SIZE, MODEL_SIZE);
    g.endFill();

    g.beginFill(CheckerLayer.DARK);
    for (let row = 0; row < cells; row++) {
      for (let col = row % 2; col < cells; col += 2) {
        g.drawRect(col * cell, row * cell, cell, cell);
      }
    }
    g.endFill();

    // La cuadrícula es estática: cachearla como bitmap evita reprocesar
    // ~1000 rectángulos en cada render.
    g.cacheAsBitmap = true;
  }
}
