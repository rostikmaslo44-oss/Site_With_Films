import unittest
from unittest.mock import Mock, patch

import requests

from app import create_app
from app.services.tmdb import TMDBError, TMDBService


class TMDBServiceTests(unittest.TestCase):
    def test_normalize_movie_uses_ukrainian_metadata_and_safe_image_urls(self):
        movie = TMDBService._normalize({
            "id": 42,
            "media_type": "movie",
            "title": "Тестовий фільм",
            "overview": "Опис",
            "release_date": "2025-01-02",
            "vote_average": 8.26,
            "genre_ids": [28, 878],
            "poster_path": "/poster.jpg",
            "backdrop_path": "/backdrop.jpg",
        })

        self.assertEqual(movie["year"], "2025")
        self.assertEqual(movie["rating"], 8.3)
        self.assertEqual(movie["genres"], ["Бойовик", "Фантастика"])
        self.assertEqual(movie["poster"], "https://image.tmdb.org/t/p/w500/poster.jpg")
        self.assertEqual(movie["backdrop"], "https://image.tmdb.org/t/p/original/backdrop.jpg")

    def test_missing_access_token_is_a_configuration_error(self):
        with self.assertRaises(TMDBError) as raised:
            TMDBService("").home_catalog()

        self.assertEqual(raised.exception.status_code, 503)

    @patch("app.services.tmdb.requests.get")
    def test_home_catalog_requests_ukrainian_trending_upcoming_and_tv(self, get):
        response = Mock()
        response.json.return_value = {"results": []}
        get.return_value = response

        catalog = TMDBService("test-token").home_catalog()

        self.assertEqual(set(catalog), {"trending", "upcoming", "series", "top_rated"})
        self.assertEqual(get.call_count, 3)
        self.assertEqual(get.call_args_list[0].kwargs["params"]["language"], "uk-UA")
        self.assertEqual(get.call_args_list[1].kwargs["params"]["region"], "UA")
        self.assertEqual(get.call_args_list[0].kwargs["headers"]["Authorization"], "Bearer test-token")

    @patch("app.services.tmdb.requests.get")
    def test_search_discards_people_and_invalid_results(self, get):
        response = Mock()
        response.json.return_value = {
            "results": [
                {"id": 1, "media_type": "movie", "title": "Фільм"},
                {"id": 2, "media_type": "person", "name": "Актор"},
                {"id": 3, "media_type": "tv", "name": "Серіал"},
            ]
        }
        get.return_value = response

        results = TMDBService("test-token").search("назва")

        self.assertEqual([result["title"] for result in results], ["Фільм", "Серіал"])

    @patch("app.services.tmdb.requests.get")
    def test_network_timeout_is_reported_as_tmdb_error(self, get):
        get.side_effect = requests.Timeout()

        with self.assertRaises(TMDBError) as raised:
            TMDBService("test-token").search("назва")

        self.assertEqual(raised.exception.status_code, 502)


class TMDBRoutesTests(unittest.TestCase):
    def setUp(self):
        self.app = create_app()
        self.app.config.update(TESTING=True, TMDB_ACCESS_TOKEN="test-token")
        self.client = self.app.test_client()

    def test_home_page_does_not_render_the_access_token(self):
        response = self.client.get("/")

        self.assertEqual(response.status_code, 200)
        self.assertNotIn(b"test-token", response.data)

    def test_search_requires_a_non_empty_query(self):
        response = self.client.get("/api/search")

        self.assertEqual(response.status_code, 400)
        self.assertIn("error", response.json)

    def test_home_catalog_requires_tmdb_configuration(self):
        self.app.config["TMDB_ACCESS_TOKEN"] = ""

        response = self.client.get("/api/home")

        self.assertEqual(response.status_code, 503)
        self.assertIn("TMDB_ACCESS_TOKEN", response.json["error"])

    def test_search_rejects_an_overlong_query(self):
        response = self.client.get(f"/api/search?q={'a' * 101}")

        self.assertEqual(response.status_code, 400)
        self.assertIn("100", response.json["error"])

    @patch("app.routes.main.TMDBService.home_catalog", return_value={"trending": []})
    def test_home_catalog_endpoint_returns_service_data(self, _home_catalog):
        response = self.client.get("/api/home")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json, {"trending": []})


if __name__ == "__main__":
    unittest.main()
