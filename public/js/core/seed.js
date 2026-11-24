import { db } from './store.js';
import { servicioDe, categoriaVentaProducto, COMPROBANTES } from './domain.js';
import { addDays, todayISO, round2 } from './utils.js';

export async function ensureSeed() {
  if (db.isSeeded()) return;
  await seed();
  db.markSeeded();
}

export async function resetDemo() {
  await db.clearAll();
  await seed();
  db.markSeeded();
}

async function seed() {
  const T = todayISO();
  const d = (n) => addDays(T, -n);
  const ins = (col, rec) => db.insert(col, rec);

  const staff = [];
  for (const s of [
    { nombre: 'Dra. Valeria Ríos', rol: 'Médico veterinario', comision: 30 },
    { nombre: 'Dr. Hugo Salazar', rol: 'Médico veterinario', comision: 25 },
    { nombre: 'Elena Quispe', rol: 'Groomer', comision: 40 },
  ]) staff.push(await ins('staff', s));

  const suppliers = [];
  for (const s of [
    { nombre: 'Distribuidora VetPerú SAC', ruc: '20481520937', contacto: 'Marco Linares', celular: '944120311', correo: 'ventas@vetperu.example', direccion: 'Av. España 1240, Trujillo' },
    { nombre: 'Nutrimascotas del Norte EIRL', ruc: '20602387415', contacto: 'Silvia Paredes', celular: '955870142', correo: 'pedidos@nutrimascotas.example', direccion: 'Jr. Pizarro 455, Trujillo' },
    { nombre: 'Laboratorios Andinos Vet SAC', ruc: '20556781092', contacto: 'Ing. Jaime Rojas', celular: '967441208', correo: 'comercial@andinosvet.example', direccion: 'Calle Los Cedros 118, Lima' },
    { nombre: 'Importadora PetLine SRL', ruc: '20519934860', contacto: 'Camila Vega', celular: '938215570', correo: 'ventas@petline.example', direccion: 'Av. Larco 1890, Trujillo' },
  ]) suppliers.push(await ins('suppliers', s));

  const productDefs = [
    ['Alimento Premium Adulto 15 kg', 'Alimento', 1, 165, 215, 14, 5, 'bolsa'],
    ['Alimento Cachorro 7.5 kg', 'Alimento', 1, 98, 135, 3, 5, 'bolsa'],
    ['Alimento Medicado Renal 2 kg', 'Alimento', 1, 62, 89, 8, 3, 'bolsa'],
    ['Antipulgas pipeta 10–20 kg', 'Medicamentos', 0, 24, 42, 20, 8, 'unidad'],
    ['Antipulgas pipeta gatos', 'Medicamentos', 0, 19, 35, 12, 6, 'unidad'],
    ['Vacuna quíntuple', 'Insumos', 2, 22, 0, 40, 15, 'dosis'],
    ['Vacuna antirrábica', 'Insumos', 2, 15, 0, 6, 15, 'dosis'],
    ['Amoxicilina 500 mg (caja)', 'Medicamentos', 2, 32, 55, 9, 4, 'caja'],
    ['Shampoo hipoalergénico 500 ml', 'Higiene', 3, 18, 36, 15, 5, 'frasco'],
    ['Collar isabelino talla M', 'Accesorios', 3, 9, 22, 10, 4, 'unidad'],
    ['Snack dental x 10', 'Alimento', 1, 11, 24, 25, 10, 'paquete'],
    ['Arena sanitaria 10 kg', 'Higiene', 3, 21, 38, 7, 6, 'bolsa'],
    ['Suero fisiológico 500 ml', 'Insumos', 0, 4.5, 0, 30, 10, 'unidad'],
  ];
  const products = [];
  for (const [nombre, categoria, sp, pc, pv, stock, min, unidad] of productDefs) {
    products.push(await ins('products', { nombre, categoria, proveedorId: suppliers[sp].id, precioCompra: pc, precioVenta: pv, stock, stockMinimo: min, unidad }));
  }

  const purchaseDefs = [
    [1, 40, 'F001-2231', [[0, 20, 165], [1, 12, 98], [10, 30, 11]], 'Pagada', null],
    [2, 28, 'F002-884', [[5, 50, 22], [6, 20, 15]], 'Pagada', null],
    [0, 15, 'F003-1042', [[3, 30, 24], [4, 20, 19], [12, 40, 4.5]], 'Pendiente', addDays(T, 4)],
    [3, 9, 'B005-5521', [[8, 20, 18], [9, 10, 9], [11, 12, 21]], 'Pagada', null],
    [1, 5, 'F001-2310', [[2, 10, 62]], 'Pendiente', addDays(T, 12)],
  ];
  for (const [sp, ago, comp, lines, estado, vence] of purchaseDefs) {
    const items = lines.map(([pi, cantidad, precioUnit]) => ({
      productoId: products[pi].id,
      desc: products[pi].nombre,
      cantidad,
      precioUnit,
      subtotal: round2(cantidad * precioUnit),
    }));
    await ins('purchases', {
      proveedorId: suppliers[sp].id,
      fecha: d(ago),
      comprobante: comp,
      items,
      total: round2(items.reduce((a, i) => a + i.subtotal, 0)),
      estado,
      vence,
      fechaPago: estado === 'Pagada' ? d(ago) : null,
    });
  }

  const ownerDefs = [
    ['Rosa Cabrera Linares', '987123456', 'rosa.cabrera@correo.example', 'Urb. Los Jardines Mz B Lt 4, Trujillo'],
    ['Carlos Mendoza Paredes', '944552310', 'cmendoza@correo.example', 'Av. Mansiche 760, Trujillo'],
    ['Lucía Alva Rojas', '976318420', 'lucia.alva@correo.example', 'Calle Bolívar 322, Trujillo'],
    ['Jorge Vásquez Díaz', '951207743', 'jvasquez@correo.example', 'Urb. San Andrés V etapa, Trujillo', true],
    ['Marisol Chávez Torres', '962885031', 'marisol.chavez@correo.example', 'Av. Fátima 1450, Trujillo'],
    ['Andrés Valverde Sánchez', '933410872', 'avalverde@correo.example', 'Jr. Ayacucho 615, Trujillo'],
    ['Patricia Gil Quiroz', '928774105', 'pgil@correo.example', 'Urb. Santa María, Trujillo'],
    ['Miguel Zavaleta León', '947663290', 'mzavaleta@correo.example', 'Av. Perú 2210, Trujillo'],
    ['Karina Ruiz Benites', '991245068', 'karina.ruiz@correo.example', 'Calle Los Naranjos 87, Trujillo'],
    ['Fernando Llamoca Cruz', '955300127', 'fllamoca@correo.example', 'Av. Juan Pablo II 940, Trujillo'],
    ['Diana Paredes Salas', '968012774', 'dparedes@correo.example', 'Urb. La Merced, Trujillo'],
    ['Rubén Castillo Vega', '936588419', 'rcastillo@correo.example', 'Jr. Orbegoso 410, Trujillo'],
  ];
  const owners = [];
  for (const [nombre, celular, correo, direccion, conflictivo] of ownerDefs) {
    owners.push(await ins('owners', { nombre, celular, correo, direccion, conflictivo: !!conflictivo, observaciones: conflictivo ? 'Reclama por los tiempos de espera. Atender con paciencia y explicar cada costo antes de cobrar.' : '' }));
  }

  const A = (enfermedades = '', tratamientos = '', vacunaciones = '', accidentes = '') => ({ enfermedades, tratamientos, vacunaciones, accidentes });
  const petDefs = [
    [0, 'Max', 'Perro', 'Labrador Retriever', 'Macho', 5, 0, 5, A('Otitis recurrente en el oído derecho.', 'Gotas óticas por 10 días (2025).', 'Esquema completo. Refuerzo anual.', ''), 'Muy dócil. Le cuesta quedarse quieto en la balanza.', false],
    [1, 'Luna', 'Gato', 'Mestizo', 'Hembra', 3, 0, 4, A('', 'Esterilizada a los 8 meses.', 'Triple felina al día.', ''), 'Se estresa en la sala de espera. Atender en consultorio tranquilo.', false],
    [1, 'Toby', 'Perro', 'Beagle', 'Macho', 2, 0, 4, A('', '', 'Esquema de cachorro completo.', 'Fractura de pata trasera a los 6 meses, resuelta.'), '', false],
    [2, 'Mía', 'Perro', 'Poodle', 'Hembra', 9, 0, 5, A('Sarro dental avanzado. Soplo cardíaco leve.', 'Limpieza dental en 2025.', 'Antirrábica al día.', ''), 'Usa dieta baja en grasa.', false],
    [3, 'Rocky', 'Perro', 'Bulldog Francés', 'Macho', 4, 0, 3, A('Alergia cutánea estacional.', 'Antihistamínicos y baños medicados.', 'Quíntuple y antirrábica al día.', ''), 'Muerde al sentirse acorralado. Usar bozal para procedimientos.', true],
    [4, 'Canela', 'Perro', 'Cocker Spaniel', 'Hembra', 7, 0, 5, A('Piometra resuelta con cirugía.', 'Antibióticos y analgesia postoperatoria.', 'Al día.', ''), 'Recuperación en casa. Control de herida cada 3 días.', false],
    [5, 'Simba', 'Gato', 'Siamés', 'Macho', 1, 2, 4, A('', '', 'Primer refuerzo aplicado.', ''), 'Juguetón. Se le aplica pipeta cada tres meses.', false],
    [6, 'Kira', 'Perro', 'Pastor Alemán', 'Hembra', 6, 0, 5, A('Displasia de cadera grado I.', 'Condroprotector de por vida.', 'Al día.', ''), '', false],
    [7, 'Bruno', 'Perro', 'Schnauzer', 'Macho', 10, 0, null, A('Sarro dental. Cataratas incipientes.', '', 'Último refuerzo hace más de un año.', ''), 'El propietario prefiere recordatorios por WhatsApp.', false],
    [8, 'Nala', 'Perro', 'Golden Retriever', 'Hembra', 0, 8, 5, A('', '', 'Esquema de cachorro en curso.', ''), 'Cachorra muy activa.', false],
    [9, 'Coco', 'Perro', 'Shih Tzu', 'Macho', 3, 0, 5, A('Alergia a ciertos champús.', 'Usa shampoo hipoalergénico.', 'Al día.', ''), 'Cliente frecuente de baños.', false],
    [9, 'Lola', 'Perro', 'Chihuahua', 'Hembra', 12, 0, null, A('Insuficiencia renal leve.', 'Dieta renal.', 'Vacunas vencidas.', ''), '', false],
    [10, 'Thor', 'Perro', 'Husky Siberiano', 'Macho', 4, 0, 4, A('', '', 'Al día.', ''), 'Muda mucho pelo. Pide corte sanitario.', false],
    [11, 'Pelusa', 'Gato', 'Persa', 'Hembra', 11, 0, 4, A('Enfermedad renal crónica estadio II.', 'Fluidoterapia subcutánea semanal.', 'Triple felina vencida.', ''), 'Alimento medicado indicado.', false],
  ];
  const pets = [];
  for (const [oi, nombre, especie, raza, sexo, edadAnios, edadMeses, calificacion, antecedentes, observaciones, agresiva] of petDefs) {
    pets.push(await ins('pets', { ownerId: owners[oi].id, nombre, especie, raza, sexo, edadAnios, edadMeses, calificacion, antecedentes, observaciones, agresiva: !!agresiva, foto: '' }));
  }
  const P = Object.fromEntries(pets.map((p) => [p.nombre, p]));

  const svcDefs = [
    ['Max', 362, 'Vacunación', 'Refuerzo anual quíntuple y antirrábica.', 0],
    ['Max', 30, 'Desparasitación', 'Antiparasitario interno.', 1],
    ['Max', 120, 'Consulta general', 'Revisión de oído derecho.', 0],
    ['Max', 45, 'Baño y corte', 'Baño medicado.', 2],
    ['Max', 0, 'Baño y corte', 'Baño y deslanado.', 2, { pend: true }],
    ['Luna', 200, 'Vacunación', 'Triple felina.', 1],
    ['Luna', 100, 'Desparasitación', 'Antiparasitario interno.', 1],
    ['Luna', 2, 'Consulta general', 'Pérdida de apetito por dos días.', 0, { pend: true }],
    ['Toby', 0, 'Vacunación', 'Refuerzo anual.', 1, { pend: true }],
    ['Toby', 87, 'Desparasitación', 'Antiparasitario interno.', 1],
    ['Toby', 1, 'Consulta general', 'Revisión por cojera leve.', 1],
    ['Mía', 33, 'Baño y corte', 'Corte estilo cachorro.', 2],
    ['Mía', 420, 'Profilaxis dental', 'Limpieza dental con anestesia.', 0],
    ['Mía', 20, 'Control', 'Control de soplo cardíaco.', 0],
    ['Mía', 300, 'Consulta general', 'Chequeo geriátrico.', 1],
    ['Rocky', 60, 'Consulta general', 'Lesiones por rascado.', 0],
    ['Rocky', 350, 'Vacunación', 'Refuerzo anual.', 0],
    ['Rocky', 65, 'Baño y corte', 'Baño medicado.', 2],
    ['Rocky', 40, 'Hospitalización', 'Hospitalización por infección cutánea.', 1, { credito: { pagado: 80, vence: d(10) } }],
    ['Canela', 3, 'Cirugía', 'Ovariohisterectomía por piometra.', 0, { grupo: 'canela', credito: { pagado: 200, vence: addDays(T, 12) } }],
    ['Canela', 3, 'Hospitalización', 'Hospitalización postoperatoria.', 0, { grupo: 'canela' }],
    ['Canela', 1, 'Control', 'Control de herida quirúrgica.', 0],
    ['Canela', 90, 'Ecografía', 'Ecografía abdominal.', 0],
    ['Canela', 90, 'Análisis de laboratorio', 'Hemograma y perfil renal.', 0],
    ['Canela', 150, 'Vacunación', 'Refuerzo anual.', 1],
    ['Canela', 150, 'Consulta general', 'Chequeo anual.', 1],
    ['Canela', 200, 'Profilaxis dental', 'Limpieza dental.', 0],
    ['Canela', 40, 'Desparasitación', 'Antiparasitario interno.', 1],
    ['Canela', 30, 'Baño y corte', 'Baño y corte de orejas.', 2],
    ['Canela', 60, 'Baño y corte', 'Baño y corte de orejas.', 2],
    ['Simba', 40, 'Vacunación', 'Primer refuerzo.', 1],
    ['Simba', 5, 'Desparasitación', 'Antiparasitario interno.', 1],
    ['Simba', 200, 'Consulta general', 'Primera consulta.', 1],
    ['Kira', 180, 'Vacunación', 'Refuerzo anual.', 0],
    ['Kira', 15, 'Baño y corte', 'Baño y cepillado.', 2],
    ['Kira', 400, 'Análisis de laboratorio', 'Perfil articular.', 0],
    ['Kira', 405, 'Ecografía', 'Ecografía de cadera.', 0],
    ['Bruno', 240, 'Consulta general', 'Chequeo por cataratas.', 1],
    ['Bruno', 250, 'Análisis de laboratorio', 'Hemograma completo.', 1],
    ['Bruno', 400, 'Profilaxis dental', 'Limpieza dental.', 0],
    ['Nala', 20, 'Vacunación', 'Segunda dosis de cachorro.', 1],
    ['Nala', 20, 'Desparasitación', 'Antiparasitario interno.', 1],
    ['Nala', 21, 'Consulta general', 'Primer chequeo.', 1],
    ['Coco', 10, 'Baño y corte', 'Baño con shampoo hipoalergénico.', 2],
    ['Coco', 40, 'Baño y corte', 'Baño con shampoo hipoalergénico.', 2],
    ['Coco', 70, 'Baño y corte', 'Baño y corte de patas.', 2],
    ['Coco', 100, 'Baño y corte', 'Baño con shampoo hipoalergénico.', 2],
    ['Coco', 130, 'Baño y corte', 'Baño y corte.', 2],
    ['Coco', 160, 'Baño y corte', 'Baño y corte.', 2],
    ['Coco', 150, 'Vacunación', 'Refuerzo anual.', 0],
    ['Lola', 500, 'Consulta general', 'Control renal.', 0],
    ['Lola', 500, 'Vacunación', 'Refuerzo anual.', 0],
    ['Thor', 100, 'Consulta general', 'Chequeo anual.', 1],
    ['Thor', 85, 'Desparasitación', 'Antiparasitario interno.', 1],
    ['Thor', 45, 'Baño y corte', 'Baño y deslanado.', 2],
    ['Pelusa', 10, 'Consulta general', 'Control de enfermedad renal.', 1],
    ['Pelusa', 10, 'Análisis de laboratorio', 'Perfil renal.', 1],
    ['Pelusa', 10, 'Control', 'Fluidoterapia.', 1],
  ];

  const diarios = ['Consulta general', 'Análisis de laboratorio', 'Ecografía', 'Consulta general', 'Ecografía'];
  const nombres = ['Max', 'Luna', 'Toby', 'Mía', 'Canela', 'Simba', 'Kira', 'Nala', 'Coco', 'Thor', 'Pelusa'];
  for (let dia = 3; dia <= 40; dia++) {
    for (let k = 0; k < 3; k++) {
      const pet = nombres[(dia * 3 + k * 4 + 1) % nombres.length];
      const tipo = diarios[(dia + k) % diarios.length];
      svcDefs.push([pet, dia, tipo, 'Atención programada.', (dia + k) % 2, { seg: true }]);
    }
  }

  const services = [];
  for (const [pet, ago, tipo, detalle, st, o = {}] of svcDefs) {
    const cat = servicioDe(tipo);
    const fecha = d(ago);
    const rec = await ins('services', {
      petId: P[pet].id,
      fecha,
      tipo,
      detalle,
      monto: cat.precio,
      staffId: staff[st].id,
      proximaFecha: cat.intervalo ? addDays(fecha, cat.intervalo) : null,
      cobrado: !o.pend,
      saleId: null,
      avisoEnviado: null,
      seguimientoEnviado: o.seg || ago > 14 || pet === 'Pelusa' ? fecha : null,
    });
    services.push({ rec, o, pet });
  }

  const staffById = new Map(staff.map((s) => [s.id, s]));
  const metodos = ['Efectivo', 'Yape/Plin', 'Tarjeta POS', 'Transferencia', 'Efectivo', 'Yape/Plin'];
  const groups = new Map();
  for (const x of services.filter((s) => !s.o.pend)) {
    const k = x.o.grupo || x.rec.petId + x.rec.fecha;
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(x);
  }

  const created = [];
  let n = 0;
  for (const list of [...groups.values()].sort((a, b) => a[0].rec.fecha.localeCompare(b[0].rec.fecha))) {
    const first = list[0];
    const pet = pets.find((p) => p.id === first.rec.petId);
    const items = list.map(({ rec }) => {
      const comision = staffById.get(rec.staffId).comision;
      return {
        tipo: 'servicio',
        refId: rec.id,
        desc: `${rec.tipo} — ${pet.nombre}`,
        cantidad: 1,
        precioUnit: rec.monto,
        subtotal: rec.monto,
        categoria: servicioDe(rec.tipo).categoria,
        costo: round2((rec.monto * comision) / 100),
      };
    });
    const total = round2(items.reduce((a, i) => a + i.subtotal, 0));
    const credito = list.find((x) => x.o.credito)?.o.credito;
    const pagado = credito ? credito.pagado : total;
    const metodo = metodos[n % metodos.length];
    const tipoComp = n % 5 === 0 ? 'Boleta' : 'Ticket interno';
    const count = created.filter((c) => c === tipoComp).length + 1;
    created.push(tipoComp);
    const cfg = COMPROBANTES[tipoComp];
    const sale = await ins('sales', {
      fecha: first.rec.fecha,
      ownerId: pet.ownerId,
      petId: pet.id,
      items,
      total,
      pagos: [{ fecha: first.rec.fecha, metodo, monto: pagado, cajaId: null }],
      comprobanteTipo: tipoComp,
      comprobante: `${cfg.prefijo}-${String(count).padStart(cfg.ancho, '0')}`,
      fechaVence: credito ? credito.vence : null,
    });
    for (const { rec } of list) await db.update('services', rec.id, { saleId: sale.id });
    n++;
  }

  const productSales = [
    [34, 0, [[8, 1]], 'Efectivo'],
    [27, 2, [[0, 1], [10, 2]], 'Yape/Plin'],
    [21, 4, [[3, 2]], 'Tarjeta POS'],
    [14, 1, [[11, 1], [10, 1]], 'Efectivo'],
    [8, 10, [[8, 1], [9, 1]], 'Yape/Plin'],
    [4, 8, [[1, 1]], 'Tarjeta POS'],
  ];
  for (const [ago, oi, lines, metodo] of productSales) {
    const items = lines.map(([pi, q]) => ({
      tipo: 'producto',
      refId: products[pi].id,
      desc: products[pi].nombre,
      cantidad: q,
      precioUnit: products[pi].precioVenta,
      subtotal: round2(products[pi].precioVenta * q),
      categoria: categoriaVentaProducto(products[pi].categoria),
      costo: round2(products[pi].precioCompra * q),
    }));
    const total = round2(items.reduce((a, i) => a + i.subtotal, 0));
    const count = created.filter((c) => c === 'Ticket interno').length + 1;
    created.push('Ticket interno');
    await ins('sales', {
      fecha: d(ago),
      ownerId: owners[oi].id,
      petId: null,
      items,
      total,
      pagos: [{ fecha: d(ago), metodo, monto: total, cajaId: null }],
      comprobanteTipo: 'Ticket interno',
      comprobante: `T001-${String(count).padStart(6, '0')}`,
      fechaVence: null,
    });
  }

  const caja = await ins('cajas', {
    fechaApertura: d(1),
    montoInicial: 150,
    responsable: 'Recepción',
    estado: 'Cerrada',
    fechaCierre: d(1),
    esperadoEfectivo: 412,
    conteoEfectivo: 410,
    esperadoDigital: 530,
    conteoDigital: 530,
    observaciones: 'Cierre sin novedades.',
  });
  await ins('cajaMovs', { cajaId: caja.id, tipo: 'Salida', monto: 12, motivo: 'Compra de agua para consultorio', responsable: 'Recepción', fecha: d(1) });
  await ins('cajaMovs', { cajaId: caja.id, tipo: 'Salida', monto: 8, motivo: 'Movilidad para entrega de muestras', responsable: 'Recepción', fecha: d(1) });

  const exp = [];
  for (let m = 0; m < 3; m++) {
    exp.push(['Alquiler', 'Fijo', 'Alquiler del local', 1500, 'Pagado', d(5 + 30 * m)]);
    exp.push(['Servicios básicos', 'Variable', 'Luz y agua', 380 - m * 20, 'Pagado', d(12 + 30 * m)]);
    exp.push(['Planilla', 'Fijo', 'Sueldos del personal', 1800, 'Pagado', d(2 + 30 * m)]);
    exp.push(['Insumos veterinarios', 'Variable', 'Gasas, jeringas y guantes', 650 - m * 40, 'Pagado', d(18 + 30 * m)]);
  }
  exp.push(['Servicios básicos', 'Fijo', 'Internet y telefonía', 160, 'Pendiente', d(3), addDays(T, 5)]);
  exp.push(['Otros', 'Variable', 'Mantenimiento de autoclave', 300, 'Pendiente', d(9), addDays(T, -2)]);
  for (const [categoria, tipo, descripcion, monto, estado, fecha, vence] of exp) {
    await ins('expenses', { categoria, tipo, descripcion, monto, estado, fecha, vence: vence || null, fechaPago: estado === 'Pagado' ? fecha : null });
  }

  await ins('interacciones', { petId: P.Max.id, ownerId: owners[0].id, fecha: new Date(Date.now() - 3 * 86400000).toISOString(), canal: 'WhatsApp', nota: 'Se le recordó el refuerzo anual. Respondió que lo agendará la próxima semana.' });
  await ins('interacciones', { petId: P.Bruno.id, ownerId: owners[7].id, fecha: new Date(Date.now() - 12 * 86400000).toISOString(), canal: 'Llamada', nota: 'No contestó. Se dejó mensaje de voz sobre la limpieza dental pendiente.' });
  await ins('interacciones', { petId: P.Rocky.id, ownerId: owners[3].id, fecha: new Date(Date.now() - 6 * 86400000).toISOString(), canal: 'Llamada', nota: 'Consulta por el saldo pendiente de la hospitalización. Pidió plazo hasta fin de mes.' });
  await ins('interacciones', { petId: P.Coco.id, ownerId: owners[9].id, fecha: new Date(Date.now() - 20 * 86400000).toISOString(), canal: 'Nota', nota: 'Pidió que el groomer use siempre el shampoo hipoalergénico.' });

  const opp = [
    ['Cirugía dental', P.Bruno, 600, 'Cotizado', 6],
    ['Paquete de 4 baños', P.Mía, 240, 'En seguimiento', 9],
    ['Profilaxis dental', P.Kira, 220, 'Agendado', 3],
    ['Esterilización', P.Simba, 380, 'Perdido', 25],
    ['Chequeo geriátrico completo', P.Lola, 350, 'Cotizado', 2],
  ];
  for (const [titulo, pet, monto, estado, ago] of opp) {
    await ins('oportunidades', { titulo, petId: pet.id, ownerId: pet.ownerId, monto, estado, fecha: d(ago) });
  }

  const encuestaSvc = services.find((s) => s.rec.petId === P.Max.id && s.rec.tipo === 'Consulta general').rec;
  const encuestaLuna = services.find((s) => s.rec.petId === P.Pelusa.id && s.rec.tipo === 'Consulta general').rec;
  await ins('encuestas', { serviceId: encuestaSvc.id, petId: P.Max.id, ownerId: owners[0].id, fecha: d(118), calificacion: 5, comentario: 'Muy buena atención y explicaron todo con calma.', resultado: 'Invitado a reseña de Google' });
  const enc2 = await ins('encuestas', { serviceId: encuestaLuna.id, petId: P.Pelusa.id, ownerId: owners[11].id, fecha: d(9), calificacion: 2, comentario: 'Esperamos más de una hora para ser atendidos.', resultado: 'Derivado a Reclamos' });
  await ins('reclamos', { encuestaId: enc2.id, petId: P.Pelusa.id, ownerId: owners[11].id, fecha: d(9), calificacion: 2, comentario: 'Esperamos más de una hora para ser atendidos.', estado: 'En proceso' });
}
