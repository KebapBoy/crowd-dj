<script lang="ts">
    import { Separator } from '@ui-sdk/svelte/separator'
    import type { ComponentProps } from 'svelte'
    import { cn } from '#lib/utils.js'

    let {
        class: className,
        decorative = true,
        ...restProps
    }: ComponentProps<typeof Separator> = $props()
</script>

<Separator
    {decorative}
    class={cn(
        'bg-border shrink-0 data-horizontal:h-px data-horizontal:w-full data-vertical:w-px data-vertical:self-stretch',
        className
    )}
    {...restProps}
/>
