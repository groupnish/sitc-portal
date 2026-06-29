from flask import Flask
from flask_cors import CORS
from flask_jwt_extended import JWTManager
from extensions import db
from config import Config

def create_app():
    app = Flask(__name__)
    app.config.from_object(Config)

    db.init_app(app)
    CORS(app, origins=app.config["CORS_ORIGINS"], supports_credentials=True,
     allow_headers=["Content-Type", "Authorization"],
     methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"])
    JWTManager(app)

    from routes.auth import auth_bp
    from routes.projects import projects_bp
    from routes.boq import boq_bp
    from routes.grn import grn_bp
    from routes.dispatch import dispatch_bp
    from routes.site_progress import site_bp
    from routes.ra_bill import ra_bp
    from routes.users import users_bp
    from routes.notifications import notif_bp

    app.register_blueprint(auth_bp,       url_prefix="/api/auth")
    app.register_blueprint(projects_bp,   url_prefix="/api/projects")
    app.register_blueprint(boq_bp,        url_prefix="/api/boq")
    app.register_blueprint(grn_bp,        url_prefix="/api/grn")
    app.register_blueprint(dispatch_bp,   url_prefix="/api/dispatch")
    app.register_blueprint(site_bp,       url_prefix="/api/site")
    app.register_blueprint(ra_bp,         url_prefix="/api/ra")
    app.register_blueprint(users_bp,      url_prefix="/api/users")
    app.register_blueprint(notif_bp,      url_prefix="/api/notifications")

    with app.app_context():
        db.create_all()

    return app

app = create_app()

if __name__ == "__main__":
    app.run(debug=True, port=5000)
