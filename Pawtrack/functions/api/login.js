import { getPool, jsonResponse, handleOptions } from '../_db.js';

export async function onRequestOptions() {
  return handleOptions();
}

export async function onRequestPost(context) {
  let pool;
  try {
    const body = await context.request.json();
    const correo = (body?.correo || '').trim().toLowerCase();
    const pass = body?.contrasena ?? body?.contraseña ?? '';

    if (!correo || !pass) {
      return jsonResponse({ success: false, message: 'Ingresa correo y contraseña' }, 400);
    }

    pool = getPool(context.env);
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
      usuario: {
        id: user.id,
        nombre: user.nombre,
        correo: user.correo
      }
    });
  } catch (err) {
    console.error('Error en /api/login:', err);
    return jsonResponse(
      { success: false, message: err?.message || 'Error al iniciar sesión' },
      500
    );
  } finally {
    if (pool) {
      await pool.end().catch(() => {});
    }
  }
}