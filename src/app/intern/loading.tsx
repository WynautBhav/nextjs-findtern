import { LedgerSkeleton } from "@/components/app/layout-kit";

/** Fallback while any intern screen loads: the ledger layout (masthead, lead figure, ruled rows). The shell stays put; a screen with its own loading.tsx keeps its own shape. */
export default function Loading() {
  return <LedgerSkeleton />;
}
