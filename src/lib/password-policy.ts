/**
 * The password rule as forms state it, in one place (QA-016: the admin
 * account page stated a weaker rule above the form than the one under it).
 * Client-safe; the check itself is `isStrongPassword` in lib/security/password.
 */
export const PASSWORD_HINT = "At least 8 characters, with a lowercase letter, an uppercase letter, a number and a special character.";
