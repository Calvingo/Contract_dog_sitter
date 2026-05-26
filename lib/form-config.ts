export type Locale = "en" | "zh";

export type FormValues = {
  firstTimeBooking: string;
  infoUpdates: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  backupContact: string;
  petName: string;
  petBreed: string;
  agreed: boolean;
  signature: string;
  locale: Locale;
  honeypot?: string;
};

export type SelectOption = {
  value: string;
  labelEn: string;
  labelZh: string;
};

export type FormField = {
  name: keyof FormValues;
  type: "text" | "email" | "tel" | "select";
  labelEn: string;
  labelZh: string;
  required: boolean;
  options?: SelectOption[];
  section: "booking" | "owner" | "pet";
};

export const initialFormValues: FormValues = {
  firstTimeBooking: "",
  infoUpdates: "",
  firstName: "",
  lastName: "",
  email: "",
  phone: "",
  backupContact: "",
  petName: "",
  petBreed: "",
  agreed: false,
  signature: "",
  locale: "en",
  honeypot: "",
};

export const yesNoOptions: SelectOption[] = [
  { value: "yes", labelEn: "Yes", labelZh: "是" },
  { value: "no", labelEn: "No", labelZh: "否" },
];

export const infoUpdateOptions: SelectOption[] = [
  { value: "no_updates", labelEn: "No updates", labelZh: "无更新" },
  { value: "yes_updates", labelEn: "Yes, see below", labelZh: "有更新，见下方" },
];

export const backupContactOptions: SelectOption[] = [
  { value: "phone", labelEn: "Phone", labelZh: "电话" },
  { value: "email", labelEn: "Email", labelZh: "邮箱" },
  { value: "sms", labelEn: "SMS", labelZh: "短信" },
  { value: "other", labelEn: "Other", labelZh: "其他" },
];

export const formFields: FormField[] = [
  {
    name: "firstTimeBooking",
    type: "select",
    labelEn: "Is this your first time booking with Pocky & Mia Pet Boarding Service?",
    labelZh: "这是您第一次预约 Pocky & Mia 宠物寄养服务吗？",
    required: true,
    options: yesNoOptions,
    section: "booking",
  },
  {
    name: "infoUpdates",
    type: "select",
    labelEn: "Any updates on below information since last service?",
    labelZh: "自上次服务以来，以下信息有更新吗？",
    required: true,
    options: infoUpdateOptions,
    section: "booking",
  },
  {
    name: "firstName",
    type: "text",
    labelEn: "First Name",
    labelZh: "名",
    required: true,
    section: "owner",
  },
  {
    name: "lastName",
    type: "text",
    labelEn: "Last Name",
    labelZh: "姓",
    required: true,
    section: "owner",
  },
  {
    name: "email",
    type: "email",
    labelEn: "Email address",
    labelZh: "邮箱",
    required: true,
    section: "owner",
  },
  {
    name: "phone",
    type: "tel",
    labelEn: "Phone number",
    labelZh: "电话",
    required: true,
    section: "owner",
  },
  {
    name: "backupContact",
    type: "select",
    labelEn: "Preferred backup contact method (Other than WeChat)",
    labelZh: "首选备用联系方式（微信以外）",
    required: true,
    options: backupContactOptions,
    section: "owner",
  },
  {
    name: "petName",
    type: "text",
    labelEn: "Name",
    labelZh: "名字",
    required: true,
    section: "pet",
  },
  {
    name: "petBreed",
    type: "text",
    labelEn: "Breed",
    labelZh: "品种",
    required: true,
    section: "pet",
  },
];

export type AgreementSection = {
  titleEn: string;
  titleZh: string;
  bodyEn: string;
  bodyZh: string;
};

export const agreementSections: AgreementSection[] = [
  {
    titleEn: "1. Assumption of Risk",
    titleZh: "1. 风险知情与承担",
    bodyEn:
      "The Owner understands and voluntarily assumes all risks associated with dog boarding, daycare, transportation, feeding, outdoor activities, social play, and interaction with people and other dogs. The Owner acknowledges that even with reasonable supervision, dogs may experience injuries, stress-related illness, gastrointestinal upset, anxiety, escapes, pre-existing condition flare-ups, sudden illness, or death. The Owner further understands that the Sitter cannot guarantee an injury-free, illness-free, or stress-free environment.",
    bodyZh:
      "主人理解并自愿承担与狗狗寄养、日托、接送、喂食、户外活动、社交玩耍以及与人和其他狗互动相关的所有风险。主人知晓，即使在合理监管下，狗狗仍可能出现受伤、应激反应、肠胃不适、焦虑、逃跑、旧病复发、突发疾病甚至死亡等情况。主人进一步理解，寄养方无法保证绝对无受伤、无疾病或无压力的环境。",
  },
  {
    titleEn: "2. Release of Liability",
    titleZh: "2. 免责条款",
    bodyEn:
      "The Owner releases and agrees to hold harmless the Sitter from any claims, damages, injuries, illnesses, losses, veterinary expenses, death, or legal actions arising from boarding or daycare services, except in cases of proven gross negligence or intentional misconduct. Senior dogs over 10 years old, or dogs with prior surgeries, chronic illness, congenital conditions, or other pre-existing medical concerns may experience worsening conditions, sudden illness, or death during boarding due to stress or underlying health conditions. The Sitter shall not be held financially or legally responsible.",
    bodyZh:
      "除非存在严重疏忽或故意不当行为，主人同意免除寄养方因寄养或日托服务所引起的任何索赔、损害、受伤、疾病、损失、医疗费用、死亡或法律责任。对于10岁以上老年犬，或有手术史、慢性病、先天性疾病或其他基础疾病的狗狗，寄养期间可能因压力或自身健康问题导致病情恶化、突发疾病甚至死亡，寄养方不承担法律或经济责任。",
  },
  {
    titleEn: "3. Veterinary Care Authorization",
    titleZh: "3. 医疗授权",
    bodyEn:
      "If the dog becomes sick or injured, the Sitter is authorized to seek veterinary care reasonably deemed necessary. Maximum voluntary veterinary contribution by Sitter: $200. Any contribution does not constitute admission of liability.",
    bodyZh:
      "若狗狗生病或受伤，寄养方有权安排合理必要的医疗处理。寄养方自愿承担的最高医疗补助为200美元，任何补助均不代表承认责任。",
  },
  {
    titleEn: "4. Emergency Transportation",
    titleZh: "4. 紧急接送与陪同",
    bodyEn:
      "Transportation and accompaniment fees may apply for veterinary visits. Current accompaniment fee: $30/hour.",
    bodyZh: "兽医就诊可能产生接送及陪同费用。当前陪同费用：30美元/小时。",
  },
  {
    titleEn: "5. Dog Aggression & Bite Liability",
    titleZh: "5. 狗狗攻击与咬伤责任",
    bodyEn:
      "Owners certify that their dogs have no undisclosed aggression history. If a dog with undisclosed aggression injures another dog, person, or property, full responsibility rests with that dog's Owner. If both dogs have no known aggression history, the Sitter may voluntarily contribute up to $200 toward veterinary expenses without admitting fault.",
    bodyZh:
      "主人确认狗狗不存在未披露的攻击历史。若因未披露攻击史导致他人、其他狗狗或财物受伤，全部责任由该狗主人承担。若双方狗狗均无攻击历史，寄养方可自愿承担最高200美元医疗费用，但不代表承认责任。",
  },
  {
    titleEn: "6. Behavioral & Boarding Requirements",
    titleZh: "6. 寄养行为要求",
    bodyEn:
      "Female dogs in heat are not accepted. Adult dogs that are not spayed or neutered may be refused. The Sitter reserves the right to refuse or terminate services for safety or operational reasons.",
    bodyZh:
      "不接收发情中的母狗。未绝育成年犬可能被拒绝接收。出于安全或运营考虑，寄养方有权拒绝或终止服务。",
  },
  {
    titleEn: "7. Cancellation Policy",
    titleZh: "7. 取消政策",
    bodyEn:
      "Deposits are non-refundable for cancellations made less than 7 days before the booking date.",
    bodyZh: "距离预约日期少于7天取消，定金不退。",
  },
  {
    titleEn: "8. Special Care Fees",
    titleZh: "8. 特殊护理附加费用",
    bodyEn:
      "Additional fees may apply for repeated indoor accidents, diaper management, excessive cleaning, severe shedding, refusal to eat, or special feeding support.",
    bodyZh:
      "若出现频繁室内排泄、尿布管理、额外清洁、大量掉毛、拒食或特殊喂食需求，可能产生额外费用。",
  },
  {
    titleEn: "9. Governing Law",
    titleZh: "9. 法律适用",
    bodyEn: "This Agreement shall be governed by the laws of the State of California.",
    bodyZh: "本协议适用美国加利福尼亚州法律。",
  },
  {
    titleEn: "10. Owner Acknowledgment",
    titleZh: "10. 主人确认声明",
    bodyEn:
      "By signing below, the Owner confirms they have read, understood, and agreed to all terms above.",
    bodyZh: "签署即表示主人已阅读、理解并同意以上所有条款。",
  },
];

export function getOptionLabel(
  options: SelectOption[] | undefined,
  value: string,
  locale: Locale
): string {
  const option = options?.find((item) => item.value === value);
  if (!option) return value;
  return locale === "zh" ? option.labelZh : option.labelEn;
}

export function getFieldLabel(field: FormField, locale: Locale): string {
  return locale === "zh" ? field.labelZh : field.labelEn;
}
