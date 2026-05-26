import type { Locale } from "./form-config";

type UiCopy = {
  siteTitle: string;
  siteSubtitle: string;
  sections: {
    booking: string;
    owner: string;
    pet: string;
    agreement: string;
    signature: string;
  };
  selectPlaceholder: string;
  agreementIntro: string;
  agreeLabel: string;
  ownerName: string;
  dogName: string;
  date: string;
  clearSignature: string;
  submit: string;
  submitting: string;
  required: string;
  signatureRequired: string;
  agreeRequired: string;
  submitError: string;
  successTitle: string;
  successBody: string;
  backHome: string;
};

const copy: Record<Locale, UiCopy> = {
  en: {
    siteTitle: "Pocky & Mia Pet Boarding Service",
    siteSubtitle: "Pet Boarding & Daycare Agreement",
    sections: {
      booking: "Booking Information",
      owner: "Let's start with owner information",
      pet: "Tell Us About Your Fur Baby",
      agreement: "Pet Boarding & Daycare Agreement",
      signature: "Signature",
    },
    selectPlaceholder: "Select an option",
    agreementIntro:
      "Please read the agreement below carefully before signing.",
    agreeLabel: "I have read, understood, and agree to all terms above",
    ownerName: "Owner Name",
    dogName: "Dog Name(s)",
    date: "Date",
    clearSignature: "Clear",
    submit: "Submit Agreement",
    submitting: "Submitting...",
    required: "This field is required",
    signatureRequired: "Please provide your signature",
    agreeRequired: "You must agree to the terms",
    submitError: "Something went wrong. Please try again.",
    successTitle: "Agreement Submitted!",
    successBody:
      "Thank you! A confirmation email has been sent to your inbox.",
    backHome: "Back to form",
  },
  zh: {
    siteTitle: "Pocky & Mia 宠物寄养服务",
    siteSubtitle: "宠物寄养协议",
    sections: {
      booking: "预约信息",
      owner: "主人信息",
      pet: "告诉我们你的毛孩子",
      agreement: "宠物寄养协议",
      signature: "签名",
    },
    selectPlaceholder: "请选择",
    agreementIntro: "请在签名前仔细阅读以下协议。",
    agreeLabel: "我已阅读、理解并同意以上所有条款",
    ownerName: "主人姓名",
    dogName: "狗狗名字",
    date: "日期",
    clearSignature: "清除",
    submit: "提交协议",
    submitting: "提交中...",
    required: "此项为必填",
    signatureRequired: "请完成签名",
    agreeRequired: "请先同意协议条款",
    submitError: "提交失败，请稍后重试。",
    successTitle: "协议已提交！",
    successBody: "感谢填写！确认邮件已发送至您的邮箱。",
    backHome: "返回表单",
  },
};

export function getUiCopy(locale: Locale): UiCopy {
  return copy[locale];
}

export function getLocaleLabel(locale: Locale): string {
  return locale === "en" ? "中文" : "EN";
}

export function toggleLocale(locale: Locale): Locale {
  return locale === "en" ? "zh" : "en";
}
