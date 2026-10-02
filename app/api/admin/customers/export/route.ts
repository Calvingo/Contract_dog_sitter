import ExcelJS from "exceljs";
import { NextResponse } from "next/server";
import { getAdminSession } from "@/lib/auth/admin-session";
import { customerAudience } from "@/lib/platform/customers";
export const runtime = "nodejs";
export async function GET(request: Request) {
  if (!(await getAdminSession()))
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const params = new URL(request.url).searchParams;
  let audience;
  try {
    audience = await customerAudience(Object.fromEntries(params));
  } catch {
    return NextResponse.json(
      {
        error:
          "Unable to export. Check the date range and use the all or email audience filter.",
      },
      { status: 400 },
    );
  }
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Customers");
  sheet.columns = [
    { header: "Customer name", key: "name", width: 28 },
    { header: "Dog names", key: "dogs", width: 35 },
    { header: "Email", key: "email", width: 38 },
    { header: "Phone", key: "phone", width: 24 },
    { header: "Email marketing", key: "emailConsent", width: 20 },
  ];
  for (const c of audience.customers)
    sheet.addRow({
      name: `${c.firstName} ${c.lastName}`.trim(),
      dogs: c.pets.map((p) => p.name).join(", "),
      email: c.email,
      phone: c.phone,
      emailConsent: c.emailMarketingOptIn ? "Subscribed" : "Not subscribed",
    });
  // String-valued cells stay literal: user input is never assigned as a formula.
  sheet.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
  sheet.getRow(1).fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FF355D48" },
  };
  sheet.views = [{ state: "frozen", ySplit: 1 }];
  sheet.autoFilter = "A1:E1";
  const buffer = await workbook.xlsx.writeBuffer();
  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition":
        'attachment; filename="silicon-paws-customers.xlsx"',
      "Cache-Control": "private, no-store",
    },
  });
}
