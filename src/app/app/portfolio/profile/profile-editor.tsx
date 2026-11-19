"use client";

import { useState } from "react";
import type { ProfileConfig } from "@/content/page-components/schema";
import { Button } from "@/ui/button";
import { cn } from "@/ui/cn";
import { publishProfileAction, saveProfileAction } from "../actions";

const control =
  "w-full border-2 border-border-default bg-bg px-3 text-sm text-text-primary placeholder:text-text-secondary/70 hover:border-border-strong focus-visible:border-accent focus-visible:outline-none";

export function ProfileEditor({
  initial,
  publishedVersion,
}: {
  initial: ProfileConfig;
  publishedVersion: number | null;
}) {
  const [profile, setProfile] = useState(initial);
  const [status, setStatus] = useState<string>(
    publishedVersion ? `Freigegeben: Version ${publishedVersion}` : "Noch nicht freigegeben",
  );
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  const update = (patch: Partial<ProfileConfig>) => setProfile((p) => ({ ...p, ...patch }));

  const save = async () => {
    setBusy(true);
    const result = await saveProfileAction(profile);
    setBusy(false);
    if (!result.ok) {
      setErrors(result.fieldErrors);
      setStatus("Nicht gespeichert – bitte Eingaben prüfen");
      return false;
    }
    setErrors({});
    setStatus("Gespeichert");
    return true;
  };

  const publish = async () => {
    if (!(await save())) return;
    setBusy(true);
    const { version } = await publishProfileAction();
    setBusy(false);
    setStatus(`Freigegeben: Version ${version}`);
  };

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span role="status" data-testid="profile-status" className="font-mono text-xs text-text-secondary">
          {status}
        </span>
        <div className="flex gap-2">
          <Button variant="secondary" size="sm" disabled={busy} onClick={() => void save()}>
            Speichern
          </Button>
          <Button size="sm" disabled={busy} onClick={() => void publish()}>
            Speichern & freigeben
          </Button>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="flex flex-col gap-2 text-[13px] font-medium">
          Name
          <input
            value={profile.name}
            onChange={(e) => update({ name: e.target.value })}
            className={cn(control, "h-10 font-normal")}
          />
        </label>
        <label className="flex flex-col gap-2 text-[13px] font-medium">
          Rolle
          <input
            value={profile.role}
            placeholder="z. B. Dualer Student Informatik · SOC"
            onChange={(e) => update({ role: e.target.value })}
            className={cn(control, "h-10 font-normal")}
          />
        </label>
      </div>
      <label className="flex flex-col gap-2 text-[13px] font-medium">
        Über mich
        <textarea
          value={profile.about}
          rows={6}
          onChange={(e) => update({ about: e.target.value })}
          className={cn(control, "py-2 font-normal")}
        />
      </label>

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-2 text-[13px] font-medium">Expertise</legend>
        {profile.expertise.map((item, i) => (
          <div key={i} className="grid grid-cols-[minmax(0,1fr)_minmax(0,2fr)_auto] gap-2">
            <input
              aria-label={`Expertise ${i + 1} Bereich`}
              value={item.area}
              placeholder="Bereich"
              onChange={(e) =>
                update({ expertise: profile.expertise.map((x, j) => (j === i ? { ...x, area: e.target.value } : x)) })
              }
              className={cn(control, "h-10")}
            />
            <input
              aria-label={`Expertise ${i + 1} Details`}
              value={item.detail}
              placeholder="Belegt durch …"
              onChange={(e) =>
                update({ expertise: profile.expertise.map((x, j) => (j === i ? { ...x, detail: e.target.value } : x)) })
              }
              className={cn(control, "h-10")}
            />
            <button
              type="button"
              aria-label={`Expertise ${i + 1} entfernen`}
              onClick={() => update({ expertise: profile.expertise.filter((_, j) => j !== i) })}
              className="px-2 text-text-secondary hover:text-text-primary"
            >
              ×
            </button>
          </div>
        ))}
        <button
          type="button"
          onClick={() => update({ expertise: [...profile.expertise, { area: "Neuer Bereich", detail: "" }] })}
          className="self-start text-sm text-text-secondary underline decoration-accent underline-offset-4 hover:text-text-primary"
        >
          + Bereich
        </button>
      </fieldset>

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-2 text-[13px] font-medium">Kontakt</legend>
        <input
          aria-label="Kontakt-E-Mail"
          type="email"
          value={profile.contact.email}
          placeholder="E-Mail (optional)"
          onChange={(e) => update({ contact: { ...profile.contact, email: e.target.value } })}
          className={cn(control, "h-10 font-mono")}
        />
        {profile.contact.links.map((link, i) => (
          <div key={i} className="grid grid-cols-[minmax(0,1fr)_minmax(0,2fr)_auto] gap-2">
            <input
              aria-label={`Link ${i + 1} Bezeichnung`}
              value={link.label}
              onChange={(e) =>
                update({
                  contact: {
                    ...profile.contact,
                    links: profile.contact.links.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)),
                  },
                })
              }
              className={cn(control, "h-10")}
            />
            <input
              aria-label={`Link ${i + 1} URL`}
              value={link.url}
              placeholder="https://…"
              onChange={(e) =>
                update({
                  contact: {
                    ...profile.contact,
                    links: profile.contact.links.map((x, j) => (j === i ? { ...x, url: e.target.value } : x)),
                  },
                })
              }
              className={cn(control, "h-10 font-mono")}
            />
            <button
              type="button"
              aria-label={`Link ${i + 1} entfernen`}
              onClick={() =>
                update({ contact: { ...profile.contact, links: profile.contact.links.filter((_, j) => j !== i) } })
              }
              className="px-2 text-text-secondary hover:text-text-primary"
            >
              ×
            </button>
          </div>
        ))}
        <button
          type="button"
          onClick={() =>
            update({
              contact: {
                ...profile.contact,
                links: [...profile.contact.links, { label: "GitHub", url: "https://github.com/" }],
              },
            })
          }
          className="self-start text-sm text-text-secondary underline decoration-accent underline-offset-4 hover:text-text-primary"
        >
          + Link
        </button>
      </fieldset>

      {Object.keys(errors).length > 0 ? (
        <ul role="alert" className="font-mono text-xs text-danger">
          {Object.entries(errors).map(([k, v]) => (
            <li key={k}>
              {k}: {v}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
