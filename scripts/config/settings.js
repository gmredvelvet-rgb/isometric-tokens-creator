import { MODULE_ID, SETTINGS, EXPORT_SIZES } from "./constants.js";
import { Logger } from "../core/Logger.js";

/**
 * Registro de ajustes. Se llama en el hook `init`.
 *
 * Nada del módulo lee valores hardcodeados: rutas, tamaños, precisión y
 * comportamiento salen todos de aquí.
 */
export function registerSettings() {
  const worldId = game.world?.id ?? "world";

  game.settings.register(MODULE_ID, SETTINGS.EXPORT_FOLDER, {
    name: "ITC.Settings.ExportFolder.Name",
    hint: "ITC.Settings.ExportFolder.Hint",
    scope: "world",
    config: true,
    type: String,
    default: `worlds/${worldId}/isometric-tokens`
  });

  game.settings.register(MODULE_ID, SETTINGS.PROJECT_FOLDER, {
    name: "ITC.Settings.ProjectFolder.Name",
    hint: "ITC.Settings.ProjectFolder.Hint",
    scope: "world",
    config: true,
    type: String,
    default: `worlds/${worldId}/itc-projects`
  });

  game.settings.register(MODULE_ID, SETTINGS.DEFAULT_EXPORT_SIZE, {
    name: "ITC.Settings.ExportSize.Name",
    hint: "ITC.Settings.ExportSize.Hint",
    scope: "world",
    config: true,
    type: Number,
    default: 1024,
    choices: Object.fromEntries(EXPORT_SIZES.map((s) => [s, `${s} × ${s}`]))
  });

  game.settings.register(MODULE_ID, SETTINGS.DEFAULT_FORMAT, {
    name: "ITC.Settings.Format.Name",
    hint: "ITC.Settings.Format.Hint",
    scope: "world",
    config: true,
    type: String,
    default: "png",
    choices: { png: "PNG (transparente)", webp: "WebP (transparente)" }
  });

  game.settings.register(MODULE_ID, SETTINGS.AUTO_APPLY_FLAGS, {
    name: "ITC.Settings.AutoFlags.Name",
    hint: "ITC.Settings.AutoFlags.Hint",
    scope: "world",
    config: true,
    type: Boolean,
    default: true
  });

  game.settings.register(MODULE_ID, SETTINGS.AUTO_SIZE_FROM_ACTOR, {
    name: "ITC.Settings.AutoSize.Name",
    hint: "ITC.Settings.AutoSize.Hint",
    scope: "world",
    config: true,
    type: Boolean,
    default: true
  });

  // --- Bases importadas por el usuario ------------------------------------
  // Se guardan aparte del manifiesto del módulo, que se sobrescribe en cada
  // actualización.
  game.settings.register(MODULE_ID, SETTINGS.USER_BASES, {
    scope: "world",
    config: false,
    type: Array,
    default: []
  });

  // --- Preferencias de cliente --------------------------------------------

  game.settings.register(MODULE_ID, SETTINGS.SNAP_ENABLED, {
    name: "ITC.Settings.Snap.Name",
    scope: "client",
    config: true,
    type: Boolean,
    default: true
  });

  game.settings.register(MODULE_ID, SETTINGS.SNAP_STEP, {
    name: "ITC.Settings.SnapStep.Name",
    hint: "ITC.Settings.SnapStep.Hint",
    scope: "client",
    config: true,
    type: Number,
    default: 8,
    range: { min: 1, max: 64, step: 1 }
  });

  game.settings.register(MODULE_ID, SETTINGS.SHOW_GRID, {
    scope: "client",
    config: false,
    type: Boolean,
    default: true
  });

  game.settings.register(MODULE_ID, SETTINGS.HISTORY_LIMIT, {
    name: "ITC.Settings.HistoryLimit.Name",
    hint: "ITC.Settings.HistoryLimit.Hint",
    scope: "client",
    config: true,
    type: Number,
    default: 100,
    range: { min: 20, max: 500, step: 10 }
  });

  game.settings.register(MODULE_ID, SETTINGS.DEBUG, {
    name: "ITC.Settings.Debug.Name",
    hint: "ITC.Settings.Debug.Hint",
    scope: "client",
    config: true,
    type: Boolean,
    default: false,
    onChange: (value) => Logger.setDebug(value)
  });

  // Lo escribe el cliente del GM tras verificar Patreon y lo leen los demás,
  // para que ningún jugador tenga que contactar con el servidor de licencias.
  // `config: false` a propósito: no es un interruptor, es un hecho.
  game.settings.register(MODULE_ID, SETTINGS.WORLD_LICENSED, {
    scope: "world",
    config: false,
    type: Boolean,
    default: false
  });

  // La entrada de menú de la licencia la registra la propia capa `license`
  // (registerLicenseMenu, llamada desde main.js): hacerlo aquí obligaría a
  // `config` —nivel 0— a importar de `license`, y eso invierte la regla de
  // capas que verify-architecture.js hace cumplir.
}

/** Lectura tolerante: nunca lanza si el ajuste aún no está registrado. */
export function getSetting(key, fallback = undefined) {
  try {
    return game.settings.get(MODULE_ID, key);
  } catch {
    return fallback;
  }
}

export async function setSetting(key, value) {
  return game.settings.set(MODULE_ID, key, value);
}
