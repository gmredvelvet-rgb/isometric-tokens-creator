import { Layer } from "./Layer.js";
import { MODEL_SIZE, MODEL_CENTER } from "../../config/constants.js";
import { Logger } from "../../core/Logger.js";

const DEG = Math.PI / 180;

/**
 * Capa de la base (peana) sobre la que se apoya el personaje.
 *
 * === Anclaje por elipse de contacto ===
 *
 * La base NO se centra por su centro geométrico, sino por su **elipse de
 * contacto**: la zona donde la peana toca el suelo. Esto permite usar bases con
 * altura, borde decorativo o perspectiva propia sin que el token quede flotando
 * o hundido.
 *
 * El truco es sencillo: se fija el `anchor` del sprite en el centro normalizado
 * de la elipse y se coloca el sprite en el centro del lienzo. Así el punto de
 * contacto cae exactamente en el centro del PNG — que es lo que exige la regla
 * R2 del exportador.
 */
export class BaseLayer extends Layer {
  #sprite = null;
  #currentSrc = null;

  constructor() {
    super("base");
  }

  get sprite() {
    return this.#sprite;
  }

  /**
   * Sustituye la textura de la base.
   * @param {PIXI.Texture|null} texture
   * @param {string|null} src
   */
  setTexture(texture, src) {
    if (this.#sprite) {
      this.container.removeChild(this.#sprite);
      this.#sprite.destroy({ texture: false, baseTexture: false });
      this.#sprite = null;
    }
    this.#currentSrc = src;

    if (!texture) return;

    this.#sprite = new PIXI.Sprite(texture);
    this.#sprite.name = "itc-base-sprite";
    this.container.addChild(this.#sprite);
  }

  get currentSrc() {
    return this.#currentSrc;
  }

  apply(project, { ratio }) {
    const sprite = this.#sprite;
    if (!sprite) return;

    const { base } = project;
    const contact = BaseLayer.resolveContact(project.assets.base.contact, ratio);
    const tex = sprite.texture;

    // El ancla es el centro de la elipse, en coordenadas normalizadas de la
    // textura. Colocar el sprite en el centro del lienzo pone entonces el
    // punto de contacto justo donde debe estar.
    sprite.anchor.set(contact.cx, contact.cy);

    // Escala uniforme: las bases vienen ya dibujadas en perspectiva correcta,
    // deformarlas las estropearía. Se escala para que el ancho de la elipse
    // coincida con el ancho pedido.
    const ellipsePxWidth = 2 * contact.rx * tex.width;
    const targetWidth = MODEL_SIZE * base.scale;
    const scale = ellipsePxWidth > 0 ? targetWidth / ellipsePxWidth : 1;

    sprite.scale.set(scale, scale);
    sprite.rotation = base.rotation * DEG;
    sprite.alpha = base.opacity;
    sprite.visible = base.visible !== false;
    sprite.tint = base.tint ?? 0xffffff;

    // La elevación desplaza la base hacia arriba en pantalla.
    sprite.position.set(MODEL_CENTER, MODEL_CENTER - base.elevation);

    this.#verifyAspect(contact, tex, ratio);
  }

  /**
   * Elipse de contacto por defecto cuando la base no declara una.
   *
   * Asume una imagen cuadrada cuya elipse llena el ancho y respeta el aspecto
   * isométrico (`alto = ancho / ratio`).
   */
  static resolveContact(contact, ratio) {
    if (contact && Number.isFinite(contact.rx) && contact.rx > 0) return contact;
    return { cx: 0.5, cy: 0.5, rx: 0.5, ry: 0.5 / ratio };
  }

  /**
   * Aserción R3 sobre el propio asset: el aspecto de su elipse debe coincidir
   * con el `ratio` de la proyección. Avisa con el valor concreto en vez de
   * producir un token desalineado en silencio.
   */
  #verifyAspect(contact, tex, ratio) {
    if (!Logger.debugEnabled) return;
    const rxPx = contact.rx * tex.width;
    const ryPx = contact.ry * tex.height;
    if (ryPx <= 0) return;

    const actual = rxPx / ryPx;
    Logger.assert(
      Math.abs(actual - ratio) < 0.05,
      `R3: el aspecto de la elipse de la base es ${actual.toFixed(4)} pero la proyección exige ${ratio.toFixed(4)}`,
      { src: this.#currentSrc, contact }
    );
  }
}
