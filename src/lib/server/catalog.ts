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

/** How long search results are reused. */
const SEARCH_CACHE_MS = 10 * 60 * 1000
const SEARCH_CACHE_SIZE = 500
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

const spotifyUrl = (kind: 'track' | 'album' | 'artist', id: string) =>
    `https://open.spotify.com/${kind}/${id}`

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
    /** Recent search results per account and query; Map order is insertion order, oldest first. */
    const searches = new Map<string, { at: number; result: SearchResult }>()
    /** IDs Spotify did not know, so made-up ones cost a lookup only once in a while. */
    const unknown = new Map<string, number>()

    /** Keeps a bounded map of recent entries: drops expired ones and then the oldest. */
    function remember<T>(map: Map<string, T>, key: string, value: T, size: number) {
        map.delete(key)
        map.set(key, value)
        if (map.size > size) map.delete(map.keys().next().value!)
    }

    async function save(tracks: SpotifyTrack[]) {
        if (tracks.length === 0) return
        const fetchedAt = now()
        await db
            .insert(track)
            .values(tracks.map((item) => ({ ...item, fetchedAt })))
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

    const fresh = (at: number | undefined, maxAge: number) =>
        at !== undefined && now().getTime() - at < maxAge

    return {
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
        async search(accountId: string, query: string, charge = free): Promise<SearchResult> {
            const key = `${accountId}\n${query.toLowerCase()}`
            const hit = searches.get(key)
            if (hit && fresh(hit.at, SEARCH_CACHE_MS)) return hit.result
            charge(1)
            const found = await api.search(accountId, query)
            await save(found.tracks)
            const result: SearchResult = {
                tracks: found.tracks.map(trackView),
                albums: found.albums.map((album) => ({
                    ...album,
                    spotifyUrl: spotifyUrl('album', album.id)
                })),
                artists: found.artists.map((artist) => ({
                    ...artist,
                    spotifyUrl: spotifyUrl('artist', artist.id)
                }))
            }
            remember(searches, key, { at: now().getTime(), result }, SEARCH_CACHE_SIZE)
            return result
        },

        /**
         * An album with its tracks, which go into the cache; null when Spotify does not know it. Up to
         * two calls (albums of more than 50 tracks), charged as two.
         */
        async album(
            accountId: string,
            albumId: string,
            charge = free
        ): Promise<{ album: AlbumView; tracks: TrackView[] } | null> {
            charge(2)
            const found = await api.album(accountId, albumId)
            if (!found) return null
            await save(found.tracks)
            return {
                album: { ...found.album, spotifyUrl: spotifyUrl('album', found.album.id) },
                tracks: found.tracks.map(trackView)
            }
        },

        /** A page of an artist's albums. */
        async artistAlbums(
            accountId: string,
            artistId: string,
            offset: number,
            charge = free
        ): Promise<{ albums: AlbumView[]; next: number | null } | null> {
            charge(1)
            const found = await api.artistAlbums(accountId, artistId, offset)
            if (!found) return null
            return {
                albums: found.albums.map((album) => ({
                    ...album,
                    spotifyUrl: spotifyUrl('album', album.id)
                })),
                next: found.next
            }
        }
    }
}

export type Catalog = ReturnType<typeof createCatalog>
