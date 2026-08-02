import { MODEL_SIZE } from "../config/constants.js";
import { Logger } from "../core/Logger.js";
import { TextureCache } from "../render/TextureCache.js";
import { VideoFrameExtractor } from "../render/VideoFrameExtractor.js";
import { CheckerLayer } from "./layers/CheckerLayer.js";
import { IsoGridLayer } from "./layers/IsoGridLayer.js";
import { ShadowLayer } from "./layers/ShadowLayer.js";
import { BaseLayer } from "./layers/BaseLayer.js";
import { ArtworkLayer } from "./layers/ArtworkLayer.js";
import { OverlayLayer } from "./layers/OverlayLayer.js";

/**
 * Jerarquía de contenedores del editor.
 *
 * ```
 * stage
 * └── viewportRoot            ← la cámara aplica pan/zoom aquí
 *     ├── checker             (excluido de la exportación)
 *     ├── grid                (excluido)
 *     ├── compositionRoot     ◀── ESTO es lo que se exporta
 *     │   ├── shadow
 *     │   ├── base
 *     │   └── artwork
 *     └── overlay             (bbox, handles, gizmo — excluido)
 * ```
 *
 * `compositionRoot` es un contenedor real y aislado, y el exportador renderiza
 * **ese mismo nodo**. No existe una segunda ruta de código que reconstruya la
 * composición, así que no puede divergir de lo que el usuario ve.
 */
export class SceneGraph {
  /** @type {PIXI.Container} */
  viewportRoot;
  /** @type {PIXI.Container} */
  compositionRoot;

  layers;

  #ratio = Math.sqrt(3);

  constructor(stage) {
    this.viewportRoot = new PIXI.Container();
    this.viewportRoot.name = "itc-viewport-root";
    stage.addChild(this.viewportRoot);

    this.compositionRoot = new PIXI.Container();
    this.compositionRoot.name = "itc-composition-root";

    this.layers = {
      checker: new CheckerLayer(),
      grid: new IsoGridLayer(),
      shadow: new ShadowLayer(),
      base: new BaseLayer(),
      artwork: new ArtworkLayer(),
      overlay: new OverlayLayer()
    };

    // Orden Z explícito. El personaje siempre por encima de la base.
    this.compositionRoot.addChild(
      this.layers.shadow.container,
      this.layers.base.container,
      this.layers.artwork.container
    );

    this.viewportRoot.addChild(
      this.layers.checker.container,
      this.layers.grid.container,
      this.compositionRoot,
      this.layers.overlay.container
    );
  }

  get ratio() {
    return this.#ratio;
  }

  set ratio(value) {
    this.#ratio = value;
  }

  get modelSize() {
    return MODEL_SIZE;
  }

  /**
   * Carga la textura de la base y la asigna a su capa.
   * Libera la anterior por recuento de referencias.
   */
  async loadBaseTexture(src) {
    const previous = this.layers.base.currentSrc;
    if (previous === src) return;

    let texture = null;
    if (src) {
      try {
        texture = await TextureCache.get(src);
      } catch (err) {
        Logger.error(`No se pudo cargar la base: ${src}`, err);
        return;
      }
    }

    this.layers.base.setTexture(texture, src);
    if (previous) TextureCache.release(previous);
  }

  /**
   * Carga la textura del personaje. La sombra comparte la misma textura, así
   * que se toma una referencia adicional para que el recuento sea correcto.
   *
   * Si el origen es un vídeo (WebM, MP4…), se extrae el fotograma indicado y
   * se usa ése como textura. La clave de caché incluye el instante, de modo
   * que mover el selector de fotograma no invalida los demás.
   *
   * @param {string|null} src
   * @param {number} frameTime posición 0..1 dentro del vídeo (se ignora en imágenes)
   */
  async loadArtworkTexture(src, frameTime = 0) {
    const isVideo = VideoFrameExtractor.isVideo(src);
    const key = isVideo ? VideoFrameExtractor.cacheKey(src, frameTime) : src;

    const previous = this.layers.artwork.currentSrc;
    if (previous === key) return;

    let texture = null;
    if (src) {
      try {
        if (isVideo) {
          const canvas = await VideoFrameExtractor.captureFrame(src, frameTime);
          texture = TextureCache.fromCanvas(key, canvas);
        } else {
          texture = await TextureCache.get(src);
        }
      } catch (err) {
        Logger.error(`No se pudo cargar el personaje: ${src}`, err);
        return;
      }
    }

    this.layers.artwork.setTexture(texture, key);
    this.layers.shadow.setTexture(texture);

    if (previous) TextureCache.release(previous);
  }

  /**
   * Aplica el estado del modelo a las capas afectadas.
   *
   * @param {import("../model/TokenProject.js").TokenProject} project
   * @param {string[]|null} changedPaths rutas cambiadas; `null` = todo
   */
  applyState(project, changedPaths = null) {
    const context = { ratio: this.#ratio };
    const all = changedPaths === null;

    const touched = (prefix) =>
      all || changedPaths.some((p) => p === prefix || p.startsWith(`${prefix}.`));

    // La rejilla depende de la escala de la base (dibuja la elipse guía).
    if (all || touched("base") || touched("projection")) {
      this.layers.grid.apply(project, context);
      this.layers.base.apply(project, context);
    }

    if (all || touched("artwork")) {
      this.layers.artwork.apply(project, context);
      // La sombra sigue al personaje: hay que recalcularla aunque sólo haya
      // cambiado la posición del arte.
      this.layers.shadow.apply(project, context);
    }

    if (all || touched("shadow")) {
      this.layers.shadow.apply(project, context);
    }

    if (all || touched("artwork") || touched("base")) {
      this.layers.overlay.apply(project, {
        ...context,
        artworkBounds: this.layers.artwork.getModelBounds(project)
      });
    }
  }

  /** Alterna la visibilidad de las ayudas visuales (no exportables). */
  setGridVisible(visible) {
    this.layers.grid.visible = visible;
  }

  setOverlayVisible(visible) {
    this.layers.overlay.visible = visible;
  }

  setCheckerVisible(visible) {
    this.layers.checker.visible = visible;
  }

  destroy() {
    for (const layer of Object.values(this.layers)) {
      try {
        layer.destroy();
      } catch (err) {
        Logger.warn(`Error al destruir la capa ${layer.name}`, err);
      }
    }
    this.layers = null;

    this.compositionRoot?.destroy({ children: true, texture: false, baseTexture: false });
    this.viewportRoot?.destroy({ children: true, texture: false, baseTexture: false });
    this.compositionRoot = null;
    this.viewportRoot = null;
  }
}
