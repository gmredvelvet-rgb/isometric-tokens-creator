import { SETTINGS } from "../config/constants.js";
import { getSetting } from "../config/settings.js";

/**
 * Ajuste magnético de valores durante el arrastre.
 *
 * El paso es configurable y se puede saltar temporalmente manteniendo Alt,
 * que es el gesto habitual en editores gráficos.
 */
export const SnapService = {
  get enabled() {
    return getSetting(SETTINGS.SNAP_ENABLED, true) === true;
  },

  get step() {
    return getSetting(SETTINGS.SNAP_STEP, 8);
  },

  /**
   * @param {number} value
   * @param {boolean} bypass `true` para ignorar el ajuste (tecla Alt)
   */
  apply(value, bypass = false) {
    if (bypass || !this.enabled) return value;
    const step = this.step;
    if (!step || step <= 0) return value;
    return Math.round(value / step) * step;
  },

  /** Ajuste de ángulos, con paso propio de 15°. */
  applyAngle(value, bypass = false, step = 15) {
    if (bypass || !this.enabled) return value;
    return Math.round(value / step) * step;
  }
};
