export class MockStorage {
  constructor(initialEntries = null) {
    this.store = new Map(initialEntries || [])
    return new Proxy(this, {
      ownKeys: () => [...this.store.keys()],
      getOwnPropertyDescriptor: (_target, prop) => {
        return {
          enumerable: true,
          configurable: true,
          value: this.store.get(prop)
        }
      }
    })
  }

  getItem(key) {
    return this.store.get(key) || null
  }

  setItem(key, value) {
    this.store.set(key, value)
  }

  removeItem(key) {
    this.store.delete(key)
  }

  get length() {
    return this.store.size
  }

  key(index) {
    return Array.from(this.store.keys())[index]
  }

  clear() {
    this.store.clear()
  }
}
