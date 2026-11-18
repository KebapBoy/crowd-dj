<script lang="ts">
    import favicon from '#lib/assets/favicon.svg'
    import RenewalBanner from '#lib/components/RenewalBanner.svelte'
    import type { LayoutProps } from './$types'

    let { children, data }: LayoutProps = $props()
</script>

<svelte:head>
    <link rel="icon" href={favicon} />
</svelte:head>

<RenewalBanner renewals={data.renewals} />

{@render children()}
