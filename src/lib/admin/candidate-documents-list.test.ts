import assert from "node:assert/strict";
import { test } from "node:test";

import { listCandidateDocuments } from "./candidate-documents-list.ts";

test("ADP-28: every document on the record, in legacy order", () => {
  const docs = listCandidateDocuments(
    { profilePhotoName: "p.jpg", introVideoName: "", aadhaarImageName: "a.png", panImageName: null },
    {
      academics: {
        marksheetUploads: [{ name: "academics/m1.pdf", label: "Class 12", type: "application/pdf", size: 10 }, { name: "" }],
        certifications: [{ certificateName: "AWS", certificateUploads: [{ name: "c1.pdf", originalName: "aws.pdf", type: "application/pdf", size: 5 }] }],
      },
    },
  );
  assert.deepEqual(
    docs.map((d) => [d.label, d.key, d.group]),
    [
      ["Profile photo", "p.jpg", "Media"],
      ["Aadhaar card", "a.png", "Identity"],
      ["Marksheet: Class 12", "academics/m1.pdf", "Academics"],
      ["AWS certificate (aws.pdf)", "c1.pdf", "Academics"],
    ],
  );
});

test("no record, no documents", () => {
  assert.deepEqual(listCandidateDocuments(null, null), []);
});
