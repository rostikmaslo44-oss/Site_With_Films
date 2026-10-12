import os

from flask import Flask
from dotenv import load_dotenv


def create_app():
    load_dotenv()
    app = Flask(__name__)
    app.config["TMDB_ACCESS_TOKEN"] = os.getenv("TMDB_ACCESS_TOKEN", "").strip()

    from app.routes.main import main

    app.register_blueprint(main)
    return app
