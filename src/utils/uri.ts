
const FLAG_RE = /([\u{1F1E6}-\u{1F1FF}]{2})/u;

export interface ParsedUri {
  protocol?: string;
  host?: string;
  port?: string;
  name?: string;
  flag?: string;
  country?: string;
}

const COUNTRY_BY_FLAG: Record<string, string> = {
  "🇩🇪": "Германия",
  "🇳🇱": "Нидерланды",
  "🇺🇸": "США",
  "🇯🇵": "Япония",
  "🇬🇧": "Великобритания",
  "🇫🇷": "Франция",
  "🇨🇦": "Канада",
  "🇸🇬": "Сингапур",
  "🇫🇮": "Финляндия",
  "🇸🇪": "Швеция",
  "🇨🇭": "Швейцария",
  "🇪🇪": "Эстония",
  "🇱🇻": "Латвия",
  "🇱🇹": "Литва",
  "🇵🇱": "Польша",
  "🇨🇿": "Чехия",
  "🇦🇹": "Австрия",
  "🇪🇸": "Испания",
  "🇮🇹": "Италия",
  "🇮🇪": "Ирландия",
  "🇰🇷": "Южная Корея",
  "🇭🇰": "Гонконг",
  "🇹🇼": "Тайвань",
  "🇨🇳": "Китай",
  "🇦🇺": "Австралия",
  "🇧🇷": "Бразилия",
  "🇦🇪": "ОАЭ",
  "🇹🇷": "Турция",
  "🇮🇳": "Индия",
  "🇲🇽": "Мексика",
  "🇨🇱": "Чили",
  "🇦🇷": "Аргентина",
  "🇿🇦": "ЮАР",
  "🇮🇱": "Израиль",
};

// Reverse lookup: subscription #fragment text -> emoji flag.
// Many subscription providers don't bother prefixing each row with a
// regional indicator emoji and just write the plain country name in
// Russian (e.g. `vless://...#%D0%9F%D0%BE%D0%BB%D1%8C%D1%88%D0%B0`).
// We still want the dashboard / Profiles to render a real flag in
// that case, so when the regex-based emoji extraction fails we fall
// back to a textual match against the country name.
const FLAG_BY_COUNTRY: Record<string, string> = Object.fromEntries(
  Object.entries(COUNTRY_BY_FLAG).map(([flag, country]) => [country, flag])
);

// Common Russian/English aliases that don't appear as map keys but
// should still resolve to a known country. Lower-cased on lookup.
const COUNTRY_ALIASES: Record<string, string> = {
  "russia": "Россия",
  "россия": "Россия",
  "ru": "Россия",
  "germany": "Германия",
  "deutschland": "Германия",
  "netherlands": "Нидерланды",
  "holland": "Нидерланды",
  "usa": "США",
  "united states": "США",
  "japan": "Япония",
  "great britain": "Великобритания",
  "united kingdom": "Великобритания",
  "uk": "Великобритания",
  "france": "Франция",
  "canada": "Канада",
  "singapore": "Сингапур",
  "finland": "Финляндия",
  "sweden": "Швеция",
  "switzerland": "Швейцария",
  "estonia": "Эстония",
  "latvia": "Латвия",
  "lithuania": "Литва",
  "poland": "Польша",
  "czechia": "Чехия",
  "czech republic": "Чехия",
  "austria": "Австрия",
  "spain": "Испания",
  "italy": "Италия",
  "ireland": "Ирландия",
  "south korea": "Южная Корея",
  "korea": "Южная Корея",
  "hong kong": "Гонконг",
  "taiwan": "Тайвань",
  "china": "Китай",
  "australia": "Австралия",
  "brazil": "Бразилия",
  "uae": "ОАЭ",
  "turkey": "Турция",
  "india": "Индия",
  "mexico": "Мексика",
  "chile": "Чили",
  "argentina": "Аргентина",
  "south africa": "ЮАР",
  "israel": "Израиль",
};

function detectCountryFromText(name: string): {
  flag?: string;
  country?: string;
} {
  if (!name) return {};
  const haystack = name.toLowerCase();
  // Cyrillic-name pass: full country word appears anywhere in the
  // fragment. We iterate the canonical map so single-token Russian
  // names ("Польша", "Франция") win over partial matches.
  for (const country of Object.values(COUNTRY_BY_FLAG)) {
    if (haystack.includes(country.toLowerCase())) {
      return { flag: FLAG_BY_COUNTRY[country], country };
    }
  }
  for (const [alias, country] of Object.entries(COUNTRY_ALIASES)) {
    if (haystack.includes(alias)) {
      return { flag: FLAG_BY_COUNTRY[country], country };
    }
  }
  return {};
}

export function parseShareUri(uri: string): ParsedUri {
  try {
    const m = uri.match(/^(vless|vmess|trojan|ss|hiddify|wireguard):\/\//i);
    if (!m) return {};
    const proto = m[1].toLowerCase();
    const rest = uri.slice(m[0].length);
    const after = rest.includes("@") ? rest.slice(rest.indexOf("@") + 1) : rest;
    const hostport = after.split(/[/?#]/)[0];
    const [host, port] = hostport.split(":");

    const tag = uri.split("#")[1];
    const name = tag ? safeDecode(tag).trim() : "";

    const flagMatch = name.match(FLAG_RE);
    const flag = flagMatch?.[1];
    let country = flag ? COUNTRY_BY_FLAG[flag] : undefined;

    // Fallback: detect country by name text when no emoji flag is
    // present in the share fragment. Without this, subscription
    // providers that label rows simply as "Польша" / "Germany" lose
    // their country/flag on import.
    let resolvedFlag = flag;
    if (!country) {
      const fromText = detectCountryFromText(name);
      if (fromText.country) {
        country = fromText.country;
        resolvedFlag = resolvedFlag ?? fromText.flag;
      }
    }

    return { protocol: proto, host, port, name, flag: resolvedFlag, country };
  } catch {
    return {};
  }
}

function safeDecode(s: string): string {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
}
