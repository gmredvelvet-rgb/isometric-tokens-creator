import { ACCEPTED_SOURCE_EXT, PROJECT_EXT } from "../config/constants.js";

/** Namespace de v13, con respaldo al global por si acaso. */
function PickerClass() {
  return foundry.applications?.apps?.FilePicker?.implementation ?? globalThis.FilePicker;
}

/**
 * Envoltorio del FilePicker nativo de Foundry.
 *
 * Siempre el explorador nativo: nunca construimos uno propio. El usuario
 * conserva sus favoritos, sus permisos y su navegación habitual.
 */
export const FilePickerService = {
  /**
   * Abre el selector de imágenes.
   * @returns {Promise<string|null>} ruta elegida, o null si se cancela
   */
  pickImage({ current = "", title = null } = {}) {
    return new Promise((resolve) => {
      const FP = PickerClass();
      const fp = new FP({
        // `imagevideo` incluye los WebM y MP4, que el editor acepta como
        // origen extrayendo un fotograma.
        type: "imagevideo",
        current,
        title: title ?? game.i18n.localize("ITC.Picker.SelectImage"),
        callback: (path) => resolve(path),
        // ApplicationV2 no siempre llama al callback al cerrar sin elegir.
        close: () => resolve(null)
      });
      fp.render(true);
    });
  },

  /** Abre el selector para ficheros de proyecto. */
  pickProject({ current = "" } = {}) {
    return new Promise((resolve) => {
      const FP = PickerClass();
      const fp = new FP({
        type: "any",
        current,
        title: game.i18n.localize("ITC.Picker.OpenProject"),
        callback: (path) => resolve(path),
        close: () => resolve(null)
      });
      fp.render(true);
    });
  },

  /** Selector de carpeta, para los ajustes de rutas. */
  pickFolder({ current = "" } = {}) {
    return new Promise((resolve) => {
      const FP = PickerClass();
      const fp = new FP({
        type: "folder",
        current,
        callback: (path) => resolve(path),
        close: () => resolve(null)
      });
      fp.render(true);
    });
  },

  /** ¿La ruta apunta a un origen aceptado (imagen o vídeo)? */
  isAcceptedImage(path) {
    if (!path) return false;
    const clean = path.split("?")[0].toLowerCase();
    return ACCEPTED_SOURCE_EXT.some((ext) => clean.endsWith(`.${ext}`));
  },

  isProjectFile(path) {
    return typeof path === "string" && path.toLowerCase().endsWith(`.${PROJECT_EXT}`);
  }
};
