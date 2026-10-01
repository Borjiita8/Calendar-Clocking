# Fichajes · Registro de jornada

**Fichajes** es una aplicación web para llevar el control personal de la jornada laboral desde el
móvil. Permite hacer *clock in* y *clock out* con un solo toque, calcula automáticamente las horas
extra y las horas pendientes de compensar según el horario de cada persona, y genera informes
mensuales en Excel listos para entregar o para trasladar al calendario de la empresa.

Funciona sin conexión, se instala como una app en Android, iPhone y ordenador, y **todos los datos
se guardan únicamente en el dispositivo**: no hay cuentas, servidores ni seguimiento.

**Acceso:** <https://borjiita8.github.io/Calendar-Clocking/>

---

## Índice

- [Funcionalidades](#funcionalidades)
- [Compatibilidad](#compatibilidad)
- [Instalación](#instalación)
- [Guía de uso](#guía-de-uso)
- [Cálculo de la jornada y de las horas extra](#cálculo-de-la-jornada-y-de-las-horas-extra)
- [Informes](#informes)
- [Privacidad y almacenamiento de datos](#privacidad-y-almacenamiento-de-datos)
- [Información importante](#información-importante)
- [Desarrollo](#desarrollo)

---

## Funcionalidades

**Fichaje**
- Botones grandes de **Clock in** y **Clock out**, con reloj en tiempo real y contador de la
  sesión en curso.
- **Varios fichajes en el mismo día**: salir a comer, volver a conectarse por la tarde, etc.
- **Fichaje con otra hora** para registrar una entrada o salida olvidada del día actual
  (por ejemplo, una entrada a las 07:56 registrada a las 09:30).
- Resumen del día: tiempo trabajado, tiempo que falta para completar la jornada y horas extra,
  con la hora estimada a la que se completará la jornada.
- Aviso automático si queda un fichaje abierto desde otro día.

**Jornada y calendario**
- Horario configurable: hora de entrada, hora de salida y **break** para comer (vacío = jornada
  continua). La aplicación calcula y muestra las horas de jornada diarias y semanales.
- **Horario personalizado por día de la semana**, para quien tiene horarios distintos según el día
  (jornada intensiva los viernes, sábados laborables, etc.).
- **Vacaciones** por rangos de fechas, desde la pantalla principal.
- **Festivos**, con carga automática de los festivos nacionales de España del año en curso.

**Historial e informes**
- Historial mensual por días, con edición, notas y borrado de fichajes.
- Alta manual de fichajes de días anteriores, con o sin hora de salida.
- Validaciones: no se permiten fichajes solapados, salidas anteriores a la entrada ni horas futuras.
- **Informe mensual en Excel (.xlsx)** de cualquier mes y año.
- **Exportación de las horas extra a calendario (.ics)**, compatible con Google Calendar, Outlook
  y Apple Calendar.

**Datos**
- Funcionamiento completo **sin conexión**.
- Historial ilimitado: se conservan todos los años registrados.
- **Copia de seguridad** exportable e importable (.json).
- Modo claro y oscuro automáticos, según la configuración del dispositivo.

---

## Compatibilidad

Fichajes es una *Progressive Web App* (PWA): se instala desde el navegador, sin pasar por tiendas
de aplicaciones, y se abre a pantalla completa con su propio icono, como cualquier otra app.

| | Android | iPhone / iPad | Ordenador |
|---|---|---|---|
| Versión mínima recomendada | Android 9 o superior | iOS / iPadOS 16.4 o superior | Windows, macOS o Linux |
| Navegador recomendado | Chrome, Samsung Internet o Edge | Safari | Chrome o Edge |
| Instalación como app | ✅ Botón «Instalar app» o menú del navegador | ✅ Compartir → «Añadir a pantalla de inicio» | ✅ Icono de instalar en la barra de direcciones |
| Uso sin conexión | ✅ | ✅ | ✅ |
| Descarga del Excel | ✅ Carpeta *Descargas* | ✅ App *Archivos* | ✅ Carpeta de descargas |
| Compartir el Excel (correo, Drive, Teams…) | ✅ | ✅ | Según navegador |
| Almacenamiento persistente | ✅ Garantizado al instalar la app | ⚠️ Gestionado por iOS (ver nota) | ✅ |
| Vibración al fichar | ✅ | — (no disponible en iOS) | — |

**Notas sobre iPhone / iPad**
- La instalación solo se ofrece desde el menú **Compartir** de Safari; no aparece el botón
  «Instalar app» dentro de la aplicación.
- En iOS, los datos de la app instalada en la pantalla de inicio y los de la web abierta en Safari
  son **independientes**. Usa siempre la app instalada para no tener fichajes repartidos.
- iOS puede liberar el almacenamiento de las webs que no se usan durante un tiempo. Las apps
  añadidas a la pantalla de inicio quedan protegidas en la práctica, pero se recomienda
  especialmente hacer **copias de seguridad periódicas**.

**Notas sobre Android**
- En algunos fabricantes (por ejemplo, Samsung o Xiaomi), conviene comprobar en *Ajustes → Batería*
  que el navegador no esté restringido o en suspensión profunda.

---

## Instalación

**Android**
1. Abre la dirección de la aplicación en Chrome (o Samsung Internet / Edge).
2. Pulsa **«Instalar app»** en la parte superior, o menú ⋮ → **«Añadir a pantalla de inicio»** →
   **Instalar**.
3. Abre la app desde el icono **Fichajes**.

**iPhone / iPad**
1. Abre la dirección de la aplicación en **Safari**.
2. Pulsa el botón **Compartir** (cuadrado con flecha hacia arriba).
3. Selecciona **«Añadir a pantalla de inicio»** → **Añadir**.
4. Abre la app desde el icono **Fichajes**.

**Ordenador**
1. Abre la dirección de la aplicación en Chrome o Edge.
2. Pulsa el icono de instalación en la barra de direcciones, o menú → **«Instalar Fichajes»**.

Tras la primera apertura con conexión, la aplicación funciona sin internet. Las actualizaciones se
descargan automáticamente al abrirla con conexión; para aplicarlas, cierra la app por completo y
vuelve a abrirla.

### Primeros pasos recomendados
1. **Ajustes → Jornada laboral**: revisa el horario, el break y los días laborables.
2. **Ajustes → Festivos**: añade los festivos nacionales y los de tu comunidad autónoma y localidad.
3. **🏖 Vacaciones** (pantalla principal): registra tus periodos de vacaciones.

---

## Guía de uso

La aplicación tiene cuatro pantallas, accesibles desde la barra inferior.

### Fichar
- **Clock in** al empezar a trabajar y **Clock out** al terminar o al hacer una pausa. Se pueden
  hacer tantos fichajes como sea necesario en el mismo día.
- **🕘 Clock in / Clock out con otra hora**: registra la hora real de una entrada o salida del día
  de hoy que se olvidó fichar. Estos fichajes quedan marcados como «manual».
- **🏖 Vacaciones**: añade periodos indicando la fecha de inicio y la de fin (pueden coincidir para
  un solo día). Muestra los días laborables que abarca cada periodo y permite eliminarlos.
- El bloque **Hoy** muestra lo trabajado, lo que falta para completar la jornada y las horas extra.
  Tocando un fichaje se puede editar.

### Historial
- Fichajes de cada mes agrupados por día, con el total trabajado y las horas extra (+) o
  pendientes (−) de cada día.
- **+ Añadir** permite registrar fichajes de otros días. Marca **«Sigo trabajando»** si el fichaje
  aún no tiene hora de salida.
- Tocando cualquier fichaje se puede corregir la entrada o la salida, añadir una nota o eliminarlo.

### Informes
- Selecciona el mes y consulta el resumen: horas trabajadas, jornada teórica, horas extra, horas
  pendientes, balance neto, días con fichajes y días de vacaciones.
- **Descargar Excel**, **Compartir Excel** y **Horas extra para calendario (.ics)**.

### Ajustes
- **Jornada laboral**: entrada, salida, break en minutos (vacío = jornada continua) y días
  laborables. Se muestra la jornada diaria y semanal resultante.
- **Horario personalizado cada día**: al activarlo, cada día de la semana tiene su propia entrada,
  salida y break, y se puede marcar como laborable o libre. Al desactivarlo se vuelve al horario
  general sin perder la configuración personalizada.
- **Festivos**: alta manual o carga de los festivos nacionales del año.
- **Copia de seguridad**: exportar e importar todos los datos.

---

## Cálculo de la jornada y de las horas extra

La **jornada de cada día** se calcula a partir del horario configurado para ese día de la semana:

> **Jornada = (hora de salida − hora de entrada) − break**

Por ejemplo, 07:00–15:00 sin break son 8 h; 08:00–17:00 con 60 minutos de break también son 8 h.

Cada día se suman todos los tramos fichados y se comparan con la jornada:

- **Horas extra**: lo trabajado por encima de la jornada del día.
- **Horas pendientes de compensar**: lo que falta para completar la jornada.
- **Balance**: horas extra menos horas pendientes.

Lo que cuenta es el **tiempo total trabajado**, no la hora de entrada o de salida. Entrar más tarde
y salir más tarde no genera horas extra si el total no supera la jornada.

En **fines de semana, festivos, vacaciones** y días marcados como no laborables no se espera
jornada: todo el tiempo fichado se considera hora extra.

| Situación | Horario del día | Fichajes | Horas extra | Pendiente |
|---|---|---|---|---|
| Jornada normal | 07:00–15:00 (8 h) | 07:00–15:00 | 0:00 | 0:00 |
| Entrada tarde, comida y vuelta | 07:00–15:00 (8 h) | 07:56–13:00 y 14:00–17:30 | 0:34 | 0:00 |
| Tarde adicional | 07:00–15:00 (8 h) | 07:00–15:00 y 16:00–18:30 | 2:30 | 0:00 |
| Salida anticipada | 07:00–15:00 (8 h) | 07:00–13:00 | 0:00 | 2:00 |
| Jornada partida | 08:00–17:00, break 60 min (8 h) | 08:00–13:00 y 14:00–17:30 | 0:30 | 0:00 |
| Viernes intensivo | 08:00–14:00 (6 h) | 08:00–14:30 | 0:30 | 0:00 |
| Sábado, festivo o vacaciones | — | 10:00–12:00 | 2:00 | 0:00 |

**Criterios adicionales**
- Las pausas para comer se registran con un *clock out* y un nuevo *clock in*; el tiempo de pausa
  no se suma.
- Los tramos de horas extra que aparecen en el Excel y en el calendario corresponden al **final del
  día**, a partir del momento en que se completa la jornada.
- Los fichajes se contabilizan por **minutos completos**.
- Un fichaje que cruza la medianoche se reparte entre los dos días.
- Todos los cálculos usan la hora peninsular española (**Europe/Madrid**, CET/CEST), incluido el
  cambio de hora de verano e invierno, con independencia de la zona horaria del dispositivo.
- La jornada teórica del mes cuenta los días laborables hasta la fecha actual. Registrar vacaciones
  y festivos evita que esos días aparezcan como horas pendientes.

---

## Informes

### Excel mensual (.xlsx)

| Hoja | Contenido |
|---|---|
| **Resumen** | Horario de cada día de la semana y jornada semanal; totales del mes: horas trabajadas, jornada teórica, horas extra, horas pendientes, balance neto, días con fichajes, días y periodos de vacaciones. |
| **Diario** | Una fila por día: tipo de día (laborable, festivo, vacaciones, fin de semana), número de fichajes, primera entrada, última salida, trabajado, jornada, horas extra, pendiente y balance, con fila de totales. |
| **Fichajes** | Cada tramo de entrada y salida con su duración, la parte que es hora extra, el origen (botón o manual) y la nota. |
| **Horas extra** | Cada tramo de horas extra con fecha, hora de inicio, hora de fin, duración y motivo, listo para trasladar al calendario de la empresa. |

El archivo se genera en el propio dispositivo, sin conexión, y es compatible con Microsoft Excel,
Google Sheets, LibreOffice y Numbers.

### Calendario (.ics)
Contiene un evento por cada tramo de horas extra del mes seleccionado. Al abrirlo o importarlo en
Google Calendar, Outlook o Apple Calendar, los tramos aparecen como eventos en su fecha y hora.

---

## Privacidad y almacenamiento de datos

- Los fichajes y la configuración se guardan **solo en el dispositivo**, en el almacenamiento
  local del navegador (IndexedDB).
- La aplicación **no envía datos a ningún servidor**, no requiere registro y no incluye analítica,
  publicidad ni rastreadores.
- Los informes y las copias de seguridad se generan localmente y solo salen del dispositivo si el
  usuario los comparte.
- Cada dispositivo y cada navegador tienen sus propios datos; no se sincronizan entre sí. Para
  pasar los datos a otro dispositivo, exporta una copia de seguridad e impórtala en el nuevo.

### Copias de seguridad
Como los datos residen solo en el dispositivo, **desinstalar la app, borrar los datos del navegador
o cambiar de móvil elimina los fichajes**. Se recomienda:

1. Exportar una copia desde **Ajustes → Copia de seguridad → Exportar copia (.json)**, por ejemplo
   una vez al mes después de generar el informe.
2. Guardarla en un lugar seguro (Google Drive, iCloud Drive, OneDrive, correo…).
3. Para restaurarla, usar **Importar copia**. Los fichajes que ya existan se actualizan y el resto
   se añade; no se duplican.

---

## Información importante

- **Herramienta de control personal.** Fichajes sirve para llevar un registro propio de la jornada,
  contrastarlo con el de la empresa y justificar horas extra o compensaciones.
- **No sustituye al registro oficial de jornada.** En España, la obligación de registrar la jornada
  diaria corresponde a la empresa (art. 34.9 del Estatuto de los Trabajadores), que debe disponer
  de su propio sistema. Este registro personal puede servir como documentación de apoyo, pero no
  reemplaza al sistema de la empresa ni constituye asesoramiento legal.
- **Horas extra y compensación.** La aplicación aplica un criterio aritmético (tiempo trabajado
  frente a jornada configurada). La consideración final de las horas extra y su compensación
  dependen del convenio colectivo, del contrato y de los acuerdos con la empresa.
- **Sin recordatorios automáticos.** Al no depender de ningún servidor, la aplicación no puede
  enviar notificaciones de aviso para fichar. Los fichajes olvidados se pueden registrar después
  con la hora real.
- **Fichajes manuales.** Las entradas y salidas registradas a posteriori quedan identificadas como
  «Manual» en el historial y en el Excel, para mayor transparencia.
- **Festivos.** La carga automática incluye solo los festivos nacionales comunes. Los festivos
  autonómicos y locales deben añadirse manualmente.

---

## Desarrollo

Aplicación estática sin dependencias ni proceso de compilación: HTML, CSS y JavaScript con módulos
ES. El archivo Excel se genera con un escritor .xlsx propio, sin librerías externas.

```
index.html            Interfaz
css/styles.css        Estilos (modo claro y oscuro)
js/app.js             Lógica de la interfaz
js/calc.js            Cálculo de jornada, horas extra, festivos y zona horaria
js/report.js          Generación del Excel y del calendario .ics
js/xlsx.js            Escritor de archivos .xlsx
js/db.js              Almacenamiento local (IndexedDB)
sw.js                 Service worker (funcionamiento sin conexión)
manifest.webmanifest  Manifiesto de la PWA
icons/                Iconos de la aplicación
tests/                Tests de cálculo y de generación de informes
```

```bash
npm test        # ejecuta los tests (Node.js 20 o superior)
npm start       # servidor local en http://localhost:8080
```

**Publicación.** Cada cambio en la rama `main` ejecuta los tests y, si pasan, publica la aplicación
en GitHub Pages mediante el workflow `.github/workflows/pages.yml`.

**Versiones.** Al publicar una versión nueva, incrementa el valor de `CACHE` en `sw.js` para que
los dispositivos descarten la caché anterior.
