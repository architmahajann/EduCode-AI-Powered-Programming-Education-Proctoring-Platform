import ast
import re


def _python_findings(code):
    findings = []
    try:
        tree = ast.parse(code)
    except SyntaxError as error:
        return [{"severity": "error", "title": "Syntax error", "detail": error.msg}]

    functions = [node for node in ast.walk(tree) if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef))]
    loops = sum(isinstance(node, (ast.For, ast.While)) for node in ast.walk(tree))
    if not functions:
        findings.append({
            "severity": "suggestion",
            "title": "Extract reusable logic",
            "detail": "Consider moving the main logic into a function so it is easier to test and reuse.",
        })
    if loops > 1:
        findings.append({
            "severity": "performance",
            "title": "Review nested iteration",
            "detail": "Multiple loops were detected. Check whether a set, dictionary, or one-pass algorithm can reduce the work.",
        })
    if any(isinstance(node, ast.Call) and getattr(node.func, "id", "") == "print" for node in ast.walk(tree)):
        findings.append({
            "severity": "learning",
            "title": "Separate output from logic",
            "detail": "Keep print statements at the application boundary and return values from functions to make automated testing easier.",
        })
    return findings


def analyze_locally(code, language):
    normalized = language.lower()
    findings = _python_findings(code) if "python" in normalized or normalized in {"100", "py"} else []
    if re.search(r"\b(eval|exec)\s*\(", code):
        findings.append({
            "severity": "security",
            "title": "Avoid dynamic code execution",
            "detail": "eval/exec can execute untrusted input. Prefer explicit parsing or a safe mapping of allowed operations.",
        })
    if re.search(r"\b(password|secret|api[_-]?key)\s*=\s*[\"'][^\"']+[\"']", code, re.IGNORECASE):
        findings.append({
            "severity": "security",
            "title": "Possible hard-coded secret",
            "detail": "Move credentials to environment variables or a secret manager before deploying.",
        })
    if len(code.splitlines()) > 80:
        findings.append({
            "severity": "maintainability",
            "title": "Large code block",
            "detail": "This file is longer than 80 lines. Split it into focused functions or modules to improve readability.",
        })
    if not findings:
        findings.append({
            "severity": "positive",
            "title": "Good starting point",
            "detail": "No obvious issues were detected by the local coach. Add tests and try edge cases next.",
        })
    complexity = "O(n)" if len(re.findall(r"\b(for|while)\b", code)) <= 1 else "Review nested loops"
    summary = "The local coach reviewed your code for correctness, security, maintainability, and common performance risks."
    return {
        "summary": summary,
        "findings": findings,
        "complexity": complexity,
        "next_step": "Run a few edge-case tests, then refactor one finding at a time.",
    }
