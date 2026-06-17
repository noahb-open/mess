const mongoose = require('mongoose');

const MessageSchema = new mongoose.Schema({
  sender: { type: String, required: true },
  receiver: { type: String, required: true },
  message: { type: String, required: true },
  timestamp: { type: Date, default: Date.now },
  opened: { type: Boolean, default: false } // Snapchat style tracking!
});

module.exports = mongoose.model('Message', MessageSchema);
