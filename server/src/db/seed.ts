import { randomUUID } from 'crypto';
import { query } from './connection.js';
import { log } from '../utils/log.js';
import { generateSecureToken } from '../utils/crypto.js';

// Seed data for OAuth clients. Secrets are generated randomly at seed time so
// no hardcoded credentials ever ship in the repository.
const seedClients = [
  {
    id: randomUUID(),
    client_id: 'demo-app',
    client_secret: generateSecureToken(32),
    name: 'Demo Application',
    description: 'A demo application to test VoidAuth integration',
    logo_url: null,
    redirect_uris: JSON.stringify(['http://localhost:5173/oauth/callback']),
    allowed_scopes: JSON.stringify(['profile', 'email']),
    is_active: true,
  },
  {
    id: randomUUID(),
    client_id: 'note-app',
    client_secret: generateSecureToken(32),
    name: 'Local Note App',
    description: 'Example client for the local note app demo',
    logo_url: null,
    redirect_uris: JSON.stringify([
      'http://localhost:3000/voidauth/callback',
      'http://localhost:4000/voidauth/callback',
    ]),
    allowed_scopes: JSON.stringify(['profile', 'email']),
    is_active: true,
  },
  {
    id: randomUUID(),
    client_id: 'my-project',
    client_secret: generateSecureToken(32),
    name: 'My Project',
    description: 'Personal project using VoidAuth',
    logo_url: null,
    redirect_uris: JSON.stringify(['http://localhost:3000/callback']),
    allowed_scopes: JSON.stringify(['profile']),
    is_active: true,
  },
  {
    id: randomUUID(),
    client_id: 'acme-corp',
    client_secret: generateSecureToken(32),
    name: 'Acme Corp',
    description: 'Enterprise application',
    logo_url: null,
    redirect_uris: JSON.stringify(['https://acme.example.com/auth/callback']),
    allowed_scopes: JSON.stringify(['profile', 'email', 'read', 'write']),
    is_active: true,
  },
  {
    id: randomUUID(),
    client_id: 'example-app',
    client_secret: generateSecureToken(32),
    name: 'Example Application',
    description: 'An example application to test VoidAuth integration',
    logo_url: null,
    redirect_uris: JSON.stringify(['http://localhost:5175/redirect.html']),
    allowed_scopes: JSON.stringify(['profile', 'email']),
    is_active: true,
  },
  {
    id: randomUUID(),
    client_id: 'authiov',
    client_secret: generateSecureToken(32),
    name: 'AuthioV',
    description: '2FA / TOTP Authenticator with cloud sync via VoidAuth',
    logo_url: null,
    redirect_uris: JSON.stringify([
      'http://localhost:5174/oauth/callback',
      'http://localhost:5175/oauth/callback',
    ]),
    allowed_scopes: JSON.stringify(['profile', 'email']),
    verification_status: 'verified',
    is_active: true,
  },
  {
    id: randomUUID(),
    client_id: 'voidfeedback',
    client_secret: process.env.VOIDFEEDBACK_CLIENT_SECRET || generateSecureToken(32),
    name: 'Void Feedback',
    description: 'Support & feedback hub — questions, feature suggestions, bug reports, and live admin chat',
    logo_url: null,
    redirect_uris: JSON.stringify([
      'http://localhost:5179/oauth/callback',
      'https://feedback.stwupid.tech/oauth/callback',
    ]),
    allowed_scopes: JSON.stringify(['profile', 'email']),
    verification_status: 'verified',
    is_active: true,
  },
];

export async function seedDatabase(): Promise<void> {
  try {
    log.info('Seeding database...');

    // Insert OAuth clients. Existing clients keep their stored client_secret so
    // rotated secrets are never reset on restart.
    for (const client of seedClients) {
      await query(
        `INSERT INTO oauth_clients
        (id, client_id, client_secret, name, description, logo_url, redirect_uris, allowed_scopes, verification_status, is_active)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE
          name = VALUES(name),
          description = VALUES(description),
          logo_url = VALUES(logo_url),
          redirect_uris = VALUES(redirect_uris),
          allowed_scopes = VALUES(allowed_scopes),
          verification_status = VALUES(verification_status),
          is_active = VALUES(is_active)`,
        [
          client.id,
          client.client_id,
          client.client_secret,
          client.name,
          client.description,
          client.logo_url,
          client.redirect_uris,
          client.allowed_scopes,
          (client as any).verification_status || 'unverified',
          client.is_active,
        ]
      );
    }

    // Seed scheduled tasks
    const scheduledTasksData = [
      { name: 'prune_expired_tokens', description: 'Remove expired and revoked OAuth tokens/codes', schedule: 'hourly' },
      { name: 'prune_audit_logs', description: 'Delete audit log entries older than 90 days', schedule: 'daily' },
      { name: 'clear_login_attempts', description: 'Clear old login attempts and expired lockouts', schedule: 'hourly' },
    ];
    for (const task of scheduledTasksData) {
      await query(
        `INSERT INTO scheduled_tasks (id, name, description, schedule, next_run)
         VALUES (?, ?, ?, ?, DATE_ADD(NOW(), INTERVAL 1 HOUR))
         ON DUPLICATE KEY UPDATE description = VALUES(description), schedule = VALUES(schedule)`,
        [randomUUID(), task.name, task.description, task.schedule]
      );
    }

    log.ok('Database seeded');
    log.info(`  ${seedClients.length} OAuth clients`);
    log.info(`  ${scheduledTasksData.length} scheduled tasks`);
  } catch (error) {
    log.error('Seeding failed', error as Error);
    throw error;
  }
}

// Run seed if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  seedDatabase()
    .then(() => {
      log.ok('Seeding complete');
      process.exit(0);
    })
    .catch((error) => {
      log.error('Seeding failed', error as Error);
      process.exit(1);
    });
}
