# surfrpt

Personal collection of network configuration snippets.

## Layout

- `v2ray_configs/separated_by_protocol/` — configs grouped by protocol
- `v2ray_configs/subscriptions/` — subscription files
- `v2ray_configs/cloudflare/` — subset on cloudflare ranges
- `v2ray_configs/nearest/` — top 100 by TCP-connect latency, plus `latency.json` (endpoint → ms)

## Usage

Import any file into a compatible client. Subscription files use standard headers.
The `nearest/` files are sorted lowest-latency first (measured during the CI build).

## Notes

Content is refreshed automatically. Availability and speed of free endpoints change constantly; use at your own risk.
