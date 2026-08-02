import { MODULE_ID, SETTINGS, HOOKS, ACCEPTED_IMAGE_EXT } from "../config/constants.js";
import { getSetting, setSetting } from "../config/settings.js";
import { Logger } from "../core/Logger.js";
import { ImageImporter } from "../io/ImageImporter.js";
import { FileUploader } from "../export/FileUploader.js";

/** Categorías por defecto, usadas si el manifiesto no existe o está vacío. */
const DEFAULT_CATEGORIES = [
  { id: "stone", label: "ITC.BaseCat.Stone", icon: "fa-cube" },
  { id: "wood", label: "ITC.BaseCat.Wood", icon: "fa-tree" },
  { id: "snow", label: "ITC.BaseCat.Snow", icon: "fa-snowflake" },
  { id: "lava", label: "ITC.BaseCat.Lava", icon: "fa-fire" },
  { id: "sand", label: "ITC.BaseCat.Sand", icon: "fa-hourglass" },
  { id: "metal", label: "ITC.BaseCat.Metal", icon: "fa-shield-halved" },
  { id: "custom", label: "ITC.BaseCat.Custom", icon: "fa-star" }
];

/** Nombre legible a partir del nombre de fichero. */
function labelFromPath(src) {
  const file = decodeURIComponent(src.split("/").pop() ?? "");
  return file
    .replace(/\.[^.]+$/, "")
    .replace(/[-_]+/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function isImage(path) {
  const clean = path.split("?")[0].toLowerCase();
  return ACCEPTED_IMAGE_EXT.some((ext) => clean.endsWith(`.${ext}`));
}

/**
 * Catálogo de bases (peanas).
 *
 * Dos fuentes que se combinan:
 *   - el manifiesto del módulo (`assets/bases/bases.json`), que se sobrescribe
 *     en cada actualización,
 *   - las bases importadas por el usuario, guardadas en ajustes de mundo.
 *
 * Se mantienen separadas a propósito: actualizar el módulo nunca debe borrar
 * el trabajo del usuario.
 */
class BaseLibraryImpl {
  #builtin = [];
  #categories = [];
  #loaded = false;

  get loaded() {
    return this.#loaded;
  }

  get categories() {
    return this.#categories;
  }

  /** Todas las bases disponibles, del módulo y del usuario. */
  get all() {
    return [...this.#builtin, ...this.userBases];
  }

  get userBases() {
    return getSetting(SETTINGS.USER_BASES, []) ?? [];
  }

  /** Raíz de las bases incluidas con el módulo. */
  get rootPath() {
    return `modules/${MODULE_ID}/assets/bases`;
  }

  /**
   * Carga la biblioteca. Se llama en `ready`, no en `init`.
   *
   * Dos fuentes, en este orden:
   *   1. `bases.json` — bases declaradas, con su punto de contacto exacto.
   *   2. escaneo de las carpetas de categoría — cualquier PNG que dejes ahí
   *      aparece en el selector sin tocar ningún fichero de configuración.
   *
   * El escaneo es lo que permite ampliar la biblioteca copiando archivos.
   */
  async load() {
    await this.#loadManifest();
    await this.#scanFolders();

    this.#loaded = true;
    Logger.info(
      `Biblioteca de bases: ${this.#builtin.length} incluida(s), ` +
        `${this.userBases.length} de usuario, ${this.#categories.length} categoría(s).`
    );
    Hooks.callAll(HOOKS.BASE_LIBRARY_LOADED, this);
  }

  async #loadManifest() {
    const manifestPath = `${this.rootPath}/bases.json`;

    try {
      const response = await fetch(manifestPath);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);

      const data = await response.json();
      this.#categories = data.categories?.length ? data.categories : DEFAULT_CATEGORIES;
      this.#builtin = (data.bases ?? []).map((b) => ({
        ...b,
        src: this.#absolute(b.src),
        thumb: b.thumb ? this.#absolute(b.thumb) : null,
        builtin: true
      }));
    } catch (err) {
      // No es fatal: el escaneo de carpetas puede encontrar bases igualmente.
      Logger.debug(`No se pudo leer ${manifestPath}; se usarán las categorías por defecto.`, err);
      this.#categories = DEFAULT_CATEGORIES;
      this.#builtin = [];
    }
  }

  /**
   * Descubre imágenes sueltas en `assets/bases/<categoría>/`.
   *
   * No se decodifica ninguna imagen aquí: el punto de contacto se calcula la
   * primera vez que se selecciona la base (`ensureContact`), para no penalizar
   * el arranque del mundo.
   */
  async #scanFolders() {
    const known = new Set(this.#builtin.map((b) => b.src));

    for (const category of this.#categories) {
      const folder = `${this.rootPath}/${category.id}`;
      const files = await FileUploader.listFiles(folder);

      for (const file of files) {
        if (!isImage(file) || known.has(file)) continue;

        this.#builtin.push({
          id: `auto-${category.id}-${file.split("/").pop().replace(/\W+/g, "-")}`,
          category: category.id,
          label: labelFromPath(file),
          src: file,
          thumb: file,
          // Sin contacto declarado: se estimará al seleccionarla.
          contact: null,
          builtin: true,
          discovered: true
        });
        known.add(file);
      }
    }
  }

  #absolute(src) {
    return src.startsWith("modules/") ? src : `modules/${MODULE_ID}/${src}`;
  }

  /**
   * Garantiza que la base tiene punto de contacto, estimándolo si hace falta.
   *
   * Se llama justo antes de usar la base, no al cargar la biblioteca: sólo se
   * decodifican las imágenes que el usuario llega a elegir.
   */
  async ensureContact(base, ratio) {
    if (base.contact?.rx > 0) return base.contact;

    const contact = await this.estimateContact(base.src, ratio);
    base.contact = contact;

    // Persistir la estimación si es una base de usuario, para no repetirla.
    if (!base.builtin) await this.updateUserBase(base.id, { contact });
    return contact;
  }

  getById(id) {
    return this.all.find((b) => b.id === id) ?? null;
  }

  getByCategory(categoryId) {
    if (!categoryId || categoryId === "all") return this.all;
    return this.all.filter((b) => b.category === categoryId);
  }

  /**
   * Registra una base importada por el usuario.
   *
   * Si no se indica el punto de contacto, se estima desde el recuadro alfa:
   * la mayoría de peanas ocupan todo el ancho de su imagen y su elipse queda
   * en la mitad inferior.
   */
  async addUserBase({ src, label = null, category = "custom", contact = null, ratio }) {
    const estimated = contact ?? (await this.estimateContact(src, ratio));

    const base = {
      id: `user-${foundry.utils.randomID(8)}`,
      category,
      label: label ?? decodeURIComponent(src.split("/").pop() ?? "Base"),
      src,
      thumb: src,
      contact: estimated,
      ratio,
      builtin: false
    };

    const bases = [...this.userBases, base];
    await setSetting(SETTINGS.USER_BASES, bases);
    Logger.info(`Base de usuario añadida: ${base.label}`);
    return base;
  }

  async removeUserBase(id) {
    const bases = this.userBases.filter((b) => b.id !== id);
    await setSetting(SETTINGS.USER_BASES, bases);
  }

  async updateUserBase(id, patch) {
    const bases = this.userBases.map((b) => (b.id === id ? { ...b, ...patch } : b));
    await setSetting(SETTINGS.USER_BASES, bases);
  }

  /**
   * Estima la elipse de contacto de una imagen de base.
   *
   * Heurística: la elipse se inscribe en el recuadro alfa, centrada
   * horizontalmente, y su semieje vertical se deriva del `ratio` para que
   * cumpla la regla R3 desde el principio. El usuario puede afinarla después.
   */
  async estimateContact(src, ratio) {
    const bounds = await ImageImporter.getAlphaBounds(src);
    const fallback = { cx: 0.5, cy: 0.5, rx: 0.5, ry: 0.5 / ratio };
    if (!bounds) return fallback;

    const rx = bounds.width / 2;
    const cx = bounds.x + rx;

    // El contacto suele estar en la parte baja del recuadro visible: se sitúa
    // a dos tercios de su altura, que es donde cae la elipse en la mayoría de
    // peanas dibujadas en perspectiva.
    const cy = bounds.y + bounds.height * 0.66;

    return { cx, cy, rx, ry: rx / ratio };
  }
}

export const BaseLibrary = new BaseLibraryImpl();
