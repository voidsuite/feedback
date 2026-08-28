import { describe, it, expect } from 'vitest'
import { formatLocation } from '../utils/geo'

describe('geo', () => {
  describe('formatLocation', () => {
    it('formats city and country', () => {
      const result = formatLocation({
        city: 'Berlin',
        region: null,
        country: 'Germany',
        countryCode: 'DE',
        timezone: null,
      })
      expect(result).toBe('Berlin, Germany')
    })

    it('formats city, region, and country', () => {
      const result = formatLocation({
        city: 'San Francisco',
        region: 'California',
        country: 'United States',
        countryCode: 'US',
        timezone: null,
      })
      expect(result).toBe('San Francisco, California, United States')
    })

    it('returns Unknown location for empty data', () => {
      const result = formatLocation({
        city: null,
        region: null,
        country: null,
        countryCode: null,
        timezone: null,
      })
      expect(result).toBe('Unknown location')
    })

    it('returns Local for local IP', () => {
      const result = formatLocation({
        city: 'Local',
        region: null,
        country: null,
        countryCode: null,
        timezone: null,
      })
      expect(result).toBe('Local')
    })
  })
})
