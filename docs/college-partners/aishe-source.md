# AISHE institution list: where it comes from and what's in it

Checked 2026-10-27. The downloads below were run today from the live AISHE directory, and the headers, row counts and sizes come from the actual files. A scratch copy of the three files is at `/tmp/claude-1000/-home-wynautbhav-Desktop-nextjs-findtern/757422bf-5c01-42c6-bc5f-333d71fd6455/scratchpad/dl/` and is not committed.

## 1. Canonical source

| What | URL |
|---|---|
| AISHE portal home (MoE, Dept. of Higher Education; hosted by NIC) | https://aishe.gov.in/aishe/home |
| **Higher Education Institution Directory** (the live list) | https://dashboard.aishe.gov.in/hedirectory/#/hedirectory |
| All universities | https://dashboard.aishe.gov.in/hedirectory/#/hedirectory/universityDetails/U/ALL |
| All colleges | https://dashboard.aishe.gov.in/hedirectory/#/hedirectory/universityDetails/C/ALL |
| All standalone institutions | https://dashboard.aishe.gov.in/hedirectory/#/hedirectory/universityDetails/S/ALL |
| "Know your AISHE code" lookup (single institution) | https://dcf.aishe.nic.in/aishenew/#/details/knowAisheCode |
| Website policies (copyright/reuse terms) | https://aishe.gov.in/website-policies/ |
| Mirror with an explicit licence (AIKOSH / IndiaAI) | https://aikosh.indiaai.gov.in/home/datasets/details/all_colleges_as_per_aishe_dashboard_3.html (also `all_universities_as_per_aishe_dashboard.html` and `all_standalone_as_per_aishe_dashboard.html`) |

## 2. Counts on 2026-10-27 (directory landing page)

| Bucket | Count | Type sub-lists (route code → count) |
|---|---|---|
| Universities | **1,437** | U/01 Central 59 · U/02 State Public 492 · U/03 State Private 546 · U/10 State Open 19 · U/04 Deemed–Govt 43 · U/06 Deemed–Private 101 · U/09 Central Open 1 · U/11 State Private Open 0 · U/08 Institute under State Legislature Act 6 · U/05 Deemed–Govt Aided 11 |
| Colleges | **54,436** | C/1 Affiliated 49,917 · C/2 Constituent/University College 2,621 · C/3 Recognized Centre 1,069 · C/4 PG/Off-Campus Centre 249 · C/5 Autonomous 579 |
| Standalone | **17,045** | S/1 Paramedical 1,751 · S/2 Technical/Polytechnic 5,359 · S/3 Nursing (Diploma) 4,904 · S/4 Teacher Training 3,930 · S/5 Under Ministry 156 · S/6 Hotel Mgmt 95 · S/7 PGDM 355 · S/8 Pharmacy 309 · S/9 RCI 39 · S/10 Ayurvedic Nursing 142 · S/11 Medical Board 5 · S/12 Journalism 0 |
| Institutes of National Importance | 169 (shown separately) | IIT 23, NIT 31, IIIT 25, IIM 22, AIIMS 20, … |
| R&D institutes | 289 | — |

The university type sub-lists only add up to 1,278. The other ~159 are probably the INIs, which have their own `universityDetails/INI/...` routes. This is unconfirmed: dedupe on `Aishe Code` when merging.

## 3. Download steps (manual, no login)

1. Open one of the three "All …" URLs above in a desktop browser.
2. **Colleges only:** the table stays empty until you open the **State** dropdown. Opening it selects "ALL" and loads all 54,436 rows, which takes about 10–15 seconds.
3. At the top-right of the table there are two download icons:
   - the **green** icon (tooltip "Download as Excel") gives an `.xlsx`
   - the **red** icon gives a PDF; don't use it for import.
4. The Excel file is built in the browser, so it is not a stable server URL. Today's file names and sizes:
   - `University-ALL UNIVERSITIES.xlsx`: 0.55 MB, 1,437 rows
   - `College-ALL COLLEGE.xlsx`: 37.8 MB, 54,436 rows
   - `Standalone-ALL STANDALONE.xlsx`: 7.6 MB, 17,045 rows
   - Per-type lists work the same way, e.g. `University-State Private University.xlsx`.
5. There is no public bulk API. The JSON backend (`https://pdf.aishe.nic.in/aisheinstitutemanagement/institutionDirectory%20/getUniversityList?...`) takes **encrypted query parameters** and only allows CORS from `dashboard.aishe.gov.in`. Don't scrape it; use the manual Excel export and re-import each quarter.

## 4. Column layout (from the exported .xlsx)

Every file has the same 3-row preamble. **Skip rows 1–3**; data starts at row 4.

```
Row 1: <list title>                 e.g. "ALL COLLEGE"
Row 2: (As on Date:  27-10-2026  14:40:40)
Row 3: header row
```

**Universities** (`A:G`)
| Col | Header | Example (JKLU) |
|---|---|---|
| A | Aishe Code | `U-0657` |
| B | Name | `JK LAKSHMIPAT UNIVERSITY` |
| C | State | `Rajasthan` |
| D | District | `Jaipur` |
| E | Website | `www.jklu.edu.in` |
| F | Year Of Establishment | `2011` (62 rows have `-` and 8 have `0`) |
| G | Location | `Rural` / `Urban` / `-` |

The on-screen table has a **University Type** column, but the Excel export leaves it out. To get the type, download each U/xx sub-list and tag the rows by file, or join on code.

**Colleges** (`A:L`)
| Col | Header | Notes |
|---|---|---|
| A | Aishe Code | `C-#####`, unique (54,436 distinct) |
| B | Name | 133 rows start with a university roll prefix such as `061-` or `100002-`. Strip `^\d+\s*-` for display and keep the raw value. |
| C | State | UP 9,427 · MH 6,293 · KA 5,138 · **RJ 4,742** · MP 3,583 |
| D | District | |
| E | Website | 5,428 are blank, `-` or `NA` |
| F | Year Of Establishment | |
| G | Location | Rural 32,602 · Urban 21,109 · `-` 725 |
| H | College Type | Affiliated College / Constituent / University College / Recognized Center / Autonomous College / PG Center / Off-Campus Center / Other |
| I | **Manegement** (misspelled in the source) | Private Un-Aided 37,563 · State Govt 6,913 · Private Aided 5,930 · University 2,674 · Local Body 679 · Central Govt 403 · `-` 274 |
| J | University Aishe Code | FK to the university list (`U-####`); 49 rows are blank |
| K | University Name | |
| L | University Type | |

**Standalone** (`A:H`)
| Col | Header |
|---|---|
| A | Aishe Code (`S-####`) |
| B | Name (some also have a numeric prefix, e.g. `1006-Government Polytechnic, Murtijapur`) |
| C | State |
| D | District |
| E | Year Of Establishment |
| F | Location |
| G | Standalone Type |
| H | Manegement |

## 5. Data-quality notes for the onboarding dropdown

- 457 college names are duplicated after the prefix is stripped. The picker has to show `Name — District, State` and store the `aishe_code`, never the name.
- The code prefix gives the type: `U-` for a university, `C-` for a college, `S-` for a standalone. Use one `institutions` table with `aishe_code` (PK, text), `kind` (U/C/S), `name`, `name_display`, `state`, `district`, `website`, `year_established`, `location`, `college_type`, `management`, `parent_university_code`, `source_as_on` (date taken from row 2), and `imported_at`.
- About 73k rows is too many for an eager list. Use search-as-you-type over a trigram index, with a state chip to narrow the results.
- Add a "My college isn't listed" path that captures free text and queues it for manual mapping. AISHE coverage of newly registered institutions lags.
- Partner colleges (the paying ones) should be pinned and ranked first in the picker.

## 6. Licence and terms (flag: ambiguous)

- The AISHE website policy (https://aishe.gov.in/website-policies/, read 2026-10-27) says two things: "Contents of this website may not be reproduced partially or fully, without due permission from Ministry of Education. If referred to as a part of another website, the source must be appropriately acknowledged." It also says: "The material may be downloaded without requiring specific prior permission. Any other proposed use of the material is subject to the approval of Department of Higher Education."
- The AIKOSH (IndiaAI) mirror of the same lists is labelled **"Open Government License, India"**, with Dept. of Higher Education, MoE as the source. That mirror was uploaded about 10 months ago (metadata date 10/12/25), so it is older than the live directory.
- **Recommendation:** Treat the AIKOSH copy under GODL-India as the licensed basis and refresh codes from the live directory. Show the attribution "Source: AISHE, Ministry of Education, Government of India". Before using the list commercially at scale, email the AISHE Statistics Division (contact via aishe.gov.in) for written permission. We only use names and codes as reference data, so the risk is low, but it isn't zero.

## 7. JK Lakshmipat University

**AISHE code `U-0657`**. JK LAKSHMIPAT UNIVERSITY, State Private University, Jaipur, Rajasthan, est. 2011, Location "Rural", www.jklu.edu.in. Confirmed 2026-10-27 in two places: the directory's State Private University list (JSON row) and the `ALL UNIVERSITIES` Excel export. It is a university, so its students pick it directly. It has no `C-` affiliated colleges to choose from.
