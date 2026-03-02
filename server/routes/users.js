const express = require('express');
const router = express.Router();
const User = require('../models/User');
const Task = require('../models/Task');
const { protect } = require('../middleware/auth');
const multer = require('multer');
const path = require('path');

// Configure multer for avatar uploads
const storage = multer.diskStorage({
    destination: function(req, file, cb) {
        cb(null, 'uploads/avatars/');
    },
    filename: function(req, file, cb) {
        cb(null, `avatar-${req.user.id}${path.extname(file.originalname)}`);
    }
});

const upload = multer({ 
    storage: storage,
    limits: { fileSize: 2 * 1024 * 1024 }, // 2MB limit
    fileFilter: function(req, file, cb) {
        const filetypes = /jpeg|jpg|png|gif/;
        const extname = filetypes.test(path.extname(file.originalname).toLowerCase());
        const mimetype = filetypes.test(file.mimetype);
        
        if (mimetype && extname) {
            return cb(null, true);
        } else {
            cb(new Error('Only image files are allowed'));
        }
    }
});

// @route   GET /api/users/profile
// @desc    Get user profile
// @access  Private
router.get('/profile', protect, async (req, res) => {
    try {
        const user = await User.findById(req.user.id)
            .select('-password')
            .populate('friends.user', 'name email avatar');

        // Get user stats
        const tasks = await Task.find({
            $or: [
                { createdBy: req.user.id },
                { assignedTo: req.user.id }
            ]
        });

        const completedTasks = tasks.filter(t => t.completed);
        const totalPoints = tasks.reduce((sum, t) => sum + (t.completed ? t.points : 0), 0);
        
        // Get this week's activity
        const weekAgo = new Date();
        weekAgo.setDate(weekAgo.getDate() - 7);
        
        const weeklyTasks = tasks.filter(t => t.createdAt >= weekAgo);
        const weeklyCompleted = weeklyTasks.filter(t => t.completed).length;

        res.json({
            success: true,
            user,
            stats: {
                totalTasks: tasks.length,
                completedTasks: completedTasks.length,
                completionRate: tasks.length > 0 ? (completedTasks.length / tasks.length) * 100 : 0,
                totalPoints,
                weeklyTasks: weeklyTasks.length,
                weeklyCompleted,
                level: Math.floor(totalPoints / 100) + 1
            }
        });

    } catch (error) {
        console.error('Get profile error:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

// @route   PUT /api/users/profile
// @desc    Update user profile
// @access  Private
router.put('/profile', protect, async (req, res) => {
    try {
        const allowedUpdates = ['name', 'settings'];
        const updates = {};
        
        Object.keys(req.body).forEach(key => {
            if (allowedUpdates.includes(key)) {
                updates[key] = req.body[key];
            }
        });

        const user = await User.findByIdAndUpdate(
            req.user.id,
            { $set: updates },
            { new: true, runValidators: true }
        ).select('-password');

        res.json({
            success: true,
            user
        });

    } catch (error) {
        console.error('Update profile error:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

// @route   POST /api/users/avatar
// @desc    Upload avatar
// @access  Private
router.post('/avatar', protect, upload.single('avatar'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'Please upload an image' });
        }

        const avatarUrl = `/uploads/avatars/${req.file.filename}`;
        
        const user = await User.findByIdAndUpdate(
            req.user.id,
            { avatar: avatarUrl },
            { new: true }
        ).select('-password');

        res.json({
            success: true,
            avatar: avatarUrl,
            user
        });

    } catch (error) {
        console.error('Upload avatar error:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

// @route   GET /api/users/achievements
// @desc    Get user achievements
// @access  Private
router.get('/achievements', protect, async (req, res) => {
    try {
        const user = await User.findById(req.user.id).select('achievements badges');
        
        // Define all possible achievements
        const allAchievements = [
            {
                name: 'First Steps',
                description: 'Complete your first task',
                icon: '🌟',
                condition: 'Complete 1 task',
                points: 10
            },
            {
                name: 'Getting Things Done',
                description: 'Complete 10 tasks',
                icon: '📋',
                condition: 'Complete 10 tasks',
                points: 50
            },
            {
                name: 'Task Master',
                description: 'Complete 100 tasks',
                icon: '👑',
                condition: 'Complete 100 tasks',
                points: 200
            },
            {
                name: 'Consistency King',
                description: 'Maintain a 7-day streak',
                icon: '🔥',
                condition: '7 day streak',
                points: 100
            },
            {
                name: 'Unstoppable',
                description: 'Maintain a 30-day streak',
                icon: '⚡',
                condition: '30 day streak',
                points: 500
            },
            {
                name: 'Team Player',
                description: 'Join a team',
                icon: '🤝',
                condition: 'Join first team',
                points: 50
            },
            {
                name: 'Team Leader',
                description: 'Create a team',
                icon: '👥',
                condition: 'Create first team',
                points: 100
            },
            {
                name: 'Hard Worker',
                description: 'Complete 10 hard tasks',
                icon: '💪',
                condition: 'Complete 10 hard difficulty tasks',
                points: 150
            },
            {
                name: 'Early Bird',
                description: 'Complete 5 tasks before 9 AM',
                icon: '🌅',
                condition: '5 early tasks',
                points: 75
            },
            {
                name: 'Night Owl',
                description: 'Complete 5 tasks after 10 PM',
                icon: '🦉',
                condition: '5 late night tasks',
                points: 75
            }
        ];

        // Mark which achievements are unlocked
        const achievementsWithStatus = allAchievements.map(ach => ({
            ...ach,
            unlocked: user.achievements.some(a => a.name === ach.name),
            unlockedAt: user.achievements.find(a => a.name === ach.name)?.unlockedAt
        }));

        res.json({
            success: true,
            achievements: achievementsWithStatus,
            badges: user.badges
        });

    } catch (error) {
        console.error('Get achievements error:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

// @route   GET /api/users/stats
// @desc    Get user statistics
// @access  Private
router.get('/stats', protect, async (req, res) => {
    try {
        const { timeframe = 'week' } = req.query;
        
        let startDate = new Date();
        
        switch(timeframe) {
            case 'week':
                startDate.setDate(startDate.getDate() - 7);
                break;
            case 'month':
                startDate.setMonth(startDate.getMonth() - 1);
                break;
            case 'year':
                startDate.setFullYear(startDate.getFullYear() - 1);
                break;
            default:
                startDate.setDate(startDate.getDate() - 7);
        }

        const tasks = await Task.find({
            $or: [
                { createdBy: req.user.id },
                { assignedTo: req.user.id }
            ],
            createdAt: { $gte: startDate }
        }).sort({ createdAt: 1 });

        // Group by date
        const dailyStats = {};
        tasks.forEach(task => {
            const date = task.createdAt.toISOString().split('T')[0];
            if (!dailyStats[date]) {
                dailyStats[date] = {
                    date,
                    total: 0,
                    completed: 0,
                    points: 0
                };
            }
            dailyStats[date].total++;
            if (task.completed) {
                dailyStats[date].completed++;
                dailyStats[date].points += task.points || 0;
            }
        });

        // Get task distribution by type
        const byType = {
            simple: tasks.filter(t => t.type === 'simple').length,
            daily: tasks.filter(t => t.type === 'daily').length,
            weekly: tasks.filter(t => t.type === 'weekly').length,
            monthly: tasks.filter(t => t.type === 'monthly').length
        };

        // Get task distribution by difficulty
        const byDifficulty = {
            easy: tasks.filter(t => t.difficulty === 'easy').length,
            medium: tasks.filter(t => t.difficulty === 'medium').length,
            hard: tasks.filter(t => t.difficulty === 'hard').length
        };

        res.json({
            success: true,
            timeframe,
            dailyStats: Object.values(dailyStats),
            byType,
            byDifficulty,
            total: tasks.length,
            completed: tasks.filter(t => t.completed).length,
            totalPoints: tasks.reduce((sum, t) => sum + (t.completed ? t.points : 0), 0)
        });

    } catch (error) {
        console.error('Get stats error:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

// @route   POST /api/users/friends/request/:userId
// @desc    Send friend request
// @access  Private
router.post('/friends/request/:userId', protect, async (req, res) => {
    try {
        const friend = await User.findById(req.params.userId);
        
        if (!friend) {
            return res.status(404).json({ error: 'User not found' });
        }

        if (req.user.id === req.params.userId) {
            return res.status(400).json({ error: 'Cannot send friend request to yourself' });
        }

        const user = await User.findById(req.user.id);

        // Check if already friends or request pending
        const existingFriendship = user.friends.find(f => 
            f.user.toString() === req.params.userId
        );

        if (existingFriendship) {
            if (existingFriendship.status === 'accepted') {
                return res.status(400).json({ error: 'Already friends with this user' });
            } else if (existingFriendship.status === 'pending') {
                return res.status(400).json({ error: 'Friend request already pending' });
            }
        }

        // Add to current user's friends list
        user.friends.push({
            user: req.params.userId,
            status: 'pending'
        });
        await user.save();

        // Add to friend's friends list
        friend.friends.push({
            user: req.user.id,
            status: 'pending'
        });
        await friend.save();

        // Send notification
        const Notification = require('../models/Notification');
        const notification = new Notification({
            user: req.params.userId,
            type: 'friend_request',
            title: 'Friend Request',
            message: `${user.name} sent you a friend request`,
            data: { userId: req.user.id },
            actionUrl: '/friends',
            icon: 'person_add'
        });
        await notification.save();

        const io = req.app.get('io');
        io.to(`user:${req.params.userId}`).emit('notification', notification);

        res.json({
            success: true,
            message: 'Friend request sent'
        });

    } catch (error) {
        console.error('Friend request error:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

// @route   PUT /api/users/friends/accept/:userId
// @desc    Accept friend request
// @access  Private
router.put('/friends/accept/:userId', protect, async (req, res) => {
    try {
        const user = await User.findById(req.user.id);
        const friend = await User.findById(req.params.userId);

        if (!friend) {
            return res.status(404).json({ error: 'User not found' });
        }

        // Update current user's friend status
        const userFriendship = user.friends.find(f => 
            f.user.toString() === req.params.userId
        );

        if (!userFriendship || userFriendship.status !== 'pending') {
            return res.status(400).json({ error: 'No pending friend request from this user' });
        }

        userFriendship.status = 'accepted';

        // Update friend's status
        const friendFriendship = friend.friends.find(f => 
            f.user.toString() === req.user.id
        );

        if (friendFriendship) {
            friendFriendship.status = 'accepted';
        }

        await user.save();
        await friend.save();

        // Send notification
        const Notification = require('../models/Notification');
        const notification = new Notification({
            user: req.params.userId,
            type: 'friend_request',
            title: 'Friend Request Accepted',
            message: `${user.name} accepted your friend request`,
            data: { userId: req.user.id },
            icon: 'check'
        });
        await notification.save();

        const io = req.app.get('io');
        io.to(`user:${req.params.userId}`).emit('notification', notification);

        res.json({
            success: true,
            message: 'Friend request accepted'
        });

    } catch (error) {
        console.error('Accept friend error:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

module.exports = router;