import { Pool } from '@neondatabase/serverless';

export function getPool(env) {
  const connectionString = env.DATABASE_URL || env.NEON_DATABASE_URL;
  if (!connectionString) {
    throw new Error('Falta configurar DATABASE_URL en las variables de entorno de Cloudflare Pages');
  }
  return new Pool({ connectionString });
}

export function jsonResponse(data, status = 200) {
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

export function handleOptions() {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, X-Device-Key'
    }
  });
}