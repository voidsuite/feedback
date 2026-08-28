let currentPin: string | null = null

export function setPin(pin: string): void {
  currentPin = pin
}

export function getPin(): string | null {
  return currentPin
}

export function clearPin(): void {
  currentPin = null
}
