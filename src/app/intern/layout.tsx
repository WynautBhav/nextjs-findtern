import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { and, count, eq } from "drizzle-orm";
import {
  BadgeCheck,
  Bell,
  BriefcaseBusiness,
  CalendarCheck2,
  CircleUserRound,
  Compass,
  GraduationCap,
  House,
  LayoutList,
  ReceiptIndianRupee,
  ScrollText,
  Settings2,
} from "lucide-react";

import { ConsoleShell, type ConsoleNavItem } from "@/components/layout/console-shell";
import { RAIL_COOKIE } from "@/lib/rail";
import { ViewAsBanner } from "@/components/admin/view-as-banner";
import { CollegeLive } from "@/components/intern/college-live";
import { getSession } from "@/lib/auth";
import { getDb, schema } from "@/lib/db";
import { membershipOf } from "@/lib/college/membership";
import { loadInternData } from "@/lib/intern-data";
import { nextAction, type Stage } from "@/lib/journey";
import { SITE } from "@/lib/content/site";

export const metadata = { title: "Findtern" };

/**
 * Navigation follows the stage: someone whose first offer is sitting unread
 * doesn't need Timesheets in front of them, and someone three weeks into a
 * role doesn't need Open roles. The stage is derived from the rows, never
 * stored, so it can't disagree with the data. These five are also the phone
 * tab bar; everything else sits under "More".
 */
const STAGE_NAV: Record<Stage, ConsoleNavItem[]> = {
  seeking: [
    { href: "/intern/dashboard", label: "Home", icon: <House /> },
    { href: "/intern/opportunities", label: "Open roles", icon: <Compass /> },
    { href: "/intern/proposals", label: "Offers", icon: <BriefcaseBusiness /> },
    { href: "/intern/interviews", label: "Interviews", icon: <CalendarCheck2 /> },
    { href: "/intern/record", label: "Record", icon: <ScrollText /> },
  ],
  working: [
    { href: "/intern/dashboard", label: "Home", icon: <House /> },
    { href: "/intern/timesheets", label: "Timesheets", icon: <LayoutList /> },
    { href: "/intern/earnings", label: "Stipend", icon: <ReceiptIndianRupee /> },
    { href: "/intern/interviews", label: "Interviews", icon: <CalendarCheck2 /> },
    { href: "/intern/record", label: "Record", icon: <ScrollText /> },
  ],
};

const MORE_NAV: ConsoleNavItem[] = [
  { href: "/intern/opportunities", label: "Open roles", icon: <Compass /> },
  { href: "/intern/proposals", label: "Offers", icon: <BriefcaseBusiness /> },
  { href: "/intern/interviews", label: "Interviews", icon: <CalendarCheck2 /> },
  { href: "/intern/timesheets", label: "Timesheets", icon: <LayoutList /> },
  { href: "/intern/earnings", label: "Stipend", icon: <ReceiptIndianRupee /> },
  { href: "/intern/documents", label: "Documents", icon: <BadgeCheck /> },
  { href: "/intern/profile", label: "Your profile", icon: <CircleUserRound /> },
  { href: "/intern/college", label: "College", icon: <GraduationCap /> },
  { href: "/intern/notifications", label: "Notifications", icon: <Bell /> },
  { href: "/intern/settings", label: "Settings", icon: <Settings2 /> },
];

/**
 * The intern shell.
 *
 * The stage and the attention list are derived here, once, from the rows the
 * candidate already owns, and handed down as props. A screen therefore cannot
 * show a navigation item that does not apply to this person, and the attention
 * dot cannot disagree with the status strip, because both come from the same
 * Thread.
 *
 * Everything below this is a child, so the sidebar and the tab bar are decided
 * by the database rather than by a route segment. That is the whole mechanism
 * behind "the app changes shape when the job starts".
 */
export default async function InternLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (!session || session.role !== "intern") redirect("/login?as=intern");

  // Independent reads, in parallel. loadInternData is cache()d, so the page's own call reuses this one.
  const [data, name, [unread], college] = await Promise.all([
    loadInternData(session.uid),
    fullName(session.uid),
    getDb()
      .select({ value: count() })
      .from(schema.notifications)
      .where(
        and(
          eq(schema.notifications.recipientType, "intern"),
          eq(schema.notifications.recipientId, session.uid),
          eq(schema.notifications.isRead, false),
        ),
      ),
    // Only college members heartbeat; "View as" must not mark the student online.
    session.impersonator ? null : membershipOf(session.uid).catch(() => null),
  ]);
  const action = nextAction(data.thread);
  const attentionHrefs = action ? [action.href ?? "/intern/dashboard"] : [];

  // Uploaded photos only; a saved outside URL is never rendered.
  const photoUrl = data.document?.profilePhotoName ? "/api/intern/avatar" : null;
  const unreadAlerts = Number(unread?.value ?? 0);

  const main = STAGE_NAV[data.stage].map((item) => ({
    ...item,
    attention: attentionHrefs.some((h) => h.startsWith(item.href)) && item.href !== "/intern/dashboard",
  }));
  const more = MORE_NAV.filter((i) => !main.some((m) => m.href === i.href)).map((i) =>
    i.href === "/intern/notifications" && unreadAlerts > 0 ? { ...i, badge: unreadAlerts > 99 ? "99+" : unreadAlerts } : i,
  );

  return (
    <ConsoleShell
      homeHref="/intern/dashboard"
      groups={[{ items: main }, { title: "More", items: more }]}
      tabs={main}
      account={{ name, email: session.email, photoUrl }}
      menu={[
        { href: "/intern/profile", label: "Your profile", icon: <CircleUserRound /> },
        { href: "/intern/documents", label: "Documents", icon: <BadgeCheck /> },
        { href: "/intern/settings", label: "Settings & bank details", icon: <Settings2 /> },
      ]}
      alerts={{ href: "/intern/notifications", count: unreadAlerts }}
      help={{ faqHref: "/faq#interns", contactHref: "/contact", email: SITE.email }}
      signOutTo="/login?as=intern"
      initialCollapsed={(await cookies()).get(RAIL_COOKIE)?.value === "1"}
      rootCrumb={{ label: "Home", href: "/intern/dashboard" }}
      // Detail pages read "Offers", not "Offers / Details": the title names the record.
      crumbParents={{}}
      width="reading"
      tone="light"
      banner={session.impersonator ? <ViewAsBanner viewing={name} admin={session.impersonator.email} /> : null}
    >
      {/* Presence, drive banner and call alerts only exist for partner colleges. */}
      {college?.isPartner ? (
        <CollegeLive
          collegeName={college.name}
          vapidKey={process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? ""}
        />
      ) : null}
      {children}
    </ConsoleShell>
  );
}

/** The session carries the email only, so the name is one indexed read. */
async function fullName(uid: string): Promise<string> {
  const db = getDb();
  const [row] = await db
    .select({ first: schema.users.firstName, last: schema.users.lastName })
    .from(schema.users)
    .where(eq(schema.users.id, uid))
    .limit(1);
  const name = `${row?.first ?? ""} ${row?.last ?? ""}`.trim();
  return name || "Candidate";
}

