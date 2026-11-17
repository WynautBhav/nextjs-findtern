import type { TabProps } from "../types";

import PlatformSummary from "./platform-summary";

export default async function OverviewTab(props: TabProps) {
  return <PlatformSummary {...props} />;
}
