# Atajo MP3 (opcional)

Lado B funciona sin atajo: se pega el link en la página. El atajo solo suma poder compartir directo desde la app de YouTube (Compartir → MP3). Lo que sigue explica cómo armarlo.

Esto lo hace una sola persona, una sola vez. Después se comparte con un link de iCloud y el resto de la gente solo toca "Agregar atajo".

El atajo casi no tiene lógica: le pasa lo que recibe a `mp3.py` (que baja de GitHub en cada uso) y guarda los archivos que le devuelve. Por eso casi nunca hace falta tocarlo.

Antes de empezar: a-Shell mini instalado y abierto al menos una vez.

## 1. Crear el atajo

1. Abrí **Atajos** → **+**.
2. Arriba, tocá el nombre y ponele **MP3**. El nombre importa: la web y el script llaman al atajo por ese nombre.
3. Tocá la **(i)** de abajo → activá **Mostrar en hoja para compartir**. En los tipos que recibe, dejá solo **URL** y **Texto**.

## 2. Acciones, en este orden

**Acción 1. Texto**
Adentro poné la variable **Entrada del atajo**. Esto convierte lo que llegue (un link o un texto) en texto plano.

**Acción 2. Si**
Condición: **Texto** · **contiene** · `mp3files`

Lo que va **adentro del Si** es la vuelta: el script terminó y manda la lista de archivos.

- **Obtener diccionario de** → **Texto**
- **Obtener valor para** `mp3files` **en** → **Diccionario**
- **Repetir con cada** elemento de → **Valor del diccionario**
  - **Get File** (de a-Shell mini). En el nombre del archivo, poné la variable **Elemento de repetición**. Tocá la flecha y desactivá **Mostrar al ejecutar**, para que no aparezca un cartel por cada archivo.
- *(fin del Repetir)*
- **Guardar archivo** → **Resultados de la repetición**
  - Desactivá **Preguntar dónde guardar**.
  - Carpeta: **En mi iPhone → Spotify** (se elige tocando la carpeta, no se escribe).
  - Activá **Sobrescribir si el archivo existe**.
- **Obtener valor para** `volver` **en** → **Diccionario**
- **Abrir URL** → **Valor del diccionario**. Vuelve a la web, que muestra el aviso de "Listo".

Lo que va en **De lo contrario** es la ida: llegó un link o un trabajo armado en la web.

- **Codificar en base64** → **Texto**
  - Tocá la flecha de la acción y poné **Saltos de línea: Ninguno**. Este paso es importante: con saltos de línea el comando se corta.
- **Texto** (una segunda acción de texto) con estas líneas. Al final de la última, después de un espacio, insertá la variable **Texto codificado** como burbuja:

  ```
  cd $HOME/Documents
  mkdir -p ladob
  cd ladob
  curl -fsL https://francochifla.github.io/lado-b/mp3.py -o mp3.py
  python mp3.py [Texto codificado]
  ```

- **Execute Command** (de a-Shell mini) → solo la variable **Texto** de la acción anterior. No agregues más comandos con el **+**: cada uno corre por separado.
  - Tocá la flecha y poné **Abrir la app para ejecutar los comandos: sí**. Las descargas necesitan la app abierta.

**Fin del Si.**

## 3. Probar

1. En YouTube, compartí un video → **MP3**. Se abre a-Shell mini, después Safari con la lista.
2. Tocá **Descargar**. Se abre a-Shell mini, descarga, Atajos guarda los mp3 y volvés solo a la web con el aviso de "Listo".
3. Fijate en **Archivos → En mi iPhone → Spotify**.

La primera vez Atajos pide varios permisos (abrir a-Shell mini, abrir URLs, guardar en la carpeta). Tocá **Permitir siempre** donde aparezca.

## 4. Compartir

1. En Atajos, mantené apretado **MP3** → **Compartir** → **Copiar enlace de iCloud**.
2. Pegá ese link en `assets/config.js`, en `atajoICloud`, y subí el cambio a GitHub.

Desde ese momento el botón **Agregar el atajo** de la página de instalación funciona para cualquiera.

Si querés que cada persona elija su carpeta al instalarlo, en la acción **Guardar archivo** podés agregar una pregunta de importación (si tu versión de iOS lo permite): mantené apretada la carpeta → **Agregar pregunta de importación**.

## Si algo falla

- **Se abre a-Shell mini y no pasa nada**: revisá que **Saltos de línea** esté en **Ninguno**.
- **Error de `curl`**: la web todavía no está publicada, o el link de GitHub Pages no coincide con el del comando.
- **Se descargan pero no se guardan**: revisá que la condición del **Si** sea sobre la acción **Texto** y no sobre la entrada directa.
