<script lang="ts">
    import { DialogDescription } from '@ui-sdk/svelte/dialog'
    import type { ComponentProps } from 'svelte'
    import { cn } from '#lib/utils.js'
    import { descriptionClasses } from './classes.ts'

    let { class: className, ...restProps }: ComponentProps<typeof DialogDescription> = $props()
</script>

<DialogDescription class={cn(descriptionClasses, className)} {...restProps} />
