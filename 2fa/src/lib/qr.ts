let stream: MediaStream | null = null

export function stopCamera(): void {
  if (stream) {
    stream.getTracks().forEach(t => t.stop())
    stream = null
  }
}

export async function startCamera(videoElement: HTMLVideoElement): Promise<void> {
  stopCamera()
  stream = await navigator.mediaDevices.getUserMedia({
    video: { facingMode: 'environment', width: { ideal: 640 }, height: { ideal: 640 } },
    audio: false,
  })
  videoElement.srcObject = stream
  await videoElement.play()
}

export async function scanQRFromVideo(
  videoElement: HTMLVideoElement,
  jsQR: { default: (data: Uint8ClampedArray, width: number, height: number) => { data: string } | null }
): Promise<string | null> {
  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d')
  if (!ctx) return null

  canvas.width = videoElement.videoWidth
  canvas.height = videoElement.videoHeight
  ctx.drawImage(videoElement, 0, 0, canvas.width, canvas.height)
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)
  const code = jsQR.default(imageData.data, canvas.width, canvas.height)
  return code?.data || null
}

export function parseAndValidateOTPAuthURI(uri: string): string {
  const trimmed = uri.trim()
  if (!trimmed.startsWith('otpauth://totp/') && !trimmed.startsWith('otpauth://hotp/')) {
    throw new Error('Invalid otpauth URI. Must start with otpauth://totp/ or otpauth://hotp/')
  }
  const url = new URL(trimmed)
  if (!url.searchParams.get('secret')) {
    throw new Error('Missing secret parameter in URI')
  }
  return trimmed
}
