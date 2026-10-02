import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { backupContactOptions, prescreenQuestions } from "@/lib/form-config";

export class CustomerProfileError extends Error {
  constructor(message: string, public readonly status = 400) {
    super(message);
    this.name = "CustomerProfileError";
  }
}

export type CustomerDetailsInput = {
  firstName: string;
  lastName: string;
  phone: string;
  backupContact: string;
  emergencyContactName?: string;
  emergencyContactPhone?: string;
  wechatId?: string;
};

export type CustomerDogInput = {
  id?: string;
  name: string;
  breed: string;
  weightLb: number | string;
  ageYears?: number | string | null;
  prescreenAnswers?: Record<string, string>;
  prescreenNotes?: string;
};

function record(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new CustomerProfileError(`Enter valid ${label}.`);
  return value as Record<string, unknown>;
}

function onlyKeys(value: Record<string, unknown>, keys: string[]) {
  if (Object.keys(value).some((key) => !keys.includes(key)))
    throw new CustomerProfileError("This request includes unsupported profile fields.");
}

function text(value: unknown, label: string, max: number, required = true) {
  if (!required && value === undefined) return "";
  if (typeof value !== "string")
    throw new CustomerProfileError(`Enter a valid ${label}.`);
  const result = value.trim();
  if ((required && !result) || result.length > max)
    throw new CustomerProfileError(`Enter ${label}${required ? "" : " (optional)"} with no more than ${max} characters.`);
  return result;
}

function customerDetails(input: unknown) {
  const data = record(input, "contact details");
  onlyKeys(data, ["firstName", "lastName", "phone", "backupContact", "emergencyContactName", "emergencyContactPhone", "wechatId"]);
  const backupContact = text(data.backupContact, "backup contact method", 20);
  if (!backupContactOptions.some((option) => option.value === backupContact))
    throw new CustomerProfileError("Choose a valid backup contact method.");
  const wechatId = text(data.wechatId, "WeChat ID", 100, backupContact === "wechat");
  return {
    firstName: text(data.firstName, "first name", 100),
    lastName: text(data.lastName, "last name", 100),
    phone: text(data.phone, "phone number", 40),
    backupContact,
    emergencyContactName: text(data.emergencyContactName, "emergency contact name", 100, false),
    emergencyContactPhone: text(data.emergencyContactPhone, "emergency contact phone", 40, false),
    wechatId,
  };
}

function number(value: unknown, label: string, max: number, allowZero: boolean) {
  if (
    (typeof value !== "number" && typeof value !== "string") ||
    (typeof value === "string" && !/^(?:\d+(?:\.\d*)?|\.\d+)$/.test(value.trim()))
  )
    throw new CustomerProfileError(`Enter a valid ${label}.`);
  const result = Number(value);
  if (!Number.isFinite(result) || result > max || (allowZero ? result < 0 : result <= 0))
    throw new CustomerProfileError(`Enter ${label} ${allowZero ? "from 0" : "greater than 0"} and no more than ${max}.`);
  return result;
}

function dogDetails(input: unknown) {
  const data = record(input, "dog details");
  onlyKeys(data, ["id", "name", "breed", "weightLb", "ageYears", "prescreenAnswers", "prescreenNotes"]);
  const id = data.id === undefined || data.id === "" ? undefined : text(data.id, "dog ID", 100);
  let prescreenAnswers: Record<string, string> | undefined;
  if (data.prescreenAnswers !== undefined) {
    const answers = record(data.prescreenAnswers, "pre-screening answers");
    onlyKeys(answers, prescreenQuestions.map((question) => question.name));
    prescreenAnswers = {};
    for (const { name } of prescreenQuestions) {
      const value = answers[name] === undefined ? "" : text(answers[name], "pre-screening answer", 3, false).toLowerCase();
      if (value !== "" && value !== "yes" && value !== "no")
        throw new CustomerProfileError("Pre-screening answers must be Yes, No, or left blank.");
      prescreenAnswers[name] = value;
    }
  }
  return {
    id,
    name: text(data.name, "dog name", 100),
    breed: text(data.breed, "dog breed", 100),
    weightLb: number(data.weightLb, "weight in pounds", 300, false),
    ageYears: data.ageYears == null || data.ageYears === "" || (typeof data.ageYears === "string" && !data.ageYears.trim())
      ? null
      : number(data.ageYears, "age in years", 40, true),
    ...(prescreenAnswers !== undefined ? { prescreenAnswers } : {}),
    ...(data.prescreenNotes !== undefined ? { prescreenNotes: text(data.prescreenNotes, "care notes", 5000, false) } : {}),
  };
}

/** Serialize every profile mutation for an owner, including booking profile writes. */
export async function lockCustomerProfile(tx: Prisma.TransactionClient, customerId: string) {
  const owners = await tx.$queryRaw<{ id: string }[]>`
    SELECT "id" FROM "Customer" WHERE "id" = ${customerId} FOR UPDATE
  `;
  if (!owners.length) throw new CustomerProfileError("Customer profile not found.", 404);
}

async function activeOwner(tx: Prisma.TransactionClient, customerId: string) {
  await lockCustomerProfile(tx, customerId);
  const customer = await tx.customer.findUnique({ where: { id: customerId } });
  if (!customer || customer.deactivatedAt)
    throw new CustomerProfileError("This account is inactive. Contact us to restore it.", 403);
  return customer;
}

async function transaction<T>(work: (tx: Prisma.TransactionClient) => Promise<T>) {
  try {
    return await prisma.$transaction(work);
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === "P2002")
        throw new CustomerProfileError("A dog with this name already exists. Choose a different name or restore the archived dog.", 409);
      if (error.code === "P2034")
        throw new CustomerProfileError("Your profile changed while saving. Please refresh and try again.", 409);
    }
    throw error;
  }
}

async function validateDogs(tx: Prisma.TransactionClient, customerId: string, dogs: ReturnType<typeof dogDetails>[]) {
  const ids = dogs.flatMap((dog) => dog.id ? [dog.id] : []);
  if (new Set(ids).size !== ids.length)
    throw new CustomerProfileError("Select each dog only once.");
  const names = dogs.map((dog) => dog.name.toLowerCase());
  if (new Set(names).size !== names.length)
    throw new CustomerProfileError("Each dog must have a different name.");
  const existing = await tx.pet.findMany({ where: { customerId } });
  for (const dog of dogs) {
    if (dog.id && !existing.some((pet) => pet.id === dog.id && !pet.archivedAt))
      throw new CustomerProfileError("Dog not found. Restore an archived dog before editing it.", 404);
    const conflict = existing.find((pet) => pet.id !== dog.id && pet.name.toLowerCase() === dog.name.toLowerCase());
    if (conflict)
      throw new CustomerProfileError(conflict.archivedAt
        ? "A dog with this name is archived. Restore that dog before saving it."
        : "A dog with this name already exists. Choose a different name.", 409);
  }
}

async function writeDog(tx: Prisma.TransactionClient, customerId: string, dog: ReturnType<typeof dogDetails>) {
  const { id, ...data } = dog;
  return id
    ? tx.pet.update({ where: { id, customerId, archivedAt: null }, data })
    : tx.pet.create({ data: { customerId, ...data } });
}

// Optional transaction lets the account page save explicit marketing preferences atomically.
// This service itself never changes consent, email identity, or booking snapshots.
export async function saveCustomerDetails(customerId: string, input: unknown, tx?: Prisma.TransactionClient) {
  const data = customerDetails(input);
  const save = async (client: Prisma.TransactionClient) => {
    await activeOwner(client, customerId);
    return client.customer.update({ where: { id: customerId }, data });
  };
  return tx ? save(tx) : transaction(save);
}

export async function saveCustomerAndPets(customerId: string, input: unknown) {
  const body = record(input, "profile details");
  onlyKeys(body, ["customer", "pets"]);
  const customer = customerDetails(body.customer);
  if (!Array.isArray(body.pets) || body.pets.length > 2)
    throw new CustomerProfileError("Save no more than two dogs at a time.");
  const pets = body.pets.map(dogDetails);
  return transaction(async (tx) => {
    await activeOwner(tx, customerId);
    // Validate every supplied ID and name before changing either owner or dogs.
    await validateDogs(tx, customerId, pets);
    const savedCustomer = await tx.customer.update({ where: { id: customerId }, data: customer });
    const savedPets = [];
    for (const dog of pets) savedPets.push(await writeDog(tx, customerId, dog));
    return { customer: savedCustomer, pets: savedPets };
  });
}

export async function saveCustomerDog(customerId: string, input: unknown) {
  const dog = dogDetails(input);
  return transaction(async (tx) => {
    await activeOwner(tx, customerId);
    await validateDogs(tx, customerId, [dog]);
    return writeDog(tx, customerId, dog);
  });
}

export async function archiveCustomerDog(customerId: string, petId: string) {
  const id = text(petId, "dog ID", 100);
  return transaction(async (tx) => {
    await activeOwner(tx, customerId);
    const pet = await tx.pet.findFirst({ where: { id, customerId } });
    if (!pet) throw new CustomerProfileError("Dog not found.", 404);
    if (pet.archivedAt) return pet;
    return tx.pet.update({ where: { id: pet.id, customerId }, data: { archivedAt: new Date() } });
  });
}

export async function restoreCustomerDog(customerId: string, petId: string) {
  const id = text(petId, "dog ID", 100);
  return transaction(async (tx) => {
    await activeOwner(tx, customerId);
    const pet = await tx.pet.findFirst({ where: { id, customerId } });
    if (!pet) throw new CustomerProfileError("Dog not found.", 404);
    if (!pet.archivedAt) return pet;
    const conflict = await tx.pet.findFirst({ where: {
      customerId,
      id: { not: pet.id },
      archivedAt: null,
      name: { equals: pet.name, mode: "insensitive" },
    } });
    if (conflict) throw new CustomerProfileError("An active dog already has this name. Rename it before restoring this dog.", 409);
    return tx.pet.update({ where: { id: pet.id, customerId }, data: { archivedAt: null } });
  });
}

export async function deactivateCustomerAccount(customerId: string) {
  return transaction(async (tx) => {
    await lockCustomerProfile(tx, customerId);
    const customer = await tx.customer.findUniqueOrThrow({ where: { id: customerId } });
    if (customer.deactivatedAt) return customer;
    const now = new Date();
    const saved = await tx.customer.update({ where: { id: customerId }, data: {
      deactivatedAt: now,
      sessionVersion: { increment: 1 },
      emailMarketingOptIn: false,
      smsMarketingOptIn: false,
      marketingConsentUpdatedAt: now,
    } });
    if (customer.emailMarketingOptIn || customer.smsMarketingOptIn)
      await tx.marketingConsentEvent.create({ data: {
        customerId,
        emailOptIn: false,
        smsOptIn: false,
        source: "account-deactivation-v1",
      } });
    await tx.loginToken.updateMany({ where: { email: customer.email, usedAt: null }, data: { usedAt: now } });
    await tx.submissionEditToken.updateMany({ where: { submission: { customerId }, usedAt: null }, data: { usedAt: now } });
    return saved;
  });
}

// Callers must separately authorize admin access before restoring an account.
export async function restoreCustomerAccount(customerId: string) {
  return transaction(async (tx) => {
    await lockCustomerProfile(tx, customerId);
    const customer = await tx.customer.findUniqueOrThrow({ where: { id: customerId } });
    if (!customer.deactivatedAt) return customer;
    const now = new Date();
    await tx.loginToken.updateMany({ where: { email: customer.email, usedAt: null }, data: { usedAt: now } });
    await tx.submissionEditToken.updateMany({ where: { submission: { customerId }, usedAt: null }, data: { usedAt: now } });
    return tx.customer.update({ where: { id: customerId }, data: { deactivatedAt: null, sessionVersion: { increment: 1 } } });
  });
}
