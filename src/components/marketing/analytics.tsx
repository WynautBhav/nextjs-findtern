import Script from "next/script";

/**
 * Analytics: GA4, Google Tag Manager and Meta Pixel.
 *
 * The legacy site shipped all three from `index.html`:
 *   GA4   G-GGNWRN8GTC
 *   GTM   GTM-M7TCRBCR
 *   Pixel 1401151568247955
 *
 * The rewrite shipped none, which is not a neutral omission - GA4 and the Meta
 * pixel are how remarketing audiences are built, and abandoning them silently
 * resets the history on a site that has been collecting it. So the same three
 * IDs come across, overridable by env for when they are replaced.
 *
 * All three load `afterInteractive`: none of them is needed for the page to be
 * useful, and a blocked tracker must never delay or break the first render.
 *
 * ── Before launch ─────────────────────────────────────────────────────────
 * These fire on every visitor with no consent gate. That is a privacy exposure,
 * not a preference: the privacy page promises things about data, and in India
 * the DPDP Act and in the EU GDPR both require consent before non-essential
 * tracking. Add a consent gate that withholds all three until someone accepts
 * (see PARITY_AUDIT.md §5).
 */

const GA4_ID = process.env.NEXT_PUBLIC_GA4_ID ?? "G-GGNWRN8GTC";
const GTM_ID = process.env.NEXT_PUBLIC_GTM_ID ?? "GTM-M7TCRBCR";
const PIXEL_ID = process.env.NEXT_PUBLIC_META_PIXEL_ID ?? "1401151568247955";

export function Analytics() {
  return (
    <>
      {/* GTM. The container script plus the <noscript> iframe, which is what
          makes tag-manager fire for users with JavaScript disabled and is the
          pair Google requires for the container to be valid. */}
      <Script id="gtm-loader" strategy="afterInteractive">
        {`(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src='https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);})(window,document,'script','dataLayer','${GTM_ID}');`}
      </Script>
      <noscript>
        <iframe
          src={`https://www.googletagmanager.com/ns.html?id=${GTM_ID}`}
          height="0"
          width="0"
          style={{ display: "none", visibility: "hidden" }}
          title="Google Tag Manager"
        />
      </noscript>

      {/* GA4, via gtag.js. Kept alongside GTM deliberately: GTM can be
          reconfigured without a deploy, but if the container is ever emptied
          the site stops reporting, and this does not depend on that. */}
      <Script
        src={`https://www.googletagmanager.com/gtag/js?id=${GA4_ID}`}
        strategy="afterInteractive"
      />
      <Script id="ga4-init" strategy="afterInteractive">
        {`window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('js',new Date());gtag('config','${GA4_ID}',{anonymize_ip:true});`}
      </Script>

      {/* Meta Pixel. */}
      <Script id="meta-pixel" strategy="afterInteractive">
        {`!function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,document,'script','https://connect.facebook.net/en_US/fbevents.js');fbq('init','${PIXEL_ID}');fbq('track','PageView');`}
      </Script>
    </>
  );
}