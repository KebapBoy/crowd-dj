<script lang="ts">
    import { MenuItem } from '@ui-sdk/svelte/menu'
    import type { ComponentProps } from 'svelte'
    import { cn } from '#lib/utils.js'
    import { itemClasses } from './item-classes.ts'

    let { class: className, ...restProps }: ComponentProps<typeof MenuItem> = $props()
</script>

<MenuItem class={cn(itemClasses, className)} {...restProps} />
