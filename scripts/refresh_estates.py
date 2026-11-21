#!/usr/bin/env python3
"""Re-read the listing pages already cited in the estate files.

A row changes only when its own cited page states a price for the reference
plot size, or states a newer date for that same price. The script does not
add estates, remove estates, fill in a title, or write a price it did not
read on the page.

Nigeria Property Centre, which is the source for most rows, answers an
automated request with a Cloudflare check. Set the repository secret
LISTING_PROXY_URL to a fetch URL that contains the placeholder {url}. The
script substitutes the cited page address and expects the listing HTML back.
It does not print that secret.
"""

from __future__ import annotations

import csv
import os
import re
import sys
import time
from dataclasses import dataclass, field
from datetime import date, timedelta
from html.parser import HTMLParser
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.parse import quote, urlparse
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parents[1]
FILES = (ROOT / "estates.csv", ROOT / "lagos" / "estates.csv")
USER_AGENT = "EstateLandScan/1.0 (+https://github.com/Oraquul/Abuja-land-scan)"
STALE_DAYS = 274
PRIMARY_HOST = "nigeriapropertycentre.com"
SKIP_HOSTS = ("linkedin.com",)
PRICE_FIELDS = ("ref_price", "price_per_sqm", "source_date", "price_stale")
STOPWORDS = {
    "estate", "estates", "phase", "park", "gardens", "garden", "homes", "home",
    "abuja", "lagos", "ogun", "fct", "road", "the", "and", "for", "sale", "plots",
    "plot", "city", "land", "extension", "ext", "court", "of", "in", "at", "by",
    "near", "with", "from", "residential", "district", "ph",
}
MONTHS = {
    "jan": 1, "feb": 2, "mar": 3, "apr": 4, "may": 5, "jun": 6,
    "jul": 7, "aug": 8, "sep": 9, "oct": 10, "nov": 11, "dec": 12,
}
CARD_MARK = re.compile(r'<div class="row property-list\b', re.I)
PRICE_ATTR = re.compile(
    r'content="([0-9]+(?:\.[0-9]+)?)"[^>]*class="price"|class="price"[^>]*content="([0-9]+(?:\.[0-9]+)?)"',
    re.I,
)
SQM = re.compile(r"(\d[\d,]*)\s*(?:sq\.?\s*m|sqm|m²|m2)\b", re.I)
MONEY = re.compile(
    r"(?<![A-Za-z])(?:₦|NGN|N)\s*([0-9][0-9,]*(?:\.[0-9]+)?)\s*(million|billion|bn|m)?\b",
    re.I,
)
ABS_DATE = re.compile(
    r"(?:added|updated|last updated|published|modified)(?:\s+on)?\s+(\d{1,2})\s+"
    r"(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+(20\d\d)",
    re.I,
)
REL_DATE = re.compile(
    r"\badded\s+(today|yesterday|\d+\s+days?\s+ago|\d+\s+weeks?\s+ago)\b",
    re.I,
)
META_DATE = re.compile(
    r'<meta[^>]+(?:property|name)="article:(?:modified|published)_time"[^>]+content="([^"]+)"'
    r'|<meta[^>]+content="([^"]+)"[^>]+(?:property|name)="article:(?:modified|published)_time"',
    re.I,
)
ISO_DAY = re.compile(r"(20\d\d)-(\d\d)-(\d\d)")


@dataclass
class Fetch:
    url: str
    status: int
    body: str
    blocked: bool = False
    error: str = ""
    via_proxy: bool = False


@dataclass
class Observation:
    price: int | None = None
    seen_on: date | None = None


@dataclass
class Report:
    updated: list[str] = field(default_factory=list)
    unchanged: int = 0
    blocked_rows: int = 0
    blocked_primary: int = 0
    skipped_profiles: int = 0
    unreadable: int = 0
    lines: list[str] = field(default_factory=list)


class TextExtractor(HTMLParser):
    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.parts: list[str] = []
        self.skip = 0

    def handle_starttag(self, tag, attrs):
        if tag in ("script", "style", "noscript"):
            self.skip += 1

    def handle_endtag(self, tag):
        if tag in ("script", "style", "noscript") and self.skip:
            self.skip -= 1
        if tag in ("p", "div", "li", "h1", "h2", "h3", "h4", "br", "tr"):
            self.parts.append("\n")

    def handle_data(self, data):
        if self.skip:
            return
        text = data.strip()
        if text:
            self.parts.append(text)
            self.parts.append(" ")


def html_to_text(html: str) -> str:
    html = re.sub(r"<!--.*?-->", " ", html, flags=re.S)
    parser = TextExtractor()
    parser.feed(html)
    parser.close()
    return re.sub(r"[ \t]+", " ", "".join(parser.parts))


def host_of(url: str) -> str:
    host = urlparse(url).hostname or ""
    return host.lower().removeprefix("www.")


def is_challenge(status: int, body: str) -> bool:
    sample = body[:4000].lower()
    if "just a moment" in sample or "performing security verification" in sample:
        return True
    if "cf-challenge" in sample or "challenges.cloudflare.com" in sample:
        return True
    return status in (401, 403, 429, 503) and "property-list" not in sample and "<h3" not in sample


def parse_iso_day(value: str) -> date | None:
    match = ISO_DAY.search(value or "")
    if not match:
        return None
    year, month, day = (int(match.group(i)) for i in (1, 2, 3))
    try:
        return date(year, month, day)
    except ValueError:
        return None


def parse_stated_date(text: str, today: date) -> date | None:
    absolute = ABS_DATE.search(text)
    if absolute:
        day = int(absolute.group(1))
        month = MONTHS[absolute.group(2)[:3].lower()]
        year = int(absolute.group(3))
        try:
            found = date(year, month, day)
        except ValueError:
            return None
        if found <= today:
            return found
    relative = REL_DATE.search(text)
    if not relative:
        return None
    token = re.sub(r"\s+", " ", relative.group(1).lower())
    if token == "today":
        return today
    if token == "yesterday":
        return today - timedelta(days=1)
    count = int(token.split()[0])
    if "week" in token:
        count *= 7
    return today - timedelta(days=count)


def meta_dates(html: str) -> list[date]:
    found: list[date] = []
    for match in META_DATE.finditer(html):
        raw = match.group(1) or match.group(2) or ""
        # Prefer modified_time over published_time by scanning property names.
        prop = match.group(0)
        parsed = parse_iso_day(raw)
        if not parsed:
            continue
        if "modified_time" in prop:
            found.insert(0, parsed)
        else:
            found.append(parsed)
    return found


def tokens(name: str) -> list[str]:
    words = re.findall(r"[a-z0-9]+", name.lower())
    return [word for word in words if len(word) >= 4 and word not in STOPWORDS]


def money_values(text: str) -> list[int]:
    amounts: list[int] = []
    for match in MONEY.finditer(text):
        number = float(match.group(1).replace(",", ""))
        unit = (match.group(2) or "").lower()
        if unit in ("million", "m"):
            number *= 1_000_000
        elif unit in ("billion", "bn"):
            number *= 1_000_000_000
        amount = int(round(number))
        if amount >= 500_000:
            amounts.append(amount)
    return amounts


def sizes(text: str) -> list[int]:
    values: list[int] = []
    for match in SQM.finditer(text):
        number = int(match.group(1).replace(",", ""))
        if 50 <= number <= 10000:
            values.append(number)
    return values


def content_prices(html: str) -> list[int]:
    amounts: list[int] = []
    for match in PRICE_ATTR.finditer(html):
        raw = match.group(1) or match.group(2)
        amount = int(round(float(raw)))
        if amount >= 500_000:
            amounts.append(amount)
    return amounts


def aligned_price(asked: list[int], plot_sizes: list[int], ref_sqm: int) -> int | None:
    if ref_sqm not in plot_sizes:
        return None
    unique_sizes = set(plot_sizes)
    unique_prices = list(dict.fromkeys(asked))
    if unique_sizes == {ref_sqm} and len(unique_prices) == 1:
        return unique_prices[0]
    return None


def split_cards(html: str) -> list[str]:
    parts = CARD_MARK.split(html)
    cards = [part for part in parts[1:] if part.strip()]
    return cards


def observe_card(card: str, name: str, ref_sqm: int, today: date) -> Observation | None:
    needed = tokens(name)
    if not needed:
        return None
    text = html_to_text(card)
    haystack = text.lower()
    if any(token not in haystack for token in needed):
        return None
    price = aligned_price(content_prices(card) or money_values(text), sizes(text), ref_sqm)
    seen = parse_stated_date(text, today)
    if price is None or seen is None:
        return None
    return Observation(price=price, seen_on=seen)


def observe_article(html: str, name: str, ref_sqm: int, today: date) -> Observation | None:
    needed = tokens(name)
    if not needed:
        return None
    text = html_to_text(html)
    haystack = text.lower()
    if any(token not in haystack for token in needed):
        return None
    # Keep the page chrome, including a site-wide date, out of the price window.
    positions = [haystack.find(token) for token in needed]
    start = max(0, min(positions) - 80)
    end = min(len(text), max(positions) + max(len(token) for token in needed) + 700)
    window = text[start:end]
    price = aligned_price(money_values(window), sizes(window), ref_sqm)
    page_dates = [item for item in meta_dates(html) if item <= today]
    seen = page_dates[0] if page_dates else parse_stated_date(window, today)
    if price is None or seen is None:
        return None
    return Observation(price=price, seen_on=seen)


def observe(html: str, name: str, ref_sqm: int, today: date) -> Observation | None:
    if CARD_MARK.search(html):
        matches = [observe_card(card, name, ref_sqm, today) for card in split_cards(html)]
        matches = [item for item in matches if item is not None]
        if not matches:
            return None
        return max(matches, key=lambda item: item.seen_on or date.min)
    return observe_article(html, name, ref_sqm, today)


def as_bool(value: str) -> bool:
    return str(value).strip().lower() == "true"


def fresh(day: date | None, today: date) -> bool:
    return day is not None and (today - day).days <= STALE_DAYS


def apply_observation(row: dict[str, str], obs: Observation, today: date) -> list[str]:
    assert obs.price is not None and obs.seen_on is not None
    changes: list[str] = []
    old_date = parse_iso_day(row.get("source_date", ""))
    old_price_text = str(row.get("ref_price", "")).strip()
    old_price = int(old_price_text) if old_price_text.isdigit() else None
    ref_sqm = int(row["ref_sqm"]) if str(row.get("ref_sqm", "")).strip().isdigit() else 0
    if old_date is not None and obs.seen_on < old_date:
        return changes
    price_changed = old_price != obs.price
    date_changed = old_date != obs.seen_on
    if not price_changed and not date_changed:
        return changes
    if price_changed:
        if ref_sqm <= 0:
            return changes
        row["ref_price"] = str(obs.price)
        row["price_per_sqm"] = str(int(round(obs.price / ref_sqm)))
        changes.append(f"ref_price {old_price_text or '(blank)'} -> {obs.price}")
    if date_changed:
        previous = old_date.isoformat() if old_date else "(blank)"
        row["source_date"] = obs.seen_on.isoformat()
        changes.append(f"source_date {previous} -> {obs.seen_on.isoformat()}")
    manual_stale = as_bool(row.get("price_stale", "")) and fresh(old_date, today) and not price_changed
    new_stale = True if manual_stale else not fresh(obs.seen_on, today)
    stale_text = "True" if new_stale else "False"
    if row.get("price_stale") != stale_text:
        changes.append(f"price_stale {row.get('price_stale')} -> {stale_text}")
        row["price_stale"] = stale_text
    return changes


def newline_of(path: Path) -> str:
    raw = path.read_bytes()
    return "\r\n" if b"\r\n" in raw else "\n"


def load_rows(path: Path) -> tuple[list[str], list[dict[str, str]]]:
    with path.open(newline="") as handle:
        reader = csv.DictReader(handle)
        fields = list(reader.fieldnames or [])
        return fields, list(reader)


def dump_rows(fields: list[str], rows: list[dict[str, str]], newline: str) -> bytes:
    from io import StringIO

    buffer = StringIO(newline="")
    writer = csv.DictWriter(buffer, fieldnames=fields, lineterminator=newline, quoting=csv.QUOTE_MINIMAL)
    writer.writeheader()
    writer.writerows(rows)
    return buffer.getvalue().encode("utf-8")


def default_fetch(url: str, timeout: int = 25) -> Fetch:
    request = Request(url, headers={"User-Agent": USER_AGENT, "Accept": "text/html"})
    try:
        with urlopen(request, timeout=timeout) as response:
            status = getattr(response, "status", 200)
            body = response.read(2_000_000).decode("utf-8", "replace")
    except HTTPError as exc:
        body = exc.read(8_000).decode("utf-8", "replace")
        return Fetch(url, exc.code, body, blocked=is_challenge(exc.code, body), error=f"HTTP {exc.code}")
    except (URLError, TimeoutError, OSError) as exc:
        return Fetch(url, 0, "", blocked=False, error=str(exc))
    blocked = is_challenge(status, body)
    return Fetch(url, status, "" if blocked else body, blocked=blocked, error="security check" if blocked else "")


def through_proxy(template: str, url: str, fetch) -> Fetch:
    if "{url}" not in template:
        return Fetch(url, 0, "", error="LISTING_PROXY_URL is missing the {url} placeholder")
    proxied = template.replace("{url}", quote(url, safe=""))
    result = fetch(proxied)
    result.url = url
    result.via_proxy = True
    return result


def refresh(today: date | None = None, fetcher=None, proxy: str | None = None, write: bool = False, pause: float = 1.0) -> tuple[Report, int]:
    today = today or date.today()
    fetcher = fetcher or default_fetch
    if proxy is None and fetcher is default_fetch:
        proxy = os.environ.get("LISTING_PROXY_URL", "")
    proxy = (proxy or "").strip()
    report = Report()
    cache: dict[str, Fetch] = {}

    def page(url: str) -> Fetch:
        if url in cache:
            return cache[url]
        host = host_of(url)
        if any(host == item or host.endswith("." + item) for item in SKIP_HOSTS):
            result = Fetch(url, 0, "", error="personal profile skipped")
            cache[url] = result
            return result
        result = fetcher(url)
        if result.blocked and proxy:
            result = through_proxy(proxy, url, fetcher)
        cache[url] = result
        if pause and fetcher is default_fetch:
            time.sleep(pause)
        return result

    for path in FILES:
        fields, rows = load_rows(path)
        original = path.read_bytes()
        for row in rows:
            url = (row.get("source_url") or "").strip()
            label = f"{path.relative_to(ROOT).as_posix()}:{row.get('id', '')}"
            if not url:
                report.unchanged += 1
                continue
            fetched = page(url)
            if fetched.error == "personal profile skipped":
                report.skipped_profiles += 1
                report.unchanged += 1
                continue
            if fetched.blocked or (fetched.error and not fetched.body):
                report.blocked_rows += 1
                if host_of(url) == PRIMARY_HOST:
                    report.blocked_primary += 1
                report.unchanged += 1
                continue
            if fetched.status and fetched.status >= 400:
                report.unreadable += 1
                report.unchanged += 1
                continue
            try:
                ref_sqm = int(row.get("ref_sqm") or 0)
            except ValueError:
                ref_sqm = 0
            found = observe(fetched.body, row.get("name", ""), ref_sqm, today) if ref_sqm else None
            if found is None:
                report.unchanged += 1
                continue
            changes = apply_observation(row, found, today)
            if not changes:
                report.unchanged += 1
                continue
            report.updated.append(label)
            report.lines.append(label + ": " + "; ".join(changes))
        rendered = dump_rows(fields, rows, newline_of(path))
        if rendered != original:
            if write:
                path.write_bytes(rendered)
            report.lines.append(f"wrote {path.relative_to(ROOT)}" if write else f"would write {path.relative_to(ROOT)}")

    code = 2 if report.blocked_primary else 0
    return report, code


def main(argv: list[str]) -> int:
    write = "--write" in argv
    pause = 0 if "--no-pause" in argv else 1.0
    report, code = refresh(write=write, pause=pause)
    print(f"Updated {len(report.updated)} estate row(s).")
    print(f"Unchanged {report.unchanged}.")
    print(f"Blocked {report.blocked_rows}, of which {report.blocked_primary} cite {PRIMARY_HOST}.")
    print(f"Personal-profile sources skipped: {report.skipped_profiles}.")
    print(f"Other unreadable pages: {report.unreadable}.")
    for line in report.lines:
        print(line)
    if report.blocked_primary:
        print(
            "Nigeria Property Centre did not return the listing HTML. "
            "The weekly job leaves those rows unchanged. "
            "Add a repository secret named LISTING_PROXY_URL. "
            "Its value is a URL that returns the listing page and contains the placeholder {url}, "
            "for example https://api.zenrows.com/v1/?apikey=YOUR_KEY&url={url}. "
            "Do not commit the key."
        )
        return 2
    return code


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
