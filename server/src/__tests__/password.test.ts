import { describe, it, expect } from 'vitest'
import { checkPasswordStrength } from '../utils/password'

describe('password', () => {
  describe('checkPasswordStrength', () => {
    it('returns low score for short password', () => {
      const result = checkPasswordStrength('abc')
      expect(result.score).toBeLessThan(2)
    })

    it('returns higher score for longer password', () => {
      const result = checkPasswordStrength('MySecureP@ss123')
      expect(result.score).toBeGreaterThanOrEqual(3)
    })

    it('returns warning for short password', () => {
      const result = checkPasswordStrength('short')
      expect(result.warning).toContain('Too short')
    })

    it('gives max score for very strong password', () => {
      const result = checkPasswordStrength('MyV3ry$ecureP@ssw0rd!2024')
      expect(result.score).toBe(4)
    })
  })
})
