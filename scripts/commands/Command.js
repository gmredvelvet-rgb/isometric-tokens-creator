/**
 * Clase base de todos los comandos.
 *
 * Toda mutación del modelo pasa por aquí, lo que hace que deshacer/rehacer sea
 * completo por construcción en lugar de algo que haya que recordar implementar
 * caso por caso.
 */
export class Command {
  /** Etiqueta legible, mostrada en la interfaz de historial. */
  get label() {
    return this.constructor.name;
  }

  execute() {
    throw new Error(`${this.constructor.name} debe implementar execute()`);
  }

  undo() {
    throw new Error(`${this.constructor.name} debe implementar undo()`);
  }

  /**
   * ¿Puede este comando absorber `other`?
   *
   * Es lo que evita que arrastrar un gizmo genere 200 entradas de deshacer.
   */
  canMerge(_other) {
    return false;
  }

  merge(_other) {
    throw new Error(`${this.constructor.name} declara canMerge pero no implementa merge()`);
  }
}

/**
 * Cambia una propiedad del modelo por su ruta.
 *
 * Es el comando de propósito general: lo usan los sliders, los inputs y los
 * gizmos. Se fusiona con otros cambios a la *misma* ruta, conservando siempre
 * el valor inicial del gesto para que un solo Ctrl+Z lo revierta entero.
 */
export class SetPropertyCommand extends Command {
  #store;
  #path;
  #newValue;
  #oldValue;
  #label;

  constructor(store, path, newValue, label = null) {
    super();
    this.#store = store;
    this.#path = path;
    this.#newValue = newValue;
    this.#oldValue = undefined;
    this.#label = label;
  }

  get path() {
    return this.#path;
  }

  get label() {
    return this.#label ?? `Cambiar ${this.#path}`;
  }

  execute() {
    // El valor anterior se captura en la primera ejecución, no en el
    // constructor: así un comando encolado refleja el estado real del momento.
    if (this.#oldValue === undefined) this.#oldValue = this.#store.get(this.#path);
    this.#store.set(this.#path, this.#newValue);
  }

  undo() {
    this.#store.set(this.#path, this.#oldValue);
  }

  canMerge(other) {
    return other instanceof SetPropertyCommand && other.path === this.#path;
  }

  merge(other) {
    // Se adopta el valor nuevo pero se conserva el antiguo original.
    this.#newValue = other.#newValue;
    this.#store.set(this.#path, this.#newValue);
  }
}

/**
 * Agrupa varios comandos en una sola entrada de historial.
 *
 * Se usa para operaciones compuestas: reset de transformación, autofit,
 * exportación por lotes.
 */
export class MacroCommand extends Command {
  #commands;
  #label;

  constructor(commands, label = "Operación múltiple") {
    super();
    this.#commands = commands;
    this.#label = label;
  }

  get label() {
    return this.#label;
  }

  execute() {
    for (const cmd of this.#commands) cmd.execute();
  }

  undo() {
    // En orden inverso: cada comando revierte sobre el estado que dejó el
    // siguiente.
    for (let i = this.#commands.length - 1; i >= 0; i--) this.#commands[i].undo();
  }
}
