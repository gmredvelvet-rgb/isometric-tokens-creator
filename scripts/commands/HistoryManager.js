import { EVENTS } from "../config/constants.js";
import { Logger } from "../core/Logger.js";
import { MacroCommand } from "./Command.js";

/**
 * Pila de deshacer/rehacer con coalescencia y transacciones.
 *
 * Dos mecanismos evitan que el historial se sature durante un arrastre:
 *
 *  - **Coalescencia**: dos comandos consecutivos sobre la misma propiedad se
 *    fusionan en uno (`canMerge` / `merge`).
 *  - **Transacciones**: un gesto completo (pointerdown → pointerup) produce
 *    una única entrada, aunque toque varias propiedades a la vez.
 */
export class HistoryManager {
  #undoStack = [];
  #redoStack = [];
  #limit;
  #bus;

  /** Transacción abierta, si la hay. */
  #transaction = null;

  constructor(bus, { limit = 100 } = {}) {
    this.#bus = bus;
    this.#limit = limit;
  }

  get canUndo() {
    return this.#undoStack.length > 0;
  }

  get canRedo() {
    return this.#redoStack.length > 0;
  }

  get lastLabel() {
    return this.#undoStack.at(-1)?.label ?? null;
  }

  /**
   * Ejecuta un comando y lo registra.
   *
   * Dentro de una transacción, los comandos se acumulan y no llegan a la pila
   * hasta el `commit()`.
   */
  execute(command) {
    command.execute();

    if (this.#transaction) {
      const last = this.#transaction.commands.at(-1);
      if (last?.canMerge(command)) {
        last.merge(command);
      } else {
        this.#transaction.commands.push(command);
      }
      this.#emitChanged();
      return;
    }

    const last = this.#undoStack.at(-1);
    if (last?.canMerge(command)) {
      last.merge(command);
    } else {
      this.#undoStack.push(command);
      this.#trim();
    }

    // Cualquier acción nueva invalida la rama de rehacer.
    this.#redoStack.length = 0;
    this.#emitChanged();
  }

  /** Abre una transacción. Anidar transacciones no está permitido. */
  beginTransaction(label = "Edición") {
    if (this.#transaction) {
      Logger.warn(`Transacción "${label}" solicitada con "${this.#transaction.label}" abierta; se ignora.`);
      return;
    }
    this.#transaction = { label, commands: [] };
  }

  /** Cierra la transacción y la deja como una única entrada de historial. */
  commit() {
    const tx = this.#transaction;
    this.#transaction = null;
    if (!tx || tx.commands.length === 0) return;

    const entry =
      tx.commands.length === 1 ? tx.commands[0] : new MacroCommand(tx.commands, tx.label);

    this.#undoStack.push(entry);
    this.#trim();
    this.#redoStack.length = 0;
    this.#emitChanged();
  }

  /** Cancela la transacción revirtiendo todo lo hecho durante el gesto. */
  rollback() {
    const tx = this.#transaction;
    this.#transaction = null;
    if (!tx) return;
    for (let i = tx.commands.length - 1; i >= 0; i--) tx.commands[i].undo();
    this.#emitChanged();
  }

  get inTransaction() {
    return this.#transaction !== null;
  }

  undo() {
    if (this.#transaction) this.rollback();
    const command = this.#undoStack.pop();
    if (!command) return false;
    command.undo();
    this.#redoStack.push(command);
    this.#emitChanged();
    return true;
  }

  redo() {
    const command = this.#redoStack.pop();
    if (!command) return false;
    command.execute();
    this.#undoStack.push(command);
    this.#emitChanged();
    return true;
  }

  clear() {
    this.#undoStack.length = 0;
    this.#redoStack.length = 0;
    this.#transaction = null;
    this.#emitChanged();
  }

  #trim() {
    while (this.#undoStack.length > this.#limit) this.#undoStack.shift();
  }

  #emitChanged() {
    this.#bus.emit(EVENTS.HISTORY_CHANGED, {
      canUndo: this.canUndo,
      canRedo: this.canRedo,
      label: this.lastLabel
    });
  }
}
