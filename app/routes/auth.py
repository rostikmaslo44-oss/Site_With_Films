from flask import Blueprint, current_app, jsonify, request, session

from app.models.user import (
    create_user,
    current_user,
    find_user_by_email,
    normalize_display_name,
    update_user,
    validate_user_credentials,
)


auth = Blueprint("auth", __name__)


@auth.post("/api/auth/register")
def register():
    payload = request.get_json(silent=True) or {}
    email = (payload.get("email") or "").strip()
    password = payload.get("password") or ""
    display_name = normalize_display_name(payload.get("display_name"), "Глядач")

    try:
        user = create_user(email, password, display_name)
    except ValueError as error:
        return jsonify({"error": str(error)}), 400

    session.clear()
    session["user_id"] = user["id"]
    return jsonify({"user": {"id": user["id"], "email": user["email"], "display_name": user["display_name"], "avatar_url": user["avatar_url"]}}), 201


@auth.post("/api/auth/login")
def login():
    payload = request.get_json(silent=True) or {}
    email = (payload.get("email") or "").strip()
    password = payload.get("password") or ""

    user = validate_user_credentials(email, password)
    if user is None:
        return jsonify({"error": "Невірна пошта або пароль."}), 401

    session.clear()
    session["user_id"] = user["id"]
    return jsonify({"user": {"id": user["id"], "email": user["email"], "display_name": user["display_name"], "avatar_url": user["avatar_url"]}})


@auth.post("/api/auth/logout")
def logout():
    session.clear()
    return jsonify({"ok": True})


@auth.get("/api/auth/me")
def me():
    user = current_user()
    if user is None:
        return jsonify({"user": None})
    return jsonify({"user": {"id": user["id"], "email": user["email"], "display_name": user["display_name"], "avatar_url": user["avatar_url"]}})


@auth.put("/api/auth/me")
def update_me():
    user = current_user()
    if user is None:
        return jsonify({"error": "Ви не увійшли в систему."}), 401

    payload = request.get_json(silent=True) or {}
    email = payload.get("email")
    password = payload.get("password")
    display_name = payload.get("display_name")

    if email is not None:
        email = (email or "").strip()
        existing = find_user_by_email(email)
        if existing is not None and existing["id"] != user["id"]:
            return jsonify({"error": "Користувач з такою поштою вже існує."}), 400

    try:
        updated = update_user(
            user["id"],
            email=email if email is not None else None,
            password=password if password not in (None, "") else None,
            display_name=display_name if display_name not in (None, "") else None,
        )
    except ValueError as error:
        return jsonify({"error": str(error)}), 400

    return jsonify({"user": {"id": updated["id"], "email": updated["email"], "display_name": updated["display_name"], "avatar_url": updated["avatar_url"]}})
