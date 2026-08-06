#!/usr/bin/env python3
"""Fetch, parse, test and rebuild the v2ray-configs repo contents."""
import base64
import concurrent.futures
import ipaddress
import json
import os
import re
import socket
import sys
import tempfile
import urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "v2ray_configs")

SOURCES = [
    ("01_bevpn", "https://raw.githubusercontent.com/MrPooyaX/VpnsFucking/main/BeVpn.txt"),
    ("02_aliilapro_sub", "https://raw.githubusercontent.com/ALIILAPRO/v2rayNG-Config/main/sub.txt"),
    ("03_mfuu_v2ray", "https://raw.githubusercontent.com/mfuu/v2ray/master/v2ray"),
    ("04_ts-sf_fly", "https://raw.githubusercontent.com/ts-sf/fly/main/v2"),
    ("05_mahsa_app_sub", "https://raw.githubusercontent.com/mahsanet/MahsaFreeConfig/refs/heads/main/app/sub.txt"),
    ("06_mahsa_mtn1", "https://raw.githubusercontent.com/mahsanet/MahsaFreeConfig/refs/heads/main/mtn/sub_1.txt"),
    ("07_mahsa_mtn2", "https://raw.githubusercontent.com/mahsanet/MahsaFreeConfig/refs/heads/main/mtn/sub_2.txt"),
    ("08_mahsa_mtn3", "https://raw.githubusercontent.com/mahsanet/MahsaFreeConfig/refs/heads/main/mtn/sub_3.txt"),
    ("09_mahsa_mtn4", "https://raw.githubusercontent.com/mahsanet/MahsaFreeConfig/refs/heads/main/mtn/sub_4.txt"),
    ("10_surfboardv2ray_mixed", "https://raw.githubusercontent.com/Surfboardv2ray/TGParse/main/splitted/mixed"),
    ("11_psg_mix", "https://raw.githubusercontent.com/itsyebekhe/PSG/main/lite/subscriptions/xray/mix"),
    ("12_hosseinkoofi_iran", "https://raw.githubusercontent.com/HosseinKoofi/GO_V2rayCollector/main/mixed_iran.txt"),
    ("13_arshiacomplus_mix", "https://raw.githubusercontent.com/arshiacomplus/v2rayExtractor/refs/heads/main/mix/sub.html"),
    ("14_rayan_csub", "https://raw.githubusercontent.com/Rayan-Config/C-Sub/refs/heads/main/configs/proxy.txt"),
    ("15_eternity", "https://raw.githubusercontent.com/mahdibland/ShadowsocksAggregator/master/Eternity.txt"),
    ("16_everyday_vpn", "https://raw.githubusercontent.com/Everyday-VPN/Everyday-VPN/main/subscription/main.txt"),
    ("17_mahsanetconfig_topic", "https://raw.githubusercontent.com/MahsaNetConfigTopic/config/refs/heads/main/xray_final.txt"),
    ("18_code3dev_vip", "https://raw.githubusercontent.com/code3-dev/v-data/refs/heads/main/vip"),
    ("19_pawdroid_sub", "https://raw.githubusercontent.com/Pawdroid/Free-servers/main/sub"),
    ("20_mrabolfazl_iran", "https://raw.githubusercontent.com/MrAbolfazlNorouzi/iran-configs/refs/heads/main/configs/working-configs.txt"),
    ("21_v2nodes_all", "https://www.v2nodes.com/subscriptions/country/all/"),
    ("22_4n0nymou3", "https://raw.githubusercontent.com/4n0nymou3/multi-proxy-config-fetcher/refs/heads/main/configs/proxy_configs.txt"),
    ("23_crackbest", "https://raw.githubusercontent.com/crackbest/V2ray-Config/refs/heads/main/config.txt"),
]

CF_NETS = [ipaddress.ip_network(n) for n in [
    "173.245.48.0/20", "103.21.244.0/22", "103.22.200.0/22", "103.31.4.0/22",
    "141.101.64.0/18", "108.162.192.0/18", "190.93.240.0/20", "188.114.96.0/20",
    "197.234.240.0/22", "198.41.128.0/17", "162.158.0.0/15", "104.16.0.0/13",
    "104.24.0.0/14", "172.64.0.0/13", "131.0.72.0/22",
]]

SCHEME_RE = re.compile(r"(vmess|vless|trojan|ss|ssr|socks5|socks|http|https)://")
HEADERS = {"User-Agent": "Mozilla/5.0 (compatible; v2ray-configs-updater/1.0)"}

PROTO_FILE = {
    "vmess": "vmess.txt", "vless": "vless.txt", "trojan": "trojan.txt",
    "ss": "shadowsocks.txt",
}


def b64d(s):
    try:
        s2 = s.strip()
        pad = "=" * (-len(s2) % 4)
        return base64.b64decode(s2 + pad).decode("utf-8", "ignore")
    except Exception:
        return ""


def looks_base64(text):
    head = text[:2000].replace("\n", "").replace("\r", "")
    return bool(re.fullmatch(r"[A-Za-z0-9+/=\s]+", head)) and len(head) > 50 and "://" not in head


def candidates(text):
    if looks_base64(text):
        dec = b64d(text)
        if "://" in dec:
            return dec
    return text


def parse_configs(text):
    res = []
    for m in SCHEME_RE.finditer(text):
        scheme = m.group(1)
        end = m.end()
        while end < len(text) and text[end] not in " \t\r\n\ufeff":
            end += 1
        token = text[m.end():end]
        if not token:
            continue
        full = f"{scheme}://{token}"
        host, port = "", "443"
        if scheme == "vmess":
            try:
                obj = json.loads(b64d(token))
                host = obj.get("add", "")
                port = str(obj.get("port", "443"))
            except Exception:
                continue
        else:
            mm = re.match(
                r"(?P<auth>[^@/?#]*@)?(?P<host>[^/?#:\[\]@]+|\[[0-9a-fA-F:]+\])(:(?P<port>\d+))?",
                token,
            )
            if not mm:
                continue
            host = mm.group("host").strip("[]")
            port = mm.group("port") or "443"
        if host:
            res.append((scheme, host, port, full))
    return res


def fetch(url, timeout=30):
    req = urllib.request.Request(url, headers=HEADERS)
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return r.read().decode("utf-8", "ignore")


def resolve(host):
    try:
        infos = socket.getaddrinfo(host, None, socket.AF_INET, socket.SOCK_STREAM)
        return host, sorted({inf[4][0] for inf in infos})[:4]
    except Exception:
        return host, []


def probe(ip_port):
    ip, port = ip_port
    s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    s.settimeout(6)
    try:
        s.connect((ip, int(port)))
        return (ip, port), True
    except Exception:
        return (ip, port), False
    finally:
        s.close()


def write_lines(path, lines):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        f.write("\n".join(lines) + "\n")


def main():
    with tempfile.TemporaryDirectory() as tmp:
        # 1. download
        fetched = {}
        for name, url in SOURCES:
            try:
                fetched[name] = fetch(url)
                print(f"  {name}: {len(fetched[name])} bytes")
            except Exception as e:
                print(f"  {name}: ERROR {e}")

        # 2. parse
        cfgs = []
        for name, text in fetched.items():
            for scheme, host, port, full in parse_configs(candidates(text)):
                cfgs.append((scheme, host, port, full, name))
        print(f"parsed configs: {len(cfgs)}")

        # 3. resolve hosts
        hosts = sorted({h for _, h, _, _, _ in cfgs})
        with concurrent.futures.ThreadPoolExecutor(max_workers=64) as ex:
            resolved = dict(ex.map(resolve, hosts))
        n_ok = sum(1 for v in resolved.values() if v)
        print(f"resolved hosts: {n_ok}/{len(hosts)}")

        # 4. test unique ip:port pairs
        pairs = {}
        for _, host, port, _, _ in cfgs:
            ips = resolved.get(host, [])
            if not ips:
                continue
            pairs[(ips[0], port)] = True
        print(f"testing {len(pairs)} endpoints ...")
        with concurrent.futures.ThreadPoolExecutor(max_workers=64) as ex:
            results = dict(ex.map(probe, list(pairs)))
        alive = {k for k, v in results.items() if v}
        print(f"alive: {len(alive)}/{len(pairs)}")

        # 5. keep tested-alive, dedupe
        kept, seen = [], set()
        for scheme, host, port, full, name in cfgs:
            ips = resolved.get(host, [])
            if not ips or (ips[0], port) not in alive:
                continue
            if full in seen:
                continue
            seen.add(full)
            kept.append((scheme, host, port, full, name))
        print(f"kept configs: {len(kept)}")

        # 6. write separated_by_protocol
        proto_dir = os.path.join(OUT, "separated_by_protocol")
        buckets = {}
        for scheme, _, _, full, _ in kept:
            fn = PROTO_FILE.get(scheme, "other.txt")
            buckets.setdefault(fn, []).append(full)
        for fn, lines in buckets.items():
            write_lines(os.path.join(proto_dir, fn), list(dict.fromkeys(lines)))
        write_lines(os.path.join(proto_dir, "mixed.txt"), [f for _, _, _, f, _ in kept])

        # 7. subscriptions (chunks of 100)
        sub_dir = os.path.join(OUT, "subscriptions")
        for old in os.listdir(sub_dir):
            if old.startswith("subscription-"):
                os.remove(os.path.join(sub_dir, old))
        chunks = [kept[i:i + 100] for i in range(0, len(kept), 100)]
        for i, chunk in enumerate(chunks, 1):
            title = base64.b64encode(f"SUB-{i}".encode()).decode()
            lines = [
                f"#profile-title: base64:{title}",
                "#profile-update-interval: 1",
                "#support-url: https://github.com/surfrpt1/v2ray-configs",
            ] + [f for _, _, _, f, _ in chunk]
            write_lines(os.path.join(sub_dir, f"subscription-{i}.txt"), lines)

        # 8. cloudflare folder
        cf_dir = os.path.join(OUT, "cloudflare")
        cf_by_octet, cf_by_proto = {}, {}
        for scheme, host, port, full, _ in kept:
            ip = resolved[host][0]
            if not any(ipaddress.ip_address(ip) in n for n in CF_NETS):
                continue
            cf_by_octet.setdefault(ip.split(".")[0], []).append(full)
            cf_by_proto.setdefault(PROTO_FILE.get(scheme, "other.txt"), []).append(full)
        br = os.path.join(cf_dir, "by_range")
        bp = os.path.join(cf_dir, "by_protocol")
        for old in os.listdir(br):
            os.remove(os.path.join(br, old))
        for old in os.listdir(bp):
            os.remove(os.path.join(bp, old))
        all_cf = []
        for octet in sorted(cf_by_octet, key=lambda o: -len(cf_by_octet[o])):
            lines = list(dict.fromkeys(cf_by_octet[octet]))
            all_cf += lines
            write_lines(os.path.join(br, f"{octet}.txt"), lines)
        for fn, lines in cf_by_proto.items():
            write_lines(os.path.join(bp, fn), list(dict.fromkeys(lines)))
        write_lines(os.path.join(cf_dir, "all.txt"), list(dict.fromkeys(all_cf)))

        # 9. SOURCES.md
        src_count = {}
        for _, _, _, _, name in kept:
            src_count[name] = src_count.get(name, 0) + 1
        with open(os.path.join(ROOT, "SOURCES.md"), "w", encoding="utf-8") as f:
            f.write("# Source lists (kept configs)\n\n")
            f.write("Configs are scraped from public free-config lists and filtered to those that "
                    "passed a live TCP connect test. Auto-updated daily by GitHub Actions.\n\n")
            for s, c in sorted(src_count.items(), key=lambda kv: -kv[1]):
                f.write(f"- `{s}` : {c} working configs\n")

        print(f"done. kept={len(kept)} cloudflare={len(all_cf)} subscriptions={len(chunks)}")
        return 0


if __name__ == "__main__":
    sys.exit(main())
