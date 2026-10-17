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

    def details(self, media_type: str, item_id: int) -> dict[str, Any]:
        payload = self._get_json(
            f"/{media_type}/{item_id}",
            {"append_to_response": "credits,recommendations,videos,reviews"},
        )
        if not isinstance(payload, dict) or not isinstance(payload.get("id"), int):
            raise TMDBError("TMDB повернув некоректні дані про фільм.")

        normalized = self._normalize({**payload, "media_type": media_type})
        if normalized is None:
            raise TMDBError("TMDB повернув некоректні дані про фільм.")

        credits = payload.get("credits") if isinstance(payload.get("credits"), dict) else {}
        cast = credits.get("cast") if isinstance(credits.get("cast"), list) else []
        crew = credits.get("crew") if isinstance(credits.get("crew"), list) else []
        videos = payload.get("videos") if isinstance(payload.get("videos"), dict) else {}
        video_results = videos.get("results") if isinstance(videos.get("results"), list) else []
        reviews = payload.get("reviews") if isinstance(payload.get("reviews"), dict) else {}
        review_results = reviews.get("results") if isinstance(reviews.get("results"), list) else []
        recommendations = payload.get("recommendations")
        recommendation_results = (
            recommendations.get("results")
            if isinstance(recommendations, dict) and isinstance(recommendations.get("results"), list)
            else []
        )
        release_date = payload.get("release_date" if media_type == "movie" else "first_air_date")
        runtimes = payload.get("episode_run_time") if media_type == "tv" else []
        runtime = payload.get("runtime") if media_type == "movie" else (
            runtimes[0] if isinstance(runtimes, list) and runtimes else None
        )

        normalized.update({
            "runtime": runtime if isinstance(runtime, int) else None,
            "release_date": release_date if isinstance(release_date, str) else "",
            "status": payload.get("status") if isinstance(payload.get("status"), str) else "",
            "tagline": payload.get("tagline") if isinstance(payload.get("tagline"), str) else "",
            "vote_count": payload.get("vote_count") if isinstance(payload.get("vote_count"), int) else 0,
            "director": next((
                person["name"]
                for person in crew
                if isinstance(person, dict) and person.get("job") == "Director"
                and isinstance(person.get("name"), str)
            ), ""),
            "countries": [
                country["name"]
                for country in payload.get("production_countries", [])
                if isinstance(country, dict) and isinstance(country.get("name"), str)
            ] if isinstance(payload.get("production_countries"), list) else [],
            "languages": [
                language["english_name"]
                for language in payload.get("spoken_languages", [])
                if isinstance(language, dict) and isinstance(language.get("english_name"), str)
            ] if isinstance(payload.get("spoken_languages"), list) else [],
            "cast": [
                {
                    "name": person["name"],
                    "character": person.get("character", ""),
                    "profile": self._image_url(person.get("profile_path"), "w500"),
                }
                for person in cast[:8]
                if isinstance(person, dict) and isinstance(person.get("name"), str)
            ],
            "trailer": next((
                f"https://www.youtube-nocookie.com/embed/{video['key']}"
                for video in video_results
                if isinstance(video, dict) and video.get("site") == "YouTube"
                and video.get("type") == "Trailer" and isinstance(video.get("key"), str)
            ), ""),
            "reviews": [
                {
                    "author": review.get("author", "Глядач"),
                    "content": review.get("content", ""),
                    "rating": review.get("author_details", {}).get("rating")
                    if isinstance(review.get("author_details"), dict) else None,
                }
                for review in review_results[:4]
                if isinstance(review, dict) and isinstance(review.get("content"), str)
            ],
            "similar": [
                item
                for record in recommendation_results
                if isinstance(record, dict)
                if (item := self._normalize({**record, "media_type": media_type})) is not None
            ][:6],
        })
        return normalized

    def _get_results(
        self, endpoint: str, params: dict[str, str] | None = None
    ) -> list[dict[str, Any]]:
        payload = self._get_json(endpoint, params)
        results = payload.get("results") if isinstance(payload, dict) else None
        if not isinstance(results, list):
            raise TMDBError("TMDB повернув відповідь без списку результатів.")
        return [
            normalized
            for item in results
            if (normalized := self._normalize(item)) is not None
        ]

    def _get_json(self, endpoint: str, params: dict[str, str] | None = None) -> Any:
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

        return payload

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
        if isinstance(item.get("genres"), list):
            genres = [
                genre["name"]
                for genre in item["genres"]
                if isinstance(genre, dict) and isinstance(genre.get("name"), str)
            ]
        else:
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
