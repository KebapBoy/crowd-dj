<script lang="ts">
    import type { HTMLAttributes } from 'svelte/elements'
    import { cn } from '#lib/utils.js'

    /** A plain layout box with fixed classes, for the header and footer of the dialogs. */
    let {
        base,
        class: className,
        children,
        ...restProps
    }: HTMLAttributes<HTMLDivElement> & { base: string } = $props()
</script>

<div class={cn(base, className)} {...restProps}>{@render children?.()}</div>
