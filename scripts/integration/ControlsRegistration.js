import { MODULE_ID } from "../config/constants.js";
import { Logger } from "../core/Logger.js";

/**
 * Botón en la barra de herramientas de tokens.
 *
 * v13 cambió la forma de `controls`: pasó de array a objeto indexado por
 * nombre, y `tools` de array a record. Se detecta el tipo en vez de asumir
 * uno, para no romper si la instalación difiere.
 */
function registerSceneControls(openEditor) {
  Hooks.on("getSceneControlButtons", (controls) => {
    if (!game.user.isGM) return;

    const tool = {
      name: "isometric-token-creator",
      title: game.i18n.localize("ITC.Control.Open"),
      icon: "fas fa-cube",
      button: true,
      visible: true,
      order: 99,
      onChange: () => openEditor(),
      onClick: () => openEditor()
    };

    try {
      // v13: record indexado por nombre.
      if (!Array.isArray(controls)) {
        const tokenGroup = controls.tokens ?? controls.token;
        if (!tokenGroup?.tools) return;

        if (Array.isArray(tokenGroup.tools)) tokenGroup.tools.push(tool);
        else tokenGroup.tools[tool.name] = tool;
        return;
      }

      // v12 y anteriores: array de grupos.
      const tokenGroup = controls.find((c) => c.name === "token" || c.name === "tokens");
      if (tokenGroup?.tools) tokenGroup.tools.push(tool);
    } catch (err) {
      Logger.warn("No se pudo añadir el botón a los controles de escena", err);
    }
  });
}

/**
 * Botón en la cabecera de la ficha de actor.
 *
 * Se enganchan los dos hooks porque los sistemas conviven: PF2e y D&D5e ya
 * usan hojas ApplicationV2, pero muchos módulos y sistemas siguen en V1.
 */
function registerActorSheetButton(openEditor) {
  const inject = (app, html) => {
    if (!game.user.isGM) return;

    const element = html instanceof HTMLElement ? html : html?.[0];
    const header = element?.closest(".application")?.querySelector(".window-header");
    if (!header || header.querySelector(`.${MODULE_ID}-btn`)) return;

    const button = document.createElement("button");
    button.type = "button";
    button.className = `header-control icon fas fa-cube ${MODULE_ID}-btn`;
    button.dataset.tooltip = game.i18n.localize("ITC.Control.OpenForActor");
    button.setAttribute("aria-label", game.i18n.localize("ITC.Control.OpenForActor"));
    button.addEventListener("click", (event) => {
      event.preventDefault();
      openEditor({ actor: app.document ?? app.actor });
    });

    const closeButton = header.querySelector('[data-action="close"]');
    if (closeButton) header.insertBefore(button, closeButton);
    else header.appendChild(button);
  };

  Hooks.on("renderActorSheetV2", inject);
  Hooks.on("renderActorSheet", inject);
}

/** Botón en el HUD del token seleccionado. */
function registerTokenHUD(openEditor) {
  Hooks.on("renderTokenHUD", (hud, html) => {
    if (!game.user.isGM) return;

    const element = html instanceof HTMLElement ? html : html?.[0];
    const column = element?.querySelector(".col.left");
    if (!column) return;

    const button = document.createElement("button");
    button.type = "button";
    button.className = "control-icon";
    button.dataset.tooltip = game.i18n.localize("ITC.Control.OpenForToken");
    button.innerHTML = '<i class="fas fa-cube"></i>';
    button.addEventListener("click", (event) => {
      event.preventDefault();
      openEditor({ actor: hud.object?.actor ?? null });
    });

    column.appendChild(button);
  });
}

/**
 * Puntos de entrada al editor dentro de la interfaz de Foundry.
 *
 * Se ofrecen tres, porque cada usuario llega desde un sitio distinto:
 * la barra de controles de escena, la cabecera de la ficha de actor y el HUD
 * del token seleccionado.
 */
export const ControlsRegistration = {
  /**
   * @param {(options?: object) => Promise<unknown>} openEditor
   *        fábrica inyectada desde main.js, para no crear un ciclo de imports
   */
  register(openEditor) {
    registerSceneControls(openEditor);
    registerActorSheetButton(openEditor);
    registerTokenHUD(openEditor);
  }
};
