# HuellitasVet · CRM web para clínica veterinaria

Aplicación web para un trabajo de UX/UI. Módulos: Registro, Clientes (ficha médica), Proveedores, Inventario, CRM y Finanzas. Usa componentes de Ionic (`@ionic/core`), colores sólidos y dos tipografías de Google Fonts guardadas en `public/fonts`: Oswald para todo el texto y Playwrite België Vlaanderen para el nombre de la marca y los títulos de página.

## Probar en localhost

Requisitos: Node.js 18 o superior.

```bash
npm install
npm start
```

Abre http://localhost:3000. La primera vez carga datos de ejemplo. Los datos se guardan en el navegador (localStorage). Para volver al estado inicial usa "Restablecer datos de ejemplo" al pie del menú (ese botón solo aparece en localhost, nunca en la versión publicada).

Y podran ver todo en local realizar sus pruebas:D , por si gustan ver y verificar mejor el sistema

## Estructura

```
server.js               servidor estático sin dependencias (usa PORT en la nube)
public/
  index.html            estructura base con ion-split-pane y menú
  css/                  tokens, base, componentes y estilos por módulo
  js/
    main.js             router por hash y arranque
    core/               store (capa de datos), utils, dominio, ui, seed
    modules/            registro, clientes, proveedores, inventario
      crm/              hoy, segmentos, oportunidades, bitácora, encuestas, reclamos
      finanzas/         pos, caja, cobrar, egresos, reportes, comisiones
supabase/schema.sql     tablas para llevar los datos a Supabase
supabase/acceso-abierto.sql   da acceso a las tablas (proyecto académico, datos ficticios)
```

## Llevarla a la nube

La app tiene dos modos y elige sola: **local** (los datos se guardan en el navegador) o **nube** (en Supabase). Se activa llenando `public/js/core/config.js`.

1. **Supabase**: crea un proyecto y, en el *SQL Editor*, ejecuta primero `supabase/schema.sql` y después `supabase/acceso-abierto.sql`.
2. **Conexión**: en Supabase entra a *Project Settings* y copia la **Project URL** y la **Publishable key**. Pégalas en `public/js/core/config.js` (la *Secret key* y la contraseña de la base de datos **nunca** van ahí). Abre la app: la primera vez carga los datos de ejemplo en la nube. En "Respaldo de datos" puedes comprobar dónde se están guardando.
3. **GitHub**: crea un repositorio y sube la carpeta (`node_modules` ya está en `.gitignore`).
4. **Render**: crea un Web Service desde el repositorio con `npm install` como build command y `npm start` como start command.

Todas las pantallas leen y escriben solo a través de `db.list`, `db.get`, `db.insert`, `db.update` y `db.remove`, así que cambiar de local a nube no toca las pantallas: el adaptador está en `public/js/core/supabase.js`.

El acceso a la base queda abierto a propósito, porque es un proyecto académico con datos ficticios. Para un uso real hay que activar el login de Supabase y cambiar la política de `acceso-abierto.sql` a `authenticated`.

## Registro de clientes por QR

Solo funciona en modo nube (el celular del cliente necesita una base común donde guardar). En el menú, bajo el panel azul, aparece una tarjeta con el QR y el botón **Agrandar y compartir**, que abre el código grande y permite descargarlo (PNG), compartirlo o copiar el enlace. Si la pantalla es baja o es un celular, el mismo acceso aparece como botón **QR de registro de clientes** dentro del menú.

El QR apunta a `/registro-cliente.html` de la misma dirección desde la que abriste el CRM: para que un celular pueda abrirlo, entra al CRM desde la URL de Render (en `localhost` solo funciona en tu computadora). El cliente llena sus datos y los de su mascota, y aparecen solos en **Clientes** con la etiqueta *Nuevo por QR* (durante 7 días) y una nota en la bitácora del CRM con el canal *Registro QR*. Si el celular ya existe en la clínica, la mascota se suma a ese propietario sin cambiarle sus datos:D

## Reglas de negocio incluidas

- Un propietario se identifica por su celular y una mascota por propietario y nombre: no se crean duplicados
- Los buscadores toleran errores de tipeo y nombres parecidos
- Los recordatorios salen del historial: cada servicio tiene una próxima fecha según su tipo
- Los comprobantes son internos de la clínica; no se conectan con SUNAT

Todo esta bien revisado:D