/**
 * Pre-auth SignUp Step 2 Country + Gender controls.
 * Floating country popover (not in-document expansion) + Gender Select.
 * No authenticated-user dependency. Persistence unchanged.
 */

import { useMemo, useState } from "react";
import { Check, ChevronsUpDown, Search } from "lucide-react";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  CountryFlag,
  COUNTRY_FLAG_PICKER_CLASS,
} from "@/components/country-flag";
import {
  filterCountryOptions,
  getCountryDisplayName,
} from "@shared/country-codes";
import {
  DEMOGRAPHICS_GENDER_LABELS,
  DEMOGRAPHICS_GENDER_VALUES,
  type DemographicsGender,
} from "@shared/demographics-gender";
import { cn } from "@/lib/utils";
import {
  PRELOGIN_FIELD_CLASS,
  PRELOGIN_SELECT_CONTENT_CLASS,
  PRELOGIN_SELECT_ITEM_CLASS,
  PRELOGIN_SELECT_VIEWPORT_CLASS,
} from "@/lib/prelogin-material";

export type SignupAboutYouFieldsProps = {
  countryCode: string | null;
  gender: DemographicsGender | "";
  onCountryChange: (code: string) => void;
  onGenderChange: (gender: DemographicsGender) => void;
  disabled?: boolean;
};

/** Signup Country row — material wash, no Command accent/teal. */
const SIGNUP_COUNTRY_OPTION_CLASS = cn(
  PRELOGIN_SELECT_ITEM_CLASS,
  "flex w-full min-h-10 cursor-pointer items-center gap-2 px-2.5 py-2 text-left text-sm outline-none",
);

export function SignupAboutYouFields({
  countryCode,
  gender,
  onCountryChange,
  onGenderChange,
  disabled = false,
}: SignupAboutYouFieldsProps) {
  const [countryOpen, setCountryOpen] = useState(false);
  const [countryQuery, setCountryQuery] = useState("");

  const filtered = useMemo(
    () => filterCountryOptions(countryQuery),
    [countryQuery],
  );
  const selectedName = getCountryDisplayName(countryCode);

  return (
    <>
      <div className="space-y-2">
        <Label htmlFor="signup-country" className="text-foreground">
          Country
        </Label>
        <p className="text-xs text-muted-foreground">Where you&apos;re based</p>
        <Popover
          modal
          open={countryOpen}
          onOpenChange={(open) => {
            if (disabled) return;
            setCountryOpen(open);
            if (!open) setCountryQuery("");
          }}
        >
          <PopoverTrigger asChild>
            <button
              id="signup-country"
              type="button"
              role="combobox"
              aria-expanded={countryOpen}
              disabled={disabled}
              data-testid="signup-country-trigger"
              className={cn(
                PRELOGIN_FIELD_CLASS,
                "flex h-[2.8125rem] w-full items-center justify-between px-3 text-left text-sm",
                disabled ? "cursor-not-allowed opacity-50" : "",
              )}
            >
              <span className="flex min-w-0 items-center gap-2">
                {countryCode ? (
                  <>
                    <CountryFlag
                      countryCode={countryCode}
                      countryName={selectedName}
                      className={COUNTRY_FLAG_PICKER_CLASS}
                    />
                    <span className="truncate">{selectedName}</span>
                  </>
                ) : (
                  <span className="text-muted-foreground">Select country</span>
                )}
              </span>
              <ChevronsUpDown className="h-4 w-4 shrink-0 opacity-50" />
            </button>
          </PopoverTrigger>
          <PopoverContent
            align="start"
            side="bottom"
            sideOffset={6}
            collisionPadding={12}
            className={cn(
              PRELOGIN_SELECT_CONTENT_CLASS,
              // Portaled floating layer — match Account Type Select shell (not square / teal).
              "z-[80] w-[var(--radix-popover-trigger-width)] max-w-[min(100vw-2rem,var(--radix-popover-trigger-width))] p-0 shadow-none",
            )}
            data-testid="signup-country-popover"
            onOpenAutoFocus={(e) => {
              // Keep focus on search for typing; avoid jumping to first option.
              e.preventDefault();
              const root = e.currentTarget as HTMLElement;
              root.querySelector<HTMLInputElement>("[data-testid='signup-country-search']")?.focus();
            }}
          >
            <div className="flex items-center gap-2 border-b border-white/10 px-3">
              <Search
                className="h-4 w-4 shrink-0 opacity-50"
                aria-hidden
              />
              <input
                type="search"
                value={countryQuery}
                onChange={(e) => setCountryQuery(e.target.value)}
                placeholder="Search countries"
                className="h-11 w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
                data-testid="signup-country-search"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                autoComplete="off"
              />
            </div>
            <div
              className={cn(
                PRELOGIN_SELECT_VIEWPORT_CLASS,
                "max-h-56 overflow-y-auto overscroll-contain",
              )}
              role="listbox"
              aria-label="Countries"
            >
              {filtered.length === 0 ? (
                <p className="py-6 text-center text-sm text-muted-foreground">
                  No country found.
                </p>
              ) : (
                filtered.map((option) => {
                  const selected = countryCode === option.code;
                  return (
                    <button
                      key={option.code}
                      type="button"
                      role="option"
                      aria-selected={selected}
                      className={SIGNUP_COUNTRY_OPTION_CLASS}
                      onClick={() => {
                        onCountryChange(option.code);
                        setCountryQuery("");
                        setCountryOpen(false);
                      }}
                      data-testid={`signup-country-option-${option.code}`}
                    >
                      <CountryFlag
                        countryCode={option.code}
                        countryName={option.name}
                        className={COUNTRY_FLAG_PICKER_CLASS}
                      />
                      <span className="min-w-0 flex-1 truncate">{option.name}</span>
                      {selected ? (
                        <Check className="h-4 w-4 shrink-0 text-[#0a83ff]" aria-hidden />
                      ) : (
                        <span className="w-4 shrink-0" aria-hidden />
                      )}
                    </button>
                  );
                })
              )}
            </div>
          </PopoverContent>
        </Popover>
      </div>

      <div className="space-y-2">
        <Label htmlFor="signup-gender" className="text-foreground">
          Gender
        </Label>
        <Select
          value={gender || undefined}
          onValueChange={(v) => onGenderChange(v as DemographicsGender)}
          disabled={disabled}
        >
          <SelectTrigger
            id="signup-gender"
            className={PRELOGIN_FIELD_CLASS}
            data-testid="signup-gender-trigger"
          >
            <SelectValue placeholder="Select gender" />
          </SelectTrigger>
          <SelectContent className={PRELOGIN_SELECT_CONTENT_CLASS}>
            {DEMOGRAPHICS_GENDER_VALUES.map((value) => (
              <SelectItem
                key={value}
                value={value}
                className={PRELOGIN_SELECT_ITEM_CLASS}
                data-testid={`signup-gender-option-${value}`}
              >
                {DEMOGRAPHICS_GENDER_LABELS[value]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </>
  );
}
