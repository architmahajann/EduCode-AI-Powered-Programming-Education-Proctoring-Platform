import base64
import binascii
import hashlib
import hmac
import json
import time

from django.conf import settings


def issue_room_token(room_id, role):
    payload = {"room": str(room_id), "role": role, "exp": int(time.time()) + 8 * 60 * 60}
    encoded = _encode(payload)
    signature = _signature(encoded)
    return f"{encoded}.{signature}"


def verify_room_token(request, room, allowed_roles):
    return verify_room_token_value(request.headers.get("X-Room-Token", ""), room, allowed_roles)


def verify_room_token_value(token, room_id, allowed_roles):
    if not token:
        return False
    try:
        encoded, signature = token.split(".", 1)
        expected = _signature(encoded)
        if not hmac.compare_digest(signature, expected):
            return False
        payload = json.loads(base64.urlsafe_b64decode(encoded + "=" * (-len(encoded) % 4)))
        return (
            payload.get("room") == str(room_id)
            and payload.get("role") in allowed_roles
            and int(payload.get("exp", 0)) > int(time.time())
        )
    except (ValueError, TypeError, KeyError, json.JSONDecodeError, binascii.Error):
        return False


def _encode(payload):
    return base64.urlsafe_b64encode(json.dumps(payload, separators=(",", ":")).encode()).decode().rstrip("=")


def _signature(encoded):
    return hmac.new(settings.SECRET_KEY.encode(), encoded.encode(), hashlib.sha256).hexdigest()
