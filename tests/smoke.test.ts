import { describe, it, expect } from 'vitest'

describe('smoke', () => {
  it('localStorage 写入后可以读出', () => {
    localStorage.setItem('k', 'v')
    expect(localStorage.getItem('k')).toBe('v')
  })
})
