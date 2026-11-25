<script lang="ts">
    import CheckIcon from '@lucide/svelte/icons/check'
    import { MenuItemIndicator, MenuRadioItem } from '@ui-sdk/svelte/menu'
    import type { ComponentProps } from 'svelte'
    import { cn } from '#lib/utils.js'
    import { itemClasses } from './item-classes.ts'

    let {
        class: className,
        children: label,
        ...restProps
    }: ComponentProps<typeof MenuRadioItem> = $props()
</script>

<MenuRadioItem class={cn(itemClasses, 'pr-8', className)} {...restProps}>
    {#snippet children(state)}
        {@render label?.(state)}
        <MenuItemIndicator
            class="pointer-events-none absolute right-2 flex items-center justify-center"
        >
            <CheckIcon aria-hidden="true" />
        </MenuItemIndicator>
    {/snippet}
</MenuRadioItem>
