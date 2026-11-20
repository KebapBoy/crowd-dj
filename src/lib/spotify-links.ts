/** Spotify links and URIs in pasted text; used by the browser and the server. */

/** Most track links taken from one paste. */
export const LINKS_MAX = 100

/**
 * The track IDs in pasted text, in order and each once: links as the Spotify apps copy them
 * (`https://open.spotify.com/track/…`, also with a locale like `intl-de/` or `?si=…`) and URIs
 * (`spotify:track:…`). Text pasted into a one-line field loses its line breaks, so the links may
 * run into each other; IDs have a fixed length, which keeps them apart.
 */
export function parseTrackIds(text: string): string[] {
    const pattern =
        /(?:open\.spotify\.com\/(?:intl-[a-z-]+\/)?track\/|spotify:track:)([0-9A-Za-z]{22})/gi
    return [...new Set(Array.from(text.matchAll(pattern), (match) => match[1]))]
}

/** The ID of an album link or URI, which opens the album instead of searching. */
export function parseAlbumId(text: string): string | null {
    const pattern =
        /(?:open\.spotify\.com\/(?:intl-[a-z-]+\/)?album\/|spotify:album:)([0-9A-Za-z]{22})/i
    return pattern.exec(text)?.[1] ?? null
}
