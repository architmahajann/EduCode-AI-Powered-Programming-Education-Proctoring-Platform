//routes for handling API requests
const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const roomModal = require('../Model/roomModel');
const userModal = require('../Model/userModel');
require('dotenv').config();

function requireAuth(req, res, next) {
  const token = req.cookies?.jwt || (req.get('authorization') || '').replace(/^Bearer\s+/i, '');
  if (!token || !process.env.JWT_SECRET) return res.status(401).json({ error: 'Authentication required' });
  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET);
    return next();
  } catch {
    return res.status(401).json({ error: 'Invalid or expired authentication' });
  }
}

// Join room //handles POST requests to join a room
router.post('/joinroom', async (req, res) => {
  const { password, id, username } = req.body;
  if (!password || !id || !username) {
    return res.status(400).json({ error: 'Missing required fields' });
  }
  try {
    const room = await roomModal.findById(id);
    if (!room) {
      return res.status(404).json({ error: 'Room not found' });
    }
    if (bcrypt.compareSync(password, room.password)) {
      const token = jwt.sign(
        {
          id: room._id,
          username: username,
        },
        process.env.JWT_SECRET,
        { 
          expiresIn: '1h'
        }
      );
        // set cookie to expire in 60 minutes
        res.cookie('jwt', token, {
          maxAge: 60 * 60 * 1000,
          httpOnly: true,
          secure: process.env.NODE_ENV === 'production',
          sameSite: 'lax',
        });
        return res.status(200).json({ status: 200, ok: true });
      }
      return res.status(401).json({ error: 'Incorrect password' });
    } catch (err) {
      console.error('Error in joinroom:', err);
      return res.status(500).json({ error: 'Internal server error' });
    }
});

// All room data and grading operations require the short-lived room token
// issued by joinroom. Room creation and joining remain public entry points.
router.use(requireAuth);

// Delete room //POST requests to delete a room
router.post('/deleteroom', async (req, res) => {
  const { id } = req.body;
  
  if (!id) {
    return res.status(400).json({ error: 'Room ID is required' });
  }

  try {
    const result = await roomModal.deleteOne({ _id: id });
    if (result.deletedCount === 0) {
      return res.status(404).json({ error: 'Room not found' });
    }
    return res.status(200).json({ 
      status: 200, 
      ok: true, 
      data: { msg: 'Room deleted successfully' } 
    });
  } catch (err) {
    console.error('Error deleting room:', err);
    return res.status(500).json({ error: 'Deleting room failed' });
  }
});

// Create room  //POST requests to create a new room.
router.post('/create', async (req, res) => {
  try {
    const { labname, password, language, testTimeLimit, questionStatements, createdby, sessionType } = req.body;
    
    // Validate required fields
    if (!labname || !password || !language || !createdby) {
      return res.status(400).json({ error: 'Missing required fields: labname, password, language, createdby' });
    }

    // For test mode, validate time limit and questions
    if (sessionType === 'test') {
      if (!testTimeLimit || testTimeLimit <= 0) {
        return res.status(400).json({ error: 'Test mode requires a valid time limit' });
      }
      if (!questionStatements || questionStatements.length === 0) {
        return res.status(400).json({ error: 'Test mode requires at least one question' });
      }
    }

    const admincode = Math.random().toString(36).slice(2);
    const hash = await bcrypt.hash(password, 10);
    
    // Determine allotted question for test mode
    let allottedQuestion = null;
    let allottedQuestions = [];
    if (sessionType === 'test' && questionStatements && questionStatements.length > 0) {
      const idx = Math.floor(Math.random() * questionStatements.length);
      allottedQuestion = questionStatements[idx];
      allottedQuestions = [allottedQuestion];
    }

    const roomData = {
      labname,
      adminCode: admincode,
      languageId: language,
      testTimeLimit: testTimeLimit || 0, // Default to 0 for practice mode
      questionStatements: questionStatements && questionStatements.length > 0 
        ? questionStatements 
        : ['Practice Mode: Write and test your code freely!'], // Default message
      allottedQuestion,
      allottedQuestions,
      password: hash,
      createdBy: createdby,
    };

    const createRoom = new roomModal(roomData);
    const doc = await createRoom.save();
    
    return res.status(200).json({ 
      admincode: doc.adminCode, 
      id: doc._id 
    });
  } catch (err) {
    console.error('Error creating room:', err);
    return res.status(500).json({ error: err.message });
  }
});

// Add question statement //POST requests to add a question to a room.
router.post('/addquestion', async (req, res) => {
  const { roomId, questionStatement } = req.body;
  
  if (!roomId || !questionStatement) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  try {
    await roomModal.findByIdAndUpdate(roomId, 
      { $push: { questionStatements: questionStatement } }, 
      { new: true }
    );
    return res.status(200).json({ message: 'Question added successfully' });
  } catch (err) {
    console.error('Error adding question:', err);
    return res.status(500).json({ error: 'Failed to add question' });
  }
});

// Get randomly allotted question
router.get('/getrandomquestion/:roomId', async (req, res) => {
  if (!req.params.roomId) {
    return res.status(400).json({ error: 'Room ID is required' });
  }

  try {
    const room = await roomModal.findById(req.params.roomId);
    if (!room || !room.questionStatements || room.questionStatements.length === 0) {
      return res.status(404).json({ error: 'No questions found' });
    }
    const randomIndex = Math.floor(Math.random() * room.questionStatements.length);
    const randomQuestion = room.questionStatements[randomIndex];
    return res.status(200).json({ question: randomQuestion });
  } catch (err) {
    console.error('Error getting random question:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// Retrieve questions from the database
router.get('/questions', (req, res) => {
  (async () => {
    try {
      const rooms = await roomModal.find({}, 'questionStatements').exec();
      const questions = rooms.map((room) => room.questionStatements).flat();
      res.status(200).json({ questions });
    } catch (err) {
      console.error('Error retrieving questions:', err);
      return res.status(500).json({ error: 'Error retrieving questions' });
    }
  })();
});


// Submit code by a user
router.post('/submitcode', async (req, res) => {
  const { username, id, code } = req.body;
  
  if (!username || !id || typeof code !== 'string') {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  try {
    const filter = { roomId: id, username };
    const update = { 
      code, 
      lastActive: new Date()
    };
    // Upsert so repeat submissions overwrite instead of failing on unique index
    const doc = await userModal.findOneAndUpdate(filter, update, { upsert: true, new: true, setDefaultsOnInsert: true });
    return res.status(200).json({ message: 'Code submitted successfully' });
  } catch (err) {
    // Provide better diagnostics on duplicate key or validation errors
    const msg = (err && err.code === 11000) ? 'Duplicate submission constraint' : (err && err.message) || 'Code submission failed';
    console.error('Error submitting code:', msg, err && err.keyValue ? err.keyValue : '');
    return res.status(500).json({ error: 'Code submission failed' });
  }
});

// Generate report
router.post('/getcode', async (req, res) => {
  const { roomId } = req.body;
  
  if (!roomId) {
    return res.status(400).json({ error: 'Room ID is required' });
  }

  try {
    const data = await userModal.find({ roomId: roomId }).sort({ marks: -1, username: 1 });
    if (!data || data.length === 0) {
      return res.status(404).json({ error: 'No code submissions found for this room' });
    }
    return res.status(200).json({ 
      status: 200, 
      data: { code: data } 
    });
  } catch (err) {
    console.error('Error fetching code for report:', err);
    return res.status(500).json({ error: 'Error occurred while fetching code' });
  }
});

// Set/Change the allotted question for a room
router.post('/setallottedquestion', async (req, res) => {
  const { roomId, question, questions } = req.body;
  if (!roomId || (!question && !Array.isArray(questions))) {
    return res.status(400).json({ error: 'roomId and question(s) are required' });
  }
  try {
    const room = await roomModal.findById(roomId);
    if (!room) return res.status(404).json({ error: 'Room not found' });

    // Normalize to an array of questions to set
    let toSet = [];
    if (Array.isArray(questions)) {
      toSet = questions.filter(q => typeof q === 'string').map(q => q.trim()).filter(Boolean);
    } else if (typeof question === 'string') {
      toSet = [question.trim()].filter(Boolean);
    }
    if (toSet.length === 0) {
      return res.status(400).json({ error: 'No valid questions provided' });
    }

    // Ensure questionStatements includes all provided questions
    if (!Array.isArray(room.questionStatements)) room.questionStatements = [];
    toSet.forEach(q => {
      if (!room.questionStatements.includes(q)) {
        room.questionStatements.push(q);
      }
    });

    // Update both single and multiple fields for compatibility
    room.allottedQuestions = toSet;
    room.allottedQuestion = toSet[0];
    await room.save();
    return res.status(200).json({ message: 'Allotted questions updated', questions: toSet });
  } catch (err) {
    console.error('Error setting allotted question(s):', err);
    return res.status(500).json({ error: 'Failed to set allotted question(s)' });
  }
});

// Grade a student submission
router.post('/gradesubmission', async (req, res) => {
  const { roomId, username, marks, maxMarks, feedback, gradedBy } = req.body;
  
  if (!roomId || !username) {
    return res.status(400).json({ error: 'Room ID and username are required' });
  }

  if (marks !== undefined && (marks < 0 || marks > (maxMarks || 100))) {
    return res.status(400).json({ error: 'Invalid marks value' });
  }

  try {
    const updateData = {
      gradedAt: new Date(),
    };

    if (marks !== undefined) updateData.marks = marks;
    if (maxMarks !== undefined) updateData.maxMarks = maxMarks;
    if (feedback !== undefined) updateData.feedback = feedback;
    if (gradedBy !== undefined) updateData.gradedBy = gradedBy;

    const user = await userModal.findOneAndUpdate(
      { roomId, username },
      updateData,
      { new: true }
    );

    if (!user) {
      return res.status(404).json({ error: 'Student submission not found' });
    }

    return res.status(200).json({ 
      status: 200, 
      message: 'Grading saved successfully',
      data: user 
    });
  } catch (err) {
    console.error('Error grading submission:', err);
    return res.status(500).json({ error: 'Error occurred while grading' });
  }
});

// Calculate and update ranks for a room
router.post('/calculateranks', async (req, res) => {
  const { roomId } = req.body;
  
  if (!roomId) {
    return res.status(400).json({ error: 'Room ID is required' });
  }

  try {
    // Get all students with marks, sorted by marks (descending)
    const students = await userModal.find({ 
      roomId, 
      marks: { $ne: null } 
    }).sort({ marks: -1, username: 1 });

    if (students.length === 0) {
      return res.status(200).json({ 
        status: 200, 
        message: 'No graded submissions found',
        data: [] 
      });
    }

    // Update ranks
    let currentRank = 1;
    let previousMarks = null;
    let studentsAtSameRank = 0;

    for (let i = 0; i < students.length; i++) {
      if (previousMarks !== null && students[i].marks < previousMarks) {
        currentRank += studentsAtSameRank;
        studentsAtSameRank = 1;
      } else {
        studentsAtSameRank++;
      }

      await userModal.findByIdAndUpdate(students[i]._id, { rank: currentRank });
      students[i].rank = currentRank;
      previousMarks = students[i].marks;
    }

    return res.status(200).json({ 
      status: 200, 
      message: 'Ranks calculated successfully',
      data: students 
    });
  } catch (err) {
    console.error('Error calculating ranks:', err);
    return res.status(500).json({ error: 'Error occurred while calculating ranks' });
  }
});

// Get leaderboard for a room
router.post('/leaderboard', async (req, res) => {
  const { roomId } = req.body;
  
  if (!roomId) {
    return res.status(400).json({ error: 'Room ID is required' });
  }

  try {
    const leaderboard = await userModal.find({ 
      roomId,
      marks: { $ne: null }
    }).sort({ rank: 1, marks: -1, username: 1 })
      .select('username marks maxMarks rank feedback gradedAt');

    return res.status(200).json({ 
      status: 200, 
      data: leaderboard 
    });
  } catch (err) {
    console.error('Error fetching leaderboard:', err);
    return res.status(500).json({ error: 'Error occurred while fetching leaderboard' });
  }
});

// Default route for API
router.get('/', (req, res) => {
  res.status(200).json({
    status: 'success',
    message: 'Welcome to Educode API',
    version: 'v1',
    endpoints: {
      create: 'POST /api/v1/create',
      joinRoom: 'POST /api/v1/joinroom',
      deleteRoom: 'POST /api/v1/deleteroom',
      addQuestion: 'POST /api/v1/addquestion',
      getRandomQuestion: 'GET /api/v1/getrandomquestion/:roomId',
      getQuestions: 'GET /api/v1/questions',
      submitCode: 'POST /api/v1/submitcode',
      getCode: 'POST /api/v1/getcode'
    }
  });
});

module.exports = router;
