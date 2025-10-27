const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  roomId: {
    type: String,
    required: true,
  },
  username: {
    type: String,
    required: true,
  },
  code: {
    type: String,
    default: '',
  },
  lastActive: {
    type: Date,
    default: Date.now,
  },
  // Grading fields
  marks: {
    type: Number,
    default: null,
    min: 0,
  },
  maxMarks: {
    type: Number,
    default: 100,
  },
  feedback: {
    type: String,
    default: '',
  },
  rank: {
    type: Number,
    default: null,
  },
  gradedBy: {
    type: String,
    default: '',
  },
  gradedAt: {
    type: Date,
    default: null,
  },
}, {
  timestamps: true, // Adds createdAt and updatedAt
});

// Create compound index for faster queries
userSchema.index({ roomId: 1, username: 1 }, { unique: true });
userSchema.index({ roomId: 1, marks: -1 }); // Index for ranking by marks

const User = mongoose.model('User', userSchema);

module.exports = User;
