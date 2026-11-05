//routes for handling HTTP requests related to the web application's frontend. 
var express = require('express');
var roomModal = require('../Model/roomModel');
var userModal = require('../Model/userModel');
var router = express.Router();
require('dotenv').config();
/* GET home page. */
router.get('/', function (req, res, next) {
  res.clearCookie('jwt');
  res.render('index', { title: 'Express', page: 'Home', menuId: 'home' });
});

router.get('/create', function(req, res) {
  res.render('create', { page: 'Create Room', menuId: 'create' });
});

router.get('/admin/:roomId/:admincode', async (req, res) => {
  try {
    if (!req.params.roomId || !req.params.admincode) {
      return res.render('404');
    }
    const room = await roomModal.findById(req.params.roomId);
    if (!room) {
      return res.render('404');
    }
    if (req.params.admincode === room.adminCode) {
      return res.render('adminpanal', {
        page: 'admin',
        menuId: 'home',
        language: room.languageId,
        testTime: room.testTimeLimit,
        labname: room.labname,
        createdby: room.createdBy,
        questionStatements: room.questionStatements || [],
        allottedQuestion: room.allottedQuestion || null,
        allottedQuestions: room.allottedQuestions || [],
      });
    }
    return res.render('404');
  } catch (err) {
    console.error('Error fetching room for admin route:', err);
    return res.render('404');
  }
});
async function verifyAdmin(req, res, next) {
  try {
    if (!req.params.roomId || !req.params.admincode) {
      return res.render('404');
    }
    const room = await roomModal.findById(req.params.roomId);
    if (!room) {
      return res.render('404');
    }
    if (req.params.admincode === room.adminCode) {
      req.labname = room.labname;
      return next();
    }
    return res.render('404');
  } catch (err) {
    console.error('Error in verifyAdmin middleware:', err);
    return res.render('404');
  }
}

router.get('/admin/:roomId/:admincode/report', verifyAdmin, (req, res) => {
  res.render('codereport', { labname: req.labname });
});

module.exports = router;
