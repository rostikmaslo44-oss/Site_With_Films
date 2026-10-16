import os

from flask import Flask
from dotenv import load_dotenv

from app.models.user import init_db


def create_app():
    load_dotenv(os.path.join(os.path.dirname(__file__), "..", ".env"))
    app = Flask(__name__)

    token = (os.getenv("TMDB_ACCESS_TOKEN") or os.getenv("TMDB_KEY") or "").strip()
    app.config.update(
        TMDB_ACCESS_TOKEN=token,
        TMDB_KEY=token,
        SECRET_KEY=os.getenv("SECRET_KEY", "filmverse-dev-secret"),
    )
    init_db()

    from app.routes.auth import auth
    from app.routes.main import main

    app.register_blueprint(auth)
    app.register_blueprint(main)
    return app
