import mysql from 'mysql2/promise';
import { config } from '../config/index.js';
import { log } from '../utils/log.js';

// Create connection pool for better performance
export const pool = mysql.createPool({
  ...config.database,
  // Enable named placeholders for safer queries
  namedPlaceholders: true,
  // Automatically parse dates
  dateStrings: false,
  // Keep multiple statements disabled to blunt any SQL injection that slips through
  multipleStatements: false,
});

// Test database connection
export async function testConnection(): Promise<boolean> {
  try {
    const connection = await pool.getConnection();
    await connection.ping();
    connection.release();
    log.ok('Database connection established');
    return true;
  } catch (error) {
    log.error('Database connection failed', error as Error);
    return false;
  }
}

// Execute query with error handling
export async function query<T = any>(sql: string, params?: any): Promise<T> {
  try {
    const [rows] = await pool.execute(sql, params);
    return rows as T;
  } catch (error) {
    log.error('Database query error', error as Error);
    throw error;
  }
}

// Get a single row
export async function queryOne<T = any>(sql: string, params?: any): Promise<T | null> {
  const rows = await query<T[]>(sql, params);
  return rows.length > 0 ? rows[0] : null;
}

// Execute transaction
export async function transaction<T>(
  callback: (connection: mysql.PoolConnection) => Promise<T>
): Promise<T> {
  const connection = await pool.getConnection();
  await connection.beginTransaction();

  try {
    const result = await callback(connection);
    await connection.commit();
    return result;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

// Gracefully close pool
export async function closePool(): Promise<void> {
  await pool.end();
  log.ok('Database connection pool closed');
}
