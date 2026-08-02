import { ACCEPTED_VIDEO_EXT, DEFAULT_VIDEO_FRAME } from "../config/constants.js";
import { Logger } from "../core/Logger.js";

/**
 * Extracción de fotogramas de vídeo para usarlos como textura.
 *
 * Vive en la capa de render, no en la de IO: es un origen de textura, y tanto
 * el grafo de escena como el importador necesitan resolverlo. Ponerlo en `io`
 * obligaría a la capa de canvas a importar hacia arriba.
 *
 * WebM es el formato habitual de los tokens animados de Foundry (JB2A y
 * similares) y admite canal alfa real con VP8/VP9, que se conserva al dibujar
 * el fotograma en un canvas.
 */

/**
 * Elementos `<video>` ya cargados, indexados por origen.
 *
 * Buscar otro fotograma es barato si el vídeo sigue en memoria: sin esta
 * caché, mover el selector de fotograma volvería a descargar el archivo
 * entero en cada movimiento.
 */
const videoCache = new Map();

/** Carga un vídeo y espera a tener datos suficientes para pintar. */
function loadVideo(src) {
  const cached = videoCache.get(src);
  if (cached) return Promise.resolve(cached);

  return new Promise((resolve, reject) => {
    const video = document.createElement("video");
    video.crossOrigin = "anonymous";
    video.muted = true;
    video.playsInline = true;
    video.preload = "auto";

    video.onloadeddata = () => {
      videoCache.set(src, video);
      resolve(video);
    };
    video.onerror = () => reject(new Error(`No se pudo cargar el vídeo: ${src}`));
    video.src = src;
  });
}

/** Sitúa el vídeo en un instante y espera a que el fotograma esté disponible. */
function seekTo(video, time) {
  return new Promise((resolve, reject) => {
    // Si ya estamos ahí no habrá evento `seeked` que esperar, y quedaríamos
    // colgados.
    if (Math.abs(video.currentTime - time) < 0.001 && video.readyState >= 2) {
      resolve(video);
      return;
    }

    const cleanup = () => {
      video.removeEventListener("seeked", onSeeked);
      video.removeEventListener("error", onError);
    };
    const onSeeked = () => {
      cleanup();
      resolve(video);
    };
    const onError = () => {
      cleanup();
      reject(new Error("Fallo al buscar el fotograma del vídeo."));
    };

    video.addEventListener("seeked", onSeeked);
    video.addEventListener("error", onError);
    video.currentTime = time;
  });
}

export const VideoFrameExtractor = {
  /** ¿La ruta apunta a un vídeo en lugar de a una imagen? */
  isVideo(src) {
    if (typeof src !== "string" || !src) return false;
    const clean = src.split("?")[0].toLowerCase();
    return ACCEPTED_VIDEO_EXT.some((ext) => clean.endsWith(`.${ext}`));
  },

  /** Dimensiones y duración, sin construir ninguna textura. */
  async probe(src) {
    const video = await loadVideo(src);
    return {
      width: video.videoWidth,
      height: video.videoHeight,
      duration: video.duration,
      isVideo: true
    };
  },

  /**
   * Extrae un fotograma como `<canvas>`.
   *
   * Se devuelve un canvas y no una URL porque PIXI acepta un canvas como
   * origen de textura directamente: así no queda ningún ObjectURL que revocar.
   *
   * @param {string} src
   * @param {number} fraction posición 0..1 dentro de la duración
   * @returns {Promise<HTMLCanvasElement>}
   */
  async captureFrame(src, fraction = DEFAULT_VIDEO_FRAME) {
    const video = await loadVideo(src);

    const duration = Number.isFinite(video.duration) ? video.duration : 0;
    const clamped = Math.max(0, Math.min(1, fraction));
    // Un pelo antes del final: en el último instante exacto algunos códecs
    // devuelven un fotograma vacío.
    const time = Math.min(duration * clamped, Math.max(0, duration - 0.05));

    await seekTo(video, time);

    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;

    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(video, 0, 0);

    return canvas;
  },

  /** Clave de caché de textura para un fotograma concreto. */
  cacheKey(src, fraction) {
    return `${src}#t=${fraction}`;
  },

  /** Libera los vídeos cacheados. Se llama al cerrar el editor. */
  clear() {
    for (const video of videoCache.values()) {
      try {
        video.src = "";
        video.load();
      } catch (err) {
        Logger.debug("No se pudo liberar un vídeo cacheado", err);
      }
    }
    videoCache.clear();
  }
};
