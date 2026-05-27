import "@testing-library/jest-dom";

const localStore = new Map<string, string>();

const localStorageMock = {
  getItem: (key: string) => localStore.get(key) ?? null,
  setItem: (key: string, value: string) => {
    localStore.set(key, value);
  },
  removeItem: (key: string) => {
    localStore.delete(key);
  },
  clear: () => {
    localStore.clear();
  },
  key: (index: number) => Array.from(localStore.keys())[index] ?? null,
  get length() {
    return localStore.size;
  },
};

Object.defineProperty(globalThis, "localStorage", {
  value: localStorageMock,
  writable: true,
});
