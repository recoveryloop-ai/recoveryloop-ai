import { randomBytes } from "node:crypto";
import { access, readFile, writeFile } from "node:fs/promises";

const target = new URL("../.env.local", import.meta.url);
const template = new URL("../.env.example", import.meta.url);

try {
  await access(target);
  console.log(".env.local already exists; left unchanged.");
} catch {
  const source = await readFile(template, "utf8");
  const secret = randomBytes(32).toString("hex");
  const local = source
    .replaceAll(/=[A-Z][A-Z0-9_<>:/.-]*$/gm, "=")
    .replace("DEMO_SESSION_SIGNING_SECRET=", `DEMO_SESSION_SIGNING_SECRET=${secret}`);

  await writeFile(target, local, { encoding: "utf8", mode: 0o600, flag: "wx" });
  console.log("Created private .env.local with a generated demo-session secret.");
  console.log("Add provider credentials locally; never paste them into chat or commit them.");
}
