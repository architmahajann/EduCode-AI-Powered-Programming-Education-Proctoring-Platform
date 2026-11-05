from rest_framework import serializers

from .models import Room, Submission


class RoomSerializer(serializers.ModelSerializer):
    password = serializers.CharField(write_only=True, required=True)

    def create(self, validated_data):
        validated_data.pop("password", None)
        return super().create(validated_data)

    class Meta:
        model = Room
        fields = (
            "id",
            "lab_name",
            "language",
            "created_by",
            "session_type",
            "test_time_limit",
            "question_statements",
            "allotted_question",
            "created_at",
            "password",
        )
        read_only_fields = ("id", "admin_code", "allotted_question", "created_at")


class SubmissionSerializer(serializers.ModelSerializer):
    class Meta:
        model = Submission
        fields = ("id", "room", "username", "code", "marks", "last_active")
        read_only_fields = ("id", "last_active")
