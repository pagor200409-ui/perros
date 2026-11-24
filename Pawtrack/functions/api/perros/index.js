// functions/api/perros/index.js
import { getPool, jsonResponse, handleOptions } from '../../_db.js';

export async function onRequestOptions() {
  return handleOptions();
}

export async function onRequestPost(context) {
  let pool;
  try {
    const body = await context.request.json();
    const usuario_id = Number(body?.usuario_id);
    const nombre = (body?.nombre || '').trim();
    const raza = (body?.raza || 'Mestizo').trim();
    const edad = body?.edad !== undefined && body?.edad !== null && body?.edad !== '' ? Number(body.edad) : null;
    const peso = body?.peso !== undefined && body?.peso !== null && body?.peso !== '' ? Number(body.peso) : null;
    const codigoDispositivo = (body?.codigo_dispositivo || '').trim();

    if (!usuario_id || !nombre) {
      return jsonResponse({ success: false, message: 'Faltan usuario_id o nombre de la mascota' }, 400);
    }

    pool = getPool(context.env);
    const result = await pool.query(
      'INSERT INTO perros (usuario_id, nombre, raza, edad, peso) VALUES ($1, $2, $3, $4, $5) RETURNING id, usuario_id, nombre, raza, edad, peso, fecha_registro',
      [usuario_id, nombre, raza, edad, peso]
    );
    const perro = result.rows[0];

    if (codigoDispositivo) {
      await pool.query(
        `INSERT INTO dispositivos (codigo, perro_id, bateria, conexion_definitiva, ultima_conexion)
         VALUES ($1, $2, 100, TRUE, NOW())
         ON CONFLICT (codigo) DO UPDATE SET perro_id = EXCLUDED.perro_id, conexion_definitiva = TRUE, ultima_conexion = NOW()`,
        [codigoDispositivo, perro.id]
      );
    }

    return jsonResponse({ success: true, perro }, 201);
  } catch (err) {
    console.error('Error en POST /api/perros:', err);
    return jsonResponse({ success: false, message: err?.message || 'Error al registrar perro' }, 500);
  } finally {
    if (pool) {
      await pool.end().catch(() => {});
    }
  }
}