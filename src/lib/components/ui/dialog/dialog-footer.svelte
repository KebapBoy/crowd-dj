<script lang="ts">
    import type { HTMLAttributes } from 'svelte/elements'
    import Div from './div.svelte'
    import { footerClasses } from './classes.ts'

    let props: HTMLAttributes<HTMLDivElement> = $props()
</script>

<Div base={footerClasses} data-slot="dialog-footer" {...props} />
