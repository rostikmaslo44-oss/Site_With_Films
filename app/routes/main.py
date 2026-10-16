from flask import Blueprint, current_app, jsonify, render_template, request

from app.services.archive import ArchiveError, InternetArchiveService
from app.services.tmdb import TMDBError, TMDBService

main = Blueprint("main", __name__)


@main.get("/")
def home():
    return render_template(
        "pages/index.html",
        tmdb_configured=bool(current_app.config["TMDB_ACCESS_TOKEN"]),
    )


@main.get("/api/home")
def home_catalog():
    try:
        catalog = TMDBService(current_app.config["TMDB_ACCESS_TOKEN"]).home_catalog()
    except TMDBError as error:
        current_app.logger.error("TMDB home catalog request failed: %s", error)
        return jsonify({"error": str(error)}), error.status_code

    return jsonify(catalog)


@main.get("/api/search")
def search_catalog():
    query = request.args.get("q", "").strip()
    if not query:
        return jsonify({"error": "Введіть назву для пошуку."}), 400
    if len(query) > 100:
        return jsonify({"error": "Пошуковий запит має бути не довшим за 100 символів."}), 400

    try:
        results = TMDBService(current_app.config["TMDB_ACCESS_TOKEN"]).search(query)
    except TMDBError as error:
        current_app.logger.error("TMDB search request failed: %s", error)
        return jsonify({"error": str(error)}), error.status_code

    return jsonify({"results": results})


@main.get("/api/details/<media_type>/<int:item_id>")
def item_details(media_type: str, item_id: int):
    if media_type not in {"movie", "tv"} or item_id < 1:
        return jsonify({"error": "Некоректний ідентифікатор фільму або серіалу."}), 400

    try:
        details = TMDBService(current_app.config["TMDB_ACCESS_TOKEN"]).details(media_type, item_id)
    except TMDBError as error:
        current_app.logger.error("TMDB details request failed: %s", error)
        return jsonify({"error": str(error)}), error.status_code

    return jsonify(details)


@main.get("/api/free-movies")
def free_movies():
    try:
        results = InternetArchiveService().free_movies()
    except ArchiveError as error:
        current_app.logger.error("Internet Archive movie catalog request failed: %s", error)
        return jsonify({"error": str(error)}), error.status_code

    return jsonify({"results": results})
