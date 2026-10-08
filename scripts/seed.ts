/**
 * Seed the dev database with realistic data so every screen has rich,
 * authentic data to render.
 *
 * ── DEMO CREDENTIALS ──────────────────────────────────────────────────
 * Admin:    admin@findtern.dev       / Findtern@2026  (Priya Raghavan)
 * Employer: hiring@northwind.dev     / Findtern@2026  (Arjun Mehta - Northwind Labs)
 * Intern:   candidate@findtern.dev   / Findtern@2026  (Sana Kapoor)
 * Intern:   rohan@findtern.dev       / Findtern@2026  (Rohan Iyer)
 * Intern:   meera@findtern.dev       / Findtern@2026  (Meera Nair)
 * ──────────────────────────────────────────────────────────────────────
 *
 * Dev only. Refuses to run if NODE_ENV is production.
 */
import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";

import * as schema from "../src/lib/db/schema.ts";
import { hashPassword } from "../src/lib/security/password.ts";
import { PRICING_PLANS, PRICING_PLANS_USD } from "../src/lib/content/home.ts";

const PASSWORD = "Findtern@2026";

interface Account {
  role: "admin" | "employer" | "intern";
  email: string;
  name: string;
}

const PRIMARY_ACCOUNTS: Account[] = [
  { role: "admin", email: "admin@findtern.dev", name: "Priya Raghavan" },
  { role: "employer", email: "hiring@northwind.dev", name: "Arjun Mehta" },
  { role: "intern", email: "candidate@findtern.dev", name: "Sana Kapoor" },
  { role: "intern", email: "rohan@findtern.dev", name: "Rohan Iyer" },
  { role: "intern", email: "meera@findtern.dev", name: "Meera Nair" },
];

const INDIAN_CITIES = [
  { city: "Bengaluru", state: "Karnataka" },
  { city: "Mumbai", state: "Maharashtra" },
  { city: "Pune", state: "Maharashtra" },
  { city: "Delhi", state: "Delhi" },
  { city: "Hyderabad", state: "Telangana" },
  { city: "Chennai", state: "Tamil Nadu" },
  { city: "Kolkata", state: "West Bengal" },
  { city: "Ahmedabad", state: "Gujarat" },
  { city: "Kochi", state: "Kerala" },
  { city: "Jaipur", state: "Rajasthan" },
  { city: "Chandigarh", state: "Punjab" },
  { city: "Lucknow", state: "Uttar Pradesh" },
  { city: "Indore", state: "Madhya Pradesh" },
  { city: "Bhubaneswar", state: "Odisha" },
];

const COLLEGES = [
  { name: "IIT Bombay", degree: "B.Tech Computer Science" },
  { name: "BITS Pilani", degree: "B.E. Computer Science" },
  { name: "NIT Trichy", degree: "B.Tech Information Technology" },
  { name: "DTU Delhi", degree: "B.Tech Software Engineering" },
  { name: "RVCE Bengaluru", degree: "B.E. Information Science" },
  { name: "COEP Pune", degree: "B.Tech Computer Engineering" },
  { name: "VIT Vellore", degree: "B.Tech Computer Science" },
  { name: "SRM Chennai", degree: "B.Tech Data Science" },
  { name: "Christ University", degree: "BCA Computer Applications" },
  { name: "Symbiosis Institute Pune", degree: "BDes User Experience" },
  { name: "PES University Bengaluru", degree: "B.Tech Artificial Intelligence" },
  { name: "Manipal Institute of Technology", degree: "B.Tech Computer Engineering" },
  { name: "IIIT Hyderabad", degree: "B.Tech Computer Science" },
  { name: "Delhi University", degree: "BSc Computer Science" },
  { name: "Anna University Chennai", degree: "B.E. Computer Science" },
];

const DOMAINS_AND_SKILLS = [
  { domain: "Frontend", skills: ["React", "TypeScript", "Tailwind CSS", "Next.js", "State Management"] },
  { domain: "Backend", skills: ["Node.js", "PostgreSQL", "REST APIs", "Redis", "Docker"] },
  { domain: "Full Stack", skills: ["React", "Node.js", "PostgreSQL", "GraphQL", "Tailwind CSS"] },
  { domain: "UI/UX Design", skills: ["Figma", "Design Systems", "User Research", "Wireframing", "Prototyping"] },
  { domain: "Mobile", skills: ["React Native", "TypeScript", "Mobile UI", "REST APIs", "Redux"] },
  { domain: "Data & ML", skills: ["Python", "SQL", "Pandas", "Scikit-Learn", "Data Visualization"] },
  { domain: "DevOps", skills: ["Docker", "Kubernetes", "Linux", "AWS", "CI/CD Pipelines"] },
  { domain: "Design Engineering", skills: ["GSAP", "Tailwind CSS", "React", "CSS Animation", "Figma"] },
];

const FIRST_NAMES = [
  "Aarav", "Diya", "Ishaan", "Tanvi", "Vikram", "Sneha", "Aditya", "Pooja", "Siddharth", "Ananya",
  "Rishi", "Kavya", "Varun", "Rhea", "Arnav", "Tara", "Kabir", "Meera", "Karan", "Ishita",
  "Nikhil", "Prerna", "Dhruv", "Isha", "Aryan", "Aishwarya", "Dev", "Neha", "Samarth", "Shruti",
  "Tushar", "Pallavi", "Gaurav", "Simran", "Rahul", "Nandini", "Harsh", "Avani", "Manish", "Bhavna",
  "Akash", "Swati", "Suresh", "Divya", "Deepak", "Anushka", "Pranav", "Sanjana", "Yash", "Ritu",
  "Kunal", "Shreya", "Abhishek", "Sakshi", "Chirag", "Priyanka", "Mayank", "Natasha", "Naveen", "Jyoti",
];

const LAST_NAMES = [
  "Sharma", "Patel", "Iyer", "Reddy", "Nair", "Kulkarni", "Verma", "Bhatt", "Malhotra", "Menon",
  "Rao", "Joshi", "Deshmukh", "Choudhury", "Gupta", "Kapoor", "Chatterjee", "Mishra", "Mehta", "Bansal",
  "Aggarwal", "Pillai", "Pandey", "Singhania", "Mukherjee", "Saxena", "Chawla", "Bhatia", "Gowda", "Sengupta",
];

const COMPANIES = [
  { name: "Northwind Labs", email: "hiring@northwind.dev", city: "Bengaluru", state: "Karnataka", size: "11-50", industry: "Developer Tools" },
  { name: "Razorpay Capital", email: "talent@razorpay-cap.dev", city: "Bengaluru", state: "Karnataka", size: "201-500", industry: "Fintech" },
  { name: "Swiggy Instamart Labs", email: "careers@swiggy-labs.dev", city: "Bengaluru", state: "Karnataka", size: "500+", industry: "Quick Commerce" },
  { name: "CRED Studio", email: "design@cred-studio.dev", city: "Bengaluru", state: "Karnataka", size: "201-500", industry: "Design & Fintech" },
  { name: "Zerodha Tech", email: "engineering@zerodha-tech.dev", city: "Bengaluru", state: "Karnataka", size: "51-200", industry: "Capital Markets" },
  { name: "Urban Company Design", email: "hiring@urbancompany-ds.dev", city: "Gurugram", state: "Haryana", size: "500+", industry: "Home Services" },
  { name: "Postman API Labs", email: "fellowship@postman-labs.dev", city: "Bengaluru", state: "Karnataka", size: "201-500", industry: "API Infrastructure" },
  { name: "Groww Platforms", email: "tech@groww-platforms.dev", city: "Bengaluru", state: "Karnataka", size: "201-500", industry: "WealthTech" },
  { name: "BrowserStack India", email: "interns@browserstack-in.dev", city: "Mumbai", state: "Maharashtra", size: "500+", industry: "Testing Infrastructure" },
  { name: "Hasura Systems", email: "careers@hasura-systems.dev", city: "Bengaluru", state: "Karnataka", size: "51-200", industry: "GraphQL & Data" },
  { name: "CleverTap Growth", email: "talent@clevertap-growth.dev", city: "Mumbai", state: "Maharashtra", size: "201-500", industry: "Customer Engagement" },
  { name: "Ather Energy IoT", email: "ev-interns@atherenergy-iot.dev", city: "Bengaluru", state: "Karnataka", size: "500+", industry: "Clean Mobility & IoT" },
];

async function main() {
  if (process.env.NODE_ENV === "production") {
    throw new Error("Refusing to seed demo accounts in production");
  }

  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set — run via `npm run db:seed`");

  const client = new pg.Client({ connectionString: url });
  await client.connect();
  const db = drizzle(client, { schema });

  console.log("Cleaning existing tables for fresh seed…");
  await client.query(`
    TRUNCATE TABLE 
      contact_messages, promo_code_usages, promo_codes, 
      notifications, timesheets, proposals, 
      employer_cart_items, profile_views, employer_saved_searches,
      intern_document, employer_payments, intern_payouts, intern_payments,
      interviews, intern_onboarding, projects, 
      password_reset_tokens, email_otps, 
      pricing_plans, employers, users, admins, admin_roles
    CASCADE;
  `);

  const pw = await hashPassword(PASSWORD);

  // ── Admin ────────────────────────────────────────────────────────────
  console.log("Seeding admin and roles…");
  await db.insert(schema.admins).values({
    email: PRIMARY_ACCOUNTS[0].email,
    password: pw,
    name: PRIMARY_ACCOUNTS[0].name,
    role: "super_admin",
  });

  const roleKeys = [
    ["super_admin", "Super Admin", ["*"]],
    ["admin", "Administrator", ["interns:read", "companies:read", "reports:read"]],
    ["exec_operations", "Operations", ["interns:read", "interns:write", "companies:read"]],
    ["exec_accounts", "Accounts", ["transactions:read", "reports:read"]],
    ["exec_sales", "Sales", ["companies:read", "cms:read"]],
  ] as const;

  await db.insert(schema.adminRoles).values(
    roleKeys.map(([key, name, permissions]) => ({ key, name, permissions: [...permissions] })),
  );

  // ── 12 Employer Companies ─────────────────────────────────────────────
  console.log("Seeding 12 employers…");
  const employerInserts = COMPANIES.map((c, i) => ({
    name: i === 0 ? PRIMARY_ACCOUNTS[1].name : `${c.name} Hiring Team`,
    companyName: c.name,
    companyEmail: c.email,
    emailVerified: true,
    countryCode: "+91",
    phoneNumber: `98765${String(10000 + i).padStart(5, "0")}`,
    password: pw,
    agreedToTerms: true,
    companySize: c.size,
    country: "India",
    city: c.city,
    state: c.state,
    primaryContactName: i === 0 ? PRIMARY_ACCOUNTS[1].name : `Director of Talent, ${c.name}`,
    primaryContactRole: "Hiring Manager",
    websiteUrl: `https://${c.name.toLowerCase().replace(/[^a-z0-9]/g, "")}.in`,
    setupCompleted: true,
    onboardingCompleted: true,
    isActive: true,
  }));

  const insertedEmployers = await db.insert(schema.employers).values(employerInserts).returning();
  const primaryEmployer = insertedEmployers[0];

  // ── 60 Interns (with realistic Indian attributes & varied statuses) ─────
  console.log("Seeding 60 interns…");
  // Distribute:
  // - 70% complete profiles (42)
  // - 15% pending approval (9) -> visibility "pending", status active
  // - 10% hidden (6) -> visibility "hidden", status active
  // - 5% incomplete/inactive (3) -> no onboarding row or inactive
  const internUserRecords = [];

  // Seed the 3 primary demo interns first
  const primaryInternsMeta = [
    { email: PRIMARY_ACCOUNTS[2].email, firstName: "Sana", lastName: "Kapoor", phone: "9811122334" },
    { email: PRIMARY_ACCOUNTS[3].email, firstName: "Rohan", lastName: "Iyer", phone: "9822233445" },
    { email: PRIMARY_ACCOUNTS[4].email, firstName: "Meera", lastName: "Nair", phone: "9833344556" },
  ];

  for (let i = 0; i < 60; i++) {
    let email: string;
    let firstName: string;
    let lastName: string;
    let phone: string;

    if (i < 3) {
      email = primaryInternsMeta[i].email;
      firstName = primaryInternsMeta[i].firstName;
      lastName = primaryInternsMeta[i].lastName;
      phone = primaryInternsMeta[i].phone;
    } else {
      firstName = FIRST_NAMES[i % FIRST_NAMES.length];
      lastName = LAST_NAMES[(i * 3) % LAST_NAMES.length];
      email = `${firstName.toLowerCase()}.${lastName.toLowerCase()}${i}@findtern.dev`;
      phone = `98${String(10000000 + i * 1337).slice(0, 8)}`;
    }

    // Determine visibility & active status:
    // 0..41: live (70%)
    // 42..50: pending (15%)
    // 51..56: hidden (10%)
    // 57..59: live but incomplete/inactive (5%)
    let visibility = "live";
    let isActive = true;

    if (i >= 42 && i <= 50) {
      visibility = "pending";
    } else if (i >= 51 && i <= 56) {
      visibility = "hidden";
    } else if (i === 59) {
      isActive = false;
    }

    internUserRecords.push({
      firstName,
      lastName,
      email,
      emailVerified: true,
      isActive,
      countryCode: "+91",
      phoneNumber: phone,
      password: pw,
      agreedToTerms: true,
      role: "intern",
      profileVisibility: visibility,
    });
  }

  const insertedUsers = await db.insert(schema.users).values(internUserRecords).returning();

  // ── Intern Onboarding Profiles ─────────────────────────────────────────
  // 57 of the 60 have completed onboarding (remaining 3 are incomplete)
  console.log("Seeding onboarding details & scores for 57 interns…");
  const onboardingRecords = [];

  for (let i = 0; i < 57; i++) {
    const user = insertedUsers[i];
    const cityObj = INDIAN_CITIES[i % INDIAN_CITIES.length];
    const collegeObj = COLLEGES[i % COLLEGES.length];
    const domainObj = DOMAINS_AND_SKILLS[i % DOMAINS_AND_SKILLS.length];

    // Findtern score curve spread between 4.8 and 9.6:
    // Some Espresso (4.8 to 5.9), mostly Cappuccino (6.0 to 7.9), many Latte (8.0 to 9.6)
    let score: number;
    if (i === 0) score = 8.8; // Sana
    else if (i === 1) score = 7.6; // Rohan
    else if (i === 2) score = 8.2; // Meera
    else {
      const base = 5.0 + ((i * 7.3) % 4.6);
      score = Math.round(base * 10) / 10;
    }

    // 4 axes varying realistically
    const comm = Math.min(10, Math.max(4, Math.round((score + (i % 3 === 0 ? 0.6 : -0.4)) * 10) / 10));
    const coding = Math.min(10, Math.max(4, Math.round((score + (i % 2 === 0 ? 0.5 : -0.3)) * 10) / 10));
    const aptitude = Math.min(10, Math.max(4, Math.round((score + (i % 4 === 0 ? -0.5 : 0.4)) * 10) / 10));
    const interview = Math.min(10, Math.max(4, Math.round((score + (i % 5 === 0 ? 0.3 : -0.2)) * 10) / 10));

    // Aadhaar and PAN formatted with realistic checksum digits
    const aadhaar = `${2000 + i * 111} ${4000 + i * 222} ${6000 + i * 333}`;
    const pan = `ABCDE${String(1000 + i)}F`;

    onboardingRecords.push({
      userId: user.id,
      city: cityObj.city,
      state: cityObj.state,
      pinCode: `${560000 + (i % 50) * 10}`,
      skills: domainObj.skills,
      bio: `${domainObj.domain} specialist with hands-on projects in ${domainObj.skills.slice(0, 3).join(", ")}. Passionate about building resilient software and learning fast.`,
      locationTypes: i % 3 === 0 ? ["remote", "hybrid"] : i % 3 === 1 ? ["onsite", "hybrid"] : ["remote"],
      preferredLocations: [cityObj.city, "Bengaluru", "Remote"],
      hasLaptop: i % 7 !== 0,
      linkedinUrl: `https://linkedin.com/in/${user.firstName.toLowerCase()}-${user.lastName.toLowerCase()}`,
      previewSummary: `${collegeObj.name}, ${collegeObj.degree} 2026. Score ${score.toFixed(1)}/10.`,
      aadhaarNumber: aadhaar,
      panNumber: pan,
      extraData: {
        college: collegeObj.name,
        degree: collegeObj.degree,
        graduationYear: 2025 + (i % 3),
        findternScore: score,
        ratings: {
          communication: comm,
          coding: coding,
          aptitude: aptitude,
          interview: interview,
        },
        openToWork: score >= 6.0,
      },
    });
  }

  await db.insert(schema.internOnboarding).values(onboardingRecords);

  // ── 25 Projects across 12 Employers ──────────────────────────────────
  console.log("Seeding 25 projects…");
  const projectTemplates = [
    { name: "Frontend Design System & Components", domain: "Frontend", location: "remote", fullTime: true },
    { name: "Core Payments & Webhook Engine", domain: "Backend", location: "hybrid", fullTime: false },
    { name: "High-Volume Delivery Routing Optimization", domain: "Backend", location: "onsite", fullTime: true },
    { name: "Mobile App Checkout & Micro-Interactions", domain: "Mobile", location: "remote", fullTime: false },
    { name: "Order Ledger Reconciliation Microservice", domain: "Backend", location: "hybrid", fullTime: false },
    { name: "Design System Tokens & Accessibility Pass", domain: "UI/UX Design", location: "remote", fullTime: false },
    { name: "Real-time Order Tracking WebSockets", domain: "Full Stack", location: "hybrid", fullTime: true },
    { name: "Merchant Onboarding Self-Serve Flow", domain: "Full Stack", location: "remote", fullTime: false },
    { name: "API Documentation & Interactive Sandboxes", domain: "Frontend", location: "remote", fullTime: false },
    { name: "Portfolio Analytics Dashboard Rebuild", domain: "Frontend", location: "remote", fullTime: true },
    { name: "Automated Cross-Browser Regression Suite", domain: "DevOps", location: "remote", fullTime: false },
    { name: "GraphQL Schema Stitching & Performance", domain: "Backend", location: "remote", fullTime: true },
    { name: "User Retention Push Notification Funnel", domain: "Full Stack", location: "hybrid", fullTime: false },
    { name: "Telematics & Battery Sensor Ingestion Pipeline", domain: "Backend", location: "onsite", fullTime: true },
    { name: "Internal Admin Operations Triage Console", domain: "Frontend", location: "remote", fullTime: false },
    { name: "Interactive Customer Support Chatbot UI", domain: "Frontend", location: "remote", fullTime: false },
    { name: "Data Warehouse ETL & ClickHouse Streaming", domain: "Data & ML", location: "hybrid", fullTime: true },
    { name: "Microservices Dockerization & Helm Charts", domain: "DevOps", location: "remote", fullTime: false },
    { name: "Landing Page GSAP Choreography Pass", domain: "Design Engineering", location: "remote", fullTime: false },
    { name: "Smart Inventory Forecast Model Integration", domain: "Data & ML", location: "onsite", fullTime: false },
    { name: "Identity Verification & KYC Document OCR", domain: "Full Stack", location: "hybrid", fullTime: true },
    { name: "Partner API Gateway Rate Limiting Layer", domain: "Backend", location: "remote", fullTime: false },
    { name: "Mobile Cart Abandonment Experimentation", domain: "Mobile", location: "remote", fullTime: false },
    { name: "Vehicle Diagnostics Dashboard for Dealerships", domain: "Frontend", location: "onsite", fullTime: true },
    { name: "Global Currency Settlement Engine", domain: "Backend", location: "remote", fullTime: false },
  ];

  const projectRecords = projectTemplates.map((p, idx) => {
    const employer = insertedEmployers[idx % insertedEmployers.length];
    const domainObj = DOMAINS_AND_SKILLS.find((d) => d.domain === p.domain) ?? DOMAINS_AND_SKILLS[0];

    return {
      employerId: employer.id,
      projectName: p.name,
      skills: domainObj.skills,
      scopeOfWork: `Deliver production features for ${p.name.toLowerCase()} within an agile 12-week fellowship. Pair directly with senior staff engineers.`,
      locationType: p.location,
      status: idx === 24 ? "closed" : "active",
      fullTimeOffer: p.fullTime,
      city: employer.city,
      state: employer.state,
      timezone: "Asia/Kolkata",
    };
  });

  const insertedProjects = await db.insert(schema.projects).values(projectRecords).returning();

  // ── 40 Proposals Covering Every Status ────────────────────────────────
  // Statuses: draft, sent, accepted, rejected, interview_scheduled, withdrawn
  console.log("Seeding 40 proposals across all status types…");
  const PROPOSAL_STATUSES = [
    "accepted", "accepted", "accepted", "accepted", "accepted", // 5 hired/accepted
    "sent", "sent", "sent", "sent", "sent", "sent", "sent", "sent", // 8 sent
    "interview_scheduled", "interview_scheduled", "interview_scheduled", "interview_scheduled", // 4 interview scheduled
    "rejected", "rejected", "rejected", // 3 rejected
    "withdrawn", "withdrawn", // 2 withdrawn
    "draft", "draft", // 2 draft
    // Remaining distributed across accepted & sent
  ];

  const proposalRecords = [];
  for (let i = 0; i < 40; i++) {
    const project = insertedProjects[i % insertedProjects.length];
    const intern = insertedUsers[i % 55]; // pick from assessed interns
    const status = PROPOSAL_STATUSES[i] || (i % 2 === 0 ? "sent" : "accepted");

    const stipend = 25000 + (i % 6) * 5000;
    const isHired = status === "accepted";

    proposalRecords.push({
      employerId: project.employerId,
      internId: intern.id,
      projectId: project.id,
      flowType: i % 2 === 0 ? "direct" : "interview_first",
      status: status,
      currency: "INR",
      offerDetails: {
        roleTitle: project.projectName.split(" ")[0] + " Intern",
        duration: "3m",
        durationWeeks: 12,
        hoursPerWeek: 25,
        monthlyHours: 100,
        monthlyAmount: stipend * 100,
        stipendMinor: stipend * 100,
        mode: project.locationType ?? "remote",
        city: project.city ?? "Bengaluru",
        laptop: "company",
        startDate: new Date(Date.now() + (i * 2 + 3) * 86_400_000).toISOString().split("T")[0],
        message: `We were extremely impressed by your Findtern technical score and would love to have you join our team.`,
      },
      aiRatings: {
        communication: 8,
        coding: 8.5,
        problemSolving: 8,
        overall: 8.2,
      },
      skills: (project.skills as string[]).slice(0, 3),
      hiredAt: isHired ? new Date(Date.now() - (30 - i) * 86_400_000) : null,
    });
  }

  const insertedProposals = await db.insert(schema.proposals).values(proposalRecords).returning();

  // ── 30 Interviews Covering Every Slot State ───────────────────────────
  // States:
  // - scheduled (slots picked, meetingLink set)
  // - pending (slots offered, awaiting intern selection)
  // - expired (slots in past, not selected)
  // - completed
  // - cancelled
  console.log("Seeding 30 interviews covering all slot states…");
  const interviewRecords = [];
  const nowMs = Date.now();

  for (let i = 0; i < 30; i++) {
    const employer = insertedEmployers[i % insertedEmployers.length];
    const intern = insertedUsers[(i + 5) % 55];
    const project = insertedProjects[i % insertedProjects.length];

    let status = "pending";
    let slot1: Date;
    let slot2: Date;
    let slot3: Date;
    let selectedSlot: number | null = null;
    let meetingLink: string | null = null;

    if (i < 10) {
      // Confirmed & Scheduled future interview
      status = "scheduled";
      selectedSlot = (i % 3) + 1;
      slot1 = new Date(nowMs + (i + 1) * 86_400_000 + 10 * 3600_000);
      slot2 = new Date(nowMs + (i + 2) * 86_400_000 + 14 * 3600_000);
      slot3 = new Date(nowMs + (i + 3) * 86_400_000 + 16 * 3600_000);
      meetingLink = `https://meet.google.com/ftn-demo-${String(i).padStart(3, "0")}`;
    } else if (i < 18) {
      // Pending intern selection (slots available in future)
      status = "pending";
      slot1 = new Date(nowMs + (i - 8) * 86_400_000 + 11 * 3600_000);
      slot2 = new Date(nowMs + (i - 7) * 86_400_000 + 15 * 3600_000);
      slot3 = new Date(nowMs + (i - 6) * 86_400_000 + 17 * 3600_000);
    } else if (i < 24) {
      // Completed past interview
      status = "completed";
      selectedSlot = 2;
      slot1 = new Date(nowMs - (i - 10) * 86_400_000 + 10 * 3600_000);
      slot2 = new Date(nowMs - (i - 10) * 86_400_000 + 14 * 3600_000);
      slot3 = new Date(nowMs - (i - 9) * 86_400_000 + 16 * 3600_000);
      meetingLink = `https://meet.google.com/ftn-past-${String(i).padStart(3, "0")}`;
    } else if (i < 28) {
      // Expired slots (offered in past, never selected)
      status = "expired";
      slot1 = new Date(nowMs - 12 * 86_400_000);
      slot2 = new Date(nowMs - 10 * 86_400_000);
      slot3 = new Date(nowMs - 8 * 86_400_000);
    } else {
      // Cancelled
      status = "cancelled";
      slot1 = new Date(nowMs + 4 * 86_400_000);
      slot2 = new Date(nowMs + 5 * 86_400_000);
      slot3 = new Date(nowMs + 6 * 86_400_000);
    }

    interviewRecords.push({
      employerId: employer.id,
      internId: intern.id,
      projectId: project.id,
      status,
      slot1,
      slot2,
      slot3,
      selectedSlot,
      timezone: "Asia/Kolkata",
      meetingLink,
      notes: status === "completed" ? "Candidate exhibited strong systems comprehension and articulate communication." : null,
    });
  }

  await db.insert(schema.interviews).values(interviewRecords);

  // ── Timesheets (draft, submitted, approved, rejected) ────────────────
  console.log("Seeding timesheets in draft, submitted, approved, rejected…");
  const acceptedProposals = insertedProposals.filter((p) => p.status === "accepted");
  const timesheetStatuses = ["approved", "approved", "submitted", "submitted", "draft", "rejected"];
  const timesheetRecords = [];

  const nowDate = new Date();
  const lastMonthStart = new Date(nowDate.getFullYear(), nowDate.getMonth() - 1, 1);
  const lastMonthEnd = new Date(nowDate.getFullYear(), nowDate.getMonth(), 0);

  for (let i = 0; i < Math.min(12, acceptedProposals.length); i++) {
    const prop = acceptedProposals[i];
    const status = timesheetStatuses[i % timesheetStatuses.length];

    timesheetRecords.push({
      proposalId: prop.id,
      employerId: prop.employerId,
      internId: prop.internId,
      periodStart: lastMonthStart,
      periodEnd: lastMonthEnd,
      status,
      entries: [
        { date: "2026-09-02", hours: 6, note: "Sprint setup and API contract definition" },
        { date: "2026-09-04", hours: 7, note: "Component styling and state integration" },
        { date: "2026-09-08", hours: 5, note: "Unit testing and PR revision" },
        { date: "2026-09-12", hours: 6, note: "Staging deployment smoke testing" },
      ],
      submittedAt: status !== "draft" ? new Date(nowDate.getFullYear(), nowDate.getMonth(), 1) : null,
      approvedAt: status === "approved" ? new Date(nowDate.getFullYear(), nowDate.getMonth(), 3) : null,
      rejectedAt: status === "rejected" ? new Date(nowDate.getFullYear(), nowDate.getMonth(), 4) : null,
      internNote: "Completed all scheduled sprint goals for sprint 14.",
      managerNote: status === "rejected" ? "Missing commit links for work completed on Sep 12th. Please update." : status === "approved" ? "Great sprint delivery, approved." : null,
    });
  }

  await db.insert(schema.timesheets).values(timesheetRecords);

  // ── Employer Payments & Intern Payouts ───────────────────────────────
  console.log("Seeding payments and payouts (pending & paid)…");
  const employerPaymentRecords = [];
  for (let i = 0; i < 8; i++) {
    const emp = insertedEmployers[i % insertedEmployers.length];
    employerPaymentRecords.push({
      employerId: emp.id,
      orderId: `order_ftn_${1000 + i}`,
      paymentId: `pay_rzp_${2000 + i}`,
      amountMinor: 3500000,
      currency: "INR",
      status: "captured",
      paidAt: new Date(nowDate.getTime() - (i * 4 + 2) * 86_400_000),
    });
  }
  await db.insert(schema.employerPayments).values(employerPaymentRecords);

  const internPayoutRecords = [];
  for (let i = 0; i < 10; i++) {
    const intern = insertedUsers[i];
    const isPaid = i % 2 === 0;

    internPayoutRecords.push({
      internId: intern.id,
      amountMinor: 2500000,
      currency: "INR",
      status: isPaid ? "paid" : "pending",
      method: "bank",
      referenceId: isPaid ? `UTR_FTN_${80000 + i}` : null,
      notes: isPaid ? "Monthly stipend disbursement via HDFC NEFT" : "Pending monthly batch settlement",
      paidAt: isPaid ? new Date(nowDate.getTime() - (i + 1) * 86_400_000) : null,
    });
  }
  await db.insert(schema.internPayouts).values(internPayoutRecords);

  // ── 15 Contact Messages (Unread and Resolved) ─────────────────────────
  console.log("Seeding 15 contact messages (unread and resolved)…");
  const contactMessagesRecords = [
    { firstName: "Rohan", lastName: "Shukla", email: "rohan.s@gmail.com", queryType: "intern_help", subject: "Query regarding AI Mock Interview scoring", message: "Hi Findtern team, when does the AI technical test results get published after submitting the recording?", isRead: false },
    { firstName: "Anand", lastName: "Deshmukh", email: "anand@finverse.co", queryType: "employer_inquiry", subject: "Bulk fellowship program for 15 engineering interns", message: "We are expanding our product engineering pod in Pune. Does Findtern offer cohort-based custom shortlists?", isRead: false },
    { firstName: "Kavita", lastName: "Sen", email: "kavita.sen@bits-pilani.ac.in", queryType: "intern_help", subject: "College exam streak freeze request", message: "Can I freeze my profile activity during semester finals week without affecting employer visibility?", isRead: false },
    { firstName: "Deepak", lastName: "Menon", email: "deepak@zenithpay.io", queryType: "billing", subject: "GST Invoice download query for September orders", message: "Where can we configure our corporate GSTIN for quarterly tax credit deduction receipts?", isRead: false },
    { firstName: "Preeti", lastName: "Sood", email: "preeti.sood@outlook.com", queryType: "intern_help", subject: "Offer acceptance query", message: "I received a hybrid proposal in Bengaluru. How do I request equipment provisioning details?", isRead: false },
    { firstName: "Saurabh", lastName: "Bose", email: "saurabh@cloudkraft.dev", queryType: "employer_inquiry", subject: "Interview slot reschedule policy", message: "Need to update calendar timing for candidate interview on Tuesday. Can we edit the Google Meet link?", isRead: true },
    { firstName: "Neha", lastName: "Kulkarni", email: "neha.k@gmail.com", queryType: "intern_help", subject: "Bank IFSC verification status", message: "Updated my Axis Bank account details for stipend disbursement. Kindly confirm verification.", isRead: true },
    { firstName: "Rajesh", lastName: "Chawla", email: "rajesh@hyperstack.in", queryType: "billing", subject: "International currency payment support", message: "Our Delaware parent entity would like to pay via USD wire. Do you support ACH settlement?", isRead: true },
    { firstName: "Aditya", lastName: "Mishra", email: "aditya.m@vit.ac.in", queryType: "intern_help", subject: "Skill test retry interval", message: "Can I re-take the communication module to raise my score from 7.5 to 8.5?", isRead: true },
    { firstName: "Sanjay", lastName: "Kumar", email: "sanjay@retailgenie.in", queryType: "employer_inquiry", subject: "Candidate masking details", message: "When are full candidate resumes and contact numbers unmasked in the workflow?", isRead: true },
    { firstName: "Harsh", lastName: "Vardhan", email: "harsh@dtu.ac.in", queryType: "intern_help", subject: "Timesheet approval delay", message: "Submitted my month-end timesheet 4 days ago. Has a notification been dispatched to Northwind?", isRead: true },
    { firstName: "Gitanjali", lastName: "Roy", email: "gitanjali@stride.tech", queryType: "employer_inquiry", subject: "Part-time versus full-time fellowship options", message: "We want to hire 2 candidates for 20 hrs/week during their final college semester. Is that supported?", isRead: true },
    { firstName: "Mohit", lastName: "Arora", email: "mohit.arora@iitb.ac.in", queryType: "intern_help", subject: "KYC Aadhaar upload confirmation", message: "Uploaded my masked Aadhaar copy. How long does administrative clearance take?", isRead: true },
    { firstName: "Varun", lastName: "Sethi", email: "varun@growthloop.in", queryType: "billing", subject: "18-month hiring guarantee terms", message: "Please share the legal documentation explaining the stipend refund guarantee clause.", isRead: true },
    { firstName: "Nisha", lastName: "Pillai", email: "nisha.p@yahoo.in", queryType: "intern_help", subject: "Relocation assistance inquiry", message: "Do hybrid placements include transit stipend or housing assistance support?", isRead: true },
  ];

  await db.insert(schema.contactMessages).values(contactMessagesRecords);

  // ── Pricing Plans ─────────────────────────────────────────────────────
  console.log("Seeding pricing plans…");
  await db.insert(schema.pricingPlans).values([
    ...PRICING_PLANS.map((p) => ({
      slug: p.slug,
      displayName: p.displayName,
      region: "IN",
      currency: p.currency,
      priceHourlyMinor: p.priceHourlyMinor,
      perHireChargeMinor: p.perHireChargeMinor,
      internshipDuration: p.internshipDuration,
      features: p.features,
      gstApplicable: p.gstApplicable,
      sortOrder: p.sortOrder,
      isActive: true,
    })),
    ...PRICING_PLANS_USD.map((p) => ({
      slug: p.slug,
      displayName: p.displayName,
      region: null,
      currency: p.currency,
      priceHourlyMinor: p.priceHourlyMinor,
      perHireChargeMinor: p.perHireChargeMinor,
      internshipDuration: p.internshipDuration,
      features: p.features,
      gstApplicable: p.gstApplicable,
      sortOrder: p.sortOrder,
      isActive: true,
    })),
  ]);

  // ── Promo Codes ───────────────────────────────────────────────────────
  console.log("Seeding promo codes…");
  await db.insert(schema.promoCodes).values([
    { code: "LAUNCH25", description: "25% off first placement", discountType: "percentage", discountValue: 25, maxUsages: 100, isActive: true },
    { code: "STARTUP5000", description: "Flat ₹5,000 credit on onboarding", discountType: "fixed", discountValue: 500000, maxUsages: 50, isActive: true },
    { code: "HIRING10", description: "10% discount on 3+ candidate cohorts", discountType: "percentage", discountValue: 10, maxUsages: 200, isActive: true },
  ]);

  // ── Notifications ────────────────────────────────────────────────────
  console.log("Seeding notifications…");
  await db.insert(schema.notifications).values([
    {
      recipientType: "intern",
      recipientId: insertedUsers[0].id,
      type: "proposal_accepted",
      title: "Proposal accepted",
      message: "Northwind Labs accepted your proposal for React Dashboard Rebuild.",
    },
    {
      recipientType: "intern",
      recipientId: insertedUsers[0].id,
      type: "interview_scheduled",
      title: "Interview scheduled",
      message: "Your interview with Northwind Labs is confirmed for next week.",
    },
    {
      recipientType: "employer",
      recipientId: primaryEmployer.id,
      type: "timesheet_submitted",
      title: "Timesheet awaiting review",
      message: "Meera Nair submitted a timesheet for Design System Tokens.",
    },
    {
      recipientType: "employer",
      recipientId: primaryEmployer.id,
      type: "new_candidate",
      title: "New candidate match",
      message: "Rohan Iyer scored 7.6 and matches your Node.js requirement.",
    },
  ]);

  // Report final statistics
  const [adminsCount, employersCount, usersCount, projectsCount, proposalsCount, interviewsCount, timesheetsCount, messagesCount] =
    await Promise.all([
      db.$count(schema.admins),
      db.$count(schema.employers),
      db.$count(schema.users),
      db.$count(schema.projects),
      db.$count(schema.proposals),
      db.$count(schema.interviews),
      db.$count(schema.timesheets),
      db.$count(schema.contactMessages),
    ]);

  console.log(
    [
      "",
      "✓ Dev database successfully seeded with realistic platform data.",
      "",
      `  Admins: ${adminsCount}  Employers: ${employersCount}  Interns: ${usersCount}`,
      `  Projects: ${projectsCount}  Proposals: ${proposalsCount}  Interviews: ${interviewsCount}`,
      `  Timesheets: ${timesheetsCount}  Contact Messages: ${messagesCount}`,
      "",
      "  Demo Logins:",
      `  Admin:      ${PRIMARY_ACCOUNTS[0].email}  → /admin/login`,
      `  Employer:   ${PRIMARY_ACCOUNTS[1].email}  → /employer/login`,
      `  Intern:     ${PRIMARY_ACCOUNTS[2].email}  → /login`,
      `  Password (all accounts): ${PASSWORD}`,
      "",
    ].join("\n"),
  );

  await client.end();
}

main().catch((err: unknown) => {
  console.error("Seeding error:", err instanceof Error ? err.message : err);
  process.exit(1);
});