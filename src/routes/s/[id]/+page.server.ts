import { fail, redirect } from '@sveltejs/kit'
import {
    accounts,
    catalog,
    pools,
    profiles,
    sessions,
    setProfileCookie,
    wishes
} from '#lib/server/app.ts'
import { isSpotifyId } from '#lib/server/catalog.ts'
import { catalogCall, hostSession, memberSession, openSession } from '#lib/server/guards.ts'
import { normalizeName } from '#lib/server/profiles.ts'
import { parseSettings, type SettingsProblem } from '#lib/server/sessions.ts'
import type { WishProblem } from '#lib/server/wishes.ts'
import { LINKS_MAX } from '#lib/spotify-links.ts'
import { m } from '#lib/paraglide/messages.js'
import type { Actions, PageServerLoad } from './$types'

export const load: PageServerLoad = async ({ params, locals, url }) => {
    const session = await openSession(params.id)
    await sessions.touch(session.id)
    if (locals.profile) await sessions.join(session.id, locals.profile.id)

    const host = await accounts.get(session.hostId)
    const player = await accounts.player(session.hostId)
    const isHost = locals.account?.id === session.hostId
    const name = (account: { displayName: string | null; id: string } | null) =>
        account?.displayName ?? account?.id ?? ''
    const profile = locals.profile
    return {
        session: {
            id: session.id,
            hostName: name(host),
            playingName: name(player ?? host),
            joinUrl: `${url.origin}/s/${session.id}`,
            mode: session.mode,
            maxOpenWishes: session.maxOpenWishes,
            maxSessionWishes: session.maxSessionWishes,
            maxPoolSize: session.maxPoolSize
        },
        isHost,
        profile,
        // Suggest the host's Spotify name when they have no profile yet
        suggestedName: isHost ? (host?.displayName ?? '') : '',
        members: profile ? await sessions.members(session.id) : [],
        wishes: profile ? await wishes.list(session.id, profile.id) : [],
        pool: profile ? await pools.list(profile.id) : [],
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
    taken: m.wish_taken
}

/** The track IDs a form sent (`track`, once or more), or null when one is not valid. */
function trackIds(form: FormData): string[] | null {
    const ids = form.getAll('track')
    if (ids.length === 0 || ids.length > LINKS_MAX || !ids.every(isSpotifyId)) return null
    return [...new Set(ids)]
}

export const actions: Actions = {
    /** A visitor without a profile picks a name and joins. */
    join: async ({ params, request, locals, cookies }) => {
        const session = await openSession(params.id)
        if (locals.profile) return
        const name = normalizeName((await request.formData()).get('name'))
        if (!name) return fail(400, { invalidName: true })
        const { profile, token } = await profiles.create(name)
        setProfileCookie(cookies, token)
        await sessions.join(session.id, profile.id)
    },
    settings: async ({ params, request, locals }) => {
        const session = await hostSession(params.id, locals)
        const parsed = parseSettings(await request.formData())
        if ('problem' in parsed)
            return fail(400, { settingsError: settingsMessages[parsed.problem]() })
        await sessions.updateSettings(session.id, parsed.settings)
    },
    end: async ({ params, locals }) => {
        const session = await hostSession(params.id, locals)
        await sessions.end(session.id)
        redirect(303, '/')
    },
    wish: async ({ params, request, locals }) => {
        const { session, profile } = await memberSession(params.id, locals)
        const ids = trackIds(await request.formData())
        if (ids?.length !== 1) return fail(400, { error: m.error_request() })
        // Usually cached from the search that showed the track
        const [track] = await catalogCall(session.id, profile.id, (charge) =>
            catalog.tracks(session.hostId, ids, charge)
        )
        if (!track) return fail(404, { error: m.catalog_not_found() })
        const problem = await wishes.add(session, profile.id, track.id)
        if (problem) return fail(409, { error: wishMessages[problem]() })
    },
    withdraw: async ({ params, request, locals }) => {
        const { session, profile } = await memberSession(params.id, locals)
        const wishId = (await request.formData()).get('wish')
        if (typeof wishId !== 'string') return fail(400, { error: m.error_request() })
        if (!(await wishes.withdraw(session.id, profile.id, wishId)))
            return fail(409, { error: m.wish_withdraw_played() })
    },
    pool: async ({ params, request, locals }) => {
        const { session, profile } = await memberSession(params.id, locals)
        const ids = trackIds(await request.formData())
        if (!ids) return fail(400, { error: m.error_request() })
        const tracks = await catalogCall(session.id, profile.id, (charge) =>
            catalog.tracks(session.hostId, ids, charge)
        )
        await pools.add(
            profile.id,
            tracks.map((track) => track.id)
        )
        return { added: tracks.length }
    },
    unpool: async ({ params, request, locals }) => {
        const { profile } = await memberSession(params.id, locals)
        const ids = trackIds(await request.formData())
        if (ids?.length !== 1) return fail(400, { error: m.error_request() })
        await pools.remove(profile.id, ids[0])
    }
}
