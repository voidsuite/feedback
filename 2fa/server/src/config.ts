const config = {
  port: parseInt(process.env.PORT || "3002"),
  voidauthUrl: process.env.VOIDAUTH_URL || "http://localhost:3001",
  clientId: process.env.AUTHIOV_CLIENT_ID || "authiov",
  // No hardcoded fallback: the secret must come from the environment and match
  // the oauth_clients row in the VoidAuth database.
  clientSecret: process.env.AUTHIOV_CLIENT_SECRET || "",
  appUrl: process.env.APP_URL || "http://localhost:5174",
}

export default config
