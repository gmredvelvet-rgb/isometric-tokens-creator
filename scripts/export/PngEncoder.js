import { Logger } from "../core/Logger.js";

/**
 * Renderiza un contenedor PIXI a un PNG/WebP transparente.
 *
 * === Adaptador PIXI 7 / 8 ===
 *
 * `renderer.extract.canvas()` es **síncrono** en PIXI 7 y devuelve una
 * **Promise** en PIXI 8. Aquí se normaliza con `await`, que funciona en ambos
 * casos (esperar un valor no-Promise lo devuelve tal cual), de modo que el
 * módulo no depende de qué versión traiga la instalación de Foundry.
 */
/**
 * Extrae el canvas del RenderTexture.
 *
 * PIXI 7 devuelve el canvas directamente; PIXI 8 devuelve una Promise.
 * `await` sirve para ambos, así que el módulo no depende de la versión que
 * traiga la instalación de Foundry.
 */
async function extractCanvas(renderer, renderTexture) {
  const extract = renderer.extract;
  if (!extract) throw new Error("El renderer de PIXI no expone `extract`.");

  const result = await extract.canvas(renderTexture);
  if (!result) throw new Error("La extracción del canvas devolvió un valor vacío.");
  return result;
}

async function extractPixels(renderer, renderTexture) {
  try {
    return await renderer.extract.pixels(renderTexture);
  } catch (err) {
    Logger.debug("No se pudieron extraer los píxeles", err);
    return null;
  }
}

function toBlob(canvas, format) {
  const mime = format === "webp" ? "image/webp" : "image/png";

  return new Promise((resolve, reject) => {
    // `extract.canvas` puede devolver un ICanvas (OffscreenCanvas) según la
    // versión: soportamos ambas rutas.
    if (typeof canvas.toBlob === "function") {
      canvas.toBlob((blob) => {
        if (blob) resolve(blob);
        else reject(new Error("toBlob() no produjo ningún dato."));
      }, mime);
      return;
    }

    if (typeof canvas.convertToBlob === "function") {
      canvas.convertToBlob({ type: mime }).then(resolve).catch(reject);
      return;
    }

    reject(new Error("El canvas extraído no soporta toBlob() ni convertToBlob()."));
  });
}

export const PngEncoder = {
  /**
   * @param {PIXI.Renderer} renderer
   * @param {PIXI.Container} container ya escalado al tamaño de salida
   * @param {number} size lado del lienzo en píxeles
   * @param {"png"|"webp"} format
   * @returns {Promise<Blob>}
   */
  async encode(renderer, container, size, format = "png") {
    const renderTexture = PIXI.RenderTexture.create({
      width: size,
      height: size,
      resolution: 1
    });

    try {
      // `clear: true` deja el fondo en rgba(0,0,0,0): es la garantía de
      // transparencia del exportador.
      renderer.render(container, { renderTexture, clear: true });

      const canvas = await extractCanvas(renderer, renderTexture);
      return await toBlob(canvas, format);
    } finally {
      renderTexture.destroy(true);
    }
  },

  /** Devuelve además los píxeles crudos, para las pruebas de transparencia. */
  async encodeWithPixels(renderer, container, size, format = "png") {
    const renderTexture = PIXI.RenderTexture.create({ width: size, height: size, resolution: 1 });
    try {
      renderer.render(container, { renderTexture, clear: true });
      const canvas = await extractCanvas(renderer, renderTexture);
      const pixels = await extractPixels(renderer, renderTexture);
      const blob = await toBlob(canvas, format);
      return { blob, pixels };
    } finally {
      renderTexture.destroy(true);
    }
  },

  /**
   * Comprueba que una imagen es totalmente transparente.
   * Se usa en la verificación de la exportación en vacío.
   */
  isFullyTransparent(pixels) {
    if (!pixels) return null;
    for (let i = 3; i < pixels.length; i += 4) {
      if (pixels[i] !== 0) return false;
    }
    return true;
  }
};
