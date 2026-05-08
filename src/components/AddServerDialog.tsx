import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  X,
  Plus,
  ClipboardPaste,
  FilePlus2,
  Link2,
  CloudDownload,
  AlertCircle,
  Loader2,
  Check,
} from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import { useServers } from "../store/servers";
import { useFolders } from "../store/folders";
import {
  useSubscriptions,
  extractShareUris,
  parseUserInfo,
  decodeProfileTitle,
  urisToServers,
  capDescription,
} from "../store/subscriptions";
import { pingMissingServersForSubscription } from "../utils/refreshSubscription";
import { Dropdown } from "./Dropdown";
import { cn } from "../utils/cn";
import { parseShareUri } from "../utils/uri";

const PROTOCOLS = ["vless", "vmess", "trojan", "shadowsocks", "wireguard", "hiddify"];
const FLAGS: Record<string, string> = {
  Германия: "🇩🇪",
  Нидерланды: "🇳🇱",
  США: "🇺🇸",
  Япония: "🇯🇵",
  Великобритания: "🇬🇧",
  Сингапур: "🇸🇬",
  Франция: "🇫🇷",
  Канада: "🇨🇦",
  Финляндия: "🇫🇮",
  Швеция: "🇸🇪",
  Польша: "🇵🇱",
};

interface SubscriptionResponse {
  body: string;
  user_info: string | null;
  update_interval: string | null;
  title: string | null;
  // New (optional) header-driven metadata. Older Mint servers and
  // any non-Mint subscription source will leave these as null.
  server_description: string | null;
  profile_description: string | null;
  support_url: string | null;
  web_page_url: string | null;
}

export function AddServerDialog({
  open,
  onClose,
  initialTab,
  initialUri,
  initialSubUrl,
}: {
  open: boolean;
  onClose: () => void;
  initialTab?: "uri" | "manual" | "file" | "subscription";
  initialUri?: string;
  initialSubUrl?: string;
}) {
  const add = useServers((s) => s.add);
  const addMany = useServers((s) => s.addMany);
  const addSub = useSubscriptions((s) => s.add);
  const createFolder = useFolders((s) => s.create);
  const setFolderServerIds = useFolders((s) => s.setServerIds);
  const setFolderNameAndDescription = useFolders(
    (s) => s.setNameAndDescription
  );

  const [tab, setTab] = useState<"uri" | "manual" | "file" | "subscription">(
    initialTab ?? "uri"
  );

  useEffect(() => {
    if (!open) return;
    if (initialTab) setTab(initialTab);
    if (initialUri !== undefined) setUri(initialUri);
    if (initialSubUrl !== undefined) setSubUrl(initialSubUrl);
  }, [open, initialTab, initialUri, initialSubUrl]);

  const [uri, setUri] = useState("");

  const [name, setName] = useState("");
  const [host, setHost] = useState("");
  const [port, setPort] = useState("443");
  const [protocol, setProtocol] = useState("vless");
  const [country, setCountry] = useState("Германия");

  const [subUrl, setSubUrl] = useState("");
  const [subName, setSubName] = useState("");
  const [subStatus, setSubStatus] = useState<
    | { kind: "idle" }
    | { kind: "loading" }
    | { kind: "error"; msg: string }
    | { kind: "ok"; count: number }
  >({ kind: "idle" });

  const [filePath, setFilePath] = useState<string | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);

  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 30);
  }, [open, tab]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && open) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const reset = () => {
    setUri("");
    setName("");
    setHost("");
    setPort("443");
    setProtocol("vless");
    setCountry("Германия");
    setSubUrl("");
    setSubName("");
    setSubStatus({ kind: "idle" });
    setFilePath(null);
    setFileError(null);
  };

  const handlePasteFor = (setter: (v: string) => void) => async () => {
    try {
      const { readText } = await import("@tauri-apps/plugin-clipboard-manager");
      const txt = (await readText()) ?? "";
      setter(txt);
    } catch {
    }
  };

  const submitUri = () => {
    const t = uri.trim();
    if (!t) return;
    const p = parseShareUri(t);
    add({
      name: p.name || p.host || "Новый сервер",
      address: t,
      protocol: p.protocol || "vless",
      country: p.country,
      city: p.host,
      flag: p.flag ?? (FLAGS[p.country ?? ""] ?? "🌐"),
      ping: null,
      load: null,
      source: "manual",
    });
    reset();
    onClose();
  };

  const submitManual = () => {
    if (!host.trim()) return;
    add({
      name: name.trim() || host.trim(),
      address: `${protocol}://${host.trim()}:${port.trim() || "443"}`,
      protocol,
      country,
      city: host.trim(),
      flag: FLAGS[country] ?? "🌐",
      ping: null,
      load: null,
      source: "manual",
    });
    reset();
    onClose();
  };

  const submitSubscription = async () => {
    const url = subUrl.trim();
    if (!url) return;
    setSubStatus({ kind: "loading" });
    try {
      const resp = await invoke<SubscriptionResponse>("fetch_subscription", { url });
      const uris = extractShareUris(resp.body);
      if (uris.length === 0) {
        const preview = resp.body
          .replace(/\s+/g, " ")
          .trim()
          .slice(0, 140);
        console.warn("[mint] subscription body did not yield any URIs", {
          url,
          length: resp.body.length,
          preview,
        });
        setSubStatus({
          kind: "error",
          msg:
            preview.length > 0
              ? `Сервер ответил, но формат не распознан. Получено ${resp.body.length} байт: «${preview}${preview.length >= 140 ? "…" : ""}»`
              : "Сервер вернул пустой ответ",
        });
        return;
      }
      const userInfo = parseUserInfo(resp.user_info);
      const title = decodeProfileTitle(resp.title);
      const friendly = subName.trim() || title || hostFromUrl(url);
      // Same base64 fallback as in refreshSubscription: panel-side
      // descriptions are routinely base64-encoded because RFC 7230
      // forbids non-ASCII bytes in HTTP header values, so the only
      // safe wire encoding for a Russian / CJK / emoji announcement
      // is base64 with an optional `base64:` prefix. Reuse the same
      // detector we use for `profile-title` so the import path and
      // the refresh path agree on what the description should be.
      const profileDescription = capDescription(
        decodeProfileTitle(resp.profile_description)
      );
      const serverDescription = capDescription(
        decodeProfileTitle(resp.server_description)
      );
      const supportUrl = resp.support_url?.trim() || undefined;
      const webPageUrl = resp.web_page_url?.trim() || undefined;
      const subId = addSub({
        name: friendly,
        url,
        syncedAt: Date.now(),
        uploadBytes: userInfo.upload,
        downloadBytes: userInfo.download,
        totalBytes: userInfo.total,
        expiresAt: userInfo.expire,
        updateIntervalHours: resp.update_interval
          ? Number(resp.update_interval)
          : undefined,
        description: profileDescription,
        backendDescription: profileDescription,
        supportUrl,
        webPageUrl,
      });
      const newIds = addMany(
        urisToServers(uris, subId, { description: serverDescription })
      );
      const folderId = createFolder(friendly, { subscriptionId: subId });
      setFolderServerIds(folderId, newIds);
      if (profileDescription) {
        setFolderNameAndDescription(folderId, friendly, profileDescription);
      }
      // Kick off a background ping pass for the freshly-imported
      // servers so the dashboard doesn't sit on a column of `n/a`s
      // until the user manually presses "Пинговать всё".
      pingMissingServersForSubscription(subId);
      setSubStatus({ kind: "ok", count: uris.length });
      setTimeout(() => {
        reset();
        onClose();
      }, 750);
    } catch (e) {
      setSubStatus({
        kind: "error",
        msg: typeof e === "string" ? e : "Не удалось обработать подписку",
      });
    }
  };

  const submitFile = async () => {
    setFileError(null);
    try {
      const dialog = await import("@tauri-apps/plugin-dialog");
      const picked = await dialog.open({
        multiple: false,
        directory: false,
        filters: [
          { name: "Конфиг", extensions: ["json", "yaml", "yml", "conf", "ovpn", "txt"] },
        ],
      });
      if (!picked || Array.isArray(picked)) return;
      setFilePath(picked);
      const fs = await import("@tauri-apps/plugin-fs");
      const text = await fs.readTextFile(picked);
      const uris = extractShareUris(text);
      if (uris.length === 0) {
        setFileError("Файл не содержит распознанных URI");
        return;
      }
      const filename = picked.split(/[\\/]/).pop() ?? "file";
      const subId = addSub({
        name: filename,
        url: `file://${picked}`,
        syncedAt: Date.now(),
      });
      const newIds = addMany(urisToServers(uris, subId));
      const folderId = createFolder(filename, { subscriptionId: subId });
      setFolderServerIds(folderId, newIds);
      pingMissingServersForSubscription(subId);
      reset();
      onClose();
    } catch (e) {
      setFileError(typeof e === "string" ? e : "Не удалось прочитать файл");
    }
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          className="fixed inset-0 z-[900] grid place-items-center bg-black/55 backdrop-blur-sm"
          onMouseDown={(e) => e.target === e.currentTarget && onClose()}
        >
          <motion.div
            initial={{ y: 12, scale: 0.97, opacity: 0 }}
            animate={{ y: 0, scale: 1, opacity: 1 }}
            exit={{ y: 12, scale: 0.97, opacity: 0 }}
            transition={{ type: "spring", stiffness: 380, damping: 30 }}
            className="relative w-[520px] max-w-[92vw] rounded-2xl bg-gradient-to-b from-white/[0.05] to-white/[0.02] border border-white/[0.08] p-5"
          >
            <button
              onClick={onClose}
              className="absolute top-3 right-3 w-8 h-8 grid place-items-center rounded-md text-white/55 hover:text-white hover:bg-white/[0.06] transition"
              title="Закрыть"
            >
              <X size={14} />
            </button>

            <div className="flex items-center gap-2 mb-1">
              <div className="w-8 h-8 grid place-items-center rounded-lg bg-accent-soft border border-accent-soft text-accent">
                <Plus size={15} />
              </div>
              <h2 className="text-[18px] font-semibold text-white">Добавить сервер</h2>
            </div>
            <p className="text-[13px] text-white/55 mb-4">
              Ссылка, файл-конфиг, либо подписка от провайдера.
            </p>

            <div className="grid grid-cols-4 gap-1 p-1 mb-4 rounded-lg bg-white/[0.04] border border-white/[0.06]">
              {(
                [
                  { k: "uri", icon: Link2, label: "Ссылка" },
                  { k: "subscription", icon: CloudDownload, label: "Подписка" },
                  { k: "file", icon: FilePlus2, label: "Файл" },
                  { k: "manual", icon: Plus, label: "Вручную" },
                ] as const
              ).map((t) => (
                <button
                  key={t.k}
                  onClick={() => setTab(t.k)}
                  className={cn(
                    "relative h-9 rounded-md text-[12.5px] font-medium transition select-none",
                    tab === t.k ? "text-white" : "text-white/55 hover:text-white/80"
                  )}
                >
                  {tab === t.k && (
                    <motion.span
                      layoutId="addSrvTab"
                      transition={{ type: "spring", stiffness: 380, damping: 32 }}
                      className="absolute inset-0 rounded-md bg-accent-soft border border-accent-soft"
                    />
                  )}
                  <span className="relative flex items-center justify-center gap-1.5">
                    <t.icon size={11} />
                    {t.label}
                  </span>
                </button>
              ))}
            </div>

            <div className="min-h-[180px]">
            {tab === "uri" && (
              <div className="space-y-2">
                <label className="text-[12px] text-white/55">Ссылка</label>
                <div className="flex gap-2">
                  <input
                    ref={inputRef}
                    type="text"
                    placeholder="vless://..., vmess://..., trojan://..."
                    value={uri}
                    onChange={(e) => setUri(e.target.value)}
                    className="flex-1 h-10 px-3 rounded-lg bg-white/[0.04] border border-white/[0.06] text-[13.5px] text-white focus:outline-none focus:bg-white/[0.06] transition placeholder:text-white/30"
                    onKeyDown={(e) => e.key === "Enter" && submitUri()}
                  />
                  <button
                    onClick={handlePasteFor(setUri)}
                    className="h-10 px-3 rounded-lg bg-white/[0.04] border border-white/[0.06] text-[12.5px] text-white/75 hover:text-white hover:bg-white/[0.07] transition flex items-center gap-1.5"
                    title="Вставить из буфера"
                  >
                    <ClipboardPaste size={12} />
                    Вставить
                  </button>
                </div>
              </div>
            )}

            {tab === "subscription" && (
              <div className="space-y-2.5">
                <Field label="URL подписки">
                  <div className="flex gap-2">
                    <input
                      ref={inputRef}
                      type="text"
                      placeholder="https://account.example.com/abc123"
                      value={subUrl}
                      onChange={(e) => setSubUrl(e.target.value)}
                      className="flex-1 h-10 px-3 rounded-lg bg-white/[0.04] border border-white/[0.06] text-[13.5px] text-white focus:outline-none focus:bg-white/[0.06] transition placeholder:text-white/30"
                      onKeyDown={(e) => e.key === "Enter" && submitSubscription()}
                    />
                    <button
                      onClick={handlePasteFor(setSubUrl)}
                      className="h-10 px-3 rounded-lg bg-white/[0.04] border border-white/[0.06] text-[12.5px] text-white/75 hover:text-white hover:bg-white/[0.07] transition flex items-center gap-1.5"
                      title="Вставить из буфера"
                    >
                      <ClipboardPaste size={12} />
                      Вставить
                    </button>
                  </div>
                </Field>
                <Field label="Имя (необязательно)">
                  <input
                    type="text"
                    value={subName}
                    onChange={(e) => setSubName(e.target.value)}
                    placeholder="Если пусто — возьмём из заголовка ответа"
                    className="w-full h-10 px-3 rounded-lg bg-white/[0.04] border border-white/[0.06] text-[13.5px] text-white focus:outline-none focus:bg-white/[0.06] transition placeholder:text-white/30"
                  />
                </Field>

                {subStatus.kind === "error" && (
                  <div className="flex items-start gap-2 rounded-lg bg-rose-500/10 border border-rose-400/25 p-2.5 text-[12.5px] text-rose-200">
                    <AlertCircle size={13} className="mt-0.5 shrink-0" />
                    <span>{subStatus.msg}</span>
                  </div>
                )}
                {subStatus.kind === "ok" && (
                  <div className="flex items-center gap-2 rounded-lg bg-emerald-500/10 border border-emerald-400/25 p-2.5 text-[12.5px] text-emerald-200">
                    <Check size={13} />
                    <span>Добавлено серверов: {subStatus.count}</span>
                  </div>
                )}
              </div>
            )}

            {tab === "file" && (
              <div className="space-y-2.5">
                <button
                  onClick={submitFile}
                  className="w-full h-32 rounded-xl border border-dashed border-white/15 bg-white/[0.025] hover:bg-white/[0.05] transition flex flex-col items-center justify-center gap-2 text-white/65 hover:text-white"
                >
                  <FilePlus2 size={28} />
                  <span className="text-[13.5px] font-medium">
                    {filePath ? `Выбран: ${filePath.split(/[\\/]/).pop()}` : "Выбрать файл конфигурации"}
                  </span>
                  <span className="text-[11.5px] text-white/40">
                    .json · .yaml · .conf · .ovpn · .txt
                  </span>
                </button>
                {fileError && (
                  <div className="flex items-start gap-2 rounded-lg bg-rose-500/10 border border-rose-400/25 p-2.5 text-[12.5px] text-rose-200">
                    <AlertCircle size={13} className="mt-0.5 shrink-0" />
                    <span>{fileError}</span>
                  </div>
                )}
              </div>
            )}

            {tab === "manual" && (
              <div className="space-y-2.5">
                <Field label="Название">
                  <input
                    ref={inputRef}
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Frankfurt"
                    className="w-full h-10 px-3 rounded-lg bg-white/[0.04] border border-white/[0.06] text-[13.5px] text-white focus:outline-none focus:bg-white/[0.06] transition placeholder:text-white/30"
                  />
                </Field>
                <div className="grid grid-cols-[1fr_120px] gap-2">
                  <Field label="Хост">
                    <input
                      type="text"
                      value={host}
                      onChange={(e) => setHost(e.target.value)}
                      placeholder="de.frankfurt.example.com"
                      className="w-full h-10 px-3 rounded-lg bg-white/[0.04] border border-white/[0.06] text-[13.5px] text-white focus:outline-none focus:bg-white/[0.06] transition placeholder:text-white/30"
                    />
                  </Field>
                  <Field label="Порт">
                    <input
                      type="text"
                      value={port}
                      onChange={(e) => setPort(e.target.value)}
                      className="w-full h-10 px-3 rounded-lg bg-white/[0.04] border border-white/[0.06] text-[13.5px] text-white focus:outline-none focus:bg-white/[0.06] transition placeholder:text-white/30"
                    />
                  </Field>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <Field label="Протокол">
                    <Dropdown
                      value={protocol}
                      options={PROTOCOLS}
                      onChange={setProtocol}
                      align="left"
                      minWidth={200}
                      className="w-full"
                    />
                  </Field>
                  <Field label="Страна">
                    <Dropdown
                      value={country}
                      options={Object.keys(FLAGS)}
                      onChange={setCountry}
                      align="left"
                      minWidth={200}
                      className="w-full"
                    />
                  </Field>
                </div>
              </div>
            )}
            </div>

            <div className="flex items-center justify-end gap-2 mt-5">
              <button
                onClick={onClose}
                className="h-10 px-4 rounded-lg border border-white/10 bg-white/[0.04] text-[13.5px] text-white/85 hover:bg-white/[0.07] transition"
              >
                Отмена
              </button>
              {tab === "uri" && (
                <ConfirmCta onClick={submitUri} label="Добавить" />
              )}
              {tab === "manual" && (
                <ConfirmCta onClick={submitManual} label="Добавить" />
              )}
              {tab === "subscription" && (
                <ConfirmCta
                  onClick={submitSubscription}
                  label={subStatus.kind === "loading" ? "Загрузка…" : "Импортировать"}
                  loading={subStatus.kind === "loading"}
                  success={subStatus.kind === "ok"}
                  disabled={subStatus.kind === "loading" || !subUrl.trim()}
                />
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-[12px] text-white/55">{label}</label>
      {children}
    </div>
  );
}

function ConfirmCta({
  onClick,
  label,
  loading,
  success,
  disabled,
}: {
  onClick: () => void;
  label: string;
  loading?: boolean;
  success?: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "h-10 px-4 rounded-lg text-white text-[13.5px] font-medium transition flex items-center gap-1.5",
        disabled
          ? "bg-white/[0.05] text-white/45 cursor-not-allowed"
          : "bg-accent-grad shadow-accent-glow hover:brightness-110"
      )}
    >
      {loading ? (
        <Loader2 size={13} className="animate-spin" />
      ) : success ? (
        <Check size={13} />
      ) : (
        <Plus size={13} />
      )}
      {label}
    </button>
  );
}

function hostFromUrl(url: string) {
  try {
    return new URL(url).hostname;
  } catch {
    return "Подписка";
  }
}
