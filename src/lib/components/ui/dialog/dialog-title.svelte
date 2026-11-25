<script lang="ts">
    import { DialogTitle } from '@ui-sdk/svelte/dialog'
    import type { ComponentProps } from 'svelte'
    import { cn } from '#lib/utils.js'
    import { titleClasses } from './classes.ts'

    let { class: className, ...restProps }: ComponentProps<typeof DialogTitle> = $props()
</script>

<DialogTitle class={cn(titleClasses, className)} {...restProps} />
