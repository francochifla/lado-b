// Lógica sin interfaz: limpiar títulos, tiempos, compresión y armado del trabajo.

// Palabras que sobran dentro de paréntesis o corchetes en títulos de YouTube.
const RELLENO = new Set([
  "official", "oficial", "video", "videoclip", "clip", "music", "musical", "audio",
  "lyric", "lyrics", "letra", "visualizer", "visualiser", "hd", "hq", "4k", "mv", "pseudo",
]);
const SEPARADOR = /\s+[-–—]\s+/;

function limpiarGrupo(contenido) {
  const palabras = contenido.split(/[\s/]+/).filter(Boolean);
  const utiles = palabras.filter((p) => !RELLENO.has(p.toLowerCase().replace(/[^a-z0-9?]/g, "")));
  // "(Official Video)" desaparece entero; "(HQ Instrumental)" queda como "(Instrumental)".
  if (utiles.length === 0) return null;
  if (utiles.length === palabras.length) return contenido;
  // Si lo único que queda son conectores sueltos, el grupo era relleno.
  if (utiles.every((p) => ["de", "del", "y", "and", "&", "-"].includes(p.toLowerCase()))) return null;
  return utiles.join(" ");
}

export function limpiarTitulo(texto) {
  let t = (texto || "").replace(/[＜]/g, "<").replace(/[＞]/g, ">");
  t = t.replace(/[(\[]([^()\[\]]*)[)\]]/g, (todo, adentro) => {
    const limpio = limpiarGrupo(adentro.trim());
    if (limpio === null) return "";
    return todo[0] + limpio + (todo[0] === "(" ? ")" : "]");
  });
  t = t.replace(/\s*\|\s*$/, "").replace(/\s{2,}/g, " ").trim();
  return t.replace(/[\s\-–—|]+$/, "").trim();
}

export function quitarTopic(canal) {
  return (canal || "").replace(/\s+-\s+Topic$/i, "").trim();
}

// Arma un tema editable a partir de lo que mandó el script.
export function temaDesdeItem(it) {
  const limpio = limpiarTitulo(it.t);
  let artista = it.ar || "";
  let titulo = it.tr || "";
  if (!titulo) {
    const partes = limpio.split(SEPARADOR);
    if (partes.length >= 2 && !artista) {
      artista = partes.shift().trim();
      titulo = partes.join(" - ").trim();
    } else {
      titulo = limpio;
    }
  }
  if (!artista && /\s+-\s+Topic$/i.test(it.c || "")) artista = quitarTopic(it.c);
  return {
    id: it.i,
    ytTitulo: it.t,
    canal: it.c || "",
    dur: it.d || 0,
    title: titulo,
    artist: artista,
    album: it.al || "",
    albumArtist: "",
    year: it.y ? String(it.y) : "",
    genre: "",
    track: "",
    cover: { t: "yt", v: it.i },
    start: null,
    end: null,
    sel: true,
  };
}

const MINUSCULAS = new Set(["a", "de", "del", "el", "la", "las", "los", "y", "o", "en", "the", "of", "and", "or", "in", "on", "to", "for", "feat.", "ft.", "vs."]);

export function tipoTitulo(texto) {
  return (texto || "")
    .toLowerCase()
    .split(" ")
    // La primera letra, aunque venga después de un paréntesis: "(instrumental)" → "(Instrumental)".
    .map((p, i) => (i > 0 && MINUSCULAS.has(p) ? p : p.replace(/\p{L}/u, (l) => l.toUpperCase())))
    .join(" ");
}

export const esMayusculas = (t) => !!t && t === t.toUpperCase() && /[A-ZÁÉÍÓÚÑ]{3}/.test(t);

// ------------------------------------------------------------------ tiempos

export function formatoTiempo(seg) {
  if (seg == null || isNaN(seg)) return "";
  seg = Math.max(0, Math.round(seg));
  const h = Math.floor(seg / 3600);
  const m = Math.floor((seg % 3600) / 60);
  const s = String(seg % 60).padStart(2, "0");
  return h ? `${h}:${String(m).padStart(2, "0")}:${s}` : `${m}:${s}`;
}

export function leerTiempo(texto) {
  texto = (texto || "").trim().replace(",", ".");
  if (!texto) return null;
  const partes = texto.split(":").map(Number);
  if (partes.some(isNaN)) return undefined;
  return partes.reduce((total, p) => total * 60 + p, 0);
}

export function duracionFinal(t) {
  const fin = t.end ?? t.dur;
  return Math.max(0, (fin || 0) - (t.start || 0));
}

// -------------------------------------------------------------- compresión

function aBase64Url(bytes) {
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function desdeBase64Url(texto) {
  const b64 = texto.replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(b64 + "===".slice((b64.length + 3) % 4));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

async function pasarPor(stream, bytes) {
  const respuesta = new Response(new Blob([bytes]).stream().pipeThrough(stream));
  return new Uint8Array(await respuesta.arrayBuffer());
}

export async function comprimir(objeto) {
  const bytes = new TextEncoder().encode(JSON.stringify(objeto));
  return aBase64Url(await pasarPor(new CompressionStream("deflate-raw"), bytes));
}

export async function descomprimir(texto) {
  const bytes = await pasarPor(new DecompressionStream("deflate-raw"), desdeBase64Url(texto));
  return JSON.parse(new TextDecoder().decode(bytes));
}

// --------------------------------------------------------- trabajo de descarga

export function armarTrabajo(temas, ajustes) {
  const covers = {};
  const claves = new Map();
  const tracks = temas.map((t) => {
    let cover = null;
    if (t.cover) {
      const firma = t.cover.t + ":" + t.cover.v;
      if (!claves.has(firma)) {
        const clave = String(claves.size + 1);
        claves.set(firma, clave);
        covers[clave] = t.cover;
      }
      cover = claves.get(firma);
    }
    const tema = { id: t.id, title: t.title.trim(), artist: t.artist.trim(), cover };
    for (const campo of ["album", "albumArtist", "year", "genre", "track"]) {
      const valor = String(t[campo] || "").trim();
      if (valor) tema[campo] = valor;
    }
    if (t.start) tema.start = t.start;
    if (t.end && t.end < t.dur) tema.end = t.end;
    return tema;
  });

  // "3/12": total de pistas por álbum, para las apps que lo muestran.
  const porAlbum = {};
  for (const t of tracks) if (t.album && t.track) porAlbum[t.album] = (porAlbum[t.album] || 0) + 1;
  for (const t of tracks) if (t.album && t.track && porAlbum[t.album] > 1) t.total = porAlbum[t.album];

  return {
    v: 1,
    q: ajustes.calidad,
    name: ajustes.patron,
    silence: ajustes.silencio,
    shortcut: ajustes.atajo,
    covers,
    tracks,
  };
}

export function linkAtajo(nombre, texto) {
  return `shortcuts://run-shortcut?name=${encodeURIComponent(nombre)}&input=text&text=${encodeURIComponent(texto)}`;
}

// Imagen subida por el usuario: recorte cuadrado al centro y JPEG liviano,
// porque viaja dentro del link al atajo.
export async function portadaDesdeArchivo(archivo, lado = 500) {
  const url = URL.createObjectURL(archivo);
  try {
    const img = await new Promise((ok, mal) => {
      const i = new Image();
      i.onload = () => ok(i);
      i.onerror = mal;
      i.src = url;
    });
    const corte = Math.min(img.naturalWidth, img.naturalHeight);
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = lado;
    canvas.getContext("2d").drawImage(
      img, (img.naturalWidth - corte) / 2, (img.naturalHeight - corte) / 2, corte, corte, 0, 0, lado, lado);
    return canvas.toDataURL("image/jpeg", 0.78);
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function urlPortada(cover, chica = false) {
  if (!cover) return "";
  // hqdefault y sddefault traen franjas negras; mqdefault y maxresdefault no.
  if (cover.t === "yt") return `https://i.ytimg.com/vi/${cover.v}/${chica ? "mqdefault" : "maxresdefault"}.jpg`;
  return cover.v;
}
