import { requireMutation } from "@/lib/guards-mutation";
import { postStanding } from "@/lib/moderation/standing-route";

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const g = await requireMutation({ req, roles: ["admin"] });
  if (!g.ok) return g.response;
  return postStanding(req, g.session.uid, "employer", (await ctx.params).id);
}
