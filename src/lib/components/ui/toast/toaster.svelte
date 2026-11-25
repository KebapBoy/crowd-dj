<script lang="ts">
    import CircleCheckIcon from '@lucide/svelte/icons/circle-check'
    import InfoIcon from '@lucide/svelte/icons/info'
    import Loader2Icon from '@lucide/svelte/icons/loader-2'
    import OctagonXIcon from '@lucide/svelte/icons/octagon-x'
    import TriangleAlertIcon from '@lucide/svelte/icons/triangle-alert'
    import XIcon from '@lucide/svelte/icons/x'
    import {
        Toast,
        ToastClose,
        ToastDescription,
        ToastRegion,
        ToastTitle
    } from '@ui-sdk/svelte/toast'
    import { m } from '#lib/paraglide/messages.js'

    /** The place where `toast()` shows its messages, once in the layout; stacking is in app.css. */

    const icons = {
        success: CircleCheckIcon,
        error: OctagonXIcon,
        info: InfoIcon,
        warning: TriangleAlertIcon,
        loading: Loader2Icon
    }
</script>

<ToastRegion
    aria-label={m.notifications()}
    pendingAnnouncement={m.loading()}
    class="fixed right-4 bottom-[calc(1rem_+_var(--keyboard-inset,0px))] z-[100] w-[min(356px,calc(100vw_-_2rem))]"
>
    {#snippet children(item)}
        {@const Icon = item.type && item.type !== 'default' ? icons[item.type] : undefined}
        <Toast
            class="bg-popover text-popover-foreground flex items-center gap-2 rounded-lg border p-4 text-sm shadow-lg"
        >
            {#if Icon}
                <Icon
                    aria-hidden="true"
                    class="size-4 shrink-0 {item.type === 'loading' ? 'animate-spin' : ''}"
                />
            {/if}
            <div class="grid min-w-0 flex-1 gap-1">
                <ToastTitle class="font-medium" />
                <ToastDescription class="text-muted-foreground" />
            </div>
            <ToastClose
                aria-label={m.close()}
                class="text-muted-foreground hover:text-foreground focus-visible:ring-ring/50 -my-2 -mr-2 inline-flex size-11 shrink-0 items-center justify-center rounded-md outline-none focus-visible:ring-3 sm:size-7"
            >
                <XIcon aria-hidden="true" class="size-4" />
            </ToastClose>
        </Toast>
    {/snippet}
</ToastRegion>
