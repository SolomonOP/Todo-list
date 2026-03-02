const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const UserSchema = new mongoose.Schema({
    name: { 
        type: String, 
        required: [true, 'Please provide a name'],
        trim: true,
        maxlength: [50, 'Name cannot be more than 50 characters']
    },
    email: { 
        type: String, 
        required: [true, 'Please provide an email'],
        unique: true,
        lowercase: true,
        match: [
            /^\w+([\.-]?\w+)*@\w+([\.-]?\w+)*(\.\w{2,3})+$/,
            'Please provide a valid email'
        ]
    },
    password: { 
        type: String, 
        required: [true, 'Please provide a password'],
        minlength: 6,
        select: false
    },
    avatar: {
        type: String,
        default: 'default-avatar.png'
    },
    points: { 
        type: Number, 
        default: 0 
    },
    streak: { 
        type: Number, 
        default: 0 
    },
    level: {
        type: Number,
        default: 1
    },
    badges: [{
        name: String,
        icon: String,
        earnedAt: { type: Date, default: Date.now }
    }],
    achievements: [{
        name: String,
        description: String,
        unlockedAt: Date
    }],
    lastActive: { 
        type: Date, 
        default: Date.now 
    },
    settings: {
        emailNotifications: { type: Boolean, default: true },
        pushNotifications: { type: Boolean, default: true },
        soundEffects: { type: Boolean, default: true },
        theme: { type: String, enum: ['light', 'dark'], default: 'light' }
    },
    friends: [{
        user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        status: { type: String, enum: ['pending', 'accepted', 'blocked'], default: 'pending' }
    }],
    createdAt: { 
        type: Date, 
        default: Date.now 
    }
}, {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true }
});

// Virtual for tasks count
UserSchema.virtual('tasksCount', {
    ref: 'Task',
    localField: '_id',
    foreignField: 'createdBy',
    count: true
});

// Virtual for completed tasks count
UserSchema.virtual('completedTasksCount', {
    ref: 'Task',
    localField: '_id',
    foreignField: 'createdBy',
    count: true,
    match: { completed: true }
});

// Hash password before saving
UserSchema.pre('save', async function(next) {
    if (!this.isModified('password')) {
        return next();
    }
    const salt = await bcrypt.genSalt(parseInt(process.env.BCRYPT_SALT) || 10);
    this.password = await bcrypt.hash(this.password, salt);
    next();
});

// Compare password method
UserSchema.methods.comparePassword = async function(candidatePassword) {
    return await bcrypt.compare(candidatePassword, this.password);
};

// Update level based on points
UserSchema.methods.updateLevel = function() {
    const pointsPerLevel = 100;
    this.level = Math.floor(this.points / pointsPerLevel) + 1;
};

// Check and award achievements
UserSchema.methods.checkAchievements = async function() {
    const achievements = [];
    
    // First task achievement
    const taskCount = await mongoose.model('Task').countDocuments({ createdBy: this._id });
    if (taskCount >= 1 && !this.achievements.find(a => a.name === 'First Steps')) {
        achievements.push({
            name: 'First Steps',
            description: 'Created your first task',
            unlockedAt: new Date()
        });
    }
    
    // 100 tasks achievement
    if (taskCount >= 100 && !this.achievements.find(a => a.name === 'Task Master')) {
        achievements.push({
            name: 'Task Master',
            description: 'Created 100 tasks',
            unlockedAt: new Date()
        });
    }
    
    // 7-day streak achievement
    if (this.streak >= 7 && !this.achievements.find(a => a.name === 'Consistency King')) {
        achievements.push({
            name: 'Consistency King',
            description: 'Maintained a 7-day streak',
            unlockedAt: new Date()
        });
    }
    
    // 30-day streak achievement
    if (this.streak >= 30 && !this.achievements.find(a => a.name === 'Unstoppable')) {
        achievements.push({
            name: 'Unstoppable',
            description: 'Maintained a 30-day streak',
            unlockedAt: new Date()
        });
    }
    
    if (achievements.length > 0) {
        this.achievements.push(...achievements);
        await this.save();
    }
    
    return achievements;
};

module.exports = mongoose.model('User', UserSchema);