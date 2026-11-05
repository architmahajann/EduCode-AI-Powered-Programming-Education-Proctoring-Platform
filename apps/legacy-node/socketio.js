var usernames = {};
var rooms = [];
var roomAd = {};
var inactiveUsers = {}; // Store inactive/disconnected users by room
var adminBroadcast = {}; // Track admin broadcast state by roomId
// New: Track admin socket and AV broadcast state per room
const adminSockets = {}; // roomId -> admin socket id
const adminAVActive = {}; // roomId -> boolean
// Class chat messages per room (in-memory, ephemeral)
const classChatMessages = {}; // roomId -> [{sender, text, ts}]

// --- Student to Admin Video Sharing ---
const studentsSharingVideo = {}; // { roomId: Set(studentId) }
const studentSocketMap = {}; // { studentId: socketId }
const roomStudentSockets = {}; // { roomId: { studentId: socketId } }
// ------------------------------------

module.exports.sock = (server) => {
  const socket = require('socket.io');
  const User = require('./Model/userModel');
  const options = {
    maxHttpBufferSize: 5e7,  // max http buffer size is 50mb
  };  // instance of socket io is created
  const io = socket(server, options);
  io.sockets.on('connection', (socket) => {
    function updateuser(roomId) {
      let x = roomAd[roomId];
      let arr = [];
      if (x !== undefined) {
        x.forEach((ele) => {
          arr.push(usernames[ele]);
        });

        // Also send inactive users for this room
        const inactive = inactiveUsers[roomId] || [];
        io.emit('update', arr, roomId, inactive);
      }
    }   
    // EVENT HANDLERS
    socket.on('change-user', (username) => {
      function getKeyByValue(object, value) {
        return Object.keys(object).find((key) => object[key] === value);
      }
      let socketid = getKeyByValue(usernames, username);

      io.sockets.in(socketid).emit('personal-ide', username);
      
      // Notify the specific student that admin is viewing them
      if (socketid) {
        io.to(socketid).emit('admin-viewing-you', { username, timestamp: new Date() });
      }
    });
    
    // New event: Admin opened grading/submissions page
    socket.on('admin-viewing-submissions', (roomId) => {
      io.to(roomId).emit('admin-grading', { roomId, timestamp: new Date() });
    });
    socket.on('getidedata', function (text, user) {
      io.emit('adminsideide', text, user);
    });
    socket.on('delete-room', (roomId) => {
      rooms = rooms.filter((ele) => ele === roomId);
      io.emit('delete-roomadmin', roomId);
    });

    socket.on('createroom', (roomId, username) => {
      socket.username = username;
      socket.room = roomId;
      usernames[socket.id] = username;
      socket.join(roomId);
      if (!rooms.find((ele) => ele === roomId)) {
        rooms.push(roomId);
        roomAd[roomId] = [socket.id];
      } else {
        roomAd[roomId].push(socket.id);
      }
      updateuser(roomId);

      // Notify students that admin has joined (if this is admin)
      // We'll check this in admin.js instead

      socket.on('page-visibility-change', (data) => {
        const username = usernames[socket.id];
        const roomId = socket.room;
    
        let action;
        if (data.state === 'hidden') {
          action = 'switched the Window/Tab';
        } else {
          action = 'is back on Page';
        }
    
        // Log the visibility change or notify admin
        console.log(`User ${username} in room ${roomId} ${action}`);

        io.emit('visibility-change', { username, roomId, action });
      });

      // If admin broadcasting is enabled for this room, request a fresh full code from admin for late joiners
      if (adminBroadcast[roomId]?.enabled) {
        io.to(roomId + '-admin').emit('admin-send-full-code', { roomId });
      }

      // If admin AV broadcast is active, notify this newly joined viewer
      if (adminAVActive[roomId]) {
        // Notify only the newly joined socket
        io.to(socket.id).emit('admin-av-started', { roomId });
      }

      // Send initial chat history (if any)
      if (classChatMessages[roomId]) {
        io.to(socket.id).emit('class-chat-init', { messages: classChatMessages[roomId] });
      }

      // --- Student to Admin Video Sharing ---
      // Map student username to their socket ID for easy lookup
      if (!socket.isAdmin) {
          studentSocketMap[username] = socket.id;
          if (!roomStudentSockets[roomId]) roomStudentSockets[roomId] = {};
          roomStudentSockets[roomId][username] = socket.id;
      }
      // ------------------------------------
    });

    // Student sends code changes to admin
    socket.on('userdochange', async (changeData, username) => {
      io.emit('userdochangeToadmin', changeData, username);
      
      // Save code changes to database for persistence
      try {
        const roomId = socket.room;
        if (roomId && username) {
          // Get current code from editor (this is just the change, need full code)
          // We'll update this when we get the full code
          await User.findOneAndUpdate(
            { roomId, username },
            { 
              roomId, 
              username,
              lastActive: new Date()
            },
            { upsert: true, new: true }
          );
        }
      } catch (error) {
        console.error('Error saving user activity:', error);
      }
    });

    // Admin sends code changes to specific student
    socket.on('admindatachang', (username, changeObj) => {
      io.emit('adminsidedata', username, changeObj);
    });

    // Admin toggles broadcasting their editor to all students
    socket.on('admin-broadcast-toggle', ({ roomId, enabled }) => {
      if (!roomId) return;
      if (!adminBroadcast[roomId]) adminBroadcast[roomId] = { enabled: false };
      adminBroadcast[roomId].enabled = !!enabled;
    });

    // Admin sends a full snapshot of their editor to all students in room
    socket.on('admin-broadcast-full', ({ roomId, code }) => {
      if (!roomId) return;
      io.to(roomId).emit('admin-live-code-full', { code });
    });

    // Admin incremental change to all students
    socket.on('admin-broadcast-change', ({ roomId, changeObj }) => {
      if (!roomId || !changeObj) return;
      io.to(roomId).emit('admin-live-code-change', { changeObj });
    });

    // Admin sets/changes the allotted question for the room
    socket.on('admin-set-allotted-question', ({ roomId, question }) => {
      if (!roomId || !question) return;
      io.to(roomId).emit('allotted-question-updated', { question });
    });

    // Admin sets/changes multiple allotted questions for the room
    socket.on('admin-set-allotted-questions', ({ roomId, questions }) => {
      if (!roomId || !Array.isArray(questions)) return;
      io.to(roomId).emit('allotted-questions-updated', { questions });
    });

    // Save full code to database (new event)
    socket.on('save-code', async (username, code) => {
      try {
        const roomId = socket.room;
        if (roomId && username && code !== undefined) {
          await User.findOneAndUpdate(
            { roomId, username },
            { 
              roomId, 
              username,
              code,
              lastActive: new Date()
            },
            { upsert: true, new: true }
          );
          console.log(`Saved code for ${username} in room ${roomId}`);
        }
      } catch (error) {
        console.error('Error saving code:', error);
      }
    });

    // Admin requests to view a specific student (including inactive)
    socket.on('change-user-inactive', async (username, roomId) => {
      try {
        // Find the saved code for this inactive user
        const user = await User.findOne({ roomId, username });
        if (user && user.code) {
          socket.emit('inactive-user-code', user.code, username);
          console.log(`Retrieved code for inactive user ${username}`);
        } else {
          socket.emit('inactive-user-code', '', username);
        }
      } catch (error) {
        console.error('Error retrieving inactive user code:', error);
      }
    });

    // Admin requests to view a specific student
    socket.on('admin-page', async (roomId) => {
      socket.join(roomId + '-admin');
      // Also join the main room so admin receives room-wide events (chat, AV, allotted questions)
      try { socket.join(roomId); } catch (e) { console.warn('Admin failed to join main room', roomId, e); }
      socket.isAdmin = true; // Mark this socket as admin
      socket.room = roomId; // Track room on admin socket for downstream handlers
      // Track this admin socket for signaling
      adminSockets[roomId] = socket.id;
      // Ensure admin has a username mapping for chat; fallback label 'Admin'
      if (!usernames[socket.id]) {
        usernames[socket.id] = 'Admin';
      }
      
      // Notify all students in the room that admin has joined
      io.to(roomId).emit('admin-joined', { roomId, timestamp: new Date() });
      
      // Send current user list to admin when they first join
      updateuser(roomId);

      // Send initial sharing state (may be empty) so UI can render Request Camera buttons immediately
      const initialSharing = studentsSharingVideo[roomId] ? Array.from(studentsSharingVideo[roomId]) : [];
      io.to(socket.id).emit('update-sharing-students', initialSharing);

      // Proactively trigger WebRTC for any students already sharing when admin arrives late
      if (studentsSharingVideo[roomId] && studentsSharingVideo[roomId].size > 0) {
        console.log('[Server] Admin joined; auto-trigger start-webrtc-connection for currently sharing students', {
          roomId,
          adminSocketId: socket.id,
          sharing: Array.from(studentsSharingVideo[roomId])
        });
        const roomMap = roomStudentSockets[roomId] || {};
        Array.from(studentsSharingVideo[roomId]).forEach(studentId => {
          const targetSocketId = roomMap[studentId] || studentSocketMap[studentId];
          if (targetSocketId) {
            io.to(targetSocketId).emit('start-webrtc-connection', { adminSocketId: socket.id, auto: true });
          } else {
            console.warn('[Server] Could not find socket for sharing student during admin join', { roomId, studentId });
          }
        });
      }

      // Send existing chat history to admin
      if (classChatMessages[roomId]) {
        io.to(socket.id).emit('class-chat-init', { messages: classChatMessages[roomId] });
      }
      
      // Also try to load any existing students from database who might have left
      try {
        const existingUsers = await User.find({ roomId }).distinct('username');
        if (existingUsers && existingUsers.length > 0) {
          // Initialize inactive users list if not exists
          if (!inactiveUsers[roomId]) {
            inactiveUsers[roomId] = [];
          }
          
          // Get current active usernames for this room
          const activeUsernames = roomAd[roomId] ? roomAd[roomId].map(id => usernames[id]) : [];
          
          // Add users from database who are not currently active
          existingUsers.forEach(dbUsername => {
            if (!activeUsernames.includes(dbUsername) && !inactiveUsers[roomId].includes(dbUsername)) {
              inactiveUsers[roomId].push(dbUsername);
            }
          });
          
          // Update the list again with inactive users loaded from DB
          updateuser(roomId);
          console.log(`Admin joined room ${roomId}, loaded ${inactiveUsers[roomId].length} inactive users from database`);
        }
      } catch (error) {
        console.error('Error loading inactive users from database:', error);
      }
    });

    // Handle disconnection
    socket.on('disconnect', async () => {
      if (socket.room && usernames[socket.id]) {
        const roomId = socket.room;
        const username = usernames[socket.id];
        
        // --- Student to Admin Video Sharing ---
        // If a student who was sharing disconnects, clean up
        if (!socket.isAdmin) {
            delete studentSocketMap[username];
            if (studentsSharingVideo[roomId] && studentsSharingVideo[roomId].has(username)) {
                studentsSharingVideo[roomId].delete(username);
                // Notify admin
                const adminSocketId = adminSockets[roomId];
                if (adminSocketId) {
                    io.to(adminSocketId).emit('update-sharing-students', Array.from(studentsSharingVideo[roomId] || []));
                }
            }
          if (roomStudentSockets[roomId] && roomStudentSockets[roomId][username]) {
            delete roomStudentSockets[roomId][username];
          }
        }
        // ------------------------------------

        // If admin disconnects, notify students
        if (socket.isAdmin) {
          io.to(roomId).emit('admin-left', { roomId, timestamp: new Date() });
        }
        
        // Initialize inactive users array for this room if not exists
        if (!inactiveUsers[roomId]) {
          inactiveUsers[roomId] = [];
        }
        
        // Add to inactive users list if not already there (only for students, not admin)
        if (!socket.isAdmin && !inactiveUsers[roomId].includes(username)) {
          inactiveUsers[roomId].push(username);
        }
        
        // Remove user from active room
        if (roomAd[roomId]) {
          roomAd[roomId] = roomAd[roomId].filter(id => id !== socket.id);
        }
        
        // Remove username from active users
        delete usernames[socket.id];
        
        // Update user list (now includes inactive users)
        updateuser(roomId);
        
        console.log(`User ${username} disconnected from room ${roomId}${socket.isAdmin ? ' (Admin)' : ' and moved to inactive list'}`);
      }

      // If an admin disconnects, end AV broadcast implicitly
      if (socket.isAdmin) {
        const roomId = Object.keys(adminSockets).find(r => adminSockets[r] === socket.id);
        if (roomId) {
          delete adminSockets[roomId];
          if (adminAVActive[roomId]) {
            adminAVActive[roomId] = false;
            io.to(roomId).emit('admin-av-stopped', { roomId });
          }
        }
      }
    });

    // ========== AV BROADCAST: START/STOP ==========
    socket.on('admin-broadcast-av-started', ({ roomId }) => {
      if (!socket.isAdmin || !roomId) return;
      adminAVActive[roomId] = true;
      io.to(roomId).emit('admin-av-started', { roomId });
    });

    socket.on('admin-broadcast-av-stopped', ({ roomId }) => {
      if (!socket.isAdmin || !roomId) return;
      adminAVActive[roomId] = false;
      io.to(roomId).emit('admin-av-stopped', { roomId });
    });

    // Student indicates they are ready to receive admin stream
    socket.on('viewer-ready', ({ roomId, username }) => {
      if (!roomId) return;
      const adminSocketId = adminSockets[roomId];
      if (adminSocketId) {
        io.to(adminSocketId).emit('viewer-ready', { viewerSocketId: socket.id, username });
      }
    });

    // ========== LEGACY BROADCAST SIGNALING (REMOVED) ==========
    // (Replaced by unified handlers below; keeping comment for clarity.)

    // ========== STUDENT to ADMIN VIDEO ==========

    // 1. Student starts sharing their camera
    socket.on('student-wants-to-share', ({ studentId, roomId }) => {
      console.log('[Server] student-wants-to-share received', { studentId, roomId, socketId: socket.id });
        if (!studentsSharingVideo[roomId]) {
            studentsSharingVideo[roomId] = new Set();
        }
        studentsSharingVideo[roomId].add(studentId);

        // Notify the admin of this room
        const adminSocketId = adminSockets[roomId];
        if (adminSocketId) {
            io.to(adminSocketId).emit('update-sharing-students', Array.from(studentsSharingVideo[roomId]));
        // Auto-start WebRTC connection so admin does not need to click Watch
        console.log('[Server] auto start-webrtc-connection', { studentId, adminSocketId });
        io.to(socket.id).emit('start-webrtc-connection', { adminSocketId, auto: true });
        }
    });

    // 2. Student stops sharing
    socket.on('student-stopped-sharing', ({ studentId }) => {
        const roomId = socket.room;
      console.log('[Server] student-stopped-sharing', { studentId, roomId });
        if (roomId && studentsSharingVideo[roomId] && studentsSharingVideo[roomId].has(studentId)) {
            studentsSharingVideo[roomId].delete(studentId);
            // Notify the admin
            const adminSocketId = adminSockets[roomId];
            if (adminSocketId) {
                io.to(adminSocketId).emit('update-sharing-students', Array.from(studentsSharingVideo[roomId]));
            }
        }
    });
    
    // Admin requests to refresh user list (used after updating sharing status)
    socket.on('admin-page-refresh-users', ({ roomId, active, inactive }) => {
        io.to(socket.id).emit('update', active, roomId, inactive);
    });

    // 3. Admin requests to watch a specific student
    socket.on('admin-requests-video', ({ studentId }) => {
      const adminSocketId = socket.id;
      const roomId = socket.room || Object.keys(adminSockets).find(r => adminSockets[r] === adminSocketId);
      const directId = studentSocketMap[studentId];
      const roomScopedId = roomId && roomStudentSockets[roomId] ? roomStudentSockets[roomId][studentId] : undefined;
      const targetSocketId = roomScopedId || directId;
      console.log('[Server] admin-requests-video', { studentId, roomId, directId, roomScopedId, targetSocketId, adminSocketId });
      if (targetSocketId) {
        io.to(targetSocketId).emit('start-webrtc-connection', { adminSocketId });
        io.to(adminSocketId).emit('admin-requests-video-ack', { studentId, delivered: true });
      } else {
        console.warn('[Server] admin-requests-video: student socket not found', { studentId, roomId });
        io.to(adminSocketId).emit('admin-requests-video-ack', { studentId, delivered: false, reason: 'Student not connected' });
        io.to(adminSocketId).emit('student-video-error', `Student '${studentId}' socket not found (maybe disconnected).`);
      }
    });

    // Admin requests student to turn on camera (proactive request)
    socket.on('admin-request-camera', ({ studentId }) => {
      const roomId = socket.room || Object.keys(adminSockets).find(r => adminSockets[r] === socket.id);
      const directId = studentSocketMap[studentId];
      const roomScopedId = roomId && roomStudentSockets[roomId] ? roomStudentSockets[roomId][studentId] : undefined;
      const targetSocketId = roomScopedId || directId;
      console.log('[Server] admin-request-camera', { studentId, roomId, directId, roomScopedId, targetSocketId, fromAdmin: usernames[socket.id] });
      if (targetSocketId) {
        io.to(targetSocketId).emit('admin-camera-request', { fromAdmin: usernames[socket.id] });
        io.to(socket.id).emit('admin-request-camera-ack', { studentId, delivered: true });
      } else {
        if (roomId) {
          console.warn('[Server] Camera request fallback broadcast', { studentId, roomId });
          io.to(roomId).emit('admin-camera-request', { fromAdmin: usernames[socket.id], target: studentId });
        }
        io.to(socket.id).emit('admin-request-camera-ack', { studentId, delivered: false, reason: 'Student socket not found' });
      }
    });

    // Student responds to camera request
    socket.on('student-camera-response', ({ studentId, accepted }) => {
      const adminSocketId = adminSockets[socket.room];
      console.log('[Server] student-camera-response', { studentId, accepted, toAdmin: adminSocketId });
      if (adminSocketId) {
        io.to(adminSocketId).emit('student-camera-response', { studentId, accepted });
      }
    });

    // 4. Relay student's offer to the admin (unified)
    socket.on('webrtc-offer', ({ targetSocketId, sdp }) => {
      if (!targetSocketId || !sdp) return;
      const targetIsAdmin = Object.values(adminSockets).includes(targetSocketId);
      if (targetIsAdmin) {
        console.log('[Server] Student->Admin offer', { fromUser: usernames[socket.id], toAdminSocket: targetSocketId });
        io.to(targetSocketId).emit('webrtc-offer-admin', { from: usernames[socket.id], sdp });
      } else {
        console.log('[Server] Admin broadcast offer', { fromAdminSocket: socket.id, toViewerSocket: targetSocketId });
        io.to(targetSocketId).emit('webrtc-offer', { from: socket.id, sdp });
      }
    });

    // 5. Relay admin's answer back to the student
    socket.on('webrtc-answer-admin', ({ studentId, sdp }) => {
      const roomId = socket.room;
      const roomScopedId = roomId && roomStudentSockets[roomId] ? roomStudentSockets[roomId][studentId] : undefined;
      const studentSocketId = roomScopedId || studentSocketMap[studentId];
      console.log('[Server] webrtc-answer-admin', { roomId, studentId, studentSocketId });
      if (studentSocketId) {
        io.to(studentSocketId).emit('webrtc-answer', { from: socket.id, sdp });
      } else {
        console.warn('[Server] webrtc-answer-admin: student socket not found', { roomId, studentId });
      }
    });

    // Relay student's answer back to admin for AV broadcast (missing earlier)
    socket.on('webrtc-answer', ({ targetSocketId, sdp }) => {
      if (!targetSocketId || !sdp) return;
      const isAdminTarget = Object.values(adminSockets).includes(targetSocketId);
      if (isAdminTarget) {
        console.log('[Server] Student->Admin answer relay', { fromStudentSocket: socket.id, toAdminSocket: targetSocketId });
        io.to(targetSocketId).emit('webrtc-answer', { from: socket.id, sdp });
      } else {
        // In case of any future reverse broadcast (admin viewing viewer), keep generic
        console.log('[Server] Non-admin answer relay (ignored currently)', { targetSocketId });
      }
    });

    // 6. Relay ICE candidates (student or admin)
    socket.on('webrtc-ice-candidate', ({ targetSocketId, candidate }) => {
      if (!targetSocketId || !candidate) return;
      const targetIsAdmin = Object.values(adminSockets).includes(targetSocketId);
      if (targetIsAdmin) {
        console.log('[Server] ICE student->admin', { fromUser: usernames[socket.id], toAdminSocket: targetSocketId });
        io.to(targetSocketId).emit('webrtc-ice-candidate-admin', { from: usernames[socket.id], candidate });
      } else {
        console.log('[Server] ICE admin->viewer', { fromAdminSocket: socket.id, toViewerSocket: targetSocketId });
        io.to(targetSocketId).emit('webrtc-ice-candidate', { from: socket.id, candidate });
      }
    });

    // 7. Relay ICE candidates (admin to student)
    socket.on('webrtc-ice-candidate-admin', ({ studentId, candidate }) => {
      const roomId = socket.room;
      const roomScopedId = roomId && roomStudentSockets[roomId] ? roomStudentSockets[roomId][studentId] : undefined;
      const studentSocketId = roomScopedId || studentSocketMap[studentId];
      console.log('[Server] ICE admin->student', { roomId, studentId, studentSocketId });
      if (studentSocketId) {
        io.to(studentSocketId).emit('webrtc-ice-candidate', { from: socket.id, candidate });
      } else {
        console.warn('[Server] ICE admin->student: student socket not found', { roomId, studentId });
      }
    });

    // 8. Admin closes the video view
    socket.on('admin-closed-video', ({ studentId }) => {
      const roomId = socket.room;
      const roomScopedId = roomId && roomStudentSockets[roomId] ? roomStudentSockets[roomId][studentId] : undefined;
      const studentSocketId = roomScopedId || studentSocketMap[studentId];
      if (studentSocketId) {
        io.to(studentSocketId).emit('admin-closed-connection');
      }
    });

    // ===== Class Chat Feature =====
    socket.on('class-chat-send', ({ roomId, text }) => {
      if (!roomId || typeof text !== 'string') return;
      const trimmed = text.trim();
      if (!trimmed) return;
      if (!classChatMessages[roomId]) classChatMessages[roomId] = [];
      const senderName = socket.isAdmin ? 'Admin' : (usernames[socket.id] || 'Unknown');
      const msg = { sender: senderName, text: trimmed.slice(0,500), ts: Date.now() };
      classChatMessages[roomId].push(msg);
      // limit history
      if (classChatMessages[roomId].length > 100) {
        classChatMessages[roomId] = classChatMessages[roomId].slice(-100);
      }
      // Emit to all participants in room (students) and admin room if admin didn't join main room (legacy)
      io.to(roomId).emit('class-chat-new', msg);
      const adminSocketId = adminSockets[roomId];
      if (adminSocketId) io.to(adminSocketId).emit('class-chat-new', msg);
    });
    // Request full history (optional refresh)
    socket.on('class-chat-history', ({ roomId }) => {
      if (roomId && classChatMessages[roomId]) {
        io.to(socket.id).emit('class-chat-init', { messages: classChatMessages[roomId] });
      }
    });
    // ==============================

  });
  // Expose lightweight helper so other modules (e.g., upload-image route) can emit snapshot events
  io.emitProctorSnapshot = (payload) => {
    try {
      io.emit('proctor-snapshot-added', payload);
    } catch (e) {
      console.warn('[Socket] emitProctorSnapshot failed', e.message);
    }
  };
  return io;
};
