create extension if not exists "pgcrypto";

create table owners (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  celular text not null unique,
  correo text,
  direccion text,
  observaciones text,
  conflictivo boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz
);

create table pets (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references owners(id) on delete cascade,
  nombre text not null,
  especie text not null,
  raza text not null,
  sexo text not null check (sexo in ('Macho', 'Hembra')),
  edad_anios int not null default 0,
  edad_meses int not null default 0,
  foto text,
  antecedentes jsonb not null default '{}'::jsonb,
  observaciones text,
  agresiva boolean not null default false,
  calificacion int check (calificacion between 1 and 5),
  created_at timestamptz not null default now(),
  updated_at timestamptz,
  unique (owner_id, nombre)
);

create table staff (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  rol text not null,
  comision numeric(5,2) not null default 0,
  created_at timestamptz not null default now()
);

create table services (
  id uuid primary key default gen_random_uuid(),
  pet_id uuid not null references pets(id) on delete cascade,
  staff_id uuid references staff(id),
  fecha date not null,
  tipo text not null,
  detalle text,
  monto numeric(10,2) not null,
  proxima_fecha date,
  cobrado boolean not null default false,
  sale_id uuid,
  aviso_enviado date,
  seguimiento_enviado date,
  created_at timestamptz not null default now()
);
create index on services (pet_id, fecha desc);

create table suppliers (
  id uuid primary key default gen_random_uuid(),
  nombre text not null unique,
  ruc text unique,
  contacto text,
  celular text,
  correo text,
  direccion text,
  created_at timestamptz not null default now()
);

create table products (
  id uuid primary key default gen_random_uuid(),
  proveedor_id uuid not null references suppliers(id),
  nombre text not null,
  categoria text not null,
  unidad text not null default 'unidad',
  precio_compra numeric(10,2) not null default 0,
  precio_venta numeric(10,2) not null default 0,
  stock int not null default 0,
  stock_minimo int not null default 5,
  created_at timestamptz not null default now(),
  updated_at timestamptz,
  unique (proveedor_id, nombre)
);

create table purchases (
  id uuid primary key default gen_random_uuid(),
  proveedor_id uuid not null references suppliers(id),
  fecha date not null,
  comprobante text,
  items jsonb not null,
  total numeric(10,2) not null,
  estado text not null check (estado in ('Pagada', 'Pendiente')),
  vence date,
  fecha_pago date,
  created_at timestamptz not null default now(),
  updated_at timestamptz
);

create table sales (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid references owners(id),
  pet_id uuid references pets(id),
  fecha date not null,
  hora text,
  items jsonb not null,
  total numeric(10,2) not null,
  pagos jsonb not null default '[]'::jsonb,
  comprobante_tipo text not null,
  comprobante text not null,
  cliente jsonb,
  fecha_vence date,
  created_at timestamptz not null default now(),
  updated_at timestamptz
);

alter table services add constraint services_sale_fk foreign key (sale_id) references sales(id) on delete set null;

create table cajas (
  id uuid primary key default gen_random_uuid(),
  fecha_apertura date not null,
  hora text,
  monto_inicial numeric(10,2) not null default 0,
  responsable text not null,
  estado text not null check (estado in ('Abierta', 'Cerrada')),
  fecha_cierre date,
  esperado_efectivo numeric(10,2),
  conteo_efectivo numeric(10,2),
  esperado_digital numeric(10,2),
  conteo_digital numeric(10,2),
  observaciones text,
  created_at timestamptz not null default now(),
  updated_at timestamptz
);

create table caja_movs (
  id uuid primary key default gen_random_uuid(),
  caja_id uuid not null references cajas(id) on delete cascade,
  tipo text not null check (tipo in ('Ingreso', 'Salida')),
  monto numeric(10,2) not null,
  motivo text not null,
  responsable text not null,
  fecha date not null,
  created_at timestamptz not null default now()
);

create table expenses (
  id uuid primary key default gen_random_uuid(),
  descripcion text not null,
  categoria text not null,
  tipo text not null check (tipo in ('Fijo', 'Variable')),
  monto numeric(10,2) not null,
  fecha date not null,
  estado text not null check (estado in ('Pagado', 'Pendiente')),
  vence date,
  fecha_pago date,
  created_at timestamptz not null default now(),
  updated_at timestamptz
);

create table interacciones (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references owners(id) on delete cascade,
  pet_id uuid references pets(id) on delete set null,
  canal text not null,
  nota text not null,
  fecha timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create table oportunidades (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references owners(id) on delete cascade,
  pet_id uuid references pets(id) on delete set null,
  titulo text not null,
  monto numeric(10,2) not null default 0,
  estado text not null check (estado in ('Cotizado', 'En seguimiento', 'Agendado', 'Perdido')),
  fecha date not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz
);

create table encuestas (
  id uuid primary key default gen_random_uuid(),
  service_id uuid references services(id) on delete set null,
  owner_id uuid not null references owners(id) on delete cascade,
  pet_id uuid references pets(id) on delete set null,
  fecha date not null,
  calificacion int not null check (calificacion between 1 and 5),
  comentario text,
  resultado text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz
);

create table reclamos (
  id uuid primary key default gen_random_uuid(),
  encuesta_id uuid references encuestas(id) on delete set null,
  owner_id uuid not null references owners(id) on delete cascade,
  pet_id uuid references pets(id) on delete set null,
  fecha date not null,
  calificacion int,
  comentario text,
  estado text not null check (estado in ('Abierto', 'En proceso', 'Resuelto')),
  created_at timestamptz not null default now(),
  updated_at timestamptz
);

create table settings (
  id text primary key,
  clinica text,
  google_review_url text,
  updated_at timestamptz
);

-- Activa RLS cuando conectes la app a Supabase y define políticas según tus usuarios.
-- alter table owners enable row level security;
