from flask import Blueprint, request, jsonify
from flask_jwt_extended import (
    create_access_token, create_refresh_token,
    jwt_required, get_jwt_identity, get_jwt
)
from models.models import User, db

auth_bp = Blueprint("auth", __name__)


@auth_bp.route("/login", methods=["POST"])
def login():
    data = request.get_json()
    email    = (data.get("email") or "").strip().lower()
    password = data.get("password") or ""
    user = User.query.filter_by(email=email, is_active=True).first()
    if not user or not user.check_password(password):
        return jsonify({"error": "Invalid credentials"}), 401
    access  = create_access_token(identity=str(user.id),
                                   additional_claims={"role": user.role})
    refresh = create_refresh_token(identity=str(user.id))
    return jsonify({"access_token": access, "refresh_token": refresh, "user": user.to_dict()})


@auth_bp.route("/refresh", methods=["POST"])
@jwt_required(refresh=True)
def refresh():
    uid  = get_jwt_identity()
    user = User.query.get(int(uid))
    if not user or not user.is_active:
        return jsonify({"error": "User not found"}), 404
    access = create_access_token(identity=str(user.id),
                                  additional_claims={"role": user.role})
    return jsonify({"access_token": access})


@auth_bp.route("/me", methods=["GET"])
@jwt_required()
def me():
    uid  = get_jwt_identity()
    user = User.query.get(int(uid))
    if not user:
        return jsonify({"error": "Not found"}), 404
    return jsonify(user.to_dict())


@auth_bp.route("/change-password", methods=["PUT"])
@jwt_required()
def change_password():
    uid  = get_jwt_identity()
    user = User.query.get(int(uid))
    data = request.get_json()
    if not user.check_password(data.get("current_password", "")):
        return jsonify({"error": "Current password incorrect"}), 400
    user.set_password(data["new_password"])
    db.session.commit()
    return jsonify({"message": "Password changed"})
