const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
require('dotenv').config();

const app = express();

// Comprehensive CORS configuration
const corsOptions = {
    origin: function (origin, callback) {
        // Allow all localhost origins with any port
        const allowedOrigins = [
            'http://localhost:5500',
            'http://localhost:3000',
            'http://127.0.0.1:5500',
            'http://127.0.0.1:3000',
            'https://todolist-lyart-alpha.vercel.app',
            'https://todolist-git-main-solomonraja332-2343s-projects.vercel.app'
        ];
        
        // Allow requests with no origin (like mobile apps, curl)
        if (!origin) return callback(null, true);
        
        if (allowedOrigins.indexOf(origin) !== -1 || process.env.NODE_ENV !== 'production') {
            callback(null, true);
        } else {
            console.log('CORS blocked origin:', origin);
            callback(new Error('Not allowed by CORS'));
        }
    },
    credentials: true,
    optionsSuccessStatus: 200
};

app.use(cors(corsOptions));

// Add PNA (Private Network Access) headers
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Private-Network', 'true');
    next();
});

app.use(express.json());

// MongoDB Connection
const MONGODB_URI = process.env.MONGODB_URI;

if (!MONGODB_URI) {
    console.error('❌ MONGODB_URI is not defined in .env file!');
    process.exit(1);
}

console.log('🔌 Connecting to MongoDB...');

mongoose.connect(MONGODB_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
    serverSelectionTimeoutMS: 5000,
    socketTimeoutMS: 45000,
}).then(() => {
    console.log('✅ Connected to MongoDB Atlas successfully!');
}).catch(err => {
    console.error('❌ MongoDB connection error:', err.message);
    if (process.env.NODE_ENV !== 'production') {
        process.exit(1);
    }
});

// Models
const UserSchema = new mongoose.Schema({
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    points: { type: Number, default: 0 },
    streak: { type: Number, default: 0 },
    lastActive: { type: Date, default: Date.now },
    createdAt: { type: Date, default: Date.now }
});

const TeamSchema = new mongoose.Schema({
    name: { type: String, required: true },
    description: String,
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    members: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    createdAt: { type: Date, default: Date.now }
});

const TaskSchema = new mongoose.Schema({
    title: { type: String, required: true },
    description: String,
    type: { type: String, enum: ['simple', 'daily', 'weekly'], default: 'simple' },
    difficulty: { type: String, enum: ['easy', 'medium', 'hard'], default: 'medium' },
    completed: { type: Boolean, default: false },
    points: Number,
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    assignedTo: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    team: { type: mongoose.Schema.Types.ObjectId, ref: 'Team' },
    dueDate: Date,
    completedAt: Date,
    createdAt: { type: Date, default: Date.now }
});

const User = mongoose.model('User', UserSchema);
const Team = mongoose.model('Team', TeamSchema);
const Task = mongoose.model('Task', TaskSchema);

// Middleware to verify JWT token
const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    
    if (!token) {
        return res.status(401).json({ error: 'Access token required' });
    }
    
    jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key-change-this', (err, user) => {
        if (err) {
            return res.status(403).json({ error: 'Invalid or expired token' });
        }
        req.user = user;
        next();
    });
};

// Health check endpoint
app.get('/api/health', (req, res) => {
    res.json({ 
        status: 'OK', 
        message: 'Server is running',
        database: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
        timestamp: new Date()
    });
});

// Auth Routes
app.post('/api/auth/register', async (req, res) => {
    try {
        const { name, email, password } = req.body;
        
        const existingUser = await User.findOne({ email });
        if (existingUser) {
            return res.status(400).json({ error: 'Email already registered' });
        }
        
        const hashedPassword = await bcrypt.hash(password, 10);
        
        const user = new User({
            name,
            email,
            password: hashedPassword
        });
        
        await user.save();
        
        const token = jwt.sign(
            { id: user._id, email: user.email },
            process.env.JWT_SECRET || 'your-secret-key-change-this',
            { expiresIn: '7d' }
        );
        
        res.status(201).json({
            token,
            user: {
                id: user._id,
                name: user.name,
                email: user.email,
                points: user.points,
                streak: user.streak
            }
        });
    } catch (error) {
        console.error('Registration error:', error);
        res.status(500).json({ error: 'Registration failed' });
    }
});

app.post('/api/auth/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        
        const user = await User.findOne({ email });
        if (!user) {
            return res.status(401).json({ error: 'Invalid email or password' });
        }
        
        const validPassword = await bcrypt.compare(password, user.password);
        if (!validPassword) {
            return res.status(401).json({ error: 'Invalid email or password' });
        }
        
        user.lastActive = new Date();
        await user.save();
        
        const token = jwt.sign(
            { id: user._id, email: user.email },
            process.env.JWT_SECRET || 'your-secret-key-change-this',
            { expiresIn: '7d' }
        );
        
        res.json({
            token,
            user: {
                id: user._id,
                name: user.name,
                email: user.email,
                points: user.points,
                streak: user.streak
            }
        });
    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ error: 'Login failed' });
    }
});

app.get('/api/auth/verify', authenticateToken, async (req, res) => {
    try {
        const user = await User.findById(req.user.id).select('-password');
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }
        res.json({ user });
    } catch (error) {
        console.error('Verification error:', error);
        res.status(500).json({ error: 'Verification failed' });
    }
});

// Task Routes
app.get('/api/tasks', authenticateToken, async (req, res) => {
    try {
        const tasks = await Task.find({
            $or: [
                { createdBy: req.user.id },
                { assignedTo: req.user.id }
            ]
        }).populate('createdBy', 'name')
          .populate('assignedTo', 'name')
          .populate('team', 'name members');
        
        res.json(tasks);
    } catch (error) {
        console.error('Get tasks error:', error);
        res.status(500).json({ error: 'Failed to fetch tasks' });
    }
});

app.post('/api/tasks', authenticateToken, async (req, res) => {
    try {
        const { title, type, difficulty, dueDate, mode, teamId } = req.body;
        
        const points = {
            easy: 10,
            medium: 20,
            hard: 30
        }[difficulty] + (type === 'daily' ? 5 : type === 'weekly' ? 15 : 0);
        
        const task = new Task({
            title,
            type,
            difficulty,
            dueDate,
            points,
            createdBy: req.user.id,
            assignedTo: mode === 'team' ? null : req.user.id,
            team: teamId || null
        });
        
        await task.save();
        
        const populatedTask = await Task.findById(task._id)
            .populate('createdBy', 'name')
            .populate('assignedTo', 'name')
            .populate('team', 'name members');
        
        res.status(201).json(populatedTask);
    } catch (error) {
        console.error('Create task error:', error);
        res.status(500).json({ error: 'Failed to create task' });
    }
});

app.put('/api/tasks/:id', authenticateToken, async (req, res) => {
    try {
        const { completed, title } = req.body;
        const task = await Task.findById(req.params.id);
        
        if (!task) {
            return res.status(404).json({ error: 'Task not found' });
        }
        
        if (task.createdBy.toString() !== req.user.id && task.assignedTo?.toString() !== req.user.id) {
            return res.status(403).json({ error: 'Permission denied' });
        }
        
        if (title !== undefined) task.title = title;
        if (completed !== undefined) {
            task.completed = completed;
            task.completedAt = completed ? new Date() : null;
            
            if (completed && !task.completed) {
                const user = await User.findById(req.user.id);
                user.points += task.points;
                
                const lastActive = new Date(user.lastActive);
                const today = new Date();
                const diffDays = Math.floor((today - lastActive) / (1000 * 60 * 60 * 24));
                
                if (diffDays === 1) {
                    user.streak += 1;
                } else if (diffDays > 1) {
                    user.streak = 1;
                }
                
                user.lastActive = today;
                await user.save();
            }
        }
        
        await task.save();
        
        const updatedTask = await Task.findById(task._id)
            .populate('createdBy', 'name')
            .populate('assignedTo', 'name')
            .populate('team', 'name members');
        
        res.json(updatedTask);
    } catch (error) {
        console.error('Update task error:', error);
        res.status(500).json({ error: 'Failed to update task' });
    }
});

app.delete('/api/tasks/:id', authenticateToken, async (req, res) => {
    try {
        const task = await Task.findById(req.params.id);
        
        if (!task) {
            return res.status(404).json({ error: 'Task not found' });
        }
        
        if (task.createdBy.toString() !== req.user.id) {
            return res.status(403).json({ error: 'Permission denied' });
        }
        
        await task.deleteOne();
        res.json({ message: 'Task deleted successfully' });
    } catch (error) {
        console.error('Delete task error:', error);
        res.status(500).json({ error: 'Failed to delete task' });
    }
});

// Team Routes
app.get('/api/teams', authenticateToken, async (req, res) => {
    try {
        const teams = await Team.find({
            members: req.user.id
        }).populate('members', 'name points');
        
        res.json(teams);
    } catch (error) {
        console.error('Get teams error:', error);
        res.status(500).json({ error: 'Failed to fetch teams' });
    }
});

app.post('/api/teams', authenticateToken, async (req, res) => {
    try {
        const { name, description } = req.body;
        
        const team = new Team({
            name,
            description,
            createdBy: req.user.id,
            members: [req.user.id]
        });
        
        await team.save();
        
        const populatedTeam = await Team.findById(team._id)
            .populate('members', 'name points');
        
        res.status(201).json(populatedTeam);
    } catch (error) {
        console.error('Create team error:', error);
        res.status(500).json({ error: 'Failed to create team' });
    }
});

app.get('/api/teams/:id/leaderboard', authenticateToken, async (req, res) => {
    try {
        const team = await Team.findById(req.params.id);
        
        if (!team) {
            return res.status(404).json({ error: 'Team not found' });
        }
        
        if (!team.members.includes(req.user.id)) {
            return res.status(403).json({ error: 'Not a team member' });
        }
        
        const members = await User.find({
            _id: { $in: team.members }
        }).select('name points');
        
        members.sort((a, b) => b.points - a.points);
        
        res.json(members);
    } catch (error) {
        console.error('Get leaderboard error:', error);
        res.status(500).json({ error: 'Failed to fetch leaderboard' });
    }
});

// User Stats Route - ENHANCED VERSION
app.get('/api/users/:id/stats', authenticateToken, async (req, res) => {
    try {
        console.log('Stats requested for user:', req.params.id);
        
        // Verify the user is requesting their own stats
        if (req.params.id !== req.user.id) {
            return res.status(403).json({ error: 'Can only access your own stats' });
        }
        
        const user = await User.findById(req.params.id).select('points streak lastActive');
        
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }
        
        // Get additional stats from tasks for a more complete response
        const tasks = await Task.find({
            $or: [
                { createdBy: req.user.id },
                { assignedTo: req.user.id }
            ]
        });
        
        const completedTasks = tasks.filter(t => t.completed).length;
        const totalTasks = tasks.length;
        const completionRate = totalTasks > 0 ? (completedTasks / totalTasks) * 100 : 0;
        
        // Get today's completed tasks
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        
        const todayTasks = tasks.filter(t => 
            t.completed && t.completedAt && new Date(t.completedAt) >= today
        ).length;
        
        res.json({
            points: user.points,
            streak: user.streak,
            lastActive: user.lastActive,
            completedTasks,
            totalTasks,
            completionRate: Math.round(completionRate * 100) / 100,
            todayTasks
        });
    } catch (error) {
        console.error('Get stats error:', error);
        res.status(500).json({ error: 'Failed to fetch stats' });
    }
});

// Error handling middleware
app.use((err, req, res, next) => {
    console.error('Unhandled error:', err);
    res.status(500).json({ error: 'Something went wrong!' });
});

// 404 handler
app.use('*', (req, res) => {
    console.log('404 - Route not found:', req.originalUrl);
    res.status(404).json({ error: 'Route not found' });
});

// Start server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
    console.log(`🔗 Local: http://localhost:${PORT}`);
    console.log(`🔗 API: http://localhost:${PORT}/api/health`);
});