import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";

import { getDb, schema } from "@/lib/db";
import { getAccountType, isCodeVerifiedMembership, type AccountType } from "@/lib/intern-account";
import { isInternPaid } from "@/lib/payments";

import { collegeHomeState, type CollegeHomeState } from "./identity-match";

/** What decides which Home an intern gets, read fresh from the database (never from the browser). */
export type CollegeAccountState = {
  accountType: AccountType | null;
  collegeId: string | null;
  codeVerified: boolean;
  paid: boolean;
  home: CollegeHomeState;
};

export async function collegeAccountState(uid: string): Promise<CollegeAccountState> {
  const db = getDb();
  const [[onb], [m], paid] = await Promise.all([
    db.select({ extraData: schema.internOnboarding.extraData }).from(schema.internOnboarding).where(eq(schema.internOnboarding.userId, uid)).limit(1),
    db
      .select({ collegeId: schema.collegeMemberships.collegeId, status: schema.collegeMemberships.status, verifiedBy: schema.collegeMemberships.verifiedBy, leftAt: schema.collegeMemberships.leftAt })
      .from(schema.collegeMemberships)
      .where(eq(schema.collegeMemberships.userId, uid))
      .limit(1),
    isInternPaid(uid),
  ]);
  const accountType = getAccountType(onb?.extraData);
  const codeVerified = isCodeVerifiedMembership(m);
  return { accountType, collegeId: m && !m.leftAt ? m.collegeId : null, codeVerified, paid, home: collegeHomeState({ accountType, codeVerified, paid }) };
}

export const COLLEGE_ACCOUNT_PAY_BLOCK = "Your college is paying for your account. Enter the promo code on your Home page, or switch to an individual account to pay yourself.";

/**
 * A college account whose fee is not yet paid gets no other way to settle it: not a card, not another code
 * route. Those would skip the name, phone and email check the promo field makes, so they answer 409 here and
 * the intern switches to an individual account (which is always allowed) to pay for themselves.
 */
export async function collegeAccountPayBlock(uid: string): Promise<NextResponse | null> {
  const s = await collegeAccountState(uid);
  return s.home === "college_unpaid" ? NextResponse.json({ error: COLLEGE_ACCOUNT_PAY_BLOCK, code: "college_account" }, { status: 409 }) : null;
}
