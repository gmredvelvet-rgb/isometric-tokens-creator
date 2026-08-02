import { Logger } from "../core/Logger.js";
import { ImageImporter } from "./ImageImporter.js";
import { FilePickerService } from "./FilePickerService.js";

/**
 * Zona de arrastre y suelta.
 *
 * Acepta las tres procedencias que un usuario de Foundry espera:
 *   1. ficheros del sistema operativo,
 *   2. documentos de Foundry (sidebar, compendio, ficha de actor),
 *   3. imágenes arrastradas desde una página web.
 *
 * El caso (3) puede producir un canvas "contaminado" por CORS, lo que impide
 * exportar. Se detecta al analizar el alfa y se avisa entonces, no al final
 * del flujo cuando el usuario ya ha invertido trabajo.
 */
export class DropHandler {
  #element;
  #onImage;
  #onProject;
  #bound = {};
  #depth = 0;

  /**
   * @param {HTMLElement} element
   * @param {(result: object) => void} onImage
   * @param {(path: string) => void} [onProject]
   */
  constructor(element, onImage, onProject = null) {
    this.#element = element;
    this.#onImage = onImage;
    this.#onProject = onProject;
  }

  attach() {
    this.#bound.enter = (e) => this.#onDragEnter(e);
    this.#bound.over = (e) => this.#onDragOver(e);
    this.#bound.leave = (e) => this.#onDragLeave(e);
    this.#bound.drop = (e) => this.#onDrop(e);

    this.#element.addEventListener("dragenter", this.#bound.enter);
    this.#element.addEventListener("dragover", this.#bound.over);
    this.#element.addEventListener("dragleave", this.#bound.leave);
    this.#element.addEventListener("drop", this.#bound.drop);
  }

  detach() {
    this.#element?.removeEventListener("dragenter", this.#bound.enter);
    this.#element?.removeEventListener("dragover", this.#bound.over);
    this.#element?.removeEventListener("dragleave", this.#bound.leave);
    this.#element?.removeEventListener("drop", this.#bound.drop);
    this.#bound = {};
  }

  #onDragEnter(event) {
    event.preventDefault();
    // Contador de profundidad: entrar en un hijo dispara dragleave en el
    // padre, y sin esto el resaltado parpadea.
    this.#depth += 1;
    this.#element.classList.add("itc-drop-active");
  }

  #onDragOver(event) {
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
  }

  #onDragLeave(event) {
    event.preventDefault();
    this.#depth = Math.max(0, this.#depth - 1);
    if (this.#depth === 0) this.#element.classList.remove("itc-drop-active");
  }

  async #onDrop(event) {
    event.preventDefault();
    event.stopPropagation();
    this.#depth = 0;
    this.#element.classList.remove("itc-drop-active");

    try {
      const result = await this.#resolve(event);
      if (result) this.#onImage(result);
    } catch (err) {
      Logger.error("Error al procesar el elemento arrastrado", err);
      ui.notifications.error(err.message ?? "No se pudo importar la imagen.");
    }
  }

  async #resolve(event) {
    const dt = event.dataTransfer;

    // 1. Fichero del sistema operativo.
    const file = dt.files?.[0];
    if (file) {
      if (FilePickerService.isProjectFile(file.name) && this.#onProject) {
        const text = await file.text();
        this.#onProject(JSON.parse(text));
        return null;
      }
      return ImageImporter.fromFile(file);
    }

    // 2. Documento de Foundry.
    const raw = dt.getData("text/plain");
    if (raw) {
      let parsed = null;
      try {
        parsed = JSON.parse(raw);
      } catch {
        // No era JSON: puede ser una URL suelta.
      }

      if (parsed) {
        const fromDoc = await ImageImporter.fromFoundryDragData(parsed);
        if (fromDoc) return fromDoc;
      }

      // 3. URL externa.
      if (/^https?:\/\//i.test(raw.trim())) {
        return ImageImporter.fromPath(raw.trim());
      }
    }

    // Algunos navegadores exponen la imagen arrastrada como text/uri-list.
    const uri = dt.getData("text/uri-list");
    if (uri) return ImageImporter.fromPath(uri.trim());

    throw new Error("No se reconoció el elemento arrastrado como una imagen.");
  }
}
