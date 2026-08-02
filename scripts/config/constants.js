/**
 * Constantes globales del módulo.
 *
 * Nada aquí depende de Foundry estando cargado: este fichero puede importarse
 * desde cualquier capa, incluida la capa 0.
 */

export const MODULE_ID = "isometric-tokens-creator";
export const MODULE_TITLE = "Isometric Token Creator";

/** Módulo isométrico con el que mantenemos compatibilidad estricta. */
export const ISO_PERSPECTIVE_ID = "isometric-perspective";

/**
 * Espacio de coordenadas canónico del modelo.
 *
 * Todo el estado del proyecto vive en este espacio, con el origen en el centro.
 * Es independiente del zoom del viewport y de la resolución de exportación:
 * cambiar `export.size` sólo escala el render final, nunca el modelo.
 */
export const MODEL_SIZE = 1024;
export const MODEL_CENTER = MODEL_SIZE / 2;

/** Tamaños de exportación ofrecidos en la interfaz. */
export const EXPORT_SIZES = [512, 1024, 2048];

/** Extensiones de imagen estática aceptadas al importar. */
export const ACCEPTED_IMAGE_EXT = ["png", "webp", "jpg", "jpeg", "gif"];

/**
 * Formatos de vídeo aceptados como *origen*.
 *
 * WebM es el formato habitual de los tokens animados en Foundry (JB2A y
 * similares), y admite canal alfa real con VP8/VP9. El editor extrae un
 * fotograma y trabaja con él: la salida sigue siendo un PNG estático.
 */
export const ACCEPTED_VIDEO_EXT = ["webm", "mp4", "m4v", "ogv"];

/** Todo lo que se puede soltar en el editor. */
export const ACCEPTED_SOURCE_EXT = [...ACCEPTED_IMAGE_EXT, ...ACCEPTED_VIDEO_EXT];

export const ACCEPTED_MIME = [
  "image/png",
  "image/webp",
  "image/jpeg",
  "image/gif",
  "video/webm",
  "video/mp4",
  "video/ogg",
  "video/x-m4v"
];

/**
 * Momento por defecto al capturar un fotograma de vídeo, como fracción de la
 * duración.
 *
 * No se usa 0: muchos vídeos de efectos empiezan en negro o completamente
 * transparentes, y el primer fotograma sería inservible.
 */
export const DEFAULT_VIDEO_FRAME = 0.25;

/** Extensión de los ficheros de proyecto. */
export const PROJECT_EXT = "itcproj";

/**
 * Proyecciones soportadas.
 *
 * Espejo de `PROJECTION_TYPES` de isometric-perspective. Sólo necesitamos
 * `ratio` para componer, pero guardamos los ángulos para poder reproducir la
 * transformación real del canvas en la vista previa "Vista en Foundry".
 *
 * `ratio` = diagonal horizontal / diagonal vertical del rombo de una celda.
 */
export const PROJECTIONS = {
  "True Isometric": { rotation: -30, skewX: 30, skewY: 0, ratio: Math.sqrt(3) },
  "Dimetric (2:1)": { rotation: -45, skewX: 18.435, skewY: 18.435, ratio: 2 },
  "Overhead (√2:1)": { rotation: -45, skewX: 9.735607, skewY: 9.735607, ratio: Math.SQRT2 },
  "Projection (3:2)": { rotation: -45, skewX: 11.3101, skewY: 11.3101, ratio: 1.5 },
  "Game: Diablo 1": { rotation: -30, skewX: 34, skewY: 4, ratio: 2.0503038415792987 },
  "Game: Planescape Torment": { rotation: -35, skewX: 20, skewY: 0, ratio: 1.428148006742114 }
};

export const DEFAULT_PROJECTION = "True Isometric";

/**
 * Contra-rotación que isometric-perspective aplica al mesh del token
 * (`transform.js`: `mesh.rotation = reverseRotation`). Es 45° para todas las
 * proyecciones de la tabla, y es lo que hace que la composición
 * stage × mesh sea una escala pura alineada a los ejes.
 */
export const REVERSE_ROTATION_DEG = 45;

/** Máscaras de invalidación de render. */
export const DIRTY = {
  NONE: 0,
  ARTWORK_TRANSFORM: 1 << 0,
  ARTWORK_TEXTURE: 1 << 1,
  BASE_TRANSFORM: 1 << 2,
  BASE_TEXTURE: 1 << 3,
  SHADOW: 1 << 4,
  GRID: 1 << 5,
  OVERLAY: 1 << 6,
  CAMERA: 1 << 7,
  ALL: 0xff
};

/** Nombres de eventos del bus. Centralizados para evitar erratas. */
export const EVENTS = {
  MODEL_CHANGED: "model:changed",
  MODEL_REPLACED: "model:replaced",
  HISTORY_CHANGED: "history:changed",
  SELECTION_CHANGED: "selection:changed",
  VIEWPORT_CAMERA: "viewport:camera",
  VIEWPORT_GRID_TOGGLE: "viewport:gridToggle",
  ASSET_BASE_LOADED: "asset:baseLoaded",
  ASSET_ARTWORK_LOADED: "asset:artworkLoaded",
  EXPORT_PROGRESS: "export:progress",
  EXPORT_DONE: "export:done",
  ERROR: "error"
};

/** Hooks públicos que emitimos para terceros. */
export const HOOKS = {
  EDITOR_READY: `${MODULE_ID}.editorReady`,
  PROJECT_CHANGED: `${MODULE_ID}.projectChanged`,
  BEFORE_EXPORT: `${MODULE_ID}.beforeExport`,
  AFTER_EXPORT: `${MODULE_ID}.afterExport`,
  BEFORE_APPLY_TOKEN: `${MODULE_ID}.beforeApplyToken`,
  BASE_LIBRARY_LOADED: `${MODULE_ID}.baseLibraryLoaded`
};

/** Claves de ajustes. */
export const SETTINGS = {
  EXPORT_FOLDER: "exportFolder",
  PROJECT_FOLDER: "projectFolder",
  DEFAULT_EXPORT_SIZE: "defaultExportSize",
  DEFAULT_FORMAT: "defaultFormat",
  USER_BASES: "userBases",
  SNAP_ENABLED: "snapEnabled",
  SNAP_STEP: "snapStep",
  SHOW_GRID: "showGrid",
  HISTORY_LIMIT: "historyLimit",
  AUTO_APPLY_FLAGS: "autoApplyFlags",
  AUTO_SIZE_FROM_ACTOR: "autoSizeFromActor",
  DEBUG: "debug",
  /**
   * Lo escribe el cliente del GM cuando Patreon verifica la suscripción, y lo
   * lee todo el mundo: así los jugadores nunca hablan con el servidor de
   * licencias. No gatea nada — ver scripts/license/.
   */
  WORLD_LICENSED: "worldLicensed",
  LICENSE_MENU: "licenseMenu"
};

/** Límite defensivo para no reventar la VRAM con imágenes gigantes. */
export const MAX_SOURCE_DIMENSION = 4096;
