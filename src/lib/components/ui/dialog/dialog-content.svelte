<script lang="ts">
    import XIcon from '@lucide/svelte/icons/x'
    import { DialogBackdrop, DialogClose, DialogContent } from '@ui-sdk/svelte/dialog'
    import type { ComponentProps } from 'svelte'
    import { buttonVariants } from '#lib/components/ui/button/index.js'
    import { m } from '#lib/paraglide/messages.js'
    import { cn } from '#lib/utils.js'
    import { backdropClasses, contentClasses } from './classes.ts'

    /** The dialog box over a dimmed page, with a close button in its corner. */
    let {
        class: className,
        children: content,
        ...restProps
    }: ComponentProps<typeof DialogContent> = $props()
</script>

<DialogBackdrop class={backdropClasses} />
<DialogContent class={cn(contentClasses, 'sm:max-w-sm', className)} {...restProps}>
    {#snippet children(state)}
        {@render content?.(state)}
        <DialogClose
            aria-label={m.close()}
            class={cn(
                buttonVariants({ variant: 'ghost', size: 'icon-sm' }),
                'absolute top-1 right-1 size-11 sm:top-2 sm:right-2 sm:size-7'
            )}
        >
            <XIcon />
        </DialogClose>
    {/snippet}
</DialogContent>
