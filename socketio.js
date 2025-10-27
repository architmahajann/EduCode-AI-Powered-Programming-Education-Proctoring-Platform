var usernames = {};
var rooms = [];
var roomAd = {};
var inactiveUsers = {}; // Store inactive/disconnected users by room
var adminBroadcast = {}; // Track admin broadcast state by roomId
// New: Track admin socket and AV broadcast state per room
const adminSockets = {}; // roomId -> admin socket id
const adminAVActive = {}; // roomId -> boolean

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
      socket.isAdmin = true; // Mark this socket as admin
      // Track this admin socket for signaling
      adminSockets[roomId] = socket.id;
      
      // Notify all students in the room that admin has joined
      io.to(roomId).emit('admin-joined', { roomId, timestamp: new Date() });
      
      // Send current user list to admin when they first join
      updateuser(roomId);
      
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

    // ========== WEBRTC SIGNALING ==========
    // Admin sends offer to a specific viewer
    socket.on('webrtc-offer', ({ targetSocketId, sdp }) => {
      if (!targetSocketId || !sdp) return;
      io.to(targetSocketId).emit('webrtc-offer', { from: socket.id, sdp });
    });
    // Viewer sends answer back to admin
    socket.on('webrtc-answer', ({ targetSocketId, sdp }) => {
      if (!targetSocketId || !sdp) return;
      io.to(targetSocketId).emit('webrtc-answer', { from: socket.id, sdp });
    });
    // ICE candidates both directions
    socket.on('webrtc-ice-candidate', ({ targetSocketId, candidate }) => {
      if (!targetSocketId || !candidate) return;
      io.to(targetSocketId).emit('webrtc-ice-candidate', { from: socket.id, candidate });
    });
  });
};
