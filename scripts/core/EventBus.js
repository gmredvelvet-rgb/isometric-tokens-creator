import { Logger } from "./Logger.js";

/**
 * Bus de eventos síncrono.
 *
 * Es el único mecanismo de comunicación ascendente entre capas: una capa
 * inferior nunca importa una superior, sólo emite. Un handler que lanza no
 * impide que los demás se ejecuten.
 */
export class EventBus {
  /** @type {Map<string, Set<Function>>} */
  #handlers = new Map();

  /**
   * Suscribe un handler.
   * @returns {() => void} función para cancelar la suscripción.
   */
  on(event, handler, { once = false } = {}) {
    if (typeof handler !== "function") throw new TypeError("handler debe ser una función");

    const wrapped = once
      ? (...args) => {
          this.off(event, wrapped);
          handler(...args);
        }
      : handler;

    if (!this.#handlers.has(event)) this.#handlers.set(event, new Set());
    this.#handlers.get(event).add(wrapped);

    return () => this.off(event, wrapped);
  }

  once(event, handler) {
    return this.on(event, handler, { once: true });
  }

  off(event, handler) {
    const set = this.#handlers.get(event);
    if (!set) return;
    set.delete(handler);
    if (set.size === 0) this.#handlers.delete(event);
  }

  emit(event, payload) {
    const set = this.#handlers.get(event);
    if (!set?.size) return;

    // Copia defensiva: un handler puede desuscribirse durante la emisión.
    for (const handler of [...set]) {
      try {
        handler(payload);
      } catch (err) {
        Logger.error(`Handler de "${event}" lanzó una excepción`, err);
      }
    }
  }

  /** Elimina todas las suscripciones. Se usa al destruir el editor. */
  clear() {
    this.#handlers.clear();
  }

  get eventNames() {
    return [...this.#handlers.keys()];
  }
}
