# Lado B

Pasá links de YouTube (videos o playlists) a mp3 con título, artista, álbum y portada, directo en el iPhone. Sin servidor, sin cuentas y gratis: la descarga la hace cada teléfono con a-Shell mini, y la web es estática en GitHub Pages.

## Cómo funciona

```
Pegás un link en la web
  → la web abre ashellmini://python -c "exec(<mp3.py de GitHub Pages>)" MP3URL:...
  → a-Shell mini lee la lista (sin descargar) y vuelve a la web (#d=...)
  → editás, elegís temas, recortás
  → la web vuelve a abrir a-Shell mini con el trabajo (MP3JOB:...)
  → mp3.py descarga, recorta, convierte, etiqueta y guarda en la carpeta elegida
  → vuelve a la web con el resultado (#listo=...)
```

La primera descarga abre el selector de carpetas de iOS (`pickFolder`); a-Shell recuerda el permiso. Si no se elige ninguna, los mp3 quedan en a-Shell mini → Lado B.

| Archivo | Qué hace |
|---|---|
| `index.html`, `assets/` | El editor y el tutorial de la primera vez. HTML, CSS y JavaScript sin paso de compilación. |
| `instalar.html` | Instalación y preguntas frecuentes. |
| `mp3.py` | Corre en a-Shell mini. La web lo baja de GitHub Pages en cada uso, así que los cambios llegan solos. |
| `ATAJO.md` | Atajo opcional para compartir desde la app de YouTube. |
| `assets/config.js` | Link de la App Store y del atajo opcional. |

Servicios externos, gratuitos y sin clave: SponsorBlock (intros y finales sin música) y el reproductor de YouTube (para marcar los recortes).

## Publicar

La web se publica sola con GitHub Pages desde la rama `main`: cada `git push` la actualiza en un par de minutos, y con ella el `mp3.py` que bajan los teléfonos.

- Web: https://francochifla.github.io/lado-b/
- Script: https://francochifla.github.io/lado-b/mp3.py

Si el repositorio cambia de nombre o de dueño, hay que actualizar `WEB_URL` en `mp3.py`.

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
