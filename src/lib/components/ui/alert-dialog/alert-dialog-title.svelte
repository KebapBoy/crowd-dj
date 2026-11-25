<script lang="ts">
    import { AlertDialogTitle } from '@ui-sdk/svelte/alert-dialog'
    import type { ComponentProps } from 'svelte'
    import { titleClasses } from '#lib/components/ui/dialog/classes.ts'
    import { cn } from '#lib/utils.js'

    let { class: className, ...restProps }: ComponentProps<typeof AlertDialogTitle> = $props()
</script>

<AlertDialogTitle class={cn(titleClasses, className)} {...restProps} />
