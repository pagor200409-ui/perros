require('dotenv').config();
const express = require('express');
const fs = require('fs');
const path = require('path');
const { Pool } = require('@neondatabase/serverless');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Servir archivos estáticos desde la raíz y carpetas del proyecto
app.use(express.static(__dirname));
if (fs.existsSync(path.join(__dirname, 'CSS'))) {
    app.use('/CSS', express.static(path.join(__dirname, 'CSS')));
}
if (fs.existsSync(path.join(__dirname, 'JAVASCRIPT'))) {
    app.use('/JAVASCRIPT', express.static(path.join(__dirname, 'JAVASCRIPT')));
}
if (fs.existsSync(path.join(__dirname, 'HTML'))) {
    app.use('/HTML', express.static(path.join(__dirname, 'HTML')));
}

function createNeonPool() {
    const connectionString = process.env.DATABASE_URL || process.env.NEON_DATABASE_URL;
    if (connectionString) {
        return new Pool({
            connectionString,
            ssl: { rejectUnauthorized: false }
        });
    }

    return new Pool({
        user: process.env.PGUSER || 'postgres',
        host: process.env.PGHOST || 'localhost',
        database: process.env.PGDATABASE || 'pawtrack',
        password: process.env.PGPASSWORD || 'postgres',
        port: parseInt(process.env.PGPORT, 10) || 5432,
        ssl: process.env.PGHOST && process.env.PGHOST !== 'localhost'
            ? { rejectUnauthorized: false }
            : false
    });
}

function resolveIndexHtml() {
    const rootIndex = path.join(__dirname, 'index.html');
    if (fs.existsSync(rootIndex)) return rootIndex;
    return path.join(__dirname, 'HTML', 'index.html');
}

// Ruta principal
app.get('/', (req, res) => {
    res.sendFile(resolveIndexHtml());
});

// --- AUTENTICACIÓN ---
app.post('/api/registro', async (req, res) => {
    const nombre = (req.body?.nombre || '').trim();
    const correo = (req.body?.correo || '').trim().toLowerCase();
    const pass = req.body?.contraseña ?? req.body?.contrasena ?? '';

    if (!nombre || !correo || !pass) {
        return res.status(400).json({ success: false, message: 'Faltan campos obligatorios' });
    }

    const pool = createNeonPool();
    try {
        const existe = await pool.query('SELECT id FROM usuarios WHERE LOWER(correo) = $1 LIMIT 1', [correo]);
        if (existe.rows.length > 0) {
            return res.status(409).json({ success: false, message: 'El correo ya está registrado' });
        }

        const result = await pool.query(
            'INSERT INTO usuarios (nombre, correo, contrasena) VALUES ($1, $2, $3) RETURNING id, nombre, correo',
            [nombre, correo, pass]
        );

        return res.status(201).json({ success: true, usuario: result.rows[0] });
    } catch (err) {
        console.error('Error en /api/registro:', err);
        return res.status(500).json({ success: false, message: err?.message || 'Error al registrar usuario' });
    } finally {
        await pool.end().catch(() => {});
    }
});

app.post('/api/login', async (req, res) => {
    const correo = (req.body?.correo || '').trim().toLowerCase();
    const pass = req.body?.contraseña ?? req.body?.contrasena ?? '';

    if (!correo || !pass) {
        return res.status(400).json({ success: false, message: 'Ingresa correo y contraseña' });
    }

    const pool = createNeonPool();
    try {
        const result = await pool.query(
            'SELECT id, nombre, correo, contrasena FROM usuarios WHERE LOWER(correo) = $1 LIMIT 1',
            [correo]
        );

        const user = result.rows[0];
        if (!user || user.contrasena !== pass) {
            return res.status(401).json({ success: false, message: 'Correo o contraseña incorrectos' });
        }

        return res.json({
            success: true,
            usuario: {
                id: user.id,
                nombre: user.nombre,
                correo: user.correo
            }
        });
    } catch (err) {
        console.error('Error en /api/login:', err);
        return res.status(500).json({ success: false, message: err?.message || 'Error al iniciar sesión' });
    } finally {
        await pool.end().catch(() => {});
    }
});

// --- MASCOTAS ---
app.get('/api/perros/:usuario_id', async (req, res) => {
    const usuarioId = Number(req.params.usuario_id);
    if (!usuarioId) {
        return res.status(400).json({ error: 'ID de usuario inválido' });
    }

    const pool = createNeonPool();
    try {
        const result = await pool.query(
            'SELECT id, usuario_id, nombre, raza, edad, peso, fecha_registro FROM perros WHERE usuario_id = $1 ORDER BY id ASC',
            [usuarioId]
        );
        return res.json(result.rows);
    } catch (err) {
        console.error('Error en /api/perros/:usuario_id:', err);
        return res.status(500).json({ error: err?.message || 'Error al obtener mascotas' });
    } finally {
        await pool.end().catch(() => {});
    }
});

app.post('/api/perros', async (req, res) => {
    const usuario_id = Number(req.body?.usuario_id);
    const nombre = (req.body?.nombre || '').trim();
    const raza = (req.body?.raza || 'Mestizo').trim();
    const edad = req.body?.edad !== undefined && req.body?.edad !== null && req.body?.edad !== ''
        ? Number(req.body.edad)
        : null;
    const peso = req.body?.peso !== undefined && req.body?.peso !== null && req.body?.peso !== ''
        ? Number(req.body.peso)
        : null;
    const codigoDispositivo = (req.body?.codigo_dispositivo || '').trim();

    if (!usuario_id || !nombre) {
        return res.status(400).json({ success: false, message: 'Faltan usuario_id o nombre de la mascota' });
    }

    const pool = createNeonPool();
    try {
        const result = await pool.query(
            'INSERT INTO perros (usuario_id, nombre, raza, edad, peso) VALUES ($1, $2, $3, $4, $5) RETURNING id, usuario_id, nombre, raza, edad, peso, fecha_registro',
            [usuario_id, nombre, raza, edad, peso]
        );
        const perro = result.rows[0];

        if (codigoDispositivo) {
            await pool.query(
                `INSERT INTO dispositivos (codigo, perro_id, bateria, conexion_definitiva, ultima_conexion)
                 VALUES ($1, $2, 100, TRUE, NOW())
                 ON CONFLICT (codigo) DO UPDATE
                 SET perro_id = EXCLUDED.perro_id, conexion_definitiva = TRUE, ultima_conexion = NOW()`,
                [codigoDispositivo, perro.id]
            );
        }

        return res.status(201).json({ success: true, perro });
    } catch (err) {
        console.error('Error en POST /api/perros:', err);
        return res.status(500).json({ success: false, message: err?.message || 'Error al registrar perro' });
    } finally {
        await pool.end().catch(() => {});
    }
});

// --- DISPOSITIVO, TELEMETRÍA Y UBICACIÓN ---
app.get('/api/dispositivo/:perro_id', async (req, res) => {
    const perroId = Number(req.params.perro_id);
    if (!perroId) {
        return res.status(400).json({ error: 'ID de mascota inválido' });
    }

    const pool = createNeonPool();
    try {
        const result = await pool.query(
            'SELECT id, codigo, perro_id, bateria, conexion_definitiva, ultima_conexion FROM dispositivos WHERE perro_id = $1 ORDER BY id DESC LIMIT 1',
            [perroId]
        );
        return res.json(result.rows[0] || {});
    } catch (err) {
        console.error('Error en /api/dispositivo/:perro_id:', err);
        return res.status(500).json({ error: err?.message || 'Error al consultar dispositivo' });
    } finally {
        await pool.end().catch(() => {});
    }
});

async function procesarTelemetria(req, res) {
    const expectedKey = process.env.DEVICE_API_KEY;
    const providedKey = req.headers['x-device-key'];
    if (expectedKey && providedKey !== expectedKey) {
        return res.status(401).json({ success: false, message: 'Clave de dispositivo no autorizada' });
    }

    const body = req.body || {};
    const codigo = (body.codigo || body.codigo_dispositivo || '').trim();
    if (!codigo) {
        return res.status(400).json({ success: false, message: 'Falta el código del dispositivo' });
    }

    const bateria = body.bateria ?? null;
    const latitud = body.gps?.latitud ?? body.latitud ?? null;
    const longitud = body.gps?.longitud ?? body.longitud ?? null;
    const temperatura = body.sensores?.temperatura ?? body.temperatura ?? null;
    const pulso = body.sensores?.pulso ?? body.pulso ?? null;
    const actividad = body.sensores?.actividad ?? body.actividad ?? 'Normal';

    const pool = createNeonPool();
    try {
        const dispQuery = await pool.query(
            'SELECT id, perro_id FROM dispositivos WHERE codigo = $1 LIMIT 1',
            [codigo]
        );

        if (dispQuery.rows.length === 0) {
            return res.status(404).json({ success: false, message: 'Dispositivo no registrado en la base de datos' });
        }

        const { id: dispositivo_id, perro_id } = dispQuery.rows[0];

        if (bateria !== null && bateria !== undefined) {
            await pool.query(
                'UPDATE dispositivos SET bateria = $1, conexion_definitiva = TRUE, ultima_conexion = NOW() WHERE id = $2',
                [Number(bateria), dispositivo_id]
            );
        } else {
            await pool.query(
                'UPDATE dispositivos SET conexion_definitiva = TRUE, ultima_conexion = NOW() WHERE id = $1',
                [dispositivo_id]
            );
        }

        if (temperatura !== null || pulso !== null) {
            await pool.query(
                'INSERT INTO mediciones (dispositivo_id, temperatura, pulso, actividad) VALUES ($1, $2, $3, $4)',
                [
                    dispositivo_id,
                    temperatura !== null ? Number(temperatura) : null,
                    pulso !== null ? Number(pulso) : null,
                    actividad
                ]
            );

            if (perro_id && temperatura !== null && parseFloat(temperatura) > 39.5) {
                await pool.query(
                    'INSERT INTO alertas (perro_id, tipo, descripcion) VALUES ($1, $2, $3)',
                    [perro_id, 'Temperatura Alta', `Temperatura detectada de ${temperatura} °C en ${codigo}`]
                );
            }
        }

        if (latitud !== null && longitud !== null) {
            await pool.query(
                'INSERT INTO ubicaciones (dispositivo_id, latitud, longitud) VALUES ($1, $2, $3)',
                [dispositivo_id, Number(latitud), Number(longitud)]
            );
        }

        return res.json({ success: true, message: 'Telemetría registrada correctamente' });
    } catch (err) {
        console.error('Error procesando telemetría:', err);
        return res.status(500).json({ success: false, message: err?.message || 'Error al guardar telemetría' });
    } finally {
        await pool.end().catch(() => {});
    }
}

app.post('/api/telemetria', procesarTelemetria);
app.post('/api/dispositivo/datos', procesarTelemetria);

app.get('/api/historial-mediciones/:dispositivo_id', async (req, res) => {
    const dispositivoId = Number(req.params.dispositivo_id);
    if (!dispositivoId) {
        return res.json([]);
    }

    const pool = createNeonPool();
    try {
        const result = await pool.query(
            'SELECT id, dispositivo_id, temperatura, pulso, actividad, fecha_hora FROM mediciones WHERE dispositivo_id = $1 ORDER BY fecha_hora DESC LIMIT 20',
            [dispositivoId]
        );
        return res.json(result.rows);
    } catch (err) {
        console.error('Error en /api/historial-mediciones:', err);
        return res.status(500).json({ error: err?.message || 'Error al obtener mediciones' });
    } finally {
        await pool.end().catch(() => {});
    }
});

app.get('/api/ubicacion/:dispositivo_id', async (req, res) => {
    const dispositivoId = Number(req.params.dispositivo_id);
    if (!dispositivoId) {
        return res.json({});
    }

    const pool = createNeonPool();
    try {
        const result = await pool.query(
            'SELECT id, dispositivo_id, latitud, longitud, fecha_hora FROM ubicaciones WHERE dispositivo_id = $1 ORDER BY fecha_hora DESC LIMIT 1',
            [dispositivoId]
        );
        return res.json(result.rows[0] || {});
    } catch (err) {
        console.error('Error en /api/ubicacion:', err);
        return res.status(500).json({ error: err?.message || 'Error al obtener ubicación' });
    } finally {
        await pool.end().catch(() => {});
    }
});

app.get('/api/alertas/:perro_id', async (req, res) => {
    const perroId = Number(req.params.perro_id);
    if (!perroId) {
        return res.json([]);
    }

    const pool = createNeonPool();
    try {
        const result = await pool.query(
            'SELECT id, perro_id, tipo, descripcion, fecha_hora, atendida FROM alertas WHERE perro_id = $1 ORDER BY fecha_hora DESC LIMIT 10',
            [perroId]
        );
        return res.json(result.rows);
    } catch (err) {
        console.error('Error en /api/alertas:', err);
        return res.status(500).json({ error: err?.message || 'Error al obtener alertas' });
    } finally {
        await pool.end().catch(() => {});
    }
});

// Fallback para rutas del frontend
app.get('*', (req, res) => {
    res.sendFile(resolveIndexHtml());
});

if (require.main === module) {
    app.listen(PORT, () => {
        console.log(`🚀 Servidor ejecutándose en http://localhost:${PORT}`);
    });
}

module.exports = app;