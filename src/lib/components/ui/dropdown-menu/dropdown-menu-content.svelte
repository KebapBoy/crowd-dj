<script lang="ts">
    import { MenuContent } from '@ui-sdk/svelte/menu'
    import type { ComponentProps } from 'svelte'
    import { cn } from '#lib/utils.js'

    let {
        class: className,
        sideOffset = 4,
        align = 'start',
        ...restProps
    }: ComponentProps<typeof MenuContent> = $props()
</script>

<MenuContent
    {sideOffset}
    {align}
    class={cn(
        'ring-foreground/10 bg-popover text-popover-foreground z-50 max-h-(--available-height) min-w-32 origin-(--transform-origin) overflow-x-hidden overflow-y-auto rounded-lg border-0 p-1 shadow-md ring-1 transition-[opacity,scale] duration-100 outline-none data-starting-style:scale-95 data-starting-style:opacity-0 data-ending-style:scale-95 data-ending-style:opacity-0 motion-reduce:transition-none',
        className
    )}
    {...restProps}
/>
