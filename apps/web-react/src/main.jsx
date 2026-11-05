import { StrictMode, useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import "./styles.css";

const API = import.meta.env.VITE_API_URL || "http://localhost:8000/api";
const languages = [
  ["103", "C (GCC)"], ["105", "C++ (GCC)"], ["91", "Java"], ["100", "Python"],
  ["102", "JavaScript"], ["107", "Go"], ["108", "Rust"], ["101", "TypeScript"],
  ["98", "PHP"], ["43", "HTML/CSS"],
];

async function request(path, options = {}) {
  const { roomToken = "", ...fetchOptions } = options;
  const response = await fetch(`${API}${path}`, {
    headers: { "Content-Type": "application/json", ...(roomToken ? { "X-Room-Token": roomToken } : {}), ...(fetchOptions.headers || {}) },
    ...fetchOptions,
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "Request failed");
  return data;
}

function Shell({ children, onHome }) {
  return <div className="shell">
    <header className="topbar">
      <button className="brand" onClick={onHome}><span className="brand-mark">&lt;/&gt;</span> EDUCODE</button>
      <nav><button onClick={onHome}>Home</button><a href="#features">Features</a><a href="#about">About</a></nav>
      <span className="status-pill"><i /> Live learning platform</span>
    </header>
    {children}
    <footer>© Educode · Transforming Digital Programming Education</footer>
  </div>;
}

function Landing({ navigate }) {
  const [savedRoom, setSavedRoom] = useState(() => {
    try { return JSON.parse(localStorage.getItem("educode.teacherRoom") || "null"); } catch { return null; }
  });
  return <Shell onHome={() => navigate("home")}>
    <main className="hero">
      <img className="hero-art" src="/images/bg1.png" alt="" />
      <div className="hero-copy">
        <div className="eyebrow">LEARN · BUILD · COLLABORATE</div>
        <h1>EDUC<span>O</span>DE</h1>
        <p>Transforming Digital<br />Programming Education</p>
        <img className="avatar" src="/images/avatar.svg" alt="" />
        <h2>Welcome to Educode</h2>
        <div className="hero-actions">
          <button className="primary" onClick={() => navigate("create")}>Create Room <small>Teacher</small></button>
          <button className="secondary" onClick={() => navigate("join")}>Join Room <small>Student</small></button>
        </div>
        {savedRoom && <button className="resume-room" onClick={() => navigate("admin", savedRoom)}>↗ Re-enter your last teacher room</button>}
        <div className="hero-meta"><span>● Real-time coding</span><span>● Secure proctoring</span><span>● AI assistance</span></div>
      </div>
    </main>
    <section className="feature-strip" id="features">
      <Feature icon="⌘" title="Live Coding Labs" text="Code together in a real-time classroom." />
      <Feature icon="◈" title="Smart Assessment" text="Timed tests, submissions and grading." />
      <Feature icon="✦" title="AI Learning Coach" text="Get clear, helpful code explanations." />
    </section>
  </Shell>;
}

function Feature({ icon, title, text }) {
  return <article className="feature"><b>{icon}</b><div><h3>{title}</h3><p>{text}</p></div></article>;
}

function CreateRoom({ navigate }) {
  const [form, setForm] = useState({ lab_name: "", created_by: "", language: "", session_type: "", password: "", test_time_limit: "", question_statements: "" });
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");
  const test = form.session_type === "test";
  const update = (key, value) => setForm((current) => ({ ...current, [key]: value }));
  async function submit(event) {
    event.preventDefault(); setError("");
    try {
      const questions = form.question_statements.split(/\n\s*---\s*\n|\n{2,}/).map((q) => q.trim()).filter(Boolean);
      const data = await request("/rooms/", { method: "POST", body: JSON.stringify({
        ...form, language: form.language, session_type: form.session_type || "practice",
        test_time_limit: Number(form.test_time_limit || 0),
        question_statements: test ? questions : ["Practice Mode: Write and test your code freely!"],
      }) });
      localStorage.setItem("educode.teacherRoom", JSON.stringify(data));
      setResult(data);
    } catch (err) { setError(err.message); }
  }
  return <Shell onHome={() => navigate("home")}><main className="form-page">
    <div className="form-art"><img src="/images/bg.png" alt="" /><span>Build your next<br /><strong>great idea.</strong></span></div>
    <form className="card-form" onSubmit={submit}><button type="button" className="back" onClick={() => navigate("home")}>← Back home</button>
      <div className="form-heading"><span className="round-icon">⌘</span><div><div className="eyebrow dark">TEACHER WORKSPACE</div><h2>Create a coding room</h2><p>Set up a live lab or a timed assessment.</p></div></div>
      <label>Lab name<input required value={form.lab_name} onChange={(e) => update("lab_name", e.target.value)} placeholder="e.g. Python fundamentals" /></label>
      <label>Your name<input required value={form.created_by} onChange={(e) => update("created_by", e.target.value)} placeholder="Teacher name" /></label>
      <div className="two-col"><label>Language<select required value={form.language} onChange={(e) => update("language", e.target.value)}><option value="">Choose language</option>{languages.map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select></label>
      <label>Session type<select required value={form.session_type} onChange={(e) => update("session_type", e.target.value)}><option value="">Choose mode</option><option value="practice">Practice / class</option><option value="test">Test / exam</option></select></label></div>
      {test && <><label>Time limit (minutes)<input required type="number" min="1" value={form.test_time_limit} onChange={(e) => update("test_time_limit", e.target.value)} placeholder="60" /></label>
      <label>Questions<textarea required value={form.question_statements} onChange={(e) => update("question_statements", e.target.value)} placeholder={"Write questions here. Separate questions with ---"} /></label></>}
      <label>Room password<input required type="password" value={form.password} onChange={(e) => update("password", e.target.value)} placeholder="Choose a secure password" /></label>
      {error && <div className="error">{error}</div>}<button className="primary full" type="submit">Create room →</button>
    </form>
  </main>{result && <Modal onClose={() => setResult(null)}><div className="success-icon">✓</div><h2>Room created!</h2><p>Share this room ID with your students.</p><code>{result.id}</code><button className="primary full" onClick={() => navigate("admin", result)}>Open teacher dashboard</button><button className="secondary full" onClick={() => navigate("lab", { id: result.id, name: result.created_by, role: "teacher", lab_name: result.lab_name, session_type: result.session_type })}>Enter live room</button></Modal>}</Shell>;
}

function JoinRoom({ navigate }) {
  const [room, setRoom] = useState(""); const [name, setName] = useState(""); const [password, setPassword] = useState(""); const [error, setError] = useState("");
  async function join(event) { event.preventDefault(); setError(""); try { const data = await request(`/rooms/${room}/join/`, { method: "POST", body: JSON.stringify({ password }) }); navigate("lab", { id: room, name, access_token: data.access_token }); } catch (err) { setError(err.message); } }
  return <Shell onHome={() => navigate("home")}><main className="form-page join-page"><div className="join-banner"><span className="eyebrow">STUDENT WORKSPACE</span><h1>Your ideas<br /><strong>belong here.</strong></h1><p>Enter your room details to join the live coding lab.</p><div className="floating-code">function learn() {`{`}<br />&nbsp;&nbsp;return "keep building";<br />{`}`}</div></div><form className="card-form" onSubmit={join}><button type="button" className="back" onClick={() => navigate("home")}>← Back home</button><div className="form-heading"><span className="round-icon">↗</span><div><div className="eyebrow dark">WELCOME BACK</div><h2>Join a coding room</h2><p>Ask your teacher for the room ID and password.</p></div></div><label>Room ID<input required value={room} onChange={(e) => setRoom(e.target.value.trim())} placeholder="Paste room ID" /></label><label>Your name<input required value={name} onChange={(e) => setName(e.target.value)} placeholder="Student name" /></label><label>Room password<input required type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Room password" /></label>{error && <div className="error">{error}</div>}<button className="primary full">Join room →</button></form></main></Shell>;
}

function ProctoringPanel({ room, studentId, teacher = false }) {
  const [camera, setCamera] = useState(false);
  const [tabAlerts, setTabAlerts] = useState(0);
  const [cameraError, setCameraError] = useState("");
  const [callState, setCallState] = useState("Connecting video room...");
  const videoRef = useMemo(() => ({ current: null }), []);
  const remoteVideoRef = useMemo(() => ({ current: null }), []);
  const peerConnections = useMemo(() => new Map(), []);
  const socketRef = useMemo(() => ({ current: null }), []);
  const peerId = useMemo(() => `${teacher ? "teacher" : "student"}-${crypto.randomUUID()}`, [teacher]);
  useEffect(() => {
    const onVisibility = () => {
      if (document.hidden) setTabAlerts((count) => count + 1);
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);
  useEffect(() => {
    if (!camera || !navigator.mediaDevices?.getUserMedia) return undefined;
    let stream;
    navigator.mediaDevices.getUserMedia({ video: true, audio: true }).then((value) => {
      stream = value;
      if (videoRef.current) videoRef.current.srcObject = stream;
      peerConnections.forEach(async (peer, remoteId) => {
        value.getTracks().forEach((track) => peer.addTrack(track, value));
        if (socketRef.current?.readyState === WebSocket.OPEN) {
          const offer = await peer.createOffer();
          await peer.setLocalDescription(offer);
          socketRef.current.send(JSON.stringify({ type: "signal", from: peerId, to: remoteId, signalType: "offer", description: peer.localDescription }));
        }
      });
    }).catch(() => setCameraError("Camera or microphone permission was denied."));
    return () => stream?.getTracks().forEach((track) => track.stop());
  }, [camera, peerConnections, videoRef]);
  useEffect(() => {
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const apiHost = new URL(API).host;
    const socket = new WebSocket(`${protocol}//${apiHost}/ws/rooms/${room.id}/?token=${encodeURIComponent(room.access_token || "")}`);
    socketRef.current = socket;
    socket.onopen = () => {
      setCallState("Video room connected");
      socket.send(JSON.stringify({ type: "join", peerId, role: teacher ? "teacher" : "student" }));
    };
    socket.onclose = () => setCallState("Video room reconnecting...");
    socket.onerror = () => setCallState("Video signaling unavailable");
    socket.onmessage = async (event) => {
      const message = JSON.parse(event.data);
      if (message.type === "peer-joined" && message.peerId !== peerId) {
        if (peerId < message.peerId) await createPeer(message.peerId, true);
      }
      if (message.type === "signal" && message.to === peerId) {
        const peer = peerConnections.get(message.from) || await createPeer(message.from, false);
        if (message.signalType === "offer") {
          await peer.setRemoteDescription(message.description);
          const answer = await peer.createAnswer();
          await peer.setLocalDescription(answer);
          socket.send(JSON.stringify({ type: "signal", from: peerId, to: message.from, signalType: "answer", description: peer.localDescription }));
        } else if (message.signalType === "answer") {
          await peer.setRemoteDescription(message.description);
        } else if (message.signalType === "candidate") {
          await peer.addIceCandidate(message.candidate);
        }
      }
    };
    async function createPeer(remoteId, initiator) {
      if (peerConnections.has(remoteId)) return peerConnections.get(remoteId);
      const peer = new RTCPeerConnection({ iceServers: [{ urls: "stun:stun.l.google.com:19302" }] });
      peerConnections.set(remoteId, peer);
      peer.ontrack = (event) => {
        if (remoteVideoRef.current) remoteVideoRef.current.srcObject = event.streams[0];
        setCallState("Live video connected");
      };
      peer.onicecandidate = (event) => {
        if (event.candidate && socket.readyState === WebSocket.OPEN) {
          socket.send(JSON.stringify({ type: "signal", from: peerId, to: remoteId, signalType: "candidate", candidate: event.candidate }));
        }
      };
      if (videoRef.current?.srcObject) {
        videoRef.current.srcObject.getTracks().forEach((track) => peer.addTrack(track, videoRef.current.srcObject));
      }
      if (initiator) {
        const offer = await peer.createOffer();
        await peer.setLocalDescription(offer);
        socket.send(JSON.stringify({ type: "signal", from: peerId, to: remoteId, signalType: "offer", description: peer.localDescription }));
      }
      return peer;
    }
    return () => {
      peerConnections.forEach((peer) => peer.close());
      socket.close();
    };
  }, [peerConnections, peerId, remoteVideoRef, room.id, socketRef, teacher, videoRef]);
  useEffect(() => {
    if (teacher) return undefined;
    const timer = setInterval(async () => {
      if (!videoRef.current || videoRef.current.readyState < 2) return;
      const canvas = document.createElement("canvas");
      canvas.width = videoRef.current.videoWidth;
      canvas.height = videoRef.current.videoHeight;
      if (!canvas.width || !canvas.height) return;
      canvas.getContext("2d").drawImage(videoRef.current, 0, 0);
      const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.72));
      if (!blob) return;
      const body = new FormData();
      body.append("image", blob, `${Date.now()}.jpg`);
      body.append("student_id", studentId);
      body.append("event_type", "snapshot");
      fetch(`${API}/rooms/${room.id}/snapshots/`, { method: "POST", headers: { "X-Room-Token": room.access_token || "" }, body }).catch(() => {});
    }, 5000);
    return () => clearInterval(timer);
  }, [room.id, studentId, teacher, videoRef]);
  return <section className="proctor-panel"><div className="proctor-head"><b>🛡 Exam integrity</b><span className="proctor-live">● Monitoring</span></div><div className="proctor-tools"><button className={camera ? "tool active" : "tool"} onClick={() => setCamera((value) => !value)}>◉ {camera ? "Camera on" : "Start camera"}</button><span className={tabAlerts ? "cheat-alert" : "tool"}>⇧ Tab switches: {tabAlerts}</span><span className="tool">⏱ Snapshots: every 5 sec</span><span className="tool">◉ {callState}</span></div><div className="video-row">{camera && <video ref={(node) => { videoRef.current = node; }} className="camera-preview" autoPlay muted playsInline />}<video ref={(node) => { remoteVideoRef.current = node; }} className="camera-preview remote-video" autoPlay playsInline /></div>{cameraError && <small className="error">{cameraError}</small>}</section>;
}

function Lab({ navigate, room }) {
  const [code, setCode] = useState("# Write your solution here\n\ndef main():\n    print('Hello, Educode!')\n\nmain()");
  const [question, setQuestion] = useState(""); const [message, setMessage] = useState("");
  const roomToken = room.access_token || "";
  useEffect(() => { request(`/rooms/${room.id}/random_question/`, { roomToken }).then((data) => setQuestion(data.question)).catch(() => {}); }, [room.id, roomToken]);
  async function submit() { setMessage(""); try { await request("/submissions/", { method: "POST", roomToken, body: JSON.stringify({ room: room.id, username: room.name, code }) }); setMessage("Submission saved successfully."); } catch (err) { setMessage(err.message); } }
  return <Shell onHome={() => navigate("home")}><div className="lab"><header className="labbar"><button className="brand light" onClick={() => navigate("home")}><span className="brand-mark">&lt;/&gt;</span> EDUCODE</button><span className="room-title">{room.name || room.created_by || "Student"} · <b>Live lab</b></span><button className="outline" onClick={() => navigate("home")}>Leave room</button></header><ProctoringPanel room={room} studentId={room.name || room.created_by} teacher={room.role === "teacher"} /><div className="lab-grid"><aside className="question-panel"><span className="eyebrow dark">CURRENT CHALLENGE</span><h2>{question || "Practice mode"}</h2><p>{question ? "Read the problem carefully, then write and test your solution." : "Use the editor to practice. Your teacher can see your submission."}</p><div className="timer-card">◷ <span>Session active</span></div></aside><section className="editor-panel"><div className="editor-head"><span><i className="live-dot" /> {room.name || room.created_by || "Coding room"}</span><select><option>Python</option><option>JavaScript</option><option>C++</option></select></div><textarea className="code-editor" value={code} onChange={(e) => setCode(e.target.value)} spellCheck="false" /><div className="editor-actions"><button className="primary" onClick={submit}>Submit code</button></div>{message && <div className="notice">{message}</div>}</section></div></div></Shell>;
}

function Admin({ navigate, room }) {
  const [submissions, setSubmissions] = useState([]); const [snapshots, setSnapshots] = useState([]); const [questions, setQuestions] = useState(room.question_statements || []); const [question, setQuestion] = useState(""); const [notice, setNotice] = useState(""); const [selectedSubmission, setSelectedSubmission] = useState(null); const [selectedQuestion, setSelectedQuestion] = useState(room.question_statements?.[0] || ""); const [review, setReview] = useState(null); const [reviewLoading, setReviewLoading] = useState(false); const [finalMarks, setFinalMarks] = useState("");
  const roomToken = room.access_token || "";
  const refresh = () => request(`/submissions/?room=${room.id}`, { roomToken }).then((data) => setSubmissions(data.results || data)).catch(() => {});
  const refreshSnapshots = () => request(`/rooms/${room.id}/snapshots/`, { roomToken }).then((data) => setSnapshots(data.snapshots || [])).catch(() => {});
  useEffect(() => { refresh(); refreshSnapshots(); const timer = setInterval(refreshSnapshots, 5000); return () => clearInterval(timer); }, [room.id, roomToken]);
  async function addQuestion() { if (!question.trim()) return; try { const data = await request(`/rooms/${room.id}/`, { method: "PATCH", roomToken, body: JSON.stringify({ question_statements: [question.trim()] }) }); setQuestions(data.question_statements || [...questions, question.trim()]); setQuestion(""); setNotice("Question added."); } catch (err) { setNotice(err.message); } }
  async function reviewCode() {
    if (!selectedSubmission || !selectedQuestion) return;
    setReviewLoading(true); setReview("");
    try {
      const data = await request("/ai/evaluate/", { method: "POST", body: JSON.stringify({ language: "python", question: selectedQuestion, code: selectedSubmission.code }) });
      const findings = (data.findings || []).map((finding) => `• ${finding.title}: ${finding.detail}`).join("\n");
      setReview({ ...data, findingsText: findings });
      setFinalMarks(String(data.marks));
    } catch (err) { setReview({ provider: "Evaluation error", feedback: err.message }); } finally { setReviewLoading(false); }
  }
  async function saveFinalMarks() {
    const marks = Number(finalMarks);
    if (!selectedSubmission || !Number.isInteger(marks) || marks < 0 || marks > 100) {
      setNotice("Final marks must be a whole number from 0 to 100.");
      return;
    }
    try {
      const saved = await request(`/submissions/${selectedSubmission.id}/`, { method: "PATCH", roomToken, body: JSON.stringify({ marks }) });
      setSelectedSubmission(saved);
      setSubmissions((items) => items.map((item) => item.id === saved.id ? saved : item));
      setNotice("Teacher's final marks saved.");
    } catch (err) { setNotice(err.message); }
  }
  async function downloadReport() {
    if (!selectedSubmission) return;
    const params = new URLSearchParams({
      question: selectedQuestion,
      ai_marks: String(review?.marks ?? ""),
      provider: review?.provider ?? "",
      feedback: review?.feedback ?? "",
    });
    try {
      const response = await fetch(`${API}/submissions/${selectedSubmission.id}/report/?${params}`, { headers: { "X-Room-Token": roomToken } });
      if (!response.ok) throw new Error("Could not create the PDF report.");
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `educode-${selectedSubmission.username}-evaluation.pdf`;
      link.click();
      URL.revokeObjectURL(url);
    } catch (err) { setNotice(err.message); }
  }
  return <Shell onHome={() => navigate("home")}><div className="dashboard"><header className="dash-head"><div><div className="eyebrow dark">TEACHER CONSOLE</div><h1>{room.lab_name || "Your coding room"}</h1><p>Manage your session, questions and student work.</p></div><div><button className="primary" onClick={() => navigate("lab", { ...room, role: "teacher" })}>Enter live room</button> <button className="outline dark-outline" onClick={() => navigate("home")}>Close room</button></div></header><div className="stats"><div><span>ROOM ID</span><strong>{room.id}</strong></div><div><span>MODE</span><strong>{room.session_type || "Practice"}</strong></div><div><span>LANGUAGE</span><strong>{languages.find(([id]) => id === room.language)?.[1] || "Python"}</strong></div><div><span>STATUS</span><strong className="green">● Live</strong></div></div><div className="dash-grid"><section className="dashboard-card"><div className="card-title"><h2>Student submissions</h2><button className="text-button" onClick={refresh}>Refresh ↻</button></div>{submissions.length ? submissions.map((item) => <div className="submission" key={item.id}><span className="student-avatar">{item.username?.[0]?.toUpperCase()}</span><div><b>{item.username}</b><small>Last active {new Date(item.last_active).toLocaleTimeString()} · Final: {item.marks}/100</small></div><button className="text-button" onClick={() => { setSelectedSubmission(item); setSelectedQuestion(questions[0] || ""); setReview(null); setFinalMarks(String(item.marks ?? "")); }}>View code & AI review</button></div>) : <div className="empty">No submissions yet. Students will appear here when they submit.</div>}</section><section className="dashboard-card"><div className="card-title"><h2>Proctoring feed</h2><button className="text-button" onClick={refreshSnapshots}>Refresh ↻</button></div><div className="snapshot-grid">{snapshots.length ? snapshots.slice(0, 12).map((item) => <figure key={item.id}><img src={`${API.replace("/api", "")}${item.path}`} alt="Student snapshot" /><figcaption>{item.student_id} · {new Date(item.captured_at).toLocaleTimeString()}</figcaption></figure>) : <div className="empty">Snapshots will appear every 5 seconds when a student camera is active.</div>}</div></section><section className="dashboard-card"><div className="card-title"><h2>Question bank</h2><span className="count">+ Add</span></div>{questions.map((item, index) => <div className="question-item" key={`${item}-${index}`}>{item}</div>)}<textarea className="question-add" value={question} onChange={(e) => setQuestion(e.target.value)} placeholder="Add a question for students..." /><button className="primary full" onClick={addQuestion}>Add question</button>{notice && <div className="notice">{notice}</div>}</section></div></div>{selectedSubmission && <Modal onClose={() => setSelectedSubmission(null)}><div className="eyebrow dark">SUBMISSION REVIEW</div><h2>{selectedSubmission.username}'s code</h2><pre className="submission-code">{selectedSubmission.code}</pre><label>Question used for grading<select value={selectedQuestion} onChange={(e) => setSelectedQuestion(e.target.value)}>{questions.map((item, index) => <option key={`${item}-${index}`} value={item}>{item}</option>)}</select></label><button className="ai-button review-button" onClick={reviewCode}>✦ {reviewLoading ? "Evaluating..." : "Evaluate code against this question"}</button>{review && typeof review === "object" && <div className="ai-result review-result"><b>✦ {review.provider} {review.ai_used ? "(AI active)" : review.provider === "Evaluation error" ? "" : "(local fallback)"}</b><p>{review.marks !== undefined && <><strong>AI score: {review.marks}/{review.max_marks}</strong><br /></>}{review.warning && <>{review.warning}<br /></>}{review.feedback}</p>{review.breakdown?.map((item, index) => <p key={`${item.criterion}-${index}`}><strong>{item.criterion}: {item.marks}/{item.max_marks}</strong> — {item.reason}</p>)}{review.findingsText && <p>{review.findingsText}</p>}{review.marks !== undefined && <><label>Teacher final marks<input type="number" min="0" max="100" step="1" value={finalMarks} onChange={(e) => setFinalMarks(e.target.value)} /></label><div className="review-actions"><button className="primary" onClick={saveFinalMarks}>Save teacher's final marks</button><button className="secondary" onClick={downloadReport}>Download PDF report</button></div></>}</div>}</Modal>}</Shell>;
}

function Modal({ children, onClose }) { return <div className="modal-backdrop" onClick={onClose}><div className="modal" onClick={(e) => e.stopPropagation()}><button className="modal-close" onClick={onClose}>×</button>{children}</div></div>; }

function App() {
  const [page, setPage] = useState("home"); const [context, setContext] = useState({});
  const navigate = (next, data = {}) => { setPage(next); setContext(data); window.scrollTo(0, 0); };
  return page === "create" ? <CreateRoom navigate={navigate} /> : page === "join" ? <JoinRoom navigate={navigate} /> : page === "lab" ? <Lab navigate={navigate} room={context} /> : page === "admin" ? <Admin navigate={navigate} room={context} /> : <Landing navigate={navigate} />;
}

createRoot(document.getElementById("root")).render(<StrictMode><App /></StrictMode>);
