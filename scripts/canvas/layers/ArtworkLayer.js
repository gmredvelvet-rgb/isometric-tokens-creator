import { Layer } from "./Layer.js";
import { MODEL_SIZE, MODEL_CENTER } from "../../config/constants.js";

const DEG = Math.PI / 180;

/**
 * Capa del personaje.
 *
 * === Normalización de escala ===
 *
 * `artwork.scale = 1` significa "el arte ocupa exactamente la altura del
 * lienzo", no "un píxel de textura por unidad de modelo". Así el valor es
 * estable e interpretable con independencia de la resolución de la imagen
 * importada: una imagen de 512px y otra de 4096px se comportan igual.
 *
 * === Pivote ===
 *
 * `artwork.pivot` es normalizado (0..1) sobre la textura y por defecto vale
 * (0.5, 1) — el centro inferior, es decir, los pies del personaje. Ese punto
 * es el que se sitúa sobre el centro de la elipse de contacto.
 */
export class ArtworkLayer extends Layer {
  #sprite = null;
  #currentSrc = null;

  constructor() {
    super("artwork");
  }

  get sprite() {
    return this.#sprite;
  }

  get currentSrc() {
    return this.#currentSrc;
  }

  setTexture(texture, src) {
    if (this.#sprite) {
      this.container.removeChild(this.#sprite);
      this.#sprite.destroy({ texture: false, baseTexture: false });
      this.#sprite = null;
    }
    this.#currentSrc = src;

    if (!texture) return;

    this.#sprite = new PIXI.Sprite(texture);
    this.#sprite.name = "itc-artwork-sprite";
    this.container.addChild(this.#sprite);
  }

  apply(project) {
    const sprite = this.#sprite;
    if (!sprite) return;

    const { artwork } = project;
    const fit = ArtworkLayer.fitScale(sprite.texture);
    const scale = fit * artwork.scale;

    sprite.anchor.set(artwork.pivot.x, artwork.pivot.y);
    sprite.scale.set(artwork.flipH ? -scale : scale, artwork.flipV ? -scale : scale);
    sprite.rotation = artwork.rotation * DEG;
    sprite.alpha = artwork.opacity;

    // `z` es altura visual sobre el plano de la base: hacia arriba en pantalla.
    sprite.position.set(MODEL_CENTER + artwork.x, MODEL_CENTER + artwork.y - artwork.z);
  }

  /** Factor que hace que la textura, a escala 1, llene la altura del lienzo. */
  static fitScale(texture) {
    const h = texture?.height ?? 0;
    return h > 0 ? MODEL_SIZE / h : 1;
  }

  /**
   * Caja del sprite en coordenadas del modelo, para el bounding box del gizmo.
   * @returns {{x:number, y:number, width:number, height:number}|null}
   */
  getModelBounds(project) {
    const sprite = this.#sprite;
    if (!sprite) return null;

    const { artwork } = project;
    const fit = ArtworkLayer.fitScale(sprite.texture);
    const scale = fit * artwork.scale;
    const w = sprite.texture.width * scale;
    const h = sprite.texture.height * scale;

    return {
      x: MODEL_CENTER + artwork.x - w * artwork.pivot.x,
      y: MODEL_CENTER + artwork.y - artwork.z - h * artwork.pivot.y,
      width: w,
      height: h
    };
  }
}
