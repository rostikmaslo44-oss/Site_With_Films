import html
import re
from typing import Any

import requests

SEARCH_URL = "https://archive.org/advancedsearch.php"
PUBLIC_DOMAIN_LICENSE = "http://creativecommons.org/publicdomain/mark/1.0/"
REQUEST_TIMEOUT_SECONDS = 8
RESULT_LIMIT = 24
IDENTIFIER_PATTERN = re.compile(r"^[A-Za-z0-9._-]{1,160}$")


class ArchiveError(Exception):
    def __init__(self, message: str, status_code: int = 502):
        super().__init__(message)
        self.status_code = status_code


class InternetArchiveService:
    def free_movies(self) -> list[dict[str, Any]]:
        payload = self._get_json()
        response = payload.get("response") if isinstance(payload, dict) else None
        records = response.get("docs") if isinstance(response, dict) else None
        if not isinstance(records, list):
            raise ArchiveError("Internet Archive повернув некоректний каталог фільмів.")

        return [
            movie
            for record in records
            if (movie := self._normalize(record)) is not None
        ]

    def _get_json(self) -> Any:
        params = {
            "q": (
                'mediatype:movies AND collection:feature_films '
                f'AND licenseurl:"{PUBLIC_DOMAIN_LICENSE}" AND format:"MPEG4" '
                'AND year:[1930 TO 1960]'
            ),
            "fl[]": ["identifier", "title", "description", "year", "licenseurl", "format"],
            "sort[]": "downloads desc",
            "rows": RESULT_LIMIT,
            "page": 1,
            "output": "json",
        }
        try:
            response = requests.get(SEARCH_URL, params=params, timeout=REQUEST_TIMEOUT_SECONDS)
            response.raise_for_status()
            return response.json()
        except requests.Timeout as error:
            raise ArchiveError("Internet Archive не відповів вчасно. Спробуйте ще раз.") from error
        except requests.HTTPError as error:
            status_code = error.response.status_code if error.response is not None else 502
            message = (
                "Internet Archive тимчасово обмежив кількість запитів. Спробуйте пізніше."
                if status_code == 429
                else "Не вдалося отримати каталог з Internet Archive."
            )
            raise ArchiveError(message, status_code=503 if status_code == 429 else 502) from error
        except ValueError as error:
            raise ArchiveError("Internet Archive повернув некоректну відповідь.") from error
        except requests.RequestException as error:
            raise ArchiveError(
                "Не вдалося з'єднатися з Internet Archive. Перевірте інтернет і спробуйте ще раз."
            ) from error

    @staticmethod
    def _normalize(record: Any) -> dict[str, Any] | None:
        if not isinstance(record, dict):
            return None
        identifier = record.get("identifier")
        title = record.get("title")
        formats = record.get("format")
        if (
            not isinstance(identifier, str)
            or not IDENTIFIER_PATTERN.fullmatch(identifier)
            or not isinstance(title, str)
            or not title.strip()
            or record.get("licenseurl") != PUBLIC_DOMAIN_LICENSE
            or not isinstance(formats, list)
            or not any(isinstance(item, str) and "mpeg4" in item.casefold() for item in formats)
        ):
            return None

        year_value = record.get("year")
        year = str(year_value)[:4] if str(year_value).isdigit() else ""
        description = record.get("description")
        if isinstance(description, list):
            description = next((item for item in description if isinstance(item, str)), "")
        if not isinstance(description, str):
            description = ""
        description = html.unescape(re.sub(r"<[^>]*>", " ", description))
        description = " ".join(description.split())[:320]

        return {
            "identifier": identifier,
            "title": title.strip(),
            "description": description,
            "year": year,
            "license_url": PUBLIC_DOMAIN_LICENSE,
        }
