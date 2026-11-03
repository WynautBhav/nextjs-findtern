/**
 * One browser window for a journey that has several logins.
 *
 * The journey drives intern, employer and admin sessions side by side. A
 * context per role means a window per role (seven of them), which is hard to
 * watch and heavy to run. Here every role is a handle on ONE page in ONE
 * context; the login is kept in a per-role cookie jar and swapped in when a
 * different role is used, and the role's last URL is reopened. Roles never
 * run at the same time: each call on a handle waits for the swap, in order.
 *
 * What a handle does and does not do:
 *  - every method that talks to the browser first makes its own role current;
 *  - the methods that only build a locator (`getByRole`, `locator`, `first` ...)
 *    stay synchronous and return a handle for the same role;
 *  - `handle.__real` is the underlying page, for libraries that want the real
 *    one (axe). Call `await handle.bringToFront()` first so the role is current;
 *  - localStorage and sessionStorage are swapped together with the cookies.
 */

const PAGE_SYNC = new Set(["url", "isClosed", "viewportSize", "mainFrame", "frames", "on", "once", "off", "addListener", "removeListener", "setDefaultTimeout", "setDefaultNavigationTimeout"]);
const LOCATOR_FACTORIES = new Set(["locator", "getByRole", "getByText", "getByLabel", "getByPlaceholder", "getByTestId", "getByAltText", "getByTitle", "frameLocator"]);
const LOCATOR_CHAIN = new Set([...LOCATOR_FACTORIES, "first", "last", "nth", "filter", "and", "or", "describe"]);
const REAL = "__real";

/** Handles are passed to Playwright as arguments (`filter({ has })`); it needs the real objects. */
function unwrap(value) {
  if (value && typeof value === "object") {
    if (value[REAL]) return value[REAL];
    if (!Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype) {
      return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, v && typeof v === "object" && v[REAL] ? v[REAL] : v]));
    }
  }
  return value;
}

export async function singleWindow({ context, roles, origin, track }) {
  const real = await context.newPage();
  const saved = new Map(); // role -> { cookies, url, storage }
  let active = null;
  let chain = Promise.resolve();

  const onOrigin = () => real.url().startsWith(origin);

  async function readStorage() {
    if (!onOrigin()) return null;
    return real.evaluate(() => ({ local: { ...localStorage }, session: { ...sessionStorage } })).catch((err) => {
      console.log(`[one-window] could not read storage on ${real.url()}: ${String(err.message).slice(0, 80)}`);
      return null;
    });
  }

  async function writeStorage(data) {
    if (!onOrigin()) return;
    await real
      .evaluate((d) => {
        localStorage.clear();
        sessionStorage.clear();
        for (const [k, v] of Object.entries(d?.local ?? {})) localStorage.setItem(k, v);
        for (const [k, v] of Object.entries(d?.session ?? {})) sessionStorage.setItem(k, v);
      }, data)
      .catch((err) => console.log(`[one-window] could not write storage on ${real.url()}: ${String(err.message).slice(0, 80)}`));
  }

  async function switchTo(role) {
    if (active === role) return;
    if (active) saved.set(active, { cookies: await context.cookies(), url: real.url(), storage: await readStorage() });
    await context.clearCookies();
    const next = saved.get(role);
    if (next?.cookies.length) await context.addCookies(next.cookies);
    active = role;
    if (next?.url && next.url.startsWith(origin) && next.url !== real.url()) {
      await real.goto(next.url, { waitUntil: "domcontentloaded" });
    }
    await writeStorage(next?.storage ?? null);
  }

  /** Makes `role` current; calls are served in the order they were made. */
  function activate(role) {
    const run = chain.then(() => switchTo(role));
    chain = run.catch(() => {});
    return run;
  }

  function wrapLocator(role, locator) {
    return new Proxy(locator, {
      get(target, prop) {
        if (prop === REAL) return target;
        // `locator.page()` is the same window, as this role.
        if (prop === "page") return () => handleFor(role);
        const value = target[prop];
        if (typeof value !== "function") return value;
        if (LOCATOR_CHAIN.has(prop)) return (...args) => wrapLocator(role, value.apply(target, args.map(unwrap)));
        if (prop === "all") return async () => (await activate(role), (await value.call(target)).map((l) => wrapLocator(role, l)));
        return async (...args) => {
          await activate(role);
          return value.apply(target, args.map(unwrap));
        };
      },
    });
  }

  /** `page.keyboard`, `page.mouse`, `page.request`: every call makes the role current first. */
  function wrapService(role, service) {
    return new Proxy(service, {
      get(target, prop) {
        const value = target[prop];
        if (typeof value !== "function") return value;
        return async (...args) => {
          await activate(role);
          return value.apply(target, args.map(unwrap));
        };
      },
    });
  }

  function handleFor(role) {
    return new Proxy(real, {
      get(target, prop) {
        if (prop === REAL) return target;
        if (prop === "role") return role;
        if (prop === "keyboard" || prop === "mouse" || prop === "touchscreen" || prop === "request") return wrapService(role, target[prop]);
        if (prop === "context") return () => context;
        const value = target[prop];
        if (typeof value !== "function") return value;
        if (LOCATOR_FACTORIES.has(prop)) return (...args) => wrapLocator(role, value.apply(target, args.map(unwrap)));
        if (PAGE_SYNC.has(prop)) return value.bind(target);
        return async (...args) => {
          await activate(role);
          return value.apply(target, args.map(unwrap));
        };
      },
    });
  }

  const pages = Object.fromEntries(roles.map((r) => [r, handleFor(r)]));
  track?.(() => active ?? "setup", real);
  return {
    pages,
    /** A signed-out visitor on the same window: its own empty cookie jar. */
    guest: (name) => handleFor(name),
    real,
    activeRole: () => active,
  };
}
