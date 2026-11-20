import { error, fail, redirect } from '@sveltejs/kit'
import { accounts, profiles, sessions, setProfileCookie } from '#lib/server/app.ts'
import { normalizeName } from '#lib/server/profiles.ts'
import { parseSettings, type SettingsProblem } from '#lib/server/sessions.ts'
import { m } from '#lib/paraglide/messages.js'
import type { Actions, PageServerLoad } from './$types'

/** The open session of the link; an unknown or ended one is an error page. */
async function openSession(id: string) {
    const session = await sessions.get(id)
    if (!session) error(404, m.session_not_found())
    if (session.endedAt) error(410, m.session_ended())
    return session
}

async function hostSession(id: string, locals: App.Locals) {
    const session = await openSession(id)
    if (session.hostId !== locals.account?.id) error(403, m.error_request())
    return session
}

export const load: PageServerLoad = async ({ params, locals, url }) => {
    const session = await openSession(params.id)
    await sessions.touch(session.id)
    if (locals.profile) await sessions.join(session.id, locals.profile.id)

    const host = await accounts.get(session.hostId)
    const player = await accounts.player(session.hostId)
    const isHost = locals.account?.id === session.hostId
    const name = (account: { displayName: string | null; id: string } | null) =>
        account?.displayName ?? account?.id ?? ''
    return {
        session: {
            id: session.id,
            hostName: name(host),
            playingName: name(player ?? host),
            joinUrl: `${url.origin}/s/${session.id}`
        },
        isHost,
        profile: locals.profile,
        // Suggest the host's Spotify name when they have no profile yet
        suggestedName: isHost ? (host?.displayName ?? '') : '',
        members: locals.profile ? await sessions.members(session.id) : [],
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
    }
}
