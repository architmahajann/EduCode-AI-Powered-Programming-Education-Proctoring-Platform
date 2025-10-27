var express = require('express');
var bodyParser = require('body-parser'); // parse incoming request
var path = require('path'); //handling file paths
var cookieParser = require('cookie-parser');
var logger = require('morgan');
const mongoose = require('mongoose');
var indexRouter = require('./routes/index');
const api = require('./routes/api');
const rooomRouter = require('./routes/room');
require('dotenv').config({ path: path.join(__dirname, '.env') });
// expose selected env to templates
const exposeToViews = {
  JUDGE0_API_KEY: process.env.JUDGE0_API_KEY || '',
  // Allow configuring WebRTC ICE servers via env (JSON array or single url)
  WEBRTC_ICE_SERVERS: (() => {
    try {
      if (process.env.WEBRTC_ICE_SERVERS) {
        // Accept either JSON string or a simple URL string
        const v = process.env.WEBRTC_ICE_SERVERS.trim();
        if (v.startsWith('[')) return JSON.parse(v);
        return [{ urls: [v] }];
      }
    } catch (_) {}
    // Default to public Google STUN
    return [{ urls: ['stun:stun.l.google.com:19302'] }];
  })()
};
let PORT = process.env.PORT || 3001;
var app = express();   // instance of the Express application

app.use(
  bodyParser.urlencoded({
    extended: true,
  })
);

// view engine setup
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'ejs');

app.use(logger('dev'));
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));

// make variables available to all ejs views
app.use((req, res, next) => {
  Object.assign(res.locals, exposeToViews);
  next();
});

app.use('/', indexRouter);  //Handles requests for the root URL.
app.use('/api/v1', api);
app.use('/room', rooomRouter);

app.use(function (err, req, res, next) {
  res.locals.message = err.message;
  res.locals.error = req.app.get('env') === 'development' ? err : {};

  // render the error page
  res.status(err.status || 500);
  res.render('error');
});
const server = app.listen(PORT, () => {
  console.log('Server connecter: ' + PORT);
});

// MongoDB setup

mongoose
  .connect(process.env.MONGO_DB_URI)
  .then(() => console.log('DB CONNECTION SUCCESSFULL !'))
  .catch((err) => {
    console.log('DB connection failed:', err.message);
  });

//initialize socket for the server

const socketServe = require('./socketio');
socketServe.sock(server);