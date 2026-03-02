const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const Task = require('../models/Task');
const User = require('../models/User');
const Notification = require('../models/Notification');
const { protect } = require('../middleware/auth');
const multer = require('multer');
const path = require('path');

// Configure multer for file uploads
const storage = multer.diskStorage({
    destination: function(req, file, cb) {
        cb(null, 'uploads/');
    },
    filename: function(req, file, cb) {
        cb(null, `task-${Date.now()}${path.extname(file.originalname)}`);
    }
});

const upload = multer({ 
    storage: storage,
    limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
    fileFilter: function(req, file, cb) {
        const filetypes = /jpeg|jpg|png|gif|pdf|doc|docx|txt/;
        const extname = filetypes.test(path.extname(file.originalname).toLowerCase());
        const mimetype = filetypes.test(file.mimetype);
        
        if (mimetype && extname) {
            return cb(null, true);
        } else {
            cb(new Error('Only images, documents, and text files are allowed'));
        }
    }
});

// @route   GET /api/tasks
// @desc    Get all tasks for current user
// @access  Private
router.get('/', protect, async (req, res) => {
    try {
        const { status, type, priority, team, page = 1, limit = 10 } = req.query;
        
        // Build query
        let query = {
            $or: [
                { createdBy: req.user.id },
                { assignedTo: req.user.id }
            ]
        };
        
        if (status) query.status = status;
        if (type) query.type = type;
        if (priority) query.priority = priority;
        if (team) query.team = team;
        
        // Pagination
        const skip = (parseInt(page) - 1) * parseInt(limit);
        
        // Execute query
        const tasks = await Task.find(query)
            .populate('createdBy', 'name email avatar')
            .populate('assignedTo', 'name email avatar')
            .populate('team', 'name avatar')
            .populate('comments.createdBy', 'name avatar')
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(parseInt(limit));
        
        // Get total count
        const total = await Task.countDocuments(query);
        
        res.json({
            success: true,
            tasks,
            pagination: {
                page: parseInt(page),
                limit: parseInt(limit),
                total,
                pages: Math.ceil(total / parseInt(limit))
            }
        });
        
    } catch (error) {
        console.error('Get tasks error:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

// @route   GET /api/tasks/:id
// @desc    Get single task
// @access  Private
router.get('/:id', protect, async (req, res) => {
    try {
        const task = await Task.findById(req.params.id)
            .populate('createdBy', 'name email avatar')
            .populate('assignedTo', 'name email avatar')
            .populate('team', 'name avatar members')
            .populate('comments.createdBy', 'name avatar')
            .populate('attachments.uploadedBy', 'name avatar');
        
        if (!task) {
            return res.status(404).json({ error: 'Task not found' });
        }
        
        // Check if user has access to this task
        const hasAccess = task.createdBy._id.toString() === req.user.id ||
                         (task.assignedTo && task.assignedTo._id.toString() === req.user.id) ||
                         (task.team && task.team.members.some(m => m.user.toString() === req.user.id));
        
        if (!hasAccess) {
            return res.status(403).json({ error: 'Not authorized to view this task' });
        }
        
        res.json({
            success: true,
            task
        });
        
    } catch (error) {
        console.error('Get task error:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

// @route   POST /api/tasks
// @desc    Create a new task
// @access  Private
router.post('/', [
    protect,
    body('title').notEmpty().withMessage('Title is required'),
    body('dueDate').isISO8601().withMessage('Valid due date is required')
], async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }

        const taskData = {
            ...req.body,
            createdBy: req.user.id
        };

        // If assigned to someone, validate they exist
        if (taskData.assignedTo) {
            const assignedUser = await User.findById(taskData.assignedTo);
            if (!assignedUser) {
                return res.status(400).json({ error: 'Assigned user not found' });
            }
        }

        // Create task
        const task = new Task(taskData);
        await task.save();

        // Populate task data
        const populatedTask = await Task.findById(task._id)
            .populate('createdBy', 'name email avatar')
            .populate('assignedTo', 'name email avatar')
            .populate('team', 'name avatar');

        // Create notification if task is assigned
        if (taskData.assignedTo && taskData.assignedTo !== req.user.id) {
            const notification = new Notification({
                user: taskData.assignedTo,
                type: 'task_assigned',
                title: 'New Task Assigned',
                message: `You have been assigned a new task: ${task.title}`,
                data: { taskId: task._id },
                actionUrl: `/tasks/${task._id}`,
                icon: 'task'
            });
            await notification.save();

            // Emit socket event
            const io = req.app.get('io');
            io.to(`user:${taskData.assignedTo}`).emit('notification', notification);
        }

        // If team task, notify all team members
        if (taskData.team) {
            const io = req.app.get('io');
            io.to(`team:${taskData.team}`).emit('new-task', {
                task: populatedTask,
                message: `New task created: ${task.title}`
            });
        }

        res.status(201).json({
            success: true,
            task: populatedTask
        });

    } catch (error) {
        console.error('Create task error:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

// @route   PUT /api/tasks/:id
// @desc    Update task
// @access  Private
router.put('/:id', protect, async (req, res) => {
    try {
        let task = await Task.findById(req.params.id);
        
        if (!task) {
            return res.status(404).json({ error: 'Task not found' });
        }
        
        // Check permission
        const isCreator = task.createdBy.toString() === req.user.id;
        const isAssigned = task.assignedTo && task.assignedTo.toString() === req.user.id;
        
        if (!isCreator && !isAssigned) {
            return res.status(403).json({ error: 'Not authorized to update this task' });
        }

        // Store previous state for comparison
        const wasCompleted = task.completed;
        const previousAssignee = task.assignedTo;

        // Update task
        task = await Task.findByIdAndUpdate(
            req.params.id,
            { $set: req.body },
            { new: true, runValidators: true }
        ).populate('createdBy', 'name email avatar')
         .populate('assignedTo', 'name email avatar')
         .populate('team', 'name avatar');

        // Check if task was just completed
        if (!wasCompleted && task.completed) {
            // Create achievement notification
            const notification = new Notification({
                user: task.assignedTo || task.createdBy,
                type: 'task_completed',
                title: 'Task Completed!',
                message: `Congratulations! You completed: ${task.title} (+${task.points} points)`,
                data: { taskId: task._id, points: task.points },
                actionUrl: `/tasks/${task._id}`,
                icon: 'completed',
                color: 'success'
            });
            await notification.save();

            // Emit socket event
            const io = req.app.get('io');
            io.to(`user:${task.assignedTo || task.createdBy}`).emit('notification', notification);
        }

        // Check if task was reassigned
        if (previousAssignee && previousAssignee.toString() !== task.assignedTo?.toString()) {
            const notification = new Notification({
                user: task.assignedTo,
                type: 'task_assigned',
                title: 'Task Assigned to You',
                message: `A task has been assigned to you: ${task.title}`,
                data: { taskId: task._id },
                actionUrl: `/tasks/${task._id}`,
                icon: 'assignment'
            });
            await notification.save();

            const io = req.app.get('io');
            io.to(`user:${task.assignedTo}`).emit('notification', notification);
        }

        res.json({
            success: true,
            task
        });

    } catch (error) {
        console.error('Update task error:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

// @route   DELETE /api/tasks/:id
// @desc    Delete task
// @access  Private
router.delete('/:id', protect, async (req, res) => {
    try {
        const task = await Task.findById(req.params.id);
        
        if (!task) {
            return res.status(404).json({ error: 'Task not found' });
        }
        
        // Check permission (only creator can delete)
        if (task.createdBy.toString() !== req.user.id) {
            return res.status(403).json({ error: 'Not authorized to delete this task' });
        }
        
        await task.deleteOne();
        
        res.json({
            success: true,
            message: 'Task deleted successfully'
        });

    } catch (error) {
        console.error('Delete task error:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

// @route   POST /api/tasks/:id/comments
// @desc    Add comment to task
// @access  Private
router.post('/:id/comments', [
    protect,
    body('text').notEmpty().withMessage('Comment text is required')
], async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }

        const task = await Task.findById(req.params.id);
        
        if (!task) {
            return res.status(404).json({ error: 'Task not found' });
        }

        const comment = {
            text: req.body.text,
            createdBy: req.user.id,
            createdAt: new Date()
        };

        task.comments.push(comment);
        await task.save();

        // Populate user info for the new comment
        const populatedTask = await Task.findById(task._id)
            .populate('comments.createdBy', 'name avatar');

        const newComment = populatedTask.comments[populatedTask.comments.length - 1];

        // Notify task creator/assignee if they're not the commenter
        const notifyUser = task.assignedTo || task.createdBy;
        if (notifyUser.toString() !== req.user.id) {
            const notification = new Notification({
                user: notifyUser,
                type: 'comment',
                title: 'New Comment',
                message: `${req.user.name} commented on task: ${task.title}`,
                data: { taskId: task._id, commentId: newComment._id },
                actionUrl: `/tasks/${task._id}`,
                icon: 'comment'
            });
            await notification.save();

            const io = req.app.get('io');
            io.to(`user:${notifyUser}`).emit('notification', notification);
        }

        res.json({
            success: true,
            comment: newComment
        });

    } catch (error) {
        console.error('Add comment error:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

// @route   POST /api/tasks/:id/attachments
// @desc    Upload attachment to task
// @access  Private
router.post('/:id/attachments', protect, upload.single('file'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'Please upload a file' });
        }

        const task = await Task.findById(req.params.id);
        
        if (!task) {
            return res.status(404).json({ error: 'Task not found' });
        }

        const attachment = {
            filename: req.file.originalname,
            url: `/uploads/${req.file.filename}`,
            uploadedBy: req.user.id,
            uploadedAt: new Date()
        };

        task.attachments.push(attachment);
        await task.save();

        res.json({
            success: true,
            attachment
        });

    } catch (error) {
        console.error('Upload attachment error:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

// @route   PUT /api/tasks/:id/subtasks/:subtaskId
// @desc    Toggle subtask completion
// @access  Private
router.put('/:id/subtasks/:subtaskId', protect, async (req, res) => {
    try {
        const task = await Task.findById(req.params.id);
        
        if (!task) {
            return res.status(404).json({ error: 'Task not found' });
        }

        const subtask = task.subtasks.id(req.params.subtaskId);
        if (!subtask) {
            return res.status(404).json({ error: 'Subtask not found' });
        }

        subtask.completed = !subtask.completed;
        subtask.completedAt = subtask.completed ? new Date() : null;
        
        await task.save();

        // Check if all subtasks are completed
        const allCompleted = task.subtasks.every(st => st.completed);
        
        res.json({
            success: true,
            subtask,
            allCompleted
        });

    } catch (error) {
        console.error('Toggle subtask error:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

module.exports = router;