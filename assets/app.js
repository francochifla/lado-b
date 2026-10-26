import { CONFIG } from "./config.js";
import {
  armarTrabajo, comprimir, descomprimir, duracionFinal, esMayusculas, formatoTiempo, leerTiempo,
  linkAShell, portadaDesdeArchivo, temaDesdeItem, textoABase64Url, tipoTitulo, urlPortada,
} from "./datos.js";
import { cargarYouTube, sugerirRecorte } from "./servicios.js";

const $ = (sel, raiz = document) => raiz.querySelector(sel);
const $$ = (sel, raiz = document) => [...raiz.querySelectorAll(sel)];
const app = $("#app");
const pie = $("#pie");
const hoja = $("#hoja");
const archivoTapa = $("#archivo-tapa");

const esc = (t) => String(t ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

const ICONOS = {
  cerrar: '<path d="M6 6l12 12M18 6L6 18"/>',
  izq: '<path d="M15 5l-7 7 7 7"/>',
  der: '<path d="M9 5l7 7-7 7"/>',
  flecha: '<path d="M9 6l6 6-6 6"/>',
  subir: '<path d="M12 16V4M7 9l5-5 5 5M5 20h14"/>',
  nada: '<circle cx="12" cy="12" r="8"/><path d="M6.5 17.5l11-11"/>',
  compartir: '<path d="M12 3v12M8 7l4-4 4 4M6 11H5a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-8a1 1 0 0 0-1-1h-1"/>',
  sumar: '<rect x="4" y="4" width="16" height="16" rx="4"/><path d="M12 8v8M8 12h8"/>',
  herramientas: '<path d="M4 6h16M4 12h10M4 18h6"/>',
  lapiz: '<path d="M4 20h4L19 9l-4-4L4 16v4zM13.5 6.5l4 4"/>',
};
const icono = (n, extra = "") => `<svg class="i" viewBox="0 0 24 24" aria-hidden="true" ${extra}>${ICONOS[n]}</svg>`;

// ------------------------------------------------------------ almacenamiento

const guardado = {
  leer(clave, defecto = null) {
    try {
      const v = localStorage.getItem("ladob:" + clave);
      return v == null ? defecto : JSON.parse(v);
    } catch {
      return defecto;
    }
  },
  escribir(clave, valor) {
    try {
      localStorage.setItem("ladob:" + clave, JSON.stringify(valor));
    } catch {
      // Sin almacenamiento (modo privado o lleno): la app sigue andando, solo no recuerda.
    }
  },
  borrar(clave) {
    try {
      localStorage.removeItem("ladob:" + clave);
    } catch {}
  },
};

const AJUSTES_BASE = { calidad: 192, patron: "{artista} - {titulo}", silencio: false, app: "ashellmini", tema: "auto" };

const estado = {
  sesion: null,
  ajustes: { ...AJUSTES_BASE, ...guardado.leer("ajustes", {}) },
  editando: null,
  reproductor: null,
};

const temas = () => estado.sesion?.temas ?? [];
const elegidos = () => temas().filter((t) => t.sel);

function hash(texto) {
  let h = 5381;
  for (const c of texto) h = ((h * 33) ^ c.codePointAt(0)) >>> 0;
  return h.toString(36);
}

let reloj;
function guardar() {
  clearTimeout(reloj);
  reloj = setTimeout(() => {
    const s = estado.sesion;
    if (!s) return;
    guardado.escribir("s:" + s.clave, s);
    guardado.escribir("actual", s.clave);
    const recientes = guardado.leer("recientes", []).filter((r) => r.clave !== s.clave);
    recientes.unshift({ clave: s.clave, titulo: tituloSesion(), n: s.temas.length, tapa: s.temas[0]?.id, ts: Date.now() });
    for (const viejo of recientes.splice(8)) guardado.borrar("s:" + viejo.clave);
    guardado.escribir("recientes", recientes);
  }, 250);
}

function tituloSesion() {
  const s = estado.sesion;
  if (!s) return "";
  if (s.pl) return s.pl;
  const t = s.temas[0];
  return t ? [t.artist, t.title].filter(Boolean).join(" - ") : "Sin título";
}

// ------------------------------------------------------------------- avisos

let relojAviso;
function avisar(texto, ms = 2600) {
  $(".aviso-toast")?.remove();
  const el = document.createElement("div");
  el.className = "aviso-toast";
  el.setAttribute("role", "status");
  el.textContent = texto;
  document.body.append(el);
  clearTimeout(relojAviso);
  relojAviso = setTimeout(() => el.remove(), ms);
}

// ------------------------------------------------------------------- casete

function casete(titulo, sub) {
  const rayitas = Array.from({ length: 3 }, (_, i) => `<line class="rayita" x1="44" x2="316" y1="${74 + i * 13}" y2="${74 + i * 13}"/>`).join("");
  const carrete = (x) => `
    <circle class="carrete" cx="${x}" cy="134" r="20"/>
    <g class="giro">${[0, 60, 120].map((a) => `<rect x="${x - 1.5}" y="117" width="3" height="34" rx="1.5" fill="currentColor" transform="rotate(${a} ${x} 134)"/>`).join("")}</g>
    <circle cx="${x}" cy="134" r="6" fill="currentColor"/>`;
  return `
  <svg class="casete" viewBox="0 0 360 220" role="img" aria-label="Casete: ${esc(titulo)}">
    <rect class="carcasa" x="4" y="4" width="352" height="212" rx="16"/>
    <rect class="etiqueta" x="28" y="22" width="304" height="136" rx="8"/>
    <rect class="r1" x="28.75" y="160" width="302.5" height="10"/>
    <rect class="r2" x="28.75" y="170" width="302.5" height="10"/>
    <rect class="r3" x="28.75" y="180" width="302.5" height="10"/>
    <text class="sub-casete" x="44" y="44">LADO B · ${esc(sub)}</text>
    <text class="titulo-casete" x="44" y="66" ${titulo.length > 22 ? 'textLength="272" lengthAdjust="spacingAndGlyphs"' : ""}>${esc(recortar(titulo, 32))}</text>
    ${rayitas}
    <rect class="ventana" x="104" y="112" width="152" height="44" rx="22"/>
    <path class="cinta" d="M130 156 Q180 146 230 156 Z"/>
    ${carrete(130)}${carrete(230)}
    <circle cx="40" cy="200" r="5" fill="currentColor" opacity=".25"/><circle cx="320" cy="200" r="5" fill="currentColor" opacity=".25"/>
  </svg>`;
}

const recortar = (t, n) => (t.length > n ? t.slice(0, n - 1) + "…" : t);

// -------------------------------------------------------------- vista inicio

function vistaInicio() {
  const recientes = guardado.leer("recientes", []);
  return `
  <section class="inicio">
    <div>
      <h1>De YouTube a tu biblioteca, <em>con nombre y portada.</em></h1>
      <p class="bajada">Pasá un video o una playlist, ordená los datos de cada tema y bajalos como mp3 directo a tu iPhone.</p>
    </div>
    ${casete("Tu próxima playlist", "C-90")}
    <form class="pegar" data-form="link">
      <label class="campo">
        <span>Link de YouTube</span>
        <div class="fila">
          <input class="entrada" name="link" type="url" inputmode="url" autocomplete="off" placeholder="https://youtube.com/..." required>
          <button class="boton suave" type="button" data-accion="pegar">Pegar</button>
        </div>
      </label>
      <button class="boton primario ancho" type="submit">Leer link</button>
      <p class="nota">En YouTube: <b>Compartir</b> → <b>Copiar enlace</b>, y pegalo acá. Safari va a preguntar si abrir a-Shell mini: tocá <b>Abrir</b>.</p>
    </form>
    <ol class="pasos tarjeta" aria-label="Cómo funciona">
      <li><span><b>Pegá el link</b> de un video o una playlist.</span></li>
      <li><span><b>Editá</b> título, artista, álbum y portada. Recortá intros si hace falta.</span></li>
      <li><span><b>Descargá</b>. Los mp3 quedan en tu carpeta, listos para Spotify.</span></li>
    </ol>
    ${recientes.length ? `
    <div class="tarjeta">
      <h2>Recientes</h2>
      <ul class="recientes">
        ${recientes.map((r) => `
          <li><button data-accion="abrir-reciente" data-clave="${esc(r.clave)}">
            <img src="https://i.ytimg.com/vi/${esc(r.tapa)}/mqdefault.jpg" alt="" loading="lazy">
            <span style="min-width:0"><div class="t">${esc(r.titulo)}</div><div class="s">${r.n} ${r.n === 1 ? "tema" : "temas"} · ${new Date(r.ts).toLocaleDateString("es")}</div></span>
          </button></li>`).join("")}
      </ul>
    </div>` : ""}
    ${enPantallaDeInicio() ? "" : `
    <div class="tarjeta agregar">
      <img src="assets/icono-180.png" alt="" width="56" height="56">
      <span><b>Tenelo a mano</b><small>Sumá Lado B a tu pantalla de inicio, con su casete.</small></span>
      <button class="boton chico" data-accion="agregar-inicio">${icono("sumar")}Agregar a inicio</button>
    </div>`}
    <p class="nota">¿Primera vez? <button class="enlace" data-accion="tutorial">Mirá cómo funciona</button>.</p>
  </section>`;
}

// ----------------------------------------------------------------- vista lista

function vistaLista() {
  const s = estado.sesion;
  const lista = temas();
  const total = lista.reduce((a, t) => a + (t.dur || 0), 0);
  const focoActivo = s.foco && lista.filter((t) => t.sel).length === 1 && lista.length > 1;
  return `
  <section class="resumen">
    ${casete(tituloSesion(), `${lista.length} ${lista.length === 1 ? "tema" : "temas"} · ${formatoTiempo(total)}`)}
    ${focoActivo ? `
    <div class="aviso">
      <span>El link era de un tema dentro de una playlist. Quedó elegido solo ese.</span>
      <button class="boton chico" data-accion="todos">Elegir los ${lista.length}</button>
    </div>` : ""}
  </section>
  ${lista.length > 1 ? `
  <div class="barra">
    <input type="checkbox" class="casilla" data-accion="todos-casilla" aria-label="Elegir todos">
    <span class="cuenta" id="cuenta"></span>
    <button class="boton chico suave" data-accion="lote">${icono("lapiz")}Editar</button>
    <button class="boton chico suave" data-accion="herramientas">${icono("herramientas")}Herramientas</button>
  </div>` : ""}
  <p class="nota pista">Tocá un tema para cambiarle el nombre, el artista, el álbum, la portada o recortarlo.</p>
  <ul class="temas">
    ${lista.map((t, i) => `<li class="tema" data-i="${i}" role="button" aria-label="Editar ${esc(t.title)}">${filaTema(t)}</li>`).join("")}
  </ul>`;
}

function filaTema(t) {
  const sub = [t.artist || '<span class="falta">Sin artista</span>', t.album && esc(t.album)].filter(Boolean);
  if (t.artist) sub[0] = esc(t.artist);
  const recortado = t.start || (t.end && t.end < t.dur);
  return `
    <input type="checkbox" class="casilla" data-accion="elegir" ${t.sel ? "checked" : ""} aria-label="Elegir ${esc(t.title)}">
    ${t.cover ? `<img class="tapa" src="${esc(urlPortada(t.cover, true))}" alt="" loading="lazy">` : '<div class="tapa"></div>'}
    <div class="info">
      <div class="titulo">${t.track ? `<span class="nro">${esc(t.track)}</span>` : ""}${esc(t.title) || '<span class="falta">Sin título</span>'}</div>
      <div class="sub">${sub.join(" · ")}</div>
    </div>
    <div class="meta">
      <span>${formatoTiempo(duracionFinal(t))}</span>
      ${t.guardado ? '<span class="etiqueta-corte guardado">Guardado</span>' : recortado ? '<span class="etiqueta-corte">Recorte</span>' : ""}
    </div>
    <span class="editar" aria-hidden="true">${icono("lapiz")}</span>`;
}

function actualizarFila(i) {
  const fila = $(`.tema[data-i="${i}"]`);
  if (fila) {
    fila.innerHTML = filaTema(temas()[i]);
    fila.classList.toggle("apagado", !temas()[i].sel);
  }
}

function actualizarSeleccion() {
  const lista = temas();
  const n = elegidos().length;
  const casilla = $('[data-accion="todos-casilla"]');
  if (casilla) {
    casilla.checked = n === lista.length;
    casilla.indeterminate = n > 0 && n < lista.length;
  }
  const cuenta = $("#cuenta");
  if (cuenta) cuenta.textContent = `${n} de ${lista.length}`;
  $$(".tema").forEach((fila) => fila.classList.toggle("apagado", !lista[fila.dataset.i]?.sel));

  const segundos = elegidos().reduce((a, t) => a + duracionFinal(t), 0);
  const mb = (segundos * estado.ajustes.calidad * 1000) / 8 / 1e6;
  pie.innerHTML = `
    <div class="adentro">
      <span class="peso">${n} ${n === 1 ? "tema" : "temas"}<br>${formatoTiempo(segundos)} · ≈ ${mb < 10 ? mb.toFixed(1) : Math.round(mb)} MB</span>
      <button class="boton primario" data-accion="descargar" ${n ? "" : "disabled"}>Descargar ${n === lista.length && n > 1 ? "todo" : n === 1 ? "1 tema" : n + " temas"}</button>
    </div>`;
}

function render() {
  cerrarReproductor();
  if (estado.sesion) {
    app.innerHTML = vistaLista();
    pie.classList.remove("oculto");
    actualizarSeleccion();
  } else {
    app.innerHTML = vistaInicio();
    pie.classList.add("oculto");
  }
}

// ------------------------------------------------------------------ hojas

function abrirHoja({ titulo, cuerpo, pie: piedepagina = "", cabeza = "" }) {
  hoja.innerHTML = `
    <header class="hoja-cabeza">
      <h2>${titulo}</h2>
      ${cabeza}
      <button class="icono" data-accion="cerrar" aria-label="Cerrar">${icono("cerrar")}</button>
    </header>
    <div class="hoja-cuerpo">${cuerpo}</div>
    ${piedepagina ? `<footer class="hoja-pie">${piedepagina}</footer>` : ""}`;
  if (!hoja.open) hoja.showModal();
  $(".hoja-cuerpo", hoja).scrollTop = 0;
}

function cerrarHoja() {
  cerrarReproductor();
  estado.editando = null;
  if (hoja.open) hoja.close();
}

hoja.addEventListener("click", (e) => {
  // Tocar fuera de la hoja la cierra.
  if (e.target === hoja) cerrarHoja();
});
hoja.addEventListener("close", () => {
  cerrarReproductor();
  estado.editando = null;
});

// --------------------------------------------------------------- editor

function vistaPrevia(t) {
  const tapa = urlPortada(t.cover);
  return `
  <div class="vista" id="vista" aria-label="Así se ve en Spotify">
    <div class="disco">
      <span class="marca-n">4</span>
      ${tapa ? `<img src="${esc(tapa)}" alt="Portada" data-tapa-yt="${t.cover?.t === "yt" ? esc(t.cover.v) : ""}">` : '<div class="sin-tapa">Sin portada</div>'}
    </div>
    <div class="textos">
      <span class="v-de">Reproduciendo</span>
      <span class="v-titulo"><span class="marca-n">1</span>${esc(t.title) || '<span class="vacio">Título</span>'}</span>
      <span class="v-artista"><span class="marca-n">2</span>${esc(t.artist) || '<span class="vacio">Artista</span>'}</span>
      <span class="v-artista"><span class="marca-n">3</span>${esc(t.album) || '<span class="vacio">Álbum</span>'}</span>
    </div>
    <div class="vista-pie">Así se ve en Spotify. El álbum aparece en la lista de temas y agrupa las canciones; año, género y número de pista los usan Apple Music y otras apps.</div>
  </div>`;
}

function opcionesTapa(t) {
  const alt = t.alt || {};
  const opciones = [
    { clave: "yt", texto: "Video", cover: { t: "yt", v: t.id } },
    alt.subida && { clave: "subida", texto: "Tu imagen", cover: { t: "data", v: alt.subida } },
    alt.lote && { clave: "lote", texto: "Del lote", cover: alt.lote },
  ].filter(Boolean);
  const actual = t.cover ? t.cover.t + t.cover.v : "";
  return `
  <div class="opciones-tapa" role="group" aria-label="Portada">
    ${opciones.map((o) => `
      <button class="opcion-tapa" data-accion="tapa" data-clave="${o.clave}" aria-pressed="${actual === o.cover.t + o.cover.v}">
        <span class="cuadro" style="background-image:url('${esc(urlPortada(o.cover, true))}')"></span>${o.texto}
      </button>`).join("")}
    <button class="opcion-tapa" data-accion="subir-tapa"><span class="cuadro">${icono("subir")}</span>Subir</button>
    <button class="opcion-tapa" data-accion="tapa" data-clave="ninguna" aria-pressed="${!t.cover}"><span class="cuadro">${icono("nada")}</span>Ninguna</button>
  </div>`;
}

function campo(nombre, etiqueta, valor, { n, ayuda, tipo = "text", modo } = {}) {
  return `
  <label class="campo">
    <span>${n ? `<i class="marca-n">${n}</i>` : ""}${etiqueta}</span>
    <input class="entrada" data-campo="${nombre}" value="${esc(valor)}" type="${tipo}" ${modo ? `inputmode="${modo}"` : ""} autocomplete="off" autocapitalize="words" spellcheck="false">
    ${ayuda ? `<small>${ayuda}</small>` : ""}
  </label>`;
}

function abrirEditor(i) {
  const lista = temas();
  const t = lista[i];
  estado.editando = i;
  const masDatos = t.albumArtist || t.year || t.genre || t.track;
  abrirHoja({
    titulo: "Editar tema",
    cabeza: lista.length > 1 ? `
      <span class="pos">${i + 1}/${lista.length}</span>
      <button class="icono" data-accion="anterior" aria-label="Tema anterior" ${i === 0 ? "disabled" : ""}>${icono("izq")}</button>
      <button class="icono" data-accion="siguiente" aria-label="Tema siguiente" ${i === lista.length - 1 ? "disabled" : ""}>${icono("der")}</button>` : "",
    cuerpo: `
      ${vistaPrevia(t)}
      <div class="bloque">
        ${campo("title", "Título", t.title, { n: 1 })}
        ${campo("artist", "Artista", t.artist, { n: 2, ayuda: "Varios artistas: separalos con coma o usá feat. en el título." })}
        ${campo("album", "Álbum", t.album, { n: 3, ayuda: "Opcional. Temas con el mismo álbum se agrupan juntos." })}
        <details ${masDatos ? "open" : ""}>
          <summary class="nota" style="cursor:pointer">Más datos (opcionales)</summary>
          <div class="bloque" style="margin-top:14px">
            ${campo("albumArtist", "Artista del álbum", t.albumArtist, { ayuda: "Mantiene el disco junto aunque haya temas con invitados." })}
            <div class="tres">
              ${campo("track", "Nº pista", t.track, { modo: "numeric" })}
              ${campo("year", "Año", t.year, { modo: "numeric" })}
              ${campo("genre", "Género", t.genre)}
            </div>
          </div>
        </details>
      </div>
      <div class="bloque">
        <h3 class="seccion-titulo" style="margin:0"><i class="marca-n" style="font-style:normal;margin-right:8px">4</i>Portada</h3>
        <div id="tapas">${opcionesTapa(t)}</div>
      </div>
      <div class="bloque">
        <h3 class="seccion-titulo" style="margin:0">Recorte</h3>
        <div id="sugerencia"></div>
        <div class="reproductor" id="reproductor">
          <button class="boton" data-accion="escuchar">Escuchar acá</button>
        </div>
        <div class="linea-tiempo" aria-hidden="true"><i id="corte"></i></div>
        <div class="tiempos">
          <div class="tiempo">
            <label class="campo"><span>Empieza en</span>
              <input class="entrada mono" data-tiempo="start" value="${esc(formatoTiempo(t.start || 0))}" inputmode="decimal" placeholder="0:00"></label>
            <div class="acciones">
              <button class="boton chico suave" data-accion="marcar" data-cual="start">Marcar</button>
              <button class="boton chico suave" data-accion="ir" data-cual="start">Ir</button>
            </div>
          </div>
          <div class="tiempo">
            <label class="campo"><span>Termina en</span>
              <input class="entrada mono" data-tiempo="end" value="${esc(formatoTiempo(t.end ?? t.dur))}" inputmode="decimal" placeholder="${esc(formatoTiempo(t.dur))}"></label>
            <div class="acciones">
              <button class="boton chico suave" data-accion="marcar" data-cual="end">Marcar</button>
              <button class="boton chico suave" data-accion="ir" data-cual="end">Ir</button>
            </div>
          </div>
        </div>
        <p class="nota">Duración final: <b class="mono" id="duracion">${formatoTiempo(duracionFinal(t))}</b>
          · <button class="enlace" data-accion="sin-recorte">Quitar recorte</button></p>
      </div>
      <p class="nota mono" style="font-size:12px">Original: ${esc(t.ytTitulo)}${t.canal ? ` · ${esc(t.canal)}` : ""}</p>`,
    pie: `
      <button class="boton suave" data-accion="descargar-uno">Descargar solo este</button>
      <button class="boton primario" data-accion="cerrar">Listo</button>`,
  });
  arreglarTapaYT();
  pintarCorte();
  buscarSugerencia(t);
}

// maxresdefault no existe en todos los videos; YouTube devuelve una imagen gris de 120 px.
function arreglarTapaYT() {
  const img = $("[data-tapa-yt]", hoja);
  if (!img || !img.dataset.tapaYt) return;
  const probar = () => {
    if (img.naturalWidth && img.naturalWidth <= 120) img.src = `https://i.ytimg.com/vi/${img.dataset.tapaYt}/mqdefault.jpg`;
  };
  img.addEventListener("load", probar, { once: true });
  img.addEventListener("error", () => (img.src = `https://i.ytimg.com/vi/${img.dataset.tapaYt}/mqdefault.jpg`), { once: true });
  if (img.complete) probar();
}

function refrescarVista() {
  const t = temas()[estado.editando];
  if (!t) return;
  $("#vista", hoja).outerHTML = vistaPrevia(t);
  arreglarTapaYT();
}

function pintarCorte() {
  const t = temas()[estado.editando];
  const barra = $("#corte", hoja);
  if (!t || !barra || !t.dur) return;
  const desde = ((t.start || 0) / t.dur) * 100;
  const hasta = ((t.end ?? t.dur) / t.dur) * 100;
  barra.style.left = desde + "%";
  barra.style.width = Math.max(0, hasta - desde) + "%";
  $("#duracion", hoja).textContent = formatoTiempo(duracionFinal(t));
}

async function buscarSugerencia(t) {
  const caja = $("#sugerencia", hoja);
  if (!caja) return;
  if (t._sb === undefined) {
    try {
      t._sb = await sugerirRecorte(t.id, t.dur);
    } catch {
      t._sb = null;
    }
  }
  if (estado.editando == null || temas()[estado.editando] !== t) return;
  const s = t._sb;
  const aplicada = s && (s.start == null || s.start === t.start) && (s.end == null || s.end === t.end);
  if (!s || aplicada) {
    caja.innerHTML = "";
    return;
  }
  const partes = [s.start != null && `la música empieza en ${formatoTiempo(s.start)}`, s.end != null && `termina en ${formatoTiempo(s.end)}`].filter(Boolean);
  caja.innerHTML = `
    <div class="sugerencia">
      <span>Según SponsorBlock, ${partes.join(" y ")}.</span>
      <button class="boton chico" data-accion="aplicar-sugerencia">Aplicar</button>
    </div>`;
}

function fijarTiempo(t, cual, segundos) {
  if (segundos == null) segundos = cual === "start" ? 0 : t.dur;
  segundos = Math.max(0, Math.min(t.dur || Infinity, segundos));
  if (cual === "start") t.start = segundos > 0 ? Math.round(segundos * 10) / 10 : null;
  else t.end = segundos < t.dur ? Math.round(segundos * 10) / 10 : null;
  if (t.start && t.end && t.end <= t.start) {
    avisar("El final tiene que ser después del inicio.");
    if (cual === "start") t.start = null;
    else t.end = null;
  }
  const entrada = $(`[data-tiempo="${cual}"]`, hoja);
  if (entrada) entrada.value = formatoTiempo(cual === "start" ? t.start || 0 : t.end ?? t.dur);
  pintarCorte();
  actualizarFila(estado.editando);
  guardar();
}

async function abrirReproductor(t) {
  const caja = $("#reproductor", hoja);
  caja.innerHTML = '<span class="cargando" style="color:#f4ece0"></span>';
  try {
    const YT = await cargarYouTube();
    caja.innerHTML = '<div id="yt"></div>';
    estado.reproductor = new YT.Player("yt", {
      videoId: t.id,
      playerVars: { playsinline: 1, rel: 0, origin: location.origin, start: Math.floor(t.start || 0) },
      events: {
        onStateChange: (e) => document.body.classList.toggle("girando", e.data === YT.PlayerState.PLAYING),
        // 101 y 150: el dueño del video no deja reproducirlo fuera de YouTube (pasa mucho con discográficas).
        onError: () => {
          cerrarReproductor();
          caja.innerHTML = `
            <p class="nota" style="color:#f4ece0;padding:16px;text-align:center">
              YouTube no deja reproducir este video fuera de su app.<br>
              Podés escribir los tiempos a mano o usar la sugerencia de arriba, si aparece.
            </p>`;
        },
      },
    });
  } catch {
    caja.innerHTML = '<span class="nota" style="color:#f4ece0">No se pudo cargar el reproductor.</span>';
  }
}

function cerrarReproductor() {
  try {
    estado.reproductor?.destroy();
  } catch {}
  estado.reproductor = null;
  document.body.classList.remove("girando");
}

// ------------------------------------------------------------ editar en lote

function valorComun(lista, campo) {
  const valores = new Set(lista.map((t) => t[campo] || ""));
  return valores.size === 1 ? [...valores][0] : null;
}

function abrirLote() {
  const lista = elegidos();
  if (!lista.length) return avisar("Elegí al menos un tema.");
  const campoLote = (nombre, etiqueta, ayuda = "") => {
    const comun = valorComun(lista, nombre);
    return `
    <label class="campo"><span>${etiqueta}</span>
      <input class="entrada" data-lote="${nombre}" value="${esc(comun ?? "")}" placeholder="${comun === null ? "Varios (sin cambios)" : ""}" autocomplete="off" autocapitalize="words" spellcheck="false">
      ${ayuda ? `<small>${ayuda}</small>` : ""}
    </label>`;
  };
  abrirHoja({
    titulo: `Editar ${lista.length} ${lista.length === 1 ? "tema" : "temas"}`,
    cuerpo: `
      <p class="nota">Lo que escribas acá se aplica a todos los temas elegidos. Lo que dejes como "Varios" no se toca.</p>
      <div class="bloque">
        ${campoLote("artist", "Artista")}
        ${campoLote("album", "Álbum")}
        ${campoLote("albumArtist", "Artista del álbum", "Útil si el disco tiene temas con invitados.")}
        <div class="dos">${campoLote("year", "Año")}${campoLote("genre", "Género")}</div>
        <label class="interruptor"><span>Numerar pistas en el orden de la lista</span><input type="checkbox" id="lote-numerar"></label>
      </div>
      <div class="bloque">
        <h3 class="seccion-titulo" style="margin:0">Portada para todos</h3>
        <div class="opciones-tapa" id="lote-tapas">
          <button class="opcion-tapa" data-accion="lote-tapa" data-clave="igual" aria-pressed="true"><span class="cuadro">=</span>Sin cambios</button>
          <button class="opcion-tapa" data-accion="lote-tapa" data-clave="video" aria-pressed="false"><span class="cuadro">${icono("der")}</span>Cada video</button>
          <button class="opcion-tapa" data-accion="lote-subir" aria-pressed="false"><span class="cuadro" id="lote-subida">${icono("subir")}</span>Subir</button>
        </div>
      </div>`,
    pie: `<button class="boton primario" data-accion="aplicar-lote">Aplicar a ${lista.length}</button>`,
  });
  hoja._lote = { tapa: null };
}

function aplicarLote() {
  const lista = elegidos();
  const cambios = {};
  for (const entrada of $$("[data-lote]", hoja)) {
    const nombre = entrada.dataset.lote;
    const comun = valorComun(lista, nombre);
    const valor = entrada.value.trim();
    // "Varios" vacío significa sin cambios; un valor común borrado sí se aplica.
    if (comun === null && !valor) continue;
    if (valor !== (comun ?? "")) cambios[nombre] = valor;
  }
  const numerar = $("#lote-numerar", hoja).checked;
  const tapa = hoja._lote?.tapa;
  lista.forEach((t, k) => {
    Object.assign(t, cambios);
    if (numerar) t.track = String(k + 1);
    if (tapa === "video") t.cover = { t: "yt", v: t.id };
    else if (tapa) {
      t.cover = tapa;
      t.alt = { ...(t.alt || {}), lote: tapa };
    }
  });
  guardar();
  cerrarHoja();
  render();
  avisar(`Listo: ${lista.length} ${lista.length === 1 ? "tema actualizado" : "temas actualizados"}.`);
}

function marcarTapaLote(clave) {
  $$('[data-accion="lote-tapa"], [data-accion="lote-subir"]', hoja).forEach((b) =>
    b.setAttribute("aria-pressed", String(b.dataset.clave === clave || (clave === "subida" && b.dataset.accion === "lote-subir"))));
}

// ------------------------------------------------------------ herramientas

const HERRAMIENTAS = [
  ["separar", "Separar artista y título", 'Vuelve a leer "Artista - Tema" desde el título original de YouTube.'],
  ["mayusculas", "Arreglar MAYÚSCULAS", 'Pasa "MY WAY" a "My Way" en título, artista y álbum.'],
  ["numerar", "Numerar pistas", "1, 2, 3… en el orden de la lista."],
  ["intros", "Buscar intros y finales", "Usa SponsorBlock para recortar las partes sin música."],
  ["sin-recortes", "Quitar recortes", "Vuelve a la duración completa."],
  ["tapa-video", "Usar la portada de cada video", "Reemplaza la portada actual."],
  ["restablecer", "Volver a los datos originales", "Descarta lo que editaste en estos temas."],
];

function abrirHerramientas() {
  const n = elegidos().length;
  if (!n) return avisar("Elegí al menos un tema.");
  abrirHoja({
    titulo: "Herramientas",
    cuerpo: `
      <p class="nota">Se aplican a los ${n} ${n === 1 ? "tema elegido" : "temas elegidos"}.</p>
      <ul class="acciones-lista">
        ${HERRAMIENTAS.map(([clave, t, s]) => `
          <li><button data-accion="herramienta" data-clave="${clave}">
            <span class="t">${t}</span><span class="s">${s}</span>${icono("flecha")}
          </button></li>`).join("")}
      </ul>`,
  });
}

async function usarHerramienta(clave) {
  const lista = elegidos();
  const original = (t) => temaDesdeItem({ i: t.id, t: t.ytTitulo, c: t.canal, d: t.dur });
  let mensaje = "Listo.";
  switch (clave) {
    case "separar":
      for (const t of lista) Object.assign(t, { title: original(t).title, artist: original(t).artist || t.artist });
      break;
    case "mayusculas":
      for (const t of lista) for (const c of ["title", "artist", "album", "albumArtist"]) if (esMayusculas(t[c])) t[c] = tipoTitulo(t[c]);
      break;
    case "numerar":
      lista.forEach((t, k) => (t.track = String(k + 1)));
      break;
    case "sin-recortes":
      for (const t of lista) t.start = t.end = null;
      break;
    case "tapa-video":
      for (const t of lista) t.cover = { t: "yt", v: t.id };
      break;
    case "restablecer":
      for (const t of lista) Object.assign(t, { ...original(t), sel: t.sel });
      break;
    case "intros": {
      cerrarHoja();
      let encontrados = 0;
      for (const [k, t] of lista.entries()) {
        avisar(`Buscando ${k + 1} de ${lista.length}…`, 60000);
        try {
          t._sb = t._sb === undefined ? await sugerirRecorte(t.id, t.dur) : t._sb;
        } catch {
          t._sb = null;
        }
        if (t._sb) {
          encontrados++;
          if (t._sb.start != null) t.start = t._sb.start;
          if (t._sb.end != null) t.end = t._sb.end;
        }
      }
      mensaje = encontrados ? `Recorté ${encontrados} de ${lista.length}.` : "No hay recortes marcados para estos temas.";
      break;
    }
  }
  guardar();
  cerrarHoja();
  render();
  avisar(mensaje);
}

// ---------------------------------------------------------------- ajustes

function abrirAjustes() {
  const a = estado.ajustes;
  const opcion = (nombre, valor, texto, actual) =>
    `<label><input type="radio" name="${nombre}" value="${valor}" ${String(actual) === String(valor) ? "checked" : ""}><span>${texto}</span></label>`;
  const patrones = [
    ["{artista} - {titulo}", "Artista - Título"],
    ["{titulo}", "Título"],
    ["{n}. {titulo}", "01. Título"],
    ["{n}. {artista} - {titulo}", "01. Artista - Título"],
  ];
  abrirHoja({
    titulo: "Ajustes",
    cuerpo: `
      <div class="bloque">
        <div class="campo"><span>Calidad</span>
          <div class="segmentos" data-ajuste="calidad">${[128, 192, 256, 320].map((q) => opcion("calidad", q, q, a.calidad)).join("")}</div>
          <small>kbps. YouTube entrega audio de unos 128 a 160 kbps: subir de 192 agranda el archivo sin sonar mejor. 128 ocupa un tercio menos.</small>
        </div>
        <label class="campo"><span>Nombre del archivo</span>
          <select class="entrada" data-ajuste="patron">
            ${patrones.map(([v, t]) => `<option value="${v}" ${a.patron === v ? "selected" : ""}>${t}.mp3</option>`).join("")}
          </select>
          <small>Spotify muestra los datos del tema, no el nombre del archivo. Esto sirve para encontrarlos en Archivos.</small>
        </label>
        <label class="interruptor"><span>Quitar silencios al principio y al final</span>
          <input type="checkbox" data-ajuste="silencio" ${a.silencio ? "checked" : ""}></label>
      </div>
      <div class="bloque">
        <div class="campo"><span>Apariencia</span>
          <div class="segmentos" data-ajuste="tema">${[["auto", "Auto"], ["claro", "Claro"], ["oscuro", "Oscuro"]].map(([v, t]) => opcion("tema", v, t, a.tema)).join("")}</div>
        </div>
      </div>
      <div class="bloque">
        <div class="campo"><span>Carpeta de destino</span>
          <small>Donde se guardan los mp3. Para Spotify: <b>En mi iPhone → Spotify</b>.</small>
        </div>
        <a class="boton suave" href="${esc(linkAShell(a.app, "MP3CARPETA"))}">Cambiar carpeta</a>
        <div class="campo"><span>App que descarga</span>
          <div class="segmentos" data-ajuste="app">${[["ashellmini", "a-Shell mini"], ["ashell", "a-Shell"]].map(([v, t]) => opcion("app", v, t, a.app)).join("")}</div>
          <small>Si tenés instalada la versión completa de a-Shell, podés usar esa.</small>
        </div>
      </div>`,
  });
}

// ----------------------------------------------------------------- tutorial

const esIOS = () => /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);

const PASOS_TUTORIAL = [
  {
    titulo: "Bienvenido a Lado B",
    texto: "Pasá videos y playlists de YouTube a mp3 con nombre, artista, álbum y portada. Gratis, sin cuentas y directo a tu iPhone.",
    visual: () => casete("Tu música, en casete", "Bienvenida"),
  },
  {
    titulo: "Instalá a-Shell mini",
    texto: "Es una app gratuita que hace la descarga dentro de tu teléfono. Solo hay que instalarla: no vas a tener que aprender a usarla.",
    visual: () => `
      <div class="mock mock-app">
        <span class="mock-icono">&gt;_</span>
        <span><b>a-Shell mini</b><small>Gratis · App Store</small></span>
      </div>`,
    extra: () => `<a class="boton suave ancho" href="${esc(CONFIG.appStoreAShell)}" target="_blank" rel="noopener">Abrir en la App Store</a>`,
  },
  {
    titulo: "Pegá un link",
    texto: "En YouTube tocá Compartir → Copiar enlace y pegalo en Lado B. Safari te va a preguntar esto: tocá Abrir. La primera vez tarda uno o dos minutos en prepararse.",
    visual: () => `
      <div class="mock mock-alerta">
        <p>¿Abrir esta página en "a-Shell mini"?</p>
        <div><span>Cancelar</span><span class="si">Abrir</span></div>
      </div>`,
  },
  {
    titulo: "Editá y descargá",
    texto: "Tocá cada tema para cambiarle los datos. Al descargar por primera vez se abre una ventana para elegir la carpeta: elegí esta y tocá Abrir. Al terminar volvés solo a Lado B.",
    visual: () => `
      <div class="mock mock-ruta">
        <span>En mi iPhone</span><span class="flecha">›</span><span class="si">Spotify</span>
      </div>`,
  },
  {
    titulo: "Escuchalo en Spotify",
    texto: "En Spotify: tu foto → Configuración y privacidad → Archivos locales, y activá esta opción. Tus temas aparecen en Tu biblioteca → Archivos locales.",
    visual: () => `
      <div class="mock mock-ajuste">
        <span>Mostrar archivos de audio de este dispositivo</span><i class="mock-interruptor"></i>
      </div>`,
  },
];

function abrirTutorial(paso) {
  guardado.escribir("tutorial", true);
  const p = PASOS_TUTORIAL[paso];
  const ultimo = paso === PASOS_TUTORIAL.length - 1;
  abrirHoja({
    titulo: "Cómo funciona",
    cabeza: `<span class="pos">${paso + 1}/${PASOS_TUTORIAL.length}</span>`,
    cuerpo: `
      <div class="tutorial">
        <div class="tutorial-visual">${p.visual()}</div>
        <h3>${p.titulo}</h3>
        <p>${p.texto}</p>
        ${p.extra ? p.extra() : ""}
        <div class="puntos" aria-hidden="true">${PASOS_TUTORIAL.map((_, k) => `<i class="${k === paso ? "activo" : ""}"></i>`).join("")}</div>
      </div>`,
    pie: `
      ${paso > 0 ? `<button class="boton suave" data-accion="tutorial-paso" data-paso="${paso - 1}">Atrás</button>` : ""}
      ${ultimo
        ? '<button class="boton primario" data-accion="tutorial-fin">Empezar</button>'
        : `<button class="boton primario" data-accion="tutorial-paso" data-paso="${paso + 1}">Siguiente</button>`}`,
  });
}

// ------------------------------------------------------- agregar a inicio
//
// iOS no deja que una página se agregue sola a la pantalla de inicio: solo se
// puede explicar cómo hacerlo. El nombre y el ícono salen de las etiquetas
// apple-mobile-web-app-title y apple-touch-icon de index.html.
// En Android, Chrome sí ofrece instalarla con un botón (beforeinstallprompt).

let instalarAndroid = null;
window.addEventListener("beforeinstallprompt", (e) => {
  e.preventDefault();
  instalarAndroid = e;
});

const enPantallaDeInicio = () =>
  navigator.standalone === true || matchMedia("(display-mode: standalone)").matches;

async function abrirAgregarInicio() {
  if (instalarAndroid) {
    instalarAndroid.prompt();
    instalarAndroid = null;
    return;
  }
  abrirHoja({
    titulo: "Agregar a inicio",
    cuerpo: `
      <div class="inicio-vista" aria-hidden="true">
        <span class="app-falsa"><i></i><i></i></span>
        <span class="app-ladob"><img src="assets/icono-180.png" alt=""><small>Lado B</small></span>
        <span class="app-falsa"><i></i><i></i></span>
      </div>
      <ol class="pasos pasos-inicio">
        <li><span>En Safari, tocá <b>Compartir</b> <span class="chip">${icono("compartir")}</span>. Si no lo ves, está dentro del botón <b>···</b>.</span></li>
        <li><span>Bajá y tocá <b>Agregar a inicio</b> <span class="chip">${icono("sumar")}</span>.</span></li>
        <li><span>Si aparece <b>Abrir como app web</b>, dejalo <b>apagado</b>: así, cuando a-Shell mini termina, volvés al mismo lugar.</span></li>
        <li><span>Tocá <b>Agregar</b>. El nombre <b>Lado B</b> y el casete ya vienen puestos.</span></li>
      </ol>
      ${esIOS() ? "" : '<p class="nota">Esto es para el iPhone. En la computadora, guardala en favoritos.</p>'}`,
    pie: '<button class="boton primario" data-accion="cerrar">Entendido</button>',
  });
}

function aplicarTema() {
  const t = estado.ajustes.tema;
  if (t === "auto") delete document.documentElement.dataset.tema;
  else document.documentElement.dataset.tema = t;
}

// -------------------------------------------------------------- descargar

async function abrirDescarga(lista) {
  const faltan = lista.filter((t) => !t.title.trim() || !t.artist.trim()).length;
  const segundos = lista.reduce((a, t) => a + duracionFinal(t), 0);
  const trabajo = armarTrabajo(lista, estado.ajustes);
  const link = linkAShell(estado.ajustes.app, "MP3JOB:" + (await comprimir(trabajo)));
  const primeraVez = !guardado.leer("descargo");
  abrirHoja({
    titulo: `Descargar ${lista.length === 1 ? "1 tema" : lista.length + " temas"}`,
    cuerpo: `
      ${faltan ? `<div class="aviso"><span>${faltan === 1 ? "Un tema no tiene" : `${faltan} temas no tienen`} título o artista. Se puede descargar igual.</span></div>` : ""}
      <ol class="pasos">
        <li><span>Safari pregunta si abrir a-Shell mini: tocá <b>Abrir</b>.</span></li>
        ${primeraVez ? "<li><span><b>Solo esta vez</b>, elegí dónde guardar: <b>En mi iPhone → Spotify</b> y tocá Abrir.</span></li>" : ""}
        <li><span><b>No bloquees la pantalla</b> mientras graba: ${formatoTiempo(segundos)} de música.</span></li>
        <li><span><b>Al terminar volvés acá</b> con el aviso de que está todo listo.</span></li>
      </ol>
      ${esIOS() ? "" : '<p class="nota">Esto funciona en el iPhone con a-Shell mini instalado. Desde la computadora no va a pasar nada.</p>'}
      ${link.length > 400000 ? '<p class="nota">Son muchos datos para un solo envío. Si falla, descargá en partes más chicas.</p>' : ""}`,
    pie: `<a class="boton primario" href="${esc(link)}" data-accion="ir-ashell">Descargar</a>`,
  });
}

// ---------------------------------------------------------------- portadas

let destinoTapa = null;

archivoTapa.addEventListener("change", async () => {
  const archivo = archivoTapa.files[0];
  archivoTapa.value = "";
  if (!archivo) return;
  try {
    const dato = await portadaDesdeArchivo(archivo);
    if (destinoTapa === "lote") {
      hoja._lote.tapa = { t: "data", v: dato };
      $("#lote-subida", hoja).style.backgroundImage = `url('${dato}')`;
      $("#lote-subida", hoja).innerHTML = "";
      marcarTapaLote("subida");
    } else {
      const t = temas()[estado.editando];
      t.alt = { ...(t.alt || {}), subida: dato };
      t.cover = { t: "data", v: dato };
      $("#tapas", hoja).innerHTML = opcionesTapa(t);
      refrescarVista();
      actualizarFila(estado.editando);
      guardar();
    }
  } catch {
    avisar("No pude leer esa imagen.");
  }
});

// ---------------------------------------------------------------- eventos

document.addEventListener("click", async (e) => {
  const el = e.target.closest("[data-accion]");
  const fila = e.target.closest(".tema");
  if (!el && fila) return abrirEditor(Number(fila.dataset.i));
  if (!el) return;
  const accion = el.dataset.accion;
  const t = temas()[estado.editando];

  switch (accion) {
    case "inicio":
      e.preventDefault();
      estado.sesion = null;
      guardado.borrar("actual");
      render();
      break;
    case "pegar":
      try {
        const texto = await navigator.clipboard.readText();
        $('[name="link"]').value = texto.trim();
      } catch {
        avisar("No tengo permiso para leer el portapapeles. Pegalo a mano.");
      }
      break;
    case "abrir-reciente": {
      const sesion = guardado.leer("s:" + el.dataset.clave);
      if (!sesion) return avisar("Esa lista ya no está guardada.");
      estado.sesion = sesion;
      guardar();
      render();
      break;
    }
    case "elegir": {
      const i = Number(el.closest(".tema").dataset.i);
      temas()[i].sel = el.checked;
      actualizarSeleccion();
      guardar();
      break;
    }
    case "todos-casilla":
    case "todos": {
      const valor = accion === "todos" ? true : el.checked;
      for (const tema of temas()) tema.sel = valor;
      if (accion === "todos") render();
      else {
        $$('.tema [data-accion="elegir"]').forEach((c) => (c.checked = valor));
        actualizarSeleccion();
      }
      guardar();
      break;
    }
    case "cerrar":
      cerrarHoja();
      break;
    case "anterior":
    case "siguiente":
      cerrarReproductor();
      abrirEditor(estado.editando + (accion === "anterior" ? -1 : 1));
      break;
    case "ajustes":
      abrirAjustes();
      break;
    case "lote":
      abrirLote();
      break;
    case "herramientas":
      abrirHerramientas();
      break;
    case "herramienta":
      usarHerramienta(el.dataset.clave);
      break;
    case "descargar":
      abrirDescarga(elegidos());
      break;
    case "descargar-uno":
      abrirDescarga([t]);
      break;
    case "ir-ashell":
      // Se deja seguir el link; la hoja se cierra para cuando vuelvas.
      guardado.escribir("descargo", true);
      setTimeout(cerrarHoja, 600);
      break;
    case "tutorial":
      abrirTutorial(0);
      break;
    case "agregar-inicio":
      abrirAgregarInicio();
      break;
    case "tutorial-paso":
      abrirTutorial(Number(el.dataset.paso));
      break;
    case "tutorial-fin":
      guardado.escribir("tutorial", true);
      cerrarHoja();
      break;
    case "tapa": {
      const alt = t.alt || {};
      const opciones = {
        yt: { t: "yt", v: t.id },
        subida: alt.subida && { t: "data", v: alt.subida },
        lote: alt.lote,
        ninguna: null,
      };
      t.cover = opciones[el.dataset.clave];
      $("#tapas", hoja).innerHTML = opcionesTapa(t);
      refrescarVista();
      actualizarFila(estado.editando);
      guardar();
      break;
    }
    case "subir-tapa":
    case "lote-subir":
      destinoTapa = accion === "lote-subir" ? "lote" : "tema";
      archivoTapa.click();
      break;
    case "lote-tapa":
      hoja._lote.tapa = el.dataset.clave === "video" ? "video" : null;
      marcarTapaLote(el.dataset.clave);
      break;
    case "aplicar-lote":
      aplicarLote();
      break;
    case "escuchar":
      abrirReproductor(t);
      break;
    case "marcar": {
      const p = estado.reproductor;
      if (!p?.getCurrentTime) return avisar('Primero tocá "Escuchar acá" y poné play.');
      fijarTiempo(t, el.dataset.cual, p.getCurrentTime());
      break;
    }
    case "ir": {
      const p = estado.reproductor;
      if (!p?.seekTo) return abrirReproductor(t);
      const destino = el.dataset.cual === "start" ? t.start || 0 : Math.max(0, (t.end ?? t.dur) - 5);
      p.seekTo(destino, true);
      p.playVideo();
      break;
    }
    case "sin-recorte":
      fijarTiempo(t, "start", 0);
      fijarTiempo(t, "end", null);
      buscarSugerencia(t);
      break;
    case "aplicar-sugerencia":
      if (t._sb.start != null) fijarTiempo(t, "start", t._sb.start);
      if (t._sb.end != null) fijarTiempo(t, "end", t._sb.end);
      $("#sugerencia", hoja).innerHTML = "";
      break;
  }
});

document.addEventListener("input", (e) => {
  const el = e.target;
  const t = temas()[estado.editando];
  if (el.dataset.campo && t) {
    t[el.dataset.campo] = el.value;
    refrescarVista();
    actualizarFila(estado.editando);
    guardar();
  }
});

document.addEventListener("change", (e) => {
  const el = e.target;
  const t = temas()[estado.editando];
  if (el.dataset.tiempo && t) {
    const segundos = leerTiempo(el.value);
    if (segundos === undefined) {
      avisar("Escribí el tiempo como minutos:segundos, por ejemplo 1:05.");
      el.value = formatoTiempo(el.dataset.tiempo === "start" ? t.start || 0 : t.end ?? t.dur);
    } else fijarTiempo(t, el.dataset.tiempo, segundos);
  }
  const ajuste = el.closest("[data-ajuste]");
  if (ajuste) {
    const clave = ajuste.dataset.ajuste;
    let valor = el.type === "checkbox" ? el.checked : el.value;
    if (clave === "calidad") valor = Number(valor);
    estado.ajustes[clave] = valor;
    guardado.escribir("ajustes", estado.ajustes);
    if (clave === "tema") aplicarTema();
    if (clave === "app") abrirAjustes();
    if (estado.sesion) actualizarSeleccion();
  }
});

document.addEventListener("submit", (e) => {
  const form = e.target.closest("[data-form]");
  if (!form) return;
  e.preventDefault();
  if (form.dataset.form === "link") {
    const link = form.link.value.trim();
    if (!/^https?:\/\//.test(link)) return avisar("Eso no parece un link.");
    location.href = linkAShell(estado.ajustes.app, "MP3URL:" + textoABase64Url(link));
  }
});

// ----------------------------------------------------------------- arranque

async function cargarDesdeLink(codigo) {
  const datos = await descomprimir(codigo);
  const clave = hash(datos.src || JSON.stringify(datos.items.map((x) => x.i)));
  const previa = guardado.leer("s:" + clave);
  const editados = new Map((previa?.temas || []).map((t) => [t.id, t]));
  const nuevos = datos.items.map((it) => editados.get(it.i) || temaDesdeItem(it));
  if (datos.f && !previa) for (const t of nuevos) t.sel = t.id === datos.f;
  estado.sesion = { clave, src: datos.src, pl: datos.pl || "", foco: datos.f || null, temas: nuevos };
  guardar();
}

// Vuelta desde a-Shell mini: marca los temas guardados y cuenta qué pasó.
function mostrarResultado({ ok = [], err = [], dest = "" }) {
  const respaldo = dest.startsWith("a-Shell");
  const porId = new Map(temas().map((t) => [t.id, t]));
  for (const id of ok) {
    const t = porId.get(id);
    if (t) Object.assign(t, { guardado: true, sel: false });
  }
  for (const { i } of err) {
    const t = porId.get(i);
    if (t) t.sel = true;
  }
  guardar();
  render();
  const nombre = (id) => {
    const t = porId.get(id);
    return t ? [t.artist, t.title].filter(Boolean).join(" - ") : id;
  };
  abrirHoja({
    titulo: ok.length ? "Listo" : "No se pudo descargar",
    cuerpo: `
      ${ok.length ? `
      <div class="exito">
        ${casete(`${ok.length} ${ok.length === 1 ? "tema guardado" : "temas guardados"}`, "Grabado")}
        ${respaldo ? `
        <p>Quedaron en <b>Archivos → En mi iPhone → a-Shell mini → Lado B</b>, porque no se eligió otra carpeta.</p>
        <a class="boton suave" href="${esc(linkAShell(estado.ajustes.app, "MP3CARPETA"))}">Elegir la carpeta de Spotify</a>` : `
        <p>Ya ${ok.length === 1 ? "está" : "están"} en ${dest ? `<b>${esc(dest)}</b>` : "tu carpeta"}. En Spotify: <b>Tu biblioteca → Archivos locales</b>.</p>`}
      </div>` : ""}
      ${err.length ? `
      <div class="bloque">
        <h3 class="seccion-titulo" style="margin:0">${err.length === 1 ? "Un tema falló" : `${err.length} temas fallaron`}</h3>
        <ul class="fallos">${err.map((e) => `<li><b>${esc(nombre(e.i))}</b><span>${esc(e.m)}</span></li>`).join("")}</ul>
        <p class="nota">Quedaron elegidos para que puedas reintentar.</p>
      </div>` : ""}`,
    pie: ok.length
      ? `<a class="boton suave" href="spotify:">Abrir Spotify</a><button class="boton primario" data-accion="cerrar">Seguir</button>`
      : `<button class="boton primario" data-accion="cerrar">Entendido</button>`,
  });
}

async function arrancar() {
  aplicarTema();
  const [clave, ...resto] = location.hash.slice(1).split("=");
  const valor = resto.join("=");
  if (clave && valor) history.replaceState(null, "", location.pathname + location.search);

  const actual = guardado.leer("actual");
  if (actual) estado.sesion = guardado.leer("s:" + actual);

  if (clave === "d") {
    try {
      await cargarDesdeLink(valor);
      render();
      // Con un solo tema no hay lista que mirar: se abre directo el editor.
      if (temas().length === 1) abrirEditor(0);
      return;
    } catch {
      avisar("El link llegó incompleto. Probá compartirlo de nuevo.");
    }
  }
  render();
  if (clave === "listo") {
    try {
      mostrarResultado(await descomprimir(valor));
    } catch {
      avisar("Descarga terminada.");
    }
  }
  if (clave === "carpeta") {
    avisar(`Listo: ahora se guarda en ${decodeURIComponent(valor)}.`, 4000);
  }
  if (!clave && !guardado.leer("tutorial")) abrirTutorial(0);
  if (clave === "error") {
    abrirHoja({
      titulo: "Algo no salió",
      cuerpo: `<p>${esc(decodeURIComponent(valor))}</p><p class="nota">Si se repite, probá de nuevo en un rato: YouTube a veces rechaza pedidos seguidos.</p>`,
      pie: '<button class="boton primario" data-accion="cerrar">Entendido</button>',
    });
  }
}

window.addEventListener("hashchange", () => {
  if (/^#(d|listo|error|carpeta)=/.test(location.hash)) arrancar();
});

arrancar();
