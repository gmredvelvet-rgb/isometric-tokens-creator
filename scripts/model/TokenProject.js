import {
  DEFAULT_PROJECTION,
  PROJECTIONS,
  PROJECT_EXT,
  DEFAULT_VIDEO_FRAME
} from "../config/constants.js";
import { migrate, CURRENT_SCHEMA_VERSION } from "./schema.js";

/** Genera un id corto y único para el proyecto. */
function makeId() {
  return `itc-${foundry.utils.randomID(12)}`;
}

/**
 * Modelo del proyecto: datos puros, serializables, sin dependencias de PIXI
 * ni del DOM.
 *
 * Cerrar y reabrir el editor con el mismo proyecto debe producir un resultado
 * idéntico. Por eso aquí no vive ningún estado de interfaz (zoom, selección,
 * capas visibles): todo eso es efímero y pertenece a la vista.
 *
 * Los assets se guardan como *rutas*, no incrustados: un proyecto pesa ~2 KB
 * y no duplica ficheros que ya están en el servidor de Foundry.
 */
export class TokenProject {
  constructor(data = {}) {
    const d = foundry.utils.mergeObject(TokenProject.defaults(), data, {
      inplace: false,
      insertKeys: true,
      insertValues: true
    });

    this.schemaVersion = CURRENT_SCHEMA_VERSION;
    this.id = d.id ?? makeId();
    this.name = d.name;
    this.createdAt = d.createdAt ?? Date.now();
    this.updatedAt = d.updatedAt ?? Date.now();

    this.projection = d.projection;
    this.assets = d.assets;
    this.base = d.base;
    this.artwork = d.artwork;
    this.shadow = d.shadow;
    this.export = d.export;
    this.output = d.output;
  }

  static defaults() {
    return {
      id: null,
      name: "",
      createdAt: null,
      updatedAt: null,

      projection: {
        type: DEFAULT_PROJECTION,
        ratio: PROJECTIONS[DEFAULT_PROJECTION].ratio
      },

      assets: {
        artwork: {
          src: null,
          originalSize: { w: 0, h: 0 },
          /**
           * Si el origen es un vídeo, qué fotograma se usa (fracción 0..1 de
           * la duración). Se guarda en el proyecto: reabrirlo reproduce
           * exactamente el mismo fotograma.
           */
          isVideo: false,
          frameTime: DEFAULT_VIDEO_FRAME
        },
        base: { src: null, builtinId: null, contact: null }
      },

      /** La base: escala 1.0 = la elipse de contacto cubre el ancho del lienzo. */
      base: {
        scale: 1,
        rotation: 0,
        elevation: 0,
        opacity: 1,
        tint: null,
        visible: true
      },

      /**
       * El personaje. `x`/`y` en unidades del espacio canónico (1024),
       * `z` es altura visual sobre el plano de la base.
       */
      artwork: {
        x: 0,
        y: 0,
        z: 0,
        scale: 1,
        rotation: 0,
        opacity: 1,
        flipH: false,
        flipV: false,
        pivot: { x: 0.5, y: 1 }
      },

      shadow: {
        enabled: true,
        intensity: 0.7,
        blur: 8,
        offsetX: 6,
        offsetY: 4,
        color: 0x000000
      },

      export: {
        size: 1024,
        format: "png",
        padding: 0
      },

      output: {
        lastPath: null
      }
    };
  }

  /** Nombre de fichero sugerido, seguro para cualquier sistema de archivos. */
  get slug() {
    const base = (this.name || "token")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
    return base || "token";
  }

  get filename() {
    return `${this.slug}.${PROJECT_EXT}`;
  }

  /** ¿Hay lo mínimo para componer algo? */
  get hasArtwork() {
    return !!this.assets.artwork.src;
  }

  get hasBase() {
    return !!this.assets.base.src;
  }

  get isRenderable() {
    return this.hasArtwork || this.hasBase;
  }

  touch() {
    this.updatedAt = Date.now();
  }

  toJSON() {
    return {
      $schema: "itc-project/1",
      schemaVersion: this.schemaVersion,
      moduleVersion: game.modules.get("isometric-tokens-creator")?.version ?? "1.0.0",
      id: this.id,
      name: this.name,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
      projection: foundry.utils.deepClone(this.projection),
      assets: foundry.utils.deepClone(this.assets),
      base: foundry.utils.deepClone(this.base),
      artwork: foundry.utils.deepClone(this.artwork),
      shadow: foundry.utils.deepClone(this.shadow),
      export: foundry.utils.deepClone(this.export),
      output: foundry.utils.deepClone(this.output)
    };
  }

  /** Reconstruye desde JSON aplicando las migraciones necesarias. */
  static fromJSON(raw) {
    const migrated = migrate(raw);
    return new TokenProject(migrated);
  }

  clone() {
    const copy = TokenProject.fromJSON(this.toJSON());
    copy.id = makeId();
    copy.createdAt = Date.now();
    copy.updatedAt = Date.now();
    return copy;
  }
}
