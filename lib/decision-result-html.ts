function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

export function resultPage(title: string, message: string, success: boolean): string {
  const color = success ? "#16a34a" : "#dc2626";
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1"/>
  <title>${escapeHtml(title)}</title>
</head>
<body style="font-family:Arial,sans-serif;background:#fff5f0;margin:0;padding:40px 20px;">
  <div style="max-width:480px;margin:0 auto;background:#fff;border-radius:16px;padding:32px;box-shadow:0 1px 3px rgba(0,0,0,.08);text-align:center;">
    <div style="font-size:48px;color:${color};margin-bottom:16px;">${success ? "✓" : "✕"}</div>
    <h1 style="font-size:22px;color:#1c1917;margin:0 0 12px;">${escapeHtml(title)}</h1>
    <p style="color:#57534e;line-height:1.6;margin:0;">${escapeHtml(message)}</p>
  </div>
</body>
</html>`;
}

export function schedulePage(options: {
  title: string;
  message: string;
  token: string;
  alreadySent: boolean;
}): string {
  const formHtml = options.alreadySent
    ? ""
    : `<form method="post" action="/api/decision/schedule" style="margin-top:24px;text-align:left;">
        <input type="hidden" name="token" value="${escapeHtml(options.token)}"/>
        <label style="display:block;font-size:13px;font-weight:bold;color:#444;margin-bottom:8px;">Meet & greet time</label>
        <input type="datetime-local" name="scheduledAt" required style="box-sizing:border-box;width:100%;border:1px solid #fed7aa;border-radius:10px;padding:12px;font-size:15px;"/>
        <button type="submit" style="margin-top:16px;width:100%;border:0;border-radius:10px;background:#ea580c;color:#fff;padding:13px 18px;font-weight:bold;font-size:15px;cursor:pointer;">Send meet & greet email</button>
      </form>`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1"/>
  <title>${escapeHtml(options.title)}</title>
</head>
<body style="font-family:Arial,sans-serif;background:#fff5f0;margin:0;padding:40px 20px;">
  <div style="max-width:520px;margin:0 auto;background:#fff;border-radius:16px;padding:32px;box-shadow:0 1px 3px rgba(0,0,0,.08);text-align:center;">
    <div style="font-size:48px;color:#ea580c;margin-bottom:16px;">✓</div>
    <h1 style="font-size:22px;color:#1c1917;margin:0 0 12px;">${escapeHtml(options.title)}</h1>
    <p style="color:#57534e;line-height:1.6;margin:0;">${escapeHtml(options.message)}</p>
    ${formHtml}
  </div>
</body>
</html>`;
}
