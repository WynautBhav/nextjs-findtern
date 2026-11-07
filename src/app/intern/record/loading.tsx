import { PageHead } from "@/components/app/primitives";
import { SkeletonList } from "@/components/app/layout-kit";

export default function Loading() {
  return (
    <div>
      <PageHead title="Your record" />
      <SkeletonList rows={4} />
    </div>
  );
}
