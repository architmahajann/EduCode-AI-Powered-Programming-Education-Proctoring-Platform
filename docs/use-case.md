## Educode — Use Case Diagram

This folder contains a PlantUML source file for the Educode use-case diagram: `use-case.puml`.

Purpose: visually describe primary actors and system use cases (room creation, live coding, proctoring, image capture, uploads, admin reports, etc.).

Files:

- `use-case.puml` — PlantUML source. Open this in a PlantUML-aware editor or render it using PlantUML/Docker.

PlantUML source (already in `use-case.puml`):

```text
@startuml
left to right direction
skinparam packageStyle rectangle

actor Student
actor "Admin / Teacher" as Admin
actor "Proctoring Extension (Browser)" as Extension
actor "Cloudinary / Storage" as Cloud
actor "Database" as DB

rectangle "Educode System" {
  (Create Room) as CreateRoom
  (Join Room) as JoinRoom
  (Live Coding & Monitor) as LiveCoding
  (Run Code) as RunCode
  (Submit Code) as SubmitCode
  (Download Submissions) as DownloadSub
  (Capture Images) as CaptureImages
  (Upload Images) as UploadImages
  (Set Capture Interval) as SetInterval
  (View Reports & Images) as ViewReports
  (Detect Multiple Tabs) as DetectTabs
  (Auto-fill Form) as AutoFill
  (Audio/Video Check) as AVCheck
  (Manage Users & Rooms) as ManageUsers
}

' Actor -> use cases
Student --> JoinRoom
Student --> RunCode
Student --> SubmitCode
Student --> AutoFill
Student --> AVCheck

Admin --> CreateRoom
Admin --> LiveCoding
Admin --> DownloadSub
Admin --> ViewReports
Admin --> SetInterval
Admin --> ManageUsers

Extension --> CaptureImages
Extension --> UploadImages
Extension --> DetectTabs

' System interactions
CaptureImages --> UploadImages
UploadImages --> Cloud
UploadImages --> DB
SubmitCode --> DB
ManageUsers --> DB
ViewReports --> DB

' grouping proctoring functionality
package "Proctoring" {
  CaptureImages
  UploadImages
  DetectTabs
  AVCheck
}

note right of LiveCoding
  Admin monitors student code
  in real-time (socket.io)
end note

note left of CaptureImages
  Extension captures webcam
  + metadata and timestamps
end note

@enduml
```

Render options:

- Using Docker (recommended if you have Docker):

```powershell
# from project root
docker run --rm -v "${PWD}:/workspace" plantuml/plantuml -tpng /workspace/docs/use-case.puml
```

- Using PlantUML jar (requires Java + Graphviz installed):

```powershell
# download plantuml.jar once
# Invoke-WebRequest -Uri https://github.com/plantuml/plantuml/releases/latest/download/plantuml.jar -OutFile plantuml.jar
# render
java -jar plantuml.jar docs/use-case.puml
```

- Use VS Code PlantUML extension: open `use-case.puml` and use the preview / export commands.

If you'd like, I can also:

- Generate a PNG/SVG and add it to `docs/` for direct viewing in the repo.
- Add a simplified PNG version suitable for README embedding.
