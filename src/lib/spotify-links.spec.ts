import { describe, expect, it } from 'vitest'
import { parseAlbumId, parseTrackIds } from './spotify-links'

const A = 'AAAAAAAAAAAAAAAAAAAAA1'
const B = 'BBBBBBBBBBBBBBBBBBBBB2'

describe('parseTrackIds', () => {
    it('finds links as the Spotify apps copy them, each once and in order', () => {
        const text = [
            `https://open.spotify.com/track/${A}`,
            `https://open.spotify.com/intl-de/track/${B}?si=abc123`,
            `spotify:track:${A}`
        ].join('\n')
        expect(parseTrackIds(text)).toEqual([A, B])
    })

    it('keeps links apart that ran into each other in a one-line field', () => {
        const text = `https://open.spotify.com/track/${A}https://open.spotify.com/track/${B}`
        expect(parseTrackIds(text)).toEqual([A, B])
    })

    it('ignores other text, albums and short IDs', () => {
        expect(parseTrackIds(`daft punk https://open.spotify.com/album/${A} track/abc`)).toEqual([])
    })
})

describe('parseAlbumId', () => {
    it('finds album links and URIs', () => {
        expect(parseAlbumId(`https://open.spotify.com/intl-de/album/${A}?si=x`)).toBe(A)
        expect(parseAlbumId(`spotify:album:${B}`)).toBe(B)
        expect(parseAlbumId(`https://open.spotify.com/artist/${B}`)).toBeNull()
        expect(parseAlbumId('daft punk')).toBeNull()
    })
})
