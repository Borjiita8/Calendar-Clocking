# Fichajes – registro personal de jornada

App móvil para hacer **clock in / clock out** con un botón, guardar todos los fichajes del año
(y de los siguientes) y generar un **Excel (.xlsx) de cualquier mes** con las horas trabajadas y
las **horas extra**, listas para pasarlas al calendario de la empresa.

- Horario configurado por defecto: **lunes a viernes, 07:00–15:00 hora de Madrid (CET/CEST)**, sin pausa.
- Puedes hacer tantos clock in / clock out como quieras en el mismo día (p. ej. salir a comer y
  volver a conectarte por la tarde).
- Todo lo fichado **fuera de 07:00–15:00**, en **fin de semana** o en **festivo/vacaciones** cuenta como horas extra.

---

## Evaluación de viabilidad en un Samsung Galaxy S25

**Conclusión: es viable y es la opción recomendada.** La app es una **PWA** (Progressive Web App):
una web que Android instala como una app normal, con icono propio, a pantalla completa y sin conexión.

| Requisito | ¿Se cumple? | Cómo |
|---|---|---|
| Funcionar en el S25 (Android 15 / One UI 7) | ✅ | Chrome y Samsung Internet soportan PWAs instalables por completo. |
| Botones de clock in / clock out | ✅ | Pantalla principal con dos botones grandes y vibración al pulsar. |
| Varios fichajes en el mismo día | ✅ | Cada entrada/salida es un tramo independiente; se suman por día. |
| Horario L–V 07:00–15:00 CET | ✅ | Configurable en *Ajustes*. Los cálculos usan siempre `Europe/Madrid`, con el cambio de hora verano/invierno incluido. |
| Guardar el registro de todo el año | ✅ | Base de datos local (IndexedDB) sin límite de años. Unos 500 fichajes al año ocupan menos de 100 KB. |
| Excel de cualquier mes | ✅ | Se genera en el propio móvil, sin internet y sin enviar datos a nadie. |
| Pasar las horas extra al calendario | ✅ | Hoja «Horas extra» del Excel y exportación **.ics**, que se importa en Google Calendar u Outlook. |
| Funcionar sin cobertura | ✅ | Un *service worker* guarda la app en caché tras la primera visita. |
| Privacidad | ✅ | Los fichajes no salen del móvil. No hay servidor ni cuentas. |

**Por qué una PWA y no una APK nativa:**
- No necesitas Android Studio, Google Play ni instalar APKs de origen desconocido.
- Se actualiza sola cuando se publica una versión nueva.
- La misma app funciona también en el ordenador por si quieres consultar o descargar el Excel allí.
- Si algún día quisieras una APK, esta misma PWA se puede empaquetar con *Bubblewrap* (TWA) sin reescribirla.

**Limitaciones que conviene conocer:**
1. **Los datos viven solo en el móvil.** Si desinstalas la app o borras los datos de Chrome, se
   pierden. Por eso hay un botón de **copia de seguridad** (.json): guárdala de vez en cuando en
   Google Drive. La app además pide al navegador almacenamiento *persistente*, que Chrome concede
   a las PWAs instaladas, para que Android no borre los datos por falta de espacio.
2. **No hay recordatorios automáticos** («¡no has fichado!»). Una PWA sin servidor no puede
   programar notificaciones fiables. Si un día olvidas fichar, puedes **añadir o corregir el
   fichaje a mano** desde *Historial* (queda marcado como «manual» en el Excel).
3. **Necesita estar publicada en una URL https** para poder instalarse (ver abajo).

**Sobre la obligación legal de fichar en España:** el registro diario de jornada (art. 34.9 del
Estatuto de los Trabajadores) lo tiene que garantizar **la empresa** con su propio sistema. Esta app
es tu **control personal**: te sirve para cuadrar las horas extra y reclamar su compensación, y
como prueba de apoyo, pero **no sustituye** el fichaje oficial de la empresa.

---

## Instalación

### 1. Publicar la app (una sola vez)

El repositorio es **privado**, y GitHub Pages solo publica gratis desde repositorios **públicos**
(desde uno privado hace falta GitHub Pro). Hay tres opciones:

- **A. GitHub Pages (recomendada si el repo puede ser público).** El repositorio no contiene
  ningún dato personal: tus fichajes se quedan en el móvil.
  1. Fusiona esta rama en `main`.
  2. *Settings → General → Change visibility → Public* (o contrata GitHub Pro y mantenlo privado).
  3. *Settings → Pages → Build and deployment → Source: **GitHub Actions***.
  4. El workflow `.github/workflows/pages.yml` pasa los tests y publica la app en
     `https://borjiita8.github.io/Calendar-Clocking/`.
- **B. Netlify Drop (gratis, el repo sigue privado).** Entra en <https://app.netlify.com/drop> y
  arrastra una carpeta con `index.html`, `manifest.webmanifest`, `sw.js`, `css/`, `js/` e `icons/`.
  Te da una URL https al momento.
- **C. Cloudflare Pages (gratis, el repo sigue privado).** Conecta el repositorio, sin comando de
  build y con el directorio de salida `/`.

### 2. Instalarla en el Samsung S25

1. Abre la URL en **Chrome** (o Samsung Internet).
2. Pulsa el botón **«Instalar app»** que aparece arriba a la derecha, o menú ⋮ → **«Añadir a pantalla
   de inicio» → Instalar**.
3. Aparecerá el icono **Fichajes** en el cajón de aplicaciones. Ábrela desde ahí; ya funciona sin conexión.
4. Recomendado en el S25: *Ajustes → Batería → Límites de uso en segundo plano* y comprueba que
   **Chrome** no esté en «Apps en suspensión profunda».

---

## Uso

- **Fichar:** pulsa **Clock in** al empezar y **Clock out** al terminar o salir a comer. Repite
  tantas veces como haga falta en el día. Verás el tiempo trabajado hoy, el que está dentro del
  horario y las horas extra.
- **Historial:** fichajes de cada mes por día. Toca uno para editarlo, añadirle una nota o borrarlo.
  **+ Añadir** sirve para fichajes olvidados. La app impide guardar fichajes que se solapen.
- **Informes:** elige el mes y pulsa **Descargar Excel**. El fichero se guarda en *Descargas*.
  **Compartir Excel** lo envía directamente por correo, Drive, Teams, etc.
  **Horas extra para calendario (.ics)** crea un evento por cada tramo de horas extra.
- **Ajustes:** horario, días laborables, **festivos y vacaciones** (el botón añade los festivos
  nacionales del año; añade a mano los de tu comunidad y localidad), y copia de seguridad.

### Cómo se calculan las horas extra

| Situación | Ejemplo | Horas extra |
|---|---|---|
| Jornada normal | 07:00–15:00 | 0:00 |
| Sales a comer y vuelves por la tarde | 07:00–15:00 y 16:00–18:30 | 2:30 |
| Entras antes | 06:30–15:00 | 0:30 |
| Sábado, domingo, festivo o vacaciones | 10:00–12:00 | 2:00 |
| Fichaje que cruza medianoche | 22:00–01:00 | Se reparte entre los dos días |

### Contenido del Excel

| Hoja | Contenido |
|---|---|
| **Resumen** | Totales del mes: trabajado, jornada teórica, dentro de horario, horas extra y balance. |
| **Diario** | Una fila por día: tipo de día, nº de fichajes, primera entrada, última salida, horas y balance, con fila de TOTAL. |
| **Fichajes** | Cada tramo de entrada/salida con su duración, sus horas extra, el origen (botón o manual) y la nota. |
| **Horas extra** | Cada tramo de horas extra (fecha, desde, hasta, duración, motivo), listo para copiar al calendario de la empresa. |

> La «jornada teórica» cuenta todos los días laborables del mes hasta hoy. Si un día no trabajas
> por vacaciones, añádelo en *Ajustes → Festivos y vacaciones* para que el balance cuadre.

---

## Desarrollo

Sin dependencias ni paso de compilación: HTML + CSS + JavaScript (módulos ES).

```
index.html            Interfaz
css/styles.css        Estilos (modo claro y oscuro)
js/app.js             Lógica de la interfaz
js/calc.js            Cálculos de jornada y zona horaria (Europe/Madrid)
js/report.js          Generación del Excel y del .ics
js/xlsx.js            Escritor .xlsx mínimo (sin librerías externas)
js/db.js              Almacenamiento local (IndexedDB)
sw.js                 Service worker (uso sin conexión)
manifest.webmanifest  Manifiesto de la PWA
tests/                Tests (node --test)
```

```bash
npm test        # ejecuta los tests
npm start       # servidor local en http://localhost:8080
```

Al publicar una versión nueva, cambia `CACHE` en `sw.js` (p. ej. `fichajes-v2`).
