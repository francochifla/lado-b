// Servicios externos gratuitos y sin cuenta: SponsorBlock y el reproductor de YouTube.

// Título y canal de un video, sin a-Shell: YouTube permite esta consulta
// desde otras páginas. No trae la duración ni sirve para playlists, y falla
// (401) si el video no se puede insertar en otras páginas.
export async function datosDeVideo(id) {
  const url = `https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(`https://www.youtube.com/watch?v=${id}`)}`;
  const r = await fetch(url, { signal: AbortSignal.timeout(6000) });
  if (!r.ok) throw new Error(`oEmbed ${r.status}`);
  const d = await r.json();
  return { i: id, t: d.title || "", c: d.author_name || "" };
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
