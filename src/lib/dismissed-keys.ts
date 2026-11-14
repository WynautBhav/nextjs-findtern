/**
 * Storage keys of the two dismissible banners on Home, kept in one plain module
 * so the server (the pre-paint guard) and the client (the banner) agree on them.
 */
export const presenceNoticeKey = (userId: string) => `findtern:presence-notice:${userId}`;
export const driveBannerKey = (driveId: string) => `findtern:drive-banner:${driveId}`;
