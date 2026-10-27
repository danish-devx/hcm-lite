import { cpSync, existsSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const standaloneDir = join(root, ".next", "standalone");

if (!existsSync(standaloneDir)) {
  console.log("postbuild: standalone output nahi mila — skip.");
  process.exit(0);
}

cpSync(join(root, ".next", "static"), join(standaloneDir, ".next", "static"), {
  recursive: true,
});
cpSync(join(root, "public"), join(standaloneDir, "public"), {
  recursive: true,
});

console.log("postbuild: static + public → .next/standalone ✓");