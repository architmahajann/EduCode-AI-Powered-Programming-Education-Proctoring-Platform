// Make socket global so admin activity listeners can attach
window.socket = null;
let changeEvent = false; // Initialize to false so user changes are tracked
let reconnectAttempts = 0;
const MAX_RECONNECT_ATTEMPTS = 5;

try {
    window.socket = io({
        reconnection: true,
        reconnectionAttempts: MAX_RECONNECT_ATTEMPTS,
        timeout: 10000
    });
    // Also keep local reference for backwards compatibility
    var socket = window.socket;
} catch (error) {
    console.error('Failed to initialize socket:', error);
    tata.error('Connection Error', 'Failed to initialize socket connection', {
        animate: 'fade',
        position: 'tm'
    });
}

// Socket error handling
socket.on('connect_error', (error) => {
    console.error('Connection error:', error);
    reconnectAttempts++;
    if (reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
        tata.error('Connection Failed', 'Unable to connect to server after multiple attempts', {
            animate: 'fade',
            position: 'tm'
        });
    }
});

socket.on('disconnect', (reason) => {
    console.log('Disconnected:', reason);
    tata.warn('Connection Lost', 'Attempting to reconnect...', {
        animate: 'fade',
        position: 'tm'
    });
});

socket.on('reconnect', (attemptNumber) => {
    console.log('Reconnected after', attemptNumber, 'attempts');
    tata.success('Reconnected', 'Connection restored', {
        animate: 'fade',
        position: 'tm'
    });
    reconnectAttempts = 0;
});

// Editor Setup
const textinput = document.getElementById('code');

let mode;

// Determine editor mode based on language
if (typeof languageid !== 'undefined' && languageid) {
    try {
        const lang = JSON.parse(languageid);
        if (lang === 71) { // Python
            mode = 'python';
        } else if (lang === 62) { // Java
            mode = 'text/x-java';
        } else if (lang === 54 || lang === 49) { // C++ or C
            mode = 'text/x-c++src';
        } else {
            mode = 'text/x-c++src'; // Default
        }
    } catch (e) {
        console.error('Error parsing language:', e);
        mode = 'text/x-c++src';
    }
} else {
    mode = 'text/x-c++src';
}

// Initialize CodeMirror editor
const editor = CodeMirror.fromTextArea(textinput, {
    mode: mode,
    theme: 'dracula',
    lineNumbers: true,
    autoCloseBrackets: true,
    matchBrackets: true,
    indentUnit: 4,
    indentWithTabs: true,
    lineWrapping: true,
    foldGutter: true,
    gutters: ['CodeMirror-linenumbers', 'CodeMirror-foldgutter']
});

editor.setSize('100%', '100%');


// Handle changes from admin side
socket.on('adminsidedata', function (user, changeObj) {
  try {
    console.log('Received admin changes for:', user, 'Current user:', username);
    
    if (!editor || !changeObj) {
      console.error('Invalid editor or change object');
      return;
    }
    
    // Only apply changes if they're for this user
    if (username === user) {
      console.log('Applying admin changes to student editor');
      
      // Show teaching activity and notification
      if (typeof addAdminActivity === 'function') {
        addAdminActivity('✍️ Admin is making changes to your code', 'admin-teaching');
      }
      if (typeof setEditorVisualFeedback === 'function') {
        setEditorVisualFeedback(true, true);
      }
      
      // Show one-time notification
      if (!window.adminTeachingNotified) {
        if (typeof showAdminNotification === 'function') {
          showAdminNotification('Teaching Mode', 'Admin is editing your code', 'warn');
        }
        window.adminTeachingNotified = true;
        
        // Reset notification flag after 5 seconds
        setTimeout(() => {
          window.adminTeachingNotified = false;
        }, 5000);
      }
      
      // Temporarily set changeEvent to true to prevent echo
      changeEvent = true;
      
      if (!Array.isArray(changeObj.text)) {
        console.error('Invalid change object text:', changeObj);
        return;
      }
      
      editor.replaceRange(
        changeObj.text,
        changeObj.from,
        changeObj.to,
        'admin-change' // Use different origin to distinguish from user changes
      );
      
      // Reset changeEvent after a short delay
      setTimeout(() => {
        changeEvent = false;
        // Reset visual feedback after teaching stops
        if (typeof setEditorVisualFeedback === 'function') {
          setEditorVisualFeedback(true, false);
        }
      }, 2000);
    }
  } catch (error) {
    console.error('Error applying admin changes:', error);
    tata.error('Error', 'Failed to apply admin changes', {
      animate: 'fade',
      position: 'tm'
    });
  }
});

// Track editor focus state
editor.on('blur', () => {
  changeEvent = true;
  
  // Save code to database when user blurs the editor
  try {
    const code = editor.getValue();
    socket.emit('save-code', username, code);
    console.log('Saved code to database');
  } catch (error) {
    console.error('Error saving code on blur:', error);
  }
});

// Periodically save code every 30 seconds
setInterval(() => {
  try {
    const code = editor.getValue();
    if (code && username) {
      socket.emit('save-code', username, code);
      console.log('Auto-saved code to database');
    }
  } catch (error) {
    console.error('Error auto-saving code:', error);
  }
}, 30000); // Save every 30 seconds

// Save code before page unload
window.addEventListener('beforeunload', () => {
  try {
    const code = editor.getValue();
    if (code && username) {
      socket.emit('save-code', username, code);
    }
  } catch (error) {
    console.error('Error saving code before unload:', error);
  }
});
socket.on('delete-roomadmin', function (roomId) {
  try {
    const urlParts = new URL(window.location.href);
    const pathParts = urlParts.pathname.split('/');
    const currentRoomId = pathParts[pathParts.indexOf('joined') + 1];
    
    if (currentRoomId === roomId) {
      tata.warn('Room', 'Room has been deleted by admin', {
        animate: 'fade',
        position: 'tm',
      });
      // Use setTimeout instead of setInterval for one-time execution
      setTimeout(() => {
        window.location.replace('/');
      }, 3000);
    }
  } catch (error) {
    console.error('Error handling room deletion:', error);
    tata.error('Error', 'Failed to process room deletion', {
      animate: 'fade',
      position: 'tm'
    });
  }
});

// Send IDE data to admin
socket.on('personal-ide', function (name) {
  try {
    if (!editor) {
      console.error('Editor not initialized');
      return;
    }
    
    const code = editor.getValue();
    if (code === undefined) {
      console.error('Failed to get editor content');
      return;
    }
    
    socket.emit('getidedata', code, username);
  } catch (error) {
    console.error('Error sending IDE data:', error);
    tata.error('Error', 'Failed to send code to admin', {
      animate: 'fade',
      position: 'tm'
    });
  }
});

// Handle user changes
editor.on('focus', () => {
  changeEvent = false;
});

editor.on('change', (editor, changeData) => {
  try {
    if (changeEvent === false && socket && socket.connected) {
      // Validate change data
      if (!changeData || !changeData.from || !changeData.to || !changeData.text) {
        console.error('Invalid change data:', changeData);
        return;
      }
      
      socket.emit('userdochange', changeData, username);
    }
  } catch (error) {
    console.error('Error handling editor change:', error);
    tata.error('Error', 'Failed to sync changes', {
      animate: 'fade',
      position: 'tm'
    });
  }
});

let currentRoomId = null;

socket.on('connect', function () {
  try {
    console.log('Student socket connected');
    const urlParts = new URL(window.location.href);
    const pathParts = urlParts.pathname.split('/');
    const roomId = pathParts[pathParts.indexOf('joined') + 1];
    
    if (!roomId) {
      console.error('Could not determine room ID from URL');
      tata.error('Connection Error', 'Invalid room ID', {
        animate: 'fade',
        position: 'tm'
      });
      return;
    }
    
    // Store current room ID for reconnection
    currentRoomId = roomId;
    
    console.log('Joining room:', roomId, 'as user:', username);
    
    // Join room
    socket.emit('createroom', roomId, username);
    
    tata.success('Connected', 'Successfully joined the room', {
      animate: 'fade',
      position: 'tm'
    });
  } catch (error) {
    console.error('Error joining room:', error);
    tata.error('Connection Error', 'Failed to join room', {
      animate: 'fade',
      position: 'tm'
    });
  }
});

document.getElementById('submitcode').addEventListener('click', () => {
  console.log('code Submitted');
  const urlParts = new URL(window.location.href);
  const pathParts = urlParts.pathname.split('/');
  const roomId = pathParts[pathParts.indexOf('joined') + 1];
  
  if (!roomId) {
    tata.error('Submit', 'Could not determine room ID', {
      animate: 'fade',
      position: 'tm'
    });
    return;
  }

  const code = editor.getValue();
  if (!code.trim()) {
    tata.error('Submit', 'Code cannot be empty', {
      animate: 'fade',
      position: 'tm'
    });
    return;
  }

  axios
    .post('/api/v1/submitcode', {
      code,
      id: roomId,
      username,
    })
    .then((res) => {
      tata.success('Submit', 'Your Code is Submitted successfully!', {
        animate: 'fade',
        position: 'tm',
      });
      setInterval(() => {
        window.location.replace('/');
      }, 3001);
    })
    .catch((err) => {
      tata.error('Submit', 'Oops! Some Error Occurred', {
        animate: 'fade',
        position: 'tm',
      });
    });
});
