/**
 * Verificación estática del módulo:
 *  1. cada import resuelve a un fichero existente
 *  2. cada nombre importado existe como export en el fichero de destino
 *  3. no hay ciclos de dependencia
 *  4. la regla de capas se respeta (una capa sólo importa de capas inferiores)
 */
const fs = require("fs");
const path = require("path");

// Absoluto siempre: `walk` y `path.resolve` de los imports deben producir la
// misma forma de ruta, o el mapa de exports no casa y todo parece roto.
const ROOT = path.resolve(process.argv[2] ?? ".");
const SCRIPTS = path.join(ROOT, "scripts");

/**
 * Nivel de cada carpeta. Una carpeta sólo puede importar de un nivel <= al suyo.
 *
 * `config` y `core` comparten nivel 0 a propósito: constants y Logger se
 * necesitan mutuamente y forman el núcleo indivisible.
 *
 * `integration` está en el nivel 1, no arriba: los adaptadores
 * (IsoPerspectiveBridge, SystemAdapter) son servicios de lectura que sólo
 * dependen del núcleo, y el modelo y el exportador los consultan.
 */
const LAYER_OF = {
  config: 0, core: 0,
  // `license` comparte nivel con `integration` por el mismo motivo: es un
  // servicio que sólo consulta al núcleo (constants y Logger) y no sabe nada
  // del modelo ni del editor. Declararlo importa: una carpeta ausente de este
  // mapa no se comprueba, y quedaría fuera de la regla sin que nadie lo note.
  integration: 1, license: 1,
  model: 2,
  commands: 3,
  render: 4,
  canvas: 5,
  export: 6,
  io: 7,
  assets: 8,
  apps: 9
};
const LAYERS = Object.keys(LAYER_OF);

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (entry.name.endsWith(".js")) out.push(full);
  }
  return out;
}

const files = walk(SCRIPTS);
const errors = [];
const warnings = [];

/** Extrae los exports con nombre de un fichero. */
function getExports(src) {
  const names = new Set();
  const patterns = [
    /export\s+(?:async\s+)?function\s+([A-Za-z0-9_$]+)/g,
    /export\s+class\s+([A-Za-z0-9_$]+)/g,
    /export\s+const\s+([A-Za-z0-9_$]+)/g,
    /export\s+let\s+([A-Za-z0-9_$]+)/g
  ];
  for (const re of patterns) {
    let m;
    while ((m = re.exec(src))) names.add(m[1]);
  }
  // export { A, B as C }
  const braceRe = /export\s*\{([^}]*)\}/g;
  let m;
  while ((m = braceRe.exec(src))) {
    for (const part of m[1].split(",")) {
      const bit = part.trim();
      if (!bit) continue;
      const asMatch = bit.match(/\s+as\s+([A-Za-z0-9_$]+)$/);
      names.add(asMatch ? asMatch[1] : bit);
    }
  }
  return names;
}

const exportMap = new Map();
const sources = new Map();
for (const f of files) {
  const src = fs.readFileSync(f, "utf8");
  sources.set(f, src);
  exportMap.set(f, getExports(src));
}

const graph = new Map();

for (const file of files) {
  const src = sources.get(file);
  const dir = path.dirname(file);
  graph.set(file, []);

  const importRe = /import\s+(?:([^"']+?)\s+from\s+)?["'](\.[^"']+)["']/g;
  let m;
  while ((m = importRe.exec(src))) {
    const clause = m[1] ?? "";
    const spec = m[2];
    const target = path.resolve(dir, spec);

    if (!fs.existsSync(target)) {
      errors.push(`${path.relative(ROOT, file)} → import inexistente: ${spec}`);
      continue;
    }
    graph.get(file).push(target);

    // Nombres importados
    const braces = clause.match(/\{([^}]*)\}/);
    if (braces) {
      const available = exportMap.get(target) ?? new Set();
      for (const part of braces[1].split(",")) {
        const bit = part.trim();
        if (!bit) continue;
        const name = bit.split(/\s+as\s+/)[0].trim();
        if (!available.has(name)) {
          errors.push(
            `${path.relative(ROOT, file)} → "${name}" no está exportado por ${path.relative(ROOT, target)}`
          );
        }
      }
    }

    // Regla de capas
    const folderOf = (p) => path.relative(SCRIPTS, p).split(path.sep)[0];
    const fa = folderOf(file);
    const fb = folderOf(target);
    const a = LAYER_OF[fa];
    const b = LAYER_OF[fb];
    if (a !== undefined && b !== undefined && b > a) {
      warnings.push(
        `capa: ${path.relative(ROOT, file)} (${fa}, nivel ${a}) importa de ${fb} (nivel ${b}) — capa superior`
      );
    }
  }
}

// Ciclos
const WHITE = 0, GREY = 1, BLACK = 2;
const color = new Map(files.map((f) => [f, WHITE]));
const cycles = [];

function dfs(node, stack) {
  color.set(node, GREY);
  stack.push(node);
  for (const next of graph.get(node) ?? []) {
    if (color.get(next) === GREY) {
      const start = stack.indexOf(next);
      cycles.push(stack.slice(start).concat(next).map((p) => path.relative(SCRIPTS, p)).join(" → "));
    } else if (color.get(next) === WHITE) {
      dfs(next, stack);
    }
  }
  stack.pop();
  color.set(node, BLACK);
}

for (const f of files) if (color.get(f) === WHITE) dfs(f, []);

// --- Informe ---
console.log(`Ficheros analizados: ${files.length}\n`);

if (errors.length) {
  console.log(`ERRORES (${errors.length}):`);
  for (const e of errors) console.log(`  ✗ ${e}`);
} else {
  console.log("✓ Todos los imports resuelven y todos los nombres existen.");
}

if (cycles.length) {
  console.log(`\nCICLOS (${cycles.length}):`);
  for (const c of [...new Set(cycles)]) console.log(`  ✗ ${c}`);
} else {
  console.log("✓ Sin ciclos de dependencia.");
}

if (warnings.length) {
  console.log(`\nAVISOS DE CAPA (${warnings.length}):`);
  for (const w of [...new Set(warnings)]) console.log(`  ! ${w}`);
} else {
  console.log("✓ La regla de capas se respeta.");
}

process.exit(errors.length ? 1 : 0);
