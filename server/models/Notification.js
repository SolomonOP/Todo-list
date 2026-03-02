const mongoose = require('mongoose');

const NotificationSchema = new mongoose.Schema({
    user: { 
        type: mongoose.Schema.Types.ObjectId, 
        ref: 'User', 
        required: true 
    },
    type: {
        type: String,
        enum: [
            'task_assigned',
            'task_completed', 
            'team_invite',
            'achievement_unlocked',
            'streak_milestone',
            'task_overdue',
            'mention',
            'comment',
            'friend_request',
            'team_joined'
        ],
        required: true
    },
    title: {
        type: String,
        required: true
    },
    message: {
        type: String,
        required: true
    },
    data: {
        type: mongoose.Schema.Types.Mixed,
        default: {}
    },
    read: {
        type: Boolean,
        default: false
    },
    readAt: Date,
    actionUrl: String,
    icon: String,
    color: String,
    createdAt: { 
        type: Date, 
        default: Date.now 
    }
}, {
    timestamps: true
});

// Index for faster queries
NotificationSchema.index({ user: 1, read: 1, createdAt: -1 });

module.exports = mongoose.model('Notification', NotificationSchema);