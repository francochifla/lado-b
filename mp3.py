# mp3.py: el motor de Lado B. Corre dentro de a-Shell mini.
#
# La web lo llama con un link ashellmini:// que baja la última versión de
# este archivo y la ejecuta, así que cualquier cambio publicado en GitHub
# llega solo a todos los teléfonos. Recibe un argumento:
#
#   MP3URL:<link en base64>   lee la lista de temas (sin descargar) y vuelve
#                             a la web para editarlos.
#   MP3JOB:<trabajo>          descarga, recorta, convierte a mp3, escribe los
#                             tags y guarda en la carpeta elegida.
#   MP3PREPARAR:<destino>     primera vez: instala lo necesario y pide la
#                             carpeta ("spotify" o "descargas").
#   MP3CARPETA:<destino>      vuelve a elegir la carpeta donde se guarda.
#
# También acepta lo que manda el atajo MP3 (opcional, para compartir desde
# YouTube): el mismo texto, pero codificado en base64.
#
# Pase lo que pase, termina volviendo a la web: a-Shell mini tiene que verse
# lo menos posible, y cuando se ve, que sea con algo lindo.

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

VERSION = "0.4.0"
WEB_URL = "https://francochifla.github.io/lado-b/"

# Prueba en computadora: MP3_LOCAL=1 imprime los links en vez de abrirlos,
# no instala nada con pip y no abre el selector de carpetas.
# FFMPEG apunta a un ffmpeg propio si hace falta.
LOCAL = os.environ.get("MP3_LOCAL") == "1"
FFMPEG = os.environ.get("FFMPEG")

# Cuando la web lo ejecuta con exec() no hay __file__: todo vive en
# Documentos/ladob, visible en la app Archivos dentro de a-Shell mini.
if "__file__" in globals():
    BASE = os.path.dirname(os.path.abspath(__file__))
else:
    BASE = os.path.join(os.path.expanduser("~"), "Documents", "ladob")
TMP = os.path.join(BASE, "tmp")
SALIDA = os.path.join(BASE, "salida")
RESPALDO = os.path.join(BASE if LOCAL else os.path.join(os.path.expanduser("~"), "Documents"), "Lado B")
CONFIG = os.path.join(BASE, "config.json")
DEPENDENCIAS = "yt-dlp mutagen"
DIAS_ENTRE_ACTUALIZACIONES = 3


# ------------------------------------------------------------------ pantalla
#
# a-Shell es una terminal. Se dibuja un casete con los colores de la web y
# una línea por tema; nada de rutas, comandos ni mensajes técnicos.

def color(n):
    return f"\033[38;5;{n}m"


NARANJA, MOSTAZA, VERDE_AZUL, CREMA, GRIS, OK, MAL = (
    color(166), color(178), color(30), color(230), color(244), color(71), color(167))
NEGRITA, FIN = "\033[1m", "\033[0m"
ANCHO = 26  # interior del casete; entra en un iPhone en vertical


def comando(cmd):
    # a-Shell interpreta el texto del comando por su cuenta; en una
    # computadora normal hace falta pasar por la shell.
    if LOCAL:
        return subprocess.run(cmd, shell=True)
    return subprocess.run(cmd)


def mostrar(texto, fin="\n"):
    print("\r\033[K" + texto, end=fin, flush=True)


def limpiar_pantalla():
    if not LOCAL:
        comando("clear")
        comando("hideKeyboard")
    else:
        print()


def casete(titulo, lineas):
    """Pantalla de a-Shell: un casete y debajo unas líneas de texto."""
    limpiar_pantalla()
    borde = GRIS
    raya = "█" * ANCHO
    etiqueta = f" LADO B{' ' * (ANCHO - 12)}C-60 "
    print()
    print(f"    {borde}╭{'─' * (ANCHO + 2)}╮{FIN}")
    print(f"    {borde}│{FIN} {CREMA}{NEGRITA}{etiqueta}{FIN} {borde}│{FIN}")
    for tono in (NARANJA, MOSTAZA, VERDE_AZUL):
        print(f"    {borde}│{FIN} {tono}{raya}{FIN} {borde}│{FIN}")
    carretes = "◯" + "═" * (ANCHO - 10) + "◯"
    print(f"    {borde}│{FIN}{' ' * 5}{CREMA}{carretes}{FIN}{' ' * 5}{borde}│{FIN}")
    print(f"    {borde}╰{'─' * (ANCHO + 2)}╯{FIN}")
    print()
    print(f"      {CREMA}{NEGRITA}{titulo}{FIN}")
    for linea in lineas:
        print(f"      {GRIS}{linea}{FIN}")
    print()


def barra(fraccion, largo=8):
    llenos = max(0, min(largo, round(fraccion * largo)))
    return f"{NARANJA}{'▰' * llenos}{GRIS}{'▱' * (largo - llenos)}{FIN}"


def fila(n, total, nombre, estado):
    ancho_n = len(str(total))
    nombre = nombre if len(nombre) <= 20 else nombre[:19] + "…"
    return f"    {GRIS}{str(n).rjust(ancho_n)}{FIN}  {nombre.ljust(20)}  {estado}"


# ------------------------------------------------------------------ utilidades

def abrir(url):
    # Con un link https común, Safari reusa la pestaña que esté activa (que
    # puede ser YouTube) y la lista se pierde. "x-safari-https" le pide a iOS
    # abrir Safari en una pestaña nueva.
    if url.startswith("https://"):
        url = "x-safari-" + url
    if LOCAL:
        print(f"\n[local] abriría: {url[:300]}{'...' if len(url) > 300 else ''}")
        with open(os.path.join(BASE, "ultimo_link.txt"), "w", encoding="utf-8") as f:
            f.write(url)
        return
    comando("open " + url)


def comprimir(datos):
    c = zlib.compressobj(9, zlib.DEFLATED, -15)
    crudo = c.compress(json.dumps(datos, ensure_ascii=False, separators=(",", ":")).encode()) + c.flush()
    return base64.urlsafe_b64encode(crudo).decode().rstrip("=")


def desde_base64url(texto):
    texto = texto.strip()
    return base64.urlsafe_b64decode(texto + "=" * (-len(texto) % 4))


def descomprimir(texto):
    return json.loads(zlib.decompress(desde_base64url(texto), -15).decode())


def volver_con_error(mensaje):
    abrir(WEB_URL + "#error=" + urllib.parse.quote(mensaje[:300], safe=""))


def leer_config():
    try:
        with open(CONFIG, encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return {}


def guardar_config(config):
    with open(CONFIG, "w", encoding="utf-8") as f:
        json.dump(config, f, ensure_ascii=False)


# ------------------------------------------------------------- dependencias

def quitar_complemento_webkit():
    """Desinstala, una sola vez, un complemento que versiones anteriores
    instalaban. Corre el código de YouTube en una ventana web oculta y en el
    iPhone eso abre la app de YouTube en medio de la lectura: a-Shell queda en
    segundo plano y iOS ya no le deja volver a Safari."""
    marca = os.path.join(BASE, ".sin-webkit")
    if LOCAL or os.path.exists(marca):
        return
    comando("pip uninstall -y -q yt-dlp-apple-webkit-jsi")
    importlib.invalidate_caches()
    with open(marca, "w") as f:
        f.write(str(time.time()))


def preparar():
    quitar_complemento_webkit()
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

    if faltan:
        casete("Preparando todo", [
            "Esto pasa solo la primera vez",
            "y tarda uno o dos minutos.",
            "No cierres esta pantalla.",
        ])
    else:
        casete("Poniendo al día", ["Unos segundos y seguimos."])
    comando(f"pip install -q --disable-pip-version-check --upgrade {DEPENDENCIAS}")
    importlib.invalidate_caches()
    with open(marca, "w") as f:
        f.write(str(time.time()))


class Silencio:
    # yt-dlp escribe sus errores en pantalla aunque esté en modo silencioso;
    # acá se descartan, porque cada error ya se muestra a su manera.
    def debug(self, _): pass
    def info(self, _): pass
    def warning(self, _): pass
    def error(self, _): pass


def ydl_opciones(**extra):
    opciones = {"quiet": True, "no_warnings": True, "noprogress": True, "color": "never", "logger": Silencio()}
    if FFMPEG:
        opciones["ffmpeg_location"] = FFMPEG
    opciones.update(extra)
    return opciones


# --------------------------------------------------------- carpeta de destino
#
# a-Shell solo puede escribir fuera de su propia carpeta si la persona la elige
# una vez con el selector de iOS (pickFolder). a-Shell recuerda el permiso y
# lo reactiva cada vez que se entra a esa carpeta con cd.

def puede_escribir(carpeta):
    prueba = os.path.join(carpeta, ".ladob-prueba")
    try:
        with open(prueba, "w") as f:
            f.write("ok")
        os.remove(prueba)
        return True
    except Exception:
        return False


# Lo que la persona eligió en la web, con el nombre de la carpeta en el
# selector de iOS en español y en inglés.
RUTAS = {
    "spotify": ("En mi iPhone → Spotify", "On My iPhone → Spotify"),
    "descargas": ("En mi iPhone → Descargas", "On My iPhone → Downloads"),
}


def elegir_carpeta(destino="spotify"):
    """Abre el selector de carpetas de iOS. Devuelve la carpeta o None."""
    if LOCAL:
        return None
    ruta, en_ingles = RUTAS.get(destino, RUTAS["spotify"])
    casete("¿Dónde guardo la música?", [
        "En la ventana que se abre, elegí",
        "",
        f"{CREMA}{ruta}{GRIS}",
        f"({en_ingles})",
        "",
        "y tocá Abrir. Es solo esta vez.",
    ])
    time.sleep(1.5)
    antes = os.getcwd()
    comando("pickFolder")
    carpeta = os.getcwd()
    os.chdir(BASE)
    if carpeta == antes or carpeta.startswith(BASE) or not puede_escribir(carpeta):
        return None
    config = leer_config()
    config["carpeta"] = carpeta
    guardar_config(config)
    return carpeta


def entrar_a_carpeta(carpeta):
    """Reactiva el permiso de a-Shell sobre la carpeta elegida."""
    if LOCAL or not carpeta:
        return False
    comando(f'cd "{carpeta}"')
    ok = puede_escribir(carpeta)
    os.chdir(BASE)
    return ok


def carpeta_destino(destino="spotify"):
    """La carpeta donde guardar y su nombre para mostrar en la web."""
    carpeta = leer_config().get("carpeta")
    if not (carpeta and entrar_a_carpeta(carpeta)):
        carpeta = elegir_carpeta(destino)
    if carpeta:
        return carpeta, nombre_carpeta(carpeta)
    os.makedirs(RESPALDO, exist_ok=True)
    return RESPALDO, "a-Shell mini → Lado B"


def nombre_carpeta(carpeta):
    # La carpeta de una app se ve como ".../<app>/Documents"; mejor mostrar
    # el nombre que la persona reconoce.
    if "spotify" in carpeta.lower():
        return "Spotify"
    partes = [p for p in carpeta.split(os.sep) if p]
    if partes and partes[-1] in ("Downloads", "Descargas"):
        return "Descargas"
    if partes and partes[-1] == "Documents" and len(partes) > 1:
        return partes[-2]
    return partes[-1] if partes else carpeta


# ------------------------------------------------------- modo 1: leer link

ES_YOUTUBE = re.compile(r"https?://(?:[\w-]+\.)*(?:youtube\.com|youtu\.be|youtube-nocookie\.com)/\S*", re.I)


def buscar_link(texto):
    """El primer link de YouTube del texto (puede venir con otras palabras)."""
    m = ES_YOUTUBE.search(texto)
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

    casete("Leyendo el link", ["Buscando los temas…", "En un momento volvés a Lado B."])
    # Para la lista alcanza con títulos y duraciones: player_skip=js evita
    # bajar y ejecutar el código del reproductor de YouTube, que acá no hace
    # falta y es lo más lento.
    opciones = ydl_opciones(extract_flat="in_playlist", skip_download=True,
                            extractor_args={"youtube": {"player_skip": ["js"]}})
    with yt_dlp.YoutubeDL(opciones) as ydl:
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
        volver_con_error("No encontré temas en ese link. Revisá que sea un video o una playlist pública.")
        return

    mostrar(f"      {OK}{len(temas)} {'tema' if len(temas) == 1 else 'temas'}.{FIN} Volviendo…")
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
    except Exception:
        pass
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
    # Los trabajos que llegan por el atajo los guarda el atajo; los que llegan
    # directo desde la web se guardan acá mismo.
    atajo = trabajo.get("shortcut")

    if atajo:
        destino, nombre_destino = SALIDA, ""
        shutil.rmtree(SALIDA, ignore_errors=True)
        os.makedirs(SALIDA)
    else:
        destino, nombre_destino = carpeta_destino(trabajo.get("dest") or "spotify")

    shutil.rmtree(TMP, ignore_errors=True)
    os.makedirs(TMP)

    total = len(temas)
    casete(f"Grabando {total} {'tema' if total == 1 else 'temas'}", [
        "No cierres esta pantalla.",
        "Al terminar volvés a Lado B.",
    ])

    ydl = yt_dlp.YoutubeDL(ydl_opciones())
    ffmpeg = FFmpegPostProcessor(ydl)
    portadas = {}
    # Volver a bajar un tema reemplaza el archivo anterior (por ejemplo, para
    # corregir los datos); solo se numeran los repetidos dentro de esta tanda.
    listos, ids_listos, errores, usados = [], [], [], set()

    for n, t in enumerate(temas, 1):
        nombre_tema = t.get("title") or t["id"]

        def progreso(d, n=n, nombre_tema=nombre_tema):
            if d["status"] == "downloading":
                hecho = d.get("downloaded_bytes") or 0
                todo = d.get("total_bytes") or d.get("total_bytes_estimate") or 0
                mostrar(fila(n, total, nombre_tema, barra(hecho / todo if todo else 0)), fin="")

        try:
            mostrar(fila(n, total, nombre_tema, barra(0)), fin="")
            plantilla = os.path.join(TMP, f"{n:03d}.%(ext)s")
            opciones = ydl_opciones(
                format="bestaudio[ext=m4a]/bestaudio/best", outtmpl=plantilla,
                noplaylist=True, progress_hooks=[progreso])
            with yt_dlp.YoutubeDL(opciones) as y:
                info = y.extract_info(f"https://www.youtube.com/watch?v={t['id']}", download=True)
                original = info["requested_downloads"][0]["filepath"]

            mostrar(fila(n, total, nombre_tema, f"{MOSTAZA}grabando{FIN}"), fin="")
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
                portadas[clave] = preparar_portada(clave, trabajo.get("covers", {}).get(clave, {}), ffmpeg)
            etiquetar(mp3, t, portadas.get(clave) if clave else None)

            nombre = nombre_archivo(patron, t)
            final, copia = nombre, 2
            while final.lower() in usados:
                final, copia = f"{nombre} ({copia})", copia + 1
            usados.add(final.lower())
            ruta_final = os.path.join(destino, final + ".mp3")
            # Copiar y borrar (y no mover): la carpeta de destino suele ser de
            # otra app, y copiar además reemplaza un archivo con el mismo nombre.
            shutil.copyfile(mp3, ruta_final)
            os.remove(mp3)
            os.remove(original)
            listos.append(ruta_final)
            ids_listos.append(t["id"])
            mostrar(fila(n, total, nombre_tema, f"{OK}✓{FIN}"))
        except Exception as e:
            motivo = str(e).replace("ERROR: ", "").splitlines()[0][:160] if str(e) else type(e).__name__
            errores.append({"i": t["id"], "m": motivo})
            mostrar(fila(n, total, nombre_tema, f"{MAL}✗{FIN}"))

    shutil.rmtree(TMP, ignore_errors=True)

    resultado = {"ok": ids_listos, "err": errores}
    if nombre_destino:
        resultado["dest"] = nombre_destino
    volver = WEB_URL + "#listo=" + comprimir(resultado)
    print()
    mostrar(f"      {OK}Listo.{FIN} Volviendo a Lado B…")

    if atajo and listos:
        # El atajo guarda los archivos y después abre "volver".
        datos = json.dumps({"mp3files": listos, "volver": volver}, ensure_ascii=False)
        abrir(f"shortcuts://run-shortcut?name={urllib.parse.quote(atajo)}"
              f"&input=text&text={urllib.parse.quote(datos, safe='')}")
    else:
        abrir(volver)


def cambiar_carpeta(destino, clave="carpeta"):
    """Elige la carpeta y vuelve a la web. Se usa al preparar todo la primera
    vez (#preparado) y desde Ajustes (#carpeta)."""
    carpeta = elegir_carpeta(destino)
    if carpeta:
        abrir(WEB_URL + f"#{clave}=" + urllib.parse.quote(nombre_carpeta(carpeta), safe=""))
    else:
        volver_con_error("No se eligió ninguna carpeta. Los temas se van a guardar en a-Shell mini → Lado B "
                         "hasta que elijas otra en Ajustes.")


# ----------------------------------------------------------------- inicio

def leer_entrada(crudo):
    """Lo que llega desde la web viene en claro; lo del atajo, en base64."""
    if crudo.startswith(("MP3JOB:", "MP3URL:", "MP3CARPETA", "MP3PREPARAR", "http")):
        return crudo
    try:
        return base64.b64decode(crudo + "=" * (-len(crudo) % 4)).decode("utf-8")
    except Exception:
        return crudo


def main():
    limpiar_pantalla()
    os.makedirs(BASE, exist_ok=True)
    os.chdir(BASE)
    crudo = "".join(sys.argv[1:]).strip()
    if not crudo:
        # Abrieron el atajo sin compartir nada: directo a la página.
        abrir(WEB_URL)
        return

    texto = leer_entrada(crudo)
    try:
        preparar()
        if texto.startswith("MP3JOB:"):
            procesar(descomprimir(texto[len("MP3JOB:"):]))
        elif texto.startswith(("MP3CARPETA", "MP3PREPARAR")):
            # "MP3PREPARAR:spotify": primera vez, ya con las herramientas
            # instaladas por preparar(); "MP3CARPETA:descargas": desde Ajustes.
            orden, _, destino = texto.partition(":")
            cambiar_carpeta(destino or "spotify", "preparado" if orden == "MP3PREPARAR" else "carpeta")
        else:
            if texto.startswith("MP3URL:"):
                texto = desde_base64url(texto[len("MP3URL:"):]).decode("utf-8")
            url = buscar_link(texto)
            if url:
                leer_link(url)
            elif WEB_URL.rstrip("/") in texto:
                # Compartieron la propia página (por ejemplo, desde Safari): no
                # hay nada que leer, se vuelve a ella sin error.
                abrir(WEB_URL)
            else:
                volver_con_error("Ese link no es de YouTube. Copiá el link de un video o una playlist desde YouTube o YouTube Music.")
    except Exception as e:
        motivo = str(e).replace("ERROR: ", "").splitlines()[0][:200] if str(e) else type(e).__name__
        volver_con_error(f"Algo salió mal: {motivo}")


if __name__ == "__main__":
    main()
