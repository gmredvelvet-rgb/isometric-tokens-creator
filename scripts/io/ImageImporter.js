import { ACCEPTED_MIME, MAX_SOURCE_DIMENSION, DEFAULT_VIDEO_FRAME } from "../config/constants.js";
import { Logger } from "../core/Logger.js";
import { TextureCache } from "../render/TextureCache.js";
import { VideoFrameExtractor } from "../render/VideoFrameExtractor.js";

/** Carga una imagen del DOM, con CORS permisivo para orígenes externos. */
function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`No se pudo cargar: ${src}`));
    img.src = src;
  });
}

function warnOversized(name, width, height) {
  if (width > MAX_SOURCE_DIMENSION || height > MAX_SOURCE_DIMENSION) {
    Logger.warn(
      `"${name}" mide ${width}×${height}px. Por encima de ${MAX_SOURCE_DIMENSION}px ` +
        `el rendimiento del editor puede resentirse.`
    );
  }
}

/**
 * Normaliza cualquier origen de imagen a algo que PIXI pueda cargar.
 *
 * Orígenes soportados:
 *   - `File` del sistema operativo (arrastrar desde el escritorio)
 *   - ruta del servidor de Foundry (FilePicker, compendios, fichas)
 *   - URL externa (arrastrar desde una web)
 */
export const ImageImporter = {
  /** ¿La ruta apunta a un vídeo (WebM, MP4…) en lugar de una imagen? */
  isVideo(src) {
    return VideoFrameExtractor.isVideo(src);
  },

  /**
   * @param {File} file
   * @returns {Promise<{src: string, width: number, height: number, name: string, isVideo: boolean, duration?: number}>}
   */
  async fromFile(file) {
    if (!ACCEPTED_MIME.includes(file.type)) {
      throw new Error(
        `Formato no soportado: ${file.type || "desconocido"}. ` +
          `Se aceptan PNG, WebP, JPG, GIF y WebM.`
      );
    }

    const url = URL.createObjectURL(file);
    TextureCache.trackObjectUrl(url);

    try {
      const info = file.type.startsWith("video/")
        ? await this.probeVideo(url)
        : await this.probe(url);
      warnOversized(file.name, info.width, info.height);
      return { src: url, ...info, name: file.name };
    } catch (err) {
      URL.revokeObjectURL(url);
      throw err;
    }
  },

  /**
   * @param {string} path ruta de servidor o URL
   */
  async fromPath(path) {
    const info = this.isVideo(path) ? await this.probeVideo(path) : await this.probe(path);
    const name = decodeURIComponent(path.split("/").pop() ?? "imagen");
    warnOversized(name, info.width, info.height);
    return { src: path, ...info, name };
  },

  /**
   * Resuelve datos de arrastre de Foundry (Actor, Item, Tile, JournalEntry…).
   * @returns {Promise<object|null>}
   */
  async fromFoundryDragData(data) {
    // Documento arrastrado desde el sidebar o un compendio.
    if (data?.uuid) {
      const doc = await fromUuid(data.uuid);
      const src = doc?.prototypeToken?.texture?.src || doc?.img || doc?.texture?.src;
      if (src) return this.fromPath(src);
    }

    // Algunos módulos incluyen la ruta directamente.
    const direct = data?.src ?? data?.img ?? data?.texture?.src;
    if (direct) return this.fromPath(direct);

    return null;
  },

  /** Lee las dimensiones sin construir una textura de PIXI. */
  probe(src) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = () =>
        resolve({ width: img.naturalWidth, height: img.naturalHeight, isVideo: false });
      img.onerror = () => reject(new Error(`No se pudo cargar la imagen: ${src}`));
      img.src = src;
    });
  },

  /** Dimensiones y duración de un vídeo. */
  probeVideo(src) {
    return VideoFrameExtractor.probe(src);
  },

  /**
   * Devuelve algo dibujable en un canvas 2D a partir de cualquier origen.
   * Unifica imágenes y vídeos para el análisis de alfa.
   */
  async resolveDrawable(src, frameTime = DEFAULT_VIDEO_FRAME) {
    if (this.isVideo(src)) return VideoFrameExtractor.captureFrame(src, frameTime);
    return loadImage(src);
  },

  /**
   * Recuadro alfa real de la imagen, normalizado (0..1).
   *
   * Lo usan el AutoFit (para apoyar los pies del personaje en el suelo, no el
   * borde transparente del PNG) y la estimación del punto de contacto de las
   * bases importadas.
   *
   * @returns {Promise<{x:number,y:number,width:number,height:number}|null>}
   */
  async getAlphaBounds(
    src,
    { threshold = 8, sampleSize = 256, frameTime = DEFAULT_VIDEO_FRAME } = {}
  ) {
    try {
      // Imagen o fotograma de vídeo: ambos son dibujables en un canvas 2D.
      const img = await this.resolveDrawable(src, frameTime);
      const srcW = img.naturalWidth ?? img.width;
      const srcH = img.naturalHeight ?? img.height;

      // Se muestrea a baja resolución: para encajar el arte no hace falta
      // precisión de píxel, y así una imagen 4K no bloquea el hilo.
      const scale = Math.min(1, sampleSize / Math.max(srcW, srcH));
      const w = Math.max(1, Math.round(srcW * scale));
      const h = Math.max(1, Math.round(srcH * scale));

      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      ctx.drawImage(img, 0, 0, w, h);

      const { data } = ctx.getImageData(0, 0, w, h);

      let minX = w;
      let minY = h;
      let maxX = -1;
      let maxY = -1;

      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          if (data[(y * w + x) * 4 + 3] > threshold) {
            if (x < minX) minX = x;
            if (x > maxX) maxX = x;
            if (y < minY) minY = y;
            if (y > maxY) maxY = y;
          }
        }
      }

      if (maxX < 0) return null; // imagen completamente transparente

      return {
        x: minX / w,
        y: minY / h,
        width: (maxX - minX + 1) / w,
        height: (maxY - minY + 1) / h
      };
    } catch (err) {
      // Una imagen de otro dominio "contamina" el canvas y getImageData lanza.
      Logger.debug(`No se pudo analizar el alfa de ${src}`, err);
      return null;
    }
  }
};
