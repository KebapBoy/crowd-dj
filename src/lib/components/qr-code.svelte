<script lang="ts">
    import { encode } from 'uqr'
    import { m } from '#lib/paraglide/messages.js'
    import { cn } from '#lib/utils.ts'

    /** A QR code drawn as SVG; always dark on white, which every camera can read. */
    let { value, class: className }: { value: string; class?: string } = $props()

    const code = $derived(encode(value, { ecc: 'M', border: 2 }))
    /** One square per dark module, as a single path. */
    const path = $derived(
        code.data
            .flatMap((row, y) => row.map((dark, x) => (dark ? `M${x} ${y}h1v1h-1z` : '')))
            .join('')
    )
</script>

<svg
    viewBox="0 0 {code.size} {code.size}"
    role="img"
    aria-label={m.qr_code()}
    shape-rendering="crispEdges"
    class={cn('aspect-square rounded-lg bg-white', className)}
>
    <path d={path} fill="#000" />
</svg>
