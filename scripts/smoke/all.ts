import { smokeEasyPost } from "./easypost.js";
import { smokePayPal } from "./paypal.js";
import { smokeSupabase } from "./supabase.js";
import { smokeZai } from "./zai.js";

const results = [];

for (const check of [smokePayPal, smokeEasyPost, smokeZai, smokeSupabase]) {
  results.push(await check());
}

console.log(JSON.stringify({ generated_at: new Date().toISOString(), results }, null, 2));

if (results.some((result) => result.status === "FAIL")) {
  process.exitCode = 1;
}
