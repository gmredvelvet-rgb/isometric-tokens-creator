/**
 * Control numérico reutilizable: deslizador + campo + botones `±`.
 *
 * Es el widget más repetido de la interfaz, así que se implementa como Custom
 * Element para que las plantillas Handlebars lo declaren en una línea:
 *
 * ```html
 * <itc-number label="Escala" path="artwork.scale"
 *             min="10" max="400" step="1" unit="%"
 *             precision="0" factor="100"></itc-number>
 * ```
 *
 * `factor` permite mostrar 0..1 del modelo como 0..100 % en pantalla sin que
 * el modelo tenga que saber nada de porcentajes.
 *
 * Emite:
 *   - `itc-input`  en cada movimiento  → el editor fusiona en la transacción
 *   - `itc-change` al soltar           → el editor cierra la transacción
 *
 * Esa distinción es lo que hace que arrastrar un deslizador produzca una sola
 * entrada de deshacer.
 */
export class NumericSlider extends HTMLElement {
  static TAG = "itc-number";

  #range = null;
  #input = null;
  #value = 0;
  #dragging = false;

  static register() {
    if (!customElements.get(NumericSlider.TAG)) {
      customElements.define(NumericSlider.TAG, NumericSlider);
    }
  }

  // --- Atributos ----------------------------------------------------------

  get path() {
    return this.getAttribute("path");
  }
  get min() {
    return Number.parseFloat(this.getAttribute("min") ?? "0");
  }
  get max() {
    return Number.parseFloat(this.getAttribute("max") ?? "100");
  }
  get step() {
    return Number.parseFloat(this.getAttribute("step") ?? "1");
  }
  get precision() {
    return Number.parseInt(this.getAttribute("precision") ?? "0", 10);
  }
  /** Multiplicador modelo → interfaz (p. ej. 100 para mostrar porcentajes). */
  get factor() {
    return Number.parseFloat(this.getAttribute("factor") ?? "1");
  }
  get unit() {
    return this.getAttribute("unit") ?? "";
  }
  get label() {
    return this.getAttribute("label") ?? "";
  }
  get hasSlider() {
    return this.getAttribute("slider") !== "false";
  }

  connectedCallback() {
    if (this.#input) return; // ya construido
    this.#build();
  }

  /** Valor del modelo (sin `factor` aplicado). */
  get value() {
    return this.#value;
  }

  /** Actualiza el control desde el modelo, sin emitir eventos. */
  setValue(modelValue, { silent = true } = {}) {
    this.#value = modelValue;
    const display = this.#toDisplay(modelValue);
    if (this.#input && document.activeElement !== this.#input) {
      this.#input.value = display;
    }
    if (this.#range && !this.#dragging) {
      this.#range.value = display;
    }
    if (!silent) this.#emit("itc-change");
  }

  #build() {
    this.classList.add("itc-number");

    const labelEl = document.createElement("label");
    labelEl.className = "itc-number__label";
    labelEl.textContent = this.label;

    const row = document.createElement("div");
    row.className = "itc-number__row";

    if (this.hasSlider) {
      this.#range = document.createElement("input");
      this.#range.type = "range";
      this.#range.className = "itc-number__range";
      this.#range.min = String(this.min);
      this.#range.max = String(this.max);
      this.#range.step = String(this.step);
      row.appendChild(this.#range);
    }

    const spin = document.createElement("div");
    spin.className = "itc-number__spin";

    const minus = this.#makeButton("−", -1);
    this.#input = document.createElement("input");
    this.#input.type = "number";
    this.#input.className = "itc-number__input";
    this.#input.step = String(this.step);
    const plus = this.#makeButton("+", 1);

    spin.append(minus, this.#input, plus);
    if (this.unit) {
      const unitEl = document.createElement("span");
      unitEl.className = "itc-number__unit";
      unitEl.textContent = this.unit;
      spin.appendChild(unitEl);
    }

    row.appendChild(spin);
    this.append(labelEl, row);

    this.#wire();
  }

  #makeButton(text, direction) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "itc-number__btn";
    btn.textContent = text;
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      // Shift multiplica el paso por 10, Alt lo divide: convención habitual
      // en editores gráficos.
      let step = this.step;
      if (e.shiftKey) step *= 10;
      if (e.altKey) step /= 10;
      this.#commitDisplay(this.#toDisplay(this.#value) + direction * step, { final: true });
    });
    return btn;
  }

  #wire() {
    if (this.#range) {
      this.#range.addEventListener("pointerdown", () => {
        this.#dragging = true;
      });
      this.#range.addEventListener("input", () => {
        this.#commitDisplay(Number.parseFloat(this.#range.value), { final: false });
      });
      this.#range.addEventListener("change", () => {
        this.#dragging = false;
        this.#commitDisplay(Number.parseFloat(this.#range.value), { final: true });
      });
    }

    this.#input.addEventListener("change", () => {
      const parsed = Number.parseFloat(this.#input.value);
      if (Number.isNaN(parsed)) {
        this.#input.value = this.#toDisplay(this.#value);
        return;
      }
      this.#commitDisplay(parsed, { final: true });
    });

    this.#input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") this.#input.blur();
    });

    // Doble clic en la etiqueta → restablecer el valor por defecto.
    this.querySelector(".itc-number__label")?.addEventListener("dblclick", () => {
      this.dispatchEvent(
        new CustomEvent("itc-reset", { bubbles: true, detail: { path: this.path } })
      );
    });
  }

  #commitDisplay(displayValue, { final }) {
    const clamped = Math.min(this.max, Math.max(this.min, displayValue));
    const rounded = this.#round(clamped);

    this.#value = rounded / this.factor;

    if (this.#input && document.activeElement !== this.#input) {
      this.#input.value = String(rounded);
    }
    if (this.#range && !this.#dragging) this.#range.value = String(rounded);
    if (this.#range && this.#dragging) this.#input.value = String(rounded);

    this.#emit(final ? "itc-change" : "itc-input");
  }

  #emit(type) {
    this.dispatchEvent(
      new CustomEvent(type, {
        bubbles: true,
        detail: { path: this.path, value: this.#value }
      })
    );
  }

  #toDisplay(modelValue) {
    return this.#round((modelValue ?? 0) * this.factor);
  }

  #round(value) {
    const f = 10 ** this.precision;
    return Math.round(value * f) / f;
  }
}
