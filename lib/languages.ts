import ttsCoverage from "@/data/tts-coverage.json";

export type TtsProvider = "gemini" | "none";

export type Language = {
  code: string; // ISO 639-3
  name: string;
  nativeName: string;
  flag: string;
  script: string;
  /** Characters not on a standard keyboard. Empty when typed with an input method. */
  palette: string[];
  /** Typed with an input method editor (hide the palette). */
  ime: boolean;
  /** BCP-47 code passed to Gemini TTS so short words are read in the right language. */
  ttsCode: string;
  /** How romanization is written, when the script is not Latin. */
  romanization: string | null;
  /** Starter words for the "Try one" chips, in this language. */
  tryWords: { word: string; emoji: string }[];
};

export const LANGUAGES: Language[] = [
  {
    code: "eng", name: "English", nativeName: "English", flag: "🇬🇧", script: "Latn",
    palette: [], ime: false, ttsCode: "en-US", romanization: null,
    tryWords: [
      { word: "water", emoji: "💧" }, { word: "dog", emoji: "🐕" }, { word: "eat", emoji: "😋" },
      { word: "wave", emoji: "👋" }, { word: "apple", emoji: "🍎" }, { word: "bat", emoji: "🦇" },
    ],
  },
  {
    code: "spa", name: "Spanish", nativeName: "Español", flag: "🇪🇸", script: "Latn",
    palette: ["á", "é", "í", "ó", "ú", "ü", "ñ", "¿", "¡"], ime: false, ttsCode: "es-US", romanization: null,
    tryWords: [
      { word: "agua", emoji: "💧" }, { word: "perro", emoji: "🐕" }, { word: "comer", emoji: "😋" },
      { word: "manzana", emoji: "🍎" }, { word: "casa", emoji: "🏠" },
    ],
  },
  {
    code: "fra", name: "French", nativeName: "Français", flag: "🇫🇷", script: "Latn",
    palette: ["é", "è", "ê", "à", "ç", "ô", "û", "ï"], ime: false, ttsCode: "fr-FR", romanization: null,
    tryWords: [
      { word: "eau", emoji: "💧" }, { word: "chien", emoji: "🐕" }, { word: "manger", emoji: "😋" },
      { word: "pomme", emoji: "🍎" }, { word: "maison", emoji: "🏠" },
    ],
  },
  {
    code: "deu", name: "German", nativeName: "Deutsch", flag: "🇩🇪", script: "Latn",
    palette: ["ä", "ö", "ü", "ß"], ime: false, ttsCode: "de-DE", romanization: null,
    tryWords: [
      { word: "Wasser", emoji: "💧" }, { word: "Hund", emoji: "🐕" }, { word: "essen", emoji: "😋" },
      { word: "Apfel", emoji: "🍎" }, { word: "Haus", emoji: "🏠" },
    ],
  },
  {
    code: "ita", name: "Italian", nativeName: "Italiano", flag: "🇮🇹", script: "Latn",
    palette: ["à", "è", "é", "ì", "ò", "ù"], ime: false, ttsCode: "it-IT", romanization: null,
    tryWords: [
      { word: "acqua", emoji: "💧" }, { word: "cane", emoji: "🐕" }, { word: "mangiare", emoji: "😋" },
      { word: "mela", emoji: "🍎" }, { word: "casa", emoji: "🏠" },
    ],
  },
  {
    code: "por", name: "Portuguese", nativeName: "Português", flag: "🇧🇷", script: "Latn",
    palette: ["á", "â", "ã", "à", "ç", "é", "ê", "í", "ó", "ô", "õ", "ú"], ime: false, ttsCode: "pt-BR", romanization: null,
    tryWords: [
      { word: "água", emoji: "💧" }, { word: "cachorro", emoji: "🐕" }, { word: "comer", emoji: "😋" },
      { word: "maçã", emoji: "🍎" }, { word: "casa", emoji: "🏠" },
    ],
  },
  {
    code: "jpn", name: "Japanese", nativeName: "日本語", flag: "🇯🇵", script: "Jpan",
    palette: [], ime: true, ttsCode: "ja-JP", romanization: "Hepburn",
    tryWords: [
      { word: "水", emoji: "💧" }, { word: "犬", emoji: "🐕" }, { word: "食べる", emoji: "😋" },
      { word: "りんご", emoji: "🍎" }, { word: "家", emoji: "🏠" },
    ],
  },
  {
    code: "kor", name: "Korean", nativeName: "한국어", flag: "🇰🇷", script: "Kore",
    palette: [], ime: true, ttsCode: "ko-KR", romanization: "Revised Romanization",
    tryWords: [
      { word: "물", emoji: "💧" }, { word: "개", emoji: "🐕" }, { word: "먹다", emoji: "😋" },
      { word: "사과", emoji: "🍎" }, { word: "집", emoji: "🏠" },
    ],
  },
  {
    code: "cmn", name: "Mandarin", nativeName: "中文", flag: "🇨🇳", script: "Hans",
    palette: [], ime: true, ttsCode: "cmn-CN", romanization: "Pinyin with tone marks",
    tryWords: [
      { word: "水", emoji: "💧" }, { word: "狗", emoji: "🐕" }, { word: "吃", emoji: "😋" },
      { word: "苹果", emoji: "🍎" }, { word: "家", emoji: "🏠" },
    ],
  },
];

/** The two languages the demo script uses (section 13). */
export const DEMO_LANGS = ["spa", "jpn"] as const;

export const LANGUAGE_CODES = LANGUAGES.map((l) => l.code);

const byCode = new Map(LANGUAGES.map((l) => [l.code, l]));

export function getLanguage(code: string): Language | undefined {
  return byCode.get(code);
}

export function languageName(code: string): string {
  return byCode.get(code)?.name ?? code;
}

/**
 * Which TTS provider covers a language. Only languages explicitly listed as
 * 'gemini' get audio; everything else is 'none' (never guess).
 */
export function ttsProviderFor(
  code: string,
  coverage: Record<string, string> = ttsCoverage.providers,
): TtsProvider {
  return coverage[code] === "gemini" ? "gemini" : "none";
}
