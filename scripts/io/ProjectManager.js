import { MODULE_ID, SETTINGS, PROJECT_EXT } from "../config/constants.js";
import { getSetting } from "../config/settings.js";
import { Logger } from "../core/Logger.js";
import { TokenProject } from "../model/TokenProject.js";
import { validate } from "../model/schema.js";
import { FileUploader } from "../export/FileUploader.js";
import { FilePickerService } from "./FilePickerService.js";

const DRAFT_KEY = `${MODULE_ID}.draft`;

/**
 * Avisa si los assets referenciados ya no son utilizables.
 *
 * Los `blob:` URL sólo viven mientras dura la sesión que los creó: un proyecto
 * guardado tras importar desde el escritorio los tendrá muertos al reabrirse.
 * Debe decirlo al abrir, no fallar en silencio al renderizar.
 */
function verifyAssets(project) {
  const missing = [];
  for (const [key, asset] of Object.entries(project.assets)) {
    if (asset?.src?.startsWith("blob:")) missing.push(key);
  }

  if (missing.length === 0) return;

  ui.notifications.warn(
    game.i18n.format("ITC.Notify.MissingAssets", { assets: missing.join(", ") })
  );
  for (const key of missing) project.assets[key].src = null;
}

/**
 * Guardado, apertura y autoguardado de proyectos.
 *
 * Los proyectos guardan *rutas*, no imágenes incrustadas: pesan ~2 KB y no
 * duplican ficheros que ya están en el servidor.
 */
export const ProjectManager = {
  get folder() {
    return getSetting(SETTINGS.PROJECT_FOLDER, `worlds/${game.world.id}/itc-projects`);
  },

  /**
   * Guarda el proyecto como fichero `.itcproj`.
   * @returns {Promise<string>} ruta del fichero
   */
  async save(project) {
    project.touch();
    const json = JSON.stringify(project.toJSON(), null, 2);
    const blob = new Blob([json], { type: "application/json" });

    const path = await FileUploader.upload(blob, project.filename, { path: this.folder });
    ui.notifications.info(game.i18n.format("ITC.Notify.ProjectSaved", { name: project.name }));
    return path;
  },

  /** Abre un proyecto desde una ruta del servidor. */
  async open(path) {
    const raw = await FileUploader.readJSON(path);
    return this.fromRaw(raw);
  },

  /** Construye un proyecto validando y migrando el documento. */
  fromRaw(raw) {
    const check = validate(raw);
    if (!check.ok) throw new Error(check.error);

    const project = TokenProject.fromJSON(raw);
    verifyAssets(project);
    return project;
  },

  /** Diálogo de apertura usando el FilePicker nativo. */
  async openWithPicker() {
    const path = await FilePickerService.pickProject({ current: this.folder });
    if (!path) return null;

    if (!FilePickerService.isProjectFile(path)) {
      ui.notifications.warn(game.i18n.localize("ITC.Notify.NotAProject"));
      return null;
    }
    return this.open(path);
  },

  /** Lista los proyectos guardados en la carpeta configurada. */
  async list() {
    return FileUploader.listFiles(this.folder, { extension: PROJECT_EXT });
  },

  // --- Borrador automático -------------------------------------------------

  /**
   * Guarda un borrador en localStorage para sobrevivir a un refresco
   * accidental del navegador. No sustituye al guardado explícito.
   */
  saveDraft(project) {
    try {
      localStorage.setItem(DRAFT_KEY, JSON.stringify(project.toJSON()));
    } catch (err) {
      Logger.debug("No se pudo guardar el borrador", err);
    }
  },

  loadDraft() {
    try {
      const raw = localStorage.getItem(DRAFT_KEY);
      if (!raw) return null;
      return this.fromRaw(JSON.parse(raw));
    } catch (err) {
      Logger.debug("No se pudo recuperar el borrador", err);
      return null;
    }
  },

  clearDraft() {
    try {
      localStorage.removeItem(DRAFT_KEY);
    } catch {
      /* sin consecuencias */
    }
  },

  hasDraft() {
    try {
      return localStorage.getItem(DRAFT_KEY) !== null;
    } catch {
      return false;
    }
  }
};
