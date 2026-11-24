CREATE TABLE IF NOT EXISTS usuarios (
    id SERIAL PRIMARY KEY,
    nombre VARCHAR(120) NOT NULL,
    correo VARCHAR(160) UNIQUE NOT NULL,
    contrasena TEXT NOT NULL,
    fecha_registro TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS perros (
    id SERIAL PRIMARY KEY,
    usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
    nombre VARCHAR(100) NOT NULL,
    raza VARCHAR(100),
    edad INTEGER,
    peso NUMERIC(6,2),
    fecha_registro TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS dispositivos (
    id SERIAL PRIMARY KEY,
    codigo VARCHAR(80) UNIQUE NOT NULL,
    perro_id INTEGER REFERENCES perros(id) ON DELETE SET NULL,
    bateria INTEGER DEFAULT 100,
    conexion_definitiva BOOLEAN DEFAULT FALSE,
    ultima_conexion TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS mediciones (
    id SERIAL PRIMARY KEY,
    dispositivo_id INTEGER NOT NULL REFERENCES dispositivos(id) ON DELETE CASCADE,
    temperatura NUMERIC(5,2),
    pulso INTEGER,
    actividad VARCHAR(80),
    fecha_hora TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS ubicaciones (
    id SERIAL PRIMARY KEY,
    dispositivo_id INTEGER NOT NULL REFERENCES dispositivos(id) ON DELETE CASCADE,
    latitud NUMERIC(10,6) NOT NULL,
    longitud NUMERIC(10,6) NOT NULL,
    fecha_hora TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS alertas (
    id SERIAL PRIMARY KEY,
    perro_id INTEGER NOT NULL REFERENCES perros(id) ON DELETE CASCADE,
    tipo VARCHAR(80) NOT NULL,
    descripcion TEXT NOT NULL,
    fecha_hora TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    atendida BOOLEAN DEFAULT FALSE
);

INSERT INTO dispositivos (codigo, bateria, conexion_definitiva)
VALUES ('PT-001', 95, TRUE)
ON CONFLICT (codigo) DO NOTHING;