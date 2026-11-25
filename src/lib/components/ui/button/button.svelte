<script lang="ts">
    import { Button } from '@ui-sdk/svelte/button'
    import type { ComponentProps } from 'svelte'
    import { cn } from '#lib/utils.js'
    import { buttonVariants, type ButtonLook } from './variants.ts'

    /** A ui-sdk Button in the app's look; with `href` it renders a link. */
    let {
        class: className,
        variant = 'default',
        size = 'default',
        href,
        children,
        ...restProps
    }: ComponentProps<typeof Button> & ButtonLook & { href?: string } = $props()

    const classes = $derived(cn(buttonVariants({ variant, size }), className))
</script>

{#if href}
    <Button class={classes} {...restProps}>
        {#snippet render({ props, state })}
            <a {...props} href={state.disabled ? undefined : href}>{@render children?.(state)}</a>
        {/snippet}
    </Button>
{:else}
    <Button class={classes} {children} {...restProps} />
{/if}
