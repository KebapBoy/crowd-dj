<script lang="ts">
    import { MenuGroupLabel } from '@ui-sdk/svelte/menu'
    import type { ComponentProps } from 'svelte'
    import { cn } from '#lib/utils.js'

    let { class: className, ...restProps }: ComponentProps<typeof MenuGroupLabel> = $props()
</script>

<MenuGroupLabel
    class={cn('text-muted-foreground px-1.5 py-1 text-xs font-medium', className)}
    {...restProps}
/>
