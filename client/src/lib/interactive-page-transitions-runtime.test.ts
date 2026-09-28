import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");

test("flag-on Profile render and settings stack do not hit React #310", () => {
  const result = spawnSync(
    process.execPath,
    ["client/src/lib/interactive-page-transitions-runtime.runner.mjs"],
    {
      cwd: root,
      encoding: "utf8",
      timeout: 120_000,
    },
  );
  assert.equal(
    result.status,
    0,
    `${result.stdout ?? ""}\n${result.stderr ?? ""}`,
  );
  assert.match(result.stdout ?? "", /NO THROW/);
});
