from django.urls import re_path

from .consumers import RoomSignalingConsumer

websocket_urlpatterns = [
    re_path(r"^ws/rooms/(?P<room_id>[0-9a-f-]+)/$", RoomSignalingConsumer.as_asgi()),
]
