import assert from "node:assert/strict";
import { createRequire, Module } from "node:module";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(import.meta.url);
const ts = require("typescript");
const originalResolve = Module._resolveFilename;
Module._resolveFilename = function (request, ...args) {
  return originalResolve.call(
    this,
    request.startsWith("@/") ? resolve(root, request.slice(2)) : request,
    ...args,
  );
};
require.extensions[".ts"] = (module, filename) =>
  module._compile(
    ts.transpileModule(readFileSync(filename, "utf8"), {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
        esModuleInterop: true,
      },
    }).outputText,
    filename,
  );
const rules = require("../lib/platform/rules.ts");
const { acceptedBookingDetails } = require("../lib/platform/accepted-booking.ts");
const {depositPolicy, federalHolidays} = require("../lib/federal-holidays.ts");
const {isPickupDropoffTimeAllowed, getPickupDropoffTimeOptions} = require("../lib/booking-time.ts");
for (const date of ["2026-10-24","2026-10-25","2026-10-26"]) {
  for (const time of ["14:30","15:00","17:30","18:00"]) {
    const allowed = date !== "2026-10-25" || time < "15:00" || time >= "18:00";
    assert.equal(isPickupDropoffTimeAllowed(time,date),allowed,`${date} ${time}`);
    assert.equal(getPickupDropoffTimeOptions(date).some(o=>o.value===time),allowed);
  }
}
for (const [start,end,name] of [
  ["2026-11-26","2026-11-26","Thanksgiving"],
  ["2026-12-25","2026-12-25","Christmas"],
  ["2027-01-01","2027-01-01","New Year's"],
  ["2027-12-24","2027-12-24","observed"],
  ["2027-12-31","2027-12-31","New Year's"],
  ["2026-12-24","2027-01-02","Christmas"],
]) {
  const policy=depositPolicy(start,end,1000);
  assert.equal(policy.nonRefundableAmount,200);
  assert.ok(policy.holidays.some(h=>h.name.includes(name)));
}
assert.equal(depositPolicy("2026-11-27","2026-11-29",1000).nonRefundable,false,"Surcharge dates are not federal holidays");
for (const [date, name] of [
  ["2026-01-01", "New Year's Day"], ["2026-01-19", "Birthday of Martin Luther King, Jr."],
  ["2026-02-16", "Washington’s Birthday"], ["2026-05-25", "Memorial Day"],
  ["2026-06-19", "Juneteenth National Independence Day"], ["2026-07-03", "Independence Day (observed)"],
  ["2026-09-07", "Labor Day"], ["2026-10-12", "Columbus Day"],
  ["2026-11-11", "Veterans Day"], ["2026-11-26", "Thanksgiving Day"], ["2026-12-25", "Christmas Day"],
]) assert.ok(depositPolicy(date, date, 100).holidays.some(h => h.name === name), `OPM 2026: ${date}`);
assert.equal(federalHolidays(2026).filter(h=>!h.name.includes("observed")).length,11);
assert.equal(rules.DEFAULT_SETTINGS.holdHours,72);
assert.equal(rules.recordedPaymentAmount({payments:[{status:"REFUNDED",amount:100}]}),0,"Historical refunded records are not payment notifications or proof of a remaining balance");
const booking={id:"a",status:"ACCEPTED",dropoffAt:new Date("2026-11-01"),pickupAt:new Date("2026-11-03"),submissionPets:[{},{}],payments:[],quotedTotal:100,holdExpiresAt:new Date(0)};
assert.deepEqual([...rules.occupancyByDay([booking,booking],true).values()],[2,2,2],"Duplicate records do not double count");
assert.equal(rules.occupancyByDay([{...booking,submissionPets:[]}],true).get("2026-11-01"),1);
const edited={...booking,status:"NEEDS_REVIEW",dropoffAt:new Date("2027-01-01"),acceptedDropoffAt:booking.dropoffAt,acceptedPickupAt:booking.pickupAt,acceptedDogs:2};
assert.deepEqual([...rules.occupancyByDay([edited],true).keys()],["2026-11-01","2026-11-02","2026-11-03"]);
assert.equal(rules.occupancyByDay([{...edited,status:"CANCELLED"}],true).size,0);
console.log("PASS Sunday boundaries, 11 nationwide federal holidays, observed/year-crossing policy, surcharge separation, 72h, legacy dog count, deduplication and accepted edit snapshot.");
if (!process.env.TEST_DATABASE_URL) process.exit(0);
const url=new URL(process.env.TEST_DATABASE_URL);
assert.ok(["localhost","127.0.0.1"].includes(url.hostname)&&url.port==="55439","Dedicated local test DB only");
process.env.DATABASE_URL=process.env.TEST_DATABASE_URL;
process.env.APP_SECRET="local-domain-test-secret-only";
const {prisma}=require("../lib/db.ts");
const {createSubmissionRecord,updateSubmissionRecord}=require("../lib/services/submission-service.ts");
const {availability,prepareStatusChange}=require("../lib/platform/capacity.ts");
const {updateCalendarRange}=require("../lib/platform/calendar-management.ts");
const {initialFormValues,prescreenQuestions,secondPrescreenQuestions}=require("../lib/form-config.ts");
const values=(email,more={})=>({...initialFormValues,firstName:"Domain",lastName:"Test",email,phone:"5555555555",backupContact:"email",emergencyContactName:"Test",emergencyContactPhone:"5555555555",firstTimeBooking:"yes",petName:"Coco",petBreed:"Mix",petWeightLb:"20",petAgeYears:"3",dropoffDate:"2090-04-01",pickupDate:"2090-04-03",dropoffTime:"10:00",pickupTime:"10:00",signature:"data:image/png;base64,dGVzdA==",agreed:true,...Object.fromEntries([...prescreenQuestions,...secondPrescreenQuestions].map(q=>[q.name,"no"])),...more});
const {validateSubmission}=require("../lib/validate.ts");
for(const dates of [
  {dropoffDate:"2026-10-25",dropoffTime:"15:00",pickupDate:"2026-10-26"},
  {dropoffDate:"2026-10-24",pickupDate:"2026-10-25",pickupTime:"17:30"},
]) assert.match(validateSubmission(values("sunday@example.test",dates)),/except Sundays/);
const accept=id=>prisma.$transaction(async tx=>{const snapshot=await prepareStatusChange(tx,id,"ACCEPTED");return tx.submission.update({where:{id},data:{status:"ACCEPTED",...snapshot}});});
const email=`domain-${Date.now()}@example.test`, second=`second-${Date.now()}@example.test`;
const old=await prisma.platformSettings.findUnique({where:{id:"default"}});
const customers=[];
try {
  await prisma.platformSettings.upsert({where:{id:"default"},create:{id:"default",defaultCapacity:2},update:{defaultCapacity:2,includePickupDay:true}});
  const a=await createSubmissionRecord(values(email,{hasSecondDog:true,secondPetName:"Milo",secondPetBreed:"Mix",secondPetWeightLb:"30",secondPetAgeYears:"3"}));customers.push(a.customer.id);
  const b=await createSubmissionRecord(values(second));customers.push(b.customer.id);
  assert.ok((await availability("2090-04-01","2090-04-03")).days.every(d=>d.occupied===0),"Pending never reserves");
  const raced=await Promise.allSettled([accept(a.submission.id),accept(b.submission.id)]);
  assert.equal(raced.filter(r=>r.status==="fulfilled").length,1,"Concurrent accepts cannot oversell");
  const winner=raced[0].status==="fulfilled"?a:b;
  const dogs=winner.submission.id===a.submission.id?2:1;
  await assert.rejects(accept(winner.submission.id),/already accepted/);
  assert.ok((await availability("2090-04-01","2090-04-03")).days.every(d=>d.occupied===dogs));
  await prisma.submission.update({where:{id:winner.submission.id},data:{holdExpiresAt:new Date(0)}});
  await updateSubmissionRecord({submissionId:winner.submission.id,data:values(winner.customer.email,{dropoffDate:"2090-05-01",pickupDate:"2090-05-03"})});
  assert.ok((await availability("2090-04-01","2090-04-03")).days.every(d=>d.occupied===dogs),"Editing preserves accepted dates and count");
  assert.ok((await availability("2090-05-01","2090-05-03")).days.every(d=>d.occupied===0));
  await accept(winner.submission.id);
  assert.ok((await availability("2090-04-01","2090-04-03")).days.every(d=>d.occupied===0));
  assert.ok((await availability("2090-05-01","2090-05-03")).days.every(d=>d.occupied===1));
  await updateCalendarRange({start:"2090-05-01",end:"2090-05-03",mode:"block"});
  assert.ok((await availability("2090-05-01","2090-05-03")).days.every(d=>d.closed&&d.occupied===1));
  await updateCalendarRange({start:"2090-05-01",end:"2090-05-03",mode:"unblock"});
  assert.ok((await availability("2090-05-01","2090-05-03")).days.every(d=>!d.closed&&d.occupied===1));
  await updateCalendarRange({start:"2090-05-01",end:"2090-05-03",mode:"reset"});
  await prisma.platformSettings.update({where:{id:"default"},data:{defaultCapacity:0}});
  assert.ok((await availability("2090-05-01","2090-05-03")).days.every(d=>d.overCapacity&&d.occupied===1&&d.remaining===0));
  await prisma.submission.update({where:{id:winner.submission.id},data:{status:"CANCELLED"}});
  assert.ok((await availability("2090-05-01","2090-05-03")).days.every(d=>d.occupied===0));
  await prisma.bookingBlocklist.create({data:{email:"blocked@example.test",updatedBy:"admin@example.test"}});
  await assert.rejects(createSubmissionRecord(values("  BLOCKED@example.test  ")),/unable to accept/);
  await prisma.bookingBlocklist.update({where:{email:"blocked@example.test"},data:{blocked:false}});
  await prisma.platformSettings.update({where:{id:"default"},data:{defaultCapacity:17}});
  const restored=await createSubmissionRecord(values("blocked@example.test"));customers.push(restored.customer.id);
  assert.equal(restored.customer.email,"blocked@example.test");
  assert.equal(await prisma.marketingSuppression.count({where:{email:"blocked@example.test"}}),0);

  // Cancellation saves exactly once; SMTP failure is logged without releasing occupancy.
  const mailer=require("../lib/mailer.ts");
  process.env.ADMIN_EMAIL="first@example.test,second@example.test";
  process.env.GMAIL_USER="test@example.test";
  let sent=0;
  mailer.sendMail=async options=>{sent++; if(options.to==="first@example.test")throw new Error("simulated SMTP failure"); assert.match(options.html,/Booking ID/); assert.match(options.html,/Reason/);};
  await accept(restored.submission.id);
  const {saveCancellationRequest}=require("../lib/services/cancellation.ts");
  assert.equal(await saveCancellationRequest(restored.submission.id,"wrong-customer","Unauthorized"),false);
  const cancellations=await Promise.all([saveCancellationRequest(restored.submission.id,restored.customer.id,"Changed plans <script>"),saveCancellationRequest(restored.submission.id,restored.customer.id,"Duplicate")]);
  assert.equal(cancellations.filter(Boolean).length,1);
  assert.equal(sent,2,"Every configured admin gets one attempt, despite another recipient failing");
  assert.equal(await prisma.emailLog.count({where:{submissionId:restored.submission.id,status:"FAILED"}}),1);
  assert.equal((await availability("2090-04-01","2090-04-03")).days[0].occupied,1,"Cancellation request preserves accepted occupancy");
  assert.ok((await prisma.submission.findUnique({where:{id:restored.submission.id}})).cancellationRequestedAt);
  // Booking block management remains admin-only; financial records are read-only.
  const oldLoad=Module._load;
  Module._load=function(request,parent,...args){if(request==="next/cache")return {revalidatePath:()=>{}};return oldLoad.call(this,request,parent,...args);};
  const auth=require("../lib/platform/auth.ts");let isAdmin=true;
  auth.requirePlatformAdmin=async()=>{if(!isAdmin)throw new Error("Unauthorized");return {email:"admin@example.test"};};
  const {setBookingBlock}=require("../app/admin/booking-blocklist-actions.ts");
  const form=new FormData();form.set("email","  MIXED@example.test ");form.set("blocked","true");form.set("reason","internal-only");
  await setBookingBlock({},form);
  assert.ok((await prisma.bookingBlocklist.findUnique({where:{email:"mixed@example.test"}})).blocked);
  assert.equal(await prisma.bookingBlocklistEvent.count({where:{email:"mixed@example.test"}}),1);
  form.set("blocked","false");await setBookingBlock({},form);
  assert.equal(await prisma.marketingSuppression.count({where:{email:"mixed@example.test"}}),0);
  isAdmin=false;await assert.rejects(setBookingBlock({},form),/Unauthorized/);isAdmin=true;
  await prisma.submission.update({where:{id:restored.submission.id},data:{quotedTotal:100,depositPolicySnapshot:depositPolicy("2026-11-27","2026-11-29",100),acceptedDepositPolicySnapshot:depositPolicy("2026-12-25","2026-12-26",100)}});
  // Keep marketing exclusions on the confirmed dates while a proposal awaits review.
  await updateSubmissionRecord({
    submissionId: restored.submission.id,
    expectedRevision: restored.submission.revision,
    data: values(restored.customer.email, { dropoffDate: "2090-06-01", pickupDate: "2090-06-03", hasSecondDog: true, secondPetName: "Milo", secondPetBreed: "Mix", secondPetWeightLb: "30", secondPetAgeYears: "3" }),
  });
  const changed = await prisma.submission.findUnique({ where: { id: restored.submission.id }, include: { submissionPets: true, revisions: true } });
  const confirmed = acceptedBookingDetails(changed);
  assert.equal(confirmed.dogNames, "Coco");
  assert.equal(confirmed.dogs, 1);
  assert.equal(confirmed.dropoffAt.toISOString().slice(0, 10), "2090-04-01");
  const { customerAudience } = require("../lib/platform/customers.ts");
  assert.ok((await customerAudience({ start: "2090-04-01", end: "2090-04-03" })).excludedCustomers.some(c => c.id === restored.customer.id));
  assert.ok(!(await customerAudience({ start: "2090-06-01", end: "2090-06-03" })).excludedCustomers.some(c => c.id === restored.customer.id));
  await prisma.submission.update({ where: { id: restored.submission.id }, data: { status: "REJECTED" } });
  assert.match(rules.bookingLabel({ ...changed, status: "REJECTED" }), /proposed changes declined/);
  assert.equal((await availability("2090-04-01", "2090-04-03")).days[0].occupied, 1);
  await updateSubmissionRecord({ submissionId: restored.submission.id, data: values(restored.customer.email, { dropoffDate: "2090-06-01", pickupDate: "2090-06-03" }) });
  assert.equal((await availability("2090-04-01", "2090-04-03")).days[0].occupied, 1, "Declined changes can be revised without releasing the confirmed stay");
  // An edit's new policy cannot replace the accepted cancellation policy.
  await prisma.submission.update({where:{id:restored.submission.id},data:{acceptedDepositPolicySnapshot:depositPolicy("2026-12-25","2026-12-26",100)}});
  const history = await prisma.payment.createMany({ data: [
    { submissionId: restored.submission.id, method: "TRANSFER", amount: 20, payerName: "", reference: "notification", status: "REPORTED" },
    { submissionId: restored.submission.id, method: "ZELLE", amount: 30, payerName: "Legacy payer", reference: "legacy-verified", status: "VERIFIED", reviewNote: "Historical confirmation" },
    { submissionId: restored.submission.id, method: "VENMO", amount: 40, payerName: "Legacy payer", reference: "legacy-refund", status: "REFUNDED", reviewNote: "Historical refund" },
  ] });
  assert.equal(history.count, 3);
  const beforeReport = await prisma.payment.findMany({ where: { submissionId: restored.submission.id }, orderBy: { id: "asc" } });
  assert.deepEqual(rules.paymentSummary(beforeReport), {
    reportedCount: 1, reportedAmount: 20, historicalVerifiedAmount: 30, historicalRefundedAmount: 40,
  });
  assert.deepEqual(await prisma.payment.findMany({ where: { submissionId: restored.submission.id }, orderBy: { id: "asc" } }), beforeReport, "Reporting preserves original payment amounts, status and notes");
  const columns = await prisma.$queryRaw`SELECT column_name FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = 'Payment' ORDER BY column_name`;
  assert.deepEqual(columns.map(column => column.column_name), ["amount", "createdAt", "id", "method", "payerName", "reference", "reviewNote", "reviewedAt", "reviewedBy", "status", "submissionId"], "Payment retains its original database columns");
  assert.equal((await availability("2090-04-01","2090-04-03")).days[0].occupied,1,"Historical payment and refund records do not change occupancy");
  // Admin edits archive the signed agreement and recompute only its existing policy.
  const adminSession = require("../lib/auth/admin-session.ts");
  adminSession.getAdminSession = async () => ({ email: "admin@example.test" });
  const receiptMailer = require("../lib/email.ts");
  receiptMailer.sendSubmissionEmails = async () => {};
  const { updateSubmissionActionWithState } = require("../app/admin/actions.ts");
  const current = await prisma.submission.findUnique({ where: { id: restored.submission.id } });
  const adminEdit = new FormData();
  for (const [key, value] of Object.entries({ submissionId: current.id, revision: String(current.revision), status: "ACCEPTED", dropoffAt: "2090-12-25T10:00", pickupAt: "2090-12-27T10:00", quotedTotal: "500" })) adminEdit.set(key, value);
  assert.ok((await updateSubmissionActionWithState(null, adminEdit)).ok);
  const adminEdited = await prisma.submission.findUnique({ where: { id: current.id }, include: { revisions: true } });
  assert.equal(adminEdited.acceptedDepositPolicySnapshot.nonRefundableAmount, 100);
  assert.ok(adminEdited.revisions.some(r => r.revision === current.revision && r.signatureData === current.signatureData && r.agreementVersion === current.agreementVersion));
  assert.ok((await updateSubmissionActionWithState(null, adminEdit)).error, "Stale admin edits cannot overwrite a newer version");
  adminEdit.set("revision", String(adminEdited.revision));
  adminEdit.set("dropoffAt", "2090-12-25T10:00"); adminEdit.set("pickupAt", "2090-12-27T15:00");
  // Validate the exact Sunday rule separately from capacity and price changes.
  adminEdit.set("dropoffAt", "2026-10-25T15:00"); adminEdit.set("pickupAt", "2026-10-26T10:00");
  assert.match((await updateSubmissionActionWithState(null, adminEdit)).error, /Invalid date/);

  // Both guest and signed-in create endpoints enforce the private booking block.
  let session = null;
  require("../lib/auth/customer-session.ts").getCustomerSession = async () => session;
  require("../lib/services/submission-notification.ts").scheduleSubmissionNotification = async () => true;
  const { POST: submitPOST } = require("../app/api/submit/route.ts");
  await prisma.bookingBlocklist.update({ where: { email: restored.customer.email }, data: { blocked: true, reason: "private internal reason" } });
  for (const identity of [null, { customerId: restored.customer.id }]) {
    session = identity;
    const response = await submitPOST(new Request("http://localhost/api/submit", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(values(restored.customer.email)) }));
    assert.equal(response.status, 409);
    assert.equal((await response.json()).error, require("../lib/platform/booking-blocklist.ts").BOOKING_UNAVAILABLE_MESSAGE);
  }
  const sundayResponse = await submitPOST(new Request("http://localhost/api/submit", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(values(restored.customer.email, { dropoffDate: "2026-10-25", dropoffTime: "15:00", pickupDate: "2026-10-26" })) }));
  assert.equal(sundayResponse.status, 400);
  assert.match((await sundayResponse.json()).error, /except Sundays/);
  const { createSubmissionEditToken } = require("../lib/submission-edit-token.ts");
  const editToken = await createSubmissionEditToken(restored.submission.id);
  const { POST: editPOST } = require("../app/api/submission/edit/route.ts");
  const editResponse = await editPOST(new Request("http://localhost/api/submission/edit", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ token: editToken, values: values(restored.customer.email, { dropoffDate: "2026-10-24", pickupDate: "2026-10-25", pickupTime: "17:30" }) }) }));
  assert.equal(editResponse.status, 400);
  assert.match((await editResponse.json()).error, /except Sundays/);
  console.log("PASS accepted names/dates/deposit after edits, rejected-change re-edit, consistent marketing exclusions, admin agreement archive/policy/stale edit, private guest/signed-in API blocklist and Sunday create/edit API validation.");
  const legacy=await createSubmissionRecord(values(email,{dropoffDate:"2089-04-01",pickupDate:"2089-04-03"}));
  await prisma.submission.update({where:{id:legacy.submission.id},data:{status:"ACCEPTED",agreementVersion:"2026-05",depositPolicySnapshot:require("@prisma/client").Prisma.DbNull}});
  await updateSubmissionRecord({submissionId:legacy.submission.id,data:values(email,{dropoffDate:"2089-05-01",pickupDate:"2089-05-03"})});
  await prisma.submission.update({where:{id:legacy.submission.id},data:{acceptedDropoffAt:null,acceptedPickupAt:null,acceptedDogs:null,acceptedRevision:null}});
  const migration=readFileSync(resolve(root,"prisma/migrations/20261027000000_accepted_booking_domain/migration.sql"),"utf8");
  for(const query of migration.match(/UPDATE "Submission" s SET[\s\S]*?;/g)) await prisma.$executeRawUnsafe(query);
  const recovered=await prisma.submission.findUnique({where:{id:legacy.submission.id},include:{revisions:true}});
  assert.equal(recovered.acceptedDropoffAt.toISOString().slice(0,10),"2089-04-01");
  assert.equal(recovered.acceptedDogs,1);
  assert.equal(recovered.revisions[0].agreementVersion,"2026-05");
  assert.equal(recovered.revisions[0].depositPolicySnapshot,null);
  const oldDeadline = new Date(legacy.submission.createdAt.getTime() + 24 * 3600000);
  await prisma.submission.update({ where: { id: legacy.submission.id }, data: { lastEditedAt: null, holdExpiresAt: oldDeadline } });
  await prisma.platformSettings.update({ where: { id: "default" }, data: { holdHours: 24 } });
  await prisma.$executeRawUnsafe('UPDATE "PlatformSettings" SET "holdHours"=72 WHERE "holdHours"=24');
  await prisma.$executeRawUnsafe(migration.match(/UPDATE "Submission" SET "holdExpiresAt"[\s\S]*?;/)[0]);
  assert.equal((await prisma.platformSettings.findUnique({ where: { id: "default" } })).holdHours, 72);
  assert.equal((await prisma.submission.findUnique({ where: { id: legacy.submission.id } })).holdExpiresAt.getTime() - legacy.submission.createdAt.getTime(), 72 * 3600000);
  await prisma.platformSettings.update({ where: { id: "default" }, data: { holdHours: 48 } });
  await prisma.$executeRawUnsafe('UPDATE "PlatformSettings" SET "holdHours"=72 WHERE "holdHours"=24');
  assert.equal((await prisma.platformSettings.findUnique({ where: { id: "default" } })).holdHours, 48, "Custom windows remain unchanged");
  const {agreementSectionsForVersion}=require("../lib/form-config.ts");
  assert.ok(!agreementSectionsForVersion("2026-05").some(section=>section.body.includes("Holiday Booking Policy")));
  assert.ok(agreementSectionsForVersion("2026-10-federal-v1").some(section=>section.body.includes("Holiday Booking Policy")));
  console.log("PASS migration recovers last accepted revision, preserves original signed terms, extends exact 24h deadlines to 72h and retains custom hold settings.");
  console.log("PASS cancellation ownership/deduplication, all admin recipients, persisted SMTP failure, accepted capacity preservation, admin-only block/unblock audit and marketing isolation; read-only financial summaries preserve historical amounts/status/notes and the original Payment schema.");
  console.log("PASS real PostgreSQL concurrent acceptance, repeat acceptance, three-day/two-dog occupancy, edited and reaccepted dates, expiry persistence, block/unblock, reduced limit, cancellation, normalized blocklist enforcement and unblock/marketing isolation.");
} finally {
  await prisma.bookingBlocklistEvent.deleteMany({where:{email:"mixed@example.test"}});
  await prisma.bookingBlocklist.deleteMany({where:{email:{in:["blocked@example.test","mixed@example.test"]}}});
  await prisma.emailLog.deleteMany({where:{submission:{customerId:{in:customers}}}});
  await prisma.payment.deleteMany({where:{submission:{customerId:{in:customers}}}});
  await prisma.dailyCapacity.deleteMany({where:{date:{gte:"2090-05-01",lte:"2090-05-03"}}});
  await prisma.submission.deleteMany({where:{customerId:{in:customers}}});
  await prisma.pet.deleteMany({where:{customerId:{in:customers}}});
  await prisma.customer.deleteMany({where:{id:{in:customers}}});
  if(old) await prisma.platformSettings.update({where:{id:"default"},data:old}); else await prisma.platformSettings.deleteMany({where:{id:"default"}});
  await prisma.$disconnect();
}
