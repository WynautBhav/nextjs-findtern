/**
 * Hides a dismissed banner before the first paint on a hard load.
 *
 * The banner itself is server-rendered (so it takes its space from the start and
 * nothing is pushed down after hydration); this inline script, placed right
 * after it in the HTML, reads the same storage key the banner writes and hides
 * the element marked `data-dismiss="<name>"` if it was dismissed. Server component:
 * no client JS, no new storage, nothing sent anywhere. If the script is blocked
 * the banner simply shows and the client hides it as soon as it hydrates.
 */
export function DismissedGuard({ store, storageKey, name }: { store: "local" | "session"; storageKey: string; name: string }) {
  const js =
    `try{if(window.${store}Storage.getItem(${JSON.stringify(storageKey)})==="1"){` +
    `var e=document.querySelector('[data-dismiss="${name}"]');if(e)e.style.display="none"}}catch(_){}`;
  return <script dangerouslySetInnerHTML={{ __html: js.replace(/</g, "\\u003c") }} />;
}
