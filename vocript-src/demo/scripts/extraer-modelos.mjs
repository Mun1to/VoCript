// Saca el catálogo de modelos del backend de Rust y lo deja en un JSON que
// lee el simulador de la demo.
//
// Por qué se extrae en vez de copiarse: una copia a mano se queda vieja en
// cuanto se añade un modelo, y la pantalla "Modelos" de la demo enseñaría un
// catálogo que la app ya no tiene. Esto se regenera en cada build.
//
// Se lanza solo desde `pnpm run build:demo`. Si el formato de `model.rs`
// cambiara tanto que no se pueda leer, el script FALLA en vez de escribir un
// catálogo a medias: es preferible romper el build a publicar una demo que
// miente.
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const aqui = dirname(fileURLToPath(import.meta.url));
const origen = resolve(aqui, "../../src-tauri/src/managers/model.rs");
const destino = resolve(aqui, "../src/simulador/modelos.generado.json");

const rust = readFileSync(origen, "utf8");

// 1. Las listas de idiomas, que los modelos referencian por nombre de variable.
const idiomas = {};
for (const m of rust.matchAll(/let (\w+): Vec<String> =\s*(?:vec!\[)?([\s\S]*?)\]/g)) {
  const valores = [...m[2].matchAll(/"([a-z-]{2,7})"/g)].map((x) => x[1]);
  if (valores.length) idiomas[m[1]] = valores;
}

// 2. Los bloques `ModelInfo { ... }`, recortados contando llaves (el contenido
//    tiene llaves anidadas y un regex no vago se comería el archivo entero).
const bloques = [];
for (const m of rust.matchAll(/ModelInfo \{/g)) {
  let profundidad = 1;
  let i = m.index + m[0].length;
  while (i < rust.length && profundidad > 0) {
    if (rust[i] === "{") profundidad++;
    else if (rust[i] === "}") profundidad--;
    i++;
  }
  bloques.push(rust.slice(m.index + m[0].length, i - 1));
}

const texto = (bloque, campo) => {
  const m = bloque.match(new RegExp(String.raw`\b${campo}:\s*(?:Some\(\s*)?"([^"]*)"`));
  return m ? m[1] : null;
};
const numero = (bloque, campo) => {
  const m = bloque.match(new RegExp(String.raw`\b${campo}:\s*([0-9.]+)`));
  return m ? Number(m[1]) : 0;
};
const booleano = (bloque, campo) => {
  const m = bloque.match(new RegExp(String.raw`\b${campo}:\s*(true|false)`));
  return m ? m[1] === "true" : false;
};

const modelos = [];
const vistos = new Set();
for (const bloque of bloques) {
  const id = texto(bloque, "id");
  const name = texto(bloque, "name");
  // El archivo repite algún modelo en rutas de código secundarias: vale la
  // primera aparición, que es la del catálogo.
  if (!id || !name || vistos.has(id)) continue;
  vistos.add(id);

  const refIdiomas = bloque.match(/supported_languages:\s*(\w+)/);
  const literalIdiomas = bloque.match(/supported_languages:\s*vec!\[([^\]]*)\]/);

  modelos.push({
    id,
    name,
    description: texto(bloque, "description") ?? "",
    filename: texto(bloque, "filename") ?? "",
    url: null,
    sha256: null,
    size_mb: numero(bloque, "size_mb"),
    is_downloaded: false,
    is_downloading: false,
    partial_size: 0,
    is_directory: booleano(bloque, "is_directory"),
    engine_type: (bloque.match(/engine_type:\s*EngineType::(\w+)/) ?? [, "Whisper"])[1],
    accuracy_score: numero(bloque, "accuracy_score"),
    speed_score: numero(bloque, "speed_score"),
    supports_translation: booleano(bloque, "supports_translation"),
    is_recommended: booleano(bloque, "is_recommended"),
    supported_languages: literalIdiomas
      ? [...literalIdiomas[1].matchAll(/"([a-z-]{2,7})"/g)].map((x) => x[1])
      : (idiomas[refIdiomas?.[1]] ?? []),
    supports_language_selection: booleano(bloque, "supports_language_selection"),
    is_custom: false,
  });
}

if (modelos.length < 10) {
  console.error(
    `[demo] Solo se han leido ${modelos.length} modelos de ${origen}.` +
      " El formato de model.rs habra cambiado: revisa extraer-modelos.mjs.",
  );
  process.exit(1);
}

writeFileSync(destino, JSON.stringify(modelos, null, 2) + "\n");
console.log(`[demo] ${modelos.length} modelos extraidos a modelos.generado.json`);
