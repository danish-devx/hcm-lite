import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";

const env = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
const get = (k) => env.match(new RegExp(`^${k}=(.*)$`, "m"))?.[1]?.trim();

const sb = createClient(
  get("NEXT_PUBLIC_SUPABASE_URL"),
  get("SUPABASE_SERVICE_ROLE_KEY")
);

const res = await fetch(get("NEXT_PUBLIC_SUPABASE_URL") + "/rest/v1/", {
    headers: {
      apikey: get("SUPABASE_SERVICE_ROLE_KEY"),
      Authorization: "Bearer " + get("SUPABASE_SERVICE_ROLE_KEY"),
      Accept: "application/vnd.openapi+json",
    },
  }
);
const schema = await res.json();
const ai = Object.keys(schema.components.schemas).filter((k) =>
  k.toLowerCase().includes("ai")
);
for (const t of ai)
  console.log(t, "->", Object.keys(schema.components.schemas[t].properties).join(", "));

const { count, error } = await sb
  .from("hcm_ai_logs")
  .select("*", { count: "exact", head: true });
console.log("ai_logs count:", count, "error:", error?.message ?? "NONE");
