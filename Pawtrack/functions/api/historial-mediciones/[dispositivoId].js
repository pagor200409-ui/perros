// functions/api/historial-mediciones/[dispositivoId].js
import { getPool, jsonResponse, handleOptions } from '../../_db.js';

export async function onRequestOptions() {
  return handleOptions();
}

export async function onRequestGet(context) {
  let pool;
  try {
    const dispositivoId = Number(context.params.dispositivoId);
    if (!dispositivoId) return jsonResponse([], 200);
    pool = getPool(context.env);
    const result = await pool.query(
      'SELECT id, dispositivo_id, temperatura, pulso, actividad, fecha_hora FROM mediciones WHERE dispositivo_id = $1 ORDER BY fecha_hora DESC LIMIT 20',
      [dispositivoId]
    );
    return jsonResponse(result.rows);
  } catch (err) {
    return jsonResponse({ error: err?.message || 'Error al obtener mediciones' }, 500);
  } finally {
    if (pool) await pool.end().catch(() => {});
  }
}