import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest'
import { createSpotifyApi } from './api'

const ID = (n: number) => `${'a'.repeat(21)}${n}`

function json(body: unknown, status = 200) {
    return new Response(JSON.stringify(body), {
        status,
        headers: { 'content-type': 'application/json' }
    })
}

const album = {
    id: ID(9),
    name: 'Album',
    artists: [{ id: ID(8), name: 'Band' }],
    images: [
        { url: 'large', width: 640 },
        { url: 'small', width: 64 },
        { url: 'medium', width: 300 }
    ],
    release_date: '1999-05-01'
}
const trackJson = (n: number) => ({
    id: ID(n),
    name: `Track ${n}`,
    artists: [{ id: ID(8), name: 'Band' }],
    album,
    duration_ms: 200_000
})

let fetchMock: ReturnType<typeof vi.fn>
let tokens: {
    accessToken: Mock<(accountId: string) => Promise<string>>
    invalidateAccessToken: Mock<(accountId: string) => Promise<void>>
}
let api: ReturnType<typeof createSpotifyApi>

beforeEach(() => {
    fetchMock = vi.fn()
    tokens = {
        accessToken: vi.fn().mockResolvedValue('token'),
        invalidateAccessToken: vi.fn().mockResolvedValue(undefined)
    }
    api = createSpotifyApi({ tokens, fetch: fetchMock as typeof fetch })
})

describe('spotify api', () => {
    it('searches tracks, albums and artists in one request and leaves out local files', async () => {
        fetchMock.mockResolvedValue(
            json({
                tracks: { items: [trackJson(1), { ...trackJson(2), is_local: true }, null] },
                albums: { items: [album] },
                artists: { items: [{ id: ID(8), name: 'Band', images: [] }] }
            })
        )
        const result = await api.search('host', 'band & co')
        const url = new URL(fetchMock.mock.calls[0][0])
        expect(url.pathname).toBe('/v1/search')
        expect(url.searchParams.get('q')).toBe('band & co')
        expect(url.searchParams.get('limit')).toBe('10')
        expect(fetchMock.mock.calls[0][1].headers.authorization).toBe('Bearer token')
        expect(result.tracks).toEqual([
            {
                id: ID(1),
                title: 'Track 1',
                artists: ['Band'],
                album: 'Album',
                coverUrl: 'medium',
                durationMs: 200_000
            }
        ])
        expect(result.albums[0]).toMatchObject({ name: 'Album', year: '1999', coverUrl: 'medium' })
        expect(result.artists).toEqual([{ id: ID(8), name: 'Band', imageUrl: null }])
    })

    it('retries once with a fresh token after a 401', async () => {
        fetchMock.mockResolvedValueOnce(json({}, 401)).mockResolvedValueOnce(json(trackJson(1)))
        expect((await api.track('host', ID(1)))?.title).toBe('Track 1')
        expect(tokens.invalidateAccessToken).toHaveBeenCalledWith('host')
        expect(fetchMock).toHaveBeenCalledTimes(2)
    })

    it('treats unknown and malformed IDs as not found and other failures as errors', async () => {
        fetchMock.mockResolvedValueOnce(json({}, 404))
        expect(await api.track('host', ID(1))).toBeNull()
        expect(await api.track('host', '../me')).toBeNull()
        expect(fetchMock).toHaveBeenCalledTimes(1)
        // An account that is not on the app's allowlist
        fetchMock.mockResolvedValueOnce(json({}, 403))
        await expect(api.track('host', ID(1))).rejects.toMatchObject({ status: 403 })
        fetchMock.mockResolvedValueOnce(json({}, 429))
        await expect(api.track('host', ID(1))).rejects.toMatchObject({ status: 429 })
    })

    it('pages through the tracks of a long album', async () => {
        const first = Array.from({ length: 50 }, (_, i) => ({
            ...trackJson(i % 10),
            album: undefined
        }))
        fetchMock
            .mockResolvedValueOnce(json({ ...album, tracks: { items: first, next: 'more' } }))
            .mockResolvedValueOnce(
                json({ items: [{ ...trackJson(1), album: undefined }], next: null })
            )
        const found = await api.album('host', album.id)
        expect(found?.tracks).toHaveLength(51)
        expect(found?.tracks[0]).toMatchObject({ album: 'Album', coverUrl: 'medium' })
        expect(new URL(fetchMock.mock.calls[1][0]).searchParams.get('offset')).toBe('50')
    })

    it('leaves Spotify alone for as long as a 429 asks', async () => {
        vi.useFakeTimers()
        try {
            fetchMock.mockResolvedValueOnce(
                new Response('{}', { status: 429, headers: { 'retry-after': '5' } })
            )
            await expect(api.track('host', ID(1))).rejects.toMatchObject({ status: 429 })
            await expect(api.search('other', 'x')).rejects.toMatchObject({ status: 429 })
            expect(fetchMock).toHaveBeenCalledTimes(1)
            vi.advanceTimersByTime(5000)
            fetchMock.mockResolvedValueOnce(json(trackJson(1)))
            expect(await api.track('host', ID(1))).not.toBeNull()
        } finally {
            vi.useRealTimers()
        }
    })

    it('stops paging an album at an empty page', async () => {
        fetchMock
            .mockResolvedValueOnce(
                json({ ...album, tracks: { items: [trackJson(1)], next: 'more' } })
            )
            .mockResolvedValue(json({ items: [], next: 'more' }))
        expect((await api.album('host', album.id))?.tracks).toHaveLength(1)
        expect(fetchMock).toHaveBeenCalledTimes(2)
    })

    it('pages through an artist`s albums', async () => {
        fetchMock.mockResolvedValueOnce(json({ items: [album], next: 'more' }))
        expect(await api.artistAlbums('host', ID(8), 10)).toMatchObject({ next: 20 })
        expect(new URL(fetchMock.mock.calls[0][0]).searchParams.get('offset')).toBe('10')
    })

    it('reads the player and knows when nothing is active', async () => {
        fetchMock.mockResolvedValueOnce(new Response(null, { status: 204 }))
        expect(await api.playerState('host')).toBeNull()
        fetchMock.mockResolvedValueOnce(
            json({
                device: { id: 'd1', name: 'Speaker' },
                is_playing: true,
                progress_ms: 1000,
                item: trackJson(1)
            })
        )
        expect(await api.playerState('host')).toEqual({
            device: { id: 'd1', name: 'Speaker' },
            isPlaying: true,
            trackId: ID(1),
            progressMs: 1000,
            durationMs: 200_000
        })
        // An episode plays: no track
        fetchMock.mockResolvedValueOnce(
            json({ device: null, is_playing: true, progress_ms: 5, item: null })
        )
        expect(await api.playerState('host')).toMatchObject({ trackId: null, device: null })
    })

    it('plays, queues and moves playback, and reports a missing device', async () => {
        fetchMock.mockImplementation(async () => new Response(null, { status: 204 }))
        await api.play('host', ID(1), 'device 1')
        let [url, init] = fetchMock.mock.calls[0]
        expect(init.method).toBe('PUT')
        expect(new URL(url).searchParams.get('device_id')).toBe('device 1')
        expect(JSON.parse(init.body)).toEqual({ uris: [`spotify:track:${ID(1)}`] })
        await api.queue('host', ID(2))
        ;[url, init] = fetchMock.mock.calls[1]
        expect(init.method).toBe('POST')
        expect(new URL(url).searchParams.get('uri')).toBe(`spotify:track:${ID(2)}`)
        await api.transfer('host', 'd2', false)
        expect(JSON.parse(fetchMock.mock.calls[2][1].body)).toEqual({
            device_ids: ['d2'],
            play: false
        })
        await expect(api.queue('host', '../me')).rejects.toThrow()

        fetchMock.mockImplementation(async () => json({ error: { status: 404 } }, 404))
        await expect(api.next('host')).rejects.toMatchObject({ status: 404 })
    })
})
