import { suggestIcon } from "./icons"

export interface TOTPAccount {
  id: string
  name: string
  issuer?: string
  icon?: string
  secret: string
  algorithm: 'SHA1' | 'SHA256' | 'SHA512'
  digits: 6 | 8
  period: 30 | 60
  createdAt: number
  updatedAt: number
}

const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567"

function base32Decode(input: string): Uint8Array {
  const normalized = input.toUpperCase().replace(/[^A-Z2-7]/g, "").replace(/=+$/, "")
  const bits = normalized.length * 5
  const bytes = Math.floor(bits / 8)
  const result = new Uint8Array(bytes)

  let bitPos = 0
  let byteIdx = 0
  let buffer = 0

  for (let i = 0; i < normalized.length; i++) {
    const val = BASE32_ALPHABET.indexOf(normalized[i])
    if (val === -1) continue

    buffer = (buffer << 5) | val
    bitPos += 5

    if (bitPos >= 8) {
      bitPos -= 8
      result[byteIdx++] = (buffer >> bitPos) & 0xff
    }
  }

  return result.slice(0, byteIdx)
}

const HMAC_ALGORITHMS: Record<string, string> = {
  SHA1: "SHA-1",
  SHA256: "SHA-256",
  SHA512: "SHA-512",
}

async function hmac(algorithm: string, key: Uint8Array, data: Uint8Array): Promise<Uint8Array> {
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    key,
    { name: "HMAC", hash: algorithm },
    false,
    ["sign"]
  )
  const signature = await crypto.subtle.sign("HMAC", cryptoKey, data)
  return new Uint8Array(signature)
}

export function createAccount(data: {
  name: string
  issuer?: string
  icon?: string
  secret: string
  algorithm?: 'SHA1' | 'SHA256' | 'SHA512'
  digits?: 6 | 8
  period?: 30 | 60
}): TOTPAccount {
  const now = Date.now()
  return {
    id: crypto.randomUUID(),
    name: data.name,
    issuer: data.issuer,
    icon: data.icon || suggestIcon(data.name, data.issuer),
    secret: data.secret.replace(/\s/g, '').toUpperCase(),
    algorithm: data.algorithm || 'SHA1',
    digits: data.digits || 6,
    period: data.period || 30,
    createdAt: now,
    updatedAt: now,
  }
}

export function parseOTPAuthURI(uri: string): Partial<TOTPAccount> {
  const url = new URL(uri)
  if (url.protocol !== 'otpauth:') throw new Error('Invalid otpauth URI')

  const label = decodeURIComponent(url.pathname.replace(/^\//, ''))
  const params = url.searchParams
  const secret = params.get('secret')
  if (!secret) throw new Error('Missing secret in URI')

  let issuer = params.get('issuer') || undefined
  let name = label
  if (!issuer && label.includes(':')) {
    const parts = label.split(':')
    issuer = parts[0]
    name = parts.slice(1).join(':')
  }

  return {
    name,
    issuer,
    secret,
    algorithm: (params.get('algorithm') as TOTPAccount['algorithm']) || 'SHA1',
    digits: (Number(params.get('digits')) as TOTPAccount['digits']) || 6,
    period: (Number(params.get('period')) as TOTPAccount['period']) || 30,
  }
}

export async function generateCode(account: TOTPAccount): Promise<string> {
  const secretBytes = base32Decode(account.secret)
  let counter = Math.floor(Date.now() / 1000 / account.period)
  const counterBytes = new Uint8Array(8)
  for (let i = 7; i >= 0; i--) {
    counterBytes[i] = counter & 0xff
    counter >>= 8
  }

  const hash = await hmac(HMAC_ALGORITHMS[account.algorithm], secretBytes, counterBytes)
  const offset = hash[hash.length - 1] & 0xf
  const binary =
    ((hash[offset] & 0x7f) << 24) |
    ((hash[offset + 1] & 0xff) << 16) |
    ((hash[offset + 2] & 0xff) << 8) |
    (hash[offset + 3] & 0xff)

  const mod = Math.pow(10, account.digits)
  return (binary % mod).toString().padStart(account.digits, "0")
}

export function getCountdown(account: TOTPAccount): { seconds: number; progress: number } {
  const epoch = Math.floor(Date.now() / 1000)
  const secondsLeft = account.period - (epoch % account.period)
  return {
    seconds: secondsLeft,
    progress: secondsLeft / account.period,
  }
}

export function getAccountLabel(account: TOTPAccount): string {
  if (account.issuer) return `${account.issuer}: ${account.name}`
  return account.name
}
