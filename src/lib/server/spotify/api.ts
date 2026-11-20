/**
 * The catalog part of Spotify's Web API: search, tracks, albums and an artist's albums. Pure HTTP
 * with the token of a connected account; caching is the job of `catalog.ts`.
 */
import { SpotifyError } from './oauth'

const API = 'https://api.spotify.com/v1'
/** Search returns at most 10 items per type since February 2026. */
export const SEARCH_LIMIT = 10
/** An artist's albums come in pages of at most 10. */
export const ARTIST_ALBUMS_LIMIT = 10
/** An album's tracks come in pages of at most 50. */
const ALBUM_TRACKS_LIMIT = 50
/** Albums with more tracks than this are cut off (box sets); as many as can be added at once. */
export const ALBUM_TRACKS_MAX = 100
const TIMEOUT_MS = 10 * 1000
/** How long to leave Spotify alone after a 429 that did not say. */
const RETRY_AFTER_DEFAULT_S = 30

export interface SpotifyTrack {
    id: string
    title: string
    artists: string[]
    album: string
    coverUrl: string | null
    durationMs: number
}

export interface SpotifyAlbum {
    id: string
    name: string
    artists: string[]
    coverUrl: string | null
    /** Year of release, if Spotify knows it. */
    year: string | null
}

export interface SpotifyArtist {
    id: string
    name: string
    imageUrl: string | null
}

/** Where the API gets the access tokens of connected accounts (`accounts.ts`). */
export interface TokenSource {
    accessToken(accountId: string): Promise<string>
    invalidateAccessToken(accountId: string): Promise<void>
}

interface ImageJson {
    url: string
    width?: number | null
}
interface ArtistJson {
    id: string
    name: string
    images?: ImageJson[]
}
interface AlbumJson {
    id: string
    name: string
    artists?: ArtistJson[]
    images?: ImageJson[]
    release_date?: string
}
interface TrackJson {
    id: string | null
    name: string
    artists?: ArtistJson[]
    album?: AlbumJson
    duration_ms: number
    is_local?: boolean
    type?: string
}
interface Page<T> {
    items: (T | null)[]
    next: string | null
}

/** Spotify IDs are 22 characters of base 62. */
export const SPOTIFY_ID = /^[0-9A-Za-z]{22}$/

/** An image that stays sharp at 128 CSS pixels on a high-density screen, else the largest. */
function pickImage(images: ImageJson[] | undefined): string | null {
    const sorted = [...(images ?? [])].sort((a, b) => (a.width ?? 0) - (b.width ?? 0))
    return (sorted.find((image) => (image.width ?? 0) >= 256) ?? sorted.at(-1))?.url ?? null
}

const names = (artists: ArtistJson[] | undefined) => (artists ?? []).map((artist) => artist.name)

function toAlbum(json: AlbumJson): SpotifyAlbum {
    return {
        id: json.id,
        name: json.name,
        artists: names(json.artists),
        coverUrl: pickImage(json.images),
        year: json.release_date?.slice(0, 4) || null
    }
}

/** A playable Spotify track; local files and episodes are left out. */
function toTrack(json: TrackJson | null, album?: AlbumJson): SpotifyTrack | null {
    if (!json?.id || json.is_local || (json.type && json.type !== 'track')) return null
    const from = album ?? json.album
    return {
        id: json.id,
        title: json.name,
        artists: names(json.artists),
        album: from?.name ?? '',
        coverUrl: pickImage(from?.images),
        durationMs: json.duration_ms
    }
}

const present = <T>(value: T | null): value is T => value !== null

export function createSpotifyApi({
    tokens,
    fetch: fetchFn = fetch
}: {
    tokens: TokenSource
    fetch?: typeof fetch
}) {
    /**
     * Until when Spotify asked to be left alone (429 with Retry-After). Its rate limit counts per app,
     * so every call waits, whichever account it is for.
     */
    let pausedUntil = 0

    /** GET with the account's token; null for 404. A 401 gets one retry with a fresh token. */
    async function get<T>(accountId: string, path: string, retry = true): Promise<T | null> {
        if (Date.now() < pausedUntil)
            throw new SpotifyError('Spotify asked to wait (rate limit)', 429)
        const response = await fetchFn(`${API}${path}`, {
            headers: { authorization: `Bearer ${await tokens.accessToken(accountId)}` },
            signal: AbortSignal.timeout(TIMEOUT_MS)
        })
        if (response.status === 401 && retry) {
            await tokens.invalidateAccessToken(accountId)
            return get(accountId, path, false)
        }
        if (response.status === 429) {
            const seconds = Number(response.headers.get('retry-after')) || RETRY_AFTER_DEFAULT_S
            pausedUntil = Date.now() + Math.min(seconds, 3600) * 1000
        }
        // A malformed ID gets 400 "invalid id": as unknown as one that does not exist
        if (response.status === 404 || response.status === 400) return null
        // The path holds only IDs and the search query, never a token
        if (!response.ok)
            throw new SpotifyError(
                `Spotify GET ${path.split('?')[0]} failed: ${response.status}`,
                response.status
            )
        return (await response.json()) as T
    }

    return {
        /** Up to 10 tracks, albums and artists for a query, in one request. */
        async search(accountId: string, query: string) {
            const params = new URLSearchParams({
                q: query,
                type: 'track,album,artist',
                limit: String(SEARCH_LIMIT)
            })
            const json = await get<{
                tracks?: Page<TrackJson>
                albums?: Page<AlbumJson>
                artists?: Page<ArtistJson>
            }>(accountId, `/search?${params}`)
            return {
                tracks: (json?.tracks?.items ?? []).map((item) => toTrack(item)).filter(present),
                albums: (json?.albums?.items ?? []).filter(present).map(toAlbum),
                artists: (json?.artists?.items ?? []).filter(present).map((artist) => ({
                    id: artist.id,
                    name: artist.name,
                    imageUrl: pickImage(artist.images)
                }))
            }
        },

        async track(accountId: string, trackId: string): Promise<SpotifyTrack | null> {
            if (!SPOTIFY_ID.test(trackId)) return null
            return toTrack(await get<TrackJson>(accountId, `/tracks/${trackId}`))
        },

        /** An album with its tracks (up to 100). */
        async album(
            accountId: string,
            albumId: string
        ): Promise<{ album: SpotifyAlbum; tracks: SpotifyTrack[] } | null> {
            if (!SPOTIFY_ID.test(albumId)) return null
            const json = await get<AlbumJson & { tracks: Page<TrackJson> }>(
                accountId,
                `/albums/${albumId}`
            )
            if (!json) return null
            const items = [...json.tracks.items]
            let next = json.tracks.next
            while (next && items.length < ALBUM_TRACKS_MAX) {
                const params = new URLSearchParams({
                    limit: String(ALBUM_TRACKS_LIMIT),
                    offset: String(items.length)
                })
                const page = await get<Page<TrackJson>>(
                    accountId,
                    `/albums/${albumId}/tracks?${params}`
                )
                if (!page || page.items.length === 0) break
                items.push(...page.items)
                next = page.next
            }
            return {
                album: toAlbum(json),
                tracks: items
                    .slice(0, ALBUM_TRACKS_MAX)
                    .map((item) => toTrack(item, json))
                    .filter(present)
            }
        },

        /** A page of an artist's albums, singles and compilations, newest first as Spotify sorts them. */
        async artistAlbums(
            accountId: string,
            artistId: string,
            offset = 0
        ): Promise<{ albums: SpotifyAlbum[]; next: number | null } | null> {
            if (!SPOTIFY_ID.test(artistId)) return null
            const params = new URLSearchParams({
                include_groups: 'album,single,compilation',
                limit: String(ARTIST_ALBUMS_LIMIT),
                offset: String(offset)
            })
            const json = await get<Page<AlbumJson>>(
                accountId,
                `/artists/${artistId}/albums?${params}`
            )
            if (!json) return null
            const albums = json.items.filter(present).map(toAlbum)
            return { albums, next: json.next ? offset + ARTIST_ALBUMS_LIMIT : null }
        }
    }
}

export type SpotifyApi = ReturnType<typeof createSpotifyApi>
