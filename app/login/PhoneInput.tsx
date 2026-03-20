"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { getCountryCallingCode, getCountries } from "libphonenumber-js";

export function normalizePhoneE164(rawPhone: string): string {
  const trimmed = rawPhone.trim();
  if (!trimmed) return "";
  if (trimmed.startsWith("+")) {
    const digits = trimmed.slice(1).replace(/\D/g, "");
    return digits ? `+${digits}` : "";
  }
  return trimmed.replace(/\D/g, "");
}

export function isValidPhoneE164(rawPhone: string): boolean {
  const normalized = normalizePhoneE164(rawPhone);
  const digits = normalized.startsWith("+") ? normalized.slice(1) : normalized;
  return /^\d{8,15}$/.test(digits);
}

export type PhoneParts = {
  phoneCountryCode: string; // e.g. "+66"
  phoneCountryIso2: string; // e.g. "TH"
  phoneLocalNumber: string; // digits only (no dial code)
};

const DEFAULT_DIAL_CODE = "+66";

type CountryCallingInfo = { iso2: string; dialCode: string; dialDigits: string };

const ALL_COUNTRY_CALLING_CODES: CountryCallingInfo[] = (() => {
  const iso2s = getCountries();
  const list: CountryCallingInfo[] = [];
  for (const iso2 of iso2s) {
    try {
      const dialCodeNumber = getCountryCallingCode(iso2);
      if (!dialCodeNumber) continue;
      const dialDigits = String(dialCodeNumber);
      list.push({ iso2, dialCode: `+${dialDigits}`, dialDigits });
    } catch {
      // ignore invalid iso2
    }
  }
  return list;
})();

const DIAL_CODE_CANDIDATES_DESC = [...ALL_COUNTRY_CALLING_CODES].sort((a, b) => b.dialDigits.length - a.dialDigits.length);

const ISO2_BY_DIAL_CODE = new Map<string, string>();
for (const c of ALL_COUNTRY_CALLING_CODES) {
  if (!ISO2_BY_DIAL_CODE.has(c.dialCode)) {
    ISO2_BY_DIAL_CODE.set(c.dialCode, c.iso2);
  }
}

export function parsePhoneE164ToParts(rawPhone: string): PhoneParts {
  const normalized = normalizePhoneE164(rawPhone);
  const digits = normalized.startsWith("+") ? normalized.slice(1) : normalized;

  if (!digits) {
    return {
      phoneCountryCode: DEFAULT_DIAL_CODE,
      phoneCountryIso2: ISO2_BY_DIAL_CODE.get(DEFAULT_DIAL_CODE) ?? "TH",
      phoneLocalNumber: "",
    };
  }

  for (const c of DIAL_CODE_CANDIDATES_DESC) {
    if (c.dialDigits && digits.startsWith(c.dialDigits)) {
      return {
        phoneCountryCode: c.dialCode,
        phoneCountryIso2: c.iso2,
        phoneLocalNumber: digits.slice(c.dialDigits.length),
      };
    }
  }

  // Fallback: keep default country code and treat the rest as local number.
  return {
    phoneCountryCode: DEFAULT_DIAL_CODE,
    phoneCountryIso2: ISO2_BY_DIAL_CODE.get(DEFAULT_DIAL_CODE) ?? "TH",
    phoneLocalNumber: digits,
  };
}

export default function PhoneInput(props: {
  phoneCountryCode: string;
  phoneCountryIso2: string;
  phoneLocalNumber: string;
  onChange: (next: PhoneParts) => void;
  disabled?: boolean;
}) {
  const { disabled } = props;
  const countryDropdownRef = useRef<HTMLDivElement | null>(null);

  const regionNames = useMemo(() => {
    try {
      if (typeof Intl === "undefined" || !(Intl as any).DisplayNames) return null;
      return new Intl.DisplayNames(["en"], { type: "region" });
    } catch {
      return null;
    }
  }, []);

  const phoneCountryOptions = useMemo(() => {
    return ALL_COUNTRY_CALLING_CODES.map((c) => ({
      iso2: c.iso2,
      dialDigits: c.dialDigits,
      dialCode: c.dialCode,
      name: regionNames?.of(c.iso2) ?? c.iso2,
      flag: iso2ToFlagEmoji(c.iso2),
    }));
  }, [regionNames]);

  const selectedCountryOption = useMemo(() => {
    return (
      phoneCountryOptions.find((o) => o.iso2 === props.phoneCountryIso2) ??
      phoneCountryOptions.find((o) => o.dialCode === props.phoneCountryCode) ??
      phoneCountryOptions[0]
    );
  }, [props.phoneCountryIso2, props.phoneCountryCode, phoneCountryOptions]);

  const [countryDropdownOpen, setCountryDropdownOpen] = useState(false);
  const [countrySearch, setCountrySearch] = useState("");

  useEffect(() => {
    if (!countryDropdownOpen) return;
    function onMouseDown(e: MouseEvent) {
      const el = countryDropdownRef.current;
      if (!el) return;
      if (e.target instanceof Node && !el.contains(e.target)) {
        setCountryDropdownOpen(false);
        setCountrySearch("");
      }
    }
    document.addEventListener("mousedown", onMouseDown);
    return () => document.removeEventListener("mousedown", onMouseDown);
  }, [countryDropdownOpen]);

  const filteredCountryOptions = useMemo(() => {
    const q = countrySearch.trim().toLowerCase();
    if (!q) return phoneCountryOptions;
    return phoneCountryOptions.filter((o) => {
      const dial = o.dialCode.replace(/\D/g, "");
      return o.name.toLowerCase().includes(q) || dial.includes(q) || o.iso2.toLowerCase().includes(q) || o.dialCode.includes(q);
    });
  }, [countrySearch, phoneCountryOptions]);

  function onToggleDropdown() {
    if (disabled) return;
    setCountryDropdownOpen((prev) => !prev);
    setCountrySearch("");
  }

  function onSelectCountry(opt: { iso2: string; dialCode: string }) {
    props.onChange({
      phoneCountryIso2: opt.iso2,
      phoneCountryCode: opt.dialCode,
      phoneLocalNumber: props.phoneLocalNumber,
    });
    setCountryDropdownOpen(false);
    setCountrySearch("");
  }

  function onLocalChange(nextLocal: string) {
    const cleaned = nextLocal.replace(/[^\d]/g, "").slice(0, 15);
    props.onChange({
      phoneCountryIso2: props.phoneCountryIso2,
      phoneCountryCode: props.phoneCountryCode,
      phoneLocalNumber: cleaned,
    });
  }

  return (
    <div className="grid grid-cols-[8rem_1fr] gap-3">
      <div ref={countryDropdownRef} className="relative">
        <button
          type="button"
          aria-haspopup="listbox"
          aria-expanded={countryDropdownOpen}
          onClick={onToggleDropdown}
          disabled={disabled}
          className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-slate-100 outline-none focus:ring-2 focus:ring-amber-400/30 flex items-center justify-between gap-2 disabled:opacity-60 disabled:cursor-not-allowed"
        >
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-lg leading-none">{selectedCountryOption?.flag ?? "🏳️"}</span>
            <span className="font-medium whitespace-nowrap">{props.phoneCountryCode}</span>
          </div>
          <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4 text-slate-300 shrink-0" aria-hidden="true">
            <path
              fillRule="evenodd"
              d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.94a.75.75 0 111.08 1.04l-4.25 4.52a.75.75 0 01-1.08 0L5.21 8.27a.75.75 0 01.02-1.06z"
              clipRule="evenodd"
            />
          </svg>
        </button>

        {countryDropdownOpen ? (
          <div className="absolute left-0 mt-2 z-20 w-[20rem] max-w-[calc(100vw-2rem)] rounded-xl border border-white/10 bg-[#0a0e17]/95 backdrop-blur-xl shadow-2xl p-3">
            <input
              type="text"
              value={countrySearch}
              onChange={(e) => setCountrySearch(e.target.value)}
              placeholder="Search country or code"
              className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-slate-100 outline-none focus:ring-2 focus:ring-amber-400/30 text-sm"
              autoFocus
            />

            <div className="mt-2 max-h-56 overflow-auto">
              {filteredCountryOptions.length ? (
                <ul role="listbox" className="space-y-1">
                  {filteredCountryOptions.map((opt) => {
                    const isSelected = opt.iso2 === props.phoneCountryIso2;
                    return (
                      <li key={opt.iso2}>
                        <button
                          type="button"
                          role="option"
                          aria-selected={isSelected}
                          onClick={() => onSelectCountry(opt)}
                          className={`w-full text-left rounded-lg px-3 py-2 text-sm transition ${
                            isSelected ? "bg-amber-500/15 border border-amber-500/25" : "hover:bg-white/10"
                          }`}
                        >
                          <div className="flex items-center justify-between gap-3">
                            <div className="flex items-center gap-2 min-w-0">
                              <span className="text-base">{opt.flag}</span>
                              <span className="truncate">{opt.name}</span>
                            </div>
                            <span className="font-medium text-slate-200 whitespace-nowrap">{opt.dialCode}</span>
                          </div>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <div className="text-xs text-slate-400 px-2 py-2">No results</div>
              )}
            </div>
          </div>
        ) : null}
      </div>

      <input
        id="otp-phone-local"
        name="phone"
        type="tel"
        inputMode="tel"
        autoComplete="tel"
        value={props.phoneLocalNumber}
        onChange={(e) => onLocalChange(e.target.value)}
        placeholder="0812345678"
        disabled={disabled}
        className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-slate-100 outline-none focus:ring-2 focus:ring-amber-400/30 disabled:opacity-60 disabled:cursor-not-allowed"
      />
    </div>
  );
}

function iso2ToFlagEmoji(iso2: string): string {
  const upper = iso2.trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(upper)) return "";
  const A_CODE = "A".charCodeAt(0);
  const first = upper.charCodeAt(0) - A_CODE + 0x1f1e6;
  const second = upper.charCodeAt(1) - A_CODE + 0x1f1e6;
  return String.fromCodePoint(first, second);
}

