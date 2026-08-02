import { Logger } from "../core/Logger.js";

/**
 * Capa de compatibilidad entre sistemas de juego.
 *
 * El núcleo del módulo (composición, render, exportación) es completamente
 * agnóstico: produce un PNG y escribe rutas de textura estándar de Foundry.
 * Lo único que varía entre sistemas es *de dónde se lee* el tamaño de una
 * criatura y qué convención de escala aplica ese sistema a sus tokens.
 *
 * Todo eso queda aislado aquí. Añadir soporte para un sistema nuevo es
 * registrar un adaptador; no se toca ninguna otra parte del módulo.
 *
 * Rutas verificadas contra los sistemas instalados:
 *   - PF2e   → `actor.system.traits.size.value`  (objeto con .value)
 *   - D&D5e  → `actor.system.traits.size`        (string plano)
 *   Ambos usan las mismas claves: tiny | sm | med | lg | huge | grg
 */

/**
 * Huella en celdas de rejilla por clave de tamaño.
 * Es la convención estándar de Foundry y coincide en D&D5e y PF2e.
 */
const STANDARD_FOOTPRINT = {
  tiny: 1,
  sm: 1,
  med: 1,
  lg: 2,
  huge: 3,
  grg: 4
};

/**
 * Escala visual sugerida del arte dentro de su huella.
 *
 * Una criatura Diminuta ocupa una celda entera de rejilla pero se dibuja
 * pequeña dentro de ella. Esto sólo afecta a la *sugerencia inicial* del
 * editor: el usuario siempre puede ajustarla y el cambio es reversible.
 */
const STANDARD_ART_SCALE = {
  tiny: 0.5,
  sm: 0.8,
  med: 1,
  lg: 1,
  huge: 1,
  grg: 1
};

/**
 * Adaptador base. Implementa el comportamiento agnóstico, que ya es correcto
 * para la mayoría de sistemas; los adaptadores concretos sólo sobrescriben
 * lo que difiere.
 */
class BaseSystemAdapter {
  /** @type {string} id del sistema, o "*" para el genérico. */
  static systemId = "*";

  get id() {
    return this.constructor.systemId;
  }

  /**
   * Clave de tamaño de la criatura.
   * @returns {string|null} tiny|sm|med|lg|huge|grg, o null si no aplica.
   */
  getSizeKey(actor) {
    const raw = actor?.system?.traits?.size;
    if (typeof raw === "string") return raw;
    if (raw && typeof raw.value === "string") return raw.value;
    return null;
  }

  /** Huella del token en celdas de rejilla. */
  getFootprint(actor) {
    const key = this.getSizeKey(actor);
    return STANDARD_FOOTPRINT[key] ?? 1;
  }

  /** Escala visual sugerida del arte dentro de la huella. */
  getSuggestedArtScale(actor) {
    const key = this.getSizeKey(actor);
    return STANDARD_ART_SCALE[key] ?? 1;
  }

  /** Imagen de la que partir al abrir el editor desde una ficha. */
  getSourceImage(actor) {
    return actor?.prototypeToken?.texture?.src || actor?.img || null;
  }

  /** Nombre sugerido para el token exportado. */
  getSuggestedName(actor) {
    return actor?.name ?? "";
  }

  /**
   * Datos de actualización específicos del sistema al aplicar el token.
   * El genérico no añade nada.
   */
  buildExtraTokenUpdate(_actor, _project) {
    return {};
  }
}

/**
 * Pathfinder 2e.
 *
 * PF2e almacena el tamaño en `system.traits.size.value` y aplica su propia
 * convención de escala a criaturas Diminutas y Pequeñas.
 */
class PF2eAdapter extends BaseSystemAdapter {
  static systemId = "pf2e";

  getSizeKey(actor) {
    return actor?.system?.traits?.size?.value ?? null;
  }

  getSuggestedArtScale(actor) {
    const key = this.getSizeKey(actor);
    // PF2e dibuja las criaturas Pequeñas algo mayores que la convención
    // genérica; el resto sigue el estándar.
    if (key === "sm") return 0.9;
    return STANDARD_ART_SCALE[key] ?? 1;
  }
}

/**
 * D&D 5e.
 *
 * `system.traits.size` es un string plano, que ya es lo que hace el adaptador
 * base. Se registra explícitamente para poder divergir en el futuro sin tocar
 * el genérico.
 */
class DnD5eAdapter extends BaseSystemAdapter {
  static systemId = "dnd5e";
}

/** Registro de adaptadores por id de sistema. */
const REGISTRY = new Map();

function register(AdapterClass) {
  REGISTRY.set(AdapterClass.systemId, new AdapterClass());
}

register(BaseSystemAdapter);
register(PF2eAdapter);
register(DnD5eAdapter);

/**
 * Fachada estática. El resto del módulo sólo habla con esto.
 */
export const SystemAdapter = {
  /**
   * Permite a otros módulos añadir soporte para su sistema sin tocar ITC.
   * @param {typeof BaseSystemAdapter} AdapterClass
   */
  register(AdapterClass) {
    if (!AdapterClass?.systemId) {
      throw new TypeError("Un adaptador necesita una propiedad estática `systemId`");
    }
    register(AdapterClass);
    Logger.info(`Adaptador de sistema registrado: ${AdapterClass.systemId}`);
  },

  /** Adaptador activo para el sistema del mundo, con fallback al genérico. */
  get current() {
    const id = game?.system?.id;
    return REGISTRY.get(id) ?? REGISTRY.get("*");
  },

  /** `true` si hay un adaptador específico (no el genérico) para este sistema. */
  get hasSpecificSupport() {
    return REGISTRY.has(game?.system?.id);
  },

  get supportedSystems() {
    return [...REGISTRY.keys()].filter((k) => k !== "*");
  },

  // --- Delegación conveniente -------------------------------------------

  getSizeKey(actor) {
    return this.current.getSizeKey(actor);
  },
  getFootprint(actor) {
    return this.current.getFootprint(actor);
  },
  getSuggestedArtScale(actor) {
    return this.current.getSuggestedArtScale(actor);
  },
  getSourceImage(actor) {
    return this.current.getSourceImage(actor);
  },
  getSuggestedName(actor) {
    return this.current.getSuggestedName(actor);
  },
  buildExtraTokenUpdate(actor, project) {
    return this.current.buildExtraTokenUpdate(actor, project);
  }
};

export { BaseSystemAdapter };
