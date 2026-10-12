from typing import Any

import requests

API_BASE_URL = "https://api.themoviedb.org/3"
IMAGE_BASE_URL = "https://image.tmdb.org/t/p"
REQUEST_TIMEOUT_SECONDS = 8

GENRES = {
    12: "Пригоди",
    14: "Фентезі",
    16: "Мультфільм",
    18: "Драма",
    27: "Жахи",
    28: "Бойовик",
    35: "Комедія",
    36: "Історія",
    37: "Вестерн",
    53: "Трилер",
    80: "Кримінал",
    99: "Документальний",
    878: "Фантастика",
    9648: "Детектив",
    10402: "Музика",
    10749: "Мелодрама",
    10751: "Сімейний",
    10752: "Військовий",
    10759: "Бойовик",
    10762: "Дитячий",
    10763: "Новини",
    10764: "Реаліті",
    10765: "Фантастика",
    10766: "Мильна опера",
    10767: "Ток-шоу",
    10768: "Військовий",
    10770: "Телефільм",
}


class TMDBError(Exception):
    def __init__(self, message: str, status_code: int = 502):
        super().__init__(message)
        self.status_code = status_code


class TMDBService:
    def __init__(self, access_token: str):
        self.access_token = access_token

    def home_catalog(self) -> dict[str, list[dict[str, Any]]]:
        trending = self._get_results("/trending/movie/week")
        return {
            "trending": trending,
            "upcoming": self._get_results("/movie/upcoming", {"region": "UA"}),
            "series": self._get_results("/tv/popular"),
            "top_rated": trending,
        }

    def search(self, query: str) -> list[dict[str, Any]]:
        records = self._get_results("/search/multi", {"query": query, "include_adult": "false"})
        return [record for record in records if record["media_type"] in {"movie", "tv"}]

    def _get_results(
        self, endpoint: str, params: dict[str, str] | None = None
    ) -> list[dict[str, Any]]:
        if not self.access_token:
            raise TMDBError(
                "TMDB не налаштовано. Додайте TMDB_ACCESS_TOKEN у файл .env.",
                status_code=503,
            )

        request_params = {"language": "uk-UA", **(params or {})}
        try:
            response = requests.get(
                f"{API_BASE_URL}{endpoint}",
                headers={"Authorization": f"Bearer {self.access_token}"},
                params=request_params,
                timeout=REQUEST_TIMEOUT_SECONDS,
            )
            response.raise_for_status()
            payload = response.json()
        except requests.Timeout as error:
            raise TMDBError("TMDB не відповів вчасно. Спробуйте ще раз.") from error
        except requests.HTTPError as error:
            status_code = error.response.status_code if error.response is not None else 502
            if status_code == 401:
                message = "TMDB відхилив токен. Перевірте TMDB_ACCESS_TOKEN у файлі .env."
                status_code = 503
            elif status_code == 429:
                message = "TMDB тимчасово обмежив кількість запитів. Спробуйте пізніше."
                status_code = 503
            else:
                message = "Не вдалося отримати дані з TMDB."
            raise TMDBError(message, status_code=status_code) from error
        except ValueError as error:
            raise TMDBError("TMDB повернув некоректну відповідь.") from error
        except requests.RequestException as error:
            raise TMDBError("Не вдалося з'єднатися з TMDB. Перевірте інтернет і спробуйте ще раз.") from error

        results = payload.get("results") if isinstance(payload, dict) else None
        if not isinstance(results, list):
            raise TMDBError("TMDB повернув відповідь без списку результатів.")
        return [
            normalized
            for item in results
            if (normalized := self._normalize(item)) is not None
        ]

    @staticmethod
    def _normalize(item: Any) -> dict[str, Any] | None:
        if not isinstance(item, dict):
            return None
        if not isinstance(item.get("id"), int):
            return None

        media_type = item.get("media_type")
        if media_type not in {"movie", "tv", "person"}:
            media_type = "tv" if "name" in item else "movie"

        title = item.get("title" if media_type == "movie" else "name")
        if not isinstance(title, str) or not title.strip():
            return None

        release_date = item.get("release_date" if media_type == "movie" else "first_air_date")
        year = release_date[:4] if isinstance(release_date, str) and len(release_date) >= 4 else ""
        genre_ids = item.get("genre_ids", [])
        genres = [
            GENRES[genre_id]
            for genre_id in genre_ids
            if isinstance(genre_id, int) and genre_id in GENRES
        ] if isinstance(genre_ids, list) else []

        return {
            "id": item.get("id"),
            "media_type": media_type,
            "title": title.strip(),
            "overview": item.get("overview") if isinstance(item.get("overview"), str) else "",
            "year": year,
            "rating": round(item.get("vote_average", 0), 1)
            if isinstance(item.get("vote_average"), (int, float))
            else 0,
            "genres": genres,
            "poster": TMDBService._image_url(item.get("poster_path"), "w500"),
            "backdrop": TMDBService._image_url(item.get("backdrop_path"), "original"),
        }

    @staticmethod
    def _image_url(path: Any, size: str) -> str:
        if not isinstance(path, str) or not path.startswith("/"):
            return ""
        return f"{IMAGE_BASE_URL}/{size}{path}"
