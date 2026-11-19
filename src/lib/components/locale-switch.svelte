<script lang="ts">
    import LanguagesIcon from '@lucide/svelte/icons/languages'
    import { Button } from '#lib/components/ui/button/index.js'
    import * as DropdownMenu from '#lib/components/ui/dropdown-menu/index.js'
    import { m } from '#lib/paraglide/messages.js'
    import { getLocale, isLocale, locales, setLocale } from '#lib/paraglide/runtime.js'

    const current = getLocale()

    /** Each language in its own language ("Deutsch", "English"), so everyone finds theirs. */
    const name = (locale: string) =>
        new Intl.DisplayNames([locale], { type: 'language' }).of(locale) ?? locale
</script>

<DropdownMenu.Root>
    <DropdownMenu.Trigger>
        {#snippet child({ props })}
            <Button
                {...props}
                variant="ghost"
                class="h-11 gap-1.5 px-3 sm:h-9 sm:px-2.5"
                aria-label={m.language_choose({ language: name(current) })}
                title={m.language()}
            >
                <LanguagesIcon class="size-5 sm:size-4" />
                <span class="text-xs font-semibold uppercase">{current}</span>
            </Button>
        {/snippet}
    </DropdownMenu.Trigger>
    <DropdownMenu.Content align="end" class="min-w-40">
        <DropdownMenu.Label>{m.language()}</DropdownMenu.Label>
        <DropdownMenu.RadioGroup
            value={current}
            onValueChange={(locale) => {
                if (isLocale(locale) && locale !== current) setLocale(locale)
            }}
        >
            {#each locales as locale (locale)}
                <DropdownMenu.RadioItem value={locale} lang={locale} class="min-h-11 sm:min-h-8">
                    {name(locale)}
                </DropdownMenu.RadioItem>
            {/each}
        </DropdownMenu.RadioGroup>
    </DropdownMenu.Content>
</DropdownMenu.Root>
