import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const pageSrc = readFileSync(join(here, "../pages/submit-metadata.tsx"), "utf8");
const buttonSrc = readFileSync(join(here, "../components/ui/button.tsx"), "utf8");

describe("submit-metadata presentation polish", () => {
  it("uses OptionalFieldLabel hierarchy without parenthetical Optional copy", () => {
    assert.match(pageSrc, /function OptionalFieldLabel/);
    assert.match(
      pageSrc,
      /text-xs font-normal text-muted-foreground">Optional</,
    );
    assert.match(pageSrc, /<OptionalFieldLabel>Description<\/OptionalFieldLabel>/);
    assert.match(pageSrc, /<OptionalFieldLabel>Date<\/OptionalFieldLabel>/);
    assert.match(pageSrc, /<OptionalFieldLabel>Location<\/OptionalFieldLabel>/);
    assert.match(pageSrc, /<OptionalFieldLabel>Played by<\/OptionalFieldLabel>/);
    assert.match(pageSrc, /<OptionalFieldLabel>Sub-genre<\/OptionalFieldLabel>/);
    assert.doesNotMatch(pageSrc, /\(Optional\)/);
  });

  it("tightens the metadata field stack to space-y-3 and keeps FormItem space-y-1.5", () => {
    assert.match(pageSrc, /onSubmit=\{form\.handleSubmit\(onSubmit\)\}[\s\S]*?className="min-w-0 space-y-3"/);
    assert.match(pageSrc, /<FormItem className="space-y-1\.5">/);
    assert.doesNotMatch(
      pageSrc,
      /onSubmit=\{form\.handleSubmit\(onSubmit\)\}[\s\S]*?className="min-w-0 space-y-4"/,
    );
  });

  it("uses the shorter Description placeholder and rows={3}", () => {
    assert.match(
      pageSrc,
      /placeholder="Anything else that could help identify the track\?"/,
    );
    assert.doesNotMatch(pageSrc, /What makes this track special\?/);
    assert.match(pageSrc, /rows=\{3\}[\s\S]*?data-testid="textarea-description"/);
    assert.doesNotMatch(pageSrc, /rows=\{4\}/);
  });

  it("keeps Genre success check out of flex layout flow", () => {
    assert.doesNotMatch(pageSrc, /flex items-center gap-2\.5/);
    assert.doesNotMatch(pageSrc, /variant="inline"/);
    assert.doesNotMatch(pageSrc, /h-10 w-10 shrink-0 items-center justify-center/);
    assert.match(
      pageSrc,
      /data-testid="select-genre"[\s\S]*?FieldCompleteCheck className="right-9 top-1\/2 -translate-y-1\/2"/,
    );
    assert.match(
      pageSrc,
      /function FieldCompleteCheck[\s\S]*?pointer-events-none absolute/,
    );
  });

  it("exposes aria-required on Title and Genre without native required", () => {
    const titleInput = pageSrc.match(
      /<Input[\s\S]*?data-testid="input-title"[\s\S]*?\/>/,
    )?.[0] ?? "";
    assert.ok(titleInput.length > 0, "title Input block found");
    assert.match(titleInput, /aria-required=\{true\}/);
    assert.doesNotMatch(titleInput, /\srequired(=|\s|\/|>)/);

    const genreTrigger = pageSrc.match(
      /<SelectTrigger[\s\S]*?data-testid="select-genre"[\s\S]*?>/,
    )?.[0] ?? "";
    assert.ok(genreTrigger.length > 0, "genre SelectTrigger found");
    assert.match(genreTrigger, /aria-required=\{true\}/);
    assert.doesNotMatch(genreTrigger, /\srequired(=|\s|\/|>)/);

    assert.match(pageSrc, /Title \*/);
    assert.match(pageSrc, /Genre \*/);
  });

  it("overrides shared Button disabled opacity on Submit when custom disabled styles apply", () => {
    assert.match(buttonSrc, /disabled:opacity-50/);
    assert.match(pageSrc, /data-testid="button-submit"/);
    assert.match(
      pageSrc,
      /transition-colors duration-500 disabled:opacity-100/,
    );
    assert.match(
      pageSrc,
      /bg-primary\/20 text-primary-foreground\/45/,
    );
  });

  it("does not alter Date control contract in this polish slice", () => {
    assert.match(pageSrc, /type="date"/);
    assert.match(pageSrc, /dubhub-date-input/);
    assert.match(pageSrc, /data-testid="input-date"/);
    assert.match(pageSrc, /max=\{getTodayInputValue\(\)\}/);
  });

  it("groups Title/Description counters with their fields and keeps Submit CTA spacing", () => {
    // Counters use mt-1 under the control — not a third FormItem space-y sibling.
    assert.match(
      pageSrc,
      /data-testid="input-title"[\s\S]*?<p className="mt-1 text-xs leading-none text-gray-500 text-right">/,
    );
    assert.match(
      pageSrc,
      /data-testid="textarea-description"[\s\S]*?<p className="mt-1 text-xs leading-none text-gray-500 text-right">/,
    );
    assert.doesNotMatch(
      pageSrc,
      /data-testid="input-title"[\s\S]*?<\/div>\s*<p className="text-xs leading-none text-gray-500 text-right">/,
    );
    // Local CTA spacer beyond field stack space-y-3 (glow stays on inner wrapper).
    assert.match(pageSrc, /pt-3[\s\S]*?data-testid="button-submit"/);
    assert.match(
      pageSrc,
      /pt-3">\s*<div\s+className=\{cn\(\s*"relative w-full rounded-xl/,
    );
  });
});

describe("submit-metadata optional sub-genre", () => {
  it("positions Sub-genre after Genre and before Description", () => {
    const genreIdx = pageSrc.indexOf('data-testid="select-genre"');
    const subIdx = pageSrc.indexOf('data-testid="select-subgenre"');
    const descIdx = pageSrc.indexOf('data-testid="textarea-description"');
    assert.ok(genreIdx > 0 && subIdx > genreIdx && descIdx > subIdx);
  });

  it("is optional, not required, and omitted from requiredFieldsReady", () => {
    assert.match(pageSrc, /<OptionalFieldLabel>Sub-genre<\/OptionalFieldLabel>/);
    const subTrigger = pageSrc.match(
      /<SelectTrigger[\s\S]*?data-testid="select-subgenre"[\s\S]*?>/,
    )?.[0] ?? "";
    assert.ok(subTrigger.length > 0, "subgenre SelectTrigger found");
    assert.match(subTrigger, /aria-required=\{false\}/);
    assert.doesNotMatch(subTrigger, /\srequired(=|\s|\/|>)/);
    assert.doesNotMatch(pageSrc, /Sub-genre \*/);
    assert.match(
      pageSrc,
      /const requiredFieldsReady =\s*isTitleComplete\(watched\.title\) && isGenreComplete\(watched\.genre\);/,
    );
    const readyBlock = pageSrc.match(/const requiredFieldsReady =[\s\S]*?;/)?.[0] ?? "";
    assert.doesNotMatch(readyBlock, /subgenre/i);
  });

  it("uses shared taxonomy IDs as stored values and hides until Genre is selected", () => {
    assert.match(pageSrc, /from "@shared\/post-subgenre"/);
    assert.match(pageSrc, /getSubgenresForParent\(watched\.genre\)/);
    assert.match(
      pageSrc,
      /showSubgenreField = isGenreComplete\(watched\.genre\) && subgenreOptions\.length > 0/,
    );
    assert.match(pageSrc, /\{showSubgenreField \? \(/);
    assert.match(
      pageSrc,
      /subgenreOptions\.map\(\(entry\) => \(\s*<SelectItem key=\{entry\.id\} value=\{entry\.id\}>/,
    );
    assert.match(pageSrc, /\{entry\.label\}/);
    assert.doesNotMatch(pageSrc, /id: "jump_up"/);
    assert.doesNotMatch(pageSrc, /label: "Jump Up"/);
  });

  it("clears subgenre when parent Genre changes", () => {
    assert.match(
      pageSrc,
      /onValueChange=\{\(v\) => \{\s*field\.onChange\(v\);\s*form\.setValue\("subgenre", ""\);/,
    );
  });

  it("serialises payload subgenre via helper and leaves genre.trim() unchanged", () => {
    assert.match(pageSrc, /genre: data\.formData\.genre\.trim\(\),/);
    assert.match(
      pageSrc,
      /subgenre: serializeSubmitSubgenre\(data\.formData\.subgenre\),/,
    );
  });
});
