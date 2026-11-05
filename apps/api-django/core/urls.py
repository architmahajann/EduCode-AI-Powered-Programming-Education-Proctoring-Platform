from django.urls import include, path
from rest_framework.routers import DefaultRouter

from .views import RoomViewSet, SubmissionViewSet, evaluate_code, explain_code, health, snapshots

router = DefaultRouter()
router.register("rooms", RoomViewSet, basename="room")
router.register("submissions", SubmissionViewSet, basename="submission")

urlpatterns = [
    path("health/", health),
    path("ai/explain/", explain_code),
    path("ai/evaluate/", evaluate_code),
    path("rooms/<uuid:room_id>/snapshots/", snapshots),
    path("", include(router.urls)),
]
