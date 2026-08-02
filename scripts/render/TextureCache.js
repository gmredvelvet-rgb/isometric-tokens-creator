import { Logger } from "../core/Logger.js";
import { MAX_SOURCE_DIMENSION } from "../config/constants.js";

/**
 * Caché de texturas con recuento de referencias.
 *
 * El selector de bases y el viewport comparten la misma `PIXI.Texture`: una
 * base seleccionada no se carga dos veces. Las texturas sólo se destruyen
 * cuando su recuento llega a cero, lo que evita la fuga clásica de abrir y
 * cerrar el editor repetidamente.
 */
class TextureCacheImpl {
  /** @type {Map<string, {texture: PIXI.Texture, refs: number}>} */
  #entries = new Map();

  /** ObjectURLs creados por nosotros, para revocarlos al limpiar. */
  #objectUrls = new Set();

  /**
   * Carga (o reutiliza) una textura.
   * @param {string} src ruta de servidor o blob/object URL
   * @returns {Promise<PIXI.Texture>}
   */
  async get(src) {
    if (!src) throw new Error("TextureCache.get requiere una ruta");

    const existing = this.#entries.get(src);
    if (existing) {
      existing.refs += 1;
      return existing.texture;
    }

    const texture = await this.#load(src);
    this.#warnIfOversized(src, texture);
    this.#entries.set(src, { texture, refs: 1 });
    return texture;
  }

  /**
   * Registra una textura creada a partir de un `<canvas>` ya dibujado.
   *
   * Es la vía para los fotogramas de vídeo: la clave incluye el instante
   * capturado (`archivo.webm#t=0.25`), de modo que cambiar de fotograma
   * produce una entrada distinta y no pisa la anterior.
   *
   * @param {string} key clave de caché
   * @param {HTMLCanvasElement} canvas
   * @returns {PIXI.Texture}
   */
  fromCanvas(key, canvas) {
    const existing = this.#entries.get(key);
    if (existing) {
      existing.refs += 1;
      return existing.texture;
    }

    const texture = PIXI.Texture.from(canvas);
    this.#entries.set(key, { texture, refs: 1 });
    return texture;
  }

  /** Suelta una referencia; destruye la textura si era la última. */
  release(src) {
    const entry = this.#entries.get(src);
    if (!entry) return;

    entry.refs -= 1;
    if (entry.refs > 0) return;

    this.#entries.delete(src);
    try {
      entry.texture.destroy(true);
    } catch (err) {
      Logger.warn(`No se pudo destruir la textura ${src}`, err);
    }
    this.#revoke(src);
  }

  /** Registra un ObjectURL para que se revoque en `clear()`. */
  trackObjectUrl(url) {
    this.#objectUrls.add(url);
  }

  /** Libera todo. Se llama al cerrar el editor. */
  clear() {
    for (const [src, entry] of this.#entries) {
      try {
        entry.texture.destroy(true);
      } catch (err) {
        Logger.warn(`No se pudo destruir la textura ${src}`, err);
      }
    }
    this.#entries.clear();

    for (const url of this.#objectUrls) URL.revokeObjectURL(url);
    this.#objectUrls.clear();

    Logger.debug("TextureCache limpiada");
  }

  get size() {
    return this.#entries.size;
  }

  /** Diagnóstico: recuentos vivos. */
  get stats() {
    return [...this.#entries.entries()].map(([src, e]) => ({ src, refs: e.refs }));
  }

  async #load(src) {
    // PIXI.Assets es la vía recomendada en PIXI 7+; si falla (por ejemplo con
    // un blob: URL en algunas versiones) recurrimos a Texture.from.
    try {
      if (globalThis.PIXI?.Assets?.load) {
        const asset = await PIXI.Assets.load(src);
        if (asset instanceof PIXI.Texture) return asset;
        if (asset?.baseTexture) return new PIXI.Texture(asset.baseTexture);
      }
    } catch (err) {
      Logger.debug(`PIXI.Assets no pudo cargar ${src}; se usa Texture.from`, err);
    }

    const texture = PIXI.Texture.from(src);
    if (texture.baseTexture.valid) return texture;

    await new Promise((resolve, reject) => {
      texture.baseTexture.once("loaded", resolve);
      texture.baseTexture.once("error", () =>
        reject(new Error(`No se pudo cargar la imagen: ${src}`))
      );
    });
    return texture;
  }

  #revoke(src) {
    if (this.#objectUrls.has(src)) {
      URL.revokeObjectURL(src);
      this.#objectUrls.delete(src);
    }
  }

  #warnIfOversized(src, texture) {
    const { width, height } = texture;
    if (width > MAX_SOURCE_DIMENSION || height > MAX_SOURCE_DIMENSION) {
      Logger.warn(
        `La imagen ${src} mide ${width}×${height}, por encima del límite recomendado ` +
          `de ${MAX_SOURCE_DIMENSION}px. Puede afectar al rendimiento y a la memoria de vídeo.`
      );
    }
  }
}

export const TextureCache = new TextureCacheImpl();
