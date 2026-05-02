---
layout: default
title: Privacy Policy — Mint VPN
permalink: /privacy/
---

# Mint VPN — Privacy Policy

_Last updated: 2026-05-02_

Mint VPN is a free client for the [sing-box](https://sing-box.sagernet.org/) network engine. The app routes the user's network traffic through VPN servers chosen by the user from their own subscription. **The Mint VPN client does not operate any of those servers.**

This document explains what data the app does and does not collect, in plain language. The product is intentionally minimal: the less data we touch, the less can leak.

## 1. What Mint VPN does **not** collect

We do not collect, log, or transmit:

- Your browsing history, DNS queries, or any traffic that passes through the VPN tunnel.
- IP addresses you connect from or to.
- Personal identifiers such as name, email, phone number, or government IDs.
- Advertising identifiers, device IDs, or fingerprinting data.
- Crash dumps with personal context.

The app has no telemetry SDK, no analytics SDK, no advertising SDK. There is no Mint-operated server that the app talks to except a periodic, optional fetch of a subscription URL that **you** entered yourself.

## 2. Data that stays on the device

The following data is stored exclusively on the device, in the app's private storage area:

- **Server profiles** — names, addresses, ports, and protocol fields of the VPN servers from your subscription URL.
- **Subscription URL** — the URL you pasted into the app to import server profiles.
- **App settings** — UI preferences such as accent colour, language, autostart, kill switch, DNS overrides.
- **Connection logs** — sing-box's local debug log lines, kept in memory and purged on app exit. Logs never leave the device.

You can wipe all of this by clearing the app's data from Android Settings → Apps → Mint VPN → Storage → Clear data, or by uninstalling the app.

## 3. Network traffic that leaves the device

When you tap **Connect**, the app:

1. Reads the selected server profile from local storage.
2. Hands the profile (a JSON config) to the embedded sing-box engine.
3. Sing-box opens an Android system VPN tunnel (`VpnService`) and starts forwarding your traffic to the VPN server you chose.

When you tap **Disconnect**, the tunnel is torn down and packets resume their normal route.

The Mint VPN client itself does not contact Mint-operated servers (we don't operate any). It does, on request:

- Fetch your subscription URL to refresh the server list. The destination is whichever URL **you** typed in.
- Fetch sing-box rule-set / GeoIP / GeoSite assets from sing-box's CDN, if a server profile references them.

## 4. Permissions Mint VPN requests on Android

| Permission | Why |
|---|---|
| `INTERNET`, `ACCESS_NETWORK_STATE` | Network connectivity for the VPN tunnel and subscription refresh. |
| `BIND_VPN_SERVICE` | Required by Android's `VpnService` API to create a system VPN tunnel. |
| `FOREGROUND_SERVICE`, `FOREGROUND_SERVICE_SYSTEM_EXEMPTED` | Required by Android 14+ to keep the VPN tunnel alive while the app is in the background. The active-tunnel notification is also required by Android. |
| `POST_NOTIFICATIONS` | Show the persistent "VPN active" notification. |

Mint VPN does **not** request location, contacts, microphone, camera, SMS, accounts, or any other personal-data permissions.

## 5. Sharing of data

We do not sell, rent, or share any data, because we do not collect any.

## 6. Children's privacy

Mint VPN is not directed at children under 13. We do not knowingly collect data from any user, including children.

## 7. Changes

If we change this Privacy Policy we will update the "Last updated" date at the top and post the new version at this URL. Continuing to use Mint VPN after the update means you accept the change.

## 8. Contact

Questions or requests: <https://github.com/M1ntVPN/mint/issues>
