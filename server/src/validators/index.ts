import { z } from 'zod';

// User registration schema
export const registerSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  name: z.string().min(2, 'Name must be at least 2 characters'),
  device_id: z.string().optional(),
  device_name: z.string().optional(),
});

// User login schema
export const loginSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(1, 'Password is required'),
  keepMeLoggedIn: z.boolean().optional(),
  device_id: z.string().optional(),
  device_name: z.string().optional(),
});

// 2FA verification schema
export const twoFactorVerifySchema = z.object({
  code: z.string().length(6, '2FA code must be 6 digits'),
});

// 2FA login schema
export const twoFactorLoginSchema = z.object({
  mfa_token: z.string().min(1, 'MFA token is required'),
  // code can be TOTP (6 digits) or a backup code (variable length)
  code: z.string().min(1, '2FA code is required'),
});

// OAuth authorization schema
export const oauthAuthorizeSchema = z.object({
  client_id: z.string().min(1, 'Client ID is required'),
  redirect_uri: z.string().url('Invalid redirect URI'),
  response_type: z.literal('code'),
  scope: z.string().optional(),
  state: z.string().optional(),
  nonce: z.string().optional(),
});

// OAuth token exchange schema
export const oauthTokenSchema = z.object({
  grant_type: z.enum(['authorization_code', 'client_credentials', 'refresh_token']),
  code: z.string().optional(),
  code_verifier: z.string().optional(),
  redirect_uri: z.string().url().optional(),
  client_id: z.string().min(1, 'Client ID is required'),
  client_secret: z.string().optional(),
  scope: z.string().optional(),
  refresh_token: z.string().optional(),
});

// OAuth consent schema
export const oauthConsentSchema = z.object({
  client_id: z.string().min(1, 'Client ID is required'),
  redirect_uri: z.string().url('Invalid redirect URI'),
  scope: z.string(),
  state: z.string().optional(),
  nonce: z.string().optional(),
  consent: z.boolean(),
  code_challenge: z.string().optional(),
  code_challenge_method: z.literal('S256').optional(),
});

export const oauthIntrospectSchema = z.object({
  token: z.string().min(1),
  client_id: z.string().optional(),
  client_secret: z.string().optional(),
});

export const oauthRevokeSchema = z.object({
  token: z.string().min(1),
  token_type_hint: z.enum(['access_token', 'refresh_token']).optional(),
  client_id: z.string().optional(),
  client_secret: z.string().optional(),
});

export const createAppSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters'),
  description: z.string().optional(),
  redirect_uris: z.array(z.string().url('Invalid redirect URI')).min(1, 'At least one redirect URI required'),
  allowed_scopes: z.array(z.string()).optional(),
});

export const updateAppSchema = z.object({
  name: z.string().min(2).optional(),
  description: z.string().optional(),
  redirect_uris: z.array(z.string().url()).optional(),
  allowed_scopes: z.array(z.string()).optional(),
});

export const adminUpdateUserSchema = z.object({
  name: z.string().min(2).optional(),
  email: z.string().email().optional(),
  role: z.enum(['user', 'admin']).optional(),
  avatar_url: z.string().nullable().optional(),
  is_active: z.boolean().optional(),
});

export const adminUpdateAppSchema = z.object({
  name: z.string().min(2).optional(),
  description: z.string().optional(),
  verification_status: z.enum(['unverified', 'verified', 'official']).optional(),
  is_active: z.boolean().optional(),
  redirect_uris: z.array(z.string()).optional(),
  allowed_scopes: z.array(z.string()).optional(),
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type OAuthAuthorizeInput = z.infer<typeof oauthAuthorizeSchema>;
export type OAuthTokenInput = z.infer<typeof oauthTokenSchema>;
export type OAuthConsentInput = z.infer<typeof oauthConsentSchema>;
export type CreateAppInput = z.infer<typeof createAppSchema>;
export type UpdateAppInput = z.infer<typeof updateAppSchema>;
