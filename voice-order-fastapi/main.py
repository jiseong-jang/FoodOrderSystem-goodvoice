"""
Render 배포를 위한 진입점 파일
이 파일은 app.main에서 app 객체를 import하여 Render의 자동 감지와 호환되도록 합니다.
"""
from app.main import app

__all__ = ["app"]

