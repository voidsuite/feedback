import { describe, it, expect } from 'vitest'
import { hashPassword, verifyPassword, generateSecureToken } from '../utils/crypto'

describe('crypto', () => {
  describe('hashPassword', () => {
    it('hashes a password', async () => {
      const hash = await hashPassword('test-password')
      expect(hash).toBeTruthy()
      expect(hash).not.toBe('test-password')
      expect(hash.length).toBeGreaterThan(0)
    })

    it('produces different hashes for same input', async () => {
      const hash1 = await hashPassword('test-password')
      const hash2 = await hashPassword('test-password')
      // bcrypt produces different salts each time
      expect(hash1).not.toBe(hash2)
    })
  })

  describe('verifyPassword', () => {
    it('verifies correct password', async () => {
      const hash = await hashPassword('correct-password')
      const result = await verifyPassword('correct-password', hash)
      expect(result).toBe(true)
    })

    it('rejects incorrect password', async () => {
      const hash = await hashPassword('correct-password')
      const result = await verifyPassword('wrong-password', hash)
      expect(result).toBe(false)
    })
  })

  describe('generateSecureToken', () => {
    it('generates token of specified length', () => {
      const token = generateSecureToken(32)
      expect(token.length).toBe(32)
    })

    it('generates token with default length', () => {
      const token = generateSecureToken()
      expect(token.length).toBe(32)
    })

    it('generates unique tokens', () => {
      const token1 = generateSecureToken()
      const token2 = generateSecureToken()
      expect(token1).not.toBe(token2)
    })

    it('generates alphanumeric tokens', () => {
      const token = generateSecureToken(64)
      expect(token).toMatch(/^[A-Za-z0-9]+$/)
    })
  })
})
