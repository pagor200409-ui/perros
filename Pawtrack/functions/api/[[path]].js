import { Pool } from '@neondatabase/serverless';

function getPool(env) {
  const connectionString = env.DATABASE_URL || env.NEON_DATABASE_URL;
  if (!connectionString) {
    throw new Error('Falta configurar DATABASE_URL en Cloudflare');
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

function getRouteParts(request, params) {
  if (Array.isArray(params?.path) && params.path.length > 0) {
    return params.path.map(String).filter(Boolean);
  }
  if (typeof params?.path === 'string' && params.path.trim() !== '') {
    return params.path.split('/').filter(Boolean);
  }
  const url = new URL(request.url);
  return url.pathname.replace(/^\/api\/?/, '').split('/').filter(Boolean);
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

  const parts = getRouteParts(request, params);
  let pool;

  try {
    // POST /api/registro
    if (parts[0] === 'registro' && request.method === 'POST') {
      const body = await request.json();
      const nombre = (body?.nombre || '').trim();
      const correo = (body?.correo || '').trim().toLowerCase();
      const pass = body?.contrasena ?? body?.contraseña ?? '';

      if (!nombre || !correo || !pass) {
        return jsonResponse({ success: false, message: 'Completa nombre, correo y contraseña' }, 400);
      }

      pool = getPool(env);
      const existe = await pool.query('SELECT id FROM usuarios WHERE LOWER(correo) = $1 LIMIT 1', [correo]);
      if (existe.rows.length > 0) {
        return jsonResponse({ success: false, message: 'Ese correo ya está registrado' }, 409);
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
        if (!usuarioId) return jsonResponse([], 200);
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
        const edad = body?.edad !== '' && body?.edad !== undefined && body?.edad !== null ? Number(body.edad) : null;
        const peso = body?.peso !== '' && body?.peso !== undefined && body?.peso !== null ? Number(body.peso) : null;
        const codigoDispositivo = (body?.codigo_dispositivo || '').trim();

        if (!usuario_id || !nombre) {
          return jsonResponse({ success: false, message: 'Faltan datos de la mascota' }, 400);
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

    // GET /api/dispositivo/:perroId
    if (parts[0] === 'dispositivo' && request.method === 'GET' && parts[1]) {
      const perroId = Number(parts[1]);
      if (!perroId) return jsonResponse({});
      pool = getPool(env);
      const result = await pool.query(
        'SELECT id, codigo, perro_id, bateria, conexion_definitiva, ultima_conexion FROM dispositivos WHERE perro_id = $1 ORDER BY id DESC LIMIT 1',
        [perroId]
      );
      return jsonResponse(result.rows[0] || {});
    }

    // GET /api/historial-mediciones/:dispositivoId (consulta la tabla "medir" de Neon)
    if (parts[0] === 'historial-mediciones' && request.method === 'GET' && parts[1]) {
      const dispositivoId = Number(parts[1]);
      if (!dispositivoId) return jsonResponse([]);
      pool = getPool(env);
      const result = await pool.query(
        'SELECT id, dispositivo_id, temperatura, pulso, actividad, fecha_hora FROM medir WHERE dispositivo_id = $1 ORDER BY fecha_hora DESC LIMIT 20',
        [dispositivoId]
      );
      return jsonResponse(result.rows);
    }

    // GET /api/ubicacion/:dispositivoId
    if (parts[0] === 'ubicacion' && request.method === 'GET' && parts[1]) {
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
    if (parts[0] === 'alertas' && request.method === 'GET' && parts[1]) {
      const perroId = Number(parts[1]);
      if (!perroId) return jsonResponse([]);
      pool = getPool(env);
      const result = await pool.query(
        'SELECT id, perro_id, tipo, descripcion, fecha_hora, atendida FROM alertas WHERE perro_id = $1 ORDER BY fecha_hora DESC LIMIT 10',
        [perroId]
      );
      return jsonResponse(result.rows);
    }

    return jsonResponse({ success: false, message: 'Ruta no encontrada' }, 404);
  } catch (err) {
    console.error('Error en API:', err);
    return jsonResponse({ success: false, message: err?.message || 'Error en servidor/base de datos' }, 500);
  } finally {
    if (pool) {
      await pool.end().catch(() => {});
    }
  }
}

export default {
  fetch: onRequest
};
