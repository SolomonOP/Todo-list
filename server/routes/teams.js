const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const Team = require('../models/Team');
const User = require('../models/User');
const Task = require('../models/Task');
const Notification = require('../models/Notification');
const { protect } = require('../middleware/auth');
const crypto = require('crypto');

// @route   GET /api/teams
// @desc    Get all teams for current user
// @access  Private
router.get('/', protect, async (req, res) => {
    try {
        const teams = await Team.find({
            'members.user': req.user.id
        })
        .populate('createdBy', 'name email avatar')
        .populate('members.user', 'name email avatar points level')
        .populate('pendingInvites.invitedBy', 'name email');
        
        res.json({
            success: true,
            teams
        });

    } catch (error) {
        console.error('Get teams error:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

// @route   GET /api/teams/:id
// @desc    Get single team
// @access  Private
router.get('/:id', protect, async (req, res) => {
    try {
        const team = await Team.findById(req.params.id)
            .populate('createdBy', 'name email avatar')
            .populate('members.user', 'name email avatar points level streak')
            .populate('pendingInvites.invitedBy', 'name email');
        
        if (!team) {
            return res.status(404).json({ error: 'Team not found' });
        }
        
        // Check if user is member
        if (!team.isMember(req.user.id)) {
            return res.status(403).json({ error: 'Not a member of this team' });
        }

        // Get team tasks
        const tasks = await Task.find({ team: team._id })
            .populate('createdBy', 'name avatar')
            .populate('assignedTo', 'name avatar')
            .sort({ createdAt: -1 })
            .limit(10);

        res.json({
            success: true,
            team,
            recentTasks: tasks
        });

    } catch (error) {
        console.error('Get team error:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

// @route   POST /api/teams
// @desc    Create a new team
// @access  Private
router.post('/', [
    protect,
    body('name').notEmpty().withMessage('Team name is required'),
    body('description').optional().isLength({ max: 500 })
], async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }

        const team = new Team({
            name: req.body.name,
            description: req.body.description,
            createdBy: req.user.id,
            members: [{
                user: req.user.id,
                role: 'admin'
            }]
        });

        await team.save();

        const populatedTeam = await Team.findById(team._id)
            .populate('createdBy', 'name email avatar')
            .populate('members.user', 'name email avatar');

        res.status(201).json({
            success: true,
            team: populatedTeam
        });

    } catch (error) {
        console.error('Create team error:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

// @route   PUT /api/teams/:id
// @desc    Update team
// @access  Private
router.put('/:id', protect, async (req, res) => {
    try {
        const team = await Team.findById(req.params.id);
        
        if (!team) {
            return res.status(404).json({ error: 'Team not found' });
        }
        
        // Check if user is admin
        if (!team.isAdmin(req.user.id)) {
            return res.status(403).json({ error: 'Only team admins can update team' });
        }

        const updatedTeam = await Team.findByIdAndUpdate(
            req.params.id,
            { $set: req.body },
            { new: true, runValidators: true }
        )
        .populate('createdBy', 'name email avatar')
        .populate('members.user', 'name email avatar');

        res.json({
            success: true,
            team: updatedTeam
        });

    } catch (error) {
        console.error('Update team error:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

// @route   DELETE /api/teams/:id
// @desc    Delete team
// @access  Private
router.delete('/:id', protect, async (req, res) => {
    try {
        const team = await Team.findById(req.params.id);
        
        if (!team) {
            return res.status(404).json({ error: 'Team not found' });
        }
        
        // Check if user is creator
        if (team.createdBy.toString() !== req.user.id) {
            return res.status(403).json({ error: 'Only team creator can delete team' });
        }

        await team.deleteOne();

        res.json({
            success: true,
            message: 'Team deleted successfully'
        });

    } catch (error) {
        console.error('Delete team error:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

// @route   POST /api/teams/:id/invite
// @desc    Invite user to team
// @access  Private
router.post('/:id/invite', [
    protect,
    body('email').isEmail().withMessage('Valid email is required')
], async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }

        const team = await Team.findById(req.params.id);
        
        if (!team) {
            return res.status(404).json({ error: 'Team not found' });
        }
        
        // Check if user has permission to invite
        const canInvite = team.isAdmin(req.user.id) || team.settings.allowMemberInvites;
        if (!canInvite) {
            return res.status(403).json({ error: 'Not authorized to invite members' });
        }

        const { email } = req.body;

        // Check if user exists
        const user = await User.findOne({ email });
        
        if (user) {
            // User exists - add to team directly
            if (team.isMember(user._id)) {
                return res.status(400).json({ error: 'User is already a team member' });
            }

            team.members.push({
                user: user._id,
                role: 'member'
            });
            
            await team.save();

            // Send notification
            const notification = new Notification({
                user: user._id,
                type: 'team_invite',
                title: 'Team Invitation',
                message: `You have been added to team: ${team.name}`,
                data: { teamId: team._id },
                actionUrl: `/teams/${team._id}`,
                icon: 'group'
            });
            await notification.save();

            const io = req.app.get('io');
            io.to(`user:${user._id}`).emit('notification', notification);
            io.to(`user:${user._id}`).emit('team-invite', { teamId: team._id, teamName: team.name });

            res.json({
                success: true,
                message: 'User added to team',
                user: {
                    id: user._id,
                    name: user.name,
                    email: user.email
                }
            });
        } else {
            // User doesn't exist - create pending invite
            const inviteToken = crypto.randomBytes(32).toString('hex');
            
            team.pendingInvites.push({
                email,
                invitedBy: req.user.id,
                token: inviteToken
            });
            
            await team.save();

            // TODO: Send email invitation with token
            res.json({
                success: true,
                message: 'Invitation sent to email',
                inviteToken // Remove this in production
            });
        }

    } catch (error) {
        console.error('Invite user error:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

// @route   POST /api/teams/:id/join
// @desc    Join team (for public teams)
// @access  Private
router.post('/:id/join', protect, async (req, res) => {
    try {
        const team = await Team.findById(req.params.id);
        
        if (!team) {
            return res.status(404).json({ error: 'Team not found' });
        }

        if (team.isMember(req.user.id)) {
            return res.status(400).json({ error: 'Already a team member' });
        }

        team.members.push({
            user: req.user.id,
            role: 'member'
        });

        await team.save();

        // Notify team admins
        const admins = team.members.filter(m => m.role === 'admin');
        admins.forEach(admin => {
            const notification = new Notification({
                user: admin.user,
                type: 'team_joined',
                title: 'New Team Member',
                message: `${req.user.name} joined your team`,
                data: { teamId: team._id, userId: req.user.id },
                icon: 'person_add'
            });
            notification.save();
        });

        const io = req.app.get('io');
        io.to(`team:${team._id}`).emit('member-joined', {
            user: { id: req.user.id, name: req.user.name }
        });

        res.json({
            success: true,
            message: 'Successfully joined team'
        });

    } catch (error) {
        console.error('Join team error:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

// @route   POST /api/teams/:id/leave
// @desc    Leave team
// @access  Private
router.post('/:id/leave', protect, async (req, res) => {
    try {
        const team = await Team.findById(req.params.id);
        
        if (!team) {
            return res.status(404).json({ error: 'Team not found' });
        }

        // Check if user is the only admin
        const admins = team.members.filter(m => m.role === 'admin');
        if (admins.length === 1 && admins[0].user.toString() === req.user.id) {
            return res.status(400).json({ 
                error: 'Cannot leave team. You are the only admin. Transfer admin role first or delete the team.' 
            });
        }

        // Remove user from members
        team.members = team.members.filter(m => m.user.toString() !== req.user.id);
        await team.save();

        const io = req.app.get('io');
        io.to(`team:${team._id}`).emit('member-left', {
            userId: req.user.id,
            name: req.user.name
        });

        res.json({
            success: true,
            message: 'Successfully left team'
        });

    } catch (error) {
        console.error('Leave team error:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

// @route   PUT /api/teams/:id/members/:userId/role
// @desc    Update member role
// @access  Private (Admin only)
router.put('/:id/members/:userId/role', protect, async (req, res) => {
    try {
        const team = await Team.findById(req.params.id);
        
        if (!team) {
            return res.status(404).json({ error: 'Team not found' });
        }

        // Check if requester is admin
        if (!team.isAdmin(req.user.id)) {
            return res.status(403).json({ error: 'Admin access required' });
        }

        const { role } = req.body;
        if (!['admin', 'member'].includes(role)) {
            return res.status(400).json({ error: 'Invalid role' });
        }

        const member = team.members.find(m => m.user.toString() === req.params.userId);
        if (!member) {
            return res.status(404).json({ error: 'Member not found' });
        }

        member.role = role;
        await team.save();

        const io = req.app.get('io');
        io.to(`user:${req.params.userId}`).emit('role-updated', {
            teamId: team._id,
            teamName: team.name,
            newRole: role
        });

        res.json({
            success: true,
            message: 'Member role updated',
            member
        });

    } catch (error) {
        console.error('Update member role error:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

// @route   DELETE /api/teams/:id/members/:userId
// @desc    Remove member from team
// @access  Private (Admin only)
router.delete('/:id/members/:userId', protect, async (req, res) => {
    try {
        const team = await Team.findById(req.params.id);
        
        if (!team) {
            return res.status(404).json({ error: 'Team not found' });
        }

        // Check if requester is admin
        if (!team.isAdmin(req.user.id)) {
            return res.status(403).json({ error: 'Admin access required' });
        }

        // Cannot remove the last admin
        const admins = team.members.filter(m => m.role === 'admin');
        const memberToRemove = team.members.find(m => m.user.toString() === req.params.userId);
        
        if (admins.length === 1 && memberToRemove.role === 'admin') {
            return res.status(400).json({ error: 'Cannot remove the only admin. Promote another member first.' });
        }

        // Remove member
        team.members = team.members.filter(m => m.user.toString() !== req.params.userId);
        await team.save();

        const io = req.app.get('io');
        io.to(`user:${req.params.userId}`).emit('removed-from-team', {
            teamId: team._id,
            teamName: team.name
        });
        
        io.to(`team:${team._id}`).emit('member-removed', {
            userId: req.params.userId
        });

        res.json({
            success: true,
            message: 'Member removed from team'
        });

    } catch (error) {
        console.error('Remove member error:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

// @route   GET /api/teams/:id/leaderboard
// @desc    Get team leaderboard
// @access  Private
router.get('/:id/leaderboard', protect, async (req, res) => {
    try {
        const team = await Team.findById(req.params.id);
        
        if (!team) {
            return res.status(404).json({ error: 'Team not found' });
        }

        if (!team.isMember(req.user.id)) {
            return res.status(403).json({ error: 'Not a team member' });
        }

        // Get all team members with their points
        const memberIds = team.members.map(m => m.user);
        const members = await User.find({ _id: { $in: memberIds } })
            .select('name avatar points level streak')
            .lean();

        // Get task completion stats for each member
        const memberStats = await Promise.all(members.map(async (member) => {
            const tasks = await Task.find({
                team: team._id,
                $or: [
                    { createdBy: member._id },
                    { assignedTo: member._id }
                ]
            });

            const completedTasks = tasks.filter(t => t.completed).length;
            const totalTasks = tasks.length;
            const completionRate = totalTasks > 0 ? (completedTasks / totalTasks) * 100 : 0;

            return {
                ...member,
                tasksCompleted: completedTasks,
                tasksTotal: totalTasks,
                completionRate: Math.round(completionRate * 100) / 100
            };
        }));

        // Sort by points (descending)
        memberStats.sort((a, b) => b.points - a.points);

        res.json({
            success: true,
            leaderboard: memberStats
        });

    } catch (error) {
        console.error('Get leaderboard error:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

module.exports = router;