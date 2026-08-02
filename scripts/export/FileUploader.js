import { Logger } from "../core/Logger.js";

/** Acceso al FilePicker con el namespace de v13 y respaldo al global. */
function picker() {
  return foundry.applications?.apps?.FilePicker?.implementation ?? globalThis.FilePicker;
}

/**
 * Subida de ficheros al servidor de Foundry.
 *
 * Usa siempre el FilePicker nativo: no implementamos un explorador propio ni
 * tocamos rutas a mano.
 */
export const FileUploader = {
  /** Origen por defecto; en Forge y S3 puede diferir. */
  get defaultSource() {
    if (typeof ForgeVTT !== "undefined" && ForgeVTT?.usingTheForge) return "forgevtt";
    return "data";
  },

  /** ¿Puede este usuario subir ficheros? */
  get canUpload() {
    return game.user?.can("FILES_UPLOAD") === true;
  },

  /**
   * Crea una ruta de carpetas completa, segmento a segmento.
   * `createDirectory` falla si el padre no existe, así que se recorre entera.
   */
  async ensureDirectory(path, source = this.defaultSource) {
    const FP = picker();
    const segments = path.split("/").filter(Boolean);
    let current = "";

    for (const segment of segments) {
      current = current ? `${current}/${segment}` : segment;
      try {
        await FP.browse(source, current);
      } catch {
        try {
          await FP.createDirectory(source, current);
          Logger.debug(`Carpeta creada: ${current}`);
        } catch (err) {
          // Otro proceso puede haberla creado entre el browse y el create.
          const message = String(err?.message ?? err);
          if (!message.includes("EEXIST") && !message.toLowerCase().includes("exists")) {
            Logger.warn(`No se pudo crear la carpeta ${current}`, err);
          }
        }
      }
    }
    return current;
  },

  /**
   * Sube un Blob.
   * @returns {Promise<string>} ruta del fichero en el servidor
   */
  async upload(blob, filename, { path, source = this.defaultSource } = {}) {
    if (!this.canUpload) {
      throw new Error("No tienes permiso para subir ficheros a este servidor.");
    }

    await this.ensureDirectory(path, source);

    const file = new File([blob], filename, { type: blob.type });
    const response = await picker().upload(source, path, file, {}, { notify: false });

    if (!response?.path) {
      throw new Error(`La subida de ${filename} falló sin devolver una ruta.`);
    }

    Logger.info(`Fichero subido: ${response.path}`);
    return response.path;
  },

  /** Descarga local, para usuarios sin permiso de subida. */
  downloadLocal(blob, filename) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    // Retraso corto: revocar de inmediato aborta la descarga en algunos
    // navegadores.
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  },

  /** Lee un fichero JSON del servidor. */
  async readJSON(path) {
    const response = await fetch(path);
    if (!response.ok) throw new Error(`No se pudo leer ${path} (HTTP ${response.status})`);
    return response.json();
  },

  /** Lista ficheros de una carpeta filtrando por extensión. */
  async listFiles(path, { source = this.defaultSource, extension = null } = {}) {
    try {
      const result = await picker().browse(source, path);
      const files = result?.files ?? [];
      if (!extension) return files;
      const suffix = `.${extension.toLowerCase()}`;
      return files.filter((f) => f.toLowerCase().endsWith(suffix));
    } catch (err) {
      Logger.debug(`No se pudo listar ${path}`, err);
      return [];
    }
  }
};
