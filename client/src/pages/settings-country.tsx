/**
 * Settings → Country
 * Optional ISO 3166-1 alpha-2 picker. Stores code only; clears to NULL.
 *
 * Return path: explicit `?returnTo=` (allowlisted). Prompt opens with
 * `returnTo=/leaderboard`. Wouter `useLocation()` is pathname-only; always
 * read search via `useSearch()` / window, never pathname alone.
 */

import { useEffect, useMemo, useState } from "react";
import { useLocation, useSearch } from "wouter";
import { Check, ChevronLeft, Search, X } from "lucide-react";
import { SwipeBackPage } from "@/components/swipe-back-page";
import {
  APP_MATERIAL_BACK_BUTTON_CLASS,
  APP_MATERIAL_BACK_ICON_CLASS,
} from "@/lib/app-material";
import { cn } from "@/lib/utils";
import { useUser } from "@/lib/user-context";
import { apiRequest } from "@/lib/queryClient";
import { invalidateLeaderboardCountryQueries } from "@/lib/leaderboard-country-invalidate";
import { useToast } from "@/hooks/use-toast";
import {
  filterCountryOptions,
  getCountryDisplayName,
  type CountryOption,
} from "@shared/country-codes";
import {
  CountryFlag,
  COUNTRY_FLAG_PICKER_CLASS,
} from "@/components/country-flag";
import {
  resolveCountryPickerReturnTo,
  type CountryPickerReturnTo,
} from "@shared/country-prompt";
import {
  SETTINGS_BACK_BUTTON_CLASS,
  SETTINGS_BACK_ICON_CLASS,
  SETTINGS_HEADER_TO_SECTIONS_CLASS,
  SETTINGS_PAGE_PAD_CLASS,
  SETTINGS_PAGE_SCROLL_CLASS,
  SETTINGS_ROW_PRESS_CLASS,
  SETTINGS_ROW_TITLE_CLASS,
  SETTINGS_ROWS_STACK_CLASS,
  SETTINGS_SECTIONS_STACK_CLASS,
  SETTINGS_SUBTITLE_CLASS,
  SETTINGS_TITLE_AFTER_BACK_CLASS,
} from "@/lib/settings-presentation";

export default function SettingsCountryPage() {
  const [, navigate] = useLocation();
  const search = useSearch();
  const { countryCode, updateCountryCode, updateCountryPromptPending } = useUser();
  const { toast } = useToast();
  const [query, setQuery] = useState("");
  const [saving, setSaving] = useState(false);
  const [localCode, setLocalCode] = useState<string | null>(countryCode);
  /** Capture once so save/re-renders cannot lose the Leaderboard origin. */
  const [returnTo] = useState<CountryPickerReturnTo>(() =>
    resolveCountryPickerReturnTo(
      typeof window !== "undefined" ? window.location.search : search,
    ),
  );

  useEffect(() => {
    setLocalCode(countryCode);
  }, [countryCode]);

  const filtered = useMemo(() => filterCountryOptions(query), [query]);
  const selectedName = getCountryDisplayName(localCode);

  const goBack = () => {
    navigate(returnTo, { replace: true });
  };

  const persist = async (next: string | null) => {
    if (saving) return;
    setSaving(true);
    try {
      const res = await apiRequest("PATCH", "/api/user/country", {
        country_code: next,
      });
      const body = (await res.json()) as {
        country_code?: string | null;
        country_prompt_pending?: boolean;
      };
      const saved = body.country_code ?? null;
      setLocalCode(saved);
      updateCountryCode(saved);
      updateCountryPromptPending(false);
      invalidateLeaderboardCountryQueries();

      if (saved) {
        toast({
          title: "Country saved",
          description: "Your flag is now on the Leaderboard.",
        });
      } else {
        toast({
          title: "Country removed",
        });
      }
    } catch (err) {
      console.error("[settings/country] save failed:", err);
      toast({
        title: "Couldn’t save. Try again.",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const handleSelect = (option: CountryOption) => {
    if (option.code === localCode) return;
    void persist(option.code);
  };

  const handleClear = () => {
    if (localCode == null) return;
    void persist(null);
  };

  return (
    <SwipeBackPage onBack={goBack} className={SETTINGS_PAGE_SCROLL_CLASS}>
      <div className={SETTINGS_PAGE_PAD_CLASS}>
        <button
          type="button"
          className={cn(APP_MATERIAL_BACK_BUTTON_CLASS, SETTINGS_BACK_BUTTON_CLASS)}
          onClick={goBack}
          aria-label="Back"
          data-testid="button-settings-country-back"
        >
          <ChevronLeft
            className={cn(APP_MATERIAL_BACK_ICON_CLASS, SETTINGS_BACK_ICON_CLASS)}
            aria-hidden
          />
        </button>

        <div className={SETTINGS_TITLE_AFTER_BACK_CLASS}>
          <h1 className="text-xl font-bold">Choose your country</h1>
        </div>
        <p className={SETTINGS_SUBTITLE_CLASS}>
          Your flag appears on the Leaderboard.
        </p>

        <div className={`${SETTINGS_HEADER_TO_SECTIONS_CLASS} ${SETTINGS_SECTIONS_STACK_CLASS}`}>
          {localCode ? (
            <div
              className={SETTINGS_ROWS_STACK_CLASS}
              data-testid="settings-country-current"
            >
              <div className="flex min-h-11 items-center gap-3 py-3">
                <CountryFlag
                  countryCode={localCode}
                  countryName={selectedName}
                  className={COUNTRY_FLAG_PICKER_CLASS}
                  data-testid="settings-country-current-flag"
                />
                <p className={cn(SETTINGS_ROW_TITLE_CLASS, "min-w-0 flex-1 truncate")}>
                  {selectedName ?? localCode}
                </p>
                <button
                  type="button"
                  className={cn(
                    SETTINGS_ROW_PRESS_CLASS,
                    "inline-flex min-h-11 items-center gap-1 px-2 text-sm text-muted-foreground",
                  )}
                  onClick={handleClear}
                  disabled={saving}
                  data-testid="button-settings-country-clear"
                  aria-label="Remove country"
                >
                  <X className="h-4 w-4" aria-hidden />
                  Remove country
                </button>
              </div>
            </div>
          ) : null}

          <section aria-labelledby="settings-country-list">
            <div className="mb-3 flex items-center gap-2 rounded-lg border border-border px-3 dark:border-white/10">
              <Search className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search countries"
                className="h-11 w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
                data-testid="input-settings-country-search"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
              />
            </div>

            <div
              className={SETTINGS_ROWS_STACK_CLASS}
              data-testid="settings-country-list"
              role="listbox"
              aria-label="Countries"
              id="settings-country-list"
            >
              {filtered.map((option) => {
                const selected = option.code === localCode;
                return (
                  <button
                    key={option.code}
                    type="button"
                    role="option"
                    aria-selected={selected}
                    disabled={saving}
                    className={cn(
                      SETTINGS_ROW_PRESS_CLASS,
                      "flex w-full min-h-11 items-center gap-3 py-3 text-left",
                    )}
                    onClick={() => handleSelect(option)}
                    data-testid={`country-option-${option.code}`}
                  >
                    <CountryFlag
                      countryCode={option.code}
                      countryName={option.name}
                      className={COUNTRY_FLAG_PICKER_CLASS}
                    />
                    <span className="min-w-0 flex-1 truncate text-sm font-medium">
                      {option.name}
                    </span>
                    <span className="shrink-0 text-xs text-muted-foreground">{option.code}</span>
                    {selected ? (
                      <Check className="h-4 w-4 shrink-0 text-[#0a83ff]" aria-hidden />
                    ) : (
                      <span className="w-4 shrink-0" aria-hidden />
                    )}
                  </button>
                );
              })}
              {filtered.length === 0 ? (
                <p className="py-6 text-center text-sm text-muted-foreground">
                  No countries match “{query.trim()}”
                </p>
              ) : null}
            </div>
          </section>
        </div>
      </div>
    </SwipeBackPage>
  );
}
