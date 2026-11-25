/** Shared by Dialog and AlertDialog: the dimmed page behind, the centered box, header and footer. */
export const backdropClasses =
    'fixed inset-0 z-50 bg-black/10 transition-opacity duration-100 supports-backdrop-filter:backdrop-blur-xs data-starting-style:opacity-0 data-ending-style:opacity-0 motion-reduce:transition-none'

export const contentClasses =
    'bg-popover text-popover-foreground ring-foreground/10 fixed inset-0 z-50 m-auto grid h-fit max-h-[calc(100dvh_-_2rem)] w-full max-w-[calc(100%_-_2rem)] gap-4 overflow-y-auto rounded-xl p-4 text-sm ring-1 outline-none transition-[opacity,scale] duration-100 data-starting-style:scale-95 data-starting-style:opacity-0 data-ending-style:scale-95 data-ending-style:opacity-0 motion-reduce:transition-none'

export const headerClasses = 'flex flex-col gap-2'

export const footerClasses =
    'bg-muted/50 -mx-4 -mb-4 flex flex-col-reverse gap-2 rounded-b-xl border-t p-4 sm:flex-row sm:justify-end'

export const titleClasses = 'text-base leading-none font-medium'

export const descriptionClasses =
    'text-muted-foreground text-sm *:[a]:underline *:[a]:underline-offset-3 *:[a]:hover:text-foreground'
