const mongoose = require('mongoose');

const TeamSchema = new mongoose.Schema({
    name: { 
        type: String, 
        required: [true, 'Please provide a team name'],
        trim: true,
        maxlength: [50, 'Team name cannot be more than 50 characters']
    },
    description: { 
        type: String, 
        maxlength: [500, 'Description cannot be more than 500 characters']
    },
    avatar: {
        type: String,
        default: 'default-team-avatar.png'
    },
    createdBy: { 
        type: mongoose.Schema.Types.ObjectId, 
        ref: 'User', 
        required: true 
    },
    members: [{
        user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        role: { 
            type: String, 
            enum: ['admin', 'member'], 
            default: 'member' 
        },
        joinedAt: { type: Date, default: Date.now }
    }],
    pendingInvites: [{
        email: String,
        invitedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        invitedAt: { type: Date, default: Date.now },
        token: String
    }],
    settings: {
        allowMemberInvites: { type: Boolean, default: false },
        taskApprovalRequired: { type: Boolean, default: false },
        allowGuestViewers: { type: Boolean, default: false }
    },
    stats: {
        totalTasks: { type: Number, default: 0 },
        completedTasks: { type: Number, default: 0 },
        totalPoints: { type: Number, default: 0 }
    },
    createdAt: { 
        type: Date, 
        default: Date.now 
    }
}, {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true }
});

// Virtual for team tasks
TeamSchema.virtual('tasks', {
    ref: 'Task',
    localField: '_id',
    foreignField: 'team'
});

// Update team stats
TeamSchema.methods.updateStats = async function() {
    const Task = mongoose.model('Task');
    
    const totalTasks = await Task.countDocuments({ team: this._id });
    const completedTasks = await Task.countDocuments({ team: this._id, completed: true });
    
    // Calculate total points earned by team
    const tasks = await Task.find({ team: this._id, completed: true });
    const totalPoints = tasks.reduce((sum, task) => sum + (task.points || 0), 0);
    
    this.stats = {
        totalTasks,
        completedTasks,
        totalPoints
    };
    
    await this.save();
};

// Check if user is member
TeamSchema.methods.isMember = function(userId) {
    return this.members.some(member => member.user.toString() === userId.toString());
};

// Check if user is admin
TeamSchema.methods.isAdmin = function(userId) {
    const member = this.members.find(m => m.user.toString() === userId.toString());
    return member && member.role === 'admin';
};

module.exports = mongoose.model('Team', TeamSchema);