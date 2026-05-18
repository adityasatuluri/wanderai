const http = require("http");

function request(method, path, body, token) {
  return new Promise((resolve) => {
    const data = body ? JSON.stringify(body) : null;
    const headers = { "Content-Type": "application/json" };
    if (token) headers["Authorization"] = `Bearer ${token}`;
    if (data) headers["Content-Length"] = Buffer.byteLength(data);

    const req = http.request({ hostname: "localhost", port: 4000, path, method, headers }, (res) => {
      let raw = "";
      res.on("data", (c) => (raw += c));
      res.on("end", () => resolve({ status: res.statusCode, body: JSON.parse(raw) }));
    });
    req.on("error", (e) => resolve({ status: 0, body: { error: e.message } }));
    if (data) req.write(data);
    req.end();
  });
}

async function run() {
  console.log("\n=== WanderAI API Tests ===\n");

  // 1. Register
  let r = await request("POST", "/api/auth/register", { name: "Demo User", email: "demo2@test.com", password: "Demo@1234" });
  console.log(`[1] Register:        ${r.status} →`, r.body.msg || r.body);

  // 2. Login
  r = await request("POST", "/api/auth/login", { email: "demo2@test.com", password: "Demo@1234" });
  console.log(`[2] Login:           ${r.status} →`, r.body.token ? "Token received ✅" : r.body);
  const token = r.body.token;

  // 3. Chat (AI)
  r = await request("POST", "/api/chat", { message: "3-day Tokyo itinerary under $1000" }, token);
  console.log(`[3] Chat:            ${r.status} →`, r.body.reply ? "AI reply received ✅" : r.body);

  // 4. Chat History
  r = await request("GET", "/api/chat/history", null, token);
  console.log(`[4] Chat History:    ${r.status} → ${Array.isArray(r.body) ? r.body.length + " record(s) ✅" : JSON.stringify(r.body)}`);

  // 5. Save Trip
  r = await request("POST", "/api/trip", { location: "Tokyo", budget: 1000, days: 3 }, token);
  console.log(`[5] Save Trip:       ${r.status} →`, r.body.tripId ? `tripId=${r.body.tripId} ✅` : r.body);
  const tripId = r.body.tripId;

  // 6. Save Itinerary
  r = await request("POST", "/api/itinerary", { trip_id: tripId, day: "Day 1", activity: "Visit Shibuya" }, token);
  console.log(`[6] Save Itinerary:  ${r.status} →`, r.body.success ? "Saved ✅" : r.body);

  // 7. Get Trips
  r = await request("GET", "/api/trips", null, token);
  console.log(`[7] Get Trips:       ${r.status} → ${Array.isArray(r.body) ? r.body.length + " trip(s) ✅" : JSON.stringify(r.body)}`);

  // 8. Recommendations
  r = await request("GET", "/api/recommend", null, token);
  console.log(`[8] Recommendations: ${r.status} →`, r.body.destinations ? `${r.body.destinations.length} destinations ✅` : r.body);

  // 9. No token → should fail
  r = await request("POST", "/api/chat", { message: "hello" }, null);
  console.log(`[9] No-auth guard:   ${r.status} →`, r.status === 401 ? "Blocked ✅" : "NOT blocked ❌");

  // 10. OTP flow
  r = await request("POST", "/api/auth/send-otp", { email: "demo2@test.com" });
  console.log(`[10] Send OTP:       ${r.status} →`, r.body.msg ? r.body.msg : r.body);

  console.log("\n=== Tests Complete ===\n");
}

run();
