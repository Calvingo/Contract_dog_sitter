"use client";

import { useActionState, useState } from "react";
import type { ActionState } from "@/components/ActionForm";
import { archiveDog, restoreDog, saveDog } from "@/app/account/actions";
import { prescreenQuestions } from "@/lib/form-config";
import { prescreenPrefillValues, type PrefillPet } from "@/lib/booking-prefill";

type ArchivedDog = Pick<PrefillPet, "id" | "name" | "breed" | "weightLb" | "ageYears">;
type DogDraft = {
  name: string;
  breed: string;
  weightLb: string;
  ageYears: string;
  answers: Record<string, string>;
  notes: string;
};

function dogDraft(dog?: PrefillPet): DogDraft {
  const saved = dog ? prescreenPrefillValues(dog) : {};
  return {
    name: dog?.name ?? "",
    breed: dog?.breed ?? "",
    weightLb: dog ? String(dog.weightLb) : "",
    ageYears: dog?.ageYears == null ? "" : String(dog.ageYears),
    answers: Object.fromEntries(prescreenQuestions.map((question) => [
      question.name, String(saved[question.name] || ""),
    ])),
    notes: String(saved.prescreenNotes || ""),
  };
}

function DogEditor({ dog, onSaved }: { dog?: PrefillPet; onSaved: (message: string) => void }) {
  const [draft, setDraft] = useState(() => dogDraft(dog));
  const [state, action, pending] = useActionState(
    async (previous: ActionState, form: FormData) => {
      const result = await saveDog(previous, form);
      if (result.message) {
        onSaved(result.message);
        if (!dog) setDraft(dogDraft());
      }
      return result;
    },
    {},
  );
  const change = (field: keyof Omit<DogDraft, "answers">, value: string) =>
    setDraft((current) => ({ ...current, [field]: value }));
  return (
    <form action={action} className="form-stack">
      <input type="hidden" name="id" value={dog?.id ?? ""} />
      <fieldset disabled={pending} className="form-stack">
        <div className="field-grid">
          <label>
            Dog’s name
            <input name="name" value={draft.name} onChange={(event) => change("name", event.target.value)} required maxLength={100} />
          </label>
          <label>
            Breed
            <input name="breed" value={draft.breed} onChange={(event) => change("breed", event.target.value)} required maxLength={100} />
          </label>
          <label>
            Weight (lb)
            <input name="weightLb" type="number" min="0.1" max="300" step="0.1" value={draft.weightLb} onChange={(event) => change("weightLb", event.target.value)} required />
          </label>
          <label>
            Age (years)
            <input name="ageYears" type="number" min="0" max="40" step="0.1" value={draft.ageYears} onChange={(event) => change("ageYears", event.target.value)} />
          </label>
        </div>
        <details>
          <summary className="cursor-pointer font-semibold">Care answers &amp; notes</summary>
          <div className="form-stack mt-4">
            <p className="small">Saved answers are filled in for your next booking. You can leave an answer blank and complete it when booking.</p>
            {prescreenQuestions.map((question) => (
              <label key={question.name}>
                {question.label}
                <select
                  name={question.name}
                  value={draft.answers[question.name]}
                  onChange={(event) => setDraft((current) => ({
                    ...current,
                    answers: { ...current.answers, [question.name]: event.target.value },
                  }))}
                >
                  <option value="">Not answered</option>
                  <option value="yes">Yes</option>
                  <option value="no">No</option>
                </select>
              </label>
            ))}
            <label>
              Care notes
              <textarea name="prescreenNotes" rows={4} maxLength={5000} value={draft.notes} onChange={(event) => change("notes", event.target.value)} placeholder="Meals, medication, routines or anything else we should know." />
            </label>
          </div>
        </details>
        <button className="button" disabled={pending}>{pending ? "Saving…" : dog ? "Save dog profile" : "Add dog"}</button>
      </fieldset>
      {state.error && <p role="alert" className="notice error">{state.error}</p>}
    </form>
  );
}

function DogArchiveControl({
  dog,
  archived = false,
  onSaved,
}: {
  dog: ArchivedDog;
  archived?: boolean;
  onSaved: (message: string) => void;
}) {
  const [state, action, pending] = useActionState(
    async (previous: ActionState, form: FormData) => {
      const result = await (archived ? restoreDog : archiveDog)(previous, form);
      if (result.message) onSaved(result.message);
      return result;
    },
    {},
  );
  return (
    <form action={action} className="form-stack mt-5">
      <input type="hidden" name="id" value={dog.id} />
      {!archived && <p className="small">Removing this profile hides it from future bookings. You can restore it below; existing bookings stay in place.</p>}
      <button className="button secondary" disabled={pending}>
        {pending ? archived ? "Restoring…" : "Removing…" : archived ? `Restore ${dog.name}` : `Remove ${dog.name} from saved dogs`}
      </button>
      {state.error && <p role="alert" className="notice error">{state.error}</p>}
    </form>
  );
}

export function CustomerDogs({ dogs, archivedDogs }: { dogs: PrefillPet[]; archivedDogs: ArchivedDog[] }) {
  const [message, setMessage] = useState("");
  return (
    <div className="form-stack">
      {message && <p role="status" className="notice">{message}</p>}
      <p className="small">Profile changes apply to future bookings. Your existing bookings and signed agreements keep their original details.</p>
      {!dogs.length && <p className="notice">No saved dogs yet. Add a dog below or restore a removed profile.</p>}
      <div className="booking-grid">
        {dogs.map((dog) => (
          <section className="panel" key={dog.id}>
            <h2>{dog.name}</h2>
            <DogEditor dog={dog} onSaved={setMessage} />
            <DogArchiveControl dog={dog} onSaved={setMessage} />
          </section>
        ))}
        <section className="panel">
          <p className="eyebrow">ANOTHER MEMBER OF THE FAMILY</p>
          <h2>Add a dog</h2>
          <DogEditor onSaved={setMessage} />
        </section>
      </div>
      {archivedDogs.length > 0 && (
        <section className="panel">
          <h2>Removed dog profiles</h2>
          <p>These profiles are hidden from future bookings. Their saved details and booking history are retained.</p>
          <div className="booking-grid mt-5">
            {archivedDogs.map((dog) => (
              <div key={dog.id}>
                <h3>{dog.name}</h3>
                <p className="small">{dog.breed} · {dog.weightLb} lb{dog.ageYears == null ? "" : ` · ${dog.ageYears} years old`}</p>
                <DogArchiveControl dog={dog} archived onSaved={setMessage} />
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
