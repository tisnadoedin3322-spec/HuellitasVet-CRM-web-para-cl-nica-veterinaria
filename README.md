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
```

## Llevarla a la nube

1. **GitHub**: crea un repositorio y sube la carpeta (`node_modules` ya está en `.gitignore`).
2. **Supabase**: crea un proyecto y ejecuta `supabase/schema.sql` en el editor SQL. Luego se reemplaza `public/js/core/store.js` por un adaptador que use `@supabase/supabase-js`. Todas las pantallas leen y escriben solo a través de `db.list`, `db.get`, `db.insert`, `db.update` y `db.remove`, así que el cambio se concentra en ese archivo.
3. **Render**: crea un Web Service desde el repositorio con `npm install` como build command y `npm start` como start command.

## Reglas de negocio incluidas

- Un propietario se identifica por su celular y una mascota por propietario y nombre: no se crean duplicados
- Los buscadores toleran errores de tipeo y nombres parecidos
- Los recordatorios salen del historial: cada servicio tiene una próxima fecha según su tipo
- Los comprobantes son internos de la clínica; no se conectan con SUNAT

Todo esta bien revisado:D