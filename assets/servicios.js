// Servicios externos gratuitos y sin cuenta: iTunes, SponsorBlock y el reproductor de YouTube.

let contador = 0;

// La API de iTunes acepta JSONP, que evita los bloqueos entre sitios del navegador.
function jsonp(url, espera = 9000) {
  return new Promise((ok, mal) => {
    const nombre = `__itunes${++contador}`;
    const script = document.createElement("script");
    const limpiar = () => {
      delete window[nombre];
      script.remove();
      clearTimeout(reloj);
    };
    const reloj = setTimeout(() => {
      limpiar();
      mal(new Error("iTunes no respondió"));
    }, espera);
    window[nombre] = (datos) => {
      limpiar();
      ok(datos);
    };
    script.onerror = () => {
      limpiar();
      mal(new Error("No se pudo conectar con iTunes"));
    };
    script.src = `${url}&callback=${nombre}`;
    document.head.append(script);
  });
}

const portadaGrande = (url) => (url || "").replace(/\/\d+x\d+bb\./, "/600x600bb.");
const anio = (fecha) => (fecha || "").slice(0, 4);

export async function buscarTemas(termino) {
  const url = `https://itunes.apple.com/search?media=music&entity=song&limit=8&term=${encodeURIComponent(termino)}`;
  const { results = [] } = await jsonp(url);
  return results.map((r) => ({
    title: r.trackName,
    artist: r.artistName,
    album: r.collectionName,
    albumArtist: r.collectionArtistName || r.artistName,
    year: anio(r.releaseDate),
    genre: r.primaryGenreName || "",
    track: r.trackNumber ? String(r.trackNumber) : "",
    portada: portadaGrande(r.artworkUrl100),
    miniatura: r.artworkUrl100,
  }));
}

export async function buscarAlbumes(termino) {
  const url = `https://itunes.apple.com/search?media=music&entity=album&limit=8&term=${encodeURIComponent(termino)}`;
  const { results = [] } = await jsonp(url);
  return results.map((r) => ({
    album: r.collectionName,
    albumArtist: r.artistName,
    year: anio(r.releaseDate),
    genre: r.primaryGenreName || "",
    cantidad: r.trackCount,
    portada: portadaGrande(r.artworkUrl100),
    miniatura: r.artworkUrl100,
  }));
}

// SponsorBlock es una base comunitaria que marca las partes sin música de los
// videoclips. Solo se usan las del principio y el final.
export async function sugerirRecorte(id, duracion) {
  const categorias = encodeURIComponent('["music_offtopic"]');
  const r = await fetch(`https://sponsor.ajay.app/api/skipSegments?videoID=${id}&categories=${categorias}`);
  if (r.status === 404) return null;
  if (!r.ok) throw new Error("SponsorBlock no respondió");
  const segmentos = await r.json();
  const total = segmentos[0]?.videoDuration || duracion;
  let start = null;
  let end = null;
  for (const { segment: [desde, hasta] } of segmentos) {
    if (desde < 3) start = Math.max(start ?? 0, hasta);
    else if (total && hasta > total - 3) end = Math.min(end ?? Infinity, desde);
  }
  if (start == null && end == null) return null;
  return { start, end: end === Infinity ? null : end };
}

let apiYouTube;

export function cargarYouTube() {
  apiYouTube ??= new Promise((ok, mal) => {
    if (window.YT?.Player) return ok(window.YT);
    window.onYouTubeIframeAPIReady = () => ok(window.YT);
    const script = document.createElement("script");
    script.src = "https://www.youtube.com/iframe_api";
    script.onerror = () => {
      apiYouTube = null;
      mal(new Error("No se pudo cargar YouTube"));
    };
    document.head.append(script);
  });
  return apiYouTube;
}
