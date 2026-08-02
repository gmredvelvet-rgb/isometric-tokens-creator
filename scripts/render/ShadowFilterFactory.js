/**
 * Fábrica de filtros de sombra.
 *
 * Aísla la creación de `PIXI.BlurFilter` para poder aplicar un presupuesto de
 * rendimiento: por encima de cierto radio, el desenfoque baja su calidad en
 * lugar de hundir el framerate.
 */
export const ShadowFilterFactory = {
  /** Radio a partir del cual se reduce la calidad del desenfoque. */
  QUALITY_THRESHOLD: 16,

  createBlur(strength) {
    const filter = new PIXI.BlurFilter(strength);
    this.updateBlur(filter, strength);
    return filter;
  },

  updateBlur(filter, strength) {
    filter.blur = strength;
    filter.quality = strength > this.QUALITY_THRESHOLD ? 2 : 4;
    // Sin padding suficiente el desenfoque se recorta en los bordes del sprite.
    filter.padding = Math.ceil(strength * 2);
  }
};
