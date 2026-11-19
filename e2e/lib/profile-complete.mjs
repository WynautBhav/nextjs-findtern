/**
 * A profile that passes the hire gate (B-62: `hireGateDecision` / `isProfileSubmittedComplete`), for specs whose intern accepts an
 * offer or whose employer opens an order. The gate is NOT weakened: the intern genuinely has a submitted, complete profile.
 * Seeded demo interns and `mkIntern` rows are incomplete by design, so a spec that needs to hire one calls this first.
 *
 *   const undo = await completeProfile(q, internId);   // q(sql, params) => rows
 *   ... run the scenario ...
 *   await undo();                                      // restores the onboarding row and the documents row
 *
 * Aadhaar and PAN have unique indexes, so both are derived from the user id. Call it AFTER a spec saves the intern's academics:
 * what is already stored under extra_data.academics (semester, proofs) is kept, the fixture only fills the gaps.
 */
const digits = (id, n) => {
  let h = 7;
  for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) % 1_000_000_007;
  return String(h).padStart(n, "0").slice(0, n);
};
const letters = (id, n) => {
  let h = 11;
  for (const ch of id) h = (h * 37 + ch.charCodeAt(0)) % 1_000_000_007;
  return Array.from({ length: n }, (_, i) => String.fromCharCode(65 + ((h >> (i * 3)) % 26))).join("");
};

export function completeProfileFields(userId) {
  return {
    city: "Pune",
    state: "Maharashtra",
    pinCode: "411001",
    skills: ["React", "SQL", "Excel", "Python"].map((name) => ({ name, rating: 3 })),
    locationTypes: ["remote"],
    hasLaptop: true,
    aadhaarNumber: `2${digits(userId, 8)}${digits(userId.split("").reverse().join(""), 3)}`,
    panNumber: `${letters(userId, 5)}${digits(userId, 4)}${letters(userId.split("").reverse().join(""), 1)}`,
    extra: {
      profileSubmittedAt: new Date().toISOString(),
      languages: [{ id: "l1", language: "english", level: "professional", read: true, write: true, speak: true }],
      emergencyPhone: "9812345678",
      emergencyName: "Asha Rao",
      emergencyRelation: "Mother",
      ndaAcceptedAt: new Date().toISOString(),
      academics: { qualificationLevel: "Bachelor", status: "Pursuing", institution: "ABC College", degree: "B.Tech", startYear: "2023" },
    },
  };
}

export async function completeProfile(q, userId) {
  const f = completeProfileFields(userId);
  const { academics, ...rest } = f.extra;
  const [before] = await q("select id, city, state, pin_code, skills, location_types, has_laptop, aadhaar_number, pan_number, extra_data from intern_onboarding where user_id = $1 order by created_at desc limit 1", [userId]);
  if (!before) throw new Error(`completeProfile: no intern_onboarding row for ${userId}`);
  const [docBefore] = await q("select id, profile_photo_name, pan_image_name, aadhaar_image_name from intern_document where user_id = $1 order by created_at desc limit 1", [userId]);
  await q(
    `update intern_onboarding set city = $2, state = $3, pin_code = $4, skills = $5::jsonb, location_types = $6::jsonb, has_laptop = $7,
       aadhaar_number = $8, pan_number = $9, extra_data = coalesce(extra_data, '{}'::jsonb) || $10::jsonb
         || jsonb_build_object('academics', $11::jsonb || coalesce(extra_data->'academics', '{}'::jsonb)) where id = $1`,
    [before.id, f.city, f.state, f.pinCode, JSON.stringify(f.skills), JSON.stringify(f.locationTypes), f.hasLaptop, f.aadhaarNumber, f.panNumber, JSON.stringify(rest), JSON.stringify(academics)],
  );
  let insertedDoc = null;
  if (docBefore) {
    await q("update intern_document set profile_photo_name = 'e2e-photo.png', pan_image_name = 'e2e-pan.png', aadhaar_image_name = 'e2e-aadhaar.png' where id = $1", [docBefore.id]);
  } else {
    insertedDoc = (await q("insert into intern_document (user_id, profile_photo_name, pan_image_name, aadhaar_image_name) values ($1, 'e2e-photo.png', 'e2e-pan.png', 'e2e-aadhaar.png') returning id", [userId]))[0].id;
  }
  return async () => {
    await q(
      `update intern_onboarding set city = $2, state = $3, pin_code = $4, skills = $5::jsonb, location_types = $6::jsonb, has_laptop = $7,
         aadhaar_number = $8, pan_number = $9, extra_data = $10::jsonb where id = $1`,
      [before.id, before.city, before.state, before.pin_code, JSON.stringify(before.skills), JSON.stringify(before.location_types), before.has_laptop, before.aadhaar_number, before.pan_number, JSON.stringify(before.extra_data)],
    );
    if (insertedDoc) await q("delete from intern_document where id = $1", [insertedDoc]);
    else if (docBefore) await q("update intern_document set profile_photo_name = $2, pan_image_name = $3, aadhaar_image_name = $4 where id = $1", [docBefore.id, docBefore.profile_photo_name, docBefore.pan_image_name, docBefore.aadhaar_image_name]);
  };
}
