import unittest
from unittest.mock import Mock, patch

import requests

from app import create_app
from app.services.archive import ArchiveError, InternetArchiveService, PUBLIC_DOMAIN_LICENSE


class InternetArchiveServiceTests(unittest.TestCase):
    @patch("app.services.archive.requests.get")
    def test_free_movies_normalizes_public_domain_records_with_mpeg4(self, get):
        response = Mock()
        response.json.return_value = {
            "response": {
                "docs": [{
                    "identifier": "classic-film_1930",
                    "title": "Classic Film",
                    "description": "<p>A <b>short</b> synopsis.</p>",
                    "year": 1930,
                    "licenseurl": PUBLIC_DOMAIN_LICENSE,
                    "format": ["MPEG4", "Metadata"],
                }]
            }
        }
        get.return_value = response

        results = InternetArchiveService().free_movies()

        self.assertEqual(results, [{
            "identifier": "classic-film_1930",
            "title": "Classic Film",
            "description": "A short synopsis.",
            "year": "1930",
            "license_url": PUBLIC_DOMAIN_LICENSE,
        }])
        self.assertIn("year:[1930 TO 1960]", get.call_args.kwargs["params"]["q"])
        self.assertEqual(get.call_args.kwargs["params"]["rows"], 24)

    @patch("app.services.archive.requests.get")
    def test_free_movies_discards_unlicensed_unplayable_and_invalid_records(self, get):
        valid = {
            "identifier": "public-film",
            "title": "Public Film",
            "licenseurl": PUBLIC_DOMAIN_LICENSE,
            "format": ["MPEG4"],
        }
        response = Mock()
        response.json.return_value = {
            "response": {
                "docs": [
                    valid,
                    {**valid, "identifier": "copyrighted", "licenseurl": None},
                    {**valid, "identifier": "no-video", "format": ["Metadata"]},
                    {**valid, "identifier": "bad/id"},
                ]
            }
        }
        get.return_value = response

        results = InternetArchiveService().free_movies()

        self.assertEqual([item["identifier"] for item in results], ["public-film"])

    @patch("app.services.archive.requests.get", side_effect=requests.Timeout())
    def test_timeout_is_reported_as_archive_error(self, _get):
        with self.assertRaises(ArchiveError) as raised:
            InternetArchiveService().free_movies()

        self.assertEqual(raised.exception.status_code, 502)


class FreeMovieRoutesTests(unittest.TestCase):
    def setUp(self):
        self.app = create_app()
        self.app.config.update(TESTING=True)
        self.client = self.app.test_client()

    @patch(
        "app.routes.main.InternetArchiveService.free_movies",
        return_value=[{"identifier": "classic-film"}],
    )
    def test_free_movies_endpoint_returns_catalog_without_tmdb_token(self, _free_movies):
        response = self.client.get("/api/free-movies")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json, {"results": [{"identifier": "classic-film"}]})

    @patch(
        "app.routes.main.InternetArchiveService.free_movies",
        side_effect=ArchiveError("Джерело недоступне."),
    )
    def test_free_movies_endpoint_reports_source_errors(self, _free_movies):
        response = self.client.get("/api/free-movies")

        self.assertEqual(response.status_code, 502)
        self.assertEqual(response.json, {"error": "Джерело недоступне."})


if __name__ == "__main__":
    unittest.main()
