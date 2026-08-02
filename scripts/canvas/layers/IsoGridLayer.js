import { Layer } from "./Layer.js";
import { MODEL_SIZE, MODEL_CENTER } from "../../config/constants.js";

/**
 * Rejilla isométrica y elipse guía de contacto.
 *
 * Los rombos usan exactamente la misma geometría que las celdas de una escena
 * isométrica de Foundry: diagonal horizontal / diagonal vertical = `ratio`.
 *
 * La elipse guía materializa visualmente la regla R3 del exportador: si la
 * base encaja en ella, el token quedará alineado en la escena.
 *
 * Excluida de la exportación (es hermana de `compositionRoot`).
 */
export class IsoGridLayer extends Layer {
  static GRID_COLOR = 0x4a5058;
  static AXIS_COLOR = 0x5c6470;
  static ELLIPSE_COLOR = 0xe0a33a;

  #grid;
  #guide;
  #lastRatio = null;

  constructor() {
    super("grid");
    this.#grid = new PIXI.Graphics();
    this.#guide = new PIXI.Graphics();
    this.container.addChild(this.#grid, this.#guide);
  }

  apply(project, { ratio }) {
    if (ratio !== this.#lastRatio) {
      this.#drawGrid(ratio);
      this.#lastRatio = ratio;
    }
    this.#drawGuide(project, ratio);
  }

  /**
   * Dibuja la retícula de rombos.
   *
   * Un rombo de celda tiene semiancho `hw` y semialto `hw / ratio`. Se recorre
   * el plano en coordenadas de celda (i, j) y se convierte a pantalla.
   */
  #drawGrid(ratio) {
    const g = this.#grid;
    g.cacheAsBitmap = false;
    g.clear();

    // Una celda ocupa 1/4 del lienzo de ancho: suficiente contexto visual sin
    // saturar la vista.
    const hw = MODEL_SIZE / 8;
    const hh = hw / ratio;
    const range = 6;

    g.lineStyle(1, IsoGridLayer.GRID_COLOR, 0.35);

    for (let i = -range; i <= range; i++) {
      for (let j = -range; j <= range; j++) {
        const cx = MODEL_CENTER + (i - j) * hw;
        const cy = MODEL_CENTER + (i + j) * hh;

        // Descartar rombos totalmente fuera del lienzo.
        if (cx + hw < 0 || cx - hw > MODEL_SIZE) continue;
        if (cy + hh < 0 || cy - hh > MODEL_SIZE) continue;

        g.moveTo(cx, cy - hh);
        g.lineTo(cx + hw, cy);
        g.lineTo(cx, cy + hh);
        g.lineTo(cx - hw, cy);
        g.closePath();
      }
    }

    // Rombo central resaltado: es la celda que ocupará el token.
    g.lineStyle(2, IsoGridLayer.AXIS_COLOR, 0.9);
    g.moveTo(MODEL_CENTER, MODEL_CENTER - hh);
    g.lineTo(MODEL_CENTER + hw, MODEL_CENTER);
    g.lineTo(MODEL_CENTER, MODEL_CENTER + hh);
    g.lineTo(MODEL_CENTER - hw, MODEL_CENTER);
    g.closePath();

    g.cacheAsBitmap = true;
  }

  /**
   * Elipse guía de contacto: ancho = MODEL_SIZE · escala, alto = ancho / ratio.
   * Es la referencia contra la que se alinea la base.
   */
  #drawGuide(project, ratio) {
    const g = this.#guide;
    g.clear();

    const rx = (MODEL_SIZE * project.base.scale) / 2;
    const ry = rx / ratio;

    g.lineStyle(2, IsoGridLayer.ELLIPSE_COLOR, 0.55);
    g.drawEllipse(MODEL_CENTER, MODEL_CENTER, rx, ry);

    // Cruz en el punto de contacto: el centro exacto del PNG exportado.
    g.lineStyle(1, IsoGridLayer.ELLIPSE_COLOR, 0.8);
    g.moveTo(MODEL_CENTER - 12, MODEL_CENTER);
    g.lineTo(MODEL_CENTER + 12, MODEL_CENTER);
    g.moveTo(MODEL_CENTER, MODEL_CENTER - 12);
    g.lineTo(MODEL_CENTER, MODEL_CENTER + 12);
  }
}
