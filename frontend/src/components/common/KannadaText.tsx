import React, { useState, useEffect } from "react";
import { useLanguage } from "../../context/LanguageContext";
import { translateDataSync, translateWithGoogle, isKannada } from "../../utils/googleTranslate";

interface KannadaTextProps {
  text: string | number | null | undefined;
  fallback?: string;
  className?: string;
  as?: "span" | "div" | "p" | "h1" | "h2" | "h3" | "h4" | "td" | "th";
}

/**
 * Reusable auto-translating text component.
 * When language is Kannada (kn), automatically translates products, categories,
 * statuses, and arbitrary text using Google Translate + local Kirana dictionary cache.
 */
export const KannadaText: React.FC<KannadaTextProps> = ({
  text,
  fallback = "",
  className,
  as: Component = "span",
}) => {
  const { language } = useLanguage();
  const rawString = text != null ? String(text) : fallback;

  const [translated, setTranslated] = useState<string>(() => {
    if (language === "kn" && rawString) {
      return translateDataSync(rawString);
    }
    return rawString;
  });

  useEffect(() => {
    if (language !== "kn" || !rawString || isKannada(rawString)) {
      setTranslated(rawString);
      return;
    }

    const immediate = translateDataSync(rawString);
    setTranslated(immediate);

    if (immediate === rawString) {
      let isMounted = true;
      translateWithGoogle(rawString).then((res) => {
        if (isMounted && res) {
          setTranslated(res);
        }
      });
      return () => {
        isMounted = false;
      };
    }
  }, [language, rawString]);

  return <Component className={className}>{translated}</Component>;
};

/**
 * Custom React Hook to translate any data string dynamically.
 */
export function useKannadaData(text: string | null | undefined): string {
  const { language } = useLanguage();
  const rawString = text != null ? String(text) : "";

  const [translated, setTranslated] = useState<string>(() => {
    if (language === "kn" && rawString) {
      return translateDataSync(rawString);
    }
    return rawString;
  });

  useEffect(() => {
    if (language !== "kn" || !rawString || isKannada(rawString)) {
      setTranslated(rawString);
      return;
    }

    const immediate = translateDataSync(rawString);
    setTranslated(immediate);

    if (immediate === rawString) {
      let isMounted = true;
      translateWithGoogle(rawString).then((res) => {
        if (isMounted && res) {
          setTranslated(res);
        }
      });
      return () => {
        isMounted = false;
      };
    }
  }, [language, rawString]);

  return language === "kn" ? translated : rawString;
}
