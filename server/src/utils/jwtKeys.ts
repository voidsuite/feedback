import { promises as fs } from 'fs';
import { join, resolve } from 'path';
import { generateKeyPairSync, createPrivateKey, createPublicKey, type KeyObject } from 'crypto';

const keyDir = resolve(process.cwd(), 'keys');
const privateKeyPath = join(keyDir, 'jwt-private.pem');
const publicKeyPath = join(keyDir, 'jwt-public.pem');

let keyPairP: Promise<{ privateKey: KeyObject; publicKey: KeyObject }> | null = null;

async function loadOrCreateKeyPair() {
  try {
    const [priv, pub] = await Promise.all([
      fs.readFile(privateKeyPath, 'utf8'),
      fs.readFile(publicKeyPath, 'utf8'),
    ]);
    return {
      privateKey: createPrivateKey(priv),
      publicKey: createPublicKey(pub),
    };
  } catch {
    const { privateKey, publicKey } = generateKeyPairSync('rsa', {
      modulusLength: 2048,
      publicKeyEncoding: { type: 'spki', format: 'pem' },
      privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    });
    await fs.mkdir(keyDir, { recursive: true });
    await fs.writeFile(privateKeyPath, privateKey, { mode: 0o600 });
    await fs.writeFile(publicKeyPath, publicKey, { mode: 0o644 });
    return {
      privateKey: createPrivateKey(privateKey),
      publicKey: createPublicKey(publicKey),
    };
  }
}

export function getKeyPair(): Promise<{ privateKey: KeyObject; publicKey: KeyObject }> {
  if (!keyPairP) keyPairP = loadOrCreateKeyPair();
  return keyPairP;
}

function b64url(input: Buffer | Uint8Array | string): string {
  return Buffer.from(input as any).toString('base64url');
}

export async function getPublicKeyJWK(): Promise<{ keys: any[] }> {
  const { publicKey } = await getKeyPair();
  const jwk = publicKey.export({ format: 'jwk' }) as { kty: string; n: string; e: string };
  return {
    keys: [
      {
        kty: 'RSA',
        use: 'sig',
        alg: 'RS256',
        kid: 'voidauth-rs256-1',
        n: jwk.n,
        e: jwk.e,
      },
    ],
  };
}
