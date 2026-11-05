import json
from urllib.parse import parse_qs

from channels.generic.websocket import AsyncJsonWebsocketConsumer

from .access import verify_room_token_value


class RoomSignalingConsumer(AsyncJsonWebsocketConsumer):
    async def connect(self):
        self.room_id = self.scope["url_route"]["kwargs"]["room_id"]
        query = parse_qs(self.scope.get("query_string", b"").decode())
        token = query.get("token", [""])[0]
        if not verify_room_token_value(token, self.room_id, {"teacher", "student"}):
            await self.close(code=4403)
            return
        self.group_name = f"room-{self.room_id}"
        await self.channel_layer.group_add(self.group_name, self.channel_name)
        await self.accept()

    async def disconnect(self, close_code):
        await self.channel_layer.group_discard(self.group_name, self.channel_name)

    async def receive_json(self, content, **kwargs):
        message_type = content.get("type")
        if message_type == "join":
            await self.channel_layer.group_send(
                self.group_name,
                {"type": "room.message", "payload": {
                    "type": "peer-joined", "peerId": content.get("peerId"),
                    "role": content.get("role"),
                }},
            )
            return
        if message_type in {"signal", "leave"}:
            await self.channel_layer.group_send(
                self.group_name,
                {"type": "room.message", "payload": content},
            )

    async def room_message(self, event):
        await self.send(text_data=json.dumps(event["payload"]))
