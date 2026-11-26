/**
 * The parts of Spotify's Web API crowd-dj uses: the catalog (search, tracks, albums and an artist's
 * albums) and the player (state, devices, play, queue, skip). Pure HTTP with the token of a
 * connected account; caching is the job of `catalog.ts`, deciding what plays that of `engine.ts`.
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

/** What a playing account is doing, from `GET /me/player`. */
export interface PlayerState {
    /** The device it plays on; null when Spotify names none. */
    device: { id: string | null; name: string } | null
    isPlaying: boolean
    /** The track that is loaded; null for nothing, an episode, an ad or a local file. */
    trackId: string | null
    progressMs: number
    durationMs: number
}

/** A device the account can play on (`GET /me/player/devices`). */
export interface PlayerDevice {
    /** Null for devices that cannot be controlled through the API. */
    id: string | null
    name: string
    type: string
    isActive: boolean
    isRestricted: boolean
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
interface PlayerJson {
    device?: { id: string | null; name: string } | null
    is_playing: boolean
    progress_ms: number | null
    item?: TrackJson | null
}
interface DeviceJson {
    id: string | null
    name: string
    type: string
    is_active: boolean
    is_restricted: boolean
}
interface Page<T> {
    items: (T | null)[]
    next: string | null
}
interface PlaylistItemJson {
    added_at?: string | null
    added_by?: { id?: string | null } | null
    /** Called `track` before February 2026; read both. */
    item?: TrackJson | null
    track?: TrackJson | null
}

/** A track in a playlist, with who added it and when. */
export interface PlaylistEntry {
    track: SpotifyTrack
    /** Spotify user ID; null when Spotify does not say (very old playlists). */
    addedBy: string | null
    addedAt: Date
}

/** Items of a playlist come in pages of at most 50. */
export const PLAYLIST_ITEMS_LIMIT = 50
/** Tracks removed from a playlist in one request at most. */
export const PLAYLIST_REMOVE_LIMIT = 100

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

    /** A request with the account's token. A 401 gets one retry with a fresh token. */
    async function request(
        method: 'GET' | 'PUT' | 'POST' | 'DELETE',
        accountId: string,
        path: string,
        body?: unknown,
        retry = true
    ): Promise<Response> {
        if (Date.now() < pausedUntil)
            throw new SpotifyError('Spotify asked to wait (rate limit)', 429)
        const response = await fetchFn(`${API}${path}`, {
            method,
            headers: {
                authorization: `Bearer ${await tokens.accessToken(accountId)}`,
                ...(body !== undefined && { 'content-type': 'application/json' })
            },
            body: body === undefined ? undefined : JSON.stringify(body),
            signal: AbortSignal.timeout(TIMEOUT_MS)
        })
        if (response.status === 401 && retry) {
            await tokens.invalidateAccessToken(accountId)
            return request(method, accountId, path, body, false)
        }
        if (response.status === 429) {
            const seconds = Number(response.headers.get('retry-after')) || RETRY_AFTER_DEFAULT_S
            pausedUntil = Date.now() + Math.min(seconds, 3600) * 1000
        }
        return response
    }

    // The path holds only IDs and the search query, never a token
    const failed = (method: string, path: string, response: Response) =>
        new SpotifyError(
            `Spotify ${method} ${path.split('?')[0]} failed: ${response.status}`,
            response.status
        )

    /** GET with the account's token; null for 404. */
    async function get<T>(accountId: string, path: string): Promise<T | null> {
        const response = await request('GET', accountId, path)
        // A malformed ID gets 400 "invalid id": as unknown as one that does not exist
        if (response.status === 404 || response.status === 400) return null
        if (!response.ok) throw failed('GET', path, response)
        return (await response.json()) as T
    }

    /**
     * A player command. Spotify answers 404 when the account has no active device (or the device
     * asked for is gone), 403 when it may not be controlled (no Premium, or a restricted device).
     */
    async function command(
        method: 'PUT' | 'POST',
        accountId: string,
        path: string,
        body?: unknown
    ) {
        const response = await request(method, accountId, path, body)
        await response.body?.cancel()
        if (!response.ok) throw failed(method, path, response)
    }

    const trackUri = (trackId: string) => {
        if (!SPOTIFY_ID.test(trackId)) throw new Error('Not a Spotify track ID')
        return `spotify:track:${trackId}`
    }
    const deviceParam = (deviceId: string | undefined) =>
        deviceId ? `device_id=${encodeURIComponent(deviceId)}` : ''

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
        },

        /** What the account plays; null when it has no active device. */
        async playerState(accountId: string): Promise<PlayerState | null> {
            const path = '/me/player'
            const response = await request('GET', accountId, path)
            if (response.status === 204) return null
            if (!response.ok) throw failed('GET', path, response)
            const json = (await response.json()) as PlayerJson | null
            if (!json) return null
            const item = json.item && toTrack(json.item)
            return {
                device: json.device ? { id: json.device.id, name: json.device.name } : null,
                isPlaying: json.is_playing,
                trackId: item?.id ?? null,
                progressMs: json.progress_ms ?? 0,
                durationMs: item?.durationMs ?? 0
            }
        },

        /** The devices the account can play on. */
        async devices(accountId: string): Promise<PlayerDevice[]> {
            const json = await get<{ devices: DeviceJson[] }>(accountId, '/me/player/devices')
            return (json?.devices ?? []).map((device) => ({
                id: device.id,
                name: device.name,
                type: device.type,
                isActive: device.is_active,
                isRestricted: device.is_restricted
            }))
        },

        /** The tracks in Spotify's queue, after the one that plays (episodes left out). */
        async userQueue(accountId: string): Promise<string[]> {
            const json = await get<{ queue?: (TrackJson | null)[] }>(accountId, '/me/player/queue')
            return (json?.queue ?? []).flatMap((item) => toTrack(item)?.id ?? [])
        },

        /** Plays a track right away, on the given device or the active one. */
        async play(accountId: string, trackId: string, deviceId?: string) {
            const query = deviceParam(deviceId)
            await command('PUT', accountId, `/me/player/play${query && '?' + query}`, {
                uris: [trackUri(trackId)]
            })
        },

        /** Moves playback to another device; `play` starts it there, else it keeps its state. */
        async transfer(accountId: string, deviceId: string, play: boolean) {
            await command('PUT', accountId, '/me/player', { device_ids: [deviceId], play })
        },

        /** Appends a track to Spotify's queue, after what is playing and queued already. */
        async queue(accountId: string, trackId: string) {
            const params = new URLSearchParams({ uri: trackUri(trackId) })
            await command('POST', accountId, `/me/player/queue?${params}`)
        },

        /** Skips to the next track in Spotify's queue. */
        async next(accountId: string) {
            await command('POST', accountId, '/me/player/next')
        },

        /** Creates a private, collaborative playlist of the account; returns its ID. */
        async createPlaylist(accountId: string, name: string, description: string) {
            const path = '/me/playlists'
            const response = await request('POST', accountId, path, {
                name,
                description,
                public: false,
                collaborative: true
            })
            if (!response.ok) throw failed('POST', path, response)
            const json = (await response.json()) as { id?: unknown }
            if (typeof json.id !== 'string' || !SPOTIFY_ID.test(json.id))
                throw new SpotifyError('Spotify sent no playlist ID', 502)
            return json.id
        },

        /** The playlist's current version; null when it does not exist (any more). */
        async playlistSnapshot(accountId: string, playlistId: string): Promise<string | null> {
            if (!SPOTIFY_ID.test(playlistId)) return null
            const json = await get<{ snapshot_id?: string }>(
                accountId,
                `/playlists/${playlistId}?fields=snapshot_id`
            )
            return json?.snapshot_id ?? null
        },

        /**
         * A page of a playlist's items: its tracks with who added them and when (episodes and local
         * files left out). Null when the playlist does not exist (any more). Spotify returns items only for playlists the account owns or
         * collaborates on.
         */
        async playlistItems(
            accountId: string,
            playlistId: string,
            offset = 0
        ): Promise<{ items: PlaylistEntry[]; next: number | null } | null> {
            if (!SPOTIFY_ID.test(playlistId)) return null
            const params = new URLSearchParams({
                limit: String(PLAYLIST_ITEMS_LIMIT),
                offset: String(offset)
            })
            const json = await get<Page<PlaylistItemJson>>(
                accountId,
                `/playlists/${playlistId}/items?${params}`
            )
            if (!json) return null
            const items = json.items.flatMap((entry) => {
                const track = toTrack(entry?.item ?? entry?.track ?? null)
                if (!track) return []
                const addedBy = entry?.added_by?.id || null
                const addedAt = Date.parse(entry?.added_at ?? '')
                return [{ track, addedBy, addedAt: new Date(Number.isNaN(addedAt) ? 0 : addedAt) }]
            })
            return { items, next: json.next ? offset + PLAYLIST_ITEMS_LIMIT : null }
        },

        /**
         * Removes these tracks from a playlist (at most `PLAYLIST_REMOVE_LIMIT`), every time they
         * occur in it: Spotify takes no positions. Returns the playlist's new version.
         */
        async removeFromPlaylist(accountId: string, playlistId: string, trackIds: string[]) {
            if (!SPOTIFY_ID.test(playlistId)) throw new Error('Not a Spotify playlist ID')
            if (trackIds.length > PLAYLIST_REMOVE_LIMIT) throw new Error('Too many tracks')
            const path = `/playlists/${playlistId}/items`
            const response = await request('DELETE', accountId, path, {
                items: trackIds.map((id) => ({ uri: trackUri(id) }))
            })
            if (!response.ok) throw failed('DELETE', path, response)
            const json = (await response.json().catch(() => ({}))) as { snapshot_id?: string }
            return json.snapshot_id ?? null
        }
    }
}

export type SpotifyApi = ReturnType<typeof createSpotifyApi>
