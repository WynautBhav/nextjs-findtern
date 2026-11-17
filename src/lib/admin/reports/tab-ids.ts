/** DOM ids that tie a report tab to its panel (aria-controls / aria-labelledby). Plain module: used by a server page and a client component. */
export const REPORT_PANEL_ID = "report-tabpanel";
export const reportTabId = (key: string) => `report-tab-${key}`;
