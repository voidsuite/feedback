-- VoidAuth Database Schema
-- MySQL 8.0+ compatible schema with proper indexing and foreign keys

-- Users table
CREATE TABLE IF NOT EXISTS users (
  id VARCHAR(36) PRIMARY KEY,
  email VARCHAR(255) NOT NULL UNIQUE,
  name VARCHAR(255) NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  password_changed_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  last_login_at TIMESTAMP NULL,
  is_active BOOLEAN DEFAULT TRUE,
  two_factor_secret VARCHAR(255) NULL,
  two_factor_enabled BOOLEAN DEFAULT FALSE,
  role VARCHAR(32) DEFAULT 'user',
  avatar_url TEXT NULL,
  INDEX idx_email (email),
  INDEX idx_created_at (created_at),
  INDEX idx_role (role)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Sessions table for refresh tokens
CREATE TABLE IF NOT EXISTS sessions (
  id VARCHAR(36) PRIMARY KEY,
  user_id VARCHAR(36) NOT NULL,
  refresh_token VARCHAR(1000) CHARACTER SET utf8 COLLATE utf8_bin NOT NULL UNIQUE,
  expires_at TIMESTAMP NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  ip_address VARCHAR(45),
  user_agent TEXT,
  device_id VARCHAR(128) NULL,
  device_name VARCHAR(255) NULL,
  session_token VARCHAR(512) NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_user_id (user_id),
  INDEX idx_refresh_token (refresh_token),
  INDEX idx_expires_at (expires_at),
  UNIQUE INDEX idx_session_token (session_token)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- OAuth applications/clients
CREATE TABLE IF NOT EXISTS oauth_clients (
  id VARCHAR(36) PRIMARY KEY,
  client_id VARCHAR(255) NOT NULL UNIQUE,
  client_secret VARCHAR(255) NOT NULL,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  logo_url TEXT,
  redirect_uris TEXT NOT NULL, -- JSON array stored as text
  allowed_scopes TEXT NOT NULL, -- JSON array stored as text
  owner_id VARCHAR(36) NULL,
  verification_status VARCHAR(32) DEFAULT 'unverified',
  is_active BOOLEAN DEFAULT TRUE,
  app_theme TEXT NULL, -- JSON theme config for consent screen customization
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE SET NULL,
  INDEX idx_client_id (client_id),
  INDEX idx_owner_id (owner_id),
  INDEX idx_verification_status (verification_status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- OAuth authorization codes (temporary, short-lived)
CREATE TABLE IF NOT EXISTS oauth_codes (
  id VARCHAR(36) PRIMARY KEY,
  code VARCHAR(255) NOT NULL UNIQUE,
  user_id VARCHAR(36) NOT NULL,
  client_id VARCHAR(36) NOT NULL,
  redirect_uri TEXT NOT NULL,
  scope TEXT NOT NULL,
  expires_at TIMESTAMP NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  used_at TIMESTAMP NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (client_id) REFERENCES oauth_clients(id) ON DELETE CASCADE,
  INDEX idx_code (code),
  INDEX idx_user_id (user_id),
  INDEX idx_client_id (client_id),
  INDEX idx_expires_at (expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- OAuth access tokens
CREATE TABLE IF NOT EXISTS oauth_tokens (
  id VARCHAR(36) PRIMARY KEY,
  access_token VARCHAR(512) NOT NULL UNIQUE,
  user_id VARCHAR(36) NOT NULL,
  client_id VARCHAR(36) NOT NULL,
  scope TEXT NOT NULL,
  expires_at TIMESTAMP NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  revoked_at TIMESTAMP NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (client_id) REFERENCES oauth_clients(id) ON DELETE CASCADE,
  INDEX idx_access_token (access_token),
  INDEX idx_user_id (user_id),
  INDEX idx_client_id (client_id),
  INDEX idx_expires_at (expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- User-connected apps (for dashboard display)
CREATE TABLE IF NOT EXISTS user_connected_apps (
  id VARCHAR(36) PRIMARY KEY,
  user_id VARCHAR(36) NOT NULL,
  client_id VARCHAR(36) NOT NULL,
  scope TEXT NOT NULL,
  connected_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  last_used_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (client_id) REFERENCES oauth_clients(id) ON DELETE CASCADE,
  UNIQUE KEY unique_user_client (user_id, client_id),
  INDEX idx_user_id (user_id),
  INDEX idx_client_id (client_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- WebAuthn/FIDO2 Passkeys
CREATE TABLE IF NOT EXISTS user_passkeys (
  id VARCHAR(36) PRIMARY KEY,
  user_id VARCHAR(36) NOT NULL,
  credential_id VARCHAR(512) NOT NULL UNIQUE,
  public_key BLOB NOT NULL,
  counter BIGINT DEFAULT 0,
  device_type VARCHAR(32),
  backed_up BOOLEAN DEFAULT FALSE,
  transports TEXT, -- JSON array
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  last_used_at TIMESTAMP NULL,
  name VARCHAR(255) DEFAULT 'Passkey',
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_user_id (user_id),
  INDEX idx_credential_id (credential_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Admin settings (key-value store)
CREATE TABLE IF NOT EXISTS admin_settings (
  setting_key VARCHAR(64) PRIMARY KEY,
  setting_value TEXT,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- User storage files
CREATE TABLE IF NOT EXISTS storage_files (
  id VARCHAR(36) PRIMARY KEY,
  user_id VARCHAR(36) NOT NULL,
  client_id VARCHAR(36) NULL,
  storage_path VARCHAR(512) NOT NULL,
  original_name VARCHAR(255) NOT NULL,
  mime_type VARCHAR(127) NOT NULL,
  size_bytes BIGINT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_user_id (user_id),
  INDEX idx_client_id (client_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- User storage app data
CREATE TABLE IF NOT EXISTS storage_app_data (
  id VARCHAR(36) PRIMARY KEY,
  user_id VARCHAR(36) NOT NULL,
  client_id VARCHAR(36) NULL,
  data_key VARCHAR(255) NOT NULL,
  data_value JSON NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  UNIQUE KEY unique_user_app_key (user_id, client_id, data_key),
  INDEX idx_user_id (user_id),
  INDEX idx_client_id (client_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 2FA backup codes
CREATE TABLE IF NOT EXISTS user_2fa_backup_codes (
  id VARCHAR(36) PRIMARY KEY,
  user_id VARCHAR(36) NOT NULL,
  code_hash VARCHAR(255) NOT NULL,
  used BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_user_id (user_id),
  INDEX idx_used (used)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Audit log (admin actions, logins, sensitive operations)
CREATE TABLE IF NOT EXISTS audit_log (
  id VARCHAR(36) PRIMARY KEY,
  user_id VARCHAR(36) NULL,
  action VARCHAR(128) NOT NULL,
  resource_type VARCHAR(64) NULL,
  resource_id VARCHAR(36) NULL,
  details JSON NULL,
  ip_address VARCHAR(45) NULL,
  user_agent TEXT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,
  INDEX idx_user_id (user_id),
  INDEX idx_action (action),
  INDEX idx_created_at (created_at),
  INDEX idx_resource (resource_type, resource_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Login attempts (brute-force tracking)
CREATE TABLE IF NOT EXISTS login_attempts (
  id VARCHAR(36) PRIMARY KEY,
  email VARCHAR(255) NOT NULL,
  ip_address VARCHAR(45) NULL,
  success BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_email (email),
  INDEX idx_ip (ip_address),
  INDEX idx_created_at (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Login history (for user to review)
CREATE TABLE IF NOT EXISTS login_history (
  id VARCHAR(36) PRIMARY KEY,
  user_id VARCHAR(36) NOT NULL,
  email VARCHAR(255) NOT NULL,
  ip_address VARCHAR(45) NULL,
  user_agent TEXT NULL,
  method VARCHAR(32) DEFAULT 'password',
  success BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_user_id (user_id),
  INDEX idx_created_at (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Login lockouts (brute-force counter per email+IP)
CREATE TABLE IF NOT EXISTS login_lockouts (
  email VARCHAR(255) NOT NULL,
  ip_address VARCHAR(45) NOT NULL,
  attempt_count INT DEFAULT 1,
  locked_until TIMESTAMP NULL,
  last_attempt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (email, ip_address)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Magic link tokens (passwordless login)
CREATE TABLE IF NOT EXISTS magic_links (
  id VARCHAR(36) PRIMARY KEY,
  user_id VARCHAR(36) NOT NULL,
  token VARCHAR(255) NOT NULL UNIQUE,
  expires_at TIMESTAMP NOT NULL,
  used_at TIMESTAMP NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_token (token),
  INDEX idx_user_id (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Email verification tokens
CREATE TABLE IF NOT EXISTS email_verifications (
  id VARCHAR(36) PRIMARY KEY,
  user_id VARCHAR(36) NOT NULL,
  email VARCHAR(255) NOT NULL,
  token VARCHAR(255) NOT NULL UNIQUE,
  expires_at TIMESTAMP NOT NULL,
  verified_at TIMESTAMP NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_token (token),
  INDEX idx_user_id (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- PKCE challenges for OAuth authorization codes
CREATE TABLE IF NOT EXISTS oauth_challenges (
  code VARCHAR(255) NOT NULL UNIQUE,
  code_challenge VARCHAR(255) NULL,
  code_challenge_method VARCHAR(16) NULL DEFAULT 'S256',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (code) REFERENCES oauth_codes(code) ON DELETE CASCADE,
  INDEX idx_code (code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Refresh token families (rotation + replay detection)
CREATE TABLE IF NOT EXISTS refresh_token_families (
  id VARCHAR(36) PRIMARY KEY,
  user_id VARCHAR(36) NOT NULL,
  client_id VARCHAR(36) NULL,
  family_id VARCHAR(64) NOT NULL,
  refresh_token VARCHAR(1000) CHARACTER SET utf8 COLLATE utf8_bin NOT NULL UNIQUE,
  replaced_by VARCHAR(1000) CHARACTER SET utf8 COLLATE utf8_bin DEFAULT NULL,
  expires_at TIMESTAMP NOT NULL,
  session_ttl INT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_token (refresh_token),
  INDEX idx_family (family_id),
  INDEX idx_user_id (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- User notification preferences
CREATE TABLE IF NOT EXISTS user_notification_prefs (
  user_id VARCHAR(36) PRIMARY KEY,
  login_alert BOOLEAN DEFAULT TRUE,
  password_change BOOLEAN DEFAULT TRUE,
  new_app_connection BOOLEAN DEFAULT TRUE,
  storage_warning BOOLEAN DEFAULT TRUE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Account recovery contacts
CREATE TABLE IF NOT EXISTS user_recovery_contacts (
  id VARCHAR(36) PRIMARY KEY,
  user_id VARCHAR(36) NOT NULL,
  contact_type VARCHAR(16) NOT NULL,
  contact_value VARCHAR(255) NOT NULL,
  verified BOOLEAN DEFAULT FALSE,
  verification_token VARCHAR(255) NULL,
  verification_expires TIMESTAMP NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_user_id (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Scheduled tasks (cron jobs)
CREATE TABLE IF NOT EXISTS scheduled_tasks (
  id VARCHAR(36) PRIMARY KEY,
  name VARCHAR(128) NOT NULL UNIQUE,
  description TEXT,
  schedule VARCHAR(64) NOT NULL,
  last_run TIMESTAMP NULL,
  next_run TIMESTAMP NULL,
  enabled BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Allowlist/blocklist entries for geo/IP
CREATE TABLE IF NOT EXISTS ip_allow_block (
  id VARCHAR(36) PRIMARY KEY,
  target_type VARCHAR(16) NOT NULL COMMENT 'user, app, global',
  target_id VARCHAR(36) NULL,
  rule_type VARCHAR(8) NOT NULL COMMENT 'allow, block',
  ip_or_cidr VARCHAR(64) NOT NULL,
  country_code VARCHAR(4) NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (target_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_target (target_type, target_id),
  INDEX idx_ip (ip_or_cidr)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Email templates for admin customization
CREATE TABLE IF NOT EXISTS email_templates (
  id VARCHAR(36) PRIMARY KEY,
  template_key VARCHAR(64) NOT NULL UNIQUE,
  subject VARCHAR(255) NOT NULL,
  body_html TEXT NOT NULL,
  body_text TEXT NULL,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
