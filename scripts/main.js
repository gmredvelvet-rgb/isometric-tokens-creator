/**
 * Isometric Token Creator — punto de entrada.
 *
 * Editor visual que compone `base + personaje + sombra` y exporta un PNG
 * transparente alineado con la proyección de `isometric-perspective`.
 *
 * El núcleo es agnóstico al sistema de juego: produce una imagen y escribe
 * campos estándar de Foundry. Lo específico de PF2e / D&D5e vive aislado en
 * `integration/SystemAdapter.js`.
 */

import { MODULE_ID, MODULE_TITLE, SETTINGS } from "./config/constants.js";
import { registerSettings } from "./config/settings.js";
import { Logger } from "./core/Logger.js";
import { NumericSlider } from "./apps/widgets/NumericSlider.js";
import { BaseLibrary } from "./assets/BaseLibrary.js";
import { ControlsRegistration } from "./integration/ControlsRegistration.js";
import { IsoPerspectiveBridge } from "./integration/IsoPerspectiveBridge.js";
import { SystemAdapter } from "./integration/SystemAdapter.js";
import { API } from "./api.js";
import LicenseClient from "./license/license-client.js";
import LicenseUI, { isWorldLicensed, registerLicenseMenu } from "./license/license-ui.js";

Hooks.once("init", async () => {
  Logger.info(`Inicializando ${MODULE_TITLE}…`);

  registerSettings();
  registerLicenseMenu();

  // Registrar el control numérico antes de que se renderice ninguna plantilla.
  NumericSlider.register();

  // Precargar las plantillas para que abrir el editor no tenga que ir a red.
  await foundry.applications.handlebars.loadTemplates([
    `modules/${MODULE_ID}/templates/editor.hbs`
  ]);

  Logger.syncFromSettings();
});

Hooks.once("setup", () => {
  ControlsRegistration.register((options) => API.open(options));
});

Hooks.once("ready", async () => {
  Logger.syncFromSettings();

  await BaseLibrary.load();

  // API pública, por las dos vías habituales.
  const module = game.modules.get(MODULE_ID);
  if (module) module.api = API;
  game.itc = API;

  // Resumen del entorno detectado: ahorra mucho ida y vuelta al diagnosticar.
  const projection = IsoPerspectiveBridge.getProjection();
  Logger.info(
    `Listo. Sistema: ${game.system.id} (adaptador: ${SystemAdapter.current.id}) · ` +
      `Proyección: ${projection.type} · ratio ${projection.ratio.toFixed(4)} · ` +
      `isometric-perspective: ${IsoPerspectiveBridge.isActive ? "activo" : "ausente"}`
  );

  if (!IsoPerspectiveBridge.isActive) {
    Logger.info(
      "isometric-perspective no está activo. El editor funciona igual, " +
        "usando la proyección por defecto (True Isometric, ratio √3)."
    );
  }

  // Lo último del arranque a propósito: el editor ya está operativo antes de
  // que la licencia toque la red, así que una caída del servidor no retrasa
  // nada ni impide abrir nada.
  await startLicenceCheck();
});

/**
 * Comprobación de licencia. Gate **blando** deliberado: el módulo funciona
 * entero con licencia y sin ella, y un mundo sin licencia sólo recibe un
 * recordatorio periódico. Sólo el cliente del GM habla con el servidor: escribe
 * el flag de mundo que leen los demás, así que los jugadores nunca lo contactan.
 * @returns {Promise<void>}
 */
async function startLicenceCheck() {
  // Foundry también carga los módulos en las pantallas de join, setup y stream,
  // donde no hay mundo que licenciar ni a quién preguntar.
  if (game.view !== "game") return;
  try {
    if (game.user?.isGM) {
      // Cierto si está verificada ahora mismo o si sigue dentro de la ventana
      // de 30 días que compró una verificación anterior: a un GM que ya
      // autorizó no se le vuelve a preguntar.
      const licensed = await LicenseClient.instance.initialize();
      if (licensed) await game.settings.set(MODULE_ID, SETTINGS.WORLD_LICENSED, true);
      // Nunca abrir con la tarjeta si el mundo ya está licenciado: eso es un
      // segundo navegador o una caída del servidor, no alguien a quien haya que
      // preguntar.
      else if (!LicenseClient.instance.hasStoredCredentials && !isWorldLicensed()) LicenseUI.show();
    }
    LicenseUI.startReminder();
  } catch (error) {
    // La capa de licencia no puede llevarse el módulo por delante.
    Logger.error("Falló la comprobación de licencia.", error);
  }
}

// Que el GM autorice a mitad de sesión silencia el recordatorio en todos los
// clientes conectados sin que nadie recargue: el flag llega como actualización
// de un ajuste de mundo.
Hooks.on("updateSetting", (setting) => {
  if (setting.key !== `${MODULE_ID}.${SETTINGS.WORLD_LICENSED}`) return;
  if (isWorldLicensed()) LicenseUI.stopReminder();
  else LicenseUI.startReminder();
});
