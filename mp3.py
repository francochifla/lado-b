# mp3.py: corre dentro de a-Shell mini, llamado por el atajo "MP3".
#
# Recibe la entrada del atajo codificada en base64 y hace una de dos cosas:
#   1. Si es un link: lee la lista de temas (sin descargar) y abre la web
#      para editarlos.
#   2. Si es un trabajo armado en la web (empieza con "MP3JOB:"): descarga,
#      recorta, convierte a mp3, escribe los tags y le devuelve al atajo las
#      rutas de los archivos para que los guarde en la carpeta elegida.
#
# El atajo baja la última versión de este archivo en cada uso, así que
# cualquier cambio publicado en GitHub llega solo a todos los teléfonos.

import base64
import importlib
import json
import os
import re
import shutil
import subprocess
import sys
import time
import urllib.parse
import urllib.request
import zlib

VERSION = "0.1.0"
WEB_URL = "https://francochifla.github.io/lado-b/"
ATAJO = "MP3"

# Prueba en computadora: MP3_LOCAL=1 imprime los links en vez de abrirlos
# y no instala nada con pip. FFMPEG apunta a un ffmpeg propio si hace falta.
LOCAL = os.environ.get("MP3_LOCAL") == "1"
FFMPEG = os.environ.get("FFMPEG")

BASE = os.path.dirname(os.path.abspath(__file__))
TMP = os.path.join(BASE, "tmp")
SALIDA = os.path.join(BASE, "salida")
DEPENDENCIAS = "yt-dlp yt-dlp-ejs yt-dlp-apple-webkit-jsi mutagen"
DIAS_ENTRE_ACTUALIZACIONES = 3

GRIS, VERDE, NARANJA, ROJO, NEGRITA, FIN = (
    "\033[90m", "\033[92m", "\033[93m", "\033[91m", "\033[1m", "\033[0m")


# ---------------------------------------------------------------- utilidades

def comando(cmd):
    # a-Shell interpreta el texto del comando por su cuenta; en una
    # computadora normal hace falta pasar por la shell.
    if LOCAL:
        return subprocess.run(cmd, shell=True)
    return subprocess.run(cmd)


def abrir(url):
    if LOCAL:
        print(f"\n{GRIS}[local] abriría:{FIN} {url[:300]}{'...' if len(url) > 300 else ''}")
        with open(os.path.join(BASE, "ultimo_link.txt"), "w", encoding="utf-8") as f:
            f.write(url)
        return
    comando("open " + url)


def comprimir(datos):
    c = zlib.compressobj(9, zlib.DEFLATED, -15)
    crudo = c.compress(json.dumps(datos, ensure_ascii=False, separators=(",", ":")).encode()) + c.flush()
    return base64.urlsafe_b64encode(crudo).decode().rstrip("=")


def descomprimir(texto):
    texto = texto.strip()
    crudo = base64.urlsafe_b64decode(texto + "=" * (-len(texto) % 4))
    return json.loads(zlib.decompress(crudo, -15).decode())


def mostrar(texto, fin="\n"):
    print("\r\033[K" + texto, end=fin, flush=True)


def encabezado(subtitulo):
    if not LOCAL:
        comando("clear")
    print(f"{NEGRITA}MP3{FIN} {GRIS}v{VERSION}{FIN}")
    print(f"{GRIS}{subtitulo}{FIN}\n")


def esperar_enter(mensaje):
    print(f"\n{mensaje}")
    try:
        input(f"{GRIS}Tocá Enter para continuar{FIN} ")
    except EOFError:
        pass


# ------------------------------------------------------------- dependencias

def preparar():
    marca = os.path.join(BASE, ".actualizado")
    faltan = False
    try:
        import yt_dlp  # noqa: F401
        import mutagen  # noqa: F401
    except ImportError:
        faltan = True

    vieja = True
    if os.path.exists(marca):
        vieja = time.time() - os.path.getmtime(marca) > DIAS_ENTRE_ACTUALIZACIONES * 86400

    if LOCAL or not (faltan or vieja):
        return

    mostrar(("Instalando herramientas, solo la primera vez (1 o 2 minutos)..." if faltan
             else "Buscando actualizaciones..."))
    comando(f"pip install -q --disable-pip-version-check --upgrade {DEPENDENCIAS}")
    importlib.invalidate_caches()
    with open(marca, "w") as f:
        f.write(str(time.time()))


def ydl_opciones(**extra):
    opciones = {"quiet": True, "no_warnings": True, "noprogress": True, "color": "never"}
    if FFMPEG:
        opciones["ffmpeg_location"] = FFMPEG
    opciones.update(extra)
    return opciones


# ------------------------------------------------------- modo 1: leer link

def buscar_link(texto):
    m = re.search(r"https?://\S+", texto)
    return m.group(0) if m else None


def id_de_video(url):
    q = urllib.parse.parse_qs(urllib.parse.urlparse(url).query)
    if "v" in q:
        return q["v"][0]
    m = re.search(r"youtu\.be/([\w-]{11})", url)
    return m.group(1) if m else None


def item(e):
    datos = {"i": e.get("id"), "t": e.get("title") or ""}
    canal = e.get("channel") or e.get("uploader")
    if canal:
        datos["c"] = canal
    if e.get("duration"):
        datos["d"] = int(e["duration"])
    # YouTube Music trae estos datos en los temas sueltos.
    for clave, campo in (("tr", "track"), ("ar", "artist"), ("al", "album"), ("y", "release_year")):
        if e.get(campo):
            datos[clave] = e[campo]
    return datos


def leer_link(url):
    import yt_dlp

    encabezado("Leyendo el link")
    mostrar("Buscando los temas...", fin="")
    with yt_dlp.YoutubeDL(ydl_opciones(extract_flat="in_playlist", skip_download=True)) as ydl:
        info = ydl.extract_info(url, download=False)

    entradas = info.get("entries")
    if entradas is None:
        temas = [item(info)]
        titulo = None
    else:
        temas = [item(e) for e in entradas
                 if e and e.get("id") and e.get("title") not in ("[Private video]", "[Deleted video]")]
        titulo = info.get("title")

    if not temas:
        mostrar(f"{ROJO}No encontré temas en ese link.{FIN}")
        esperar_enter("Revisá que el link sea de un video o una playlist pública.")
        return

    mostrar(f"{VERDE}{len(temas)} {'tema' if len(temas) == 1 else 'temas'}{FIN}. Abriendo el editor...")
    datos = {"v": 1, "src": url, "items": temas}
    if titulo:
        datos["pl"] = titulo
    foco = id_de_video(url)
    if foco and len(temas) > 1:
        datos["f"] = foco
    abrir(WEB_URL + "#d=" + comprimir(datos))


# --------------------------------------------------- modo 2: descargar

def nombre_seguro(texto):
    texto = re.sub(r'[\\/:*?"<>|\x00-\x1f]', "", texto).strip().strip(".")
    return re.sub(r"\s+", " ", texto)[:120] or "tema"


def nombre_archivo(patron, t):
    reemplazos = {
        "{titulo}": t.get("title") or "",
        "{artista}": t.get("artist") or "",
        "{album}": t.get("album") or "",
        "{n}": f"{int(t['track']):02d}" if str(t.get("track") or "").isdigit() else "",
    }
    nombre = patron
    for clave, valor in reemplazos.items():
        nombre = nombre.replace(clave, valor)
    # Si falta un dato quedan separadores sueltos, como " - Tema".
    nombre = re.sub(r"^[\s.\-]+|[\s.\-]+$", "", nombre)
    nombre = re.sub(r"\s+-\s+-\s+", " - ", nombre)
    return nombre_seguro(nombre or t.get("title") or t["id"])


def bajar(url, destino):
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
    with urllib.request.urlopen(req, timeout=20) as r, open(destino, "wb") as f:
        shutil.copyfileobj(r, f)


def preparar_portada(clave, portada, ffmpeg):
    """Devuelve los bytes de una portada cuadrada en JPEG, o None."""
    tipo, valor = portada.get("t"), portada.get("v")
    try:
        if tipo == "data":
            return base64.b64decode(valor.split(",", 1)[-1])
        if tipo == "url":
            ruta = os.path.join(TMP, f"portada_{clave}.jpg")
            bajar(valor, ruta)
            with open(ruta, "rb") as f:
                return f.read()
        if tipo == "yt":
            # Las miniaturas de YouTube son 16:9; se recorta el centro.
            # maxresdefault y hq720 no tienen franjas negras; sddefault sí,
            # por eso queda afuera.
            original = os.path.join(TMP, f"miniatura_{clave}.jpg")
            for calidad in ("maxresdefault", "hq720", "mqdefault"):
                try:
                    bajar(f"https://i.ytimg.com/vi/{valor}/{calidad}.jpg", original)
                    break
                except Exception:
                    continue
            else:
                return None
            cuadrada = os.path.join(TMP, f"portada_{clave}.jpg")
            ffmpeg.real_run_ffmpeg(
                [(original, [])],
                [(cuadrada, ["-vf", "crop='min(iw,ih)':'min(iw,ih)',scale=600:600", "-q:v", "3"])])
            with open(cuadrada, "rb") as f:
                return f.read()
    except Exception as e:
        mostrar(f"{NARANJA}No pude preparar una portada ({e}).{FIN}")
    return None


def etiquetar(ruta, t, portada):
    from mutagen.id3 import APIC, ID3, TALB, TCON, TDRC, TIT2, TPE1, TPE2, TRCK

    tags = ID3()
    campos = (
        (TIT2, t.get("title")), (TPE1, t.get("artist")), (TALB, t.get("album")),
        (TPE2, t.get("albumArtist")), (TCON, t.get("genre")), (TDRC, t.get("year")),
    )
    for marco, valor in campos:
        if valor:
            tags.add(marco(encoding=3, text=str(valor)))
    if t.get("track"):
        numero = str(t["track"]) + (f"/{t['total']}" if t.get("total") else "")
        tags.add(TRCK(encoding=3, text=numero))
    if portada:
        tags.add(APIC(encoding=3, mime="image/jpeg", type=3, desc="Cover", data=portada))
    # ID3 v2.3 es la versión que mejor leen iOS, Spotify y la mayoría de los autos.
    tags.save(ruta, v2_version=3)


def procesar(trabajo):
    import yt_dlp
    from yt_dlp.postprocessor.ffmpeg import FFmpegPostProcessor

    temas = trabajo.get("tracks") or []
    calidad = int(trabajo.get("q") or 192)
    patron = trabajo.get("name") or "{artista} - {titulo}"
    silencio = bool(trabajo.get("silence"))
    atajo = trabajo.get("shortcut") or ATAJO

    encabezado(f"Descargando {len(temas)} {'tema' if len(temas) == 1 else 'temas'} a {calidad} kbps")

    shutil.rmtree(TMP, ignore_errors=True)
    shutil.rmtree(SALIDA, ignore_errors=True)
    os.makedirs(TMP)
    os.makedirs(SALIDA)

    ydl = yt_dlp.YoutubeDL(ydl_opciones())
    ffmpeg = FFmpegPostProcessor(ydl)
    portadas = {}
    listos, errores, usados = [], [], set()

    for n, t in enumerate(temas, 1):
        etiqueta = f"[{n}/{len(temas)}] {t.get('artist') or ''}{' - ' if t.get('artist') else ''}{t.get('title') or t['id']}"
        etiqueta = etiqueta[:60]

        def progreso(d, etiqueta=etiqueta):
            if d["status"] == "downloading":
                porcentaje = d.get("_percent_str", "").strip()
                mostrar(f"{etiqueta} {GRIS}bajando {porcentaje}{FIN}", fin="")

        try:
            mostrar(f"{etiqueta} {GRIS}conectando{FIN}", fin="")
            plantilla = os.path.join(TMP, f"{n:03d}.%(ext)s")
            opciones = ydl_opciones(
                format="bestaudio[ext=m4a]/bestaudio/best", outtmpl=plantilla,
                noplaylist=True, progress_hooks=[progreso])
            with yt_dlp.YoutubeDL(opciones) as y:
                info = y.extract_info(f"https://www.youtube.com/watch?v={t['id']}", download=True)
                original = info["requested_downloads"][0]["filepath"]

            mostrar(f"{etiqueta} {GRIS}convirtiendo{FIN}", fin="")
            entrada, salida = [], ["-vn", "-map_metadata", "-1", "-c:a", "libmp3lame", "-b:a", f"{calidad}k"]
            inicio, fin = float(t.get("start") or 0), t.get("end")
            if inicio > 0:
                entrada += ["-ss", f"{inicio:.2f}"]
            if fin:
                salida += ["-t", f"{float(fin) - inicio:.2f}"]
            if silencio:
                quitar = "silenceremove=start_periods=1:start_threshold=-50dB:start_silence=0.2"
                salida += ["-af", f"{quitar},areverse,{quitar},areverse"]
            mp3 = os.path.join(TMP, f"{n:03d}.mp3")
            ffmpeg.real_run_ffmpeg([(original, entrada)], [(mp3, salida)])

            clave = t.get("cover")
            if clave and clave not in portadas:
                mostrar(f"{etiqueta} {GRIS}portada{FIN}", fin="")
                portadas[clave] = preparar_portada(clave, trabajo.get("covers", {}).get(clave, {}), ffmpeg)
            etiquetar(mp3, t, portadas.get(clave) if clave else None)

            nombre = nombre_archivo(patron, t)
            final, copia = nombre, 2
            while final.lower() in usados:
                final, copia = f"{nombre} ({copia})", copia + 1
            usados.add(final.lower())
            destino = os.path.join(SALIDA, final + ".mp3")
            shutil.move(mp3, destino)
            os.remove(original)
            listos.append(destino)
            mostrar(f"{etiqueta} {VERDE}listo{FIN}")
        except Exception as e:
            motivo = str(e).replace("ERROR: ", "").splitlines()[0][:160] if str(e) else type(e).__name__
            errores.append((etiqueta, motivo))
            mostrar(f"{etiqueta} {ROJO}falló{FIN}\n  {GRIS}{motivo}{FIN}")

    shutil.rmtree(TMP, ignore_errors=True)

    if errores:
        resumen = f"{VERDE}{len(listos)} listos{FIN}, {ROJO}{len(errores)} con error{FIN}."
        if listos:
            esperar_enter(resumen + " Los que salieron bien se guardan igual.")
        else:
            esperar_enter(resumen + " No se guardó nada.")
            return

    datos = json.dumps({"mp3files": listos}, ensure_ascii=False)
    abrir(f"shortcuts://run-shortcut?name={urllib.parse.quote(atajo)}"
          f"&input=text&text={urllib.parse.quote(datos, safe='')}")


# ----------------------------------------------------------------- inicio

def main():
    crudo = "".join(sys.argv[1:]).strip()
    if not crudo:
        encabezado("Sin datos")
        esperar_enter("Este script lo usa el atajo MP3. Compartí un link de YouTube con el atajo.")
        return

    try:
        texto = base64.b64decode(crudo + "=" * (-len(crudo) % 4)).decode("utf-8")
    except Exception:
        texto = crudo  # prueba manual con el texto sin codificar

    try:
        preparar()
        if texto.startswith("MP3JOB:"):
            procesar(descomprimir(texto[len("MP3JOB:"):]))
            return
        url = buscar_link(texto)
        if not url:
            encabezado("Sin link")
            esperar_enter("No encontré un link en lo que compartiste.")
            return
        leer_link(url)
    except Exception as e:
        mostrar(f"\n{ROJO}Algo salió mal:{FIN} {e}")
        esperar_enter("Si se repite, mandá una captura de esta pantalla.")


if __name__ == "__main__":
    main()
