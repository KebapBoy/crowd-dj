<script lang="ts">
    import { Avatar } from '@ui-sdk/svelte/avatar'
    import type { ComponentProps } from 'svelte'
    import { cn } from '#lib/utils.js'

    let {
        class: className,
        size = 'default',
        ...restProps
    }: ComponentProps<typeof Avatar> & { size?: 'default' | 'lg' } = $props()
</script>

<Avatar
    data-size={size}
    class={cn(
        'group/avatar after:border-border relative flex size-8 shrink-0 overflow-hidden rounded-full select-none after:absolute after:inset-0 after:rounded-full after:border after:mix-blend-darken data-[size=lg]:size-10 dark:after:mix-blend-lighten',
        className
    )}
    {...restProps}
/>
