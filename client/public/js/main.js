// API Configuration
const API_URL = window.location.hostname === 'localhost' 
  ? 'http://localhost:5000/api' 
  : 'https://todo-list-ta4r.onrender.com/api';

// State Management
let currentUser = null;
let currentMode = 'personal';
let currentTeam = null;
let tasks = [];
let teams = [];
let users = [];

// DOM Elements
const authModal = document.getElementById('authModal');
const app = document.getElementById('app');
const loginForm = document.getElementById('loginForm');
const signupForm = document.getElementById('signupForm');
const tasksList = document.getElementById('tasksList');
const completedTasksList = document.getElementById('completedTasksList');
const teamsSection = document.getElementById('teamsSection');
const leaderboardSection = document.getElementById('leaderboardSection');
const notificationToast = document.getElementById('notificationToast');
const notificationMessage = document.getElementById('notificationMessage');

// Helper function to get current user ID consistently
function getCurrentUserId() {
    return currentUser?.id || currentUser?._id;
}

// Initialize App
document.addEventListener('DOMContentLoaded', () => {
    checkAuthStatus();
    setupEventListeners();
});

// Check if user is logged in
async function checkAuthStatus() {
    const token = localStorage.getItem('token');
    if (token) {
        try {
            const response = await fetch(`${API_URL}/auth/verify`, {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });
            
            if (response.ok) {
                const data = await response.json();
                currentUser = data.user;
                console.log('User logged in:', currentUser);
                showApp();
                await loadUserData();
            } else {
                showAuthModal();
            }
        } catch (error) {
            console.error('Auth check failed:', error);
            showAuthModal();
        }
    } else {
        showAuthModal();
    }
}

// Event Listeners
function setupEventListeners() {
    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const email = document.getElementById('loginEmail').value;
        const password = document.getElementById('loginPassword').value;
        
        try {
            const response = await fetch(`${API_URL}/auth/login`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ email, password })
            });
            
            const data = await response.json();
            
            if (response.ok) {
                localStorage.setItem('token', data.token);
                currentUser = data.user;
                console.log('Login successful:', currentUser);
                showApp();
                await loadUserData();
                showNotification('Welcome back, ' + currentUser.name + '! 🎉');
            } else {
                showNotification(data.error || 'Login failed. Please try again.', 'error');
            }
        } catch (error) {
            console.error('Login error:', error);
            showNotification('Login failed. Please try again.', 'error');
        }
    });

    signupForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const name = document.getElementById('signupName').value;
        const email = document.getElementById('signupEmail').value;
        const password = document.getElementById('signupPassword').value;
        
        try {
            const response = await fetch(`${API_URL}/auth/register`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ name, email, password })
            });
            
            const data = await response.json();
            
            if (response.ok) {
                localStorage.setItem('token', data.token);
                currentUser = data.user;
                console.log('Signup successful:', currentUser);
                showApp();
                await loadUserData();
                showNotification('Welcome to TaskMaster Pro, ' + currentUser.name + '! 🎮');
            } else {
                showNotification(data.error || 'Registration failed. Please try again.', 'error');
            }
        } catch (error) {
            console.error('Signup error:', error);
            showNotification('Registration failed. Please try again.', 'error');
        }
    });
}

// Switch between login and signup tabs
function switchTab(tab) {
    const tabs = document.querySelectorAll('.tab-btn');
    const forms = document.querySelectorAll('.auth-form');
    
    tabs.forEach(t => t.classList.remove('active'));
    forms.forEach(f => f.classList.remove('active'));
    
    if (tab === 'login') {
        tabs[0].classList.add('active');
        loginForm.classList.add('active');
    } else {
        tabs[1].classList.add('active');
        signupForm.classList.add('active');
    }
}

// Show main app - UPDATED
function showApp() {
    authModal.classList.add('hidden');
    app.classList.remove('hidden');
    
    if (currentUser) {
        document.getElementById('usernameDisplay').textContent = currentUser.name || 'Player';
        document.getElementById('userPoints').textContent = currentUser.points || 0;
        document.getElementById('userStreak').textContent = currentUser.streak || 0;
        
        // Ensure tasks render after app is shown
        setTimeout(() => {
            console.log('App shown, rendering tasks...');
            renderTasks();
        }, 50);
    }
}

// Show auth modal
function showAuthModal() {
    authModal.classList.remove('hidden');
    app.classList.add('hidden');
}

// Load user data - UPDATED
async function loadUserData() {
    await Promise.all([
        loadTasks(),
        loadTeams(),
        updateUserStats()
    ]);
    updateUI();
    
    // Extra render to be safe
    console.log('User data loaded, ensuring tasks are rendered...');
    renderTasks();
}

// Load tasks from backend - UPDATED
async function loadTasks() {
    try {
        console.log('Fetching tasks...');
        const response = await fetch(`${API_URL}/tasks`, {
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('token')}`
            }
        });
        
        if (response.ok) {
            tasks = await response.json();
            console.log('Tasks loaded:', tasks.length);
            
            // Render tasks immediately after loading
            renderTasks();
        } else {
            console.error('Failed to load tasks:', response.status);
        }
    } catch (error) {
        console.error('Failed to load tasks:', error);
    }
}

// Load teams from backend
async function loadTeams() {
    try {
        const response = await fetch(`${API_URL}/teams`, {
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('token')}`
            }
        });
        
        if (response.ok) {
            teams = await response.json();
            console.log('Teams loaded:', teams);
            renderTeams();
        }
    } catch (error) {
        console.error('Failed to load teams:', error);
    }
}

// Switch between personal and team mode
function switchMode(mode) {
    currentMode = mode;
    const modeBtns = document.querySelectorAll('.mode-btn');
    modeBtns.forEach(btn => btn.classList.remove('active'));
    
    if (mode === 'personal') {
        modeBtns[0].classList.add('active');
        teamsSection.classList.add('hidden');
        leaderboardSection.classList.add('hidden');
        document.getElementById('currentModeTitle').textContent = 'Personal Quests';
        currentTeam = null; // Reset team selection when switching to personal
    } else {
        modeBtns[1].classList.add('active');
        teamsSection.classList.remove('hidden');
        leaderboardSection.classList.remove('hidden');
        document.getElementById('currentModeTitle').textContent = 'Team Adventures';
    }
    
    loadTasks();
}

// Add new task
async function addTask() {
    const title = document.getElementById('taskInput').value;
    const type = document.getElementById('taskType').value;
    const difficulty = document.getElementById('taskDifficulty').value;
    const dueDate = document.getElementById('taskDueDate').value;
    
    console.log('Adding task:', { title, type, difficulty, dueDate, mode: currentMode, teamId: currentTeam?._id });
    
    if (!title) {
        showNotification('Please enter a quest!', 'warning');
        return;
    }
    
    const taskData = {
        title,
        type,
        difficulty,
        dueDate,
        mode: currentMode,
        teamId: currentTeam?._id
    };
    
    try {
        console.log('Sending to API:', taskData);
        console.log('API URL:', API_URL);
        console.log('Token:', localStorage.getItem('token') ? 'Present' : 'Missing');
        
        const response = await fetch(`${API_URL}/tasks`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${localStorage.getItem('token')}`
            },
            body: JSON.stringify(taskData)
        });
        
        console.log('Add task response status:', response.status);
        
        if (response.ok) {
            const newTask = await response.json();
            console.log('Task created successfully:', newTask);
            
            // Refresh all tasks from server instead of just pushing
            await loadTasks();
            
            // Clear input
            document.getElementById('taskInput').value = '';
            document.getElementById('taskDueDate').value = '';
            
            showNotification('New quest started! 🎯');
            updateUserStats();
        } else {
            const error = await response.json();
            console.error('Server error:', error);
            showNotification('Failed to start quest: ' + (error.error || 'Unknown error'), 'error');
        }
    } catch (error) {
        console.error('Failed to add task:', error);
        showNotification('Failed to start quest', 'error');
    }
}

// Toggle task completion
async function toggleTask(taskId, completed) {
    try {
        console.log('Toggling task:', taskId, 'Completed:', completed);
        
        const response = await fetch(`${API_URL}/tasks/${taskId}`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${localStorage.getItem('token')}`
            },
            body: JSON.stringify({ completed: !completed })
        });
        
        if (response.ok) {
            const updatedTask = await response.json();
            console.log('Task toggled:', updatedTask);
            
            // Refresh all tasks
            await loadTasks();
            
            if (!completed) {
                showNotification(`Quest completed! +${getPointsForTask(updatedTask)} points! 🏆`);
                updateUserStats();
                
                if (updatedTask.team) {
                    notifyTeamMembers(updatedTask);
                }
            }
        } else {
            const error = await response.json();
            console.error('Failed to toggle task:', error);
        }
    } catch (error) {
        console.error('Failed to toggle task:', error);
    }
}

// Delete task
async function deleteTask(taskId) {
    if (!confirm('Are you sure you want to abandon this quest?')) return;
    
    try {
        const response = await fetch(`${API_URL}/tasks/${taskId}`, {
            method: 'DELETE',
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('token')}`
            }
        });
        
        if (response.ok) {
            console.log('Task deleted:', taskId);
            await loadTasks(); // Refresh tasks
            showNotification('Quest abandoned', 'info');
        }
    } catch (error) {
        console.error('Failed to delete task:', error);
    }
}

// Edit task
function editTask(taskId) {
    const task = tasks.find(t => t._id === taskId);
    const newTitle = prompt('Edit quest:', task.title);
    
    if (newTitle && newTitle !== task.title) {
        updateTask(taskId, { title: newTitle });
    }
}

// Update task
async function updateTask(taskId, updates) {
    try {
        const response = await fetch(`${API_URL}/tasks/${taskId}`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${localStorage.getItem('token')}`
            },
            body: JSON.stringify(updates)
        });
        
        if (response.ok) {
            console.log('Task updated:', updates);
            await loadTasks(); // Refresh tasks
        }
    } catch (error) {
        console.error('Failed to update task:', error);
    }
}

// Filter tasks
function filterTasks() {
    renderTasks();
}

// Replace your existing isUserTask function
function isUserTask(task) {
    const currentUserId = getCurrentUserId();
    if (!currentUserId) return false;
    
    // Handle different possible ID formats (object vs string)
    const taskCreatedBy = task.createdBy?.id || task.createdBy?._id || task.createdBy;
    const taskAssignedTo = task.assignedTo?.id || task.assignedTo?._id || task.assignedTo;
    
    console.log('isUserTask check:', {
        taskTitle: task.title,
        taskCreatedBy,
        taskAssignedTo,
        currentUserId,
        match: taskCreatedBy === currentUserId || taskAssignedTo === currentUserId
    });
    
    return taskCreatedBy === currentUserId || taskAssignedTo === currentUserId;
}

// Replace your existing renderTasks function with this
function renderTasks() {
    console.log('=== RENDER TASKS ===');
    console.log('Current mode:', currentMode);
    console.log('Current user ID:', getCurrentUserId());
    console.log('Current team:', currentTeam?._id);
    console.log('All tasks:', tasks);
    
    const filter = document.querySelector('input[name="taskFilter"]:checked')?.value || 'all';
    console.log('Current filter:', filter);
    
    // Filter tasks based on current mode
    let filteredTasks = tasks.filter(task => {
        // Get the actual IDs from possibly nested objects
        const taskCreatedById = task.createdBy?.id || task.createdBy?._id || task.createdBy;
        const taskAssignedToId = task.assignedTo?.id || task.assignedTo?._id || task.assignedTo;
        const currentUserId = getCurrentUserId();
        
        if (currentMode === 'personal') {
            // Personal mode: show tasks where user is creator or assignee AND no team
            const isPersonalTask = !task.team;
            const isUsersTask = taskCreatedById === currentUserId || taskAssignedToId === currentUserId;
            
            console.log(`Task "${task.title}":`, {
                taskCreatedById,
                taskAssignedToId,
                currentUserId,
                isPersonalTask,
                isUsersTask,
                taskTeam: task.team
            });
            
            return isPersonalTask && isUsersTask;
        } else {
            // Team mode: show tasks for selected team
            if (!currentTeam) {
                console.log('No team selected');
                return false;
            }
            
            const isTeamTask = task.team === currentTeam._id || 
                              (task.team && task.team._id === currentTeam._id);
            
            console.log(`Task "${task.title}" team check:`, {
                taskTeam: task.team,
                taskTeamId: task.team?._id || task.team,
                currentTeamId: currentTeam._id,
                isTeamTask
            });
            
            return isTeamTask;
        }
    });
    
    console.log('Filtered tasks:', filteredTasks);
    
    // If no tasks after filtering and we're in personal mode, show ALL personal tasks as fallback
    if (filteredTasks.length === 0 && currentMode === 'personal') {
        console.log('No tasks matched filters, showing all personal tasks as fallback');
        filteredTasks = tasks.filter(task => {
            const hasNoTeam = !task.team;
            console.log(`Fallback check - Task "${task.title}":`, { hasNoTeam });
            return hasNoTeam;
        });
    }
    
    // Apply additional filters (daily, weekly, completed)
    if (filter !== 'all') {
        filteredTasks = filteredTasks.filter(task => {
            if (filter === 'completed') return task.completed === true;
            return task.type === filter;
        });
        console.log('After type filter:', filteredTasks);
    }
    
    // Separate active and completed tasks
    const activeTasks = filteredTasks.filter(t => !t.completed);
    const completedTasks = filteredTasks.filter(t => t.completed);
    
    console.log('Active tasks count:', activeTasks.length);
    console.log('Completed tasks count:', completedTasks.length);
    
    // Sort active tasks by due date
    activeTasks.sort((a, b) => {
        if (!a.dueDate) return 1;
        if (!b.dueDate) return -1;
        return new Date(a.dueDate) - new Date(b.dueDate);
    });
    
    // Get the container elements
    const tasksList = document.getElementById('tasksList');
    const completedTasksList = document.getElementById('completedTasksList');
    
    if (!tasksList || !completedTasksList) {
        console.error('Task list elements not found!');
        return;
    }
    
    // Render active tasks
    if (activeTasks.length === 0) {
        tasksList.innerHTML = '<div class="no-tasks">No active quests. Start one!</div>';
        console.log('No active tasks to display');
    } else {
        const html = activeTasks.map(task => {
            console.log('Creating HTML for active task:', task.title);
            return createTaskHTML(task, false);
        }).join('');
        tasksList.innerHTML = html;
    }
    
    // Render completed tasks
    if (completedTasks.length === 0) {
        completedTasksList.innerHTML = '<div class="no-tasks">No completed quests yet.</div>';
    } else {
        completedTasksList.innerHTML = completedTasks.map(task => {
            console.log('Creating HTML for completed task:', task.title);
            return createTaskHTML(task, true);
        }).join('');
    }
    
    // Update total tasks count
    const totalTasksEl = document.getElementById('totalTasks');
    if (totalTasksEl) {
        totalTasksEl.textContent = activeTasks.length;
    }
    
    console.log('=== RENDER COMPLETE ===');
}

// Create task HTML
function createTaskHTML(task, isCompleted) {
    if (!task) return '';
    
    const dueDate = task.dueDate ? new Date(task.dueDate) : new Date();
    const today = new Date();
    const isOverdue = dueDate < today && !task.completed;
    const points = getPointsForTask(task);
    
    // Safely access nested properties
    const assignedToName = task.assignedTo?.name || 'Unassigned';
    const teamMembers = task.team?.members || [];
    
    return `
        <div class="task-item" data-task-id="${task._id}">
            <div class="task-checkbox ${isCompleted ? 'completed' : ''}" 
                 onclick="toggleTask('${task._id}', ${isCompleted})"></div>
            <div class="task-content">
                <div class="task-title ${isCompleted ? 'completed' : ''}">${task.title || 'Untitled'}</div>
                <div class="task-meta">
                    <span class="task-type">${task.type || 'simple'}</span>
                    <span class="task-difficulty ${task.difficulty || 'medium'}">${getDifficultyStars(task.difficulty)}</span>
                    <span class="task-due-date ${isOverdue ? 'overdue' : ''}">
                        <i class="far fa-calendar"></i> ${formatDate(task.dueDate)}
                        ${isOverdue ? ' (Overdue!)' : ''}
                    </span>
                    ${task.assignedTo ? `
                        <span class="assigned-to">
                            <i class="far fa-user"></i> ${assignedToName}
                        </span>
                    ` : ''}
                </div>
                ${task.team && teamMembers.length > 0 ? `
                    <div class="team-members">
                        ${teamMembers.slice(0, 3).map(member => `
                            <div class="member-tag" title="${member.name || 'Member'}">
                                ${(member.name || '?').charAt(0)}
                            </div>
                        `).join('')}
                        ${teamMembers.length > 3 ? `
                            <div class="member-tag">+${teamMembers.length - 3}</div>
                        ` : ''}
                    </div>
                ` : ''}
            </div>
            <div class="task-points">
                <i class="fas fa-star"></i> ${points}
            </div>
            ${!isCompleted ? `
                <div class="task-actions">
                    <button onclick="editTask('${task._id}')" title="Edit">
                        <i class="fas fa-edit"></i>
                    </button>
                    <button onclick="deleteTask('${task._id}')" title="Delete">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            ` : ''}
        </div>
    `;
}

// Get points for task based on difficulty and type
function getPointsForTask(task) {
    const basePoints = {
        easy: 10,
        medium: 20,
        hard: 30
    }[task.difficulty] || 10;
    
    // Bonus for recurring tasks
    const bonus = {
        daily: 5,
        weekly: 15,
        monthly: 30
    }[task.type] || 0;
    
    return basePoints + bonus;
}

// Get difficulty stars
function getDifficultyStars(difficulty) {
    const stars = {
        easy: '⭐',
        medium: '⭐⭐',
        hard: '⭐⭐⭐'
    };
    return stars[difficulty] || '⭐';
}

// Format date
function formatDate(dateString) {
    if (!dateString) return 'No date';
    const options = { month: 'short', day: 'numeric' };
    return new Date(dateString).toLocaleDateString('en-US', options);
}

// Render teams list
function renderTeams() {
    const teamsList = document.getElementById('teamsList');
    
    if (teams.length === 0) {
        teamsList.innerHTML = '<p class="no-teams">No teams yet. Create one!</p>';
        return;
    }
    
    teamsList.innerHTML = teams.map(team => `
        <div class="team-item ${currentTeam?._id === team._id ? 'active' : ''}" 
             onclick="selectTeam('${team._id}')">
            <i class="fas fa-users"></i>
            <span>${team.name}</span>
            <span class="team-member-count">${team.members?.length || 0}</span>
        </div>
    `).join('');
}

// Select team
function selectTeam(teamId) {
    currentTeam = teams.find(t => t._id === teamId);
    console.log('Selected team:', currentTeam);
    renderTeams();
    loadTasks();
    loadLeaderboard(teamId);
}

// Load team leaderboard
async function loadLeaderboard(teamId) {
    try {
        const response = await fetch(`${API_URL}/teams/${teamId}/leaderboard`, {
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('token')}`
            }
        });
        
        if (response.ok) {
            const leaderboard = await response.json();
            renderLeaderboard(leaderboard);
        }
    } catch (error) {
        console.error('Failed to load leaderboard:', error);
    }
}

// Render leaderboard
function renderLeaderboard(leaderboard) {
    const leaderboardEl = document.getElementById('leaderboard');
    
    if (!leaderboard || leaderboard.length === 0) {
        leaderboardEl.innerHTML = '<div class="no-data">No team members yet</div>';
        return;
    }
    
    leaderboardEl.innerHTML = leaderboard.map((member, index) => `
        <div class="leaderboard-item">
            <div class="rank">${index + 1}</div>
            <div class="name">${member.name}</div>
            <div class="points">${member.points} pts</div>
        </div>
    `).join('');
}

// Show create team modal
function showCreateTeamModal() {
    document.getElementById('createTeamModal').classList.remove('hidden');
}

// Hide create team modal
function hideCreateTeamModal() {
    document.getElementById('createTeamModal').classList.add('hidden');
}

// Create new team
async function createTeam() {
    const name = document.getElementById('teamName').value;
    const description = document.getElementById('teamDescription').value;
    
    if (!name) {
        showNotification('Please enter a team name', 'warning');
        return;
    }
    
    try {
        const response = await fetch(`${API_URL}/teams`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${localStorage.getItem('token')}`
            },
            body: JSON.stringify({ name, description })
        });
        
        if (response.ok) {
            const newTeam = await response.json();
            console.log('Team created:', newTeam);
            teams.push(newTeam);
            renderTeams();
            hideCreateTeamModal();
            document.getElementById('teamName').value = '';
            document.getElementById('teamDescription').value = '';
            showNotification('Team created successfully! 🎉');
            
            // Switch to team mode
            switchMode('team');
            selectTeam(newTeam._id);
        } else {
            const error = await response.json();
            console.error('Failed to create team:', error);
            showNotification(error.error || 'Failed to create team', 'error');
        }
    } catch (error) {
        console.error('Failed to create team:', error);
        showNotification('Failed to create team', 'error');
    }
}

// Update user stats - FIXED VERSION
async function updateUserStats() {
    if (!currentUser) {
        console.log('No user logged in');
        return;
    }
    
    const userId = getCurrentUserId();
    
    if (!userId) {
        console.error('No user ID found:', currentUser);
        return;
    }
    
    try {
        console.log('Fetching stats for user:', userId);
        const response = await fetch(`${API_URL}/users/${userId}/stats`, {
            method: 'GET', // Explicitly set method
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('token')}`,
                'Content-Type': 'application/json'
            }
        });
        
        console.log('Stats response status:', response.status);
        
        if (response.ok) {
            const stats = await response.json();
            console.log('Stats received:', stats);
            
            // Update UI with stats
            document.getElementById('userPoints').textContent = stats.points || 0;
            document.getElementById('userStreak').textContent = stats.streak || 0;
            
            // Update current user object
            currentUser.points = stats.points;
            currentUser.streak = stats.streak;
        } else {
            console.error('Failed to fetch stats:', response.status);
            
            // Fallback: Use tasks to calculate points
            console.log('Using fallback stats calculation from tasks');
            const totalPoints = tasks.reduce((sum, task) => {
                return sum + (task.completed ? getPointsForTask(task) : 0);
            }, 0);
            
            document.getElementById('userPoints').textContent = totalPoints || currentUser.points || 0;
            document.getElementById('userStreak').textContent = currentUser.streak || 0;
        }
    } catch (error) {
        console.error('Failed to update stats:', error);
        
        // Final fallback
        document.getElementById('userPoints').textContent = currentUser.points || 0;
        document.getElementById('userStreak').textContent = currentUser.streak || 0;
    }
}

// Notify team members
function notifyTeamMembers(task) {
    showNotification(`${currentUser.name} completed a team quest! 🎉`);
}

// Show notification
function showNotification(message, type = 'success') {
    if (!notificationMessage || !notificationToast) return;
    
    notificationMessage.textContent = message;
    notificationToast.classList.remove('hidden');
    
    // Add color based on type
    notificationToast.style.background = type === 'error' ? '#ffebee' : 
                                         type === 'warning' ? '#fff3e0' : '#e8f5e8';
    
    setTimeout(() => {
        notificationToast.classList.add('hidden');
    }, 3000);
}

// Logout
function logout() {
    localStorage.removeItem('token');
    currentUser = null;
    currentMode = 'personal';
    currentTeam = null;
    tasks = [];
    teams = [];
    showAuthModal();
}

// Update UI based on current state
function updateUI() {
    renderTasks();
    renderTeams();
}

// Add CSS for no-data state
const style = document.createElement('style');
style.textContent = `
    .no-tasks, .no-data {
        text-align: center;
        padding: 20px;
        color: #666;
        font-style: italic;
    }
    
    .no-teams {
        text-align: center;
        padding: 10px;
        color: #666;
    }
`;
document.head.appendChild(style);