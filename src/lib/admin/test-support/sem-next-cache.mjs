// next/cache for the settings / subscription tests: no cache (every read hits the fake database, so tests that change the
// stored value between cases see it), and a purge that does nothing. Test-only.
export const unstable_cache = (fn) => fn;
export const revalidateTag = () => {};
export const revalidatePath = () => {};
