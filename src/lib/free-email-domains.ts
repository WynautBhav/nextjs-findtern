/**
 * Free / personal mailbox providers, for the employer rule "register a company with a work address".
 *
 * Vendored, no runtime fetch. Source: the HubSpot free-email-provider list
 * (https://knowledge.hubspot.com/forms/what-domains-are-blocked-when-using-the-forms-email-domains-to-block-feature),
 * as merged into https://github.com/microlinkhq/free-email-domains (Kikobeats/free-email-domains, MIT, release 1.16.9,
 * commit 87c03a4cd36194a46534eacafef259afcd66553c, 2026-11-19), cross-checked against
 * https://github.com/willwhite/freemail data/free.txt. Those lists run to ~4,000 domains and include odd entries such
 * as about.com, so only mainstream providers are kept here (a wrongly refused company is worse than a missed alias),
 * plus every listed regional variant of the big families. Refresh by re-reading the sources above.
 */

/** Matched as <brand>.<tld> (yahoo.co.in, outlook.de, live.nl ...) so a regional domain we never listed is still caught. */
const BRAND_FAMILIES = new Set(["yahoo","hotmail","outlook","live","aol","protonmail","yandex","zohomail","gmx","googlemail"]);

/** Second-level labels that sit between a brand and a country code (yahoo.co.in, live.com.au). */
const GENERIC_SLD = new Set(["co", "com", "org", "net", "ne", "or", "ac", "edu", "gov", "go"]);

const FREE_EMAIL_DOMAINS: ReadonlySet<string> = new Set([
  "10minutemail.com", "126.com", "139.com", "163.com", "188.com", "21cn.com", "abv.bg", "aim.com", "alice.it",
  "aliyun.com", "aol.co.uk", "aol.com", "aol.fr", "arcor.de", "asia.com", "att.net", "bell.net", "bellsouth.net",
  "bigpond.com", "bigpond.net.au", "bk.ru", "blueyonder.co.uk", "bol.com.br", "btinternet.com", "btopenworld.com",
  "centrum.cz", "centurylink.net", "charter.net", "comcast.net", "consultant.com", "cox.net", "daum.net", "duck.com",
  "earthlink.net", "email.com", "email.cz", "email.it", "engineer.com", "europe.com", "excite.com", "fastmail.com",
  "fastmail.fm", "foxmail.com", "free.fr", "freenet.de", "frontier.com", "gazeta.pl", "getnada.com", "gmail.com",
  "gmx.at", "gmx.ch", "gmx.co.uk", "gmx.com", "gmx.de", "gmx.fr", "gmx.li", "gmx.net", "gmx.us", "googlemail.com",
  "guerrillamail.com", "hanmail.net", "hotmail.be", "hotmail.ca", "hotmail.ch", "hotmail.co.il", "hotmail.co.jp",
  "hotmail.co.nz", "hotmail.co.th", "hotmail.co.uk", "hotmail.co.za", "hotmail.com", "hotmail.com.au",
  "hotmail.com.br", "hotmail.com.hk", "hotmail.com.tr", "hotmail.com.tw", "hotmail.de", "hotmail.es", "hotmail.fi",
  "hotmail.fr", "hotmail.it", "hotmail.kg", "hotmail.kz", "hotmail.nl", "hotmail.no", "hotmail.roor", "hotmail.ru",
  "hotmail.se", "hush.com", "hushmail.com", "i.ua", "icloud.com", "ig.com.br", "inbox.com", "inbox.ru", "india.com",
  "indiatimes.com", "interia.pl", "juno.com", "kakao.com", "keemail.me", "laposte.net", "libero.it", "list.ru",
  "live.at", "live.be", "live.ca", "live.cl", "live.cn", "live.co.uk", "live.co.za", "live.com", "live.com.ar",
  "live.com.au", "live.com.mx", "live.com.my", "live.com.pt", "live.com.sg", "live.de", "live.dk", "live.fr",
  "live.ie", "live.in", "live.it", "live.jp", "live.nl", "live.no", "live.ru", "live.se", "lycos.com", "mac.com",
  "mail.com", "mail.ee", "mail.ru", "maildrop.cc", "mailfence.com", "mailinator.com", "me.com", "meta.ua",
  "mindspring.com", "msn.com", "nate.com", "naver.com", "netzero.com", "netzero.net", "neuf.fr", "ntlworld.com",
  "o2.pl", "onet.pl", "online.de", "optonline.net", "optusnet.com.au", "orange.fr", "outlook.at", "outlook.be",
  "outlook.cl", "outlook.co.id", "outlook.co.il", "outlook.co.nz", "outlook.co.th", "outlook.com", "outlook.com.au",
  "outlook.com.br", "outlook.com.gr", "outlook.com.pe", "outlook.com.tr", "outlook.com.vn", "outlook.cz",
  "outlook.de", "outlook.dk", "outlook.es", "outlook.fr", "outlook.hu", "outlook.ie", "outlook.in", "outlook.it",
  "outlook.jp", "outlook.kr", "outlook.lv", "outlook.my", "outlook.nl", "outlook.ph", "outlook.pt", "outlook.sa",
  "outlook.sg", "outlook.sk", "pm.me", "poczta.fm", "post.com", "posteo.de", "posteo.net", "proton.me",
  "protonmail.ch", "protonmail.com", "qq.com", "rambler.ru", "rediff.com", "rediffmail.com", "riseup.net",
  "roadrunner.com", "rocketmail.com", "rogers.com", "runbox.com", "sbcglobal.net", "seznam.cz", "sfr.fr",
  "sharklasers.com", "shaw.ca", "sify.com", "sina.cn", "sina.com", "sky.com", "sohu.com", "sympatico.ca",
  "t-online.de", "telstra.com", "telus.net", "temp-mail.org", "tempmail.com", "terra.com.br", "tin.it",
  "tiscali.co.uk", "tiscali.it", "trashmail.com", "tuta.com", "tuta.io", "tutamail.com", "tutanota.com",
  "tutanota.de", "ukr.net", "uol.com.br", "usa.com", "verizon.net", "videotron.ca", "vip.qq.com", "virgilio.it",
  "virginmedia.com", "walla.co.il", "wanadoo.fr", "web.de", "windowslive.com", "windstream.net", "wp.pl", "ya.ru",
  "yahoo.ae", "yahoo.ar", "yahoo.at", "yahoo.be", "yahoo.ca", "yahoo.ch", "yahoo.cl", "yahoo.cn", "yahoo.co",
  "yahoo.co.id", "yahoo.co.il", "yahoo.co.in", "yahoo.co.jp", "yahoo.co.kr", "yahoo.co.nz", "yahoo.co.th",
  "yahoo.co.uk", "yahoo.co.za", "yahoo.com", "yahoo.com.ar", "yahoo.com.au", "yahoo.com.br", "yahoo.com.cn",
  "yahoo.com.co", "yahoo.com.hk", "yahoo.com.is", "yahoo.com.mx", "yahoo.com.my", "yahoo.com.ph", "yahoo.com.ru",
  "yahoo.com.sg", "yahoo.com.tr", "yahoo.com.tw", "yahoo.com.vn", "yahoo.cz", "yahoo.de", "yahoo.dk", "yahoo.es",
  "yahoo.fi", "yahoo.fr", "yahoo.gr", "yahoo.hu", "yahoo.id", "yahoo.ie", "yahoo.in", "yahoo.it", "yahoo.jp",
  "yahoo.mx", "yahoo.my", "yahoo.nl", "yahoo.no", "yahoo.ph", "yahoo.pl", "yahoo.pt", "yahoo.ro", "yahoo.ru",
  "yahoo.se", "yahoo.uk", "yahoo.vn", "yandex.by", "yandex.com", "yandex.kz", "yandex.mail", "yandex.pl",
  "yandex.ru", "yandex.ua", "yeah.net", "ymail.com", "yopmail.com", "zoho.com", "zoho.in", "zohomail.com",
  "zohomail.in",
]);

function isBrandFamily(labels: string[]): boolean {
  if (!BRAND_FAMILIES.has(labels[0]) || labels.length < 2 || labels.length > 3) return false;
  if (labels.length === 3 && !GENERIC_SLD.has(labels[1])) return false;
  return /^[a-z]{2,24}$/.test(labels[labels.length - 1]);
}

/**
 * True when the domain, or any parent of it, is a free mailbox provider: mail.yahoo.co.in counts because
 * yahoo.co.in does. A parent match never goes above the registrable pair, so "com" or "in" alone never match.
 */
export function isFreeEmailDomain(domain: string): boolean {
  const labels = domain.trim().toLowerCase().replace(/\.$/, "").split(".");
  if (labels.length < 2 || labels.some((l) => !l)) return false;
  for (let i = 0; i <= labels.length - 2; i++) {
    const tail = labels.slice(i);
    if (FREE_EMAIL_DOMAINS.has(tail.join(".")) || isBrandFamily(tail)) return true;
  }
  return false;
}

export const FREE_EMAIL_DOMAIN_COUNT = FREE_EMAIL_DOMAINS.size;
