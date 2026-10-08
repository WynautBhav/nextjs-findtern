"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Handshake,
  HelpCircle,
  Layers,
  Loader2,
  MessageSquare,
  Plus,
  Power,
  Trash2,
} from "lucide-react";

import { csrfFetch } from "@/lib/client-fetch";
import { formatMoney } from "@/lib/format";
import type {
  PricingPlan,
  WebsiteFaq,
  WebsiteHappyFace,
  WebsitePartner,
} from "@/lib/db/schema";
import { StatusBadge } from "@/components/admin/status-badge";
import { Panel, PanelHeader } from "@/components/admin/panel";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";

export function CmsStudio({
  initialTestimonials,
  initialPartners,
  initialFaqs,
  initialPricing,
  defaultTab = "testimonials",
}: {
  initialTestimonials: WebsiteHappyFace[];
  initialPartners: WebsitePartner[];
  initialFaqs: WebsiteFaq[];
  initialPricing: PricingPlan[];
  defaultTab?: string;
}) {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState(defaultTab);

  const [testimonials, setTestimonials] = useState<WebsiteHappyFace[]>(initialTestimonials);
  const [partners, setPartners] = useState<WebsitePartner[]>(initialPartners);
  const [faqs, setFaqs] = useState<WebsiteFaq[]>(initialFaqs);
  const [pricing, setPricing] = useState<PricingPlan[]>(initialPricing);

  const [modalType, setModalType] = useState<"testimonial" | "partner" | "faq" | null>(null);
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);

  // Form states
  const [testName, setTestName] = useState("");
  const [testTitle, setTestTitle] = useState("");
  const [testCompany, setTestCompany] = useState("");
  const [testQuote, setTestQuote] = useState("");
  const [testAvatar, setTestAvatar] = useState("");

  const [partnerName, setPartnerName] = useState("");
  const [partnerLogo, setPartnerLogo] = useState("");
  const [partnerHref, setPartnerHref] = useState("");

  const [faqQ, setFaqQ] = useState("");
  const [faqA, setFaqA] = useState("");
  const [faqCategory, setFaqCategory] = useState("General");

  async function toggleStatus(type: "faq" | "partner" | "testimonial" | "pricing", id: string, current: boolean) {
    setBusyId(id);
    try {
      const next = !current;
      const res = await csrfFetch("/api/admin/cms", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type, id, isActive: next }),
      });
      if (res.ok) {
        if (type === "testimonial") {
          setTestimonials((prev) => prev.map((t) => (t.id === id ? { ...t, isActive: next } : t)));
        } else if (type === "partner") {
          setPartners((prev) => prev.map((p) => (p.id === id ? { ...p, isActive: next } : p)));
        } else if (type === "faq") {
          setFaqs((prev) => prev.map((f) => (f.id === id ? { ...f, isActive: next } : f)));
        } else if (type === "pricing") {
          setPricing((prev) => prev.map((p) => (p.id === id ? { ...p, isActive: next } : p)));
        }
      }
    } finally {
      setBusyId(null);
    }
  }

  async function deleteEntry(type: "faq" | "partner" | "testimonial" | "pricing", id: string) {
    if (!confirm("Are you sure you want to delete this CMS entry?")) return;
    setBusyId(id);
    try {
      const res = await csrfFetch("/api/admin/cms", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type, id }),
      });
      if (res.ok) {
        if (type === "testimonial") setTestimonials((prev) => prev.filter((t) => t.id !== id));
        else if (type === "partner") setPartners((prev) => prev.filter((p) => p.id !== id));
        else if (type === "faq") setFaqs((prev) => prev.filter((f) => f.id !== id));
        else if (type === "pricing") setPricing((prev) => prev.filter((p) => p.id !== id));
      }
    } finally {
      setBusyId(null);
    }
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setErrorMsg("");

    try {
      let body: Record<string, unknown> | null = null;
      if (modalType === "testimonial") {
        body = {
          type: "testimonial",
          name: testName.trim(),
          title: testTitle.trim(),
          company: testCompany.trim(),
          quote: testQuote.trim(),
          avatarUrl: testAvatar.trim() || undefined,
        };
      } else if (modalType === "partner") {
        body = {
          type: "partner",
          name: partnerName.trim(),
          logoUrl: partnerLogo.trim(),
          href: partnerHref.trim() || undefined,
        };
      } else if (modalType === "faq") {
        body = {
          type: "faq",
          question: faqQ.trim(),
          answer: faqA.trim(),
          category: faqCategory.trim(),
        };
      }

      const res = await csrfFetch("/api/admin/cms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Failed to create CMS item");

      if (modalType === "testimonial" && data.item) {
        setTestimonials((prev) => [data.item, ...prev]);
        setTestName("");
        setTestTitle("");
        setTestCompany("");
        setTestQuote("");
        setTestAvatar("");
      } else if (modalType === "partner" && data.item) {
        setPartners((prev) => [data.item, ...prev]);
        setPartnerName("");
        setPartnerLogo("");
        setPartnerHref("");
      } else if (modalType === "faq" && data.item) {
        setFaqs((prev) => [data.item, ...prev]);
        setFaqQ("");
        setFaqA("");
      }

      setModalType(null);
      router.refresh();
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : "Error saving CMS item");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* Tab Navigation */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-ink-100 pb-2">
        <div className="flex gap-2">
          {[
            { id: "testimonials", label: "Testimonials", count: testimonials.length, icon: MessageSquare },
            { id: "partners", label: "Partners", count: partners.length, icon: Handshake },
            { id: "faqs", label: "FAQs", count: faqs.length, icon: HelpCircle },
            { id: "pricing", label: "Pricing Tiers", count: pricing.length, icon: Layers },
          ].map((tab) => {
            const Icon = tab.icon;
            const active = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-semibold transition-all ${
                  active
                    ? "bg-brand-700 text-white shadow-2xs"
                    : "bg-white text-ink-600 hover:bg-ink-50 hover:text-ink-900 border border-ink-100"
                }`}
              >
                <Icon className="size-3.5" />
                <span>{tab.label}</span>
                <span
                  className={`rounded-full px-1.5 py-0.2 text-3xs ${
                    active ? "bg-white/20 text-white" : "bg-ink-100 text-ink-600"
                  }`}
                >
                  {tab.count}
                </span>
              </button>
            );
          })}
        </div>

        {activeTab !== "pricing" ? (
          <button
            type="button"
            onClick={() =>
              setModalType(
                activeTab === "testimonials"
                  ? "testimonial"
                  : activeTab === "partners"
                  ? "partner"
                  : "faq",
              )
            }
            className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-brand-700 px-3.5 text-xs font-semibold text-white shadow-2xs hover:bg-brand-600 transition-colors"
          >
            <Plus className="size-3.5" />
            <span>
              Add{" "}
              {activeTab === "testimonials"
                ? "Testimonial"
                : activeTab === "partners"
                ? "Partner"
                : "FAQ"}
            </span>
          </button>
        ) : null}
      </div>

      {/* Tab 1: Testimonials */}
      {activeTab === "testimonials" && (
        <Panel>
          <PanelHeader
            title="Happy Faces & Testimonials"
            description="Verified student and employer feedback showcased on the platform landing page."
            icon={MessageSquare}
          />
          <Table>
            <TableHeader className="bg-ink-50/90">
              <TableRow>
                <TableHead className="px-5 py-3 text-2xs font-semibold uppercase tracking-wider text-ink-600">
                  Author
                </TableHead>
                <TableHead className="px-5 py-3 text-2xs font-semibold uppercase tracking-wider text-ink-600">
                  Role & Company
                </TableHead>
                <TableHead className="px-5 py-3 text-2xs font-semibold uppercase tracking-wider text-ink-600">
                  Quote Excerpt
                </TableHead>
                <TableHead className="px-5 py-3 text-2xs font-semibold uppercase tracking-wider text-ink-600">
                  Status
                </TableHead>
                <TableHead className="px-5 py-3 text-right text-2xs font-semibold uppercase tracking-wider text-ink-600">
                  Actions
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {testimonials.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="py-8 text-center text-xs text-text-subtle">
                    No testimonials published yet.
                  </TableCell>
                </TableRow>
              ) : (
                testimonials.map((item) => (
                  <TableRow key={item.id} className="hover:bg-ink-50/60">
                    <TableCell className="px-5 py-3.5 font-bold text-xs text-ink-900">
                      {item.name}
                    </TableCell>
                    <TableCell className="px-5 py-3.5 text-xs text-ink-700">
                      {item.title} at {item.company}
                    </TableCell>
                    <TableCell className="px-5 py-3.5 text-2xs text-text-subtle max-w-sm truncate">
                      &quot;{item.quote}&quot;
                    </TableCell>
                    <TableCell className="px-5 py-3.5">
                      <StatusBadge value={item.isActive ? "active" : "inactive"} />
                    </TableCell>
                    <TableCell className="px-5 py-3.5 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          type="button"
                          disabled={busyId === item.id}
                          onClick={() => toggleStatus("testimonial", item.id, item.isActive)}
                          title={item.isActive ? "Deactivate" : "Activate"}
                          className="rounded-lg p-1.5 text-ink-500 hover:bg-ink-100 hover:text-ink-900"
                        >
                          <Power className={`size-3.5 ${item.isActive ? "text-brand-600" : "text-ink-400"}`} />
                        </button>
                        <button
                          type="button"
                          disabled={busyId === item.id}
                          onClick={() => deleteEntry("testimonial", item.id)}
                          title="Delete"
                          className="rounded-lg p-1.5 text-ink-400 hover:bg-danger-soft hover:text-danger"
                        >
                          <Trash2 className="size-3.5" />
                        </button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </Panel>
      )}

      {/* Tab 2: Corporate Partners */}
      {activeTab === "partners" && (
        <Panel>
          <PanelHeader
            title="Corporate Hiring Partners"
            description="Brand logos showcased in the homepage partnership ribbon."
            icon={Handshake}
          />
          <Table>
            <TableHeader className="bg-ink-50/90">
              <TableRow>
                <TableHead className="px-5 py-3 text-2xs font-semibold uppercase tracking-wider text-ink-600">
                  Partner Name
                </TableHead>
                <TableHead className="px-5 py-3 text-2xs font-semibold uppercase tracking-wider text-ink-600">
                  Logo Asset
                </TableHead>
                <TableHead className="px-5 py-3 text-2xs font-semibold uppercase tracking-wider text-ink-600">
                  Website URL
                </TableHead>
                <TableHead className="px-5 py-3 text-2xs font-semibold uppercase tracking-wider text-ink-600">
                  Status
                </TableHead>
                <TableHead className="px-5 py-3 text-right text-2xs font-semibold uppercase tracking-wider text-ink-600">
                  Actions
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {partners.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="py-8 text-center text-xs text-text-subtle">
                    No corporate partners listed yet.
                  </TableCell>
                </TableRow>
              ) : (
                partners.map((item) => (
                  <TableRow key={item.id} className="hover:bg-ink-50/60">
                    <TableCell className="px-5 py-3.5 font-bold text-xs text-ink-900">
                      {item.name}
                    </TableCell>
                    <TableCell className="px-5 py-3.5 text-xs text-ink-600 font-mono truncate max-w-xs">
                      {item.logoUrl}
                    </TableCell>
                    <TableCell className="px-5 py-3.5 text-xs text-brand-700 truncate max-w-xs">
                      {item.href || "—"}
                    </TableCell>
                    <TableCell className="px-5 py-3.5">
                      <StatusBadge value={item.isActive ? "active" : "inactive"} />
                    </TableCell>
                    <TableCell className="px-5 py-3.5 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          type="button"
                          disabled={busyId === item.id}
                          onClick={() => toggleStatus("partner", item.id, item.isActive)}
                          title={item.isActive ? "Deactivate" : "Activate"}
                          className="rounded-lg p-1.5 text-ink-500 hover:bg-ink-100 hover:text-ink-900"
                        >
                          <Power className={`size-3.5 ${item.isActive ? "text-brand-600" : "text-ink-400"}`} />
                        </button>
                        <button
                          type="button"
                          disabled={busyId === item.id}
                          onClick={() => deleteEntry("partner", item.id)}
                          title="Delete"
                          className="rounded-lg p-1.5 text-ink-400 hover:bg-danger-soft hover:text-danger"
                        >
                          <Trash2 className="size-3.5" />
                        </button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </Panel>
      )}

      {/* Tab 3: FAQ Articles */}
      {activeTab === "faqs" && (
        <Panel>
          <PanelHeader
            title="Frequently Asked Questions"
            description="Knowledge base articles answering employer and candidate inquiries."
            icon={HelpCircle}
          />
          <Table>
            <TableHeader className="bg-ink-50/90">
              <TableRow>
                <TableHead className="px-5 py-3 text-2xs font-semibold uppercase tracking-wider text-ink-600">
                  Question
                </TableHead>
                <TableHead className="px-5 py-3 text-2xs font-semibold uppercase tracking-wider text-ink-600">
                  Category
                </TableHead>
                <TableHead className="px-5 py-3 text-2xs font-semibold uppercase tracking-wider text-ink-600">
                  Answer Excerpt
                </TableHead>
                <TableHead className="px-5 py-3 text-2xs font-semibold uppercase tracking-wider text-ink-600">
                  Status
                </TableHead>
                <TableHead className="px-5 py-3 text-right text-2xs font-semibold uppercase tracking-wider text-ink-600">
                  Actions
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {faqs.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="py-8 text-center text-xs text-text-subtle">
                    No FAQs created yet.
                  </TableCell>
                </TableRow>
              ) : (
                faqs.map((item) => (
                  <TableRow key={item.id} className="hover:bg-ink-50/60">
                    <TableCell className="px-5 py-3.5 font-bold text-xs text-ink-900 max-w-xs">
                      {item.question}
                    </TableCell>
                    <TableCell className="px-5 py-3.5 text-2xs font-medium uppercase text-ink-600">
                      <span className="rounded-md bg-ink-100 px-2 py-0.5">{item.category}</span>
                    </TableCell>
                    <TableCell className="px-5 py-3.5 text-2xs text-text-subtle max-w-sm truncate">
                      {item.answer}
                    </TableCell>
                    <TableCell className="px-5 py-3.5">
                      <StatusBadge value={item.isActive ? "active" : "inactive"} />
                    </TableCell>
                    <TableCell className="px-5 py-3.5 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          type="button"
                          disabled={busyId === item.id}
                          onClick={() => toggleStatus("faq", item.id, item.isActive)}
                          title={item.isActive ? "Deactivate" : "Activate"}
                          className="rounded-lg p-1.5 text-ink-500 hover:bg-ink-100 hover:text-ink-900"
                        >
                          <Power className={`size-3.5 ${item.isActive ? "text-brand-600" : "text-ink-400"}`} />
                        </button>
                        <button
                          type="button"
                          disabled={busyId === item.id}
                          onClick={() => deleteEntry("faq", item.id)}
                          title="Delete"
                          className="rounded-lg p-1.5 text-ink-400 hover:bg-danger-soft hover:text-danger"
                        >
                          <Trash2 className="size-3.5" />
                        </button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </Panel>
      )}

      {/* Tab 4: Pricing Tiers */}
      {activeTab === "pricing" && (
        <Panel>
          <PanelHeader
            title="Configured Pricing Plans"
            description="Hourly tiers and per-hire fees resolved dynamically for employers."
            icon={Layers}
          />
          <Table>
            <TableHeader className="bg-ink-50/90">
              <TableRow>
                <TableHead className="px-5 py-3 text-2xs font-semibold uppercase tracking-wider text-ink-600">
                  Plan Name
                </TableHead>
                <TableHead className="px-5 py-3 text-2xs font-semibold uppercase tracking-wider text-ink-600">
                  Hourly Rate
                </TableHead>
                <TableHead className="px-5 py-3 text-2xs font-semibold uppercase tracking-wider text-ink-600">
                  One-time Fee
                </TableHead>
                <TableHead className="px-5 py-3 text-2xs font-semibold uppercase tracking-wider text-ink-600">
                  Region
                </TableHead>
                <TableHead className="px-5 py-3 text-2xs font-semibold uppercase tracking-wider text-ink-600">
                  Status
                </TableHead>
                <TableHead className="px-5 py-3 text-right text-2xs font-semibold uppercase tracking-wider text-ink-600">
                  Toggle
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {pricing.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="py-8 text-center text-xs text-text-subtle">
                    No pricing tiers configured.
                  </TableCell>
                </TableRow>
              ) : (
                pricing.map((plan) => (
                  <TableRow key={plan.id} className="hover:bg-ink-50/60">
                    <TableCell className="px-5 py-3.5 font-bold text-xs text-ink-900">
                      {plan.displayName}
                    </TableCell>
                    <TableCell className="px-5 py-3.5 text-xs font-semibold tabular-nums text-brand-800">
                      {formatMoney(plan.priceHourlyMinor, plan.currency as Parameters<typeof formatMoney>[1])}/hr
                    </TableCell>
                    <TableCell className="px-5 py-3.5 text-xs tabular-nums text-ink-700">
                      {plan.perHireChargeMinor > 0
                        ? formatMoney(plan.perHireChargeMinor, plan.currency as Parameters<typeof formatMoney>[1])
                        : "None"}
                    </TableCell>
                    <TableCell className="px-5 py-3.5 text-2xs font-mono uppercase text-ink-600">
                      {plan.region || "Global"}
                    </TableCell>
                    <TableCell className="px-5 py-3.5">
                      <StatusBadge value={plan.isActive ? "active" : "inactive"} />
                    </TableCell>
                    <TableCell className="px-5 py-3.5 text-right">
                      <button
                        type="button"
                        disabled={busyId === plan.id}
                        onClick={() => toggleStatus("pricing", plan.id, plan.isActive)}
                        className="rounded-lg p-1.5 text-ink-500 hover:bg-ink-100 hover:text-ink-900"
                      >
                        <Power className={`size-3.5 ${plan.isActive ? "text-brand-600" : "text-ink-400"}`} />
                      </button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </Panel>
      )}

      {/* Create Modal Sheet */}
      <Sheet open={Boolean(modalType)} onOpenChange={(open) => !open && setModalType(null)}>
        <SheetContent side="right" className="w-full sm:max-w-md overflow-y-auto p-6 bg-surface-alt">
          <SheetHeader className="text-left pb-4 border-b border-ink-100">
            <SheetTitle className="text-lg font-bold text-ink-900 capitalize">
              Add New {modalType}
            </SheetTitle>
            <SheetDescription className="text-xs text-text-subtle">
              Publish editorial marketing content to findtern.in.
            </SheetDescription>
          </SheetHeader>

          <form onSubmit={handleCreate} className="mt-6 space-y-4">
            {errorMsg ? (
              <p className="rounded-xl border border-danger/30 bg-danger-soft p-3 text-xs text-danger font-medium">
                {errorMsg}
              </p>
            ) : null}

            {modalType === "testimonial" && (
              <>
                <div>
                  <label className="block text-xs font-semibold text-ink-800">Author Name *</label>
                  <input
                    type="text"
                    required
                    value={testName}
                    placeholder="e.g. Romil Gupta"
                    onChange={(e) => setTestName(e.target.value)}
                    className="mt-1.5 h-10 w-full rounded-xl border border-ink-200 bg-white px-3 text-xs shadow-2xs outline-none focus:border-brand-600"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-ink-800">Job Title *</label>
                  <input
                    type="text"
                    required
                    value={testTitle}
                    placeholder="e.g. Fullstack Engineering Intern"
                    onChange={(e) => setTestTitle(e.target.value)}
                    className="mt-1.5 h-10 w-full rounded-xl border border-ink-200 bg-white px-3 text-xs shadow-2xs outline-none focus:border-brand-600"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-ink-800">Company *</label>
                  <input
                    type="text"
                    required
                    value={testCompany}
                    placeholder="e.g. Razorpay or Swiggy"
                    onChange={(e) => setTestCompany(e.target.value)}
                    className="mt-1.5 h-10 w-full rounded-xl border border-ink-200 bg-white px-3 text-xs shadow-2xs outline-none focus:border-brand-600"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-ink-800">Quote / Review *</label>
                  <textarea
                    rows={4}
                    required
                    value={testQuote}
                    placeholder="Findtern matched me with a fast-growing tech startup within 72 hours..."
                    onChange={(e) => setTestQuote(e.target.value)}
                    className="mt-1.5 w-full rounded-xl border border-ink-200 bg-white p-3 text-xs shadow-2xs outline-none focus:border-brand-600"
                  />
                </div>
              </>
            )}

            {modalType === "partner" && (
              <>
                <div>
                  <label className="block text-xs font-semibold text-ink-800">Partner Brand Name *</label>
                  <input
                    type="text"
                    required
                    value={partnerName}
                    placeholder="e.g. Zerodha, Cred, Razorpay"
                    onChange={(e) => setPartnerName(e.target.value)}
                    className="mt-1.5 h-10 w-full rounded-xl border border-ink-200 bg-white px-3 text-xs shadow-2xs outline-none focus:border-brand-600"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-ink-800">Logo SVG / PNG URL *</label>
                  <input
                    type="text"
                    required
                    value={partnerLogo}
                    placeholder="https://assets.findtern.in/partners/logo.svg"
                    onChange={(e) => setPartnerLogo(e.target.value)}
                    className="mt-1.5 h-10 w-full rounded-xl border border-ink-200 bg-white px-3 text-xs shadow-2xs outline-none focus:border-brand-600"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-ink-800">Website Link (Optional)</label>
                  <input
                    type="url"
                    value={partnerHref}
                    placeholder="https://company.com"
                    onChange={(e) => setPartnerHref(e.target.value)}
                    className="mt-1.5 h-10 w-full rounded-xl border border-ink-200 bg-white px-3 text-xs shadow-2xs outline-none focus:border-brand-600"
                  />
                </div>
              </>
            )}

            {modalType === "faq" && (
              <>
                <div>
                  <label className="block text-xs font-semibold text-ink-800">Category *</label>
                  <select
                    value={faqCategory}
                    onChange={(e) => setFaqCategory(e.target.value)}
                    className="mt-1.5 h-10 w-full rounded-xl border border-ink-200 bg-white px-3 text-xs shadow-2xs outline-none focus:border-brand-600"
                  >
                    <option value="General">General</option>
                    <option value="Employers">For Employers</option>
                    <option value="Interns">For Interns</option>
                    <option value="Billing">Billing & Payouts</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-ink-800">Question *</label>
                  <input
                    type="text"
                    required
                    value={faqQ}
                    placeholder="e.g. How does Findtern verify intern technical skills?"
                    onChange={(e) => setFaqQ(e.target.value)}
                    className="mt-1.5 h-10 w-full rounded-xl border border-ink-200 bg-white px-3 text-xs shadow-2xs outline-none focus:border-brand-600"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-ink-800">Answer *</label>
                  <textarea
                    rows={5}
                    required
                    value={faqA}
                    placeholder="Explain clearly in 2-4 sentences..."
                    onChange={(e) => setFaqA(e.target.value)}
                    className="mt-1.5 w-full rounded-xl border border-ink-200 bg-white p-3 text-xs shadow-2xs outline-none focus:border-brand-600"
                  />
                </div>
              </>
            )}

            <div className="pt-4 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setModalType(null)}
                className="h-10 rounded-xl border border-ink-200 bg-white px-4 text-xs font-medium text-ink-700 hover:bg-ink-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving}
                className="inline-flex h-10 items-center gap-1.5 rounded-xl bg-brand-700 px-5 text-xs font-semibold text-white shadow-2xs hover:bg-brand-600 disabled:opacity-50"
              >
                {saving ? <Loader2 className="size-3.5 animate-spin" /> : <Plus className="size-3.5" />}
                <span>Publish Item</span>
              </button>
            </div>
          </form>
        </SheetContent>
      </Sheet>
    </div>
  );
}
