import { useState, type FormEvent, type ReactNode } from 'react'
import type { HardCriteriaPatch, User } from '../api/client'
import { errorMessage } from '../lib/useAsync'
import { Button } from './ui'

type HC = User['hard_criteria']

const EDUCATION = [
  { value: '', label: 'Any' },
  { value: 'bachelors', label: "Bachelor's" },
  { value: 'masters', label: "Master's" },
  { value: 'doctorate', label: 'Doctorate' },
]
const DIET = [
  { value: 'any', label: 'Any' },
  { value: 'veg', label: 'Vegetarian' },
  { value: 'eggetarian', label: 'Eggetarian' },
  { value: 'non_veg', label: 'Non-vegetarian' },
  { value: 'vegan', label: 'Vegan' },
]

const toList = (s: string) => s.split(',').map((x) => x.trim()).filter(Boolean)
const fromList = (l?: string[] | null) => (l ?? []).join(', ')

function formFrom(hc: HC | undefined) {
  return {
    age_min: String(hc?.age_min ?? 21),
    age_max: String(hc?.age_max ?? 40),
    cities: fromList(hc?.cities),
    open_to_relocate: hc?.open_to_relocate ?? false,
    education_min: hc?.education_min ?? '',
    diet: hc?.diet ?? 'any',
    languages: fromList(hc?.languages),
    community_pref: hc?.community_pref ?? '',
  }
}

/** Only send fields that changed, so we never overwrite something the backend set meanwhile. */
function diff(before: ReturnType<typeof formFrom>, after: ReturnType<typeof formFrom>): HardCriteriaPatch {
  const p: HardCriteriaPatch = {}
  if (after.age_min !== before.age_min) p.age_min = Number(after.age_min)
  if (after.age_max !== before.age_max) p.age_max = Number(after.age_max)
  if (after.cities !== before.cities) p.cities = toList(after.cities)
  if (after.open_to_relocate !== before.open_to_relocate) p.open_to_relocate = after.open_to_relocate
  if (after.education_min !== before.education_min) p.education_min = after.education_min || null
  if (after.diet !== before.diet) p.diet = after.diet
  if (after.languages !== before.languages) p.languages = toList(after.languages)
  if (after.community_pref !== before.community_pref) p.community_pref = after.community_pref.trim() || null
  return p
}

function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="block space-y-1">
      <span className="text-xs font-medium text-muted">{label}</span>
      {children}
      {hint && <span className="block text-[11px] text-muted">{hint}</span>}
    </label>
  )
}

const input = 'w-full rounded-xl border border-line bg-cream px-3 py-2 text-sm outline-none focus:border-brand-500'

export default function HardCriteriaForm({ value, onSave }: { value: HC | undefined; onSave: (p: HardCriteriaPatch) => Promise<void> }) {
  const [saved, setSaved] = useState(() => formFrom(value))
  const [form, setForm] = useState(saved)
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState<{ ok: boolean; text: string }>()
  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) => {
    setForm((f) => ({ ...f, [k]: v }))
    setStatus(undefined)
  }

  const patch = diff(saved, form)
  const dirty = Object.keys(patch).length > 0
  const ageInvalid = Number(form.age_min) > Number(form.age_max) || Number(form.age_min) < 18

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (!dirty || ageInvalid) return
    setBusy(true)
    try {
      await onSave(patch)
      setSaved(form)
      setStatus({ ok: true, text: 'Saved. Jodi will use this from the next search.' })
    } catch (err) {
      setStatus({ ok: false, text: errorMessage(err) })
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <Field label="Age from">
          <input type="number" min={18} max={80} className={input} value={form.age_min} onChange={(e) => set('age_min', e.target.value)} />
        </Field>
        <Field label="Age to">
          <input type="number" min={18} max={80} className={input} value={form.age_max} onChange={(e) => set('age_max', e.target.value)} />
        </Field>
      </div>
      {ageInvalid && <p className="-mt-2 text-xs text-brand-700">Check the age range.</p>}

      <Field label="Cities" hint="Comma separated, e.g. Kolkata, Bangalore">
        <input className={input} value={form.cities} onChange={(e) => set('cities', e.target.value)} />
      </Field>
      <label className="flex items-center gap-3 text-sm">
        <input type="checkbox" className="size-4 accent-brand-600" checked={form.open_to_relocate} onChange={(e) => set('open_to_relocate', e.target.checked)} />
        I'm open to relocating
      </label>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Education (at least)">
          <select className={input} value={form.education_min} onChange={(e) => set('education_min', e.target.value)}>
            {EDUCATION.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </Field>
        <Field label="Diet">
          <select className={input} value={form.diet} onChange={(e) => set('diet', e.target.value)}>
            {DIET.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </Field>
      </div>

      <Field label="Languages" hint="Comma separated">
        <input className={input} value={form.languages} onChange={(e) => set('languages', e.target.value)} />
      </Field>
      <Field label="Community preference (optional)" hint="Only you set this. Jodi never infers it, and it's never used in AI scoring.">
        <input className={input} value={form.community_pref} onChange={(e) => set('community_pref', e.target.value)} placeholder="No preference" />
      </Field>

      <div className="flex items-center gap-3">
        <Button type="submit" busy={busy} disabled={!dirty || ageInvalid}>
          Save preferences
        </Button>
        {status && <p className={`text-xs ${status.ok ? 'text-sage-600' : 'text-brand-700'}`}>{status.text}</p>}
      </div>
    </form>
  )
}
