from flask import Blueprint, current_app, jsonify, render_template, request

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
