// functions/api/dispositivo/[perroId].js
import { getPool, jsonResponse, handleOptions } from '../../_db.js';

export async function onRequestOptions() {
  return handleOptions();
}

export async function onRequestGet(context) {
  let pool;
  try {
    const perroId = Number(context.params.perroId);
    if (!perroId) {
      return jsonResponse({ error: 'ID de mascota inválido' }, 400);
    }

    pool = getPool(context.env);
    const result = await pool.query(
      'SELECT id, codigo, perro_id, bateria, conexion_definitiva, ultima_conexion FROM dispositivos WHERE perro_id = $1 ORDER BY id DESC LIMIT 1',
      [perroId]
    );
    return jsonResponse(result.rows[0] || {});
  } catch (err) {
    console.error('Error en GET /api/dispositivo/[perroId]:', err);
    return jsonResponse({ error: err?.message || 'Error al consultar dispositivo' }, 500);
  } finally {
    if (pool) {
      await pool.end().catch(() => {});
    }
  }
}