let socket = window.socket || io();
window.socket = socket;
let userlist = document.getElementById('userlist');
const deleteroom = document.getElementById('deleteroom');
let userCurrent;
let broadcastEnabled = false;

// Editor Setup

let isUserChnage;

const textinput = document.getElementById('code');
let mode;

if (languageid == 62) {
  mode = 'text/x-java';
} else if (languageid == 54) {
  mode = 'text/x-c++src';
} else if (languageid == 49) {
  mode = 'text/x-csrc';
} else {
  mode = 'text/x-python';
}
var editor = CodeMirror.fromTextArea(textinput, {
  lineNumbers: true,
  tabSize: 2,
  lineWrapping: true,
  indentUnit: 4,
  foldGutter: true,
  autoCloseBrackets: true,
  gutters: ['CodeMirror-linenumbers', 'CodeMirror-foldgutter'],
  matchBrackets: true,
  mode: mode,
  theme: 'dracula',
});

if (languageid == 62) {
  editor.setValue(`public class Main {
    public static void main(String[] args) {
        //Your code goes here
    }
}
`);
}
if (languageid == 54) {
  editor.setValue(`#include <iostream>
using namespace std;
int main() {
      // Your code goes here
}
`);
}
if (languageid == 49) {
  editor.setValue(`#include <stdio.h>
int main() {
    // Your code goes here
    return 0;
}
`);
}
if (languageid == 71) {
  editor.setValue(`#Python(3.8.1)...
#Your code goes here
`);
}

editor.setSize('720px', '630px'); //Set the length and width of the code box

//delete button room
let id = window.location.toString().split('admin/')[1].split('/')[0];
deleteroom.addEventListener('click', function () {
  axios
    .post('/api/v1/deleteroom', {
      id,
    })
    .then((res) => {
      if (res.data.status === 400) {
        tata.info('Room deleted', 'You deleted the room', {
          animate: 'fade',
          position: 'tm',
        });
        socket.emit(
          'delete-room',
          window.location.toString().split('admin/')[1].split('/')[0]
        );
        window.location.replace('/');
      } else {
        tata.error('Room deleted', 'Oops!Some Error in room deleting', {
          animate: 'fade',
          position: 'tm',
        });
      }
    });
});

// Socket event for text sharing

// Emit admin edits to the selected student; prevent echo loops with isUserChnage
editor.on('change', (editor, changeObj) => {
  try {
    if (userCurrent && isUserChnage === false) {
      socket.emit('admindatachang', userCurrent, changeObj);
    }
    // Also broadcast to all students if sharing is enabled
    if (broadcastEnabled) {
      try {
        const roomId = window.location.toString().split('admin/')[1].split('/')[0];
        socket.emit('admin-broadcast-change', { roomId, changeObj });
      } catch (e) {
        console.error('Failed to emit admin-broadcast-change:', e);
      }
    }
  } catch (e) {
    console.error('Failed to emit admin change:', e);
  }
});

editor.on('focus', () => {
  isUserChnage = false;
});

// Event delegation for dynamically created student list items
userlist.addEventListener('click', (e) => {
  // Check if clicked element is a student list item
  if (e.target.classList.contains('stu-list') || e.target.closest('.stu-list')) {
    const clickedElement = e.target.classList.contains('stu-list') ? e.target : e.target.closest('.stu-list');
  // Temporarily suppress outbound emits while switching target user
  isUserChnage = true;
    const studentName = clickedElement.getAttribute('data-username') || clickedElement.textContent.trim().replace(/●/g, '').trim();
    const isActive = clickedElement.getAttribute('data-active') === 'true';
    
    // Remove active class from all items
    document.querySelectorAll('.stu-list').forEach(item => {
      item.classList.remove('active');
    });
    
    // Add active class to clicked item
    clickedElement.classList.add('active');
    
    userCurrent = studentName;
    console.log('Selected student:', studentName, 'Active:', isActive);
    
    if (isActive) {
      // Active user - request live code
      socket.emit('change-user', studentName);
    } else {
      // Inactive user - load saved code from database
      const roomId = window.location.toString().split('admin/')[1].split('/')[0];
      socket.emit('change-user-inactive', studentName, roomId);
      
      tata.info('Viewing Inactive User', `Viewing last saved code from ${studentName}`, {
        animate: 'fade',
        position: 'tm',
        duration: 3000
      });
    }

    // Ensure subsequent admin typing emits to the selected student
    // by restoring emit flag after the editor regains focus
    try { editor.focus(); } catch (_) {}
    setTimeout(() => { isUserChnage = false; }, 150);
  }
});

function createEle(name) {
  let li = document.createElement('li');
  li.textContent = name;
  return li;
}

socket.on('userdochangeToadmin', function (changeData, username) {
  console.log('Received code change from:', username, 'Current user:', userCurrent);
  if (username === userCurrent) {
    // Suppress emitting while applying student change locally
    isUserChnage = true;
    // editor.display.input.blur();
    editor.replaceRange(
      changeData.text,
      changeData.from,
      changeData.to,
      'Broadcast'
    );
    // Re-enable emitting after applying incoming change
    setTimeout(() => { isUserChnage = false; }, 100);
  }
});

socket.on('connect', function () {
  console.log('Admin socket connected');
  
  socket.on('adminsideide', function (text, user) {
    console.log('Received full code from:', user, 'Current user:', userCurrent);
    isUserChnage = true; // avoid echo while setting content
    if (user === userCurrent) {
      editor.setValue('');
      editor.setValue(text);
    }
    setTimeout(() => { isUserChnage = false; }, 100);
  });

  // Handle inactive user code retrieval
  socket.on('inactive-user-code', function (code, username) {
    console.log('Received inactive user code for:', username);
    isUserChnage = true; // avoid echo while setting content
    if (username === userCurrent) {
      editor.setValue('');
      editor.setValue(code || '// No code saved for this user');
    }
    setTimeout(() => { isUserChnage = false; }, 100);
  });

  const roomId = window.location.toString().split('admin/')[1].split('/')[0];
  socket.emit('admin-page', roomId);
  console.log('Joined admin room:', roomId);

  // Handle broadcast toggle UI
  const toggle = document.getElementById('broadcastToggle');
  if (toggle) {
    toggle.addEventListener('change', () => {
      broadcastEnabled = toggle.checked;
      try {
        socket.emit('admin-broadcast-toggle', { roomId, enabled: broadcastEnabled });
        if (broadcastEnabled) {
          // Send full snapshot to students immediately
          const full = editor.getValue();
          socket.emit('admin-broadcast-full', { roomId, code: full });
        }
      } catch (e) {
        console.error('Failed to toggle admin broadcast:', e);
      }
    });
  }

  // When server requests a fresh full code (e.g., new student joined)
  socket.on('admin-send-full-code', ({ roomId: reqRoom }) => {
    try {
      if (!broadcastEnabled) return;
      const full = editor.getValue();
      socket.emit('admin-broadcast-full', { roomId: reqRoom, code: full });
    } catch (e) {
      console.error('Failed to respond with full admin code:', e);
    }
  });
  
  socket.on('update', function (username, roomId, inactiveUsers = []) {
    console.log('User list update:', username, 'for room:', roomId);
    console.log('Inactive users:', inactiveUsers);
    
    if (
      window.location.toString().split('admin/')[1].split('/')[0] === roomId
    ) {
      userlist.innerHTML = '';
      
      // Add active users section
      if (username && username.length > 0) {
        userlist.insertAdjacentHTML('beforeend', '<h5 style="color: #4CAF50; margin: 10px 0 5px 0; font-size: 14px;">Active Members</h5>');
        for (let i in username) {
          userlist.insertAdjacentHTML(
            'beforeend',
            `<div class="stu-list active-user" data-username="${username[i]}" data-active="true">${username[i]} <span style="color: #4CAF50;">●</span></div>`
          );
        }
        console.log('Updated active student list, total students:', Object.keys(username).length);
      }
      
      // Add inactive users section
      if (inactiveUsers && inactiveUsers.length > 0) {
        userlist.insertAdjacentHTML('beforeend', '<h5 style="color: #ff9800; margin: 15px 0 5px 0; font-size: 14px;">Inactive Members (Left)</h5>');
        for (let i = 0; i < inactiveUsers.length; i++) {
          userlist.insertAdjacentHTML(
            'beforeend',
            `<div class="stu-list inactive-user" data-username="${inactiveUsers[i]}" data-active="false" style="opacity: 0.7;">${inactiveUsers[i]} <span style="color: #ff9800;">●</span></div>`
          );
        }
        console.log('Updated inactive student list, total inactive:', inactiveUsers.length);
      }
    }
  });
});

// Robust navigation to the submissions/grading page
const reportBtn = document.querySelector('#report');
if (reportBtn) {
  reportBtn.addEventListener('click', (e) => {
    e.preventDefault();
    
    // Notify students that admin is viewing submissions
    try {
      const roomId = window.location.toString().split('admin/')[1].split('/')[0];
      if (socket && roomId) {
        socket.emit('admin-viewing-submissions', roomId);
      }
    } catch (err) {
      console.error('Failed to emit admin-viewing-submissions:', err);
    }
    
    // Navigate to report page
    try {
      const url = new URL(window.location.href);
      // Ensure we append '/report' exactly once (handles trailing slash)
      const cleanPath = url.pathname.replace(/\/$/, '');
      const target = `${url.origin}${cleanPath}/report`;
      window.location.assign(target);
    } catch (err) {
      console.error('Failed to navigate to report:', err);
      // Fallback: relative navigation
      window.location.assign(window.location.toString().replace(/\/$/, '') + '/report');
    }
  });
}

// ---------------- Proctoring feed (images) ----------------
// Fetches latest images from the proctoring backend and renders them in the admin panel.
// Backend service must be running at http://localhost:3000 and the extension must be posting images.
(function setupProctoringFeed() {
  const FEED_CONTAINER_ID = 'tabalert'; // existing container in admin panel
  const API_BASE = 'http://localhost:3000';
  const INTERVAL_MS = 15000; // 15 seconds

  const container = document.getElementById(FEED_CONTAINER_ID);
  if (!container) return; // nothing to do if container missing

  function renderFeed(users) {
    // Preserve the visibility messages by appending a divider and feed below
    let feed = document.getElementById('proctoring-feed');
    if (!feed) {
      feed = document.createElement('div');
      feed.id = 'proctoring-feed';
      feed.style.marginTop = '10px';
      container.appendChild(feed);
    }

    // Build simple gallery of latest image per user
    const parts = [];
    parts.push('<div style="border-top:1px solid #ddd; padding-top:10px;">');
    parts.push('<h4 style="margin:6px 0;">Proctoring Feed</h4>');

    if (!Array.isArray(users) || users.length === 0) {
      parts.push('<div style="color:#666; font-size:12px;">No proctoring images yet. Ensure the extension is installed and active.</div>');
    } else {
      parts.push('<div style="display:flex; flex-wrap:wrap; gap:10px;">');
      users.forEach(u => {
        const last = (u.images || []).slice(-1)[0];
        if (!last) return;
        parts.push(`
          <div style="border:1px solid #e5e5e5; border-radius:6px; padding:6px; width:160px;">
            <div style="font-size:12px; margin-bottom:4px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;" title="${u.email || u.firstName || u.id}">
              ${u.email || u.firstName || u.id}
            </div>
            <img src="${last.url}" alt="${last.id}" style="width:100%; height:120px; object-fit:cover; border-radius:4px;"/>
          </div>
        `);
      });
      parts.push('</div>');
    }
    parts.push('</div>');

    feed.innerHTML = parts.join('');
  }

  async function refreshFeed() {
    try {
      const res = await axios.get(`${API_BASE}/retrieve-data`, { timeout: 8000 });
      if (res && res.data && Array.isArray(res.data.data)) {
        renderFeed(res.data.data);
      }
    } catch (e) {
      // Soft-fail: do not spam errors in UI, log once in console
      console.debug('Proctoring feed fetch failed:', e?.message || e);
    }
  }

  // initial and interval refresh
  refreshFeed();
  setInterval(refreshFeed, INTERVAL_MS);
})();
