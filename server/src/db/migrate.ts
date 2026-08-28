import mysql from 'mysql2/promise';
import { pool } from './connection.js';
import { config } from '../config/index.js';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { log } from '../utils/log.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export async function runMigrations(): Promise<void> {
  try {
    log.info('Running database migrations...');

    // Read schema file
    const schemaPath = join(__dirname, 'schema.sql');
    const schema = readFileSync(schemaPath, 'utf-8');

    // The schema file is multi-statement; use a dedicated connection so the
    // runtime pool can keep multipleStatements disabled.
    const migrationConn = await mysql.createConnection({
      ...config.database,
      multipleStatements: true,
    });
    try {
      await migrationConn.query(schema);
    } finally {
      await migrationConn.end();
    }

    // Simple robust migrations for existing tables
    // 1. Check for missing columns in users table
    const [columns]: any = await pool.query('SHOW COLUMNS FROM users');
    const columnNames = columns.map((col: any) => col.Field);

    if (!columnNames.includes('password_changed_at')) {
      log.migration('Adding missing column: password_changed_at');
      await pool.query('ALTER TABLE users ADD COLUMN password_changed_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP AFTER password_hash');
    }

    if (!columnNames.includes('updated_at')) {
      log.migration('Adding missing column: updated_at');
      await pool.query('ALTER TABLE users ADD COLUMN updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP AFTER created_at');
    }

    if (!columnNames.includes('last_login_at')) {
      log.migration('Adding missing column: last_login_at');
      await pool.query('ALTER TABLE users ADD COLUMN last_login_at TIMESTAMP NULL AFTER updated_at');
    }

    if (!columnNames.includes('is_active')) {
      log.migration('Adding missing column: is_active');
      await pool.query('ALTER TABLE users ADD COLUMN is_active BOOLEAN DEFAULT TRUE AFTER last_login_at');
    }

    if (!columnNames.includes('two_factor_secret')) {
      log.migration('Adding missing column: two_factor_secret');
      await pool.query('ALTER TABLE users ADD COLUMN two_factor_secret VARCHAR(255) NULL AFTER is_active');
    }

    if (!columnNames.includes('two_factor_enabled')) {
      log.migration('Adding missing column: two_factor_enabled');
      await pool.query('ALTER TABLE users ADD COLUMN two_factor_enabled BOOLEAN DEFAULT FALSE AFTER two_factor_secret');
    }

    // Check for indexes
    const [indexes]: any = await pool.query('SHOW INDEX FROM users');
    const indexNames = indexes.map((idx: any) => idx.Key_name);

    if (!indexNames.includes('idx_email')) {
      log.migration('Adding missing index: idx_email');
      await pool.query('CREATE INDEX idx_email ON users(email)');
    }

    if (!indexNames.includes('idx_created_at')) {
      log.migration('Adding missing index: idx_created_at');
      await pool.query('CREATE INDEX idx_created_at ON users(created_at)');
    }

    // 2. Check for missing columns in oauth_clients table
    const [oauthColumns]: any = await pool.query('SHOW COLUMNS FROM oauth_clients');
    const oauthColumnNames = oauthColumns.map((col: any) => col.Field);

    if (!oauthColumnNames.includes('is_active')) {
      log.migration('Adding missing column: is_active to oauth_clients');
      await pool.query('ALTER TABLE oauth_clients ADD COLUMN is_active BOOLEAN DEFAULT TRUE AFTER allowed_scopes');
    }

    if (!oauthColumnNames.includes('created_at')) {
      log.migration('Adding missing column: created_at to oauth_clients');
      await pool.query('ALTER TABLE oauth_clients ADD COLUMN created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP');
    }

    if (!oauthColumnNames.includes('updated_at')) {
      log.migration('Adding missing column: updated_at to oauth_clients');
      await pool.query('ALTER TABLE oauth_clients ADD COLUMN updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP');
    }

    // 3. Check for sessions table columns
    const [sessionColumns]: any = await pool.query('SHOW COLUMNS FROM sessions');
    const sessionColumnNames = sessionColumns.map((col: any) => col.Field);

    if (!sessionColumnNames.includes('ip_address')) {
      log.migration('Adding missing column: ip_address to sessions');
      await pool.query('ALTER TABLE sessions ADD COLUMN ip_address VARCHAR(45) AFTER expires_at');
    }

    if (!sessionColumnNames.includes('user_agent')) {
      log.migration('Adding missing column: user_agent to sessions');
      await pool.query('ALTER TABLE sessions ADD COLUMN user_agent TEXT AFTER ip_address');
    }

    if (!sessionColumnNames.includes('device_id')) {
      log.migration('Adding missing column: device_id to sessions');
      await pool.query('ALTER TABLE sessions ADD COLUMN device_id VARCHAR(128) AFTER user_agent');
    }

    if (!sessionColumnNames.includes('device_name')) {
      log.migration('Adding missing column: device_name to sessions');
      await pool.query('ALTER TABLE sessions ADD COLUMN device_name VARCHAR(255) AFTER device_id');
    }

    // 4. Ensure user_passkeys table exists
    await pool.query(`
      CREATE TABLE IF NOT EXISTS user_passkeys (
        id VARCHAR(36) PRIMARY KEY,
        user_id VARCHAR(36) NOT NULL,
        credential_id VARCHAR(512) NOT NULL UNIQUE,
        public_key BLOB NOT NULL,
        counter BIGINT DEFAULT 0,
        device_type VARCHAR(32),
        backed_up BOOLEAN DEFAULT FALSE,
        transports TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        last_used_at TIMESTAMP NULL,
        name VARCHAR(255) DEFAULT 'Passkey',
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        INDEX idx_user_id (user_id),
        INDEX idx_credential_id (credential_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    // 5. Add new columns to users table
    const [usersColumns]: any = await pool.query('SHOW COLUMNS FROM users');
    const usersColumnNames = usersColumns.map((col: any) => col.Field);

    if (!usersColumnNames.includes('role')) {
      log.migration('Adding missing column: role');
      await pool.query("ALTER TABLE users ADD COLUMN role VARCHAR(32) DEFAULT 'user' AFTER two_factor_enabled");
    }

    if (!usersColumnNames.includes('avatar_url')) {
      log.migration('Adding missing column: avatar_url');
      await pool.query('ALTER TABLE users ADD COLUMN avatar_url TEXT NULL AFTER role');
    }

    // 6. Add new columns to oauth_clients table
    const [oauthCols]: any = await pool.query('SHOW COLUMNS FROM oauth_clients');
    const oauthColNames = oauthCols.map((col: any) => col.Field);

    if (!oauthColNames.includes('owner_id')) {
      log.migration('Adding missing column: owner_id to oauth_clients');
      await pool.query('ALTER TABLE oauth_clients ADD COLUMN owner_id VARCHAR(36) NULL AFTER allowed_scopes');
    }

    if (!oauthColNames.includes('verification_status')) {
      log.migration('Adding missing column: verification_status to oauth_clients');
      await pool.query("ALTER TABLE oauth_clients ADD COLUMN verification_status VARCHAR(32) DEFAULT 'unverified' AFTER owner_id");
    }

    if (!oauthColNames.includes('app_theme')) {
      log.migration('Adding missing column: app_theme to oauth_clients');
      await pool.query('ALTER TABLE oauth_clients ADD COLUMN app_theme TEXT NULL AFTER is_active');
    }

    // 7. Add admin_settings table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS admin_settings (
        setting_key VARCHAR(64) PRIMARY KEY,
        setting_value TEXT,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    // 8. Add password reset columns to users
    const [usersCols2]: any = await pool.query('SHOW COLUMNS FROM users');
    const usersColNames2 = usersCols2.map((col: any) => col.Field);

    if (!usersColNames2.includes('reset_token')) {
      log.migration('Adding missing column: reset_token');
      await pool.query('ALTER TABLE users ADD COLUMN reset_token VARCHAR(255) NULL AFTER avatar_url');
    }

    if (!usersColNames2.includes('reset_token_expires')) {
      log.migration('Adding missing column: reset_token_expires');
      await pool.query('ALTER TABLE users ADD COLUMN reset_token_expires TIMESTAMP NULL AFTER reset_token');
    }

    if (!usersColNames2.includes('email_verified')) {
      log.migration('Adding missing column: email_verified');
      await pool.query('ALTER TABLE users ADD COLUMN email_verified BOOLEAN DEFAULT FALSE AFTER reset_token_expires');
    }
    if (!usersColNames2.includes('email_verified_at')) {
      log.migration('Adding missing column: email_verified_at');
      await pool.query('ALTER TABLE users ADD COLUMN email_verified_at TIMESTAMP NULL AFTER email_verified');
    }
    if (!usersColNames2.includes('onboarded_at')) {
      log.migration('Adding missing column: onboarded_at');
      await pool.query('ALTER TABLE users ADD COLUMN onboarded_at TIMESTAMP NULL AFTER email_verified_at');
    }

    // 9. Add session_ttl to refresh_token_families
    const [rtfCols]: any = await pool.query('SHOW COLUMNS FROM refresh_token_families');
    const rtfColNames = rtfCols.map((col: any) => col.Field);
    if (!rtfColNames.includes('session_ttl')) {
      log.migration('Adding missing column: session_ttl to refresh_token_families');
      await pool.query('ALTER TABLE refresh_token_families ADD COLUMN session_ttl INT NULL AFTER expires_at');
    }

    // 10. Add session_token to sessions table (for cookie-based auth)
    if (!sessionColumnNames.includes('session_token')) {
      log.migration('Adding missing column: session_token to sessions');
      await pool.query('ALTER TABLE sessions ADD COLUMN session_token VARCHAR(512) NULL AFTER device_name');
      await pool.query('CREATE UNIQUE INDEX idx_session_token ON sessions(session_token)');
    }

    // 11. Widen refresh token columns for RS256 JWTs (~720 chars)
    const widen = async (table: string, col: string) => {
      const [cols]: any = await pool.query('SHOW COLUMNS FROM ' + table);
      const c = cols.find((x: any) => x.Field === col);
      if (c && /varchar\((\d+)\)/i.test(c.Type) && parseInt(c.Type.replace(/varchar\((\d+)\)/i, '$1')) < 1000) {
        log.migration(`Widening ${table}.${col} to VARCHAR(1000)`);
        await pool.query(`ALTER TABLE ${table} MODIFY COLUMN ${col} VARCHAR(1000) CHARACTER SET utf8 COLLATE utf8_bin ${table === 'sessions' && col === 'refresh_token' ? 'NOT NULL' : 'DEFAULT NULL'}`);
      }
    };
    await widen('sessions', 'refresh_token');
    await widen('refresh_token_families', 'refresh_token');
    await widen('refresh_token_families', 'replaced_by');

    log.ok('Migrations completed');
  } catch (error) {
    log.error('Migration failed', error as Error);
    throw error;
  }
}

// Run migrations if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  runMigrations()
    .then(() => {
      log.ok('Migration complete');
      process.exit(0);
    })
    .catch((error) => {
      log.error('Migration failed', error as Error);
      process.exit(1);
    });
}
