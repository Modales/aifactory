/**
 * Device detection. Every device can open both the story website and the full app;
 * this only tailors copy such as the home-screen install steps.
 */
export type DeviceClass = 'phone' | 'tablet' | 'desktop'

export interface Surface {
  device: DeviceClass
  /** Running as an installed app (home-screen / standalone window). */
  standalone: boolean
  isIOS: boolean
}

export function classifyDevice(userAgent: string, maxTouchPoints = 0): DeviceClass {
  if (/iPad|Tablet|PlayBook|Silk|Kindle/i.test(userAgent)) return 'tablet'
  // iPadOS Safari reports a Mac user agent; real Macs have no touch points.
  if (/Macintosh/i.test(userAgent) && maxTouchPoints > 1) return 'tablet'
  if (/Android/i.test(userAgent) && !/Mobile/i.test(userAgent)) return 'tablet'
  if (/iPhone|iPod|Android|Mobile|IEMobile|Opera Mini|BlackBerry/i.test(userAgent)) return 'phone'
  return 'desktop'
}

export function resolveSurface(device: DeviceClass, standalone: boolean, isIOS = false): Surface {
  return { device, standalone, isIOS }
}

const OVERRIDE_KEY = 'formfit:surface-override'

/** Dev-only `?device=phone|tablet|desktop&standalone=1|0`, remembered for the tab, to preview each surface. */
function readDevOverride(): { device?: DeviceClass; standalone?: boolean } {
  if (!import.meta.env.DEV) return {}
  const params = new URLSearchParams(window.location.search)
  const device = params.get('device')
  const standalone = params.get('standalone')
  if (device || standalone) {
    const next = {
      ...(device === 'phone' || device === 'tablet' || device === 'desktop' ? { device: device as DeviceClass } : {}),
      ...(standalone === '1' || standalone === '0' ? { standalone: standalone === '1' } : {}),
    }
    sessionStorage.setItem(OVERRIDE_KEY, JSON.stringify(next))
    return next
  }
  try {
    return JSON.parse(sessionStorage.getItem(OVERRIDE_KEY) ?? '{}')
  } catch {
    return {}
  }
}

let detected: { device: DeviceClass; standalone: boolean; isIOS: boolean } | null = null

export function getSurface(): Surface {
  if (!detected) detected = detect()
  const override = readDevOverride()
  return resolveSurface(override.device ?? detected.device, override.standalone ?? detected.standalone, detected.isIOS)
}

function detect() {
  const nav = window.navigator as Navigator & { standalone?: boolean }
  const ua = nav.userAgent
  const touch = nav.maxTouchPoints ?? 0
  const detectedStandalone =
    window.matchMedia('(display-mode: standalone)').matches ||
    window.matchMedia('(display-mode: fullscreen)').matches ||
    nav.standalone === true
  const isIOS = /iPhone|iPad|iPod/i.test(ua) || (/Macintosh/i.test(ua) && touch > 1)
  return { device: classifyDevice(ua, touch), standalone: detectedStandalone, isIOS }
}
