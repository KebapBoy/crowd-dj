<script lang="ts">
    import { AvatarFallback } from '@ui-sdk/svelte/avatar'
    import type { ComponentProps } from 'svelte'
    import { cn } from '#lib/utils.js'

    let { class: className, ...restProps }: ComponentProps<typeof AvatarFallback> = $props()
</script>

<AvatarFallback
    class={cn(
        'bg-muted text-muted-foreground flex size-full items-center justify-center rounded-full text-sm',
        className
    )}
    {...restProps}
/>
