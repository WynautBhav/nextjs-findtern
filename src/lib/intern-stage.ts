/**
 * Which step of "Before employers can find you" an intern is on, and what the
 * dashboard may say about money at that step. Pure, so it is tested without a
 * page (bug sheet 12 Nov, row 17).
 */

/** 0 profile, 1 activation, 2 AI interview. */
export type GettingStartedStage = 0 | 1 | 2;

/**
 * A candidate who has paid can always take the interview. Profile rules
 * tightened after some candidates paid (Aadhaar, PAN image, emergency
 * contact); they still owe those fields, but that must never hide the
 * interview they already paid for.
 */
export function gettingStartedStage(input: { profileComplete: boolean; activated: boolean; scored: boolean }): GettingStartedStage {
  const { profileComplete, activated, scored } = input;
  return activated && !scored ? 2 : !profileComplete ? 0 : !activated ? 1 : 2;
}

/**
 * The activation fee appears only once the profile is complete: shown while
 * someone is still building it, the price can stop them finishing (row 17).
 * The server gate is untouched; activation already needs a complete profile.
 */
export function showFee(stage: GettingStartedStage): boolean {
  return stage >= 1;
}
