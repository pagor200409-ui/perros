import { Pool } from '@neondatabase/serverless';

function getPool(env) {
  const connectionString = env.DATABASE_URL || env.NEON_DATABASE_URL;
  if (!connectionString) {
    throw new Error('Falta configurar DATABASE_URL en las variables de entorno de Cloudflare');
  }
  return new Pool({ connectionString });
}

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, X-Device-Key'
    }
  });
}

export async function onRequest(context) {
  const { request, env, params } = context;

  if (request.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, X-Device-Key'
      }
    });
  }

  const rawPath = params?.path;
  const parts = Array.isArray(rawPath)
    ? rawPath
    : String(rawPath || '').split('/').filter(Boolean);

  let pool;
  try {
    // POST /api/registro
    if (parts[0] === 'registro' && request.method === 'POST') {
      const body = await request.json();
      const nombre = (body?.nombre || '').trim();
      const correo = (body?.correo || '').trim().toLowerCase();
      const pass = body?.contrasena ?? body?.contraseña ?? '';

      if (!nombre || !correo || !pass) {
        return jsonResponse({ success: false, message: 'Faltan campos obligatorios' }, 400);
      }

      pool = getPool(env);
      const existe = await pool.query('SELECT id FROM usuarios WHERE LOWER(correo) = $1 LIMIT 1', [correo]);
      if (existe.rows.length > 0) {
        return jsonResponse({ success: false, message: 'El correo ya está registrado' }, 409);
      }

      const result = await pool.query(
        'INSERT INTO usuarios (nombre, correo, contrasena) VALUES ($1, $2, $3) RETURNING id, nombre, correo',
        [nombre, correo, pass]
      );
      return jsonResponse({ success: true, usuario: result.rows[0] }, 201);
    }

    // POST /api/login
    if (parts[0] === 'login' && request.method === 'POST') {
      const body = await request.json();
      const correo = (body?.correo || '').trim().toLowerCase();
      const pass = body?.contrasena ?? body?.contraseña ?? '';

      if (!correo || !pass) {
        return jsonResponse({ success: false, message: 'Ingresa correo y contraseña' }, 400);
      }

      pool = getPool(env);
      const result = await pool.query(
        'SELECT id, nombre, correo, contrasena FROM usuarios WHERE LOWER(correo) = $1 LIMIT 1',
        [correo]
      );
      const user = result.rows[0];
      if (!user || user.contrasena !== pass) {
        return jsonResponse({ success: false, message: 'Correo o contraseña incorrectos' }, 401);
      }

      return jsonResponse({
        success: true,
        usuario: { id: user.id, nombre: user.nombre, correo: user.correo }
      });
    }

    // GET /api/perros/:usuarioId y POST /api/perros
    if (parts[0] === 'perros') {
      if (request.method === 'GET' && parts[1]) {
        const usuarioId = Number(parts[1]);
        if (!usuarioId) return jsonResponse({ error: 'ID de usuario inválido' }, 400);

        pool = getPool(env);
        const result = await pool.query(
          'SELECT id, usuario_id, nombre, raza, edad, peso, fecha_registro FROM perros WHERE usuario_id = $1 ORDER BY id ASC',
          [usuarioId]
        );
        return jsonResponse(result.rows);
      }

      if (request.method === 'POST') {
        const body = await request.json();
        const usuario_id = Number(body?.usuario_id);
        const nombre = (body?.nombre || '').trim();
        const raza = (body?.raza || 'Mestizo').trim();
        const edad = body?.edad !== undefined && body?.edad !== null && body?.edad !== '' ? Number(body.edad) : null;
        const peso = body?.peso !== undefined && body?.peso !== null && body?.peso !== '' ? Number(body.peso) : null;
        const codigoDispositivo = (body?.codigo_dispositivo || '').trim();

        if (!usuario_id || !nombre) {
          return jsonResponse({ success: false, message: 'Faltan usuario_id o nombre de la mascota' }, 400);
        }

        pool = getPool(env);
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

        return jsonResponse({ success: true, perro }, 201);
      }
    }

    // GET /api/dispositivo/:perroId y POST /api/dispositivo/datos
    if (parts[0] === 'dispositivo') {
      if (request.method === 'GET' && parts[1]) {
        const perroId = Number(parts[1]);
        if (!perroId) return jsonResponse({ error: 'ID de mascota inválido' }, 400);

        pool = getPool(env);
        const result = await pool.query(
          'SELECT id, codigo, perro_id, bateria, conexion_definitiva, ultima_conexion FROM dispositivos WHERE perro_id = $1 ORDER BY id DESC LIMIT 1',
          [perroId]
        );
        return jsonResponse(result.rows[0] || {});
      }

      if (request.method === 'POST' && parts[1] === 'datos') {
        const expectedKey = env.DEVICE_API_KEY;
        const providedKey = request.headers.get('X-Device-Key');
        if (expectedKey && providedKey !== expectedKey) {
          return jsonResponse({ success: false, message: 'Clave de dispositivo no autorizada' }, 401);
        }

        const body = await request.json();
        const codigo = (body?.codigo || body?.codigo_dispositivo || '').trim();
        if (!codigo) {
          return jsonResponse({ success: false, message: 'Falta el código del dispositivo' }, 400);
        }

        const bateria = body?.bateria ?? null;
        const latitud = body?.gps?.latitud ?? body?.latitud ?? null;
        const longitud = body?.gps?.longitud ?? body?.longitud ?? null;
        const temperatura = body?.sensores?.temperatura ?? body?.temperatura ?? null;
        const pulso = body?.sensores?.pulso ?? body?.pulso ?? null;
        const actividad = body?.sensores?.actividad ?? body?.actividad ?? 'Normal';

        pool = getPool(env);
        const dispRes = await pool.query('SELECT id, perro_id FROM dispositivos WHERE codigo = $1 LIMIT 1', [codigo]);
        if (dispRes.rows.length === 0) {
          return jsonResponse({ success: false, message: 'Dispositivo no registrado en Neon' }, 404);
        }

        const { id: dispositivo_id, perro_id } = dispRes.rows[0];

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

          if (perro_id && temperatura !== null && Number(temperatura) > 39.5) {
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

        return jsonResponse({ success: true, message: 'Datos sincronizados con Neon' });
      }
    }

    // POST /api/telemetria
    if (parts[0] === 'telemetria' && request.method === 'POST') {
      const body = await request.json();
      const codigo = (body?.codigo || body?.codigo_dispositivo || '').trim();
      if (!codigo) return jsonResponse({ success: false, message: 'Falta código de dispositivo' }, 400);

      pool = getPool(env);
      const dispRes = await pool.query('SELECT id, perro_id FROM dispositivos WHERE codigo = $1 LIMIT 1', [codigo]);
      if (dispRes.rows.length === 0) return jsonResponse({ success: false, message: 'Dispositivo no encontrado' }, 404);
      const { id: dispositivo_id, perro_id } = dispRes.rows[0];

      if (body.temperatura !== undefined || body.pulso !== undefined) {
        await pool.query(
          'INSERT INTO mediciones (dispositivo_id, temperatura, pulso, actividad) VALUES ($1, $2, $3, $4)',
          [dispositivo_id, body.temperatura ?? null, body.pulso ?? null, body.actividad || 'Normal']
        );
        if (perro_id && body.temperatura !== undefined && Number(body.temperatura) > 39.5) {
          await pool.query(
            'INSERT INTO alertas (perro_id, tipo, descripcion) VALUES ($1, $2, $3)',
            [perro_id, 'Temperatura Alta', `Temperatura detectada de ${body.temperatura} °C en ${codigo}`]
          );
        }
      }
      if (body.latitud !== undefined && body.longitud !== undefined) {
        await pool.query(
          'INSERT INTO ubicaciones (dispositivo_id, latitud, longitud) VALUES ($1, $2, $3)',
          [dispositivo_id, Number(body.latitud), Number(body.longitud)]
        );
      }
      return jsonResponse({ success: true, message: 'Telemetría registrada' });
    }

    // GET /api/historial-mediciones/:dispositivoId
    if (parts[0] === 'historial-mediciones' && request.method === 'GET') {
      const dispositivoId = Number(parts[1]);
      if (!dispositivoId) return jsonResponse([]);
      pool = getPool(env);
      const result = await pool.query(
        'SELECT id, dispositivo_id, temperatura, pulso, actividad, fecha_hora FROM mediciones WHERE dispositivo_id = $1 ORDER BY fecha_hora DESC LIMIT 20',
        [dispositivoId]
      );
      return jsonResponse(result.rows);
    }

    // GET /api/ubicacion/:dispositivoId
    if (parts[0] === 'ubicacion' && request.method === 'GET') {
      const dispositivoId = Number(parts[1]);
      if (!dispositivoId) return jsonResponse({});
      pool = getPool(env);
      const result = await pool.query(
        'SELECT id, dispositivo_id, latitud, longitud, fecha_hora FROM ubicaciones WHERE dispositivo_id = $1 ORDER BY fecha_hora DESC LIMIT 1',
        [dispositivoId]
      );
      return jsonResponse(result.rows[0] || {});
    }

    // GET /api/alertas/:perroId
    if (parts[0] === 'alertas' && request.method === 'GET') {
      const perroId = Number(parts[1]);
      if (!perroId) return jsonResponse([]);
      pool = getPool(env);
      const result = await pool.query(
        'SELECT id, perro_id, tipo, descripcion, fecha_hora, atendida FROM alertas WHERE perro_id = $1 ORDER BY fecha_hora DESC LIMIT 10',
        [perroId]
      );
      return jsonResponse(result.rows);
    }

    return jsonResponse({ success: false, message: 'Ruta de API no encontrada' }, 404);
  } catch (err) {
    console.error('Error en /api/*:', err);
    return jsonResponse({ success: false, message: err?.message || 'Error interno del servidor' }, 500);
  } finally {
    if (pool) {
      await pool.end().catch(() => {});
    }
  }
}
