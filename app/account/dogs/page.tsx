import { CustomerShell } from "@/components/PlatformShell";
import { ActionForm } from "@/components/ActionForm";
import { requireCustomer } from "@/lib/platform/auth";
import { prisma } from "@/lib/db";
import { saveDog } from "../actions";
function DogFields({
  dog,
}: {
  dog?: {
    id: string;
    name: string;
    breed: string;
    weightLb: number;
    ageYears: number | null;
  };
}) {
  return (
    <>
      <input type="hidden" name="id" value={dog?.id ?? ""} />
      <div className="field-grid">
        <label>
          Dog’s name
          <input
            name="name"
            defaultValue={dog?.name}
            required
            maxLength={100}
          />
        </label>
        <label>
          Breed
          <input
            name="breed"
            defaultValue={dog?.breed}
            required
            maxLength={100}
          />
        </label>
        <label>
          Weight (lb)
          <input
            name="weightLb"
            type="number"
            min="0.1"
            max="300"
            step="0.1"
            defaultValue={dog?.weightLb}
            required
          />
        </label>
        <label>
          Age (years)
          <input
            name="ageYears"
            type="number"
            min="0"
            max="40"
            step="0.1"
            defaultValue={dog?.ageYears ?? ""}
          />
        </label>
      </div>
    </>
  );
}
export default async function DogsPage() {
  const customer = await requireCustomer();
  const dogs = await prisma.pet.findMany({
    where: { customerId: customer.id },
    orderBy: { createdAt: "asc" },
  });
  return (
    <CustomerShell
      name={customer.firstName}
      title="Meet your pack."
      subtitle="Save your dog’s details once. Review their care requirements each time you book."
    >
      <div className="booking-grid">
        {dogs.map((dog) => (
          <section className="panel" key={dog.id}>
            <h2>{dog.name}</h2>
            <ActionForm action={saveDog}>
              <DogFields dog={dog} />
            </ActionForm>
          </section>
        ))}
        <section className="panel">
          <p className="eyebrow">ANOTHER MEMBER OF THE FAMILY</p>
          <h2>Add a dog</h2>
          <ActionForm action={saveDog} label="Save dog profile">
            <DogFields />
          </ActionForm>
        </section>
      </div>
    </CustomerShell>
  );
}
