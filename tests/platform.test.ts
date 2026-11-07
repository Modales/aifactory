import { describe, expect, it } from 'vitest'
import { classifyDevice } from '../src/lib/platform'

const UA = {
  iphone: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',
  android: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36',
  androidTablet: 'Mozilla/5.0 (Linux; Android 14; SM-X910) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36',
  mac: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_6) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15',
  windows: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36',
}

describe('classifyDevice', () => {
  it('detects phones, tablets and desktops', () => {
    expect(classifyDevice(UA.iphone)).toBe('phone')
    expect(classifyDevice(UA.android)).toBe('phone')
    expect(classifyDevice(UA.androidTablet)).toBe('tablet')
    expect(classifyDevice(UA.mac, 0)).toBe('desktop')
    expect(classifyDevice(UA.windows)).toBe('desktop')
  })

  it('treats iPadOS (Mac user agent with touch) as a tablet', () => {
    expect(classifyDevice(UA.mac, 5)).toBe('tablet')
  })
})
