type PaymentSettings = {
  zelleName: string;
  zelleRecipient: string;
  venmoName: string;
  venmoUsername: string;
};

export function getVenmoDetails(settings: PaymentSettings) {
  const name = settings.venmoName.trim();
  const username = settings.venmoUsername.trim().replace(/^@/, "");
  if (name && username) {
    return { name, recipient: username, profileUrl: `https://venmo.com/${encodeURIComponent(username)}` };
  }
  // This business uses the same recipient for both methods unless overridden.
  if (!name && !username && settings.zelleName.trim() && settings.zelleRecipient.trim()) {
    return {
      name: settings.zelleName.trim(),
      recipient: settings.zelleRecipient.trim(),
      profileUrl: null,
    };
  }
  return null;
}
