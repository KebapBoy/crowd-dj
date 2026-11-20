import { fail, redirect } from '@sveltejs/kit'
import {
    accounts,
    catalog,
    engine,
    events,
    playing,
    pools,
    profiles,
    sessionChanged,
    sessions,
    setProfileCookie,
    wishes
} from '#lib/server/app.ts'
import { isSpotifyId } from '#lib/server/catalog.ts'
import {
    catalogCall,
    hostSession,
    mayChange,
    mayCreateProfile,
    memberSession,
    openSession
} from '#lib/server/guards.ts'
import { normalizeName } from '#lib/server/profiles.ts'
import { parseSettings, type SettingsProblem } from '#lib/server/sessions.ts'
import type { WishProblem } from '#lib/server/wishes.ts'
import { accountName, problemMessage } from '#lib/playing-messages.ts'
import { LINKS_MAX } from '#lib/spotify-links.ts'
import { m } from '#lib/paraglide/messages.js'
import type { Actions, PageServerLoad } from './$types'

export const load: PageServerLoad = async ({ params, locals, url }) => {
    const session = await openSession(params.id)
    await sessions.touch(session.id)
    // The first visit joins; after leaving, only joining on purpose does
    if (locals.profile && (await sessions.join(session.id, locals.profile.id)))
        sessionChanged(session.id)
    const membership = locals.profile
        ? await sessions.membership(session.id, locals.profile.id)
        : null
    const member = membership === 'member'

    const host = await accounts.get(session.hostId)
    const player = await accounts.player(session.hostId)
    const isHost = locals.account?.id === session.hostId
    const profile = locals.profile
    return {
        session: {
            id: session.id,
            hostName: accountName(host),
            playingName: accountName(player ?? host),
            joinUrl: `${url.origin}/s/${session.id}`,
            mode: session.mode,
            maxOpenWishes: session.maxOpenWishes,
            maxSessionWishes: session.maxSessionWishes,
            maxPoolSize: session.maxPoolSize
        },
        isHost,
        profile,
        /** Whether the profile is in the session; false after it left. */
        member,
        playing: await playing.view(session, profile?.id ?? null),
        // Suggest the host's Spotify name when they have no profile yet
        suggestedName: isHost ? (host?.displayName ?? '') : '',
        members: member ? await sessions.members(session.id) : [],
        wishes: member && profile ? await wishes.list(session.id, profile.id) : [],
        pool: member && profile ? await pools.list(profile.id) : [],
        settings: isHost
            ? {
                  mode: session.mode,
                  anonymous: session.anonymous,
                  maxOpenWishes: session.maxOpenWishes,
                  maxSessionWishes: session.maxSessionWishes,
                  maxPoolSize: session.maxPoolSize,
                  skipOwn: session.skipOwn,
                  skipVoting: session.skipVoting,
                  skipVotes: session.skipVotes,
                  skipPercent: session.skipPercent
              }
            : null
    }
}

const settingsMessages: Record<SettingsProblem, () => string> = {
    mode: m.error_request,
    limit: m.session_settings_limit,
    skipVotes: m.session_settings_votes,
    skipPercent: m.session_settings_percent
}

const wishMessages: Record<WishProblem, () => string> = {
    mode: m.wish_mode_pool_only,
    openLimit: m.wish_open_limit,
    sessionLimit: m.wish_session_limit,
    taken: m.wish_taken,
    played: m.wish_played_already
}

/** Spotify device IDs are opaque; these are the characters they have been seen with. */
const DEVICE_ID = /^[0-9A-Za-z_-]{1,100}$/

/** The track IDs a form sent (`track`, once or more), or null when one is not valid. */
function trackIds(form: FormData): string[] | null {
    const ids = form.getAll('track')
    if (ids.length === 0 || ids.length > LINKS_MAX || !ids.every(isSpotifyId)) return null
    return [...new Set(ids)]
}

export const actions: Actions = {
    /** A visitor without a profile picks a name and joins; one who left joins again. */
    join: async ({ params, request, locals, cookies, getClientAddress }) => {
        const session = await openSession(params.id)
        if (locals.profile) {
            await sessions.rejoin(session.id, locals.profile.id)
            sessionChanged(session.id)
            return
        }
        const name = normalizeName((await request.formData()).get('name'))
        if (!name) return fail(400, { invalidName: true })
        if (!mayCreateProfile(getClientAddress)) return fail(429, { tooManyProfiles: true })
        const { profile, token } = await profiles.create(name)
        setProfileCookie(cookies, token)
        await sessions.join(session.id, profile.id)
        sessionChanged(session.id)
    },
    /** A participant leaves: no more turns until they open the session again. */
    leave: async ({ params, locals }) => {
        const { session, profile } = await memberSession(params.id, locals)
        if (!mayChange(profile.id)) return fail(429, { error: m.session_too_many() })
        await sessions.leave(session.id, profile.id)
        sessionChanged(session.id)
        redirect(303, '/')
    },
    settings: async ({ params, request, locals }) => {
        const session = await hostSession(params.id, locals)
        const parsed = parseSettings(await request.formData())
        if ('problem' in parsed)
            return fail(400, { settingsError: settingsMessages[parsed.problem]() })
        await sessions.updateSettings(session.id, parsed.settings)
        sessionChanged(session.id)
    },
    end: async ({ params, locals }) => {
        const session = await hostSession(params.id, locals)
        await sessions.end(session.id)
        engine.stop(session.id)
        events.publish(session.id)
        redirect(303, '/')
    },
    /**
     * The host starts the music or resumes it, optionally on a device (`device`); while a track of
     * the session plays, a device moves playback there.
     */
    play: async ({ params, request, locals }) => {
        const session = await hostSession(params.id, locals)
        const device = (await request.formData()).get('device')
        if (device !== null && (typeof device !== 'string' || !DEVICE_ID.test(device)))
            return fail(400, { error: m.error_request() })
        const result = await engine.play(session.id, device ?? undefined)
        if (result === 'ok' || result === 'nothing') return { played: result }
        const player =
            (await accounts.player(session.hostId)) ?? (await accounts.get(session.hostId))
        return fail(result === 'busy' ? 503 : 502, {
            error: problemMessage(result, accountName(player))
        })
    },
    wish: async ({ params, request, locals }) => {
        const { session, profile } = await memberSession(params.id, locals)
        if (!mayChange(profile.id)) return fail(429, { error: m.session_too_many() })
        const ids = trackIds(await request.formData())
        if (ids?.length !== 1) return fail(400, { error: m.error_request() })
        // Usually cached from the search that showed the track
        const [track] = await catalogCall(session.id, profile.id, (charge) =>
            catalog.tracks(session.hostId, ids, charge)
        )
        if (!track) return fail(404, { error: m.catalog_not_found() })
        const problem = await wishes.add(session, profile.id, track.id)
        if (problem) return fail(409, { error: wishMessages[problem]() })
        sessionChanged(session.id)
    },
    withdraw: async ({ params, request, locals }) => {
        const { session, profile } = await memberSession(params.id, locals)
        if (!mayChange(profile.id)) return fail(429, { error: m.session_too_many() })
        const wishId = (await request.formData()).get('wish')
        if (typeof wishId !== 'string') return fail(400, { error: m.error_request() })
        if (!(await wishes.withdraw(session.id, profile.id, wishId)))
            return fail(409, { error: m.wish_withdraw_played() })
        sessionChanged(session.id)
    },
    pool: async ({ params, request, locals }) => {
        const { session, profile } = await memberSession(params.id, locals)
        if (!mayChange(profile.id)) return fail(429, { error: m.session_too_many() })
        const ids = trackIds(await request.formData())
        if (!ids) return fail(400, { error: m.error_request() })
        const tracks = await catalogCall(session.id, profile.id, (charge) =>
            catalog.tracks(session.hostId, ids, charge)
        )
        await pools.add(
            profile.id,
            tracks.map((track) => track.id)
        )
        sessionChanged(session.id)
        return { added: tracks.length }
    },
    unpool: async ({ params, request, locals }) => {
        const { session, profile } = await memberSession(params.id, locals)
        if (!mayChange(profile.id)) return fail(429, { error: m.session_too_many() })
        const ids = trackIds(await request.formData())
        if (ids?.length !== 1) return fail(400, { error: m.error_request() })
        await pools.remove(profile.id, ids[0])
        sessionChanged(session.id)
    }
}
