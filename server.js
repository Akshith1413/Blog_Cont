require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const bodyParser = require('body-parser');
const multer = require('multer');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const { body, validationResult } = require('express-validator');
const forceHttps = require('express-force-https');
const http = require('http');
const socketIo = require('socket.io');
const { GridFSBucket } = require('mongodb');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);
const port = process.env.PORT || 3000;

// Middleware
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static(__dirname));
app.use(cors());
app.use(helmet());

// Rate Limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, 
  max: 100, 
  message: 'Too many requests from this IP, please try again after 15 minutes'
});
app.use(limiter);

// Force HTTPS in production
if (process.env.NODE_ENV === 'production') {
  app.use(forceHttps);
}

// MongoDB Connection
const mongoURI = process.env.MONGO_URI;
const jwtSecret = process.env.JWT_SECRET || 'your_jwt_secret';

mongoose.connect(mongoURI, { useNewUrlParser: true, useUnifiedTopology: true })
  .then(() => {
    console.log('MongoDB connected');
    const conn = mongoose.connection;
    const bucket = new GridFSBucket(conn.db, { bucketName: 'uploads' });

    // Multer for file uploads
    const storage = multer.memoryStorage();
    const upload = multer({ storage });

    // Schema and Model for Posts
    const postSchema = new mongoose.Schema({
      text: { type: String, required: true },
      imageFiles: [{ filename: String, contentType: String }],
      videoFiles: [{ filename: String, contentType: String }],
      createdAt: { type: Date, default: Date.now }
    });

    const Post = mongoose.model('Post', postSchema);

    // Route to create a post
    app.post('/api/posts', upload.array('media', 10), async (req, res) => {
      try {
        const { text } = req.body;
        const imageFiles = [];
        const videoFiles = [];

        req.files.forEach(file => {
          const uploadStream = bucket.openUploadStream(file.originalname, { contentType: file.mimetype });
          uploadStream.end(file.buffer);

          const fileInfo = { filename: file.originalname, contentType: file.mimetype };

          if (file.mimetype.startsWith('image/')) {
            imageFiles.push(fileInfo);
          } else if (file.mimetype.startsWith('video/')) {
            videoFiles.push(fileInfo);
          }
        });

        const post = new Post({ text, imageFiles, videoFiles });
        await post.save();

        res.status(201).json(post);
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    // Route to get all posts
    app.get('/api/posts', async (req, res) => {
      try {
        const posts = await Post.find();
        res.json(posts);
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    // Route to serve files from GridFS
    app.get('/files/:filename', (req, res) => {
      const { filename } = req.params;
      const downloadStream = bucket.openDownloadStreamByName(filename);
      downloadStream.pipe(res)
        .on('error', (error) => {
          res.status(500).json({ error: error.message });
        });
    });
app.get('/files/:filename', (req, res) => {
  const { filename } = req.params;
  try {
    const downloadStream = bucket.openDownloadStreamByName(filename);

    downloadStream.on('data', (chunk) => {
      res.write(chunk);
    });

    downloadStream.on('end', () => {
      res.end();
    });

    downloadStream.on('error', (error) => {
      console.error('File download error:', error);
      res.status(404).json({ error: 'File not found' });
    });
  } catch (error) {
    console.error('Error handling request:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

    // User Schema and Model
    const userSchema = new mongoose.Schema({
      username: { type: String, required: true, unique: true },
      email: { type: String, required: true, unique: true },
      phone: { type: String, required: true },
      password: { type: String, required: true },
      gender: { type: String, required: true },
      dob: { type: Date, required: true },
      profession: { type: String, required: true },
      address: { type: String, required: true }
    });

    const User = mongoose.model('User', userSchema);

    // Contact Schema and Model
    const contactSchema = new mongoose.Schema({
      username: { type: String, required: true, unique: true },
      email: { type: String, required: true, unique: true },
      phone: { type: String, required: true },
      address: { type: String, required: true }
    });

    const Contact = mongoose.model('Contact', contactSchema);

    // Message Schema and Model
    const messageSchema = new mongoose.Schema({
      sender: { type: String, required: true },
      recipient: { type: String, required: true },
      content: { type: String, required: true },
      timestamp: { type: Date, default: Date.now }
    });

    const Message = mongoose.model('Message', messageSchema);

    // Token Authentication Middleware
    const authenticateToken = (req, res, next) => {
      const authHeader = req.headers['authorization'];
      const token = authHeader && authHeader.split(' ')[1];

      if (token == null) return res.sendStatus(401);

      jwt.verify(token, jwtSecret, (err, user) => {
        if (err) return res.sendStatus(403);
        req.user = user;
        next();
      });
    };

    // Signup Route
    app.post('/signup', [
      body('username').isLength({ min: 3 }).trim().escape(),
      body('email').isEmail().normalizeEmail(),
      body('phone').isMobilePhone(),
      body('password').isLength({ min: 6 }).escape(),
      body('gender').custom(value => {
        const validGenders = ['male', 'female', 'other'];
        if (!validGenders.includes(value.toLowerCase())) {
          throw new Error('Invalid gender');
        }
        return true;
      }),
      body('dob').isISO8601().toDate(),
      body('profession').isLength({ min: 3 }).trim().escape(),
      body('address').isLength({ min: 5 }).trim().escape()
    ], async (req, res) => {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        const validationErrors = errors.array();
        const addressError = validationErrors.find(err => err.param === 'address');
        if (addressError && req.body.address.length < 10) {
          return res.status(400).json({ success: false, message: 'Address must be at least 10 characters long' });
        }
        return res.status(400).json({ success: false, errors: validationErrors });
      }

      try {
        const { username, email, phone, password, gender, dob, profession, address } = req.body;

        const existingUser = await User.findOne({ username });
        if (existingUser) {
          return res.status(400).json({ success: false, message: 'User already exists' });
        }

        const hashedPassword = await bcrypt.hash(password, 10);

        const newUser = new User({
          username,
          email,
          phone,
          password: hashedPassword,
          gender: gender.toLowerCase(),
          dob,
          profession,
          address
        });

        await newUser.save();
        res.json({ success: true });

      } catch (error) {
        res.status(500).json({ success: false, message: 'Error creating user: ' + error.message });
      }
    });

app.post('/login', [
  body('username').isLength({ min: 3 }).trim().escape(),
  body('password').isLength({ min: 6 }).escape()
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ success: false, errors: errors.array() });
  }

  try {
    const { username, password } = req.body;

    const user = await User.findOne({ username });
    if (!user) {
      return res.status(400).json({ success: false, message: 'User does not exist' });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(400).json({ success: false, message: 'Incorrect password' });
    }

    const token = jwt.sign({ id: user._id }, jwtSecret, { expiresIn: '1h' });

    res.json({ success: true, token });

  } catch (error) {
    res.status(500).json({ success: false, message: 'Error logging in: ' + error.message });
  }
});
app.post('/check-email', async (req, res) => {
  const { email } = req.body;
  try {
    const user = await User.findOne({ email });
    res.json({ exists: !!user });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Error checking email: ' + error.message });
  }
});
app.post('/reset-password', [
  body('email').isEmail().normalizeEmail(),
  body('newPassword').isLength({ min: 6 }).escape()
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ success: false, errors: errors.array() });
  }

  const { email, newPassword } = req.body;
  try {
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(400).json({ success: false, message: 'User does not exist' });
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);
    user.password = hashedPassword;
    await user.save();

    res.json({ success: true, message: 'Password reset successfully' });

  } catch (error) {
    res.status(500).json({ success: false, message: 'Error resetting password: ' + error.message });
  }
});

app.get('/protected', authenticateToken, (req, res) => {
  res.json({ message: 'This is a protected route', user: req.user });
});

io.on('connection', (socket) => {
  console.log('A user connected');

  socket.on('load messages', async (username) => {
    try {
      const messages = await Message.find({
        $or: [
          { sender: username },
          { recipient: username }
        ]
      }).sort({ timestamp: 1 });
      socket.emit('load messages', messages);
    } catch (err) {
      console.error('Error loading messages:', err);
    }
  });

  socket.on('chat message', async (msg) => {
    console.log('Received message:',msg);
    const { sender, recipient, content } = msg;
    if (!sender || !recipient || !content) {
      console.error('Invalid message data:', msg);
      return;
    }

    try {
      const newMessage = new Message({
          sender: msg.sender,
          recipient: msg.recipient,
          content: msg.content,
          timestamp: new Date()
      });
      await newMessage.save();
      io.emit('chat message', msg);
  } catch (error) {
      console.error('Error saving message:', error);
  }
  });

  socket.on('disconnect', () => {
    console.log('A user disconnected');
  });
});
app.post('/contacts', [
  body('username').isLength({ min: 3 }).trim().escape(),
  body('email').isEmail().normalizeEmail(),
  body('phone').isMobilePhone(),
  body('address').isLength({ min: 5 }).trim().escape()
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ success: false, errors: errors.array() });
  }

  try {
    const { username, email, phone, address } = req.body;
    const newContact = new Contact({ username, email, phone, address });
    await newContact.save();
    res.json({ success: true, contact: newContact });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Error adding contact: ' + error.message });
  }
});

app.get('/contacts', async (req, res) => {
  try {
    const contacts = await Contact.find({});
    res.json({ success: true, contacts });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Error fetching contacts: ' + error.message });
  }
});

app.put('/contacts/:id', [
  body('username').isLength({ min: 3 }).trim().escape(),
  body('email').isEmail().normalizeEmail(),
  body('phone').isMobilePhone(),
  body('address').isLength({ min: 5 }).trim().escape()
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ success: false, errors: errors.array() });
  }

  try {
    const { id } = req.params;
    const { username, email, phone, address } = req.body;
    const updatedContact = await Contact.findByIdAndUpdate(id, { username, email, phone, address }, { new: true });
    res.json({ success: true, contact: updatedContact });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Error updating contact: ' + error.message });
  }
});

app.delete('/contacts/:id', async (req, res) => {
  try {
    const { id } = req.params;
    await Contact.findByIdAndDelete(id);
    res.json({ success: true, message: 'Contact deleted' });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Error deleting contact: ' + error.message });
  }
});
app.get('/messages/:contact', async (req, res) => {
  try {
      const messages = await Message.find({
          $or: [
              { sender: req.user.username, recipient: req.params.contact },
              { sender: req.params.contact, recipient: req.user.username }
          ]
      }).sort('timestamp');

      res.json({ success: true, messages });
  } catch (error) {
      console.error('Error fetching messages:', error);
      res.json({ success: false, message: 'Failed to fetch messages' });
  }
});

app.get('/messages', async (req, res) => {
  const { contact, username } = req.query;

  if (!contact || !username) {
      return res.status(400).json({ success: false, message: 'Missing parameters' });
  }

  try {
      const messages = await Message.find({
          $or: [
              { sender: username, recipient: contact },
              { sender: contact, recipient: username }
          ]
      }).sort('timestamp');

      res.json({ success: true, messages });
  } catch (error) {
      console.error('Error fetching messages:', error);
      res.json({ success: false, message: 'Failed to fetch messages' });
  }
});





app.use(express.static('public'));

server.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});
  })
.catch(err => console.error('MongoDB connection error:', err));