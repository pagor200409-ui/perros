// functions/api/dispositivo/datos.js
import { getPool, jsonResponse, handleOptions } from '../../_db.js';

export async function onRequestOptions() {
  return handleOptions();
}

export async function onRequestPost(context) {
  let pool;
  try {
    const expectedKey = context.env.DEVICE_API_KEY;
    const providedKey = context.request.headers.get('X-Device-Key');
    if (expectedKey && providedKey !== expectedKey) {
      return jsonResponse({ success: false, message: 'Clave de dispositivo no autorizada' }, 401);
    }

    const body = await context.request.json();
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

    pool = getPool(context.env);
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
  } catch (err) {
    console.error('Error en POST /api/dispositivo/datos:', err);
    return jsonResponse({ success: false, message: err?.message || 'Error al guardar datos' }, 500);
  } finally {
    if (pool) {
      await pool.end().catch(() => {});
    }
  }
}