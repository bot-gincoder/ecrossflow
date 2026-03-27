export type LanguageOption = {
  value: string;
  label: string;
  nativeLabel: string;
  flag?: string;
};

export const PRIMARY_LANGUAGE_OPTIONS: LanguageOption[] = [
  { value: "fr", label: "French", nativeLabel: "Français", flag: "🇫🇷" },
  { value: "en", label: "English", nativeLabel: "English", flag: "🇬🇧" },
  { value: "es", label: "Spanish", nativeLabel: "Español", flag: "🇪🇸" },
  { value: "ht", label: "Haitian Creole", nativeLabel: "Kreyol Ayisyen", flag: "🇭🇹" },
];

export const EXTENDED_LANGUAGE_OPTIONS: LanguageOption[] = [
  { value: "pt", label: "Portuguese", nativeLabel: "Português", flag: "🇵🇹" },
  { value: "de", label: "German", nativeLabel: "Deutsch", flag: "🇩🇪" },
  { value: "it", label: "Italian", nativeLabel: "Italiano", flag: "🇮🇹" },
  { value: "nl", label: "Dutch", nativeLabel: "Nederlands", flag: "🇳🇱" },
  { value: "ar", label: "Arabic", nativeLabel: "العربية", flag: "🇸🇦" },
  { value: "zh", label: "Chinese (Simplified)", nativeLabel: "简体中文", flag: "🇨🇳" },
  { value: "ja", label: "Japanese", nativeLabel: "日本語", flag: "🇯🇵" },
  { value: "ko", label: "Korean", nativeLabel: "한국어", flag: "🇰🇷" },
  { value: "ru", label: "Russian", nativeLabel: "Русский", flag: "🇷🇺" },
  { value: "hi", label: "Hindi", nativeLabel: "हिन्दी", flag: "🇮🇳" },
  { value: "tr", label: "Turkish", nativeLabel: "Türkçe", flag: "🇹🇷" },
  { value: "sv", label: "Swedish", nativeLabel: "Svenska", flag: "🇸🇪" },
  { value: "no", label: "Norwegian", nativeLabel: "Norsk", flag: "🇳🇴" },
  { value: "da", label: "Danish", nativeLabel: "Dansk", flag: "🇩🇰" },
  { value: "fi", label: "Finnish", nativeLabel: "Suomi", flag: "🇫🇮" },
  { value: "pl", label: "Polish", nativeLabel: "Polski", flag: "🇵🇱" },
  { value: "cs", label: "Czech", nativeLabel: "Čeština", flag: "🇨🇿" },
  { value: "ro", label: "Romanian", nativeLabel: "Română", flag: "🇷🇴" },
  { value: "hu", label: "Hungarian", nativeLabel: "Magyar", flag: "🇭🇺" },
  { value: "el", label: "Greek", nativeLabel: "Ελληνικά", flag: "🇬🇷" },
  { value: "he", label: "Hebrew", nativeLabel: "עברית", flag: "🇮🇱" },
  { value: "uk", label: "Ukrainian", nativeLabel: "Українська", flag: "🇺🇦" },
  { value: "bg", label: "Bulgarian", nativeLabel: "Български", flag: "🇧🇬" },
  { value: "sr", label: "Serbian", nativeLabel: "Српски", flag: "🇷🇸" },
  { value: "hr", label: "Croatian", nativeLabel: "Hrvatski", flag: "🇭🇷" },
  { value: "sk", label: "Slovak", nativeLabel: "Slovenčina", flag: "🇸🇰" },
  { value: "sl", label: "Slovenian", nativeLabel: "Slovenščina", flag: "🇸🇮" },
  { value: "lt", label: "Lithuanian", nativeLabel: "Lietuvių", flag: "🇱🇹" },
  { value: "lv", label: "Latvian", nativeLabel: "Latviešu", flag: "🇱🇻" },
  { value: "et", label: "Estonian", nativeLabel: "Eesti", flag: "🇪🇪" },
  { value: "id", label: "Indonesian", nativeLabel: "Bahasa Indonesia", flag: "🇮🇩" },
  { value: "ms", label: "Malay", nativeLabel: "Bahasa Melayu", flag: "🇲🇾" },
  { value: "th", label: "Thai", nativeLabel: "ไทย", flag: "🇹🇭" },
  { value: "vi", label: "Vietnamese", nativeLabel: "Tiếng Việt", flag: "🇻🇳" },
  { value: "bn", label: "Bengali", nativeLabel: "বাংলা", flag: "🇧🇩" },
  { value: "ur", label: "Urdu", nativeLabel: "اردو", flag: "🇵🇰" },
  { value: "fa", label: "Persian", nativeLabel: "فارسی", flag: "🇮🇷" },
  { value: "sw", label: "Swahili", nativeLabel: "Kiswahili", flag: "🇰🇪" },
  { value: "am", label: "Amharic", nativeLabel: "አማርኛ", flag: "🇪🇹" },
  { value: "yo", label: "Yoruba", nativeLabel: "Yorùbá", flag: "🇳🇬" },
  { value: "ig", label: "Igbo", nativeLabel: "Asụsụ Igbo", flag: "🇳🇬" },
  { value: "zu", label: "Zulu", nativeLabel: "isiZulu", flag: "🇿🇦" },
  { value: "af", label: "Afrikaans", nativeLabel: "Afrikaans", flag: "🇿🇦" },
  { value: "mt", label: "Maltese", nativeLabel: "Malti", flag: "🇲🇹" },
  { value: "ga", label: "Irish", nativeLabel: "Gaeilge", flag: "🇮🇪" },
  { value: "is", label: "Icelandic", nativeLabel: "Íslenska", flag: "🇮🇸" },
  { value: "mk", label: "Macedonian", nativeLabel: "Македонски", flag: "🇲🇰" },
  { value: "ka", label: "Georgian", nativeLabel: "ქართული", flag: "🇬🇪" },
  { value: "hy", label: "Armenian", nativeLabel: "Հայերեն", flag: "🇦🇲" },
  { value: "az", label: "Azerbaijani", nativeLabel: "Azərbaycanca", flag: "🇦🇿" },
  { value: "kk", label: "Kazakh", nativeLabel: "Қазақ тілі", flag: "🇰🇿" },
  { value: "uz", label: "Uzbek", nativeLabel: "Oʻzbek", flag: "🇺🇿" },
  { value: "mn", label: "Mongolian", nativeLabel: "Монгол", flag: "🇲🇳" },
  { value: "ne", label: "Nepali", nativeLabel: "नेपाली", flag: "🇳🇵" },
  { value: "si", label: "Sinhala", nativeLabel: "සිංහල", flag: "🇱🇰" },
  { value: "ta", label: "Tamil", nativeLabel: "தமிழ்", flag: "🇮🇳" },
  { value: "te", label: "Telugu", nativeLabel: "తెలుగు", flag: "🇮🇳" },
  { value: "kn", label: "Kannada", nativeLabel: "ಕನ್ನಡ", flag: "🇮🇳" },
  { value: "ml", label: "Malayalam", nativeLabel: "മലയാളം", flag: "🇮🇳" },
  { value: "mr", label: "Marathi", nativeLabel: "मराठी", flag: "🇮🇳" },
  { value: "gu", label: "Gujarati", nativeLabel: "ગુજરાતી", flag: "🇮🇳" },
  { value: "pa", label: "Punjabi", nativeLabel: "ਪੰਜਾਬੀ", flag: "🇮🇳" },
];

export const ALL_LANGUAGE_OPTIONS: LanguageOption[] = [
  ...PRIMARY_LANGUAGE_OPTIONS,
  ...EXTENDED_LANGUAGE_OPTIONS,
];

export function getLanguageOption(code: string): LanguageOption | undefined {
  return ALL_LANGUAGE_OPTIONS.find((option) => option.value === code);
}
