const cron = require('node-cron');
const Task = require('../models/Task');
const User = require('../models/User');
const Notification = require('../models/Notification');

// Run every hour
const setupCronJobs = () => {
    // Check for overdue tasks
    cron.schedule('0 * * * *', async () => {
        console.log('Running overdue tasks check...');
        
        try {
            const overdueTasks = await Task.find({
                completed: false,
                dueDate: { $lt: new Date() },
                status: { $ne: 'overdue' }
            }).populate('assignedTo', 'name email');

            for (const task of overdueTasks) {
                // Update task status
                task.status = 'overdue';
                await task.save();

                // Notify assignee
                if (task.assignedTo) {
                    const notification = new Notification({
                        user: task.assignedTo._id,
                        type: 'task_overdue',
                        title: 'Task Overdue',
                        message: `Task "${task.title}" is overdue!`,
                        data: { taskId: task._id },
                        icon: 'warning',
                        color: 'error'
                    });
                    await notification.save();
                }
            }

            console.log(`Marked ${overdueTasks.length} tasks as overdue`);
        } catch (error) {
            console.error('Overdue tasks check failed:', error);
        }
    });

    // Reset daily tasks at midnight
    cron.schedule('0 0 * * *', async () => {
        console.log('Resetting daily tasks...');
        
        try {
            // Find all daily tasks that were completed
            const completedDailyTasks = await Task.find({
                type: 'daily',
                completed: true,
                completedAt: {
                    $gte: new Date().setHours(0, 0, 0, 0),
                    $lt: new Date().setHours(23, 59, 59, 999)
                }
            });

            for (const task of completedDailyTasks) {
                // Create a new instance of the daily task for today
                const newTask = new Task({
                    title: task.title,
                    description: task.description,
                    type: 'daily',
                    difficulty: task.difficulty,
                    createdBy: task.createdBy,
                    assignedTo: task.assignedTo,
                    team: task.team,
                    dueDate: new Date(new Date().setHours(23, 59, 59, 999)),
                    points: task.points
                });
                await newTask.save();

                // Notify user
                if (task.assignedTo) {
                    const notification = new Notification({
                        user: task.assignedTo,
                        type: 'task_assigned',
                        title: 'New Daily Quest',
                        message: `Your daily task "${task.title}" is ready!`,
                        data: { taskId: newTask._id },
                        icon: 'refresh',
                        color: 'info'
                    });
                    await notification.save();
                }
            }

            console.log(`Reset ${completedDailyTasks.length} daily tasks`);
        } catch (error) {
            console.error('Reset daily tasks failed:', error);
        }
    });

    // Reset weekly tasks on Monday
    cron.schedule('0 0 * * 1', async () => {
        console.log('Resetting weekly tasks...');
        
        try {
            const completedWeeklyTasks = await Task.find({
                type: 'weekly',
                completed: true,
                completedAt: {
                    $gte: new Date(new Date().setDate(new Date().getDate() - 7))
                }
            });

            for (const task of completedWeeklyTasks) {
                const newTask = new Task({
                    title: task.title,
                    description: task.description,
                    type: 'weekly',
                    difficulty: task.difficulty,
                    createdBy: task.createdBy,
                    assignedTo: task.assignedTo,
                    team: task.team,
                    dueDate: new Date(new Date().setDate(new Date().getDate() + 7)),
                    points: task.points
                });
                await newTask.save();

                if (task.assignedTo) {
                    const notification = new Notification({
                        user: task.assignedTo,
                        type: 'task_assigned',
                        title: 'New Weekly Quest',
                        message: `Your weekly task "${task.title}" is ready!`,
                        data: { taskId: newTask._id },
                        icon: 'refresh',
                        color: 'info'
                    });
                    await notification.save();
                }
            }

            console.log(`Reset ${completedWeeklyTasks.length} weekly tasks`);
        } catch (error) {
            console.error('Reset weekly tasks failed:', error);
        }
    });

    // Update user streaks daily
    cron.schedule('0 1 * * *', async () => {
        console.log('Updating user streaks...');
        
        try {
            const users = await User.find();
            
            for (const user of users) {
                const yesterday = new Date();
                yesterday.setDate(yesterday.getDate() - 1);
                
                const completedYesterday = await Task.countDocuments({
                    $or: [
                        { createdBy: user._id },
                        { assignedTo: user._id }
                    ],
                    completed: true,
                    completedAt: {
                        $gte: yesterday.setHours(0, 0, 0, 0),
                        $lt: yesterday.setHours(23, 59, 59, 999)
                    }
                });

                if (completedYesterday === 0) {
                    // Reset streak if no tasks completed yesterday
                    user.streak = 0;
                    await user.save();
                }
            }

            console.log('User streaks updated');
        } catch (error) {
            console.error('Update streaks failed:', error);
        }
    });

    console.log('Cron jobs scheduled successfully');
};

module.exports = { setupCronJobs };