import { HOOKS, SETTINGS } from "../config/constants.js";
import { getSetting } from "../config/settings.js";
import { Logger } from "../core/Logger.js";
import { IsoPerspectiveBridge } from "../integration/IsoPerspectiveBridge.js";
import { SystemAdapter } from "../integration/SystemAdapter.js";

/**
 * Escribe la imagen generada en los documentos de Foundry.
 *
 * Es agnóstico al sistema: sólo toca campos del núcleo de Foundry
 * (`texture.*`) y los flags de isometric-perspective. Lo específico de cada
 * sistema (tamaño de criatura) se delega en `SystemAdapter`.
 */
export const TokenApplier = {
  /**
   * Datos de actualización comunes.
   *
   * Los offsets isométricos se ponen a cero **explícitamente**: nuestro PNG ya
   * está alineado por construcción (reglas R1-R3), así que cualquier
   * corrección manual previa del usuario sólo lo desalinearía.
   */
  buildUpdateData(imgPath, _project, { actor = null } = {}) {
    const data = {
      "texture.src": imgPath,
      // `fit: fill` es irrelevante gracias a R1 (lienzo cuadrado), pero se deja
      // explícito para que el resultado no dependa de ajustes heredados.
      "texture.fit": "fill",
      "texture.anchorX": 0.5,
      "texture.anchorY": 0.5,
      "texture.scaleX": 1,
      "texture.scaleY": 1
    };

    if (getSetting(SETTINGS.AUTO_APPLY_FLAGS, true)) {
      Object.assign(data, IsoPerspectiveBridge.buildTokenFlags());
    }

    // Huella según el tamaño de la criatura, si el sistema lo declara.
    if (actor && getSetting(SETTINGS.AUTO_SIZE_FROM_ACTOR, true)) {
      const footprint = SystemAdapter.getFootprint(actor);
      if (footprint > 0) {
        data.width = footprint;
        data.height = footprint;
      }
      Object.assign(data, SystemAdapter.buildExtraTokenUpdate(actor, _project));
    }

    return data;
  },

  /** Aplica a un token concreto del canvas. */
  async applyToToken(tokenDoc, imgPath, project) {
    const actor = tokenDoc.actor ?? null;
    const data = this.buildUpdateData(imgPath, project, { actor });

    const proceed = Hooks.call(HOOKS.BEFORE_APPLY_TOKEN, tokenDoc, data);
    if (proceed === false) {
      Logger.info("Aplicación al token cancelada por un hook.");
      return false;
    }

    await tokenDoc.update(data);
    Logger.info(`Token actualizado: ${tokenDoc.name}`);
    return true;
  },

  /** Aplica al token prototipo del actor. */
  async applyToPrototype(actor, imgPath, project) {
    const data = this.buildUpdateData(imgPath, project, { actor });
    const prototypeData = Object.fromEntries(
      Object.entries(data).map(([key, value]) => [`prototypeToken.${key}`, value])
    );

    await actor.update(prototypeData);
    Logger.info(`Token prototipo actualizado: ${actor.name}`);
    return true;
  },

  /**
   * Aplica a todos los tokens del actor en todas las escenas.
   *
   * Se agrupan las actualizaciones por escena para hacer una sola llamada por
   * escena en vez de una por token.
   */
  async applyToAllLinked(actor, imgPath, project) {
    const data = this.buildUpdateData(imgPath, project, { actor });
    let count = 0;

    for (const scene of game.scenes) {
      const updates = scene.tokens
        .filter((t) => t.actorId === actor.id)
        .map((t) => ({ _id: t.id, ...data }));

      if (updates.length === 0) continue;
      await scene.updateEmbeddedDocuments("Token", updates);
      count += updates.length;
    }

    await this.applyToPrototype(actor, imgPath, project);
    Logger.info(`${count} token(s) de ${actor.name} actualizados en ${game.scenes.size} escena(s).`);
    return count;
  },

  /** Token controlado actualmente, si hay exactamente uno. */
  getSelectedToken() {
    const controlled = canvas?.tokens?.controlled ?? [];
    if (controlled.length === 1) return controlled[0].document;
    return null;
  },

  /** Alcances de aplicación disponibles en el contexto actual. */
  getAvailableScopes({ actor = null } = {}) {
    const scopes = [];
    if (this.getSelectedToken()) scopes.push("selected");
    if (actor) {
      scopes.push("prototype");
      scopes.push("linked");
    }
    scopes.push("fileOnly");
    return scopes;
  }
};
