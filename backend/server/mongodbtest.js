/**
 * mongo-connect-test.js
 *
 * A standalone Node.js script to test MongoDB connectivity with very verbose diagnostics.
 *
 * Usage:
 *   1) Put DB_URL in your environment (or a .env file in the same folder)
 *      DB_URL="mongodb://localhost:27017/mydb"
 *      or Atlas:
 *      DB_URL="mongodb+srv://user:pass@cluster0.xxxxx.mongodb.net/mydb?retryWrites=true&w=majority"
 *
 *   2) Install deps:
 *      npm i mongoose dotenv
 *
 *   3) Run:
 *      node mongo-connect-test.js
 *
 * Optional env vars:
 *   ATTEMPTS=5
 *   DELAY_MS=1500
 *   CONNECT_TIMEOUT_MS=8000
 *   SERVER_SELECTION_TIMEOUT_MS=8000
 *   SOCKET_TIMEOUT_MS=8000
 */

const mongoose = require("mongoose");
const dotenv = require("dotenv");
dotenv.config();

function now() {
  return new Date().toISOString();
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function safeUri(uri) {
  // Redact credentials if present
  try {
    const u = new URL(uri);
    if (u.username || u.password) {
      u.username = u.username ? "REDACTED" : "";
      u.password = u.password ? "REDACTED" : "";
    }
    return u.toString();
  } catch {
    // If it's not parseable as URL (some mongodb URIs), do a basic redact
    return uri.replace(/\/\/([^:]+):([^@]+)@/g, "//REDACTED:REDACTED@");
  }
}

function printObject(title, obj) {
  console.log(`\n=== ${title} ===`);
  for (const [k, v] of Object.entries(obj)) {
    console.log(`${k}:`, v);
  }
}

function errorDetails(err) {
  // Pull lots of possible fields across Node/Mongoose/Mongo errors
  return {
    name: err?.name,
    message: err?.message,
    code: err?.code,
    errno: err?.errno,
    syscall: err?.syscall,
    address: err?.address,
    port: err?.port,
    reason: err?.reason,
    topologyDescription: err?.topologyDescription,
    // MongoServerSelectionError often has "reason" with nested data
    // Some errors have "cause"
    cause: err?.cause ? { name: err.cause.name, message: err.cause.message, code: err.cause.code } : undefined,
    stack: err?.stack,
  };
}

async function connectOnce(uri, options, attempt) {
  console.log(`\n[${now()}] Attempt ${attempt} connecting...`);
  console.log(`URI: ${safeUri(uri)}`);
  printObject("Mongoose options", options);

  // Extra event hooks
  mongoose.connection.removeAllListeners();

  mongoose.connection.on("connecting", () => console.log(`[${now()}] event: connecting`));
  mongoose.connection.on("connected", () => console.log(`[${now()}] event: connected`));
  mongoose.connection.on("open", () => console.log(`[${now()}] event: open`));
  mongoose.connection.on("reconnected", () => console.log(`[${now()}] event: reconnected`));
  mongoose.connection.on("disconnected", () => console.log(`[${now()}] event: disconnected`));
  mongoose.connection.on("close", () => console.log(`[${now()}] event: close`));
  mongoose.connection.on("error", (e) => {
    console.log(`[${now()}] event: error`);
    printObject("connection error event details", errorDetails(e));
  });

  const started = Date.now();

  try {
    await mongoose.connect(uri, options);

    const ms = Date.now() - started;
    console.log(`[${now()}] ✅ CONNECTED in ${ms}ms`);
    console.log(`readyState: ${mongoose.connection.readyState} (1=connected)`);

    // Log server info if available
    const client = mongoose.connection.getClient?.();
    const topology = client?.topology;
    const s = topology?.s;

    if (s) {
      console.log("\n=== Topology summary ===");
      console.log("type:", s?.description?.type);
      console.log("setName:", s?.description?.setName);
      console.log("servers:", s?.description?.servers ? Array.from(s.description.servers.keys()) : undefined);
    }

    await mongoose.disconnect();
    console.log(`[${now()}] Disconnected cleanly.`);
    return { ok: true, durationMs: ms };
  } catch (err) {
    const ms = Date.now() - started;
    console.log(`[${now()}] ❌ FAILED in ${ms}ms`);
    printObject("Error details", errorDetails(err));

    // Try to show nested "reason" details (server selection often stores useful info here)
    if (err?.reason) {
      console.log("\n=== Nested reason (raw) ===");
      try {
        console.dir(err.reason, { depth: 6 });
      } catch {
        console.log(err.reason);
      }
    }

    // Ensure we reset connection state between attempts
    try {
      await mongoose.disconnect();
    } catch {}
    return { ok: false, durationMs: ms, err };
  }
}

async function main() {
  const uri = process.env.DB_URL;
  if (!uri) {
    console.error("DB_URL is missing. Set it in your environment or .env file.");
    process.exit(2);
  }

  // Recommended to avoid noisy warnings in newer versions
  mongoose.set("strictQuery", false);

  const attempts = Number(process.env.ATTEMPTS || 5);
  const delayMs = Number(process.env.DELAY_MS || 1500);

  const options = {
    // Mongoose will pass these through to the MongoDB driver
    connectTimeoutMS: Number(process.env.CONNECT_TIMEOUT_MS || 8000),
    serverSelectionTimeoutMS: Number(process.env.SERVER_SELECTION_TIMEOUT_MS || 8000),
    socketTimeoutMS: Number(process.env.SOCKET_TIMEOUT_MS || 8000),

    // Helps when a host is flaky: don't hang forever
    maxPoolSize: 5,

    // If you’re using Atlas SRV URIs, this is fine; if local, also fine.
    // family: 4, // Uncomment to force IPv4 if you suspect IPv6/DNS weirdness

    // These two are harmless on many versions, but not strictly required on latest mongoose
    useNewUrlParser: true,
    useUnifiedTopology: true,
  };

  console.log("======================================");
  console.log("MongoDB connectivity test");
  console.log(`Time: ${now()}`);
  console.log(`Node: ${process.version}`);
  console.log(`Platform: ${process.platform} ${process.arch}`);
  console.log("======================================");

  // Print env hints (not secrets)
  console.log(`ATTEMPTS=${attempts} DELAY_MS=${delayMs}`);
  console.log(`CONNECT_TIMEOUT_MS=${options.connectTimeoutMS}`);
  console.log(`SERVER_SELECTION_TIMEOUT_MS=${options.serverSelectionTimeoutMS}`);
  console.log(`SOCKET_TIMEOUT_MS=${options.socketTimeoutMS}`);

  let okCount = 0;

  for (let i = 1; i <= attempts; i++) {
    const result = await connectOnce(uri, options, i);
    if (result.ok) okCount++;

    if (i < attempts) {
      console.log(`\n[${now()}] Waiting ${delayMs}ms before next attempt...`);
      await sleep(delayMs);
    }
  }

  console.log("\n======================================");
  console.log(`Done. Successes: ${okCount}/${attempts}`);
  console.log("If this is intermittent, compare failed attempts for:");
  console.log("- address/port in error (is it localhost vs something else?)");
  console.log("- DNS / SRV lookup problems (Atlas) vs ECONNREFUSED (port closed)");
  console.log("- timeouts vs immediate refusal (firewall / service down / wrong host)");
  console.log("======================================");

  process.exit(okCount > 0 ? 0 : 1);
}

main().catch((e) => {
  console.error("Fatal error running test:", e);
  process.exit(99);
});