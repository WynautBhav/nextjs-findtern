import { serializeJsonLd } from "@/lib/seo";

/**
 * One <script type="application/ld+json"> per graph. Server component; the
 * payload is escaped so a CMS string containing `</script>` cannot break out.
 */
export function JsonLd({ data }: { data: unknown | unknown[] }) {
  const items = Array.isArray(data) ? data : [data];
  return (
    <>
      {items.map((d, i) => (
        <script
          key={i}
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: serializeJsonLd(d) }}
        />
      ))}
    </>
  );
}
