import {
  MODULE_ID,
  EVENTS,
  HOOKS,
  SETTINGS,
  EXPORT_SIZES,
  DEFAULT_VIDEO_FRAME
} from "../config/constants.js";
import { getSetting } from "../config/settings.js";
import { Logger } from "../core/Logger.js";
import { EventBus } from "../core/EventBus.js";
import { Store } from "../core/Store.js";
import { TokenProject } from "../model/TokenProject.js";
import { SetPropertyCommand, MacroCommand } from "../commands/Command.js";
import { HistoryManager } from "../commands/HistoryManager.js";
import { StageController } from "../canvas/StageController.js";
import { SceneGraph } from "../canvas/SceneGraph.js";
import { CameraController } from "../canvas/CameraController.js";
import { PointerRouter } from "../canvas/PointerRouter.js";
import { TransformControls } from "../canvas/gizmo/TransformControls.js";
import { TextureCache } from "../render/TextureCache.js";
import { VideoFrameExtractor } from "../render/VideoFrameExtractor.js";
import { Compositor } from "../export/Compositor.js";
import { PngEncoder } from "../export/PngEncoder.js";
import { FileUploader } from "../export/FileUploader.js";
import { TokenApplier } from "../export/TokenApplier.js";
import { ImageImporter } from "../io/ImageImporter.js";
import { DropHandler } from "../io/DropHandler.js";
import { FilePickerService } from "../io/FilePickerService.js";
import { ProjectManager } from "../io/ProjectManager.js";
import { BaseLibrary } from "../assets/BaseLibrary.js";
import { IsoPerspectiveBridge } from "../integration/IsoPerspectiveBridge.js";
import { SystemAdapter } from "../integration/SystemAdapter.js";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

/**
 * Editor de tokens isométricos.
 *
 * Orquesta el modelo, el canvas PIXI y los paneles. Deliberadamente **no**
 * contiene lógica de composición ni de exportación: sólo conecta piezas.
 *
 * La plantilla se renderiza una sola vez; a partir de ahí las actualizaciones
 * tocan nodos concretos del DOM en lugar de re-renderizar Handlebars, que es
 * lo que permite arrastrar un gizmo a 60 fps.
 */
export class IsoTokenEditor extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    id: "isometric-token-creator",
    classes: ["itc-app"],
    tag: "div",
    window: {
      title: "ITC.Title",
      icon: "fas fa-cube",
      resizable: true,
      minimizable: true
    },
    position: { width: 1500, height: 1000 },
    actions: {
      pickArtwork: IsoTokenEditor.#onPickArtwork,
      clearArtwork: IsoTokenEditor.#onClearArtwork,
      importBase: IsoTokenEditor.#onImportBase,
      selectBase: IsoTokenEditor.#onSelectBase,
      selectCategory: IsoTokenEditor.#onSelectCategory,
      undo: IsoTokenEditor.#onUndo,
      redo: IsoTokenEditor.#onRedo,
      resetTransform: IsoTokenEditor.#onResetTransform,
      centerArtwork: IsoTokenEditor.#onCenterArtwork,
      autoFit: IsoTokenEditor.#onAutoFit,
      flipH: IsoTokenEditor.#onFlipH,
      flipV: IsoTokenEditor.#onFlipV,
      zoomFit: IsoTokenEditor.#onZoomFit,
      toggleGrid: IsoTokenEditor.#onToggleGrid,
      saveProject: IsoTokenEditor.#onSaveProject,
      openProject: IsoTokenEditor.#onOpenProject,
      exportImage: IsoTokenEditor.#onExportImage,
      applyToken: IsoTokenEditor.#onApplyToken
    }
  };

  static PARTS = {
    main: { template: `modules/${MODULE_ID}/templates/editor.hbs` }
  };

  // --- Estado interno -----------------------------------------------------

  #bus = new EventBus();
  #store = null;
  #history = null;

  #stage = null;
  #sceneGraph = null;
  #camera = null;
  #controls = null;
  #router = null;
  #compositor = null;

  #dropHandler = null;
  #unsubscribers = [];
  #previewTimer = null;
  #draftTimer = null;

  /** Actor de origen, si el editor se abrió desde una ficha. */
  #actor = null;
  /** Categoría activa del selector de bases. */
  #category = "all";
  /** Widgets numéricos indexados por ruta del modelo, para refrescos parciales. */
  #widgets = new Map();

  constructor({ project = null, actor = null, ...options } = {}) {
    super(options);

    this.#actor = actor;
    const initial = project ?? IsoTokenEditor.#createProject(actor);

    this.#store = new Store(initial, this.#bus);
    this.#history = new HistoryManager(this.#bus, {
      limit: getSetting(SETTINGS.HISTORY_LIMIT, 100)
    });
  }

  get project() {
    return this.#store.state;
  }

  get store() {
    return this.#store;
  }

  get history() {
    return this.#history;
  }

  get bus() {
    return this.#bus;
  }

  /** Proyecto inicial, con los valores sugeridos por el sistema de juego. */
  static #createProject(actor) {
    const project = new TokenProject();
    project.export.size = getSetting(SETTINGS.DEFAULT_EXPORT_SIZE, 1024);
    project.export.format = getSetting(SETTINGS.DEFAULT_FORMAT, "png");

    const ratio = IsoPerspectiveBridge.getRatio();
    const projection = IsoPerspectiveBridge.getProjection();
    project.projection = { type: projection.type, ratio };

    if (actor) {
      project.name = SystemAdapter.getSuggestedName(actor);
      project.artwork.scale = SystemAdapter.getSuggestedArtScale(actor);
    }
    return project;
  }

  // --- Contexto de plantilla ----------------------------------------------

  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const p = this.project;

    return {
      ...context,
      project: p,
      categories: [
        { id: "all", label: game.i18n.localize("ITC.Category.All"), icon: "fa-border-all" },
        ...BaseLibrary.categories.map((c) => ({ ...c, label: game.i18n.localize(c.label) }))
      ],
      activeCategory: this.#category,
      bases: this.#visibleBases(),
      exportSizes: EXPORT_SIZES,
      hasIsoPerspective: IsoPerspectiveBridge.isActive,
      isWorldIsometric: IsoPerspectiveBridge.isWorldIsometric,
      projectionLabel: p.projection.type,
      ratioLabel: p.projection.ratio.toFixed(4),
      systemLabel: game.system.title ?? game.system.id,
      hasSystemSupport: SystemAdapter.hasSpecificSupport,
      showGrid: getSetting(SETTINGS.SHOW_GRID, true),
      canUpload: FileUploader.canUpload
    };
  }

  #visibleBases() {
    return BaseLibrary.getByCategory(this.#category).map((b) => ({
      ...b,
      label: b.label?.startsWith("ITC.") ? game.i18n.localize(b.label) : b.label,
      selected: b.src === this.project.assets.base.src
    }));
  }

  // --- Ciclo de vida ------------------------------------------------------

  async _onRender(context, options) {
    await super._onRender(context, options);

    // El canvas sólo se inicializa una vez, aunque la plantilla se re-renderice.
    if (!this.#stage) {
      await this.#initCanvas();
      this.#initPanels();
      this.#initSubscriptions();
      Hooks.callAll(HOOKS.EDITOR_READY, this, this.project);
    } else {
      // Re-render de la plantilla (p. ej. cambio de categoría): sólo hay que
      // volver a enganchar el DOM nuevo.
      this.#initPanels();
    }

    this.#syncAllWidgets();
    this.#updateHistoryButtons();
  }

  async #initCanvas() {
    const host = this.element.querySelector(".itc-viewport__canvas");
    if (!host) {
      Logger.error("No se encontró el contenedor del canvas en la plantilla.");
      return;
    }

    this.#stage = new StageController();
    await this.#stage.init(host);

    this.#sceneGraph = new SceneGraph(this.#stage.stage);
    this.#sceneGraph.ratio = this.project.projection.ratio;

    this.#camera = new CameraController(this.#sceneGraph.viewportRoot, this.#stage, this.#bus);
    this.#camera.fitToView();

    this.#controls = new TransformControls({
      store: this.#store,
      history: this.#history,
      sceneGraph: this.#sceneGraph
    });

    this.#router = new PointerRouter({
      element: this.#stage.app.view,
      camera: this.#camera,
      controls: this.#controls,
      scheduler: this.#stage.scheduler
    });
    this.#router.attach();

    this.#compositor = new Compositor(this.#sceneGraph);

    this.#sceneGraph.setGridVisible(getSetting(SETTINGS.SHOW_GRID, true));

    // Cargar los assets que ya trajera el proyecto (al abrir un fichero).
    await this.#reloadTextures();

    this.#sceneGraph.applyState(this.project, null);
    this.#stage.scheduler.invalidate();
  }

  #initPanels() {
    this.#widgets.clear();

    // Widgets numéricos → comandos.
    for (const el of this.element.querySelectorAll("itc-number")) {
      const path = el.getAttribute("path");
      if (!path) continue;
      this.#widgets.set(path, el);

      el.addEventListener("itc-input", (e) => this.#onWidgetInput(e.detail, false));
      el.addEventListener("itc-change", (e) => this.#onWidgetInput(e.detail, true));
      el.addEventListener("itc-reset", (e) => this.#onWidgetReset(e.detail.path));
    }

    // Casillas de verificación.
    for (const el of this.element.querySelectorAll("input[type=checkbox][data-path]")) {
      el.addEventListener("change", () => {
        this.#execute(new SetPropertyCommand(this.#store, el.dataset.path, el.checked));
      });
    }

    // Selectores.
    for (const el of this.element.querySelectorAll("select[data-path]")) {
      el.addEventListener("change", () => {
        const raw = el.value;
        const value = el.dataset.type === "number" ? Number.parseFloat(raw) : raw;
        this.#execute(new SetPropertyCommand(this.#store, el.dataset.path, value));
      });
    }

    // Nombre del token.
    const nameInput = this.element.querySelector("[data-name-input]");
    if (nameInput) {
      nameInput.addEventListener("change", () => {
        this.#execute(new SetPropertyCommand(this.#store, "name", nameInput.value));
      });
    }

    // Selector de color de sombra.
    const colorInput = this.element.querySelector("[data-shadow-color]");
    if (colorInput) {
      colorInput.addEventListener("change", () => {
        const value = Number.parseInt(colorInput.value.replace("#", ""), 16);
        this.#execute(new SetPropertyCommand(this.#store, "shadow.color", value));
      });
    }

    this.#initDropzone();
    this.#initKeyboard();
  }

  #initDropzone() {
    this.#dropHandler?.detach();

    const zone = this.element.querySelector(".itc-dropzone");
    if (!zone) return;

    this.#dropHandler = new DropHandler(
      zone,
      (result) => this.#applyImportedArtwork(result),
      (raw) => this.#loadProjectData(raw)
    );
    this.#dropHandler.attach();
  }

  #initKeyboard() {
    if (this.element.dataset.keysBound === "true") return;
    this.element.dataset.keysBound = "true";

    this.element.addEventListener("keydown", (event) => {
      // No secuestrar el teclado mientras se escribe en un campo.
      const tag = event.target?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;

      const ctrl = event.ctrlKey || event.metaKey;
      if (ctrl && event.key.toLowerCase() === "z") {
        event.preventDefault();
        if (event.shiftKey) this.#history.redo();
        else this.#history.undo();
      } else if (ctrl && event.key.toLowerCase() === "y") {
        event.preventDefault();
        this.#history.redo();
      } else if (ctrl && event.key.toLowerCase() === "s") {
        event.preventDefault();
        IsoTokenEditor.#onSaveProject.call(this);
      }
    });
  }

  #initSubscriptions() {
    // Modelo → canvas, con actualización parcial por rutas.
    this.#unsubscribers.push(
      this.#store.subscribe("", (paths) => {
        this.#sceneGraph.applyState(this.project, paths);
        this.#stage.scheduler.invalidate();
        this.#syncWidgets(paths);
        this.#schedulePreview();
        this.#scheduleDraft();
        Hooks.callAll(HOOKS.PROJECT_CHANGED, this.project, paths);
      })
    );

    // Recargar texturas cuando cambien las rutas de los assets.
    this.#unsubscribers.push(
      this.#store.subscribe("assets", async () => {
        await this.#reloadTextures();
        this.#sceneGraph.applyState(this.project, null);
        this.#stage.scheduler.invalidate();
      })
    );

    this.#unsubscribers.push(
      this.#bus.on(EVENTS.HISTORY_CHANGED, () => this.#updateHistoryButtons())
    );
  }

  async #reloadTextures() {
    await this.#sceneGraph.loadBaseTexture(this.project.assets.base.src);
    await this.#sceneGraph.loadArtworkTexture(
      this.project.assets.artwork.src,
      this.project.assets.artwork.frameTime
    );
  }

  // --- Enlace de widgets --------------------------------------------------

  #onWidgetInput({ path, value }, final) {
    if (!path) return;

    // Un gesto sobre un deslizador es una sola transacción: `itc-input`
    // fusiona, `itc-change` cierra.
    if (!final && !this.#history.inTransaction) {
      this.#history.beginTransaction(`Ajustar ${path}`);
    }

    this.#history.execute(new SetPropertyCommand(this.#store, path, value));

    if (final && this.#history.inTransaction) this.#history.commit();
  }

  #onWidgetReset(path) {
    const defaults = TokenProject.defaults();
    const value = foundry.utils.getProperty(defaults, path);
    if (value === undefined) return;
    this.#execute(new SetPropertyCommand(this.#store, path, value));
  }

  #execute(command) {
    this.#history.execute(command);
  }

  #syncWidgets(paths) {
    for (const path of paths) {
      const widget = this.#widgets.get(path);
      if (widget) widget.setValue(this.#store.get(path));

      const checkbox = this.element.querySelector(`input[type=checkbox][data-path="${path}"]`);
      if (checkbox) checkbox.checked = this.#store.get(path) === true;
    }

    if (paths.includes("name")) {
      const input = this.element.querySelector("[data-name-input]");
      if (input && document.activeElement !== input) input.value = this.project.name;
    }
  }

  #syncAllWidgets() {
    for (const [path, widget] of this.#widgets) {
      widget.setValue(this.#store.get(path));
    }
    for (const el of this.element.querySelectorAll("input[type=checkbox][data-path]")) {
      el.checked = this.#store.get(el.dataset.path) === true;
    }
    const nameInput = this.element.querySelector("[data-name-input]");
    if (nameInput) nameInput.value = this.project.name ?? "";
  }

  #updateHistoryButtons() {
    const undo = this.element?.querySelector('[data-action="undo"]');
    const redo = this.element?.querySelector('[data-action="redo"]');
    if (undo) undo.disabled = !this.#history.canUndo;
    if (redo) redo.disabled = !this.#history.canRedo;
  }

  // --- Importación --------------------------------------------------------

  async #applyImportedArtwork(result) {
    if (!result) return;

    const commands = [
      new SetPropertyCommand(this.#store, "assets.artwork.src", result.src),
      new SetPropertyCommand(this.#store, "assets.artwork.isVideo", result.isVideo === true),
      new SetPropertyCommand(this.#store, "assets.artwork.originalSize", {
        w: result.width,
        h: result.height
      })
    ];

    // Al importar un vídeo se vuelve al fotograma por defecto: conservar el
    // del vídeo anterior no tendría ningún sentido.
    if (result.isVideo) {
      commands.push(
        new SetPropertyCommand(this.#store, "assets.artwork.frameTime", DEFAULT_VIDEO_FRAME)
      );
    }

    if (!this.project.name) {
      const suggested = result.name?.replace(/\.[^.]+$/, "") ?? "";
      commands.push(new SetPropertyCommand(this.#store, "name", suggested));
    }

    this.#execute(new MacroCommand(commands, "Importar personaje"));

    // Esperar a que la textura esté cargada antes de encajar el arte.
    await this.#reloadTextures();
    await this.#autoFit(result.src);

    this.#updateFileChip(result);
    this.#bus.emit(EVENTS.ASSET_ARTWORK_LOADED, result);
  }

  /**
   * Encaje inicial del personaje sobre la base.
   *
   * Usa el recuadro alfa real, no el tamaño del PNG: así los pies del
   * personaje se apoyan en el suelo aunque la imagen tenga un margen
   * transparente enorme, que es lo habitual en arte generado.
   */
  async #autoFit(src) {
    const sprite = this.#sceneGraph.layers.artwork.sprite;
    if (!sprite) return;

    // En vídeos se analiza el fotograma elegido, no el archivo: el recuadro
    // alfa del primer fotograma suele estar vacío.
    const bounds = await ImageImporter.getAlphaBounds(src, {
      frameTime: this.project.assets.artwork.frameTime
    });
    const commands = [];

    if (bounds) {
      // Escalar para que la altura visible ocupe ~85 % del lienzo.
      const targetScale = 0.85 / bounds.height;
      commands.push(
        new SetPropertyCommand(this.#store, "artwork.scale", Math.round(targetScale * 100) / 100)
      );

      // Pivote en el centro inferior del recuadro visible: los pies.
      commands.push(
        new SetPropertyCommand(this.#store, "artwork.pivot", {
          x: bounds.x + bounds.width / 2,
          y: bounds.y + bounds.height
        })
      );
    } else {
      commands.push(new SetPropertyCommand(this.#store, "artwork.scale", 0.85));
      commands.push(new SetPropertyCommand(this.#store, "artwork.pivot", { x: 0.5, y: 1 }));
    }

    commands.push(new SetPropertyCommand(this.#store, "artwork.x", 0));
    commands.push(new SetPropertyCommand(this.#store, "artwork.y", 0));
    commands.push(new SetPropertyCommand(this.#store, "artwork.z", 0));

    this.#execute(new MacroCommand(commands, "Encajar automáticamente"));
  }

  #updateFileChip(result) {
    const chip = this.element.querySelector("[data-file-chip]");
    if (!chip) return;

    chip.classList.remove("hidden");
    const thumb = chip.querySelector("[data-file-thumb]");
    const name = chip.querySelector("[data-file-name]");
    const size = chip.querySelector("[data-file-size]");

    // Un <img> no puede mostrar un WebM: para vídeos se usa el fotograma ya
    // extraído, que está en la textura del sprite.
    if (thumb) {
      if (result.isVideo) {
        const texture = this.#sceneGraph?.layers.artwork.sprite?.texture;
        const source = texture?.baseTexture?.resource?.source;
        thumb.src = source?.toDataURL?.() ?? "";
      } else {
        thumb.src = result.src;
      }
    }

    if (name) name.textContent = result.name;
    if (size) {
      const duration = result.duration ? ` · ${result.duration.toFixed(1)}s` : "";
      size.textContent = `${result.width}×${result.height}px${duration}`;
    }

    // Mostrar u ocultar el selector de fotograma según el tipo de origen.
    this.element
      .querySelector("[data-video-frame]")
      ?.classList.toggle("hidden", result.isVideo !== true);
  }

  // --- Vista previa -------------------------------------------------------

  #schedulePreview() {
    clearTimeout(this.#previewTimer);
    this.#previewTimer = setTimeout(() => this.#renderPreviews(), 140);
  }

  /**
   * Genera las dos miniaturas del pie.
   *
   * Se reutiliza el renderer del editor en lugar de crear una segunda
   * `PIXI.Application`: una sola instancia por editor.
   */
  async #renderPreviews() {
    if (!this.#stage || !this.#compositor) return;

    const finalCanvas = this.element.querySelector("[data-preview-final]");
    const sceneCanvas = this.element.querySelector("[data-preview-scene]");
    if (!finalCanvas && !sceneCanvas) return;

    const restore = this.#compositor.prepare(256);
    this.#stage.scheduler.suspend();

    try {
      const blobless = await PngEncoder.encode(
        this.#stage.renderer,
        this.#compositor.container,
        256,
        "png"
      );
      const url = URL.createObjectURL(blobless);

      if (finalCanvas) this.#paintPreview(finalCanvas, url, false);
      if (sceneCanvas) this.#paintPreview(sceneCanvas, url, true);

      setTimeout(() => URL.revokeObjectURL(url), 2000);
    } catch (err) {
      Logger.debug("No se pudo generar la vista previa", err);
    } finally {
      restore();
      this.#stage.scheduler.resume();
    }
  }

  /**
   * Pinta una miniatura.
   *
   * Con `isometric = true` se aplica la matriz de composición real derivada de
   * isometric-perspective, de modo que la "Vista en Foundry" reproduce el
   * resultado del canvas en lugar de aproximarlo.
   */
  #paintPreview(canvas, url, isometric) {
    const ctx = canvas.getContext("2d");
    const img = new Image();

    img.onload = () => {
      const w = canvas.width;
      const h = canvas.height;
      ctx.clearRect(0, 0, w, h);

      if (!isometric) {
        ctx.drawImage(img, 0, 0, w, h);
        return;
      }

      const ratio = this.project.projection.ratio;

      // Rombo de celda de referencia, con el mismo aspecto que en la escena.
      const cellW = w * 0.8;
      const cellH = cellW / ratio;
      const cx = w / 2;
      const cy = h / 2;

      ctx.save();
      ctx.strokeStyle = "rgba(120,180,120,0.5)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(cx, cy - cellH / 2);
      ctx.lineTo(cx + cellW / 2, cy);
      ctx.lineTo(cx, cy + cellH / 2);
      ctx.lineTo(cx - cellW / 2, cy);
      ctx.closePath();
      ctx.stroke();
      ctx.restore();

      // El arte ocupa un cuadrado de lado igual a la diagonal horizontal del
      // rombo, centrado en la celda: exactamente lo que hace el módulo
      // isométrico en la escena real.
      const side = cellW;
      ctx.drawImage(img, cx - side / 2, cy - side / 2, side, side);
    };

    img.src = url;
  }

  #scheduleDraft() {
    clearTimeout(this.#draftTimer);
    this.#draftTimer = setTimeout(() => ProjectManager.saveDraft(this.project), 3000);
  }

  // --- Acciones -----------------------------------------------------------

  static async #onPickArtwork() {
    const path = await FilePickerService.pickImage({
      current: this.project.assets.artwork.src ?? ""
    });
    if (!path) return;
    const result = await ImageImporter.fromPath(path);
    await this.#applyImportedArtwork(result);
  }

  static #onClearArtwork() {
    this.#execute(new SetPropertyCommand(this.#store, "assets.artwork.src", null));
    this.element.querySelector("[data-file-chip]")?.classList.add("hidden");
  }

  static async #onImportBase() {
    const path = await FilePickerService.pickImage();
    if (!path) return;

    const base = await BaseLibrary.addUserBase({
      src: path,
      ratio: this.project.projection.ratio
    });

    await this.#selectBase(base);
    this.render();
  }

  static async #onSelectBase(_event, target) {
    const id = target.dataset.baseId;
    const base = BaseLibrary.getById(id);
    if (!base) return;
    await this.#selectBase(base);

    for (const el of this.element.querySelectorAll("[data-base-id]")) {
      el.classList.toggle("selected", el.dataset.baseId === id);
    }
  }

  async #selectBase(base) {
    // Las bases descubiertas en carpeta no traen punto de contacto declarado:
    // se estima ahora, la primera vez que se usan.
    const contact = await BaseLibrary.ensureContact(base, this.project.projection.ratio);

    this.#execute(
      new MacroCommand(
        [
          new SetPropertyCommand(this.#store, "assets.base.src", base.src),
          new SetPropertyCommand(this.#store, "assets.base.builtinId", base.id),
          new SetPropertyCommand(this.#store, "assets.base.contact", contact ?? null)
        ],
        "Cambiar base"
      )
    );
    this.#bus.emit(EVENTS.ASSET_BASE_LOADED, { id: base.id, src: base.src });
  }

  static #onSelectCategory(_event, target) {
    this.#category = target.dataset.categoryId ?? "all";
    this.render();
  }

  static #onUndo() {
    this.#history.undo();
  }

  static #onRedo() {
    this.#history.redo();
  }

  static #onResetTransform() {
    const defaults = TokenProject.defaults().artwork;
    const commands = ["x", "y", "z", "scale", "rotation", "opacity", "flipH", "flipV"].map(
      (key) => new SetPropertyCommand(this.#store, `artwork.${key}`, defaults[key])
    );
    this.#execute(new MacroCommand(commands, "Restablecer transformación"));
  }

  static #onCenterArtwork() {
    this.#execute(
      new MacroCommand(
        [
          new SetPropertyCommand(this.#store, "artwork.x", 0),
          new SetPropertyCommand(this.#store, "artwork.y", 0)
        ],
        "Centrar personaje"
      )
    );
  }

  static async #onAutoFit() {
    const src = this.project.assets.artwork.src;
    if (!src) return;
    await this.#autoFit(src);
  }

  static #onFlipH() {
    this.#execute(
      new SetPropertyCommand(this.#store, "artwork.flipH", !this.project.artwork.flipH)
    );
  }

  static #onFlipV() {
    this.#execute(
      new SetPropertyCommand(this.#store, "artwork.flipV", !this.project.artwork.flipV)
    );
  }

  static #onZoomFit() {
    this.#camera.fitToView();
    this.#stage.scheduler.invalidate();
  }

  static async #onToggleGrid(_event, target) {
    const visible = !getSetting(SETTINGS.SHOW_GRID, true);
    await game.settings.set(MODULE_ID, SETTINGS.SHOW_GRID, visible);
    this.#sceneGraph.setGridVisible(visible);
    this.#stage.scheduler.invalidate();
    target.classList.toggle("active", visible);
  }

  static async #onSaveProject() {
    try {
      await ProjectManager.save(this.project);
      ProjectManager.clearDraft();
    } catch (err) {
      Logger.error("No se pudo guardar el proyecto", err);
      ui.notifications.error(err.message);
    }
  }

  static async #onOpenProject() {
    try {
      const project = await ProjectManager.openWithPicker();
      if (project) await this.#loadProject(project);
    } catch (err) {
      Logger.error("No se pudo abrir el proyecto", err);
      ui.notifications.error(err.message);
    }
  }

  async #loadProjectData(raw) {
    const project = ProjectManager.fromRaw(raw);
    await this.#loadProject(project);
  }

  async #loadProject(project) {
    this.#store.replace(project);
    this.#history.clear();
    this.#sceneGraph.ratio = project.projection.ratio;
    await this.#reloadTextures();
    this.#sceneGraph.applyState(project, null);
    this.#stage.scheduler.invalidate();
    this.render();
  }

  // --- Exportación --------------------------------------------------------

  /**
   * Renderiza la composición a un Blob transparente.
   *
   * Es la única ruta de exportación: la vista previa y el guardado usan la
   * misma, así que no pueden divergir.
   */
  async #renderToBlob() {
    const size = this.project.export.size;
    const format = this.project.export.format;
    const ratio = this.project.projection.ratio;

    const check = this.#compositor.verify(this.project, ratio);
    if (!check.ok) {
      ui.notifications.warn(check.issues[0]);
    }

    const restore = this.#compositor.prepare(size);
    this.#stage.scheduler.suspend();

    try {
      return await PngEncoder.encode(
        this.#stage.renderer,
        this.#compositor.container,
        size,
        format
      );
    } finally {
      restore();
      this.#stage.scheduler.resume();
    }
  }

  static async #onExportImage() {
    if (!this.project.isRenderable) {
      ui.notifications.warn(game.i18n.localize("ITC.Notify.NothingToExport"));
      return;
    }

    const options = { size: this.project.export.size, format: this.project.export.format };
    if (Hooks.call(HOOKS.BEFORE_EXPORT, this.project, options) === false) return;

    try {
      const blob = await this.#renderToBlob();
      const filename = `${this.project.slug}-${foundry.utils.randomID(8)}.${this.project.export.format}`;

      if (!FileUploader.canUpload) {
        FileUploader.downloadLocal(blob, filename);
        ui.notifications.info(game.i18n.localize("ITC.Notify.DownloadedLocally"));
        return;
      }

      const folder = getSetting(SETTINGS.EXPORT_FOLDER, `worlds/${game.world.id}/isometric-tokens`);
      const path = await FileUploader.upload(blob, filename, { path: folder });

      this.#execute(new SetPropertyCommand(this.#store, "output.lastPath", path));
      Hooks.callAll(HOOKS.AFTER_EXPORT, this.project, { path, blob });
      this.#bus.emit(EVENTS.EXPORT_DONE, { path });

      ui.notifications.info(game.i18n.format("ITC.Notify.Exported", { path }));
      return path;
    } catch (err) {
      Logger.error("La exportación falló", err);
      ui.notifications.error(err.message);
    }
  }

  static async #onApplyToken() {
    const path = await IsoTokenEditor.#onExportImage.call(this);
    if (!path) return;

    const selected = TokenApplier.getSelectedToken();

    try {
      if (selected) {
        await TokenApplier.applyToToken(selected, path, this.project);
        ui.notifications.info(game.i18n.localize("ITC.Notify.AppliedToToken"));
      } else if (this.#actor) {
        await TokenApplier.applyToAllLinked(this.#actor, path, this.project);
        ui.notifications.info(game.i18n.localize("ITC.Notify.AppliedToActor"));
      } else {
        ui.notifications.warn(game.i18n.localize("ITC.Notify.NoTarget"));
      }
    } catch (err) {
      Logger.error("No se pudo aplicar el token", err);
      ui.notifications.error(err.message);
    }
  }

  // --- Limpieza -----------------------------------------------------------

  async _preClose(options) {
    clearTimeout(this.#previewTimer);
    clearTimeout(this.#draftTimer);

    for (const unsubscribe of this.#unsubscribers) unsubscribe();
    this.#unsubscribers = [];

    this.#router?.detach();
    this.#dropHandler?.detach();

    this.#sceneGraph?.destroy();
    this.#stage?.destroy();

    // Libera las texturas con recuento cero y revoca los ObjectURL: sin esto,
    // abrir y cerrar el editor repetidamente acumularía memoria.
    TextureCache.clear();
    VideoFrameExtractor.clear();

    this.#bus.clear();
    this.#widgets.clear();

    this.#sceneGraph = null;
    this.#stage = null;
    this.#camera = null;
    this.#controls = null;
    this.#router = null;
    this.#compositor = null;

    Logger.debug("Editor cerrado y recursos liberados.");
    return super._preClose(options);
  }
}
