require('dotenv').config();
const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const nodemailer = require('nodemailer');

// Import Database Models
const User = require('./models/User');
const Message = require('./models/Message');

const app = express();
const server = http.createServer(app);

// Enable real-time WebSockets with Cross-Origin Resource Sharing (CORS)
const io = socketIo(server, { 
  cors: { origin: "*", methods: ["GET", "POST"] } 
});

// Middleware
app.use(express.json());
app.use(express.static('public')); // Serves your HTML frontend files automatically

// Connect to MongoDB Database via Railway Environment Variable
mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log('MongoDB Connected Successfully 🗄️'))
  .catch(err => console.error('Database Connection Error:', err));

// Email Configuration for 6-Digit Codes
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: { 
    user: process.env.EMAIL_USER, 
    pass: process.env.EMAIL_PASS 
  }
});

/* ==================== API ROUTES ==================== */

// 1. USER SIGN UP
app.post('/api/signup', async (req, res) => {
  try {
    const { username, email, password } = req.body;

    // Check if user already exists
    const existingUser = await User.findOne({ $or: [{ email }, { username }] });
    if (existingUser) return res.status(400).json({ error: 'Username or Email already taken.' });

    // Hash password & generate 6-digit random token
    const hashedPassword = await bcrypt.hash(password, 10);
    const verificationCode = Math.floor(100000 + Math.random() * 900000).toString();

    const newUser = new User({ 
      username, 
      email, 
      password: hashedPassword, 
      verificationCode,
      isVerified: false 
    });
    await newUser.save();

    // Send Mail
    await transporter.sendMail({
      from: `"Blue Rocket Support" <${process.env.EMAIL_USER}>`,
      to: email,
      subject: '🚀 Verify your Blue Rocket Account',
      text: `Welcome to Blue Rocket! Your 6-digit verification code is: ${verificationCode}`
    });

    res.status(201).json({ message: 'Verification security code dispatched to your email!' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 2. EMAIL CODE VERIFICATION
app.post('/api/verify', async (req, res) => {
  try {
    const { email, code } = req.body;
    const user = await User.findOne({ email });

    if (user && user.verificationCode === code) {
      user.isVerified = true;
      user.verificationCode = null; // Wipe out temporary code
      await user.save();

      // Issue secure session web token
      const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET, { expiresIn: '7d' });
      return res.json({ success: true, token, username: user.username });
    }
    res.status(400).json({ success: false, message: 'Invalid or expired verification code.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 3. FETCH ARCHIVED CHAT HISTORY
app.get('/api/messages/:user1/:user2', async (req, res) => {
  try {
    const { user1, user2 } = req.params;
    // Get chat messages exchanged strictly between these two users
    const history = await Message.find({
      $or: [
        { sender: user1, receiver: user2 },
        { sender: user2, receiver: user1 }
      ]
    }).sort({ timestamp: 1 });
    
    res.json(history);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 4. SNAPCHAT-STYLE AUTO DELETE ROUTE
app.post('/api/messages/delete', async (req, res) => {
  try {
    const { sender, receiver } = req.body;
    // Permanently wipe conversation files out of database on user demand
    await Message.deleteMany({
      $or: [
        { sender: sender, receiver: receiver },
        { sender: receiver, receiver: sender }
      ]
    });
    res.json({ success: true, message: 'Messages wiped clean like Snapchat!' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


/* ==================== WEB-SOCKET CHAT ENGINE ==================== */

io.on('connection', (socket) => {
  console.log('User connected to socket cluster 🔌');

  // User enters their own private space room to receive calls/texts
  socket.on('join', (username) => {
    socket.join(username);
    console.log(`User [${username}] linked to secure private room.`);
  });

  // Handle incoming message relay
  socket.on('private_message', async (data) => {
    const { sender, receiver, message } = data;

    try {
      // Save message tracking state to DB
      const record = new Message({ sender, receiver, message });
      await record.save();

      // Route the packet straight to receiver's personal WebSocket space
      io.to(receiver).emit('new_message', { sender, message, timestamp: record.timestamp });
    } catch (err) {
      console.error("Failed to commit socket message to database:", err);
    }
  });

  socket.on('disconnect', () => {
    console.log('User logged out of communication pipeline.');
  });
});


// System Port Allocation for Railway compatibility
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`🚀 Blue Rocket Server blasting off on port ${PORT}`));
