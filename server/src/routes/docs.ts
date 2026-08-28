import { Hono } from 'hono';

const docs = new Hono();

const swaggerHtml = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>VoidAuth API Documentation</title>
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/swagger-ui-dist@5/swagger-ui.css" integrity="sha384-GBwEGg5JtFyBFPjOkDC22JOISl5FB8wgMgPrhq0V8sJb9F4dJ8O227c/s2B9+M" crossorigin="anonymous" />
  <style>
    html { box-sizing: border-box; overflow: -moz-scrollbars-vertical; overflow-y: scroll; }
    *, *:before, *:after { box-sizing: inherit; }
    body { margin: 0; background: #fafafa; }
    .topbar { display: none; }
  </style>
</head>
<body>
  <div id="swagger-ui"></div>
  <script src="https://cdn.jsdelivr.net/npm/swagger-ui-dist@5/swagger-ui-bundle.js" crossorigin></script>
  <script src="https://cdn.jsdelivr.net/npm/swagger-ui-dist@5/swagger-ui-standalone-preset.js" crossorigin></script>
  <script>
    window.onload = () => {
      SwaggerUIBundle({
        url: "/docs/openapi.json",
        dom_id: '#swagger-ui',
        deepLinking: true,
        presets: [SwaggerUIBundle.presets.apis, SwaggerUIStandalonePreset],
        layout: "StandaloneLayout",
        defaultModelsExpandDepth: -1,
        docExpansion: "list",
      });
    };
  </script>
</body>
</html>`;

docs.get('/', (c) => {
  c.header('Content-Type', 'text/html; charset=utf-8');
  return c.body(swaggerHtml);
});

const spec = {
  openapi: "3.1.0",
  info: {
    title: "VoidAuth API",
    description: "Self-hosted Authentication & OAuth 2.0/OpenID Connect authorization server with storage API.",
    version: "1.0.0",
    contact: { name: "VoidAuth" },
  },
  servers: [{ url: "http://localhost:3001", description: "Local development" }],
  tags: [
    { name: "Auth", description: "Authentication endpoints" },
    { name: "OAuth 2.0", description: "OAuth 2.0 & OpenID Connect" },
    { name: "OIDC", description: "OpenID Connect discovery" },
    { name: "Users", description: "User profile and settings" },
    { name: "Passkey", description: "WebAuthn/FIDO2 passkeys" },
    { name: "Storage", description: "Per-user file & app data storage" },
    { name: "Admin", description: "Admin panel endpoints" },
    { name: "Developer", description: "User-created OAuth apps" },
  ],
  paths: {
    "/auth/register": {
      post: {
        tags: ["Auth"],
        summary: "Register a new user",
        requestBody: { required: true, content: { "application/json": { schema: { type: "object", required: ["email","password","name"], properties: { email: { type: "string", format: "email" }, password: { type: "string", minLength: 8 }, name: { type: "string", minLength: 2 } } } } } },
        responses: { "201": { description: "User registered, returns user + tokens" }, "400": { description: "Validation error" }, "403": { description: "Registration disabled" } },
      },
    },
    "/auth/login": {
      post: {
        tags: ["Auth"],
        summary: "Login with email/password",
        requestBody: { required: true, content: { "application/json": { schema: { type: "object", required: ["email","password"], properties: { email: { type: "string" }, password: { type: "string" } } } } } },
        responses: { "200": { description: "Success with tokens, or mfaRequired if 2FA enabled" }, "401": { description: "Invalid credentials" }, "429": { description: "Account locked (brute-force)" } },
      },
    },
    "/auth/login/2fa": {
      post: {
        tags: ["Auth"],
        summary: "Complete 2FA login",
        requestBody: { required: true, content: { "application/json": { schema: { type: "object", required: ["mfa_token","code"], properties: { mfa_token: { type: "string" }, code: { type: "string" } } } } } },
        responses: { "200": { description: "Tokens returned" }, "401": { description: "Invalid/expired MFA token or code" } },
      },
    },
    "/auth/magic-link/send": {
      post: {
        tags: ["Auth"],
        summary: "Send a magic link for passwordless sign-in",
        requestBody: { required: true, content: { "application/json": { schema: { type: "object", required: ["email"], properties: { email: { type: "string" } } } } } },
        responses: { "200": { description: "Magic link sent (always returns success)" } },
      },
    },
    "/auth/magic-link/verify": {
      post: {
        tags: ["Auth"],
        summary: "Verify magic link and sign in",
        requestBody: { required: true, content: { "application/json": { schema: { type: "object", required: ["email","token"], properties: { email: { type: "string" }, token: { type: "string" } } } } } },
        responses: { "200": { description: "Tokens returned" }, "400": { description: "Invalid/expired link" } },
      },
    },
    "/auth/otp/send": {
      post: {
        tags: ["Auth"],
        summary: "Send one-time password via email",
        requestBody: { required: true, content: { "application/json": { schema: { type: "object", required: ["email"], properties: { email: { type: "string" } } } } } },
        responses: { "200": { description: "OTP sent" } },
      },
    },
    "/auth/otp/verify": {
      post: {
        tags: ["Auth"],
        summary: "Verify OTP code and sign in",
        requestBody: { required: true, content: { "application/json": { schema: { type: "object", required: ["email","code"], properties: { email: { type: "string" }, code: { type: "string" } } } } } },
        responses: { "200": { description: "Tokens returned" } },
      },
    },
    "/auth/login-history": {
      get: {
        tags: ["Auth"],
        summary: "Get login history for current user",
        parameters: [{ name: "page", in: "query", schema: { type: "integer" } }, { name: "limit", in: "query", schema: { type: "integer" } }],
        responses: { "200": { description: "Paginated login history" } },
        security: [{ bearerAuth: [] }],
      },
    },
    "/auth/password-strength": {
      get: {
        tags: ["Auth"],
        summary: "Check password strength (0-4 score)",
        parameters: [{ name: "password", in: "query", required: true, schema: { type: "string" } }],
        responses: { "200": { description: "Strength score and warning" } },
      },
    },
    "/auth/check-password": {
      post: {
        tags: ["Auth"],
        summary: "Check if password appears in known data breaches (HaveIBeenPwned)",
        requestBody: { required: true, content: { "application/json": { schema: { type: "object", required: ["password"], properties: { password: { type: "string" } } } } } },
        responses: { "200": { description: "Breach status" } },
      },
    },
    "/auth/re-auth": {
      post: {
        tags: ["Auth"],
        summary: "Step-up authentication: re-verify password for sensitive actions",
        requestBody: { required: true, content: { "application/json": { schema: { type: "object", required: ["password"], properties: { password: { type: "string" } } } } } },
        responses: { "200": { description: "Step-up token returned" } },
        security: [{ bearerAuth: [] }],
      },
    },
    "/auth/verify-email/send": {
      post: {
        tags: ["Auth"],
        summary: "Send email verification link",
        responses: { "200": { description: "Verification email sent" } },
        security: [{ bearerAuth: [] }],
      },
    },
    "/auth/verify-email/confirm": {
      post: {
        tags: ["Auth"],
        summary: "Confirm email verification",
        requestBody: { required: true, content: { "application/json": { schema: { type: "object", required: ["token"], properties: { token: { type: "string" } } } } } },
        responses: { "200": { description: "Email verified" } },
      },
    },
    "/auth/notifications": {
      get: { tags: ["Auth"], summary: "Get notification preferences", responses: { "200": {} }, security: [{ bearerAuth: [] }] },
      patch: { tags: ["Auth"], summary: "Update notification preferences", responses: { "200": {} }, security: [{ bearerAuth: [] }] },
    },
    "/auth/2fa/setup": {
      post: {
        tags: ["Auth"],
        summary: "Start 2FA setup (returns QR code)",
        responses: { "200": { description: "Secret and QR code URL" } },
        security: [{ bearerAuth: [] }],
      },
    },
    "/auth/2fa/verify": {
      post: {
        tags: ["Auth"],
        summary: "Verify and enable 2FA",
        requestBody: { required: true, content: { "application/json": { schema: { type: "object", required: ["code"], properties: { code: { type: "string" } } } } } },
        responses: { "200": { description: "2FA enabled + backup codes" } },
        security: [{ bearerAuth: [] }],
      },
    },
    "/auth/2fa/disable": {
      post: {
        tags: ["Auth"],
        summary: "Disable 2FA (requires password)",
        requestBody: { required: true, content: { "application/json": { schema: { type: "object", required: ["currentPassword"], properties: { currentPassword: { type: "string" } } } } } },
        responses: { "200": { description: "2FA disabled" } },
        security: [{ bearerAuth: [] }],
      },
    },
    "/oauth/authorize": {
      get: { tags: ["OAuth 2.0"], summary: "Start OAuth authorization flow", parameters: [{ name: "client_id", in: "query", required: true }, { name: "redirect_uri", in: "query", required: true }, { name: "response_type", in: "query", required: true }, { name: "scope", in: "query" }, { name: "state", in: "query" }, { name: "nonce", in: "query" }], responses: { "200": { description: "Client info for consent" } } },
      post: { tags: ["OAuth 2.0"], summary: "Submit consent (with optional PKCE code_challenge)", responses: { "200": { description: "Authorization code + redirect URL" } }, security: [{ bearerAuth: [] }] },
    },
    "/oauth/token": {
      post: {
        tags: ["OAuth 2.0"],
        summary: "Exchange authorization code/refresh_token/client_credentials for access token",
        requestBody: { required: true, content: { "application/json": { schema: { type: "object", required: ["grant_type","client_id","client_secret"], properties: { grant_type: { type: "string", enum: ["authorization_code","client_credentials","refresh_token"] }, client_id: { type: "string" }, client_secret: { type: "string" }, code: { type: "string" }, code_verifier: { type: "string" }, redirect_uri: { type: "string" }, refresh_token: { type: "string" }, scope: { type: "string" } } } } } },
        responses: { "200": { description: "Access token + refresh token + id_token" } },
      },
    },
    "/oauth/introspect": {
      post: {
        tags: ["OAuth 2.0"],
        summary: "Introspect an access token (RFC 7662)",
        requestBody: { required: true, content: { "application/json": { schema: { type: "object", required: ["token"], properties: { token: { type: "string" } } } } } },
        responses: { "200": { description: "Token active status and metadata" } },
      },
    },
    "/oauth/revoke": {
      post: {
        tags: ["OAuth 2.0"],
        summary: "Revoke an access token (RFC 7009)",
        requestBody: { required: true, content: { "application/json": { schema: { type: "object", required: ["token"], properties: { token: { type: "string" }, token_type_hint: { type: "string" } } } } } },
        responses: { "200": { description: "Token revoked (empty body)" } },
      },
    },
    "/oauth/userinfo": {
      get: { tags: ["OAuth 2.0"], summary: "Get OIDC userinfo", responses: { "200": { description: "User claims based on scopes" } }, security: [{ bearerAuth: [] }] },
    },
    "/.well-known/openid-configuration": {
      get: { tags: ["OIDC"], summary: "OIDC discovery document", responses: { "200": { description: "Discovery document" } } },
    },
    "/oauth/jwks": {
      get: { tags: ["OIDC"], summary: "JWKS endpoint", responses: { "200": { description: "JWK set" } } },
    },
    "/passkey/login-start": {
      post: { tags: ["Passkey"], summary: "Start passkey login", requestBody: { required: true, content: { "application/json": { schema: { type: "object", required: ["email"], properties: { email: { type: "string" } } } } } }, responses: { "200": { description: "Passkey challenge" } } },
    },
    "/passkey/login-verify": {
      post: { tags: ["Passkey"], summary: "Verify passkey assertion", responses: { "200": { description: "Tokens returned" } } },
    },
    "/storage/usage": {
      get: { tags: ["Storage"], summary: "Get storage usage and quota", responses: { "200": { description: "{ used, quota, files }" } }, security: [{ bearerAuth: [] }] },
    },
    "/storage/files": {
      get: { tags: ["Storage"], summary: "List user files", parameters: [{ name: "page", in: "query" }, { name: "limit", in: "query" }, { name: "client_id", in: "query" }], responses: { "200": {} }, security: [{ bearerAuth: [] }] },
      post: { tags: ["Storage"], summary: "Upload a file", requestBody: { required: true, content: { "multipart/form-data": { schema: { type: "object" } } } }, responses: { "201": {} }, security: [{ bearerAuth: [] }] },
    },
    "/storage/files/{id}": {
      get: { tags: ["Storage"], summary: "Get file metadata", parameters: [{ name: "id", in: "path", required: true }], responses: { "200": {} }, security: [{ bearerAuth: [] }] },
      delete: { tags: ["Storage"], summary: "Delete a file", parameters: [{ name: "id", in: "path", required: true }], responses: { "200": {} }, security: [{ bearerAuth: [] }] },
    },
    "/storage/data": {
      get: { tags: ["Storage"], summary: "Get app data", parameters: [{ name: "client_id", in: "query", required: true }, { name: "key", in: "query" }], responses: { "200": {} }, security: [{ bearerAuth: [] }] },
      post: { tags: ["Storage"], summary: "Save/upsert app data", requestBody: { required: true, content: { "application/json": { schema: { type: "object", required: ["client_id","key","value"], properties: { client_id: { type: "string" }, key: { type: "string" }, value: {} } } } } }, responses: { "200": {} }, security: [{ bearerAuth: [] }] },
      delete: { tags: ["Storage"], summary: "Delete app data", parameters: [{ name: "client_id", in: "query", required: true }, { name: "key", in: "query", required: true }], responses: { "200": {} }, security: [{ bearerAuth: [] }] },
    },
    "/admin/dashboard": {
      get: { tags: ["Admin"], summary: "Admin dashboard stats", parameters: [{ name: "range", in: "query", schema: { type: "string", enum: ["d","7d","30d"] } }], responses: { "200": {} }, security: [{ bearerAuth: [] }] },
    },
    "/admin/health": {
      get: { tags: ["Admin"], summary: "System health status", responses: { "200": {} }, security: [{ bearerAuth: [] }] },
    },
    "/admin/audit-log": {
      get: { tags: ["Admin"], summary: "View audit log", parameters: [{ name: "page", in: "query" }, { name: "limit", in: "query" }, { name: "action", in: "query" }, { name: "user_id", in: "query" }], responses: { "200": {} }, security: [{ bearerAuth: [] }] },
    },
    "/admin/feature-flags": {
      get: { tags: ["Admin"], summary: "Get feature flags", responses: { "200": {} }, security: [{ bearerAuth: [] }] },
      patch: { tags: ["Admin"], summary: "Update feature flags", responses: { "200": {} }, security: [{ bearerAuth: [] }] },
    },
    "/admin/maintenance-mode": {
      get: { tags: ["Admin"], summary: "Get maintenance mode status", responses: { "200": {} }, security: [{ bearerAuth: [] }] },
      post: { tags: ["Admin"], summary: "Toggle maintenance mode", responses: { "200": {} }, security: [{ bearerAuth: [] }] },
    },
  },
  components: {
    securitySchemes: {
      bearerAuth: { type: "http", scheme: "bearer", bearerFormat: "JWT" },
    },
  },
};

docs.get('/openapi.json', (c) => {
  return c.json(spec);
});

export default docs;
