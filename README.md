# v2ray-configs

Working VLESS / VMess / Trojan / Shadowsocks configs scraped from public free-config lists and filtered by a live TCP connectivity test.

## Structure

- `v2ray_configs/separated_by_protocol/` — configs sorted by protocol:
  - `vless.txt`, `vmess.txt`, `trojan.txt`, `shadowsocks.txt`, `other.txt`, `mixed.txt`
- `v2ray_configs/subscriptions/` — ready-to-import subscription files (`subscription-1.txt`, `subscription-2.txt`, ...)

## Usage

Import any file into your client (v2rayNG, NekoBox, Clash, etc.) or subscribe to a `subscriptions/subscription-N.txt` URL.

The subscription files carry standard headers (`profile-title`, `profile-update-interval`, `support-url`).

## Notes

- Only configs whose endpoint responded to a live TCP connect test are included.
- These are free public proxies; availability and speed change constantly.
- Use at your own risk.
