const mongoose = require('mongoose');

const TaskSchema = new mongoose.Schema({
    title: { 
        type: String, 
        required: [true, 'Please provide a task title'],
        trim: true,
        maxlength: [100, 'Title cannot be more than 100 characters']
    },
    description: { 
        type: String, 
        maxlength: [500, 'Description cannot be more than 500 characters']
    },
    type: { 
        type: String, 
        enum: ['simple', 'daily', 'weekly', 'monthly'], 
        default: 'simple' 
    },
    difficulty: { 
        type: String, 
        enum: ['easy', 'medium', 'hard'], 
        default: 'medium' 
    },
    status: {
        type: String,
        enum: ['pending', 'in-progress', 'completed', 'overdue'],
        default: 'pending'
    },
    priority: {
        type: String,
        enum: ['low', 'medium', 'high', 'critical'],
        default: 'medium'
    },
    completed: { 
        type: Boolean, 
        default: false 
    },
    points: {
        type: Number,
        min: 0
    },
    createdBy: { 
        type: mongoose.Schema.Types.ObjectId, 
        ref: 'User', 
        required: true 
    },
    assignedTo: { 
        type: mongoose.Schema.Types.ObjectId, 
        ref: 'User' 
    },
    team: { 
        type: mongoose.Schema.Types.ObjectId, 
        ref: 'Team' 
    },
    dueDate: {
        type: Date,
        required: [true, 'Please provide a due date']
    },
    completedAt: Date,
    attachments: [{
        filename: String,
        url: String,
        uploadedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        uploadedAt: { type: Date, default: Date.now }
    }],
    comments: [{
        text: String,
        createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        createdAt: { type: Date, default: Date.now }
    }],
    subtasks: [{
        title: String,
        completed: { type: Boolean, default: false },
        completedAt: Date
    }],
    tags: [String],
    recurrence: {
        frequency: { type: String, enum: ['daily', 'weekly', 'monthly', 'none'], default: 'none' },
        endDate: Date,
        count: Number
    },
    createdAt: { 
        type: Date, 
        default: Date.now 
    }
}, {
    timestamps: true
});

// Calculate points before saving
TaskSchema.pre('save', function(next) {
    if (this.isModified('difficulty') || this.isModified('type')) {
        const difficultyPoints = {
            easy: 10,
            medium: 20,
            hard: 30
        };
        
        const typeBonus = {
            simple: 0,
            daily: 5,
            weekly: 15,
            monthly: 30
        };
        
        this.points = (difficultyPoints[this.difficulty] || 20) + (typeBonus[this.type] || 0);
    }
    
    // Update status based on due date and completion
    if (!this.completed && this.dueDate < new Date()) {
        this.status = 'overdue';
    } else if (this.completed) {
        this.status = 'completed';
    }
    
    next();
});

// After save, update team stats if team task
TaskSchema.post('save', async function() {
    if (this.team) {
        const Team = mongoose.model('Team');
        const team = await Team.findById(this.team);
        if (team) {
            await team.updateStats();
        }
    }
});

// Update user stats when task completed
TaskSchema.post('save', async function() {
    if (this.completed && !this._previousCompleted) {
        const User = mongoose.model('User');
        const user = await User.findById(this.assignedTo || this.createdBy);
        
        if (user) {
            user.points += this.points;
            
            // Update streak
            const today = new Date().setHours(0, 0, 0, 0);
            const lastActive = new Date(user.lastActive).setHours(0, 0, 0, 0);
            
            if (today - lastActive === 86400000) { // 1 day in milliseconds
                user.streak += 1;
            } else if (today > lastActive) {
                user.streak = 1;
            }
            
            user.lastActive = new Date();
            await user.save();
            
            // Check for achievements
            await user.checkAchievements();
        }
    }
    
    this._previousCompleted = this.completed;
});

module.exports = mongoose.model('Task', TaskSchema);