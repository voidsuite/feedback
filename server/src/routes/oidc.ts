import { Hono } from 'hono';
import { config } from '../config/index.js';
import { getPublicKeyJWK } from '../utils/jwtKeys.js';

const oidc = new Hono();

const baseUrl = config.cors.origin.replace(/\/$/, '') || 'http://localhost:3001';

const issuer = config.server.nodeEnv === 'production'
  ? (process.env.PUBLIC_URL || baseUrl)
  : baseUrl;

oidc.get('/.well-known/openid-configuration', (c) => {
  return c.json({
    issuer,
    authorization_endpoint: `${issuer}/oauth/authorize`,
    token_endpoint: `${issuer}/oauth/token`,
    userinfo_endpoint: `${issuer}/oauth/userinfo`,
    jwks_uri: `${issuer}/oauth/jwks`,
    end_session_endpoint: `${issuer}/auth/logout`,
    introspection_endpoint: `${issuer}/oauth/introspect`,
    revocation_endpoint: `${issuer}/oauth/revoke`,
    scopes_supported: ['openid', 'profile', 'email', 'read', 'write'],
    response_types_supported: ['code'],
    response_modes_supported: ['query', 'fragment'],
    grant_types_supported: ['authorization_code'],
    subject_types_supported: ['public'],
    id_token_signing_alg_values_supported: ['RS256'],
    token_endpoint_auth_methods_supported: ['client_secret_post', 'client_secret_basic'],
    claims_supported: ['sub', 'name', 'preferred_username', 'email', 'email_verified', 'updated_at'],
    code_challenge_methods_supported: ['S256'],
  });
});

oidc.get('/oauth/jwks', async (c) => {
  return c.json(await getPublicKeyJWK());
});

export default oidc;
