/**
 * Generador de bases isométricas para Isometric Token Creator.
 *
 * Produce PNGs RGBA cuya elipse de contacto cumple exactamente
 * `ancho / alto = ratio` (√3 para True Isometric), que es la regla R3 del
 * exportador. Al generarlas así, el contacto declarado en bases.json es
 * verificablemente correcto, no una estimación.
 */

const fs = require("fs");
const path = require("path");
const zlib = require("zlib");

const SIZE = 512;
const RATIO = Math.sqrt(3);
const RX = SIZE / 2 - 6;          // semieje horizontal (margen para el borde)
const RY = RX / RATIO;            // semieje vertical → aspecto exacto √3:1
const CX = SIZE / 2;
const CY = SIZE / 2;
const THICKNESS = 26;             // grosor lateral de la peana

// --- Codificación PNG ------------------------------------------------------

const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const typeBuf = Buffer.from(type, "ascii");
  const body = Buffer.concat([typeBuf, data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

function encodePNG(rgba, width, height) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;   // bit depth
  ihdr[9] = 6;   // color type RGBA
  ihdr[10] = 0;  // compression
  ihdr[11] = 0;  // filter
  ihdr[12] = 0;  // interlace

  // Scanlines con filtro 0 (none).
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) {
    const rowStart = y * (width * 4 + 1);
    raw[rowStart] = 0;
    rgba.copy(raw, rowStart + 1, y * width * 4, (y + 1) * width * 4);
  }

  return Buffer.concat([
    sig,
    chunk("IHDR", ihdr),
    chunk("IDAT", zlib.deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0))
  ]);
}

// --- Ruido procedural ------------------------------------------------------

function hash2(x, y, seed) {
  let h = x * 374761393 + y * 668265263 + seed * 1442695040888963407;
  h = (h ^ (h >> 13)) * 1274126177;
  return ((h ^ (h >> 16)) >>> 0) / 4294967295;
}

function valueNoise(x, y, scale, seed) {
  const sx = x / scale;
  const sy = y / scale;
  const x0 = Math.floor(sx);
  const y0 = Math.floor(sy);
  const fx = sx - x0;
  const fy = sy - y0;
  const ux = fx * fx * (3 - 2 * fx);
  const uy = fy * fy * (3 - 2 * fy);

  const a = hash2(x0, y0, seed);
  const b = hash2(x0 + 1, y0, seed);
  const c = hash2(x0, y0 + 1, seed);
  const d = hash2(x0 + 1, y0 + 1, seed);

  return (a * (1 - ux) + b * ux) * (1 - uy) + (c * (1 - ux) + d * ux) * uy;
}

/**
 * Ruido celular (Worley) sobre una rejilla con puntos desplazados al azar.
 *
 * Devuelve la diferencia entre las distancias a los dos puntos más cercanos.
 * Ese valor tiende a cero justo en las fronteras entre celdas, que es donde
 * queremos las grietas: produce una red continua, no manchas sueltas.
 */
function cellEdge(x, y, cellSize, seed) {
  const gx = Math.floor(x / cellSize);
  const gy = Math.floor(y / cellSize);

  let d1 = Infinity;
  let d2 = Infinity;

  for (let oy = -1; oy <= 1; oy++) {
    for (let ox = -1; ox <= 1; ox++) {
      const cx = gx + ox;
      const cy = gy + oy;
      const px = (cx + hash2(cx, cy, seed)) * cellSize;
      const py = (cy + hash2(cx, cy, seed + 991)) * cellSize;
      const d = Math.hypot(x - px, y - py);
      if (d < d1) {
        d2 = d1;
        d1 = d;
      } else if (d < d2) {
        d2 = d;
      }
    }
  }
  return (d2 - d1) / cellSize;
}

function fbm(x, y, seed) {
  let sum = 0;
  let amp = 0.5;
  let scale = 64;
  for (let i = 0; i < 4; i++) {
    sum += valueNoise(x, y, scale, seed + i * 17) * amp;
    amp *= 0.5;
    scale *= 0.5;
  }
  return sum;
}

// --- Materiales ------------------------------------------------------------

const MATERIALS = [
  {
    id: "stone-01", category: "stone", label: "ITC.Base.Stone01",
    top: [124, 122, 118], bottom: [70, 68, 66], grout: [52, 50, 48],
    contrast: 34, pattern: "cobble", seed: 11
  },
  {
    id: "wood-01", category: "wood", label: "ITC.Base.Wood01",
    top: [138, 96, 54], bottom: [78, 52, 28], grout: [58, 38, 20],
    contrast: 30, pattern: "planks", seed: 23
  },
  {
    id: "snow-01", category: "snow", label: "ITC.Base.Snow01",
    top: [226, 233, 242], bottom: [150, 165, 185], grout: [178, 192, 208],
    contrast: 18, pattern: "smooth", seed: 37
  },
  {
    id: "lava-01", category: "lava", label: "ITC.Base.Lava01",
    top: [58, 46, 44], bottom: [30, 24, 24], grout: [228, 96, 28],
    contrast: 40, pattern: "cracks", seed: 51
  },
  {
    id: "sand-01", category: "sand", label: "ITC.Base.Sand01",
    top: [206, 182, 132], bottom: [140, 118, 78], grout: [166, 144, 100],
    contrast: 20, pattern: "smooth", seed: 67
  },
  {
    id: "metal-01", category: "metal", label: "ITC.Base.Metal01",
    top: [136, 142, 152], bottom: [74, 80, 90], grout: [50, 55, 64],
    contrast: 26, pattern: "plates", seed: 83
  }
];

/** Devuelve 1 dentro de la elipse, 0 fuera, con antialias en el borde. */
function ellipseCoverage(dx, dy, rx, ry) {
  const d = Math.hypot(dx / rx, dy / ry);
  const edge = 1 / Math.min(rx, ry) * 1.6;
  if (d < 1 - edge) return 1;
  if (d > 1 + edge) return 0;
  return (1 + edge - d) / (2 * edge);
}

function patternValue(mat, x, y, dx, dy) {
  const { pattern, seed } = mat;

  switch (pattern) {
    case "cobble": {
      // Adoquines radiales: anillos concéntricos partidos por sectores.
      const ang = Math.atan2(dy / RY, dx / RX);
      const rad = Math.hypot(dx / RX, dy / RY);
      const ring = Math.floor(rad * 4.2);
      const sectors = 6 + ring * 5;
      const sector = Math.floor(((ang + Math.PI) / (Math.PI * 2)) * sectors);
      const jitter = hash2(ring, sector, seed);
      const ringEdge = Math.abs(rad * 4.2 - ring - 0.5);
      const sectEdge = Math.abs(((ang + Math.PI) / (Math.PI * 2)) * sectors - sector - 0.5);
      const isGrout = ringEdge > 0.42 || sectEdge > 0.44;
      return { tone: jitter * 0.5 + 0.35, grout: isGrout };
    }
    case "planks": {
      const plank = Math.floor((dy / RY) * 5.5);
      const jitter = hash2(plank, 0, seed);
      const edge = Math.abs((dy / RY) * 5.5 - plank - 0.5);
      const grain = fbm(x * 3, y * 0.35, seed) * 0.3;
      return { tone: jitter * 0.35 + 0.4 + grain, grout: edge > 0.44 };
    }
    case "plates": {
      const gx = Math.floor((dx / RX) * 3.2);
      const gy = Math.floor((dy / RY) * 3.2);
      const jitter = hash2(gx, gy, seed);
      const ex = Math.abs((dx / RX) * 3.2 - gx - 0.5);
      const ey = Math.abs((dy / RY) * 3.2 - gy - 0.5);
      return { tone: jitter * 0.3 + 0.5, grout: ex > 0.44 || ey > 0.44 };
    }
    case "cracks": {
      // Las fronteras de las celdas Worley forman la red de grietas. Se
      // perturban con ruido para que no se vean rectas ni regulares.
      const warp = (fbm(x, y, seed + 3) - 0.5) * 18;
      const edge = cellEdge(x + warp, y + warp, 46, seed);

      const crack = edge < 0.045;
      // Halo: cerca de la grieta la roca está caliente y aclara.
      const heat = Math.max(0, 1 - edge / 0.22);
      const grain = fbm(x, y, seed + 41);

      return { tone: grain * 0.35 + 0.15, grout: crack, heat };
    }
    default: {
      const n = fbm(x, y, seed);
      return { tone: n * 0.7 + 0.2, grout: false };
    }
  }
}

function generate(mat) {
  const rgba = Buffer.alloc(SIZE * SIZE * 4, 0);

  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      const i = (y * SIZE + x) * 4;
      const dx = x + 0.5 - CX;
      const dy = y + 0.5 - CY;

      // --- Cara superior (la elipse de contacto) ---
      const topCov = ellipseCoverage(dx, dy, RX, RY);

      // --- Lateral: elipse desplazada hacia abajo para dar grosor ---
      const sideCov = ellipseCoverage(dx, dy - THICKNESS, RX, RY);

      if (topCov <= 0 && sideCov <= 0) continue;

      let r;
      let g;
      let b;
      let a;

      if (topCov > 0) {
        const { tone, grout, heat = 0 } = patternValue(mat, x, y, dx, dy);
        const src = grout ? mat.grout : mat.top;

        // Sombreado radial: los bordes de la peana caen algo más oscuros.
        const rad = Math.hypot(dx / RX, dy / RY);
        const shade = 1 - rad * 0.22;
        const variation = (tone - 0.5) * (mat.contrast / 255) * 2;

        r = Math.round(Math.min(255, Math.max(0, src[0] * shade + variation * 255)));
        g = Math.round(Math.min(255, Math.max(0, src[1] * shade + variation * 255)));
        b = Math.round(Math.min(255, Math.max(0, src[2] * shade + variation * 255)));
        a = Math.round(topCov * 255);

        // La lava brilla en las grietas, con un halo caliente alrededor.
        if (mat.pattern === "cracks") {
          if (grout) {
            r = 255;
            g = 168;
            b = 56;
          } else if (heat > 0) {
            r = Math.round(Math.min(255, r + heat * 165));
            g = Math.round(Math.min(255, g + heat * 62));
            b = Math.round(Math.min(255, b + heat * 12));
          }
        }
      } else {
        // Lateral: más oscuro y con vetas verticales suaves.
        const streak = fbm(x * 2, y * 0.5, mat.seed + 99) * 0.25;
        const depth = Math.max(0, Math.min(1, (dy - THICKNESS * 0.2) / (RY + THICKNESS)));
        const k = 1 - depth * 0.45 + streak * 0.3;

        r = Math.round(Math.max(0, Math.min(255, mat.bottom[0] * k)));
        g = Math.round(Math.max(0, Math.min(255, mat.bottom[1] * k)));
        b = Math.round(Math.max(0, Math.min(255, mat.bottom[2] * k)));
        a = Math.round(sideCov * 255);
      }

      rgba[i] = r;
      rgba[i + 1] = g;
      rgba[i + 2] = b;
      rgba[i + 3] = a;
    }
  }

  return encodePNG(rgba, SIZE, SIZE);
}

// --- Escritura -------------------------------------------------------------

const outRoot = process.argv[2];
if (!outRoot) {
  console.error("Uso: node genbases.js <carpeta-assets/bases>");
  process.exit(1);
}

const manifest = {
  version: 1,
  categories: [
    { id: "stone", label: "ITC.BaseCat.Stone", icon: "fa-cube" },
    { id: "wood", label: "ITC.BaseCat.Wood", icon: "fa-tree" },
    { id: "snow", label: "ITC.BaseCat.Snow", icon: "fa-snowflake" },
    { id: "lava", label: "ITC.BaseCat.Lava", icon: "fa-fire" },
    { id: "sand", label: "ITC.BaseCat.Sand", icon: "fa-hourglass" },
    { id: "metal", label: "ITC.BaseCat.Metal", icon: "fa-shield-halved" }
  ],
  bases: []
};

for (const mat of MATERIALS) {
  const dir = path.join(outRoot, mat.category);
  fs.mkdirSync(dir, { recursive: true });

  const file = path.join(dir, `${mat.id}.png`);
  fs.writeFileSync(file, generate(mat));

  manifest.bases.push({
    id: mat.id,
    category: mat.category,
    label: mat.label,
    src: `assets/bases/${mat.category}/${mat.id}.png`,
    thumb: null,
    // Contacto exacto, no estimado: la elipse se dibujó en estas coordenadas.
    contact: {
      cx: CX / SIZE,
      cy: CY / SIZE,
      rx: RX / SIZE,
      ry: RY / SIZE
    },
    ratio: RATIO
  });

  console.log(`  ✓ ${mat.id}.png`);
}

fs.writeFileSync(path.join(outRoot, "bases.json"), JSON.stringify(manifest, null, 2));

// Verificación de la regla R3 sobre lo que acabamos de escribir.
const check = manifest.bases[0].contact;
const aspect = (check.rx * SIZE) / (check.ry * SIZE);
console.log(`\nR3: aspecto de la elipse = ${aspect.toFixed(6)} · exigido = ${RATIO.toFixed(6)}`);
console.log(`    desviación = ${Math.abs(aspect - RATIO).toExponential(2)}`);
