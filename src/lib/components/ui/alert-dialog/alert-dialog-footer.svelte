<script lang="ts">
    import type { HTMLAttributes } from 'svelte/elements'
    import Div from '#lib/components/ui/dialog/div.svelte'
    import { footerClasses } from '#lib/components/ui/dialog/classes.ts'

    let props: HTMLAttributes<HTMLDivElement> = $props()
</script>

<Div base={footerClasses} data-slot="alert-dialog-footer" {...props} />
