import { useState, type FormEvent } from "react";
import { startAsNewPerson, type Gender } from "../api/client";
import { Button, Card, PageHeader } from "../components/ui";
import { rawError } from "../lib/useAsync";

/** "Try it as yourself": a private person of your own, so visitors (judges) don't collide with the shared heroes. */
export default function Start() {
  const [name, setName] = useState("");
  const [gender, setGender] = useState<Gender>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!name.trim() || !gender) return;
    setBusy(true);
    setError(undefined);
    try {
      await startAsNewPerson(name.trim(), gender);
      window.location.assign("/onboard"); // full load so every screen picks up the new persona
    } catch (err) {
      setError(rawError(err));
      setBusy(false);
    }
  }

  return (
    <section className="mx-auto max-w-md lg:grid lg:max-w-none lg:grid-cols-[minmax(0,28rem)_minmax(0,1fr)] lg:items-center lg:gap-16 xl:gap-24">
      <div>
        <PageHeader eyebrow="Try it as yourself" title="Meet your matchmaker">
          Tell Jodi about yourself in a normal conversation and watch it learn.
          Then it searches a world of 60 people for you, and its matchmaker
          talks to theirs.
        </PageHeader>

        <Card>
          <form onSubmit={submit} className="space-y-5">
            <label className="block space-y-1.5">
              <span className="text-sm font-medium">
                What should Jodi call you?
              </span>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Your first name"
                autoComplete="given-name"
                maxLength={40}
                className="w-full rounded-xl border border-line bg-cream px-3 py-2.5 text-sm outline-none focus:border-brand-500"
              />
            </label>

            <fieldset className="space-y-1.5">
              <legend className="text-sm font-medium">I'm looking for</legend>
              <div className="grid grid-cols-2 gap-2">
                {(
                  [
                    ["male", "A bride"],
                    ["female", "A groom"],
                  ] as const
                ).map(([g, label]) => (
                  <button
                    key={g}
                    type="button"
                    aria-pressed={gender === g}
                    onClick={() => setGender(g)}
                    className={`rounded-xl border px-3 py-2.5 text-sm transition-colors ${
                      gender === g
                        ? "border-brand-500 bg-brand-50 text-brand-700"
                        : "border-line bg-white hover:bg-sand"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </fieldset>

            {error && (
              <p className="rounded-xl bg-brand-50 p-2.5 text-xs text-brand-700">
                Couldn't start. {error}
              </p>
            )}

            <Button
              type="submit"
              className="w-full"
              busy={busy}
              disabled={!name.trim() || !gender}
            >
              Start talking to Jodi
            </Button>
          </form>
        </Card>

        <ul className="mt-5 space-y-1.5 text-xs text-muted">
          <li>
            · Your profile is private to you. Nobody else will see you in their
            matches.
          </li>
          <li>· It's a demo: use any details you like, real or made up.</li>
          <li>
            · You can switch back to Arjun or Meera's story any time from the
            menu at the top.
          </li>
        </ul>
      </div>

      {/* Desktop filler: what the next three minutes look like */}
      <figure className="hidden rounded-3xl border border-line bg-[#faf4f0] p-10 lg:block">
        <img
          src={`${import.meta.env.BASE_URL}illustrations/step-1.webp`}
          width={648}
          height={549}
          alt=""
          loading="lazy"
          decoding="async"
          className="mx-auto w-full max-w-xl"
        />
        <figcaption className="mt-6 text-center font-display text-2xl leading-snug text-ink">
          Like a family friend who knows you —{" "}
          <span className="text-brand-600">
            one conversation, then Jodi does the legwork.
          </span>
        </figcaption>
      </figure>
    </section>
  );
}
