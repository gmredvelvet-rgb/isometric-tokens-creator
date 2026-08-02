import { Layer } from "./Layer.js";
import { MODEL_CENTER } from "../../config/constants.js";
import { ArtworkLayer } from "./ArtworkLayer.js";
import { ShadowFilterFactory } from "../../render/ShadowFilterFactory.js";

const DEG = Math.PI / 180;

/**
 * Sombra proyectada del personaje sobre el plano de la base.
 *
 * Comparte la textura del personaje (no la duplica en memoria) y la aplasta
 * verticalmente por `1 / ratio` para tumbarla sobre el plano isométrico del
 * suelo. El ancla es el pivote del personaje — sus pies — de modo que la
 * sombra nace exactamente donde el personaje toca el suelo.
 *
 * A diferencia de la rejilla y los gizmos, la sombra **sí** forma parte de la
 * exportación: es arte del token, no ayuda visual.
 */
export class ShadowLayer extends Layer {
  #sprite = null;
  #blurFilter = null;

  constructor() {
    super("shadow");
  }

  setTexture(texture) {
    if (this.#sprite) {
      this.container.removeChild(this.#sprite);
      this.#sprite.destroy({ texture: false, baseTexture: false });
      this.#sprite = null;
    }

    if (!texture) return;

    this.#sprite = new PIXI.Sprite(texture);
    this.#sprite.name = "itc-shadow-sprite";
    this.container.addChild(this.#sprite);
  }

  apply(project, { ratio }) {
    const sprite = this.#sprite;
    if (!sprite) return;

    const { shadow, artwork } = project;

    sprite.visible = shadow.enabled;
    if (!shadow.enabled) {
      // Quitar el filtro cuando está oculta evita pagar el coste del blur.
      sprite.filters = null;
      return;
    }

    const fit = ArtworkLayer.fitScale(sprite.texture);
    const scale = fit * artwork.scale;

    sprite.anchor.set(artwork.pivot.x, artwork.pivot.y);
    sprite.tint = shadow.color ?? 0x000000;
    sprite.alpha = shadow.intensity;

    // Aplastado vertical: tumba la silueta sobre el plano del suelo.
    sprite.scale.set(artwork.flipH ? -scale : scale, scale / ratio);
    sprite.rotation = 0;

    // Inclinación en función del desplazamiento horizontal de la luz.
    sprite.skew.set(-shadow.offsetX * 0.01, 0);

    sprite.position.set(
      MODEL_CENTER + artwork.x + shadow.offsetX,
      MODEL_CENTER + artwork.y + shadow.offsetY
    );

    this.#applyBlur(shadow.blur);
  }

  #applyBlur(blur) {
    const sprite = this.#sprite;
    if (blur <= 0) {
      sprite.filters = null;
      this.#blurFilter = null;
      return;
    }

    if (!this.#blurFilter) {
      this.#blurFilter = ShadowFilterFactory.createBlur(blur);
      sprite.filters = [this.#blurFilter];
    } else {
      ShadowFilterFactory.updateBlur(this.#blurFilter, blur);
    }
  }

  destroy() {
    this.#blurFilter = null;
    super.destroy();
  }
}
