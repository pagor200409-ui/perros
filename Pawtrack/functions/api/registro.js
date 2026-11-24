import { getPool, jsonResponse, handleOptions } from '../_db.js';

export async function onRequestOptions() {
  return handleOptions();
}

export async function onRequestPost(context) {
  let pool;
  try {
    const body = await context.request.json();
    const nombre = (body?.nombre || '').trim();
    const correo = (body?.correo || '').trim().toLowerCase();
    const pass = body?.contrasena ?? body?.contraseña ?? '';

    if (!nombre || !correo || !pass) {
      return jsonResponse({ success: false, message: 'Faltan campos obligatorios' }, 400);
    }

    pool = getPool(context.env);
    const existe = await pool.query('SELECT id FROM usuarios WHERE LOWER(correo) = $1 LIMIT 1', [correo]);
    if (existe.rows.length > 0) {
      return jsonResponse({ success: false, message: 'El correo ya está registrado' }, 409);
    }

    const result = await pool.query(
      'INSERT INTO usuarios (nombre, correo, contrasena) VALUES ($1, $2, $3) RETURNING id, nombre, correo',
      [nombre, correo, pass]
    );

    return jsonResponse({ success: true, usuario: result.rows[0] }, 201);
  } catch (err) {
    console.error('Error en /api/registro:', err);
    return jsonResponse(
      { success: false, message: err?.message || 'Error al registrar usuario' },
      500
    );
  } finally {
    if (pool) {
      await pool.end().catch(() => {});
    }
  }
}