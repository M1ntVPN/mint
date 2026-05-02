
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
    const country = flag ? COUNTRY_BY_FLAG[flag] : undefined;

    return { protocol: proto, host, port, name, flag, country };
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
