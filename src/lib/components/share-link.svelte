<script lang="ts">
    import CopyIcon from '@lucide/svelte/icons/copy'
    import Share2Icon from '@lucide/svelte/icons/share-2'
    import { onMount } from 'svelte'
    import { toast } from '#lib/components/ui/toast/index.js'
    import QrCode from '#lib/components/qr-code.svelte'
    import { Button } from '#lib/components/ui/button/index.js'
    import { Input } from '#lib/components/ui/input/index.js'
    import { m } from '#lib/paraglide/messages.js'

    /** A link with its QR code, to copy or hand to the system's share sheet. */
    let { url, title }: { url: string; title: string } = $props()

    let canShare = $state(false)
    onMount(() => (canShare = typeof navigator.share === 'function'))

    async function copy() {
        try {
            await navigator.clipboard.writeText(url)
            toast.success(m.link_copied())
        } catch {
            toast.error(m.action_failed())
        }
    }

    async function share() {
        try {
            await navigator.share({ title, url })
        } catch {
            // Cancelled by the user
        }
    }
</script>

<div class="flex flex-col items-center gap-3">
    <QrCode value={url} class="w-full max-w-64" />
    <Input
        value={url}
        readonly
        aria-label={title}
        class="h-11 font-mono text-xs sm:h-8"
        onfocus={(event) => event.currentTarget.select()}
    />
    <div class="flex w-full flex-col gap-2 sm:flex-row sm:justify-center">
        <Button variant="outline" class="h-11 sm:h-8" onclick={copy}>
            <CopyIcon data-icon="inline-start" />
            {m.copy_link()}
        </Button>
        {#if canShare}
            <Button variant="outline" class="h-11 sm:h-8" onclick={share}>
                <Share2Icon data-icon="inline-start" />
                {m.share()}
            </Button>
        {/if}
    </div>
</div>
