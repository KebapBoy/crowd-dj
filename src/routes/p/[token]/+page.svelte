<script lang="ts">
    import SmartphoneIcon from '@lucide/svelte/icons/smartphone'
    import { resolve } from '$app/paths'
    import { Button } from '#lib/components/ui/button/index.js'
    import * as Card from '#lib/components/ui/card/index.js'
    import { m } from '#lib/paraglide/messages.js'
    import type { PageProps } from './$types'

    let { data }: PageProps = $props()
</script>

<svelte:head>
    <title>{m.profile_link_title()} · {m.app_name()}</title>
    <!-- The path is the profile's token: keep it out of other sites' logs -->
    <meta name="referrer" content="no-referrer" />
    <meta name="robots" content="noindex" />
</svelte:head>

<div class="mx-auto flex max-w-2xl flex-col gap-4 sm:gap-6">
    <h1 class="text-2xl font-semibold tracking-tight">{m.profile_link_title()}</h1>

    <Card.Root>
        <Card.Header>
            <Card.Title>
                <h2>
                    {data.same
                        ? m.profile_link_current()
                        : m.profile_link_question({ name: data.name })}
                </h2>
            </Card.Title>
            {#if data.signedIn && !data.same}
                <Card.Description>{m.profile_link_signed_in()}</Card.Description>
            {:else if data.current && !data.same}
                <Card.Description>
                    {m.profile_link_replaces({ name: data.current.name })}
                </Card.Description>
            {/if}
        </Card.Header>
        <Card.Footer>
            {#if data.same || data.signedIn}
                <Button href={resolve('/profile')} class="h-11 w-full sm:h-8 sm:w-auto">
                    {m.profile_title()}
                </Button>
            {:else}
                <form method="POST" class="w-full sm:w-auto">
                    <Button type="submit" class="h-11 w-full sm:h-8 sm:w-auto">
                        <SmartphoneIcon data-icon="inline-start" />
                        {m.profile_link_use()}
                    </Button>
                </form>
            {/if}
        </Card.Footer>
    </Card.Root>
</div>
