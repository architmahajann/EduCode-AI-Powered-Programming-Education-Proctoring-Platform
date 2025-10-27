const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
var roomModal = require('../Model/roomModel');
require('dotenv').config();
// Middlewares
function queryCheck(req, res, next) {
  if (req.cookies.jwt && req.cookies.jwt !== undefined) {
    try {
      const user = jwt.verify(req.cookies.jwt, process.env.JWT_SECRET);
      req.user = user;
      next();
    } catch (err) {
      return res.redirect(`/room/join/${req.params.roomId}`);
    }
  } else {
    return res.redirect(`/room/join/${req.params.roomId}`);
  }
}

async function verifyroom(req, res, next) {
  try {
    if (!req.params.roomId) {
      console.log('No room ID provided');
      return res.render('404');
    }
    if (!mongoose.Types.ObjectId.isValid(req.params.roomId)) {
      console.log('Invalid room ID');
      return res.render('404');
    }
    const roomdata = await roomModal.findById(req.params.roomId);
    if (!roomdata) {
      console.log('No room found');
      return res.render('404');
    }
    req.users = roomdata;
    return next();
  } catch (err) {
    console.error('Error in verifyroom:', err);
    return res.render('404');
  }
}

// GET route to render join page for a room
router.get('/join/:roomId', async (req, res) => {
  try {
    if (!req.params.roomId) {
      return res.render('404');
    }
    if (!mongoose.Types.ObjectId.isValid(req.params.roomId)) {
      return res.render('404');
    }
    const room = await roomModal.findById(req.params.roomId);
    if (!room) {
      return res.render('404');
    }
    return res.render('joinroom', { 
      roomId: req.params.roomId, 
      labname: room.labname 
    });
  } catch (err) {
    console.error('Error rendering join page:', err);
    return res.render('404');
  }
});

router.get('/joined/:roomId', queryCheck, verifyroom, async (req, res) => {
  try {
    if (req.user.id === req.params.roomId) {
      const room = await roomModal.findById(req.params.roomId);
      if (!room) {
        return res.render('404');
      }
      // Use allottedQuestions if present; otherwise backfill from single; otherwise pick one and persist
      let allottedQuestions = Array.isArray(room.allottedQuestions) ? room.allottedQuestions : [];
      if (allottedQuestions.length === 0 && room.allottedQuestion) {
        allottedQuestions = [room.allottedQuestion];
      }
      if (allottedQuestions.length === 0 && room.questionStatements && room.questionStatements.length > 0) {
        const randomIndex = Math.floor(Math.random() * room.questionStatements.length);
        const q = room.questionStatements[randomIndex];
        allottedQuestions = [q];
        try {
          await roomModal.findByIdAndUpdate(req.params.roomId, { allottedQuestion: q, allottedQuestions: [q] });
        } catch (e) {
          console.error('Failed to persist initial allottedQuestions for room', req.params.roomId, e);
        }
      }
      
      // Render the room.ejs page with test time limit
      return res.render('room', {
        title: 'Room',
        menuId: 'home',
        labname: room.labname,
        by: room.createdBy,
        language: room.languageId,
        testTimeLimit: room.testTimeLimit,
        allottedQuestions: allottedQuestions,
        username: req.user.username || 'Student', // Add username from JWT token
      });
    }
    return res.redirect(`/room/join/${req.params.roomId}`);
  } catch (err) {
    console.error('Error in /joined route:', err);
    return res.render('404');
  }
});



module.exports = router;
