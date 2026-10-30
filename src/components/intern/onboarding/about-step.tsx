"use client";

import Link from "next/link";
import { Lock } from "lucide-react";

import { FileUpload } from "@/components/app/file-upload";
import { cn } from "@/lib/utils";

import { CityStatePicker } from "../city-state-picker";
import { Field, FieldNote, Grid, Label, Section, TextArea, controlClass, describedBy } from "./fields";
import { PhotoUpload } from "./photo-upload";
import type { StepProps } from "./types";

const MB = 1024 * 1024;
/** Card images: legacy limit of 1 MB; a PDF scan is accepted as well. */
const CARD_TYPES = "image/jpeg,image/png,application/pdf";

export function AboutStep({ values, update, errors, documents, account, onUploaded }: StepProps) {
  const onFile = (label: string) => (documents.find((d) => d.label === label) ? `${label} card on file` : null);
  // A locally cached draft can carry an empty photoUrl; the stored avatar wins.
  const photoSrc = values.photoUrl || (documents.some((d) => d.label === "Profile photo") ? "/api/intern/avatar" : "");

  return (
    <div className="space-y-8">
      <Section first title="Your photo" hint="Employers recognise you by it once they hire you. Until then they see your initials.">
        <PhotoUpload
          src={photoSrc}
          error={errors.photo}
          onUploaded={() => {
            onUploaded("profile_photo");
            update("photoUrl", `/api/intern/avatar?v=${Date.now()}`);
          }}
        />
      </Section>

      <Section title="About you">
        <TextArea
          id="bio"
          label="A few lines about you"
          optional
          rows={4}
          maxLength={1000}
          placeholder="What you study, what you are good at, and the kind of work you want."
          value={values.bio}
          error={errors.bio}
          onChange={(v) => update("bio", v)}
        />
        <Grid>
          <Field
            id="linkedinUrl"
            label="LinkedIn profile"
            maxLength={300}
            optional
            type="url"
            inputMode="url"
            autoComplete="url"
            placeholder="linkedin.com/in/your-name"
            value={values.linkedinUrl}
            error={errors.linkedinUrl}
            onChange={(v) => update("linkedinUrl", v.trim())}
          />
          <div className="min-w-0">
            <Label optional>Intro video</Label>
            <FileUpload
              className="mt-2"
              kind="intro_video"
              accept="video/mp4,video/webm,video/quicktime"
              label="Intro video"
              maxBytes={50 * MB}
              preview="video"
              current={documents.find((d) => d.label === "Intro video") ? "Intro video on file" : null}
              hint="30 to 60 seconds about you. MP4, WebM or MOV, up to 50 MB."
              onUploaded={() => onUploaded("intro_video")}
            />
          </div>
        </Grid>
      </Section>

      <Section title="Identity documents" hint="Used to verify you and to pay your stipend. Never shown to employers.">
        <Grid>
          <Field
            id="aadhaarNumber"
            label="Aadhaar number"
            placeholder="2345 6789 0123"
            inputMode="numeric"
            autoComplete="off"
            inputClassName="nums tracking-wide"
            value={formatAadhaar(values.aadhaarNumber || "")}
            error={errors.aadhaarNumber}
            onChange={(v) => update("aadhaarNumber", v.replace(/\D/g, "").slice(0, 12))}
          />
          <Field
            id="panNumber"
            label="PAN"
            placeholder="ABCDE1234F"
            autoComplete="off"
            maxLength={10}
            inputClassName="nums uppercase tracking-wide"
            value={values.panNumber || ""}
            error={errors.panNumber}
            onChange={(v) => update("panNumber", v.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 10))}
          />
          <DocSlot id="aadhaarImage" label="Aadhaar card image" optional error={errors.aadhaarImage}>
            <FileUpload
              kind="aadhaar"
              accept={CARD_TYPES}
              label="Aadhaar card image"
              noun="Aadhaar card"
              maxBytes={1 * MB}
              current={onFile("Aadhaar")}
              hint="The front side. JPG, PNG or PDF, up to 1 MB."
              onUploaded={() => onUploaded("aadhaar")}
            />
          </DocSlot>
          <DocSlot id="panImage" label="PAN card image" error={errors.panImage}>
            <FileUpload
              kind="pan"
              accept={CARD_TYPES}
              label="PAN card image"
              noun="PAN card"
              maxBytes={1 * MB}
              current={onFile("PAN")}
              hint="The front side. JPG, PNG or PDF, up to 1 MB."
              onUploaded={() => onUploaded("pan")}
            />
          </DocSlot>
        </Grid>
      </Section>

      <Section title="Where you live">
        <Grid cols={3}>
          <CityStatePicker
            state={values.state}
            city={values.city}
            onState={(v) => update("state", v)}
            onCity={(v) => update("city", v)}
            stateError={errors.state}
            cityError={errors.city}
          />
          <Field
            id="pinCode"
            label="PIN code"
            inputMode="numeric"
            autoComplete="postal-code"
            maxLength={6}
            placeholder="302017"
            inputClassName="nums tracking-wide"
            value={values.pinCode}
            error={errors.pinCode}
            onChange={(v) => update("pinCode", v.replace(/\D/g, "").slice(0, 6))}
          />
        </Grid>
      </Section>

      <Section title="Phone numbers" hint="Interview and offer updates go to your number. The emergency number is only for Findtern.">
        <Grid>
          <div className="min-w-0">
            <Label htmlFor="ownPhone">Your mobile number</Label>
            <PhonePrefixed
              id="ownPhone"
              code={account?.countryCode || "+91"}
              value={account?.phoneNumber ?? ""}
              disabled
              placeholder="No number on your account"
              error={errors.ownPhone}
            />
            <FieldNote
              id="ownPhone"
              error={
                errors.ownPhone ? (
                  <>
                    {errors.ownPhone}{" "}
                    <Link href="/intern/settings" className="font-semibold underline underline-offset-4">
                      Open Settings
                    </Link>
                  </>
                ) : undefined
              }
              hint={
                <>
                  From your sign-up. To change it, go to{" "}
                  <Link href="/intern/settings" className="font-medium text-brand-700 underline-offset-4 hover:underline">
                    Settings
                  </Link>
                  .
                </>
              }
            />
          </div>
          <div className="min-w-0">
            <Label htmlFor="emergencyPhone">Emergency contact number</Label>
            <PhonePrefixed
              id="emergencyPhone"
              code="+91"
              value={values.emergencyPhone}
              placeholder="98765 43210"
              error={errors.emergencyPhone}
              hint="Someone we can call if we cannot reach you. Indian numbers only."
              onChange={(v) => {
                update("emergencyPhone", v);
                if (values.emergencyCountryCode !== "+91") update("emergencyCountryCode", "+91");
              }}
            />
            <FieldNote id="emergencyPhone" error={errors.emergencyPhone} hint="Someone we can call if we cannot reach you. Indian numbers only." />
          </div>
        </Grid>
      </Section>
    </div>
  );
}

/** "234567890123" → "2345 6789 0123" while typing. */
function formatAadhaar(digits: string): string {
  return digits.replace(/\D/g, "").replace(/(\d{4})(?=\d)/g, "$1 ");
}

/** A number with its country code shown as a fixed prefix inside the control. */
function PhonePrefixed({
  id,
  code,
  value,
  onChange,
  disabled,
  placeholder,
  error,
  hint,
}: {
  id: string;
  code: string;
  value: string;
  onChange?: (value: string) => void;
  disabled?: boolean;
  placeholder?: string;
  error?: string;
  hint?: string;
}) {
  return (
    <div className="relative mt-2">
      <span
        aria-hidden
        className="nums pointer-events-none absolute inset-y-0 left-0 flex items-center gap-1.5 border-r border-ink-200 pl-3.5 pr-3 text-[0.9375rem] font-medium text-ink-600"
      >
        {disabled ? <Lock className="size-3.5 text-text-subtle" /> : null}
        {code}
      </span>
      <input
        id={id}
        name={id}
        inputMode="numeric"
        autoComplete={disabled ? undefined : "off"}
        maxLength={code === "+91" ? 10 : 15}
        placeholder={placeholder}
        value={value}
        disabled={disabled}
        readOnly={disabled}
        onChange={(e) => onChange?.(e.target.value.replace(/\D/g, ""))}
        aria-label={`${code} number`}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(id, error, hint)}
        className={controlClass(error, cn("nums tracking-wide", disabled ? "pl-[5.25rem]" : "pl-[4.25rem]"))}
      />
    </div>
  );
}

/** An upload with its label and error, laid out like a field. */
function DocSlot({ id, label, optional, error, children }: { id: string; label: string; optional?: boolean; error?: string; children: React.ReactNode }) {
  return (
    <div id={id} tabIndex={-1} className="min-w-0 outline-none">
      <Label optional={optional}>{label}</Label>
      <div
        className={cn(
          "mt-2 rounded-apple-md border border-dashed p-3",
          error ? "border-danger bg-danger-soft/40" : "border-ink-200 bg-ink-50/40",
        )}
      >
        {children}
      </div>
      {error ? <p className="mt-1.5 text-xs font-medium text-danger">{error}</p> : null}
    </div>
  );
}
