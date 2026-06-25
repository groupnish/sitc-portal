import os
from datetime import timedelta
from dotenv import load_dotenv

load_dotenv()

class Config:
    SECRET_KEY                = os.environ.get("SECRET_KEY", "change-me-in-production")
    JWT_SECRET_KEY            = os.environ.get("JWT_SECRET_KEY", "jwt-change-me-in-production")
    JWT_ACCESS_TOKEN_EXPIRES  = timedelta(hours=8)
    JWT_REFRESH_TOKEN_EXPIRES = timedelta(days=30)

    SQLALCHEMY_DATABASE_URI     = os.environ.get("DATABASE_URL", "sqlite:///sitc_dev.db")
    SQLALCHEMY_TRACK_MODIFICATIONS = False

    CORS_ORIGINS = os.environ.get("CORS_ORIGINS", "http://localhost:5173,http://localhost:3000").split(",")

    # Gmail SMTP
    MAIL_SERVER   = "smtp.gmail.com"
    MAIL_PORT     = 587
    MAIL_USE_TLS  = True
    MAIL_USERNAME = os.environ.get("GMAIL_USER", "")
    MAIL_PASSWORD = os.environ.get("GMAIL_APP_PASSWORD", "")
    MAIL_FROM     = os.environ.get("GMAIL_USER", "")

    # Google Drive
    GOOGLE_DRIVE_CREDENTIALS = os.environ.get("GOOGLE_DRIVE_CREDENTIALS", "")
    GOOGLE_DRIVE_FOLDER_ID   = os.environ.get("GOOGLE_DRIVE_FOLDER_ID", "")

    UPLOAD_FOLDER = os.path.join(os.path.dirname(__file__), "uploads")
    MAX_CONTENT_LENGTH = 16 * 1024 * 1024
