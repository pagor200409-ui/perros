// functions/api/perros/[usuarioId].js
import { getPool, jsonResponse, handleOptions } from '../../_db.js';

export async function onRequestOptions() {
  return handleOptions();
}

export async function onRequestGet(context) {
  let pool;
  try {
    const usuarioId = Number(context.params.usuarioId);
    if (!usuarioId) {
      return jsonResponse({ error: 'ID de usuario inválido' }, 400);
    }

    pool = getPool(context.env);
    const result = await pool.query(
      'SELECT id, usuario_id, nombre, raza, edad, peso, fecha_registro FROM perros WHERE usuario_id = $1 ORDER BY id ASC',
      [usuarioId]
    );
    return jsonResponse(result.rows);
  } catch (err) {
    console.error('Error en GET /api/perros/[usuarioId]:', err);
    return jsonResponse({ error: err?.message || 'Error al obtener mascotas' }, 500);
  } finally {
    if (pool) {
      await pool.end().catch(() => {});
    }
  }
}