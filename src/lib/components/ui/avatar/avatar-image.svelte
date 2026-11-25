<script lang="ts">
    import { AvatarImage } from '@ui-sdk/svelte/avatar'
    import type { ComponentProps } from 'svelte'
    import { cn } from '#lib/utils.js'

    let { class: className, ...restProps }: ComponentProps<typeof AvatarImage> = $props()
</script>

<AvatarImage
    class={cn('aspect-square size-full rounded-full object-cover', className)}
    {...restProps}
/>
