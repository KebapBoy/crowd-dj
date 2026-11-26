import { inArray, sql } from 'drizzle-orm'
import type { Database } from './db/open'
import { track, type Track } from './db/schema'
import {
    SPOTIFY_ID,
    type SpotifyAlbum,
    type SpotifyApi,
    type SpotifyArtist,
    type SpotifyTrack
} from './spotify/api'

/** How long search results, albums and pages of an artist's albums are reused. */
const BROWSE_CACHE_MS = 10 * 60 * 1000
const SEARCH_CACHE_SIZE = 500
/** Albums hold up to 100 tracks each, so fewer of them are kept. */
const ALBUM_CACHE_SIZE = 200
const ARTIST_CACHE_SIZE = 500
/** How long an ID Spotify did not know is not looked up again. */
const UNKNOWN_CACHE_MS = 60 * 60 * 1000
const UNKNOWN_CACHE_SIZE = 5000
/** Tracks looked up at the same time when links are pasted. */
const LOOKUP_CONCURRENCY = 3

/** What pages see of a track: enough for the track card. */
export interface TrackView {
    id: string
    title: string
    artists: string[]
    album: string
    coverUrl: string | null
    spotifyUrl: string
}

export type AlbumView = SpotifyAlbum & { spotifyUrl: string }
export type ArtistView = SpotifyArtist & { spotifyUrl: string }

export interface SearchResult {
    tracks: TrackView[]
    albums: AlbumView[]
    artists: ArtistView[]
}

export interface AlbumWithTracks {
    album: AlbumView
    tracks: TrackView[]
}

export interface ArtistAlbumsPage {
    albums: AlbumView[]
    next: number | null
}

const spotifyUrl = (kind: 'track' | 'album' | 'artist', id: string) =>
    `https://open.spotify.com/${kind}/${id}`

const albumView = (album: SpotifyAlbum): AlbumView => ({
    ...album,
    spotifyUrl: spotifyUrl('album', album.id)
})

export function trackView(row: Pick<Track, keyof SpotifyTrack>): TrackView {
    return {
        id: row.id,
        title: row.title,
        artists: row.artists,
        album: row.album,
        coverUrl: row.coverUrl,
        spotifyUrl: spotifyUrl('track', row.id)
    }
}

export const isSpotifyId = (value: unknown): value is string =>
    typeof value === 'string' && SPOTIFY_ID.test(value)

/**
 * Accounts for calls about to be made to Spotify; throws when the caller has made too many. Cached
 * answers cost nothing.
 */
export type Charge = (calls: number) => void

const free: Charge = () => {}

export function createCatalog({
    db,
    api,
    now = () => new Date()
}: {
    db: Database
    api: SpotifyApi
    now?: () => Date
}) {
    /** IDs Spotify did not know, so made-up ones cost a lookup only once in a while. */
    const unknown = new Map<string, number>()

    /**
     * Keeps a bounded map of recent entries; Map order is insertion order, so the oldest one is
     * dropped first.
     */
    function remember<T>(map: Map<string, T>, key: string, value: T, size: number) {
        map.delete(key)
        map.set(key, value)
        if (map.size > size) map.delete(map.keys().next().value!)
    }

    const fresh = (at: number | undefined, maxAge: number) =>
        at !== undefined && now().getTime() - at < maxAge

    /**
     * Answers reused for a while, so browsing back and forth, or several people opening the same
     * album, cost Spotify one call. Only calls that are made get charged.
     */
    function recent<T>(size: number) {
        const entries = new Map<string, { at: number; value: T }>()
        return async (key: string, calls: number, charge: Charge, load: () => Promise<T>) => {
            const hit = entries.get(key)
            if (hit && fresh(hit.at, BROWSE_CACHE_MS)) return hit.value
            charge(calls)
            const value = await load()
            remember(entries, key, { at: now().getTime(), value }, size)
            return value
        }
    }

    const searches = recent<SearchResult>(SEARCH_CACHE_SIZE)
    const albums = recent<AlbumWithTracks | null>(ALBUM_CACHE_SIZE)
    const artistPages = recent<ArtistAlbumsPage | null>(ARTIST_CACHE_SIZE)

    async function save(tracks: SpotifyTrack[]) {
        // One row per track, or the upsert would change the same row twice
        const unique = [...new Map(tracks.map((item) => [item.id, item])).values()]
        if (unique.length === 0) return
        const fetchedAt = now()
        await db
            .insert(track)
            .values(unique.map((item) => ({ ...item, fetchedAt })))
            .onConflictDoUpdate({
                target: track.id,
                set: {
                    title: sql`excluded.title`,
                    artists: sql`excluded.artists`,
                    album: sql`excluded.album`,
                    coverUrl: sql`excluded.cover_url`,
                    durationMs: sql`excluded.duration_ms`,
                    fetchedAt: sql`excluded.fetched_at`
                }
            })
    }

    async function cached(trackIds: string[]): Promise<Map<string, Track>> {
        if (trackIds.length === 0) return new Map()
        const rows = await db.select().from(track).where(inArray(track.id, trackIds))
        return new Map(rows.map((row) => [row.id, row]))
    }

    return {
        /** Puts tracks that came with another answer (a playlist's items) into the cache. */
        keep: save,

        /**
         * The tracks with these IDs, in this order, from the cache or looked up one at a time with the
         * account's token (there is no batch lookup). Unknown IDs are left out. Each lookup is charged.
         */
        async tracks(accountId: string, trackIds: string[], charge = free): Promise<TrackView[]> {
            const ids = [...new Set(trackIds.filter(isSpotifyId))]
            const known = await cached(ids)
            const missing = ids.filter(
                (id) => !known.has(id) && !fresh(unknown.get(id), UNKNOWN_CACHE_MS)
            )
            charge(missing.length)
            const all = new Map<string, Pick<Track, keyof SpotifyTrack>>(known)
            for (let i = 0; i < missing.length; i += LOOKUP_CONCURRENCY) {
                const batch = missing.slice(i, i + LOOKUP_CONCURRENCY)
                const results = await Promise.all(batch.map((id) => api.track(accountId, id)))
                const found = results.filter((result) => result !== null)
                // Saved batch by batch, so a failure later on does not lose what was found
                await save(found)
                for (const item of found) all.set(item.id, item)
                for (const id of batch)
                    if (!all.has(id)) remember(unknown, id, now().getTime(), UNKNOWN_CACHE_SIZE)
            }
            return ids.flatMap((id) => {
                const row = all.get(id)
                return row ? [trackView(row)] : []
            })
        },

        /** Search results, reused for a while; their tracks go into the cache. */
        search(accountId: string, query: string, charge = free): Promise<SearchResult> {
            return searches(`${accountId}\n${query.toLowerCase()}`, 1, charge, async () => {
                const found = await api.search(accountId, query)
                await save(found.tracks)
                return {
                    tracks: found.tracks.map(trackView),
                    albums: found.albums.map(albumView),
                    artists: found.artists.map((artist) => ({
                        ...artist,
                        spotifyUrl: spotifyUrl('artist', artist.id)
                    }))
                }
            })
        },

        /**
         * An album with its tracks, which go into the cache; null when Spotify does not know it.
         * Reused for a while. Up to two calls (albums of more than 50 tracks), charged as two.
         */
        async album(
            accountId: string,
            albumId: string,
            charge = free
        ): Promise<AlbumWithTracks | null> {
            if (!isSpotifyId(albumId)) return null
            return albums(`${accountId}\n${albumId}`, 2, charge, async () => {
                const found = await api.album(accountId, albumId)
                if (!found) return null
                await save(found.tracks)
                return { album: albumView(found.album), tracks: found.tracks.map(trackView) }
            })
        },

        /** A page of an artist's albums, reused for a while. */
        async artistAlbums(
            accountId: string,
            artistId: string,
            offset: number,
            charge = free
        ): Promise<ArtistAlbumsPage | null> {
            if (!isSpotifyId(artistId)) return null
            return artistPages(`${accountId}\n${artistId}\n${offset}`, 1, charge, async () => {
                const found = await api.artistAlbums(accountId, artistId, offset)
                if (!found) return null
                return { albums: found.albums.map(albumView), next: found.next }
            })
        }
    }
}

export type Catalog = ReturnType<typeof createCatalog>
