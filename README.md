# surfrpt

Personal collection of network configuration snippets.

## Web site

Nearest-node ranking by your device location:

**https://surfrpt1.github.io/surfrpt/**

## Layout

- `v2ray_configs/separated_by_protocol/` — configs grouped by protocol
- `v2ray_configs/subscriptions/` — subscription files
- `v2ray_configs/cloudflare/` — subset on cloudflare ranges
- `v2ray_configs/nearest/` — nearest-node output for the web site
  - `nearest/latency.json` — endpoint → TCP-connect RTT (ms), measured during CI
  - `nearest/nodes.json` — per-config geo + latency used by the site
  - `nearest/all.txt`, `nearest/cloudflare.txt` — top 100 by CI latency
- `docs/` — static web site (served via GitHub Pages)

## Usage

Import any file into a compatible client. Subscription files use standard headers.
The `nearest/` files are sorted lowest-latency first (measured during the CI build).

## Notes

Content is refreshed automatically. Availability and speed of free endpoints change constantly; use at your own risk.
