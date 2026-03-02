class SocketManager {
    constructor() {
        this.socket = null;
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 5;
    }

    connect(token) {
        this.socket = io(API_URL, {
            auth: { token },
            transports: ['websocket'],
            reconnection: true,
            reconnectionDelay: 1000,
            reconnectionDelayMax: 5000,
            reconnectionAttempts: this.maxReconnectAttempts
        });

        this.setupEventListeners();
    }

    setupEventListeners() {
        this.socket.on('connect', () => {
            console.log('Socket connected');
            this.reconnectAttempts = 0;
            
            // Authenticate with user ID
            if (currentUser) {
                this.socket.emit('authenticate', currentUser.id);
            }
        });

        this.socket.on('disconnect', () => {
            console.log('Socket disconnected');
        });

        this.socket.on('reconnect_attempt', (attempt) => {
            this.reconnectAttempts = attempt;
            console.log(`Reconnect attempt ${attempt}`);
        });

        this.socket.on('reconnect_failed', () => {
            console.log('Reconnection failed');
            showNotification('Connection lost. Please refresh the page.', 'error');
        });

        this.socket.on('notification', (notification) => {
            this.handleNotification(notification);
        });

        this.socket.on('new-task', (data) => {
            this.handleNewTask(data);
        });

        this.socket.on('task-updated', (data) => {
            this.handleTaskUpdated(data);
        });

        this.socket.on('team-invite', (data) => {
            this.handleTeamInvite(data);
        });

        this.socket.on('member-joined', (data) => {
            this.handleMemberJoined(data);
        });

        this.socket.on('member-left', (data) => {
            this.handleMemberLeft(data);
        });

        this.socket.on('member-removed', (data) => {
            this.handleMemberRemoved(data);
        });

        this.socket.on('role-updated', (data) => {
            this.handleRoleUpdated(data);
        });

        this.socket.on('removed-from-team', (data) => {
            this.handleRemovedFromTeam(data);
        });
    }

    handleNotification(notification) {
        // Show toast notification
        showNotification(notification.message);
        
        // Update notification badge
        this.updateNotificationBadge();
        
        // Play sound if enabled
        if (currentUser?.settings?.soundEffects) {
            this.playNotificationSound();
        }
    }

    handleNewTask(data) {
        // Reload tasks if in the same team
        if (currentMode === 'team' && currentTeam?._id === data.task.team) {
            loadTasks();
        }
        
        // Show notification
        showNotification(data.message);
    }

    handleTaskUpdated(data) {
        // Update task in UI if it's relevant
        loadTasks();
    }

    handleTeamInvite(data) {
        showNotification(`You've been invited to join ${data.teamName}`);
        // Update team list
        loadTeams();
    }

    handleMemberJoined(data) {
        if (currentTeam) {
            showNotification(`${data.user.name} joined the team`);
            loadTeams();
            loadLeaderboard(currentTeam._id);
        }
    }

    handleMemberLeft(data) {
        if (currentTeam && data.userId !== currentUser.id) {
            showNotification(`${data.name} left the team`);
            loadTeams();
            loadLeaderboard(currentTeam._id);
        }
    }

    handleMemberRemoved(data) {
        if (currentTeam && data.userId === currentUser.id) {
            showNotification('You have been removed from the team', 'warning');
            switchMode('personal');
            loadTeams();
        }
    }

    handleRoleUpdated(data) {
        if (currentTeam && data.teamId === currentTeam._id) {
            showNotification(`Your role in ${data.teamName} has been updated to ${data.newRole}`);
            loadTeams();
        }
    }

    handleRemovedFromTeam(data) {
        showNotification(`You have been removed from ${data.teamName}`, 'warning');
        switchMode('personal');
        loadTeams();
    }

    updateNotificationBadge() {
        // Update notification count in UI
        const badge = document.getElementById('notificationBadge');
        if (badge) {
            // Increment count
            const count = parseInt(badge.textContent) || 0;
            badge.textContent = count + 1;
            badge.style.display = 'block';
        }
    }

    playNotificationSound() {
        const audio = new Audio('/assets/notification.mp3');
        audio.play().catch(e => console.log('Sound play failed:', e));
    }

    joinTeam(teamId) {
        if (this.socket && this.socket.connected) {
            this.socket.emit('join-team', teamId);
        }
    }

    leaveTeam(teamId) {
        if (this.socket && this.socket.connected) {
            this.socket.emit('leave-team', teamId);
        }
    }

    disconnect() {
        if (this.socket) {
            this.socket.disconnect();
            this.socket = null;
        }
    }
}

// Initialize socket manager
const socketManager = new SocketManager();