import os
import re
import sqlite3
from pathlib import Path

from flask import session
from werkzeug.security import check_password_hash, generate_password_hash


DB_PATH = Path(__file__).resolve().parent.parent.parent / "instance" / "filmverse.db"


def get_db() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def init_db() -> None:
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    with get_db() as conn:
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                email TEXT NOT NULL UNIQUE,
                password_hash TEXT NOT NULL,
                display_name TEXT NOT NULL,
                avatar_url TEXT NOT NULL DEFAULT '',
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            )
            """
        )
        columns = [row[1] for row in conn.execute("PRAGMA table_info(users)").fetchall()]
        if "avatar_url" not in columns:
            conn.execute("ALTER TABLE users ADD COLUMN avatar_url TEXT NOT NULL DEFAULT ''")
        conn.commit()


def normalize_email(value: str) -> str:
    return (value or "").strip().lower()


def normalize_display_name(value: str, fallback: str = "Глядач") -> str:
    cleaned = re.sub(r"\s+", " ", (value or "").strip())
    cleaned = "".join(ch for ch in cleaned if ch.isprintable() and ch not in {"\r", "\n", "\t"})
    if not cleaned:
        return fallback
    if len(cleaned) > 40:
        cleaned = cleaned[:40].rstrip()
    return cleaned


def normalize_avatar_url(value: str) -> str:
    cleaned = (value or "").strip()
    if not cleaned:
        return ""
    if cleaned.startswith(("data:image/", "http://", "https://", "blob:")):
        return cleaned
    return ""


def email_is_valid(value: str) -> bool:
    return bool(re.fullmatch(r"[^@\s]+@[^@\s]+\.[^@\s]+", value or ""))


def create_user(email: str, password: str, display_name: str, avatar_url: str = "") -> dict:
    normalized_email = normalize_email(email)
    if not email_is_valid(normalized_email):
        raise ValueError("Некоректна пошта.")
    if len(password or "") < 6:
        raise ValueError("Пароль має містити щонайменше 6 символів.")

    safe_display_name = normalize_display_name(display_name, "Глядач")
    safe_avatar = normalize_avatar_url(avatar_url)
    with get_db() as conn:
        existing = conn.execute("SELECT 1 FROM users WHERE email = ?", (normalized_email,)).fetchone()
        if existing:
            raise ValueError("Користувач з такою поштою вже існує.")
        user_id = conn.execute(
            "INSERT INTO users (email, password_hash, display_name, avatar_url) VALUES (?, ?, ?, ?)",
            (normalized_email, generate_password_hash(password), safe_display_name, safe_avatar),
        ).lastrowid
        user = conn.execute("SELECT * FROM users WHERE id = ?", (user_id,)).fetchone()
        return serialize_user(user)


def find_user_by_email(email: str):
    normalized_email = normalize_email(email)
    with get_db() as conn:
        return conn.execute("SELECT * FROM users WHERE email = ?", (normalized_email,)).fetchone()


def get_user_by_id(user_id: int):
    with get_db() as conn:
        return conn.execute("SELECT * FROM users WHERE id = ?", (user_id,)).fetchone()


def serialize_user(user) -> dict:
    if user is None:
        return {}
    return {
        "id": user["id"],
        "email": user["email"],
        "display_name": user["display_name"],
        "avatar_url": user.get("avatar_url") or "",
    }


def update_user(user_id: int, *, email: str | None = None, password: str | None = None, display_name: str | None = None, avatar_url: str | None = None):
    updates = []
    values = []
    if email is not None:
        normalized_email = normalize_email(email)
        if not email_is_valid(normalized_email):
            raise ValueError("Некоректна пошта.")
        updates.append("email = ?")
        values.append(normalized_email)
    if password is not None:
        if len(password) < 6:
            raise ValueError("Пароль має містити щонайменше 6 символів.")
        updates.append("password_hash = ?")
        values.append(generate_password_hash(password))
    if display_name is not None:
        updates.append("display_name = ?")
        values.append(normalize_display_name(display_name, "Глядач"))
    if avatar_url is not None:
        updates.append("avatar_url = ?")
        values.append(normalize_avatar_url(avatar_url))
    if not updates:
        return get_user_by_id(user_id)

    values.append(user_id)
    with get_db() as conn:
        conn.execute(
            f"UPDATE users SET {', '.join(updates)} WHERE id = ?",
            values,
        )
        conn.commit()
        user = conn.execute("SELECT * FROM users WHERE id = ?", (user_id,)).fetchone()
        return user


def validate_user_credentials(email: str, password: str):
    user = find_user_by_email(email)
    if user is None:
        return None
    if not check_password_hash(user["password_hash"], password):
        return None
    return user


def current_user():
    user_id = session.get("user_id")
    if not user_id:
        return None
    return get_user_by_id(user_id)
