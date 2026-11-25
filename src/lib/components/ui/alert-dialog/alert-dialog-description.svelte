<script lang="ts">
    import { AlertDialogDescription } from '@ui-sdk/svelte/alert-dialog'
    import type { ComponentProps } from 'svelte'
    import { descriptionClasses } from '#lib/components/ui/dialog/classes.ts'
    import { cn } from '#lib/utils.js'

    let { class: className, ...restProps }: ComponentProps<typeof AlertDialogDescription> = $props()
</script>

<AlertDialogDescription class={cn(descriptionClasses, className)} {...restProps} />
