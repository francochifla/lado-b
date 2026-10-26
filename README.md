# Lado B

Pasá links de YouTube (videos o playlists) a mp3 con título, artista, álbum y portada, directo en el iPhone. Sin servidor, sin cuentas y gratis: la descarga la hace cada teléfono con a-Shell mini, y la web es estática en GitHub Pages.

## Cómo funciona

```
YouTube → Compartir → atajo MP3
  → a-Shell mini corre mp3.py: lee la lista (sin descargar)
  → abre la web con los datos en el link (#d=...)
  → editás, elegís temas, recortás
  → la web llama al atajo con el trabajo (MP3JOB:...)
  → mp3.py descarga, recorta, convierte, etiqueta
  → devuelve las rutas al atajo, que guarda los mp3 en la carpeta elegida
```

| Archivo | Qué hace |
|---|---|
| `index.html`, `assets/` | El editor. HTML, CSS y JavaScript sin paso de compilación. |
| `instalar.html` | Instalación para usuarios, en 4 pasos. |
| `mp3.py` | Corre en a-Shell mini. El atajo lo baja de GitHub Pages en cada uso, así que los cambios llegan solos. |
| `ATAJO.md` | Cómo armar el atajo (una sola vez) y compartirlo. |
| `assets/config.js` | Link de iCloud del atajo y nombre por defecto. |

Servicios externos, todos gratuitos y sin clave: la API de búsqueda de iTunes (datos y portadas), SponsorBlock (intros y finales sin música) y el reproductor de YouTube (para marcar los recortes).

## Publicar

La web se publica sola con GitHub Pages desde la rama `main`: cada `git push` la actualiza en un par de minutos, y con ella el `mp3.py` que bajan los teléfonos.

- Web: https://francochifla.github.io/lado-b/
- Script: https://francochifla.github.io/lado-b/mp3.py

Si el repositorio cambia de nombre o de dueño, hay que actualizar `WEB_URL` en `mp3.py` y el comando del atajo (`ATAJO.md`).

Pendiente: armar el atajo siguiendo `ATAJO.md` y pegar su link de iCloud en `assets/config.js`.

## Probar en la computadora

La web:

```
python -m http.server 8765
```

El script, sin abrir links ni instalar nada (imprime lo que abriría):

```
pip install yt-dlp mutagen
MP3_LOCAL=1 python mp3.py "https://www.youtube.com/watch?v=..."
```

Si no tenés `ffmpeg` instalado, apuntá `FFMPEG` a un ejecutable.
