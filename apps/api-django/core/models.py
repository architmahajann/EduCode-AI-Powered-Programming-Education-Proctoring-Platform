import uuid

from django.db import models


class Room(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    lab_name = models.CharField(max_length=200)
    admin_code = models.CharField(max_length=32, unique=True)
    language = models.CharField(max_length=40)
    password_hash = models.CharField(max_length=128)
    created_by = models.CharField(max_length=200)
    session_type = models.CharField(max_length=20, default="practice")
    test_time_limit = models.PositiveIntegerField(default=0)
    question_statements = models.JSONField(default=list)
    allotted_question = models.TextField(blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True)


class Submission(models.Model):
    room = models.ForeignKey(Room, on_delete=models.CASCADE, related_name="submissions")
    username = models.CharField(max_length=200)
    code = models.TextField()
    marks = models.FloatField(default=0)
    last_active = models.DateTimeField(auto_now=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=["room", "username"], name="unique_room_username")
        ]


class ProctorSnapshot(models.Model):
    room = models.ForeignKey(Room, on_delete=models.CASCADE, related_name="snapshots")
    student_id = models.CharField(max_length=200)
    image = models.ImageField(upload_to="proctoring/%Y/%m/%d/")
    event_type = models.CharField(max_length=40, default="snapshot")
    captured_at = models.DateTimeField(auto_now_add=True)
