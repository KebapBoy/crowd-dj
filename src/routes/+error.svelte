<script lang="ts">
    import HouseIcon from '@lucide/svelte/icons/house'
    import { page } from '$app/state'
    import { resolve } from '$app/paths'
    import { Button } from '#lib/components/ui/button/index.js'
    import * as Card from '#lib/components/ui/card/index.js'
    import { m } from '#lib/paraglide/messages.js'
</script>

<svelte:head>
    <title>{page.status} · {m.app_name()}</title>
</svelte:head>

<div class="mx-auto max-w-md py-8 sm:py-16">
    <Card.Root>
        <Card.Header>
            <p class="text-5xl font-semibold tracking-tight text-muted-foreground tabular-nums">
                {page.status}
            </p>
            <Card.Title class="text-base">
                <h1>{page.error?.message}</h1>
            </Card.Title>
        </Card.Header>
        <Card.Footer>
            <Button href={resolve('/')} variant="outline" class="h-11 w-full sm:h-9 sm:w-auto">
                <HouseIcon data-icon="inline-start" />
                {m.back_home()}
            </Button>
        </Card.Footer>
    </Card.Root>
</div>
