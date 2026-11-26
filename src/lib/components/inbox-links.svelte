<script lang="ts">
    import ExternalLinkIcon from '@lucide/svelte/icons/external-link'
    import { resolve } from '$app/paths'
    import { Button } from '#lib/components/ui/button/index.js'
    import { m } from '#lib/paraglide/messages.js'

    /**
     * The inbox playlists of a session that people can add to in the Spotify app, and whether what
     * the visitor adds there reaches their pool.
     */
    let {
        links,
        linked
    }: {
        links: { id: string; session: boolean; url: string }[]
        /** Whether the visitor's profile is linked to their Spotify user. */
        linked: boolean
    } = $props()
</script>

<div class="flex flex-col gap-3 rounded-lg border p-3">
    <p class="text-sm">{m.inbox_participant_intro()}</p>
    <div class="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
        {#each links as link (link.id)}
            <Button
                href={link.url}
                target="_blank"
                rel="noopener noreferrer"
                variant="outline"
                class="h-11 w-full sm:h-8 sm:w-auto"
            >
                <ExternalLinkIcon data-icon="inline-start" />
                {link.session ? m.inbox_open_session() : m.inbox_open_lasting()}
            </Button>
        {/each}
    </div>
    {#if !linked}
        <p class="text-sm text-muted-foreground">
            {m.inbox_link_profile_before()}
            <a href={resolve('/profile')} class="underline underline-offset-4">
                {m.inbox_link_profile_link()}</a
            >{m.inbox_link_profile_after()}
        </p>
    {/if}
</div>
