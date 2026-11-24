// functions/api/alertas/[perroId].js
import { getPool, jsonResponse, handleOptions } from '../../_db.js';

export async function onRequestOptions() {
  return handleOptions();
}

export async function onRequestGet(context) {
  let pool;
  try {
    const perroId = Number(context.params.perroId);
    if (!perroId) return jsonResponse([], 200);
    pool = getPool(context.env);
    const result = await pool.query(
      'SELECT id, perro_id, tipo, descripcion, fecha_hora, atendida FROM alertas WHERE perro_id = $1 ORDER BY fecha_hora DESC LIMIT 10',
      [perroId]
    );
    return jsonResponse(result.rows);
  } catch (err) {
    return jsonResponse({ error: err?.message || 'Error al obtener alertas' }, 500);
  } finally {
    if (pool) await pool.end().catch(() => {});
  }
}