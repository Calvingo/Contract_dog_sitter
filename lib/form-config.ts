export type FormValues = {
  firstTimeBooking: string;
  prescreenAggression: string;
  prescreenBitten: string;
  prescreenPottyTraining: string;
  prescreenSeparationAnxiety: string;
  prescreenFrequentBarking: string;
  prescreenSpayedNeutered: string;
  prescreenHighEnergy: string;
  prescreenMedicalHistory: string;
  prescreenAggressionChildren: string;
  hasSecondDog: boolean;
  secondPrescreenAggression: string;
  secondPrescreenBitten: string;
  secondPrescreenPottyTraining: string;
  secondPrescreenSeparationAnxiety: string;
  secondPrescreenFrequentBarking: string;
  secondPrescreenSpayedNeutered: string;
  secondPrescreenHighEnergy: string;
  secondPrescreenMedicalHistory: string;
  secondPrescreenAggressionChildren: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  backupContact: string;
  emergencyContactName: string;
  emergencyContactPhone: string;
  wechatId: string;
  petName: string;
  petBreed: string;
  petWeightLb: string;
  petAgeYears: string;
  secondPetName: string;
  secondPetBreed: string;
  secondPetWeightLb: string;
  secondPetAgeYears: string;
  dropoffDate: string;
  dropoffTime: string;
  pickupDate: string;
  pickupTime: string;
  prescreenNotes: string;
  secondPrescreenNotes: string;
  agreed: boolean;
  signature: string;
  honeypot?: string;
};

export type SelectOption = {
  value: string;
  label: string;
};

export type FormField = {
  name: keyof FormValues;
  type: "text" | "email" | "tel" | "select" | "date" | "time" | "number";
  label: string;
  required: boolean;
  options?: SelectOption[];
  section: "booking" | "prescreen" | "owner" | "pet";
};

export type PrescreenQuestion = {
  name: keyof FormValues;
  label: string;
};

export const initialFormValues: FormValues = {
  firstTimeBooking: "",
  prescreenAggression: "",
  prescreenBitten: "",
  prescreenPottyTraining: "",
  prescreenSeparationAnxiety: "",
  prescreenFrequentBarking: "",
  prescreenSpayedNeutered: "",
  prescreenHighEnergy: "",
  prescreenMedicalHistory: "",
  prescreenAggressionChildren: "",
  hasSecondDog: false,
  secondPrescreenAggression: "",
  secondPrescreenBitten: "",
  secondPrescreenPottyTraining: "",
  secondPrescreenSeparationAnxiety: "",
  secondPrescreenFrequentBarking: "",
  secondPrescreenSpayedNeutered: "",
  secondPrescreenHighEnergy: "",
  secondPrescreenMedicalHistory: "",
  secondPrescreenAggressionChildren: "",
  firstName: "",
  lastName: "",
  email: "",
  phone: "",
  backupContact: "",
  emergencyContactName: "",
  emergencyContactPhone: "",
  wechatId: "",
  petName: "",
  petBreed: "",
  petWeightLb: "",
  petAgeYears: "",
  secondPetName: "",
  secondPetBreed: "",
  secondPetWeightLb: "",
  secondPetAgeYears: "",
  dropoffDate: "",
  dropoffTime: "",
  pickupDate: "",
  pickupTime: "",
  prescreenNotes: "",
  secondPrescreenNotes: "",
  agreed: false,
  signature: "",
  honeypot: "",
};

export const yesNoOptions: SelectOption[] = [
  { value: "yes", label: "Yes" },
  { value: "no", label: "No" },
];

export const backupContactOptions: SelectOption[] = [
  { value: "phone", label: "Phone" },
  { value: "email", label: "Email" },
  { value: "sms", label: "SMS" },
  { value: "wechat", label: "WeChat" },
];

export const prescreenQuestions: PrescreenQuestion[] = [
  {
    name: "prescreenSpayedNeutered",
    label: "Is your dog spayed or neutered?",
  },
  {
    name: "prescreenHighEnergy",
    label:
      "Would you describe your dog as high-energy? (Selecting Yes adds a $10/day high-energy care fee.)",
  },
  {
    name: "prescreenAggression",
    label: "Does your dog show aggression?",
  },
  {
    name: "prescreenBitten",
    label: "Has your dog ever bitten another dog or person?",
  },
  {
    name: "prescreenPottyTraining",
    label: "Does your dog have indoor accidents at home?",
  },
  {
    name: "prescreenSeparationAnxiety",
    label: "Does your dog have severe separation anxiety?",
  },
  {
    name: "prescreenFrequentBarking",
    label: "Does your dog bark frequently?",
  },
  {
    name: "prescreenMedicalHistory",
    label:
      "Does your dog have chronic illness, underlying medical conditions, or a history of surgery?",
  },
  {
    name: "prescreenAggressionChildren",
    label: "Does your dog show aggression toward children?",
  },
];

export const secondPrescreenQuestions: PrescreenQuestion[] = [
  { name: "secondPrescreenSpayedNeutered", label: "Is your dog spayed or neutered?" },
  { name: "secondPrescreenHighEnergy", label: "Would you describe your dog as high-energy? (Selecting Yes adds a $10/day high-energy care fee.)" },
  { name: "secondPrescreenAggression", label: "Does your dog show aggression?" },
  { name: "secondPrescreenBitten", label: "Has your dog ever bitten another dog or person?" },
  { name: "secondPrescreenPottyTraining", label: "Does your dog have indoor accidents at home?" },
  { name: "secondPrescreenSeparationAnxiety", label: "Does your dog have severe separation anxiety?" },
  { name: "secondPrescreenFrequentBarking", label: "Does your dog bark frequently?" },
  { name: "secondPrescreenMedicalHistory", label: "Does your dog have chronic illness, underlying medical conditions, or a history of surgery?" },
  { name: "secondPrescreenAggressionChildren", label: "Does your dog show aggression toward children?" },
];

export const secondPetFields: FormField[] = [
  { name: "secondPetName", type: "text", label: "Name", required: true, section: "pet" },
  { name: "secondPetBreed", type: "text", label: "Breed", required: true, section: "pet" },
  { name: "secondPetWeightLb", type: "number", label: "Weight (lbs)", required: true, section: "pet" },
  { name: "secondPetAgeYears", type: "number", label: "Age (years; e.g. 0.5 for 6 months)", required: true, section: "pet" },
];

export const formFields: FormField[] = [
  {
    name: "firstTimeBooking",
    type: "select",
    label: "Is this your first time booking with Silicon Paws Retreat?",
    required: true,
    options: yesNoOptions,
    section: "booking",
  },
  {
    name: "firstName",
    type: "text",
    label: "First Name",
    required: true,
    section: "owner",
  },
  {
    name: "lastName",
    type: "text",
    label: "Last Name",
    required: true,
    section: "owner",
  },
  {
    name: "email",
    type: "email",
    label: "Email address",
    required: true,
    section: "owner",
  },
  {
    name: "phone",
    type: "tel",
    label: "Phone number",
    required: true,
    section: "owner",
  },
  {
    name: "backupContact",
    type: "select",
    label: "Preferred backup contact method",
    required: true,
    options: backupContactOptions,
    section: "owner",
  },
  {
    name: "emergencyContactName",
    type: "text",
    label: "Emergency Contact Name (not the Owner; for use if the Owner is unreachable)",
    required: true,
    section: "owner",
  },
  {
    name: "emergencyContactPhone",
    type: "tel",
    label: "Emergency Contact Phone (not the Owner; for use if the Owner is unreachable)",
    required: true,
    section: "owner",
  },
  {
    name: "wechatId",
    type: "text",
    label: "WeChat ID",
    required: false,
    section: "owner",
  },
  {
    name: "petName",
    type: "text",
    label: "Name",
    required: true,
    section: "pet",
  },
  {
    name: "petBreed",
    type: "text",
    label: "Breed",
    required: true,
    section: "pet",
  },
  {
    name: "petWeightLb",
    type: "number",
    label: "Weight (lbs)",
    required: true,
    section: "pet",
  },
  {
    name: "petAgeYears",
    type: "number",
    label: "Age (years; e.g. 0.5 for 6 months)",
    required: true,
    section: "pet",
  },
  {
    name: "dropoffDate",
    type: "date",
    label: "Drop-off date",
    required: true,
    section: "pet",
  },
  {
    name: "dropoffTime",
    type: "time",
    label: "Drop-off time (24h)",
    required: true,
    section: "pet",
  },
  {
    name: "pickupDate",
    type: "date",
    label: "Pick-up date",
    required: true,
    section: "pet",
  },
  {
    name: "pickupTime",
    type: "time",
    label: "Pick-up time (24h)",
    required: true,
    section: "pet",
  },
];

export type AgreementSection = {
  title: string;
  body: string;
};

export const agreementSections: AgreementSection[] = [
  {
    title: "1. Assumption of Risk",
    body: "The Owner understands and voluntarily assumes all risks associated with dog boarding, daycare, transportation, feeding, outdoor activities, social play, and interaction with people and other dogs. The Owner acknowledges that even with reasonable supervision, dogs may experience injuries, stress-related illness, gastrointestinal upset, anxiety, escapes, pre-existing condition flare-ups, sudden illness, or death. The Owner further understands that the Sitter cannot guarantee an injury-free, illness-free, or stress-free environment.",
  },
  {
    title: "2. Release of Liability",
    body: "The Owner releases and agrees to hold harmless the Sitter from any claims, damages, injuries, illnesses, losses, veterinary expenses, death, or legal actions arising from boarding or daycare services, except in cases of proven gross negligence or intentional misconduct. Senior dogs over 10 years old, or dogs with prior surgeries, chronic illness, congenital conditions, or other pre-existing medical concerns may experience worsening conditions, sudden illness, or death during boarding due to stress or underlying health conditions. The Sitter shall not be held financially or legally responsible.",
  },
  {
    title: "3. Veterinary Care Authorization",
    body: "If the dog becomes sick or injured, the Sitter is authorized to seek veterinary care reasonably deemed necessary. Maximum voluntary veterinary contribution by Sitter: $200. Any contribution does not constitute admission of liability.",
  },
  {
    title: "4. Emergency Transportation",
    body: "Transportation and accompaniment fees may apply for veterinary visits. Current accompaniment fee: $30/hour.",
  },
  {
    title: "5. Dog Aggression & Bite Liability",
    body: "Owners certify that their dogs have no undisclosed aggression history. If a dog with undisclosed aggression injures another dog, person, or property, full responsibility rests with that dog's Owner. If both dogs have no known aggression history, the Sitter may voluntarily contribute up to $200 toward veterinary expenses without admitting fault.",
  },
  {
    title: "6. Behavioral & Boarding Requirements",
    body: "Female dogs in heat are not accepted. Adult dogs that are not spayed or neutered may be refused. The Sitter reserves the right to refuse or terminate services for safety or operational reasons.",
  },
  {
    title: "7. Cancellation Policy",
    body: "Deposits are non-refundable for cancellations made less than 7 days before the booking date.",
  },
  {
    title: "8. Special Care Fees",
    body: "A high-energy care fee of $10 per day applies when the Owner selects Yes. A $10 per-day special-care fee may also apply for repeated indoor accidents, diaper management, excessive cleaning, severe shedding, refusal to eat, or special feeding support.",
  },
  {
    title: "9. Behavioral Issues, Early Termination, Late Pickup & Abandonment",
    body: "The Owner shall fully and truthfully disclose all known behavioral and medical concerns, including aggression, biting, resource guarding, excessive barking, destructive behavior, escape attempts, separation anxiety, and other safety-related issues. Passing a screening or questionnaire does not guarantee the dog’s future behavior or suitability for boarding in a new environment. The Sitter may terminate boarding early if, in the Sitter’s reasonable judgment, the dog presents a safety risk, cannot be safely managed, causes substantial disruption or property damage, or is otherwise unsuitable for continued boarding. Upon notice, the Owner shall retrieve the dog, or arrange for an authorized Emergency Contact to retrieve the dog, within the reasonable time specified by the Sitter. Travel, work, financial, or personal circumstances do not excuse this obligation. The Owner shall provide at least one valid Emergency Contact who is authorized and able to retrieve the dog. If an immediate safety or animal-welfare concern arises and neither the Owner nor the Emergency Contact responds or retrieves the dog, the Sitter may take reasonable temporary safety measures and seek assistance from a licensed veterinarian, animal-control agency, or law-enforcement agency, as permitted by law. This provision does not authorize permanent transfer or disposition of the dog before legally permitted. If the dog is not retrieved at the agreed date and time, boarding charges at the applicable daily rate, together with expressly stated and legally recoverable care, veterinary, and transportation expenses, will continue while the dog remains in the Sitter’s custody. Continued temporary care does not constitute free extended boarding or a waiver of payment. Except for duties required by applicable abandonment laws, the Sitter is not responsible for providing long-term care or rehoming services. IMPORTANT ABANDONMENT NOTICE: IF THE DOG IS NOT RETRIEVED WITHIN 14 CALENDAR DAYS AFTER THE DAY THE DOG WAS INITIALLY DUE TO BE PICKED UP, THE DOG SHALL BE DEEMED ABANDONED UNDER CALIFORNIA CIVIL CODE §1834.5. After the dog is legally deemed abandoned, the Sitter shall, for a period of not less than 10 days, attempt to find a new owner or arrange transfer to a public animal-control agency or shelter, SPCA shelter, humane society shelter, or nonprofit animal-rescue group that has agreed to accept the dog, as required by applicable law. After a lawful transfer, custody, redemption rights, holding periods, fees, adoption, and final disposition will be governed by the receiving organization and applicable law. The Sitter does not guarantee that the Owner will be able to reclaim the dog after transfer. The Owner remains responsible for all unpaid boarding charges and other legally recoverable veterinary, care, transportation, and transfer expenses incurred while the dog remains in the Sitter’s custody. The Sitter may preserve communications, photographs, videos, incident reports, invoices, and records of contacts with emergency contacts, veterinarians, animal-control agencies, shelters, and rescue organizations. Nothing in this Agreement limits the Sitter’s obligation to provide any humane care, nutrition, water, shelter, veterinary attention, notification, or other protection required by applicable law.",
  },
  {
    title: "10. Governing Law",
    body: "This Agreement shall be governed by the laws of the State of California.",
  },
  {
    title: "11. Owner Acknowledgment",
    body: "By signing below, the Owner confirms they have read, understood, and agreed to all terms above.",
  },
];

export function getOptionLabel(
  options: SelectOption[] | undefined,
  value: string
): string {
  const option = options?.find((item) => item.value === value);
  return option?.label ?? value;
}

export const allSubmittableFieldKeys: (keyof FormValues)[] = [
  "firstTimeBooking",
  ...prescreenQuestions.map((q) => q.name),
  "firstName",
  "lastName",
  "email",
  "phone",
  "backupContact",
  "emergencyContactName",
  "emergencyContactPhone",
  "wechatId",
  "petName",
  "petBreed",
  "petWeightLb",
  "petAgeYears",
  "dropoffDate",
  "dropoffTime",
  "pickupDate",
  "pickupTime",
];
