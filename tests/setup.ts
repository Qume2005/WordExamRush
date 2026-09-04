import { beforeEach } from 'vitest'

const storageMap = new Map<string, string>()

function createStorage(map: Map<string, string>) {
  return {
    getItem(key: string) {
      return map.has(key) ? map.get(key)! : null
    },
    setItem(key: string, value: string) {
      map.set(key, value)
    },
    removeItem(key: string) {
      map.delete(key)
    },
    key(index: number) {
      const keys = Array.from(map.keys())
      return keys[index] ?? null
    },
    get length() {
      return map.size
    },
    clear() {
      map.clear()
    },
  }
}

globalThis.localStorage = createStorage(storageMap) as any
globalThis.sessionStorage = createStorage(new Map<string, string>()) as any
globalThis.location = { origin: 'https://test.local/' } as any

beforeEach(() => {
  storageMap.clear()
})
