import { Logger } from "../core/Logger.js";

/**
 * Versión actual del esquema de proyecto.
 *
 * Al cambiar el formato: incrementar este número y añadir una función de
 * migración a `MIGRATIONS`. Los proyectos antiguos deben abrir siempre.
 */
export const CURRENT_SCHEMA_VERSION = 1;

/**
 * Migraciones encadenadas. La clave `N` transforma un documento de versión `N`
 * a la versión `N + 1`.
 *
 * @type {Record<number, (data: object) => object>}
 */
const MIGRATIONS = {
  // Ejemplo para futuras versiones:
  // 1: (data) => { data.nuevoCampo = valorPorDefecto; return data; }
};

/**
 * Lleva un documento de proyecto a la versión actual del esquema.
 *
 * @param {object} raw documento leído de disco
 * @returns {object} documento en el esquema actual
 */
export function migrate(raw) {
  if (!raw || typeof raw !== "object") {
    throw new Error("El fichero de proyecto está vacío o no es un objeto JSON.");
  }

  let data = foundry.utils.deepClone(raw);
  let version = Number(data.schemaVersion ?? 0);

  if (version > CURRENT_SCHEMA_VERSION) {
    Logger.warn(
      `El proyecto usa el esquema v${version}, más nuevo que el soportado (v${CURRENT_SCHEMA_VERSION}). ` +
        `Se intentará abrir de todos modos; puede que falten datos.`
    );
    return data;
  }

  while (version < CURRENT_SCHEMA_VERSION) {
    const step = MIGRATIONS[version];
    if (!step) {
      Logger.warn(`No hay migración desde el esquema v${version}; se usa tal cual.`);
      break;
    }
    Logger.info(`Migrando proyecto: esquema v${version} → v${version + 1}`);
    data = step(data);
    version += 1;
  }

  data.schemaVersion = CURRENT_SCHEMA_VERSION;
  return data;
}

/**
 * Validación ligera antes de cargar. No sustituye a las migraciones: sólo
 * detecta ficheros que no son proyectos de ITC.
 *
 * @returns {{ok: boolean, error?: string}}
 */
export function validate(raw) {
  if (!raw || typeof raw !== "object") {
    return { ok: false, error: "El fichero no contiene un objeto JSON." };
  }
  const looksLikeProject =
    typeof raw.schemaVersion === "number" ||
    (raw.artwork && raw.base && raw.assets);
  if (!looksLikeProject) {
    return { ok: false, error: "El fichero no parece un proyecto de Isometric Token Creator." };
  }
  return { ok: true };
}
