import ast
import json
import os
import re
import secrets
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

from django.contrib.auth.hashers import check_password, make_password
from django.http import HttpResponse
from django.shortcuts import get_object_or_404
from rest_framework import status, viewsets
from rest_framework.decorators import action, api_view
from rest_framework.response import Response

from .access import issue_room_token, verify_room_token
from .models import ProctorSnapshot, Room, Submission
from .serializers import RoomSerializer, SubmissionSerializer
from .ai_coach import analyze_locally


class RoomViewSet(viewsets.ModelViewSet):
    queryset = Room.objects.all().order_by("-created_at")
    serializer_class = RoomSerializer
    http_method_names = ["get", "post", "patch", "delete", "head", "options"]

    def create(self, request, *args, **kwargs):
        response = super().create(request, *args, **kwargs)
        response.data["access_token"] = issue_room_token(response.data["id"], "teacher")
        return response

    def list(self, request, *args, **kwargs):
        return Response({"error": "A room token is required"}, status=status.HTTP_403_FORBIDDEN)

    def _authorize(self, request, room, roles):
        return verify_room_token(request, room, roles)

    def retrieve(self, request, *args, **kwargs):
        room = self.get_object()
        if not self._authorize(request, room, {"teacher", "student"}):
            return Response({"error": "Room authorization required"}, status=status.HTTP_403_FORBIDDEN)
        return super().retrieve(request, *args, **kwargs)

    def partial_update(self, request, *args, **kwargs):
        room = self.get_object()
        if not self._authorize(request, room, {"teacher"}):
            return Response({"error": "Teacher authorization required"}, status=status.HTTP_403_FORBIDDEN)
        if "question_statements" in request.data:
            incoming = request.data.get("question_statements")
            if not isinstance(incoming, list):
                return Response({"error": "question_statements must be a list"}, status=400)
            existing = room.question_statements or []
            request_data = request.data.copy()
            request_data["question_statements"] = existing + [q for q in incoming if q not in existing]
            request._full_data = request_data
        return super().partial_update(request, *args, **kwargs)

    def destroy(self, request, *args, **kwargs):
        room = self.get_object()
        if not self._authorize(request, room, {"teacher"}):
            return Response({"error": "Teacher authorization required"}, status=status.HTTP_403_FORBIDDEN)
        return super().destroy(request, *args, **kwargs)

    def perform_create(self, serializer):
        data = self.request.data
        questions = data.get("question_statements") or []
        if not isinstance(questions, list):
            raise ValueError("question_statements must be a list")
        allotted = questions[0] if data.get("session_type") == "test" and questions else None
        serializer.save(
            admin_code=secrets.token_urlsafe(8),
            password_hash=make_password(data.get("password", "")),
            allotted_question=allotted,
        )

    @action(detail=True, methods=["post"])
    def join(self, request, pk=None):
        room = self.get_object()
        if not check_password(request.data.get("password", ""), room.password_hash):
            return Response({"error": "Incorrect password"}, status=status.HTTP_401_UNAUTHORIZED)
        return Response({"ok": True, "room_id": str(room.id), "access_token": issue_room_token(room.id, "student")})

    @action(detail=True, methods=["get"])
    def random_question(self, request, pk=None):
        room = self.get_object()
        if not verify_room_token(request, room, {"teacher", "student"}):
            return Response({"error": "Room authorization required"}, status=status.HTTP_403_FORBIDDEN)
        if not room.question_statements:
            return Response({"error": "No questions found"}, status=status.HTTP_404_NOT_FOUND)
        return Response({"question": secrets.choice(room.question_statements)})


class SubmissionViewSet(viewsets.ModelViewSet):
    queryset = Submission.objects.all().order_by("-last_active")
    serializer_class = SubmissionSerializer
    http_method_names = ["get", "post", "patch", "head", "options"]

    def get_queryset(self):
        queryset = super().get_queryset()
        room_id = self.request.query_params.get("room")
        if not room_id and self.kwargs.get("pk"):
            return queryset.filter(pk=self.kwargs["pk"])
        if not room_id:
            return queryset.none()
        try:
            room = Room.objects.get(pk=room_id)
        except (Room.DoesNotExist, ValueError):
            return queryset.none()
        roles = {"teacher"} if self.request.method in {"GET", "PATCH"} else {"student", "teacher"}
        return queryset.filter(room_id=room_id) if verify_room_token(self.request, room, roles) else queryset.none()

    def create(self, request, *args, **kwargs):
        room = get_object_or_404(Room, pk=request.data.get("room"))
        if not verify_room_token(request, room, {"student", "teacher"}):
            return Response({"error": "Room authorization required"}, status=status.HTTP_403_FORBIDDEN)
        username = request.data.get("username")
        code = request.data.get("code")
        if not username or not isinstance(code, str):
            return Response({"error": "room, username, and code are required"}, status=400)
        submission, _ = Submission.objects.update_or_create(
            room=room, username=username, defaults={"code": code}
        )
        return Response(SubmissionSerializer(submission).data, status=status.HTTP_200_OK)

    def retrieve(self, request, *args, **kwargs):
        submission = self.get_object()
        if not verify_room_token(request, submission.room, {"teacher"}):
            return Response({"error": "Teacher authorization required"}, status=status.HTTP_403_FORBIDDEN)
        return Response(self.get_serializer(submission).data)

    def partial_update(self, request, *args, **kwargs):
        submission = self.get_object()
        if not verify_room_token(request, submission.room, {"teacher"}):
            return Response({"error": "Teacher authorization required"}, status=status.HTTP_403_FORBIDDEN)
        return super().partial_update(request, *args, **kwargs)

    @action(detail=True, methods=["get"], url_path="report")
    def report(self, request, pk=None):
        submission = self.get_object()
        if not verify_room_token(request, submission.room, {"teacher"}):
            return Response({"error": "Teacher authorization required"}, status=status.HTTP_403_FORBIDDEN)
        question = request.query_params.get("question", "Question not supplied")
        ai_marks = request.query_params.get("ai_marks", "Not available")
        provider = request.query_params.get("provider", "Not available")
        feedback = request.query_params.get("feedback", "No feedback supplied")
        lines = [
            "Educode Student Evaluation Report",
            f"Student: {submission.username}",
            f"Room: {submission.room.lab_name}",
            f"Question: {question}",
            f"AI provider: {provider}",
            f"AI suggested marks: {ai_marks}/100",
            f"Teacher final marks: {submission.marks}/100",
            "",
            "Evaluation feedback:",
        ]
        lines.extend(feedback.replace("\r", "").splitlines())
        lines.extend(["", "Submitted code:"])
        lines.extend(submission.code.replace("\r", "").splitlines())
        response = HttpResponse(_build_pdf("Educode Student Evaluation Report", lines), content_type="application/pdf")
        response["Content-Disposition"] = f'attachment; filename="educode-{submission.username}-evaluation.pdf"'
        return response


@api_view(["POST", "GET"])
def snapshots(request, room_id):
    room = get_object_or_404(Room, pk=room_id)
    roles = {"student", "teacher"} if request.method == "POST" else {"teacher"}
    if not verify_room_token(request, room, roles):
        return Response({"error": "Room authorization required"}, status=status.HTTP_403_FORBIDDEN)
    if request.method == "POST":
        image = request.FILES.get("image")
        student_id = request.data.get("student_id")
        if image is None or not student_id:
            return Response({"error": "image and student_id are required"}, status=400)
        snapshot = ProctorSnapshot.objects.create(
            room=room,
            student_id=student_id,
            image=image,
            event_type=request.data.get("event_type", "snapshot"),
        )
        return Response({
            "id": snapshot.id,
            "path": snapshot.image.url,
            "captured_at": snapshot.captured_at,
        }, status=201)
    items = ProctorSnapshot.objects.filter(room=room).order_by("-captured_at")[:100]
    return Response({
        "snapshots": [
            {"id": item.id, "student_id": item.student_id, "path": item.image.url,
             "event_type": item.event_type, "captured_at": item.captured_at}
            for item in items
        ]
    })


@api_view(["GET"])
def health(request):
    return Response({"status": "ok", "service": "django-api"})


@api_view(["POST"])
def explain_code(request):
    """Provide an always-available local review, with an optional LLM enhancement."""
    code = request.data.get("code")
    language = request.data.get("language", "text")
    if not isinstance(code, str) or not code.strip():
        return Response({"error": "code is required"}, status=400)
    local_review = analyze_locally(code, language)
    if not os.getenv("OPENAI_API_KEY"):
        return Response({
            "provider": "Educode Local Coach",
            "explanation": local_review["summary"],
            **local_review,
        })

    from openai import OpenAI
    from openai import OpenAIError

    try:
        client = OpenAI(api_key=os.environ["OPENAI_API_KEY"])
        response = client.responses.create(
            model=os.getenv("AI_MODEL", "gpt-4.1-mini"),
            input=(
                f"Act as a patient programming tutor. Review this {language} code, "
                "identify bugs, explain complexity, and give one next step. "
                f"Return concise Markdown.\n\n{code}"
            ),
        )
    except OpenAIError as error:
        return Response({
            "provider": "Educode Local Coach",
            "warning": f"LLM provider unavailable: {error}",
            "explanation": local_review["summary"],
            **local_review,
        })
    return Response({
        "provider": "OpenAI",
        "explanation": response.output_text,
        **local_review,
    })


def _local_evaluation(question, code):
    review = analyze_locally(code, "python")
    findings = review["findings"]
    breakdown = []
    syntax_error = next((item for item in findings if item["severity"] == "error"), None)
    if syntax_error:
        breakdown.append({
            "criterion": "Syntax and structure",
            "marks": 0,
            "max_marks": 20,
            "reason": f"The code cannot be parsed: {syntax_error['detail']}.",
        })
        breakdown.extend([
            {"criterion": "Question requirements", "marks": 0, "max_marks": 60,
             "reason": "The evaluator cannot verify requirements until the syntax error is fixed."},
            {"criterion": "Code quality", "marks": 0, "max_marks": 20,
             "reason": "Quality could not be assessed because the code is not valid Python."},
        ])
        marks = 0
    else:
        try:
            tree = ast.parse(code)
        except SyntaxError:
            tree = None
        evidence = _question_evidence(question, code, tree)
        quality_penalty = sum(10 for item in findings if item["severity"] in {"security", "maintainability"})
        quality_marks = max(0, 20 - quality_penalty)
        breakdown = [
            {"criterion": "Syntax and structure", "marks": 20, "max_marks": 20,
             "reason": "The submission parses successfully."},
            {"criterion": "Question requirements", "marks": evidence["marks"], "max_marks": 60,
             "reason": evidence["reason"]},
            {"criterion": "Code quality", "marks": quality_marks, "max_marks": 20,
             "reason": "Static checks found no blocking quality issues." if not quality_penalty else
                       "Marks deducted for security or maintainability findings."},
        ]
        marks = sum(item["marks"] for item in breakdown)
    breakdown = [
        *breakdown,
    ]
    feedback = [
        f"Question considered: {question}",
        "This is a static local evaluation. It checks syntax and question-related code evidence; it does not execute untrusted student code.",
        *[f'{finding["title"]}: {finding["detail"]}' for finding in findings],
    ]
    return {
        "provider": "Educode Local Evaluator",
        "ai_used": False,
        "marks": marks,
        "max_marks": 100,
        "breakdown": breakdown,
        "feedback": "\n".join(feedback),
        "findings": review["findings"],
    }


def _question_evidence(question, code, tree):
    normalized_question = question.lower()
    normalized_code = code.lower()
    checks = [
        (("largest", "maximum", "max number", "highest"), "max(", "a maximum-value operation was found"),
        (("smallest", "minimum", "min number", "lowest"), "min(", "a minimum-value operation was found"),
        (("sum", "total", "add all"), "sum(", "a sum operation was found"),
        (("reverse", "reversed"), "reverse", "reverse logic was found"),
        (("sort", "sorted", "ascending", "descending"), "sort", "sorting logic was found"),
        (("factorial",), "factorial", "factorial logic was found"),
        (("palindrome",), "palindrome", "palindrome logic was found"),
        (("prime",), "%", "remainder logic for prime checking was found"),
        (("fibonacci",), "fibonacci", "Fibonacci logic was found"),
        (("even", "odd"), "%", "remainder logic for parity was found"),
    ]
    for words, marker, reason in checks:
        if any(word in normalized_question for word in words):
            if marker in normalized_code or (marker == "reverse" and "[:-1]" in normalized_code):
                return {"marks": 60, "reason": f"Matched the question intent: {reason}."}
            return {"marks": 10, "reason": f"The question requires {words[0]} logic, but the expected operation was not found."}
    question_tokens = set(re.findall(r"[a-z]{4,}", normalized_question))
    code_tokens = set(re.findall(r"[a-z]{4,}", normalized_code))
    overlap = sorted(question_tokens & code_tokens)
    if overlap:
        return {"marks": 35, "reason": f"Partial evidence matched question terms: {', '.join(overlap[:5])}."}
    return {"marks": 10, "reason": "No recognizable evidence that the implementation addresses the question."}


def _pdf_escape(value):
    return str(value).replace("\\", "\\\\").replace("(", "\\(").replace(")", "\\)")


def _build_pdf(title, lines):
    content = ["BT", "/F1 11 Tf", "50 760 Td"]
    for line in lines:
        content.append(f"({_pdf_escape(line[:110])}) Tj")
        content.append("0 -16 Td")
    content.append("ET")
    stream = "\n".join(content).encode("latin-1", "replace")
    objects = [
        b"<< /Type /Catalog /Pages 2 0 R >>",
        b"<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
        b"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>",
        b"<< /Length " + str(len(stream)).encode() + b" >>\nstream\n" + stream + b"\nendstream",
        b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    ]
    pdf = bytearray(b"%PDF-1.4\n")
    offsets = []
    for index, obj in enumerate(objects, 1):
        offsets.append(len(pdf))
        pdf.extend(f"{index} 0 obj\n".encode())
        pdf.extend(obj)
        pdf.extend(b"\nendobj\n")
    startxref = len(pdf)
    pdf.extend(f"xref\n0 {len(objects) + 1}\n0000000000 65535 f \n".encode())
    for offset in offsets:
        pdf.extend(f"{offset:010d} 00000 n \n".encode())
    pdf.extend(f"trailer\n<< /Size {len(objects) + 1} /Root 1 0 R >>\nstartxref\n{startxref}\n%%EOF".encode())
    return bytes(pdf)


@api_view(["POST"])
def evaluate_code(request):
    """Grade a submission against the teacher's exact question."""
    question = request.data.get("question")
    code = request.data.get("code")
    language = request.data.get("language", "python")
    if not isinstance(question, str) or not question.strip():
        return Response({"error": "question is required"}, status=400)
    if not isinstance(code, str) or not code.strip():
        return Response({"error": "code is required"}, status=400)

    local = _local_evaluation(question, code)
    api_key = os.getenv("GEMINI_API_KEY")
    if not api_key:
        return Response(local)

    prompt = (
        "You are a fair programming teacher. Grade the student's code against the "
        "provided question. Return only valid JSON with integer marks (0-100), "
        "feedback, an array of findings with title and detail, and a breakdown "
        "array. Each breakdown item must contain criterion, marks, max_marks, "
        "and reason. Explain exactly why the score was awarded.\n\n"
        f"QUESTION:\n{question}\n\nLANGUAGE:\n{language}\n\nSTUDENT CODE:\n{code}"
    )
    payload = json.dumps({
        "contents": [{"parts": [{"text": prompt}]}],
        "generationConfig": {"responseMimeType": "application/json"},
    }).encode("utf-8")
    url = (
        "https://generativelanguage.googleapis.com/v1beta/models/"
        f"{os.getenv('GEMINI_MODEL', 'gemini-2.0-flash')}:generateContent?key={api_key}"
    )
    try:
        response_request = Request(
            url,
            data=payload,
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        with urlopen(response_request, timeout=90) as response:
            data = json.loads(response.read().decode("utf-8"))
        text = data["candidates"][0]["content"]["parts"][0]["text"]
        result = json.loads(text)
        marks = max(0, min(100, int(result.get("marks", local["marks"]))))
        return Response({
            "provider": "Google Gemini",
            "ai_used": True,
            "marks": marks,
            "max_marks": 100,
            "feedback": result.get("feedback", local["feedback"]),
            "findings": result.get("findings", local["findings"]),
            "breakdown": result.get("breakdown", []),
        })
    except (HTTPError, URLError, TimeoutError, OSError, KeyError, IndexError, TypeError, ValueError) as error:
        return Response({
            **local,
            "warning": f"Gemini was unavailable; local evaluation was used ({error}).",
        })
