import { MODULE_ID, MODULE_TITLE, SETTINGS } from "../config/constants.js";

/**
 * Logger con prefijo consistente y modo debug conmutable desde ajustes.
 *
 * `debug()` y `assert()` sólo hacen algo cuando el ajuste `debug` está activo,
 * de modo que dejar aserciones en el código de producción no cuesta nada.
 */
class LoggerImpl {
  #debugEnabled = false;

  /** Se llama en `ready`, cuando los ajustes ya están registrados. */
  syncFromSettings() {
    try {
      this.#debugEnabled = game.settings.get(MODULE_ID, SETTINGS.DEBUG) === true;
    } catch {
      this.#debugEnabled = false;
    }
  }

  setDebug(value) {
    this.#debugEnabled = value === true;
  }

  get debugEnabled() {
    return this.#debugEnabled;
  }

  info(...args) {
    console.log(`${MODULE_TITLE} |`, ...args);
  }

  warn(...args) {
    console.warn(`${MODULE_TITLE} |`, ...args);
  }

  error(...args) {
    console.error(`${MODULE_TITLE} |`, ...args);
  }

  debug(...args) {
    if (this.#debugEnabled) console.debug(`${MODULE_TITLE} |`, ...args);
  }

  /**
   * Aserción no fatal. Informa del valor concreto que falló en lugar de
   * producir un resultado incorrecto en silencio.
   * @returns {boolean} `true` si la condición se cumple.
   */
  assert(condition, message, context = undefined) {
    if (condition) return true;
    if (this.#debugEnabled) {
      console.warn(`${MODULE_TITLE} | ASERCIÓN FALLIDA: ${message}`, context ?? "");
    }
    return false;
  }

  group(label) {
    if (this.#debugEnabled) console.group(`${MODULE_TITLE} | ${label}`);
  }

  groupEnd() {
    if (this.#debugEnabled) console.groupEnd();
  }
}

export const Logger = new LoggerImpl();
