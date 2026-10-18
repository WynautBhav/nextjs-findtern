/**
 * PARTNERS, TESTIMONIALS, SKILLS - real CMS content.
 *
 * Pulled from the live Findtern API on 2026-10-02:
 *   GET https://findtern.in/api/website/partners   → 9 rows
 *   GET https://findtern.in/api/website/faces      → 3 rows
 *   GET https://findtern.in/api/website/skills     → 11 rows
 *
 * Every logo and avatar upstream is a base64 data URI inside the JSON body
 * - 1.9 MB of inline image data across the three endpoints. They are decoded
 * to real files under /public/media and converted to WebP here, which takes
 * the payload from 1.64 MB to about 168 KB. The API still serves data URIs;
 * when the data layer is wired to the database directly, these rows come back
 * as file paths and the image handling collapses to a plain <img src>.
 *
 * Provenance: these are Findtern's own partner and customer records. Do not
 * replace them with placeholder rows.
 */

import type { CmsPartner, CmsHappyFace, CmsFeaturedSkill } from "./types";

export const PARTNERS: CmsPartner[] = [
  {
    "id": "0905a39b-c71a-498d-a6bd-44751149dbb5",
    "name": "TCS",
    "logoUrl": "/media/partner-1-tcs.webp",
    "href": null,
    "sortOrder": 0,
    "isActive": true
  },
  {
    "id": "ff2af026-60bc-4e39-8cc9-8744a887e6c4",
    "name": "Visa and beyond",
    "logoUrl": "/media/partner-2-visa-and-beyond.webp",
    "href": null,
    "sortOrder": 1,
    "isActive": true
  },
  {
    "id": "2d308016-3c18-4888-8c3f-5d4363fb55d3",
    "name": "Friscon",
    "logoUrl": "/media/partner-3-friscon.webp",
    "href": null,
    "sortOrder": 2,
    "isActive": true
  },
  {
    "id": "47cf29c1-a8d2-4a39-8efa-cb5a4c02039d",
    "name": "Silvoraa",
    "logoUrl": "/media/partner-4-silvoraa.webp",
    "href": null,
    "sortOrder": 3,
    "isActive": true
  },
  {
    "id": "da749447-68e5-4c97-8279-e5ff6a4ddfa5",
    "name": "Stagelife India",
    "logoUrl": "/media/partner-5-stagelife-india.webp",
    "href": null,
    "sortOrder": 4,
    "isActive": true
  },
  {
    "id": "2e5741a7-7cf7-4a5a-a892-71cc14b7e4e8",
    "name": "Manari India",
    "logoUrl": "/media/partner-6-manari-india.webp",
    "href": null,
    "sortOrder": 5,
    "isActive": true
  },
  {
    "id": "ee0fa4d2-68f5-4bb8-950d-13c232a262cb",
    "name": "Event",
    "logoUrl": "/media/partner-7-event.webp",
    "href": null,
    "sortOrder": 6,
    "isActive": true
  },
  {
    "id": "6531d374-b448-434b-956c-6e42c48fd40b",
    "name": "Incruiter",
    "logoUrl": "/media/partner-8-incruiter.webp",
    "href": null,
    "sortOrder": 7,
    "isActive": true
  },
  {
    "id": "5ebe0e63-b126-468b-a9ab-6756a9a977ed",
    "name": "XS Associates",
    "logoUrl": "/media/partner-9-xs-associates.webp",
    "href": null,
    "sortOrder": 8,
    "isActive": true
  }
];

export const HAPPY_FACES: CmsHappyFace[] = [
  {
    "id": "3baded28-d342-430c-bf4c-642abfc92c15",
    "quote": "As a growing startup, Findtern gave us access to quality interns exactly when we needed them.",
    "title": "Co-Founder",
    "name": "Rishi Parashar",
    "company": "Manari India",
    "avatarUrl": "/media/face-1-rishi-parashar.webp",
    "sortOrder": 0,
    "isActive": true
  },
  {
    "id": "b3b2321d-2bc0-4a7b-8b09-c14295fbdbab",
    "quote": "Findtern helped us hire skilled interns without the usual hiring stress. Simple, fast, and reliable.",
    "title": "Director",
    "name": "Sulabh Jain",
    "company": "Solitaire Pharma",
    "avatarUrl": "/media/face-2-sulabh-jain.webp",
    "sortOrder": 1,
    "isActive": true
  },
  {
    "id": "aaec8ebe-b3fe-4162-ab90-30f7d59d6f2a",
    "quote": "Hiring interns used to take weeks. With Findtern, we found the right talent in days-pre-vetted and ready to contribute",
    "title": "Founder",
    "name": "Anubhav Sharma",
    "company": "Stagelife Weddings",
    "avatarUrl": "/media/face-3-anubhav-sharma.webp",
    "sortOrder": 2,
    "isActive": true
  }
];

export const FEATURED_SKILLS: CmsFeaturedSkill[] = [
  {
    "id": "1bbedd42-44be-4e11-a209-254442f8b89a",
    "title": "Design",
    "iconClass": "fa-pen-nib",
    "metaText": null,
    "resourceCount": 57,
    "href": null,
    "sortOrder": 0,
    "isActive": true
  },
  {
    "id": "cbc9c1e5-c4f5-427c-8052-553f0d14c386",
    "title": "Sales",
    "iconClass": "fa-chart-line",
    "metaText": null,
    "resourceCount": 73,
    "href": null,
    "sortOrder": 1,
    "isActive": true
  },
  {
    "id": "eb8f6b49-fdf9-4d13-9fd6-199bcc479980",
    "title": "Marketing",
    "iconClass": "fa-bullhorn",
    "metaText": null,
    "resourceCount": 23,
    "href": null,
    "sortOrder": 2,
    "isActive": true
  },
  {
    "id": "5a01749f-4752-4090-9d8e-81dcf8c21ee5",
    "title": "Finance",
    "iconClass": "fa-wallet",
    "metaText": null,
    "resourceCount": 17,
    "href": null,
    "sortOrder": 3,
    "isActive": true
  },
  {
    "id": "e831dfa8-2be3-434d-97f2-ef8b0bc8aded",
    "title": "Technology",
    "iconClass": "fa-desktop",
    "metaText": null,
    "resourceCount": 117,
    "href": null,
    "sortOrder": 4,
    "isActive": true
  },
  {
    "id": "a3fe3ca2-f562-4f83-8c7a-58306bee4c93",
    "title": "Engineering",
    "iconClass": "fa-code",
    "metaText": null,
    "resourceCount": 48,
    "href": null,
    "sortOrder": 5,
    "isActive": true
  },
  {
    "id": "0ea3b993-5bb4-43d2-b577-7adae8761326",
    "title": "Business",
    "iconClass": "fa-briefcase",
    "metaText": null,
    "resourceCount": 96,
    "href": null,
    "sortOrder": 6,
    "isActive": true
  },
  {
    "id": "1f42a5e6-006e-4239-8841-38d7716960da",
    "title": "Human Resource",
    "iconClass": "fa-users",
    "metaText": null,
    "resourceCount": 55,
    "href": null,
    "sortOrder": 7,
    "isActive": true
  },
  {
    "id": "d5ee95ab-ad7d-4447-a300-59c45a28e605",
    "title": "Social media and Content",
    "iconClass": "fa-bullhorn",
    "metaText": null,
    "resourceCount": 9,
    "href": null,
    "sortOrder": 8,
    "isActive": true
  },
  {
    "id": "eea244b2-e7dc-4959-9474-2078ec5ca609",
    "title": "Operations",
    "iconClass": "fa-briefcase",
    "metaText": null,
    "resourceCount": 61,
    "href": null,
    "sortOrder": 9,
    "isActive": true
  },
  {
    "id": "f0719b5a-c355-4865-8cf4-498c60a74dd3",
    "title": "Healthcare",
    "iconClass": "fa-star",
    "metaText": null,
    "resourceCount": 2,
    "href": null,
    "sortOrder": 10,
    "isActive": true
  }
];
