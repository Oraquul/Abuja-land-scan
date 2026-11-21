"""The weekly refresh writes only prices and dates read from a cited page."""

import sys
import unittest
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))
import refresh_estates as refresh  # noqa: E402

TODAY = date(2026, 11, 21)


def card(name, sqm, price, when):
    return f"""
    <div class="row property-list ">
      <h3 itemprop="name">{name}</h3>
      <p>{sqm} sqm residential plot</p>
      <span class="added-on">Added on {when}</span>
      <span content="{price}.00" class="price">{price}</span>
    </div>
    """


class ProxyUrlTests(unittest.TestCase):
    def test_scraperapi_renders_and_encodes_once(self):
        built = refresh.build_proxy_url(
            "https://api.scraperapi.com/?api_key=EXAMPLE&url={url}",
            "https://nigeriapropertycentre.com/for-sale/land/abuja/lugbe-district/showtype",
        )
        self.assertIn("api_key=EXAMPLE", built)
        self.assertIn("&render=true&url=", built)
        self.assertIn("url=https%3A%2F%2Fnigeriapropertycentre.com%2F", built)
        self.assertNotIn("{url}", built)
        self.assertNotIn("%253A", built)
        self.assertLess(built.index("render=true"), built.index("url=https%3A"))

    def test_existing_render_flag_is_kept(self):
        built = refresh.build_proxy_url(
            "https://api.scraperapi.com/?api_key=EXAMPLE&render=false&url={url}",
            "https://example.com/a",
        )
        self.assertEqual(built.count("render="), 1)
        self.assertIn("render=false", built)

    def test_other_proxies_are_only_encoded(self):
        built = refresh.build_proxy_url(
            "https://proxy.example/fetch?url={url}",
            "https://example.com/a b",
        )
        self.assertEqual(
            built,
            "https://proxy.example/fetch?url=https%3A%2F%2Fexample.com%2Fa%20b",
        )
        self.assertNotIn("render=", built)

    def test_error_text_drops_urls_and_keys(self):
        cleaned = refresh.sanitize_error(
            "failed https://api.scraperapi.com/?api_key=SECRET&url=https%3A%2F%2Fexample.com"
        )
        self.assertNotIn("SECRET", cleaned)
        self.assertNotIn("http", cleaned)


class ObserveTests(unittest.TestCase):
    def test_card_updates_matching_plot(self):
        html = card("Mshel Pent Haven", 150, 5000000, "02 Nov 2026")
        found = refresh.observe(html, "Mshel Pent Haven", 150, TODAY)
        self.assertEqual(found.price, 5000000)
        self.assertEqual(found.seen_on, date(2026, 11, 2))

    def test_card_ignores_a_different_plot_size(self):
        html = card("Mshel Pent Haven", 500, 5000000, "02 Nov 2026")
        self.assertIsNone(refresh.observe(html, "Mshel Pent Haven", 150, TODAY))

    def test_relative_added_date(self):
        html = card("The Glade Estate", 500, 47000000, "Yesterday").replace(
            "Added on Yesterday", "Added Yesterday"
        )
        found = refresh.observe(html, "The Glade Estate", 500, TODAY)
        self.assertEqual(found.seen_on, date(2026, 11, 20))
        self.assertEqual(found.price, 47000000)

    def test_article_keeps_an_older_modified_date(self):
        html = """
        <html><head>
          <meta property="article:modified_time" content="2025-12-28T10:19:46Z">
        </head><body>
          <p>21 November 2026</p>
          <h2>Mshel Oasis Court</h2>
          <p>950 sqm block plot</p>
          <p>Price ₦37,611,814</p>
        </body></html>
        """
        found = refresh.observe(html, "Mshel Oasis Court", 950, TODAY)
        self.assertEqual(found.seen_on, date(2025, 12, 28))
        self.assertEqual(found.price, 37611814)

    def test_article_uses_a_newer_modified_date_not_the_site_header(self):
        html = """
        <html><head>
          <meta property="article:published_time" content="2025-12-28T10:19:46Z">
          <meta property="article:modified_time" content="2026-11-01T08:00:00Z">
        </head><body>
          <p>21 November 2026</p>
          <h2>Mshel Oasis Court</h2>
          <p>950sqm</p><p>₦40,000,000</p>
        </body></html>
        """
        found = refresh.observe(html, "Mshel Oasis Court", 950, TODAY)
        self.assertEqual(found.seen_on, date(2026, 11, 1))
        self.assertEqual(found.price, 40000000)

    def test_challenge_page_is_not_a_listing(self):
        body = "<html><title>Just a moment...</title><h1>Performing security verification</h1></html>"
        self.assertTrue(refresh.is_challenge(403, body))
        self.assertIsNone(refresh.observe(body, "Mshel Pent Haven", 150, TODAY))

    def test_issuer_not_stated_is_not_parsed_as_a_price_change(self):
        html = card("Peace Crest Estate", 500, 30000000, "03 Oct 2026")
        found = refresh.observe(html, "Peace Crest Estate", 500, TODAY)
        row = {
            "ref_sqm": "500",
            "ref_price": "30000000",
            "price_per_sqm": "60000",
            "source_date": "2026-10-03",
            "price_stale": "False",
            "title": "C of O (issuer not stated)",
        }
        self.assertEqual(refresh.apply_observation(row, found, TODAY), [])
        self.assertEqual(row["title"], "C of O (issuer not stated)")

    def test_newer_card_rewrites_price_and_date_only(self):
        found = refresh.observe(card("Mshel Pent Haven", 150, 5200000, "02 Nov 2026"), "Mshel Pent Haven", 150, TODAY)
        row = {
            "ref_sqm": "150",
            "ref_price": "4790000",
            "price_per_sqm": "31933",
            "source_date": "2025-12-28",
            "price_stale": "True",
            "title": "Not stated",
        }
        changes = refresh.apply_observation(row, found, TODAY)
        self.assertIn("ref_price 4790000 -> 5200000", changes)
        self.assertEqual(row["price_per_sqm"], str(round(5200000 / 150)))
        self.assertEqual(row["source_date"], "2026-11-02")
        self.assertEqual(row["price_stale"], "False")
        self.assertEqual(row["title"], "Not stated")

    def test_manual_stale_survives_a_newer_date_when_the_price_is_unchanged(self):
        found = refresh.Observation(price=19450000, seen_on=date(2026, 11, 2))
        row = {
            "ref_sqm": "500",
            "ref_price": "19450000",
            "price_per_sqm": "38900",
            "source_date": "2026-06-30",
            "price_stale": "True",
            "title": "FCDA C of O",
        }
        refresh.apply_observation(row, found, TODAY)
        self.assertEqual(row["source_date"], "2026-11-02")
        self.assertEqual(row["price_stale"], "True")

    def test_older_page_does_not_move_the_stored_date_backwards(self):
        found = refresh.Observation(price=10000000, seen_on=date(2026, 1, 1))
        row = {
            "ref_sqm": "500",
            "ref_price": "19450000",
            "price_per_sqm": "38900",
            "source_date": "2026-10-03",
            "price_stale": "False",
            "title": "Not stated",
        }
        self.assertEqual(refresh.apply_observation(row, found, TODAY), [])
        self.assertEqual(row["ref_price"], "19450000")
        self.assertEqual(row["source_date"], "2026-10-03")


class FileTests(unittest.TestCase):
    def test_round_trip_matches_the_checked_in_files(self):
        for path in refresh.FILES:
            fields, rows = refresh.load_rows(path)
            self.assertEqual(refresh.dump_rows(fields, rows, refresh.newline_of(path)), path.read_bytes())

    def test_blocked_primary_source_does_not_rewrite_files(self):
        calls = []

        def fetcher(url):
            calls.append(url)
            if "proxy.example" in url:
                return refresh.Fetch(url, 200, card("Mshel Pent Haven", 150, 5200000, "02 Nov 2026"))
            return refresh.Fetch(url, 403, "<title>Just a moment...</title>", blocked=True, error="security check")

        before = {path: path.read_bytes() for path in refresh.FILES}
        report, code = refresh.refresh(today=TODAY, fetcher=fetcher, proxy="", write=False, pause=0)
        self.assertEqual(code, 2)
        self.assertGreater(report.blocked_primary, 0)
        self.assertEqual(report.updated, [])
        self.assertEqual({path: path.read_bytes() for path in refresh.FILES}, before)
        self.assertFalse(any("linkedin.com" in url for url in calls))

    def test_proxy_is_used_only_after_a_block_and_can_update_a_row(self):
        seen = []

        def fetcher(url):
            seen.append(url)
            if url.startswith("https://proxy.example/"):
                html = card("Mshel Pent Haven", 150, 5200000, "02 Nov 2026")
                return refresh.Fetch(url, 200, html)
            return refresh.Fetch(url, 403, "<title>Just a moment...</title>", blocked=True, error="security check")

        # Point every cited URL at one synthetic estate by rewriting nothing:
        # the proxy returns a Pent Haven card, which aligns with that one row.
        report, code = refresh.refresh(
            today=TODAY,
            fetcher=fetcher,
            proxy="https://proxy.example/fetch?url={url}",
            write=False,
            pause=0,
        )
        self.assertEqual(code, 0)
        self.assertTrue(any(url.startswith("https://proxy.example/") for url in seen))
        self.assertTrue(any(item.startswith("estates.csv:pent") for item in report.updated))
        self.assertTrue(all("proxy.example" not in line for line in report.lines))
        # Dry run must not touch the files.
        abu = next(path for path in refresh.FILES if path.parent == refresh.ROOT)
        fields, rows = refresh.load_rows(abu)
        pent = next(row for row in rows if row["id"] == "pent")
        self.assertEqual(pent["ref_price"], "4790000")
        self.assertEqual(pent["source_date"], "2025-12-28")


if __name__ == "__main__":
    unittest.main()
