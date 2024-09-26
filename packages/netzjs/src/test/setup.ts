import { beforeAll, vi } from 'vitest'

beforeAll(() => {
  vi.mock('../errors/error-utils.ts', () => ({
    getVersion: vi.fn().mockReturnValue('@folktizen/netzjs@1.0.0-mock.0'),
  }))
})
