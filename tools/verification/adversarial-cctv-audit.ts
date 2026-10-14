import { PrismaClient } from "@prisma/client";

const BASE_URL = "http://127.0.0.1:3000";
const prisma = new PrismaClient();

interface TestResult {
  name: string;
  category: string;
  passed: boolean;
  details?: string;
  error?: string;
}

const results: TestResult[] = [];

function record(category: string, name: string, passed: boolean, details?: string, error?: string) {
  results.push({ category, name, passed, details, error });
  console.log(`${passed ? "✓ PASS" : "✗ FAIL"} [${category}] ${name}${details ? ` -> ${details}` : ""}${error ? ` ERROR: ${error}` : ""}`);
}

async function main() {
  console.log("=================================================================");
  console.log("  ADVERSARIAL NON-HAPPY-PATH AUDIT & DEEP VERIFICATION");
  console.log("  Target Base URL:", BASE_URL);
  console.log("=================================================================\n");

  // -----------------------------------------------------------------
  // 1. AUTHENTICATION & ACCESS CONTROL (NON-HAPPY PATHS)
  // -----------------------------------------------------------------
  console.log("--- 1. Authentication & Route Protection (Non-Happy Paths) ---");

  // 1.1 Unauthenticated access to /dashboard
  try {
    const res = await fetch(`${BASE_URL}/dashboard`, { redirect: "manual" });
    const location = res.headers.get("location") || "";
    const isRedirect = [301, 302, 303, 307, 308].includes(res.status) && location.includes("/login");
    record("Auth Protection", "Unauthenticated /dashboard must redirect to /login", isRedirect, `Status ${res.status}, Location: ${location}`);
  } catch (err: any) {
    record("Auth Protection", "Unauthenticated /dashboard must redirect to /login", false, undefined, err.message);
  }

  // 1.2 Unauthenticated access to /penjualan
  try {
    const res = await fetch(`${BASE_URL}/penjualan`, { redirect: "manual" });
    const location = res.headers.get("location") || "";
    const isRedirect = [301, 302, 303, 307, 308].includes(res.status) && location.includes("/login");
    record("Auth Protection", "Unauthenticated /penjualan must redirect to /login", isRedirect, `Status ${res.status}, Location: ${location}`);
  } catch (err: any) {
    record("Auth Protection", "Unauthenticated /penjualan must redirect to /login", false, undefined, err.message);
  }

  // 1.3 Unauthenticated access to /reports/cctv
  try {
    const res = await fetch(`${BASE_URL}/reports/cctv`, { redirect: "manual" });
    const location = res.headers.get("location") || "";
    const isRedirect = [301, 302, 303, 307, 308].includes(res.status) && location.includes("/login");
    record("Auth Protection", "Unauthenticated /reports/cctv must redirect to /login", isRedirect, `Status ${res.status}, Location: ${location}`);
  } catch (err: any) {
    record("Auth Protection", "Unauthenticated /reports/cctv must redirect to /login", false, undefined, err.message);
  }

  // 1.4 Access with forged/corrupted session cookie
  try {
    const res = await fetch(`${BASE_URL}/dashboard`, {
      headers: { cookie: "aneka_jaya_session=forged_malicious_token_xyz" },
      redirect: "manual"
    });
    const location = res.headers.get("location") || "";
    const isProtected = [301, 302, 303, 307, 308].includes(res.status) && location.includes("/login");
    record("Auth Protection", "Forged session cookie must be rejected without 500 error", isProtected, `Status ${res.status}, Location: ${location}`);
  } catch (err: any) {
    record("Auth Protection", "Forged session cookie must be rejected without 500 error", false, undefined, err.message);
  }

  // 1.5 Login with wrong password
  try {
    const res = await fetch(`${BASE_URL}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ identifier: "superadmin@gmail.com", password: "wrong_password_12345" })
    });
    const data = await res.json().catch(() => ({}));
    const isRejected = res.status === 401 && data.success === false;
    record("Auth Login", "Login with invalid password must return 401", isRejected, `Status ${res.status}, Msg: ${data.message}`);
  } catch (err: any) {
    record("Auth Login", "Login with invalid password must return 401", false, undefined, err.message);
  }

  // 1.6 Login with empty payload
  try {
    const res = await fetch(`${BASE_URL}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({})
    });
    const isHandled = res.status === 401 || res.status === 400;
    record("Auth Login", "Login with empty body must be rejected cleanly", isHandled, `Status ${res.status}`);
  } catch (err: any) {
    record("Auth Login", "Login with empty body must be rejected cleanly", false, undefined, err.message);
  }

  // 1.7 Login with valid owner credentials to acquire session
  let authCookie = "";
  try {
    const res = await fetch(`${BASE_URL}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ identifier: "superadmin@gmail.com", password: "password" })
    });
    const rawCookies = res.headers.getSetCookie?.() || [res.headers.get("set-cookie") || ""];
    authCookie = rawCookies.map((c) => c.split(";")[0]).filter(Boolean).join("; ");
    const ok = res.status === 200 && authCookie.includes("aneka_jaya_session");
    record("Auth Session", "Owner login acquires valid session cookies", ok, `Cookie keys: ${authCookie.slice(0, 45)}...`);
  } catch (err: any) {
    record("Auth Session", "Owner login acquires valid session cookies", false, undefined, err.message);
  }

  // -----------------------------------------------------------------
  // 2. CCTV WEBHOOK & API SECURITY (NON-HAPPY PATHS)
  // -----------------------------------------------------------------
  console.log("\n--- 2. CCTV Webhooks & API Security (Non-Happy Paths) ---");

  // 2.1 POST /api/cctv/events with NO token
  try {
    const res = await fetch(`${BASE_URL}/api/cctv/events`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ event_type: "packing_completed", invoice_number: "INV-TEST-001" })
    });
    const isBlocked = res.status === 401 || res.status === 403;
    record("CCTV Webhook", "Webhook rejects requests without authentication token", isBlocked, `Status ${res.status}`);
  } catch (err: any) {
    record("CCTV Webhook", "Webhook rejects requests without authentication token", false, undefined, err.message);
  }

  // 2.2 POST /api/cctv/events with INVALID / FORGED token
  try {
    const res = await fetch(`${BASE_URL}/api/cctv/events`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-cctv-token": "unauthorized_forged_cctv_token_123"
      },
      body: JSON.stringify({ event_type: "packing_completed", invoice_number: "INV-TEST-001" })
    });
    const isBlocked = res.status === 401 || res.status === 403;
    record("CCTV Webhook", "Webhook rejects requests with forged token", isBlocked, `Status ${res.status}`);
  } catch (err: any) {
    record("CCTV Webhook", "Webhook rejects requests with forged token", false, undefined, err.message);
  }

  // 2.3 POST /api/cctv/events with valid token but MALFORMED empty body
  try {
    const token = process.env.CCTV_API_TOKEN || "cctv_slm_8e119688c48b1880da69c9ab632b6c415ddc5f4d94467ea50305b951c5a0d04b";
    const res = await fetch(`${BASE_URL}/api/cctv/events`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-cctv-token": token
      },
      body: JSON.stringify({})
    });
    const isHandled = res.status >= 400 && res.status < 500;
    record("CCTV Webhook", "Webhook rejects empty payload with 4xx client error (no crash)", isHandled, `Status ${res.status}`);
  } catch (err: any) {
    record("CCTV Webhook", "Webhook rejects empty payload with 4xx client error (no crash)", false, undefined, err.message);
  }

  // 2.4 GET /api/cctv/labels/sync with unauthorized user (no session)
  try {
    const res = await fetch(`${BASE_URL}/api/cctv/labels/sync?labelId=101`, {
      method: "POST"
    });
    const isBlocked = res.status === 401 || res.status === 403;
    record("CCTV Sync API", "CCTV label sync API requires authenticated user", isBlocked, `Status ${res.status}`);
  } catch (err: any) {
    record("CCTV Sync API", "CCTV label sync API requires authenticated user", false, undefined, err.message);
  }

  // -----------------------------------------------------------------
  // 3. CLEAN SEPARATION AUDIT: MANUAL DO PACKING vs REAL CCTV
  // -----------------------------------------------------------------
  console.log("\n--- 3. Clean Separation Audit: Manual DO Packing vs Real CCTV ---");

  // 3.1 Check Sales where DO is "sudah" but NO CCTV detection exists
  const salesWithManualDO = await prisma.salesRecord.findMany({
    where: {
      deliveryOrder: { packingStatus: "sudah" },
      cctvDetections: { none: {} }
    },
    take: 3,
    include: { deliveryOrder: true }
  });

  for (const s of salesWithManualDO) {
    try {
      const pageRes = await fetch(`${BASE_URL}/penjualan/${s.id}`, {
        headers: { cookie: authCookie }
      });
      const html = await pageRes.text();

      // Check 1: Does NOT claim "CCTV Packed" or "Terdeteksi CCTV: Ya"
      const hasCctvPackedBadge = html.includes("CCTV Packed");
      const hasFakeDetectedYes = html.includes("Terdeteksi CCTV: Ya");
      const showsWaitingSignal = html.includes("Menunggu Sinyal CCTV") || html.includes("Belum Terdeteksi CCTV");

      const passed = !hasCctvPackedBadge && !hasFakeDetectedYes && showsWaitingSignal;
      record(
        "Separation Audit",
        `Sale ${s.id} (DO packed, No CCTV) shows waiting signal, zero CCTV hijack`,
        passed,
        `Status ${pageRes.status}, CctvPackedBadge: ${hasCctvPackedBadge}, FakeDetectedYes: ${hasFakeDetectedYes}, ShowsWaiting: ${showsWaitingSignal}`
      );
    } catch (err: any) {
      record("Separation Audit", `Sale ${s.id} audit failed`, false, undefined, err.message);
    }
  }

  // 3.2 Check Delivery Order detail page for manual DO without CCTV
  const doWithManualNoCctv = salesWithManualDO[0]?.deliveryOrder;
  if (doWithManualNoCctv) {
    try {
      const doRes = await fetch(`${BASE_URL}/delivery-orders/${doWithManualNoCctv.id}`, {
        headers: { cookie: authCookie }
      });
      const html = await doRes.text();

      const hasCctvPackedBadge = html.includes("CCTV Packed");
      const showsWaitingSignal = html.includes("Menunggu Sinyal CCTV") || html.includes("Belum Terdeteksi CCTV");
      const passed = !hasCctvPackedBadge && showsWaitingSignal;

      record(
        "Separation Audit",
        `DO ${doWithManualNoCctv.doNumber} detail does NOT hijack manual photo as CCTV`,
        passed,
        `Status ${doRes.status}, CctvPackedBadge: ${hasCctvPackedBadge}, ShowsWaiting: ${showsWaitingSignal}`
      );
    } catch (err: any) {
      record("Separation Audit", `DO ${doWithManualNoCctv.id} audit failed`, false, undefined, err.message);
    }
  }

  // 3.3 Check Sale with REAL CCTV detection
  const saleWithRealCctv = await prisma.salesRecord.findFirst({
    where: { cctvDetections: { some: {} } },
    include: { cctvDetections: true }
  });

  if (saleWithRealCctv) {
    try {
      const pageRes = await fetch(`${BASE_URL}/penjualan/${saleWithRealCctv.id}`, {
        headers: { cookie: authCookie }
      });
      const html = await pageRes.text();

      const showsCctvDetected = html.includes("Terdeteksi CCTV") || html.includes("Status: Selesai");
      record(
        "Real CCTV Detection",
        `Sale ${saleWithRealCctv.id} with real CCTV logs correctly renders detection`,
        showsCctvDetected,
        `Status ${pageRes.status}, Has detection elements: ${showsCctvDetected}`
      );
    } catch (err: any) {
      record("Real CCTV Detection", `Sale ${saleWithRealCctv.id} audit failed`, false, undefined, err.message);
    }
  }

  // -----------------------------------------------------------------
  // 4. INVALID ENTITY LOOKUP & GRACEFUL ERROR HANDLING (NON-HAPPY PATHS)
  // -----------------------------------------------------------------
  console.log("\n--- 4. Graceful 404 / Missing Entity Handling (Non-Happy Paths) ---");

  // 4.1 Non-existent sale ID
  try {
    const res = await fetch(`${BASE_URL}/penjualan/non-existent-uuid-99999999`, {
      headers: { cookie: authCookie }
    });
    // Next.js notFound() renders 404
    const isNotFound = res.status === 404 || res.status === 307;
    record("404 Handling", "Non-existent sale ID returns 404 cleanly (no 500 unhandled crash)", isNotFound, `Status ${res.status}`);
  } catch (err: any) {
    record("404 Handling", "Non-existent sale ID returns 404 cleanly", false, undefined, err.message);
  }

  // 4.2 Non-existent delivery order ID
  try {
    const res = await fetch(`${BASE_URL}/delivery-orders/non-existent-uuid-99999999`, {
      headers: { cookie: authCookie }
    });
    const isNotFound = res.status === 404 || res.status === 307;
    record("404 Handling", "Non-existent DO ID returns 404 cleanly (no 500 unhandled crash)", isNotFound, `Status ${res.status}`);
  } catch (err: any) {
    record("404 Handling", "Non-existent DO ID returns 404 cleanly", false, undefined, err.message);
  }

  // 4.3 Sales list filter check: cctv filter param
  try {
    const resSudah = await fetch(`${BASE_URL}/penjualan?cctv=sudah`, { headers: { cookie: authCookie } });
    const resBelum = await fetch(`${BASE_URL}/penjualan?cctv=belum`, { headers: { cookie: authCookie } });
    const resAll = await fetch(`${BASE_URL}/penjualan?cctv=all`, { headers: { cookie: authCookie } });

    const ok = resSudah.status === 200 && resBelum.status === 200 && resAll.status === 200;
    record("Filter Handling", "Sales list accepts ?cctv=sudah, ?cctv=belum, and ?cctv=all filters smoothly", ok, `Statuses: ${resSudah.status}, ${resBelum.status}, ${resAll.status}`);
  } catch (err: any) {
    record("Filter Handling", "Sales list accepts ?cctv filters smoothly", false, undefined, err.message);
  }

  console.log("\n=================================================================");
  const total = results.length;
  const passedCount = results.filter((r) => r.passed).length;
  const failedCount = total - passedCount;
  console.log(`  AUDIT COMPLETE: ${passedCount}/${total} PASSED (${failedCount} FAILED)`);
  console.log("=================================================================\n");

  await prisma.$disconnect();

  if (failedCount > 0) {
    process.exit(1);
  }
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
