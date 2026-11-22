import { describe, expect, it } from 'vitest'
import pkg from '../../../package.json' with { type: 'json' }
import { GET } from './+server'

describe('GET /healthz', () => {
    it('answers ok with the version from package.json', async () => {
        const response = await GET({} as Parameters<typeof GET>[0])
        expect(response.status).toBe(200)
        expect(await response.json()).toEqual({ status: 'ok', version: pkg.version })
    })
})
