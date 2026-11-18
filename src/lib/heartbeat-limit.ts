import { RateLimiter } from "@/lib/security/rate-limit";

/** POST /api/presence/heartbeat: per user, in memory (same limitation as the other limiters). */
export const heartbeatLimiter = new RateLimiter(6, 60_000);
