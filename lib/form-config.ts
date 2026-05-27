export type FormValues = {
  firstTimeBooking: string;
  prescreenAggression: string;
  prescreenBitten: string;
  prescreenPottyTraining: string;
  prescreenSeparationAnxiety: string;
  prescreenFrequentBarking: string;
  prescreenSpayedNeutered: string;
  prescreenMedicalHistory: string;
  prescreenAggressionChildren: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  backupContact: string;
  wechatId: string;
  petName: string;
  petBreed: string;
  dropoffDate: string;
  pickupDate: string;
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
  type: "text" | "email" | "tel" | "select" | "date";
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
  prescreenMedicalHistory: "",
  prescreenAggressionChildren: "",
  firstName: "",
  lastName: "",
  email: "",
  phone: "",
  backupContact: "",
  wechatId: "",
  petName: "",
  petBreed: "",
  dropoffDate: "",
  pickupDate: "",
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
    name: "prescreenAggression",
    label: "Does your dog show aggression?",
  },
  {
    name: "prescreenBitten",
    label: "Has your dog ever bitten another dog or person?",
  },
  {
    name: "prescreenPottyTraining",
    label:
      "Has your dog completed potty training? Does your dog have indoor accidents (urination/defecation)?",
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
    name: "prescreenSpayedNeutered",
    label: "Is your dog spayed or neutered?",
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
    name: "dropoffDate",
    type: "date",
    label: "Drop-off date",
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
    body: "Additional fees may apply for repeated indoor accidents, diaper management, excessive cleaning, severe shedding, refusal to eat, or special feeding support.",
  },
  {
    title: "9. Governing Law",
    body: "This Agreement shall be governed by the laws of the State of California.",
  },
  {
    title: "10. Owner Acknowledgment",
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
  "wechatId",
  "petName",
  "petBreed",
  "dropoffDate",
  "pickupDate",
];
