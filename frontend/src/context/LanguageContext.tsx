import React, { createContext, useContext, useState, useEffect, useCallback } from "react";
import { translations, Language } from "../i18n/translations";
import {
  translateDataSync,
  translateWithGoogle,
  translateBatchWithGoogle,
  formatKannadaCurrency,
  formatKannadaDate,
  toKannadaNumerals,
} from "../utils/googleTranslate";

interface LanguageContextType {
  language: Language;
  setLanguage: (lang: Language) => void;
  t: (key: string) => string;
  tData: (rawText: string) => string;
  tDataAsync: (rawText: string) => Promise<string>;
  formatMoney: (amount: number, decimals?: number) => string;
  formatDateLocalized: (dateStr: string | Date) => string;
  kannadaNumerals: boolean;
  setKannadaNumerals: (enabled: boolean) => void;
  translateBatch: (texts: string[]) => Promise<Record<string, string>>;
}

const LanguageContext = createContext<LanguageContextType>({
  language: "en",
  setLanguage: () => {},
  t: (key: string) => key,
  tData: (rawText: string) => rawText,
  tDataAsync: async (rawText: string) => rawText,
  formatMoney: (amount: number) => `₹${amount.toFixed(2)}`,
  formatDateLocalized: (dateStr: string | Date) => String(dateStr),
  kannadaNumerals: false,
  setKannadaNumerals: () => {},
  translateBatch: async () => ({}),
});

export const LanguageProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [language, setLanguageState] = useState<Language>(() => {
    return (localStorage.getItem("smartstock_lang") as Language) || "en";
  });

  const [kannadaNumerals, setKannadaNumeralsState] = useState<boolean>(() => {
    return localStorage.getItem("smartstock_kn_numerals") === "true";
  });

  const setLanguage = (lang: Language) => {
    setLanguageState(lang);
    localStorage.setItem("smartstock_lang", lang);
  };

  const setKannadaNumerals = (enabled: boolean) => {
    setKannadaNumeralsState(enabled);
    localStorage.setItem("smartstock_kn_numerals", String(enabled));
  };

  // Static UI translation
  const t = useCallback(
    (key: string): string => {
      return translations[language]?.[key] || translations["en"]?.[key] || key;
    },
    [language]
  );

  // Synchronous dynamic data translation (Kirana dictionary + Google cache)
  const tData = useCallback(
    (rawText: string): string => {
      if (language !== "kn" || !rawText) return rawText;
      return translateDataSync(rawText);
    },
    [language]
  );

  // Asynchronous dynamic data translation with live Google Translate fallback
  const tDataAsync = useCallback(
    async (rawText: string): Promise<string> => {
      if (language !== "kn" || !rawText) return rawText;
      return translateWithGoogle(rawText);
    },
    [language]
  );

  // Formatted Currency
  const formatMoney = useCallback(
    (amount: number, decimals: number = 2): string => {
      const num = Number(amount) || 0;
      if (language === "kn") {
        return formatKannadaCurrency(num, {
          useKannadaNumerals: kannadaNumerals,
          useKannadaSymbol: true,
          decimals,
        });
      }
      return `₹${num.toLocaleString("en-IN", {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals,
      })}`;
    },
    [language, kannadaNumerals]
  );

  // Formatted Date
  const formatDateLocalized = useCallback(
    (dateStr: string | Date): string => {
      if (!dateStr) return "";
      if (language === "kn") {
        return formatKannadaDate(dateStr, { useKannadaNumerals: kannadaNumerals });
      }
      const d = new Date(dateStr);
      if (isNaN(d.getTime())) return String(dateStr);
      return d.toLocaleDateString("en-IN", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      });
    },
    [language, kannadaNumerals]
  );

  // Batch translate helper
  const translateBatch = useCallback(
    async (texts: string[]): Promise<Record<string, string>> => {
      if (language !== "kn") {
        const identity: Record<string, string> = {};
        texts.forEach((txt) => (identity[txt] = txt));
        return identity;
      }
      return translateBatchWithGoogle(texts);
    },
    [language]
  );

  return (
    <LanguageContext.Provider
      value={{
        language,
        setLanguage,
        t,
        tData,
        tDataAsync,
        formatMoney,
        formatDateLocalized,
        kannadaNumerals,
        setKannadaNumerals,
        translateBatch,
      }}
    >
      {children}
    </LanguageContext.Provider>
  );
};

export const useLanguage = () => useContext(LanguageContext);
