import { describe, expect, it } from 'vitest'
import { classifyUrl } from '../src/engine/connectionCounter'

const OWN = 'https://app.example.com'

describe('classifyUrl (Requirements 14.1, 14.9)', () => {
  it('same-origin absolute URL', () => {
    expect(classifyUrl('https://app.example.com/assets/index.js', OWN)).toBe('same-origin')
  })

  it('cross-origin URL is external', () => {
    expect(classifyUrl('https://evil.example.org/track', OWN)).toBe('external')
  })

  it('data: URL is inline', () => {
    expect(classifyUrl('data:image/png;base64,AAAA', OWN)).toBe('inline')
  })

  it('blob: URL is inline', () => {
    expect(classifyUrl('blob:https://app.example.com/1234-abcd', OWN)).toBe('inline')
  })

  it('relative URL resolves to same-origin', () => {
    expect(classifyUrl('/assets/logo.svg', OWN)).toBe('same-origin')
  })

  it('unparseable URL', () => {
    expect(classifyUrl('http://', OWN)).toBe('unparseable')
  })

  it('different port is external', () => {
    expect(classifyUrl('https://app.example.com:8443/x', OWN)).toBe('external')
  })

  it('different scheme is external', () => {
    expect(classifyUrl('http://app.example.com/x', OWN)).toBe('external')
  })

  it('ws: URL is external', () => {
    expect(classifyUrl('ws://app.example.com/socket', OWN)).toBe('external')
  })
})
