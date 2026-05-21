let cart = JSON.parse(localStorage.getItem('cart')) || [];
let user = JSON.parse(localStorage.getItem('user')) || null;
let trackingSocket = null;

function getSocket() {
    if (!trackingSocket) {
        const isLocal = ['localhost', '127.0.0.1'].includes(window.location.hostname) || window.location.hostname.startsWith('192.168.');
        if (isLocal) {
            trackingSocket = io();
        } else {
            const backendUrl = window.BACKEND_URL || 'https://laundry-backend-4jl7.onrender.com';
            trackingSocket = io(backendUrl);
        }
    }
    return trackingSocket;
}

let locationWatchId = null;
let trackingMap = null;
let trackingMarker = null;
let appliedCoupon = null;
let discountAmount = 0;
let allActivePartners = [];
let allCustomers = [];
let allAdminOrders = [];
let allUserAddresses = [];

// Helper to escape HTML and prevent XSS
function escapeHtml(text) {
    if (typeof text !== 'string') return text;
    return text
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

// Global Actions for Admin
async function updatePartnerStatus(id, status) {
    console.log('--- updatePartnerStatus execution started ---', {id, status});
    
    try {
        const u = JSON.parse(localStorage.getItem('user'));
        if (!u || !u.token) {
            console.error('No admin user found in localStorage');
            notifyUser('Session expired. Please login again.', 'danger')
            return;
        }

        console.log('Fetching update for ID:', id, 'to status:', status);
        const res = await fetch(`/api/admin/partners/${id}/status`, {
            method: 'PUT',
            headers: { 
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${u.token}`
            },
            body: JSON.stringify({ status })
        });
        
        console.log('Server response status:', res.status);
        const result = await res.json();
        console.log('Server response data:', result);

        if (res.ok) {
            notifyUser(`Partner ${status} successfully!`, 'success')
            fetchPendingPartners();
            fetchActivePartners();
            fetchAdminStats();
            fetchCustomers();
        } else {
            notifyUser(result.message || 'Action failed', 'danger')
        }
    } catch (err) {
        console.error('CRITICAL ERROR in updatePartnerStatus:', err);
        notifyUser('Failed to update status. Check console.', 'info')
    }
}

async function settleCash(id) {
    if (!confirm('Are you sure you want to settle cash for this agent? This will reset their Cash in Hand to 0.')) return;
    
    try {
        const u = JSON.parse(localStorage.getItem('user'));
        const res = await fetch(`/api/admin/partners/${id}/settle-cash`, {
            method: 'PUT',
            headers: { 
                'Authorization': `Bearer ${u.token}`
            }
        });
        
        if (res.ok) {
            notifyUser(`Cash settled successfully!`, 'success');
            fetchActivePartners();
        } else {
            const data = await res.json();
            notifyUser(data.message || 'Failed to settle cash', 'danger');
        }
    } catch (err) {
        console.error('Error settling cash:', err);
        notifyUser('Error settling cash', 'danger');
    }
}

async function settleWallet(id) {
    if (!confirm('Are you sure you want to settle wallet for this partner? This will reset their Main Wallet to 0.')) return;
    
    try {
        const u = JSON.parse(localStorage.getItem('user'));
        const res = await fetch(`/api/admin/partners/${id}/settle-wallet`, {
            method: 'PUT',
            headers: { 
                'Authorization': `Bearer ${u.token}`
            }
        });
        
        if (res.ok) {
            notifyUser(`Wallet settled successfully!`, 'success');
            fetchActivePartners();
        } else {
            const data = await res.json();
            notifyUser(data.message || 'Failed to settle wallet', 'danger');
        }
    } catch (err) {
        console.error('Error settling wallet:', err);
        notifyUser('Error settling wallet', 'danger');
    }
}

window.viewKYC = function(path) {
    window.open(path, '_blank');
};

document.addEventListener('DOMContentLoaded', () => {
    updateAuthUI();
    if (user && user.token) {
        verifySession();
    }
    fetchServices();
    
    // Force clear search inputs (prevents browser autofill)
    const adminSearchInputs = ['adminOrderSearch', 'adminCustomerSearch', 'adminPartnerSearch'];
    adminSearchInputs.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.value = '';
    });

    window.filterByCategory = function(category, element) {
        // Update UI
        document.querySelectorAll('.category-item').forEach(item => item.classList.remove('active'));
        element.classList.add('active');
        
        // Sync with Slider
        const carouselEl = document.getElementById('heroCarousel');
        if (carouselEl) {
            const carousel = bootstrap.Carousel.getOrCreateInstance(carouselEl);
            const slideMap = {
                'Wash': 0,
                'Dry Clean': 1,
                'Iron': 2,
                'Shoes': 3,
                'Premium': 4
            };
            if (slideMap[category] !== undefined) {
                carousel.to(slideMap[category]);
            }
        }

        // Filter Services
        const searchInput = document.getElementById('serviceSearch');
        if (category === 'all') {
            searchInput.value = '';
            searchServices();
        } else {
            searchInput.value = category;
            searchServices();
        }
    };
    // Auto-load most recent active order in tracker
    if (user && (user.role === 'customer' || !user.role)) {
        setTimeout(async () => {
            try {
                const res = await fetch('/api/orders/myorders', {
                    headers: { 'Authorization': `Bearer ${user.token}` }
                });
                const orders = await res.json();
                // Find the first non-delivered order
                const activeOrder = orders.find(o => o.status !== 'Delivered');
                if (activeOrder) {
                    console.log('Auto-tracking order:', activeOrder._id);
                    initTrackingMap(activeOrder._id, activeOrder.status);
                }
            } catch (e) {
                console.error('Auto-track failed:', e);
            }
        }, 1500);
    }

    // Force Manual Modal Trigger for Mobile
    document.addEventListener('click', (e) => {
        const toggleBtn = e.target.closest('[data-bs-toggle="modal"]');
        if (toggleBtn && window.innerWidth < 992) {
            e.preventDefault();
            const targetId = toggleBtn.getAttribute('data-bs-target');
            const modalEl = document.querySelector(targetId);
            if (modalEl) {
                const modal = bootstrap.Modal.getOrCreateInstance(modalEl);
                modal.show();
            }
        }
    });

    // Clear search inputs
    const searchInputs = ['adminOrderSearch', 'adminCustomerSearch', 'adminPartnerSearch'];
    const clearSearch = () => {
        searchInputs.forEach(id => {
            const el = document.getElementById(id);
            if (el) {
                el.value = '';
                // If user is already on admin dashboard, ensure we show all data initially
                if (user && user.role === 'admin') {
                    if (id === 'adminOrderSearch') filterOrders();
                    if (id === 'adminCustomerSearch') filterCustomers();
                    if (id === 'adminPartnerSearch') filterPartners();
                }
            }
        });
    };
    
    clearSearch();
    setTimeout(clearSearch, 500); // Repeat after 500ms for aggressive browsers
    setTimeout(clearSearch, 1500); // Repeat after 1.5s just in case
});

function setPartnerRole(role) {
    document.getElementById('partnerRole').value = role;
    document.getElementById('partnerTitle').innerText = role === 'pickup_agent' ? 'Apply as Pickup Partner' : 'Apply as Delivery Partner';
}

document.getElementById('partnerForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const formData = new FormData();
    formData.append('name', document.getElementById('partnerName').value);
    formData.append('email', document.getElementById('partnerEmail').value);
    formData.append('phone', document.getElementById('partnerPhone').value);
    formData.append('serviceArea', document.getElementById('partnerPincode').value);
    formData.append('address', document.getElementById('partnerAddress').value);
    formData.append('password', document.getElementById('partnerPassword').value);
    formData.append('role', document.getElementById('partnerRole').value);
    formData.append('upiId', document.getElementById('partnerUpi').value);
    formData.append('bankAccountNo', document.getElementById('partnerAccount').value);
    formData.append('bankIfsc', document.getElementById('partnerIfsc').value);
    formData.append('bankName', document.getElementById('partnerBankName').value);
    
    const kycFile = document.getElementById('partnerKyc').files[0];
    if (kycFile) formData.append('kycDocument', kycFile);

    try {
        const res = await fetch('/api/auth/register', {
            method: 'POST',
            body: formData
        });
        const result = await res.json();
        if (res.ok) {
            notifyUser(result.message || 'Apply successful! Please wait for approval.', 'success');
            bootstrap.Modal.getInstance(document.getElementById('partnerModal')).hide();
            e.target.reset();
            if (user) {
                setTimeout(() => {
                    logout();
                }, 2000);
            }
        } else {
            notifyUser(result.message, 'info')
        }
    } catch (err) {
        notifyUser('Application failed. Please try again.', 'danger')
    }
});

// Password Toggle logic (Global)
document.addEventListener('click', function(e) {
    if (e.target && e.target.classList.contains('toggle-password')) {
        const icon = e.target;
        const container = icon.closest('.password-container');
        if (!container) return;
        
        const input = container.querySelector('input');
        if (!input) return;

        if (input.type === 'password') {
            input.type = 'text';
            icon.classList.remove('fa-eye');
            icon.classList.add('fa-eye-slash');
        } else {
            input.type = 'password';
            icon.classList.remove('fa-eye-slash');
            icon.classList.add('fa-eye');
        }
    }
});

function togglePassword(inputId, icon) {
    // Keeping this for backward compatibility if needed, 
    // but the global listener above is now the primary handler.
    const input = document.getElementById(inputId);
    if (!input) return;

    if (input.type === 'password') {
        input.type = 'text';
        icon.classList.remove('fa-eye');
        icon.classList.add('fa-eye-slash');
    } else {
        input.type = 'password';
        icon.classList.remove('fa-eye-slash');
        icon.classList.add('fa-eye');
    }
}

function collapseNavbar() {
    const navbarCollapse = document.getElementById('navbarNav');
    if (navbarCollapse && navbarCollapse.classList.contains('show')) {
        const toggler = document.querySelector('.navbar-toggler');
        if (toggler) toggler.click();
    }
}

function showSection(sectionId) {
    collapseNavbar();
    const landingSections = ['home', 'services', 'about-us', 'how-it-works', 'why-us', 'faq', 'newsletter'];
    const dashboards = ['adminDashboard', 'laundryDashboard', 'deliveryDashboard', 'myOrders', 'tracking'];
    
    // Auth Check for protected sections
    const protectedSections = ['myOrders', 'adminDashboard', 'laundryDashboard', 'deliveryDashboard'];
    if (protectedSections.includes(sectionId) && !user) {
        notifyUser('Please login to view this section', 'warning');
        const loginModalEl = document.getElementById('loginModal');
        if (loginModalEl) {
            new bootstrap.Modal(loginModalEl).show();
        }
        return; // Stop navigation
    }

    // Update active nav link
    document.querySelectorAll('.nav-link').forEach(link => link.classList.remove('active'));
    const activeLink = document.getElementById(`nav-${sectionId}`);
    if (activeLink) activeLink.classList.add('active');

    // 1. Hide EVERYTHING first
    [...landingSections, ...dashboards].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.classList.add('d-none');
    });

    // 2. Show the target
    if (sectionId === 'home') {
        landingSections.forEach(id => {
            const el = document.getElementById(id);
            if (el) el.classList.remove('d-none');
        });
    } else {
        const target = document.getElementById(sectionId);
        if (target) {
            target.classList.remove('d-none');
            // Special handling for specific sections
            if (sectionId === 'myOrders') fetchUserOrders();
            if (sectionId === 'tracking') {
                // Any specific tracking init logic
            }
        }
    }
    
    // Close mobile menu if open
    const navbarNav = document.getElementById('navbarNav');
    if (navbarNav && navbarNav.classList.contains('show')) {
        const bsCollapse = bootstrap.Collapse.getInstance(navbarNav) || new bootstrap.Collapse(navbarNav);
        bsCollapse.hide();
    }

    // Instant scroll to top so the new section is at the very top
    window.scrollTo(0, 0);
}

function updateAuthUI() {
    const mobileBottomNav = document.getElementById('mobileBottomNav');
    const showBottomNav = !user || user.role === 'user';
    if (mobileBottomNav) {
        mobileBottomNav.classList.toggle('d-none', !showBottomNav);
    }

    const authBtns = document.getElementById('authButtons');
    const userProfile = document.getElementById('userProfile');
    const userName = document.getElementById('userName');
    const deliveryDashboard = document.getElementById('deliveryDashboard');
    const laundryDashboard = document.getElementById('laundryDashboard');
    const adminDashboard = document.getElementById('adminDashboard');
    const myOrders = document.getElementById('myOrders');
    const landingSections = ['home', 'services', 'about-us', 'how-it-works', 'why-us', 'faq', 'newsletter'];

    const showLanding = (show) => {
        landingSections.forEach(id => {
            const el = document.getElementById(id);
            if (el) el.classList.toggle('d-none', !show);
        });
        
        // Hide/Show Customer Header Links & Footer for Admin/Agents
        const navHome = document.getElementById('nav-home');
        const navCategories = document.getElementById('nav-categories');
        const navTracking = document.getElementById('nav-tracking');
        const navMyOrders = document.getElementById('nav-myOrders');
        const mainFooter = document.getElementById('mainFooter');
        const guestCart = document.getElementById('headerCartContainerGuest');
        const userCart = document.getElementById('headerCartContainerUser');

        const isCustomerOrGuest = !user || user.role === 'user';
        
        if (navHome) navHome.parentElement.classList.toggle('d-none', !isCustomerOrGuest);
        if (navCategories) navCategories.parentElement.classList.toggle('d-none', !isCustomerOrGuest);
        if (navTracking) navTracking.parentElement.classList.toggle('d-none', !isCustomerOrGuest);
        if (navMyOrders) navMyOrders.parentElement.classList.toggle('d-none', !isCustomerOrGuest);
        if (mainFooter) mainFooter.classList.toggle('d-none', !isCustomerOrGuest);
        if (guestCart) guestCart.classList.toggle('d-none', !isCustomerOrGuest);
        if (userCart) userCart.classList.toggle('d-none', !isCustomerOrGuest);
    };

    if (user) {
        if (user.status === 'inactive' && user.role !== 'admin') {
            notifyUser('Your account has been deactivated. Access denied.', 'danger')
            localStorage.removeItem('user');
            location.reload();
            return;
        }
        if (user.status === 'pending' && user.role !== 'admin') {
            notifyUser('Your partner application is pending approval by admin.', 'warning');
            localStorage.removeItem('user');
            user = null;
            // Instantly transition to guest/logged-out UI state
            if (authBtns) {
                authBtns.classList.remove('d-none');
                authBtns.classList.add('d-flex');
            }
            if (userProfile) {
                userProfile.classList.add('d-none');
                userProfile.classList.remove('d-flex');
            }
            if (deliveryDashboard) deliveryDashboard.classList.add('d-none');
            if (laundryDashboard) laundryDashboard.classList.add('d-none');
            if (adminDashboard) adminDashboard.classList.add('d-none');
            if (myOrders) myOrders.classList.add('d-none');
            showLanding(true);
            return;
        }
        if (authBtns) authBtns.classList.add('d-none');
        if (userProfile) {
            userProfile.classList.remove('d-none');
            userProfile.classList.add('d-flex');
        }
        const userDisplayName = document.getElementById('userDisplayName');
        if (userDisplayName) {
            userDisplayName.innerText = user.name;
        }
        const avatarCircle = document.querySelector('.avatar-circle');
        if (avatarCircle && user.name) {
            avatarCircle.innerText = user.name.charAt(0).toUpperCase();
        }
        
        // Populate Profile Modal
        const editName = document.getElementById('editProfileName');
        const editMobile = document.getElementById('editProfileMobile');
        const pRole = document.getElementById('profileRole');
        
        if (editName) editName.value = user.name || '';
        if (editMobile) editMobile.value = user.phone || '';
        if (pRole) pRole.innerText = (user.role || 'customer').toUpperCase();

        // Role-based Dashboard Logic
        if (user.role === 'admin') {
            showLanding(false);
            if (adminDashboard) adminDashboard.classList.remove('d-none');
            if (laundryDashboard) laundryDashboard.classList.add('d-none');
            if (deliveryDashboard) deliveryDashboard.classList.add('d-none');
            if (myOrders) myOrders.classList.add('d-none');
            fetchAdminStats();
            fetchAdminSalesReport();
            fetchPendingPartners();
            fetchActivePartners();
            fetchAdminOrders();
            fetchCustomers();
            fetchAdminServices();
            fetchAdminCoupons();
        } else if (user.role === 'laundry_partner') {
            showLanding(false);
            if (laundryDashboard) laundryDashboard.classList.remove('d-none');
            if (deliveryDashboard) deliveryDashboard.classList.add('d-none');
            if (adminDashboard) adminDashboard.classList.add('d-none');
            if (myOrders) myOrders.classList.add('d-none');
            fetchDeliveryOrders();
        } else if (['pickup_agent', 'delivery_agent'].includes(user.role)) {
            showLanding(false);
            if (deliveryDashboard) deliveryDashboard.classList.remove('d-none');
            if (laundryDashboard) laundryDashboard.classList.add('d-none');
            if (adminDashboard) adminDashboard.classList.add('d-none');
            if (myOrders) myOrders.classList.add('d-none');
            fetchDeliveryOrders();
            
            // Customize title and stats card layouts dynamically
            const dashboardTitle = document.getElementById('agentDashboardTitle');
            const cashCol = document.getElementById('cashInHandCol');
            const statCols = document.querySelectorAll('.agent-stat-col');
            
            if (user.role === 'pickup_agent') {
                if (dashboardTitle) dashboardTitle.innerHTML = `<i class="fas fa-box-open me-2"></i>Pickup Dashboard`;
                if (cashCol) cashCol.classList.add('d-none');
                statCols.forEach(col => {
                    col.classList.remove('col-md-3');
                    col.classList.add('col-md-4');
                });
            } else {
                if (dashboardTitle) dashboardTitle.innerHTML = `<i class="fas fa-truck-loading me-2"></i>Delivery Dashboard`;
                if (cashCol) cashCol.classList.remove('d-none');
                statCols.forEach(col => {
                    col.classList.remove('col-md-4');
                    col.classList.add('col-md-3');
                });
            }

            const shareBtn = document.getElementById('shareLocationBtn');
            if (shareBtn) shareBtn.classList.remove('d-none');
            const shareBtnDel = document.getElementById('shareLocationBtnDelivery');
            if (shareBtnDel) shareBtnDel.classList.remove('d-none');
        } else {
            showLanding(true);
            if (deliveryDashboard) deliveryDashboard.classList.add('d-none');
            if (laundryDashboard) laundryDashboard.classList.add('d-none');
            if (adminDashboard) adminDashboard.classList.add('d-none');
            if (myOrders) myOrders.classList.remove('d-none');
            fetchUserOrders();
        }

        // Join User Room for real-time notifications
        try {
            if (typeof io !== 'undefined') {
                if (!trackingSocket) trackingSocket = io();
                trackingSocket.emit('joinUserRoom', user._id);
                trackingSocket.on('statusUpdate', (data) => {
                    notifyUser(`Order #${data.orderId.slice(-6)} is now ${data.status}!`, 'success');
                    if (user.role === 'user') fetchUserOrders();
                });
            }
        } catch (e) { console.error("Socket error:", e); }

    } else {
        if (authBtns) {
            authBtns.classList.remove('d-none');
            authBtns.classList.add('d-flex');
        }
        if (userProfile) {
            userProfile.classList.add('d-none');
            userProfile.classList.remove('d-flex');
        }
        if (deliveryDashboard) deliveryDashboard.classList.add('d-none');
        if (laundryDashboard) laundryDashboard.classList.add('d-none');
        if (adminDashboard) adminDashboard.classList.add('d-none');
        if (myOrders) myOrders.classList.add('d-none');
        showLanding(true);
    }

    // Toggle header user profile cart button and floating cart FAB based on role
    const headerCartContainerUser = document.getElementById('headerCartContainerUser');
    const cartFAB = document.getElementById('cartFAB');
    const isCustomerOrGuest = !user || user.role === 'user';
    
    if (headerCartContainerUser) {
        headerCartContainerUser.classList.toggle('d-none', !isCustomerOrGuest);
    }
    
    if (cartFAB) {
        if (!isCustomerOrGuest) {
            cartFAB.classList.add('d-none');
        } else {
            const count = (typeof cart !== 'undefined' && Array.isArray(cart)) ? cart.reduce((sum, i) => sum + i.quantity, 0) : 0;
            cartFAB.classList.toggle('d-none', count === 0);
        }
    }
    
    // Collapse mobile menu automatically on login state change
    collapseNavbar();
}

async function updateProfile() {
    const newName = document.getElementById('editProfileName').value;
    if (!newName) return notifyUser('Name cannot be empty', 'warning');

    try {
        const response = await fetch('/api/auth/profile', {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${user.token}`
            },
            body: JSON.stringify({ name: newName })
        });

        const data = await response.json();
        if (response.ok) {
            user.name = newName;
            localStorage.setItem('user', JSON.stringify(user));
            updateAuthUI();
            notifyUser('Profile updated successfully!', 'success');
            bootstrap.Modal.getInstance(document.getElementById('profileModal')).hide();
        } else {
            notifyUser(data.message || 'Update failed', 'danger');
        }
    } catch (error) {
        console.error('Update Profile Error:', error);
        notifyUser('Server error while updating profile', 'danger');
    }
}

async function fetchUserOrders() {
    try {
        const res = await fetch(`/api/orders/myorders?t=${Date.now()}`, {
            headers: { 'Authorization': `Bearer ${user.token}` }
        });
        const orders = await res.json();
        const list = document.getElementById('orderHistoryList');
        list.innerHTML = orders.map(o => {
            const s = o.status.trim().toLowerCase();
            let uiIdx = 0;
            if (s === 'placed') uiIdx = 0;
            else if (s === 'picked' || s === 'picked up' || s === 'dropped at laundry') uiIdx = 1;
            else if (s === 'arrived' || s === 'arrived in laundry') uiIdx = 2;
            else if (s === 'washing' || s === 'wash' || s === 'in process') uiIdx = 3;
            else if (s === 'ready' || s === 'delivery assigned') uiIdx = 4;
            else if (s === 'dispatched' || s === 'out for delivery') uiIdx = 5;
            else if (s === 'delivered') uiIdx = 6;

            const steps = [
                { id: 'placed', label: 'Placed' },
                { id: 'picked', label: 'Picked' },
                { id: 'arrived', label: 'Arrived' },
                { id: 'wash', label: 'Wash' },
                { id: 'ready', label: 'Ready' },
                { id: 'ship', label: 'Ship' },
                { id: 'done', label: 'Done' }
            ];

            return `
            <div class="col-md-6 col-lg-4">
                <div class="p-4 rounded-4 bg-glass border border-secondary shadow-sm h-100 d-flex flex-column">
                    <div class="d-flex justify-content-between mb-3">
                        <span class="badge bg-primary">Order #${o._id.slice(-6)}</span>
                        <span class="badge ${o.status === 'Delivered' ? 'bg-success' : 'bg-warning'}">${o.status}</span>
                    </div>
                    
                    <!-- Integrated Mini Tracker -->
                    <div class="mb-4 mt-2">
                        <div class="d-flex justify-content-between position-relative px-1">
                            <div class="position-absolute border-top border-2" style="top: 10px; left: 10%; right: 10%; z-index: 0; border-color: #334155 !important;"></div>
                            ${steps.map((step, idx) => `
                                <div class="text-center" style="z-index: 1; width: 20%;">
                                    <div class="rounded-circle mx-auto mb-1" style="width: 20px; height: 20px; border: 2px solid ${idx <= uiIdx ? '#0d6efd' : '#334155'}; background: ${idx <= uiIdx ? '#0d6efd' : '#0f172a'};">
                                        ${idx <= uiIdx ? '<i class="fas fa-check text-white" style="font-size: 10px;"></i>' : ''}
                                    </div>
                                    <div class="x-small ${idx <= uiIdx ? 'text-primary' : 'text-secondary'}" style="font-size: 0.65rem;">${step.label}</div>
                                </div>
                            `).join('')}
                        </div>
                    </div>

                    <div class="mb-3">
                        <small class="text-secondary d-block">Items:</small>
                        <div class="fw-bold">${o.items.map(i => `${i.quantity}x ${escapeHtml(i.name)}`).join(', ')}</div>
                    </div>
                    <div class="mb-3">
                        <small class="text-secondary d-block">Delivery To:</small>
                        <div class="small text-secondary">${o.address ? `${escapeHtml(o.address.addressLine)}, ${escapeHtml(o.address.pincode)}` : 'N/A'}</div>
                    </div>
                    ${['Placed', 'Pickup Assigned', 'Laundry Confirmed'].includes(o.status) ? `
                    <div class="mb-3 p-2 rounded-3 bg-dark text-center border border-warning">
                        <small class="text-warning fw-bold d-block mb-1" style="font-size: 0.7rem;"><i class="fas fa-key me-1"></i>SECURE PICKUP HANDOVER OTP</small>
                        <span class="fs-5 fw-bold text-white tracking-wider">${(parseInt(o._id.slice(-6), 16) * 3 % 9000 + 1000)}</span>
                        <div class="x-small text-secondary mt-1" style="font-size: 0.65rem;">Share with Pickup Boy only at doorstep</div>
                    </div>
                    ` : ''}
                    ${['Ready', 'Delivery Assigned', 'Out for Delivery'].includes(o.status) ? `
                    <div class="mb-3 p-2 rounded-3 bg-dark text-center border border-success">
                        <small class="text-success fw-bold d-block mb-1" style="font-size: 0.7rem;"><i class="fas fa-key me-1"></i>SECURE DELIVERY HANDOVER OTP</small>
                        <span class="fs-5 fw-bold text-white tracking-wider">${(parseInt(o._id.slice(-6), 16) * 9 % 9000 + 1000)}</span>
                        <div class="x-small text-secondary mt-1" style="font-size: 0.65rem;">Share with Delivery Boy only when clothes are safely in your hand</div>
                    </div>
                    ` : ''}
                    ${
                        ((['pickup assigned', 'picked'].includes(s) && o.pickupAgent) ||
                         (['ready', 'dispatched', 'out for delivery'].includes(s) && o.deliveryAgent)) ? `
                    <div class="mb-3 p-3 rounded-3 bg-dark border-start border-info border-3">
                        <small class="text-secondary text-uppercase fw-bold" style="font-size: 0.65rem;">Assigned Agent</small>
                        <div class="d-flex align-items-center mt-1">
                            <div class="flex-grow-1">
                                <div class="fw-bold text-success">${s.includes('ready') || s.includes('out') || s.includes('dispatch') ? escapeHtml(o.deliveryAgent.name) : escapeHtml(o.pickupAgent.name)}</div>
                                <div class="small text-secondary">${s.includes('ready') || s.includes('out') || s.includes('dispatch') ? 'Delivery Partner' : 'Pickup Partner'}</div>
                            </div>
                            <a href="tel:${s.includes('ready') || s.includes('out') || s.includes('dispatch') ? o.deliveryAgent.phone : o.pickupAgent.phone}" class="btn btn-sm btn-success rounded-circle"><i class="fas fa-phone"></i></a>
                        </div>
                    </div>
                    ` : ''}
                    <div class="d-flex justify-content-between align-items-center mt-auto pt-3 border-top border-secondary">
                        <div class="h5 mb-0 text-primary">₹${o.totalPrice}</div>
                        <div class="d-flex gap-2">
                            ${o.status !== 'Delivered' ? `<button class="btn btn-sm btn-outline-danger" title="Track Map" onclick="initTrackingMap('${o._id}', '${o.status}')"><i class="fas fa-location-dot"></i></button>` : ''}
                            <a href="javascript:void(0)" onclick="downloadInvoice('${o._id}')" class="btn btn-sm btn-outline-info" title="Invoice"><i class="fas fa-file-invoice"></i></a>
                            ${o.status === 'Delivered' ? `<button class="btn btn-sm btn-warning" title="Rate" onclick="openRatingModal('${o._id}')"><i class="fas fa-star"></i></button>` : ''}
                        </div>
                    </div>
                </div>
            </div>`;
        }).join('') || '<div class="text-center text-secondary py-5">No order history found</div>';
    } catch (err) {
        console.error('Error fetching user orders');
    }
}

async function fetchDeliveryOrders() {
    console.log('--- fetchDeliveryOrders called ---');
    if (!user) return;
    try {
        const res = await fetch('/api/orders/all', {
            headers: { 'Authorization': `Bearer ${user.token}` }
        });
        console.log('Response Status:', res.status);
        const orders = await res.json();
        console.log('Orders received:', orders.length);
        
        // Fetch Earnings Stats
        try {
            const statsRes = await fetch('/api/orders/stats', {
                headers: { 'Authorization': `Bearer ${user.token}` }
            });
            const stats = await statsRes.json();
            
            // Update Dashboard Stats
            const pOrders = document.getElementById('partnerTotalOrders');
            const pToday = document.getElementById('partnerTodayEarnings');
            const pMain = document.getElementById('partnerMainWallet');
            const aTasks = document.getElementById('agentCompletedTasks');
            const aToday = document.getElementById('agentTodayEarnings');
            const aMain = document.getElementById('agentMainWallet');
            const aCash = document.getElementById('agentCashInHand');

            if (pOrders) pOrders.innerText = stats.totalOrders;
            if (pToday) pToday.innerText = `₹${stats.todayEarnings}`;
            if (pMain) pMain.innerText = `₹${stats.mainWallet}`;
            if (aTasks) aTasks.innerText = stats.totalOrders;
            if (aToday) aToday.innerText = `₹${stats.todayEarnings}`;
            if (aMain) aMain.innerText = `₹${stats.mainWallet}`;
            if (aCash) aCash.innerText = `₹${stats.cashInHand || 0}`;
        } catch (e) { console.error('Stats fetch error:', e); }

        renderDeliveryDashboard(orders);
    } catch (err) {
        console.error('Error fetching partner orders:', err);
    }
}

async function updateOrderStatusAgent(id, status) {
    updateStatus(id, status);
}

async function fetchAdminOrders() {
    try {
        const res = await fetch('/api/admin/orders', {
            headers: { 'Authorization': `Bearer ${user.token}` }
        });
        const orders = await res.json();
        allAdminOrders = orders; // Store globally
        renderAdminOrdersList(orders);
    } catch (err) {
        console.error('Error fetching admin orders');
    }
}

function renderAdminOrdersList(orders) {
    const table = document.getElementById('adminOrdersTable');
    if (!table) return;
    table.innerHTML = orders.map(o => `
        <tr>
            <td>#${o._id.slice(-6)}</td>
            <td>
                <div class="fw-bold">${escapeHtml(o.user?.name) || 'Guest'}</div>
                <div class="small text-secondary">${escapeHtml(o.user?.email) || 'N/A'}</div>
            </td>
            <td>₹${o.totalPrice}</td>
            <td>${escapeHtml(o.address?.pincode) || 'N/A'}</td>
            <td><span class="badge bg-secondary">${o.status}</span></td>
            <td>
                <div class="d-flex gap-2">
                    <select class="form-select form-select-sm bg-dark text-white border-secondary" onchange="updateStatus('${o._id}', this.value)">
                        <option value="Placed" ${o.status === 'Placed' ? 'selected' : ''}>Placed</option>
                        <option value="Accepted" ${o.status === 'Accepted' ? 'selected' : ''}>Accepted</option>
                        <option value="Picked Up" ${o.status === 'Picked Up' ? 'selected' : ''}>Picked Up</option>
                        <option value="In Process" ${o.status === 'In Process' ? 'selected' : ''}>In Process</option>
                        <option value="Out for Delivery" ${o.status === 'Out for Delivery' ? 'selected' : ''}>Out for Delivery</option>
                        <option value="Delivered" ${o.status === 'Delivered' ? 'selected' : ''}>Delivered</option>
                        <option value="Cancelled" ${o.status === 'Cancelled' ? 'selected' : ''}>Cancelled</option>
                    </select>
                    <button class="btn btn-sm btn-outline-info" onclick="downloadInvoice('${o._id}')" title="Print Bill"><i class="fas fa-print"></i></button>
                </div>
            </td>
        </tr>
    `).join('') || '<tr><td colspan="6" class="text-center py-4">No orders found</td></tr>';
}

function filterOrders() {
    const input = document.getElementById('adminOrderSearch');
    if (!input) return;
    const query = input.value.toLowerCase();
    const filtered = allAdminOrders.filter(o => 
        o._id.toLowerCase().includes(query) || 
        (o.user?.name || '').toLowerCase().includes(query) || 
        (o.user?.email || '').toLowerCase().includes(query) ||
        (o.address?.pincode || '').toLowerCase().includes(query)
    );
    renderAdminOrdersList(filtered);
}

async function fetchCustomers() {
    try {
        const res = await fetch('/api/admin/customers', {
            headers: { 'Authorization': `Bearer ${user.token}` }
        });
        const customers = await res.json();
        allCustomers = customers; // Store globally for filtering
        renderCustomersList(customers);
    } catch (err) {
        console.error('Error fetching customers:', err);
    }
}

function renderCustomersList(customers) {
    const table = document.getElementById('adminCustomersTable');
    const badge = document.getElementById('customerCountBadge');
    
    if (badge) badge.innerText = `${customers.length} Total Users`;
    
    if (table) {
        table.innerHTML = customers.map(c => `
            <tr>
                <td>
                    <div class="fw-bold text-primary">${escapeHtml(c.name)}</div>
                    <div class="small text-secondary">${escapeHtml(c.email)}</div>
                </td>
                <td>
                    <div class="fw-bold text-light">${escapeHtml(c.phone) || '<span class="text-secondary small">N/A</span>'}</div>
                </td>
                <td>
                    <div class="small text-wrap text-secondary" style="max-width: 250px;">${escapeHtml(c.lastAddress)}</div>
                </td>
                <td>
                    <div class="badge bg-dark border border-info text-info px-3 py-2">${c.orderCount} Orders</div>
                </td>
                <td>
                    <div class="small text-secondary">${new Date(c.createdAt).toLocaleDateString()}</div>
                </td>
            </tr>
        `).join('') || '<tr><td colspan="5" class="text-center text-secondary py-4">No customers registered yet</td></tr>';
    }
}

function filterCustomers() {
    const input = document.getElementById('adminCustomerSearch');
    if (!input) return;
    const query = input.value.toLowerCase();
    const filtered = allCustomers.filter(c => 
        (c.name || '').toLowerCase().includes(query) || 
        (c.phone || '').toLowerCase().includes(query) || 
        (c.email || '').toLowerCase().includes(query)
    );
    renderCustomersList(filtered);
}

// Admin Logic Below

async function fetchAdminStats() {
    try {
        const res = await fetch('/api/admin/stats', {
            headers: { 'Authorization': `Bearer ${user.token}` }
        });
        const stats = await res.json();
        document.getElementById('totalOrdersCount').innerText = stats.totalOrders;
        document.getElementById('totalRevenue').innerText = `₹${stats.totalRevenue}`;
        document.getElementById('pendingAppsCount').innerText = stats.pendingApps;
        const activeCount = document.getElementById('activePartnersCount');
        if (activeCount) activeCount.innerText = stats.activePartners;
        
        fetchSalesReport();
    } catch (err) {
        console.error('Error fetching admin stats');
    }
}

async function fetchSalesReport() {
    try {
        const res = await fetch('/api/admin/reports', {
            headers: { 'Authorization': `Bearer ${user.token}` }
        });
        const reports = await res.json();
        const table = document.getElementById('salesReportTable');
        if (table) {
            table.innerHTML = reports.map(r => `
                <tr>
                    <td>${r.date}</td>
                    <td>${r.orderCount}</td>
                    <td class="text-success fw-bold">₹${r.revenue}</td>
                </tr>
            `).join('') || '<tr><td colspan="3" class="text-center text-secondary">No recent data</td></tr>';
        }

        // Render Chart
        const labels = reports.map(r => r.date).reverse();
        const revenueData = reports.map(r => r.revenue).reverse();
        const ordersData = reports.map(r => r.orderCount).reverse();
        
        const ctx = document.getElementById('salesChart');
        if (ctx) {
            const isAllZero = revenueData.every(v => v === 0) && ordersData.every(v => v === 0);
            const colDiv = ctx.parentElement.parentElement;
            
            if (isAllZero) {
                colDiv.style.display = 'none';
            } else {
                colDiv.style.display = 'block';
                const ctx2d = ctx.getContext('2d');
                if (window.mySalesChart) {
                    window.mySalesChart.destroy();
                }
                window.mySalesChart = new Chart(ctx2d, {
                    type: 'line',
                    data: {
                        labels: labels,
                        datasets: [
                            {
                                label: 'Revenue (₹)',
                                data: revenueData,
                                borderColor: '#3b82f6',
                                backgroundColor: 'rgba(59, 130, 246, 0.1)',
                                borderWidth: 2,
                                fill: true,
                                tension: 0.4,
                                yAxisID: 'y'
                            },
                            {
                                label: 'Orders',
                                data: ordersData,
                                borderColor: '#10b981',
                                backgroundColor: 'rgba(16, 185, 129, 0.1)',
                                borderWidth: 2,
                                fill: true,
                                tension: 0.4,
                                yAxisID: 'y1'
                            }
                        ]
                    },
                    options: {
                        responsive: true,
                        maintainAspectRatio: false,
                        scales: {
                            y: {
                                beginAtZero: true,
                                position: 'left',
                                grid: { color: 'rgba(255, 255, 255, 0.05)' },
                                ticks: { color: '#94a3b8' }
                            },
                            y1: {
                                beginAtZero: true,
                                position: 'right',
                                grid: { drawOnChartArea: false },
                                ticks: { color: '#94a3b8' }
                            },
                            x: {
                                grid: { color: 'rgba(255, 255, 255, 0.05)' },
                                ticks: { color: '#94a3b8' }
                            }
                        },
                        plugins: {
                            legend: { labels: { color: '#94a3b8' } }
                        }
                    }
                });
            }
        }
    } catch (err) {
        console.error('Error fetching sales report');
    }
}

async function fetchPendingPartners() {
    try {
        const res = await fetch('/api/admin/partners/pending', {
            headers: { 'Authorization': `Bearer ${user.token}` },
            cache: 'no-cache'
        });
        const partners = await res.json();
        const tableBody = document.getElementById('pendingPartnersTable');
        if (!tableBody) return;
        tableBody.innerHTML = partners.map(p => `
            <tr>
                <td>
                    <div class="fw-bold">${escapeHtml(p.name)}</div>
                    <div class="small text-secondary">${escapeHtml(p.email)}</div>
                    <div class="small text-info"><i class="fas fa-phone-alt me-1" style="font-size: 0.7rem;"></i>${escapeHtml(p.phone) || 'N/A'}</div>
                </td>
                <td><span class="badge bg-outline-primary border border-primary text-primary">${p.role.replace('_', ' ')}</span></td>
                <td>
                    <div class="small fw-bold">Pincode: ${escapeHtml(p.serviceArea)}</div>
                    <div class="small text-secondary text-truncate" style="max-width: 200px;">${escapeHtml(p.address) || 'N/A'}</div>
                    ${p.kycDocument ? `<button class="btn btn-sm btn-outline-info mt-2" onclick="viewKYC('${p.kycDocument}')"><i class="fas fa-eye me-1"></i>View KYC</button>` : '<span class="badge bg-secondary mt-1">No KYC</span>'}
                </td>
                <td>
                    <div class="d-flex gap-2">
                        <button class="btn btn-success btn-sm" onclick="updatePartnerStatus('${p._id}', 'active')"><i class="fas fa-check"></i></button>
                        <button class="btn btn-danger btn-sm" onclick="updatePartnerStatus('${p._id}', 'rejected')"><i class="fas fa-times"></i></button>
                    </div>
                </td>
            </tr>
        `).join('') || '<tr><td colspan="4" class="text-center py-4 text-secondary">No pending applications</td></tr>';
    } catch (err) {
        console.error('Error fetching pending partners');
    }
}


async function fetchActivePartners() {
    try {
        const res = await fetch('/api/admin/partners/active', {
            headers: { 'Authorization': `Bearer ${user.token}` },
            cache: 'no-cache'
        });
        const partners = await res.json();
        
        const pickupTable = document.getElementById('pickupAgentsTable');
        const deliveryTable = document.getElementById('deliveryAgentsTable');
        const laundryTable = document.getElementById('laundryPartnersTable');
        
        if (!pickupTable || !deliveryTable || !laundryTable) return;
        
        const renderRow = (p) => `
            <tr>
                <td>
                    <div class="fw-bold">${escapeHtml(p.name)}</div>
                    <div class="small text-secondary">${escapeHtml(p.email)}</div>
                    <div class="small text-info"><i class="fas fa-phone-alt me-1" style="font-size: 0.7rem;"></i>${escapeHtml(p.phone) || 'N/A'}</div>
                </td>
                <td>${escapeHtml(p.serviceArea) || escapeHtml(p.address) || 'N/A'}</td>
                <td class="text-success fw-bold">₹${p.todayEarnings || 0}</td>
                <td class="text-info fw-bold">₹${p.mainWallet || 0}</td>
                ${p.role === 'delivery_agent' ? `<td class="text-danger fw-bold">₹${p.cashInHand || 0}</td>` : ''}
                <td class="text-warning fw-bold">${p.completedOrdersCount || 0}</td>
                <td>
                    <div class="d-flex gap-2">
                        ${p.status === 'active' ? 
                            `<button class="btn btn-warning btn-sm" onclick="updatePartnerStatus('${p._id}', 'inactive')" title="Deactivate ID"><i class="fas fa-toggle-on"></i></button>` :
                            `<button class="btn btn-success btn-sm" onclick="updatePartnerStatus('${p._id}', 'active')" title="Activate ID"><i class="fas fa-toggle-off"></i></button>`
                        }
                        ${p.role === 'delivery_agent' ? 
                            `<button class="btn btn-info btn-sm" onclick="settleCash('${p._id}')" title="Settle Cash (Clear Cash to Pay Admin)"><i class="fas fa-money-bill-transfer"></i></button>` : ''
                        }
                        <button class="btn btn-success btn-sm" onclick="settleWallet('${p._id}')" title="Pay Partner (Clear Main Wallet)"><i class="fas fa-wallet"></i></button>
                        <button class="btn btn-danger btn-sm" onclick="updatePartnerStatus('${p._id}', 'rejected')" title="Delete Member Permanently"><i class="fas fa-trash"></i></button>
                    </div>
                </td>
            </tr>
        `;
        
        const pickups = partners.filter(p => p.role === 'pickup_agent');
        allActivePartners = partners;
        renderPartnersList(partners);
    } catch (err) {
        console.error('Error fetching active partners');
    }
}

function renderPartnersList(partners) {
    const pickupTable = document.getElementById('pickupAgentsTable');
    const deliveryTable = document.getElementById('deliveryAgentsTable');
    const laundryTable = document.getElementById('laundryPartnersTable');
    
    if (!pickupTable || !deliveryTable || !laundryTable) return;

    const pickups = partners.filter(p => p.role === 'pickup_agent');
    const deliveries = partners.filter(p => p.role === 'delivery_agent');
    const laundries = partners.filter(p => p.role === 'laundry_partner');

    pickupTable.innerHTML = pickups.map(p => `
        <tr>
            <td>
                <div class="fw-bold">${escapeHtml(p.name)}</div>
                <div class="small text-secondary">${escapeHtml(p.phone)}</div>
                <div class="mt-1">
                    <div class="small text-info" style="font-size: 0.7rem;"><i class="fas fa-wallet me-1"></i>${p.upiId || 'No UPI'}</div>
                    <div class="small text-secondary" style="font-size: 0.65rem;">${p.bankAccountNo ? `${p.bankName} (${p.bankAccountNo})` : 'No Bank'}</div>
                </div>
            </td>
            <td>${escapeHtml(p.serviceArea)}</td>
            <td class="text-success">₹${p.todayEarnings}</td>
            <td class="text-info">₹${p.mainWallet}</td>
            <td class="fw-bold text-warning">${p.completedOrdersCount}</td>
            <td>
                <div class="d-flex gap-1">
                    <button class="btn btn-sm btn-warning" onclick="toggleStatus('${p._id}', '${p.status}')" title="${p.status === 'active' ? 'Deactivate' : 'Activate'}">
                        <i class="fas fa-toggle-${p.status === 'active' ? 'on' : 'off'}"></i>
                    </button>
                    <button class="btn btn-sm btn-success" onclick="settleWallet('${p._id}')" title="Settle Wallet">
                        <i class="fas fa-wallet"></i>
                    </button>
                    <button class="btn btn-sm btn-danger" onclick="updatePartnerStatus('${p._id}', 'rejected')" title="Remove">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            </td>
        </tr>
    `).join('') || '<tr><td colspan="6" class="text-center text-secondary">No pickup agents</td></tr>';

    deliveryTable.innerHTML = deliveries.map(p => `
        <tr>
            <td>
                <div class="fw-bold">${escapeHtml(p.name)}</div>
                <div class="small text-secondary">${escapeHtml(p.phone)}</div>
                <div class="mt-1">
                    <div class="small text-info" style="font-size: 0.7rem;"><i class="fas fa-wallet me-1"></i>${p.upiId || 'No UPI'}</div>
                    <div class="small text-secondary" style="font-size: 0.65rem;">${p.bankAccountNo ? `${p.bankName} (${p.bankAccountNo})` : 'No Bank'}</div>
                </div>
            </td>
            <td>${escapeHtml(p.serviceArea)}</td>
            <td class="text-success">₹${p.todayEarnings}</td>
            <td class="text-info">₹${p.mainWallet}</td>
            <td class="text-danger">₹${p.cashInHand}</td>
            <td class="fw-bold text-warning">${p.completedOrdersCount}</td>
            <td>
                <div class="d-flex gap-1">
                    <button class="btn btn-sm btn-warning" onclick="toggleStatus('${p._id}', '${p.status}')">
                        <i class="fas fa-toggle-${p.status === 'active' ? 'on' : 'off'}"></i>
                    </button>
                    <button class="btn btn-sm btn-success" onclick="settleWallet('${p._id}')" title="Settle Wallet">
                        <i class="fas fa-wallet"></i>
                    </button>
                    <button class="btn btn-sm btn-info" onclick="settleCash('${p._id}')" title="Settle Cash">
                        <i class="fas fa-hand-holding-dollar"></i>
                    </button>
                    <button class="btn btn-sm btn-danger" onclick="updatePartnerStatus('${p._id}', 'rejected')">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            </td>
        </tr>
    `).join('') || '<tr><td colspan="7" class="text-center text-secondary">No delivery agents</td></tr>';

    laundryTable.innerHTML = laundries.map(p => `
        <tr>
            <td>
                <div class="fw-bold">${escapeHtml(p.name)}</div>
                <div class="small text-secondary">${escapeHtml(p.phone)}</div>
                <div class="mt-1">
                    <div class="small text-info" style="font-size: 0.7rem;"><i class="fas fa-wallet me-1"></i>${p.upiId || 'No UPI'}</div>
                    <div class="small text-secondary" style="font-size: 0.65rem;">${p.bankAccountNo ? `${p.bankName} (${p.bankAccountNo})` : 'No Bank'}</div>
                </div>
            </td>
            <td><div class="small text-wrap" style="max-width: 200px;">${escapeHtml(p.address)}</div></td>
            <td class="text-success">₹${p.todayEarnings}</td>
            <td class="text-info">₹${p.mainWallet}</td>
            <td class="fw-bold text-warning">${p.completedOrdersCount}</td>
            <td>
                <div class="d-flex gap-1">
                    <button class="btn btn-sm btn-warning" onclick="toggleStatus('${p._id}', '${p.status}')">
                        <i class="fas fa-toggle-${p.status === 'active' ? 'on' : 'off'}"></i>
                    </button>
                    <button class="btn btn-sm btn-success" onclick="settleWallet('${p._id}')" title="Settle Wallet">
                        <i class="fas fa-wallet"></i>
                    </button>
                    <button class="btn btn-sm btn-danger" onclick="updatePartnerStatus('${p._id}', 'rejected')">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            </td>
        </tr>
    `).join('') || '<tr><td colspan="6" class="text-center text-secondary">No laundry partners</td></tr>';
}

function filterPartners() {
    const input = document.getElementById('adminPartnerSearch');
    if (!input) return;
    const query = input.value.toLowerCase();
    const filtered = allActivePartners.filter(p => 
        (p.name || '').toLowerCase().includes(query) || 
        (p.phone || '').toLowerCase().includes(query) || 
        (p.serviceArea || '').toLowerCase().includes(query) ||
        (p.address || '').toLowerCase().includes(query)
    );
    renderPartnersList(filtered);
}





function renderDeliveryDashboard(orders) {
    const pickupOrders = document.getElementById('pickupOrders');
    const deliveryOrders = document.getElementById('deliveryOrders');
    const processingOrders = document.getElementById('processingOrders');
    
    const pickupCol = document.getElementById('pickupCol');
    const deliveryCol = document.getElementById('deliveryCol');

    // 1. Pickup Boy Actions (Placed -> Picked -> Arrived in Laundry)
    const toPickup = orders.filter(o => o.status === 'Placed' || o.status === 'Picked');
    
    // 2. Delivery Boy Actions (Ready -> Out for Delivery -> Delivered)
    const toDeliver = orders.filter(o => o.status === 'Ready' || o.status === 'Out for Delivery');
    
    // 3. Laundry Partner Actions (Arrived in Laundry -> Washing -> Ready)
    const toProcess = orders.filter(o => ['Arrived in Laundry', 'Washing'].includes(o.status));

    console.log('To Pickup:', toPickup.length);
    console.log('To Deliver:', toDeliver.length);
    console.log('To Process:', toProcess.length);

    // Laundry Partner View
    if (user.role === 'laundry_partner' && processingOrders) {
        const availableOrders = orders.filter(o => o.status === 'Placed' && !o.laundryPartner);
        // FIX: Filter out Delivered orders from Active list
        const myOrders = orders.filter(o => (o.laundryPartner?._id === user._id || o.laundryPartner === user._id) && o.status !== 'Delivered');

        processingOrders.innerHTML = `
            <div class="col-12 mb-3">
                <h5 class="text-warning"><i class="fas fa-bell me-2"></i>Available Orders to Claim</h5>
            </div>
            ${availableOrders.map(o => `
                <div class="col-md-6 col-lg-4 mb-3">
                    <div class="service-card p-4 h-100 border-top border-warning border-4">
                        <div class="d-flex justify-content-between mb-3">
                            <span class="badge bg-warning text-dark">NEW ORDER</span>
                            <span class="text-secondary small">ID: ...${o._id.slice(-6)}</span>
                        </div>
                        <h6>${o.address?.fullName || 'Guest'}</h6>
                        <p class="small text-secondary mb-1"><i class="fas fa-map-marker-alt me-1"></i> ${o.address?.pincode || 'No Pincode'}</p>
                        <ul class="list-unstyled small text-secondary mb-3">
                            ${o.items.map(i => `<li><i class="fas fa-check me-2"></i>${i.name} x ${i.quantity}</li>`).join('')}
                        </ul>
                        <button class="btn btn-warning w-100 fw-bold" onclick="updateStatus('${o._id}', 'Laundry Confirmed')">Confirm Order</button>
                    </div>
                </div>
            `).join('') || '<div class="col-12 text-center text-secondary py-3">No new orders available</div>'}

            <div class="col-12 mb-3 mt-4">
                <h5 class="text-success"><i class="fas fa-tasks me-2"></i>My Active Orders</h5>
            </div>
            ${myOrders.map(o => {
                let btnText = 'Processing';
                let nextStatus = '';
                let colorClass = 'secondary';

                if (o.status === 'Washing') {
                    btnText = 'Mark Ready';
                    nextStatus = 'Ready';
                    colorClass = 'success';
                } else if (o.status === 'Laundry Confirmed' || o.status === 'Placed') {
                    btnText = 'Waiting for Pickup';
                    colorClass = 'secondary';
                } else if (o.status === 'Pickup Assigned') {
                    btnText = 'Boy On The Way';
                    colorClass = 'warning';
                } else if (o.status === 'Picked') {
                    btnText = 'With Pickup Boy';
                    colorClass = 'warning';
                } else if (o.status === 'Dropped at Laundry') {
                    btnText = 'Confirm Order';
                    nextStatus = 'Arrived in Laundry';
                    colorClass = 'warning';
                } else if (o.status === 'Arrived in Laundry') {
                    btnText = 'Start Washing';
                    nextStatus = 'Washing';
                    colorClass = 'info';
                } else if (o.status === 'Ready') {
                    btnText = 'Waiting for Delivery Boy';
                    colorClass = 'secondary';
                } else if (o.status === 'Delivery Assigned') {
                    btnText = 'Delivery Boy On The Way';
                    colorClass = 'secondary';
                } else if (o.status === 'Out for Delivery') {
                    btnText = 'Out for Delivery';
                    colorClass = 'secondary';
                }

                const isClickable = ['Arrived in Laundry', 'Washing', 'Dropped at Laundry'].includes(o.status);

                return `
                <div class="col-md-6 col-lg-4 mb-3">
                    <div class="service-card p-4 h-100 border-top border-${colorClass} border-4">
                        <div class="d-flex justify-content-between align-items-start mb-3 gap-2">
                            <span class="badge bg-${colorClass} text-dark text-wrap text-start" style="max-width: 60%;">${o.status.toUpperCase()}</span>
                            <span class="text-secondary small text-nowrap">ID: ...${o._id.slice(-6)}</span>
                        </div>
                        <h6>${o.address?.fullName || 'Guest'}</h6>
                        <ul class="list-unstyled small text-secondary mb-3">
                            ${o.items.map(i => `<li><i class="fas fa-check me-2"></i>${i.name} x ${i.quantity}</li>`).join('')}
                        </ul>
                        ${['Ready', 'Delivery Assigned'].includes(o.status) ? `
                        <div class="mb-2 p-2 rounded bg-dark border border-success text-center">
                            <small class="text-success fw-bold d-block mb-1" style="font-size: 0.65rem;"><i class="fas fa-truck me-1"></i>DELIVERY AGENT RECEIPT OTP</small>
                            <span class="fs-6 fw-bold text-white">${(parseInt(o._id.slice(-6), 16) * 7 % 9000 + 1000)}</span>
                            <div class="x-small text-secondary mt-1" style="font-size: 0.6rem;">Show to Delivery Boy upon handing over clean clothes</div>
                        </div>
                        ` : ''}
                        ${isClickable ? 
                            `<button class="btn btn-${colorClass} w-100 fw-bold" onclick="updateStatus('${o._id}', '${nextStatus}')">${btnText}</button>` :
                            `<button class="btn btn-${colorClass} w-100 fw-bold" disabled>${btnText}</button>`
                        }
                        <button class="btn btn-sm btn-outline-info w-100 mt-2 fw-bold" onclick="downloadInvoice('${o._id}')"><i class="fas fa-print me-2"></i>Print Bill</button>
                    </div>
                </div>
                `;
            }).join('') || '<div class="col-12 text-center text-secondary py-3">No active orders</div>'}
        `;
        return;
    }

    // Agent Views
    if (user.role === 'pickup_agent' && pickupCol) {
        pickupCol.classList.remove('d-none');
        deliveryCol.classList.add('d-none');
        pickupCol.classList.replace('col-md-6', 'col-12');
    } else if (user.role === 'delivery_agent' && deliveryCol) {
        pickupCol.classList.add('d-none');
        deliveryCol.classList.remove('d-none');
        deliveryCol.classList.replace('col-md-6', 'col-12');
    }

    if (user.role === 'pickup_agent') {
        const availablePickups = orders.filter(o => ['Placed', 'Laundry Confirmed'].includes(o.status) && !o.pickupAgent);
        const myPickups = orders.filter(o => (o.pickupAgent?._id === user._id || o.pickupAgent === user._id) && o.status !== 'Delivered');

        pickupOrders.innerHTML = `
            <div class="mb-3">
                <h6 class="text-warning"><i class="fas fa-bell me-2"></i>Available Pickups</h6>
            </div>
            ${availablePickups.map(o => `
                <div class="service-card delivery-order-card p-3 mb-3 border-start border-warning border-4" data-id="${o._id}">
                    <div class="d-flex justify-content-between align-items-start mb-2 gap-2">
                        <span class="badge bg-dark text-warning border border-warning text-wrap text-start" style="max-width: 60%;">AVAILABLE</span>
                        <span class="text-secondary small text-nowrap">ID: ...${String(o._id).slice(-6)}</span>
                    </div>
                    <h6>${o.address?.fullName || 'Guest'}</h6>
                    ${o.laundryPartner ? `<p class="small text-success mb-1 fw-bold"><i class="fas fa-store me-1"></i> Drop at: ${o.laundryPartner.name}</p>` : ''}
                    <p class="small text-secondary mb-1 text-truncate"><i class="fas fa-map-marker-alt me-1"></i> ${o.address?.addressLine || 'No Address'}</p>
                    <div class="d-flex gap-2 mt-2">
                        <button class="btn btn-sm btn-warning flex-grow-1 fw-bold" onclick="updateStatus('${o._id}', 'Pickup Assigned')">Claim Pickup</button>
                        <a href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent((o.address?.addressLine || '') + ' ' + (o.address?.pincode || ''))}" target="_blank" class="btn btn-sm btn-outline-light"><i class="fas fa-directions"></i></a>
                    </div>
                </div>
            `).join('') || '<p class="text-center text-secondary py-3">No available pickups</p>'}

            <div class="mb-3 mt-4">
                <h6 class="text-success"><i class="fas fa-tasks me-2"></i>My Pickups</h6>
            </div>
            ${myPickups.map(o => {
                let btnText = 'Mark Picked Up';
                let nextStatus = 'Picked';
                let colorClass = 'warning';

                if (o.status === 'Pickup Assigned' || o.status === 'Placed' || o.status === 'Laundry Confirmed') {
                    btnText = 'Mark Picked Up';
                    nextStatus = 'Picked';
                    colorClass = 'warning';
                } else if (o.status === 'Picked') {
                    btnText = 'Deliver to Laundry';
                    nextStatus = 'Dropped at Laundry';
                    colorClass = 'primary';
                } else if (o.status === 'Dropped at Laundry') {
                    btnText = 'Waiting for Receipt';
                    colorClass = 'secondary';
                }

                const isClickable = ['Pickup Assigned', 'Picked', 'Placed', 'Laundry Confirmed'].includes(o.status);

                return `
                <div class="service-card delivery-order-card p-3 mb-3 border-start border-${colorClass} border-4" data-id="${o._id}">
                    <div class="d-flex justify-content-between align-items-start mb-2 gap-2">
                        <span class="badge bg-dark text-${colorClass} border border-${colorClass} text-wrap text-start" style="max-width: 60%;">${o.status.toUpperCase()}</span>
                        <span class="text-secondary small text-nowrap">ID: ...${String(o._id).slice(-6)}</span>
                    </div>
                    <h6>${o.address?.fullName || 'Guest'}</h6>
                    ${o.laundryPartner ? `<p class="small text-success mb-1 fw-bold"><i class="fas fa-store me-1"></i> Drop at: ${o.laundryPartner.name}</p>` : ''}
                    <p class="small text-secondary mb-1 text-truncate"><i class="fas fa-map-marker-alt me-1"></i> ${o.address?.addressLine || 'No Address'}</p>
                    <p class="small text-info mb-3"><i class="fas fa-phone-alt me-1"></i> ${o.address?.mobile || 'No Contact'}</p>
                    ${o.status === 'Picked' ? `
                    <div class="mb-2 p-2 rounded bg-dark border border-primary text-center">
                        <small class="text-primary fw-bold d-block mb-1" style="font-size: 0.65rem;"><i class="fas fa-store me-1"></i>LAUNDRY RECEIPT OTP</small>
                        <span class="fs-6 fw-bold text-white">${(parseInt(o._id.slice(-6), 16) * 5 % 9000 + 1000)}</span>
                        <div class="x-small text-secondary mt-1" style="font-size: 0.6rem;">Show to Laundry Shop Owner upon dropping clothes</div>
                    </div>
                    ` : ''}
                    <div class="d-flex gap-2">
                        ${isClickable ? 
                            `<button class="btn btn-sm btn-${colorClass} flex-grow-1 fw-bold" onclick="updateStatus('${o._id}', '${nextStatus}')">${btnText}</button>` :
                            `<button class="btn btn-sm btn-${colorClass} flex-grow-1 fw-bold" disabled>${btnText}</button>`
                        }
                        <button class="btn btn-sm btn-outline-info" onclick="downloadInvoice('${o._id}')" title="Print Bill"><i class="fas fa-print"></i></button>
                        <a href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent((o.address?.addressLine || '') + ' ' + (o.address?.pincode || ''))}" target="_blank" class="btn btn-sm btn-outline-light"><i class="fas fa-directions"></i></a>
                    </div>
                </div>
                `;
            }).join('') || '<p class="text-center text-secondary py-3">No active pickups</p>'}
        `;
    }

    if (user.role === 'delivery_agent') {
        const availableDeliveries = orders.filter(o => o.status === 'Ready' && !o.deliveryAgent);
        const myDeliveries = orders.filter(o => (o.deliveryAgent?._id === user._id || o.deliveryAgent === user._id) && o.status !== 'Delivered');

        deliveryOrders.innerHTML = `
            <div class="mb-3">
                <h6 class="text-warning"><i class="fas fa-bell me-2"></i>Available Deliveries</h6>
            </div>
            ${availableDeliveries.map(o => `
                <div class="service-card delivery-order-card p-3 mb-3 border-start border-warning border-4" data-id="${o._id}">
                    <div class="d-flex justify-content-between mb-2">
                        <span class="badge bg-dark text-warning border border-warning">AVAILABLE</span>
                        <span class="text-secondary small">ID: ...${o._id.slice(-6)}</span>
                    </div>
                    <h6>${o.address.fullName}</h6>
                    ${o.laundryPartner ? `<p class="small text-primary mb-1 fw-bold"><i class="fas fa-store me-1"></i> Pick from: ${o.laundryPartner.name} (${o.laundryPartner.phone})</p>` : ''}
                    <p class="small text-secondary mb-1"><i class="fas fa-map-marker-alt me-1"></i> ${o.address.addressLine}</p>
                    <div class="d-flex gap-2 mt-2">
                        <button class="btn btn-sm btn-warning flex-grow-1" onclick="updateStatus('${o._id}', 'Delivery Assigned')">Claim Delivery</button>
                        <a href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(o.address.addressLine + ' ' + o.address.pincode)}" target="_blank" class="btn btn-sm btn-outline-light"><i class="fas fa-directions"></i></a>
                    </div>
                </div>
            `).join('') || '<p class="text-center text-secondary py-3">No available deliveries</p>'}

            <div class="mb-3 mt-4">
                <h6 class="text-success"><i class="fas fa-tasks me-2"></i>My Deliveries</h6>
            </div>
            ${myDeliveries.map(o => {
                let btnText = 'Pick from Laundry';
                let nextStatus = 'Out for Delivery';
                let colorClass = 'primary';

                if (o.status === 'Delivery Assigned') {
                    btnText = 'Pick from Laundry';
                    nextStatus = 'Out for Delivery';
                    colorClass = 'primary';
                } else if (o.status === 'Out for Delivery') {
                    btnText = 'Mark Delivered';
                    nextStatus = 'Delivered';
                    colorClass = 'success';
                }

                return `
                <div class="service-card delivery-order-card p-3 mb-3 border-start border-${colorClass} border-4" data-id="${o._id}">
                    <div class="d-flex justify-content-between align-items-start mb-2 gap-2">
                        <span class="badge bg-dark text-${colorClass} border border-${colorClass} text-wrap text-start" style="max-width: 60%;">${o.status.toUpperCase()}</span>
                        <span class="text-secondary small text-nowrap">ID: ...${o._id.slice(-6)}</span>
                    </div>
                    <h6>${o.address.fullName}</h6>
                    ${o.laundryPartner ? `<p class="small text-primary mb-1 fw-bold"><i class="fas fa-store me-1"></i> Pick from: ${o.laundryPartner.name}</p>` : ''}
                    <p class="small text-secondary mb-1 text-truncate"><i class="fas fa-map-marker-alt me-1"></i> ${o.address.addressLine}</p>
                    <p class="small text-info mb-3"><i class="fas fa-phone-alt me-1"></i> ${o.address.mobile}</p>
                    <div class="d-flex gap-2">
                        <button class="btn btn-sm btn-${colorClass} flex-grow-1 fw-bold" onclick="updateStatus('${o._id}', '${nextStatus}')">${btnText}</button>
                        <button class="btn btn-sm btn-outline-info" onclick="downloadInvoice('${o._id}')" title="Print Bill"><i class="fas fa-print"></i></button>
                        <a href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(o.address.addressLine + ' ' + o.address.pincode)}" target="_blank" class="btn btn-sm btn-outline-light"><i class="fas fa-directions"></i></a>
                    </div>
                </div>
                `;
            }).join('') || '<p class="text-center text-secondary py-3">No active deliveries</p>'}
        `;
    }
}

window.downloadInvoice = function(orderId) {
    // Use window.location.href instead of window.open to avoid popup blockers on mobile
    window.location.href = `/api/orders/${orderId}/invoice?token=${user.token}`;
}

async function updateStatus(orderId, status, bypassOtp = false, pickupInspectionReport = '', laundryInspectionReport = '', deliveryInspectionReport = '', customerDeliveryAcknowledgement = '') {
    const otpStatuses = ['Picked', 'Arrived in Laundry', 'Out for Delivery', 'Delivered'];
    if (!bypassOtp && otpStatuses.includes(status)) {
        if (typeof window.getTransitionOtp !== 'function') {
            // Safe fallback if not loaded yet
            window.getTransitionOtp = function(oId, st) {
                const idNum = parseInt(oId.slice(-6), 16);
                switch(st) {
                    case 'Laundry Confirmed': return (idNum * 11 % 9000 + 1000);
                    case 'Pickup Assigned': return (idNum * 13 % 9000 + 1000);
                    case 'Picked': return (idNum * 3 % 9000 + 1000);
                    case 'Dropped at Laundry': return (idNum * 17 % 9000 + 1000);
                    case 'Arrived in Laundry': return (idNum * 5 % 9000 + 1000);
                    case 'Washing': return (idNum * 19 % 9000 + 1000);
                    case 'Ready': return (idNum * 21 % 9000 + 1000);
                    case 'Delivery Assigned': return (idNum * 23 % 9000 + 1000);
                    case 'Out for Delivery': return (idNum * 7 % 9000 + 1000);
                    case 'Delivered': return (idNum * 9 % 9000 + 1000);
                    case 'Cancelled': return (idNum * 27 % 9000 + 1000);
                    default: return (idNum * 29 % 9000 + 1000);
                }
            };
        }

        const expectedOtp = window.getTransitionOtp(orderId, status);
        const promptMsg = `Please enter the 4-digit <strong>Secure Transition OTP</strong> to change order status to <strong>${status}</strong>.`;
        
        window.activeHandoverVerification = {
            orderId,
            status,
            expectedOtp
        };
        
        // Render inspection checklists dynamically depending on the target status
        const inspSection = document.getElementById('handoverInspectionSection');
        const laundrySection = document.getElementById('laundryReceiptInspectionSection');
        const deliverySection = document.getElementById('deliveryReceiptInspectionSection');
        const customerSection = document.getElementById('customerAcknowledgementSection');

        if (inspSection) {
            if (status === 'Picked') {
                inspSection.classList.remove('d-none');
                document.getElementById('inspectionTornCheck').checked = false;
                document.getElementById('inspectionStainedCheck').checked = false;
                document.getElementById('inspectionNotesInput').value = '';
            } else {
                inspSection.classList.add('d-none');
            }
        }

        if (laundrySection) {
            if (status === 'Arrived in Laundry') {
                laundrySection.classList.remove('d-none');
                document.getElementById('laundryInspectionTornCheck').checked = false;
                document.getElementById('laundryInspectionCountCheck').checked = true;
                document.getElementById('laundryInspectionNotesInput').value = '';
            } else {
                laundrySection.classList.add('d-none');
            }
        }

        if (deliverySection) {
            if (status === 'Out for Delivery') {
                deliverySection.classList.remove('d-none');
                document.getElementById('deliveryInspectionIntactCheck').checked = true;
                document.getElementById('deliveryInspectionNotesInput').value = '';
            } else {
                deliverySection.classList.add('d-none');
            }
        }

        if (customerSection) {
            if (status === 'Delivered') {
                customerSection.classList.remove('d-none');
                document.getElementById('customerAckPerfectCheck').checked = true;
                document.getElementById('customerAckNotesInput').value = '';
            } else {
                customerSection.classList.add('d-none');
            }
        }
        
        document.getElementById('handoverPromptMessage').innerHTML = promptMsg;
        document.getElementById('handoverOtpInput').value = '';
        
        const modal = new bootstrap.Modal(document.getElementById('secureHandoverModal'));
        modal.show();
        return;
    }

    try {
        const res = await fetch(`/api/orders/${orderId}/status`, {
            method: 'PUT',
            headers: { 
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${user.token}`
            },
            body: JSON.stringify({ 
                status,
                pickupInspectionReport,
                laundryInspectionReport,
                deliveryInspectionReport,
                customerDeliveryAcknowledgement
            })
        });
        
        if (res.ok) {
            const updatedOrder = await res.json();
            notifyUser(`Order status updated to ${status}`, 'success');
            
            // Trigger automated WhatsApp/Message alerts on state transitions
            if (typeof sendAutomatedPartnerNotification === 'function') {
                sendAutomatedPartnerNotification(updatedOrder, status);
            }
            
            // Refresh the appropriate dashboard
            if (user.role === 'admin') {
                fetchAdminOrders();
            } else if (['pickup_agent', 'delivery_agent', 'laundry_partner'].includes(user.role)) {
                fetchDeliveryOrders();
            } else {
                fetchUserOrders();
            }

            // Emit to customer via socket if available
            if (typeof io !== 'undefined') {
                trackingSocket = getSocket();
                trackingSocket.emit('statusUpdate', { 
                    userId: updatedOrder.user._id || updatedOrder.user, 
                    orderId: updatedOrder._id, 
                    status: updatedOrder.status 
                });
            }
        } else {
            const err = await res.json();
            notifyUser(err.message || 'Failed to update status', 'warning');
        }
    } catch (err) {
        console.error('Update Status Error:', err);
        notifyUser('Connection error. Please try again.', 'danger');
    }
}

async function fetchServices() {
    try {
        const res = await fetch('/api/services');
        const data = await res.json();
        
        if (!data || data.length === 0) {
            console.log('No services in DB, using demo data');
            const demoData = [
                { category: "Men's Wear", name: "Shirt", price: 25, prices: [{serviceType: 'Standard Wash', price: 25}, {serviceType: 'Dry Clean', price: 80}], image: "shirt.png" },
                { category: "Men's Wear", name: "T-Shirt", price: 15, prices: [{serviceType: 'Standard Wash', price: 15}, {serviceType: 'Iron Only', price: 10}], image: "tshirt.png" },
                { category: "Men's Wear", name: "Jeans", price: 30, prices: [{serviceType: 'Standard Wash', price: 30}, {serviceType: 'Dry Clean', price: 100}], image: "jeans.png" },
                { category: "Women's Wear", name: "Saree", price: 40, prices: [{serviceType: 'Dry Clean', price: 150}, {serviceType: 'Steam Iron', price: 40}], image: "saree.png" },
                { category: "Women's Wear", name: "Salwar Suit", price: 30, prices: [{serviceType: 'Standard Wash', price: 30}, {serviceType: 'Dry Clean', price: 120}], image: "suit.png" },
                { category: "Home & Others", name: "Bed Sheet", price: 40, prices: [{serviceType: 'Standard Wash', price: 40}], image: "sheet.png" },
                { category: "Home & Others", name: "Blanket", price: 60, prices: [{serviceType: 'Dry Clean', price: 250}], image: "blanket.png" },
            ];
            renderServices(demoData);
        } else {
            renderServices(data);
        }
    } catch (err) {
        console.error('Error fetching services:', err);
    }
}

async function renderServices(services) {
    const tabContainer = document.getElementById('categoryTabs');
    const contentContainer = document.getElementById('categoryTabContent');
    
    if (!tabContainer || !contentContainer) return;

    try {
        const res = await fetch('/api/categories');
        let categories = await res.json();
        
        // If no categories in DB, use defaults to not break UI
        if (!categories || categories.length === 0) {
            categories = [
                { name: "Men's Wear", icon: "fas fa-shirt" },
                { name: "Women's Wear", icon: "fas fa-person-dress" },
                { name: "Home & Others", icon: "fas fa-house" }
            ];
        }

        tabContainer.innerHTML = '';
        contentContainer.innerHTML = '';

        categories.forEach((cat, index) => {
            const catId = cat.name.replace(/[^a-zA-Z]/g, '').toLowerCase();
            const isActive = index === 0 ? 'active' : '';
            const isShowActive = index === 0 ? 'show active' : '';

            // Render Tab
            tabContainer.innerHTML += `
                <li class="nav-item">
                    <button class="nav-link ${isActive}" data-bs-toggle="pill" data-bs-target="#tab-${catId}">${cat.name}</button>
                </li>
            `;

            // Render Content Pane
            const catServices = services.filter(s => s.category === cat.name);
            let servicesHtml = '';
            
            if (catServices.length === 0) {
                servicesHtml = `<div class="col-12 text-center py-5 text-muted">No services found in this category.</div>`;
            } else {
                catServices.forEach(item => {
                    const iconClass = item.icon || 'fas fa-shirt';
                    const hasOptions = item.prices && item.prices.length > 0;
                    const displayPrice = hasOptions ? `From ₹${Math.min(...item.prices.map(p => p.price))}` : `₹${item.price}`;

                    // Store item data for modal use
                    if (!window.availableServices) window.availableServices = {};
                    window.availableServices[item.name] = item;

                    const iconHtml = (iconClass.startsWith('http') || iconClass.startsWith('/') || iconClass.includes('.')) 
                        ? `<img src="${iconClass}" alt="${item.name}">` 
                        : `<i class="${iconClass}"></i>`;

                    servicesHtml += `
                        <div class="col-6 col-md-4 col-lg-3">
                            <div class="service-card p-3 text-center mb-4">
                                <div class="icon-container">
                                    ${iconHtml}
                                </div>
                                <h6 class="fw-bold text-white">${item.name}</h6>
                                <p class="text-info small mb-3">${displayPrice}</p>
                                <div class="qty-controls">
                                    <button class="qty-btn btn-outline-secondary" onclick="removeFromCart('${item.name}')">-</button>
                                    <span class="qty-number" id="qty-${item.name.replace(/\s+/g, '')}">${cart[item.name] || 0}</span>
                                    <button class="qty-btn" onclick="${hasOptions ? `showServiceOptions('${item.name}')` : `addToCart('${item.name}', ${item.price})`}">${hasOptions ? 'Add' : '+'}</button>
                                </div>
                            </div>
                        </div>
                    `;
                });
            }

            contentContainer.innerHTML += `
                <div class="tab-pane fade ${isShowActive}" id="tab-${catId}">
                    <div class="row g-4">
                        ${servicesHtml}
                    </div>
                </div>
            `;
        });
    } catch (err) {
        console.error('Failed to render dynamic services:', err);
    }
}

function showServiceOptions(itemName) {
    const item = window.availableServices[itemName];
    const list = document.getElementById('serviceOptionsList');
    document.getElementById('serviceOptionTitle').innerText = `Options for ${itemName}`;
    
    let html = '';
    if (item.prices && item.prices.length > 0) {
        html = item.prices.map(p => `
            <button class="list-group-item list-group-item-action bg-dark text-white border-secondary d-flex justify-content-between align-items-center" 
                    onclick="addToCartWithOptions('${item.name}', '${p.serviceType}', ${p.price})">
                <span>${p.serviceType}</span>
                <span class="badge bg-primary rounded-pill">₹${p.price}</span>
            </button>
        `).join('');
    } else {
        // Fallback to default
        html = `
            <button class="list-group-item list-group-item-action bg-dark text-white border-secondary d-flex justify-content-between align-items-center" 
                    onclick="addToCartWithOptions('${item.name}', 'Standard Wash', ${item.price})">
                <span>Standard Wash</span>
                <span class="badge bg-primary rounded-pill">₹${item.price}</span>
            </button>
        `;
    }
    list.innerHTML = html;
    new bootstrap.Modal(document.getElementById('serviceOptionsModal')).show();
}

function addToCartWithOptions(name, type, price) {
    const fullName = `${name} (${type})`;
    const item = cart.find(i => i.name === fullName);
    if (item) {
        item.quantity++;
    } else {
        cart.push({ name: fullName, baseName: name, type, price, quantity: 1 });
    }
    updateCartUI();
    bootstrap.Modal.getInstance(document.getElementById('serviceOptionsModal')).hide();
    
    const toastEl = document.getElementById('cartToast');
    if (toastEl) new bootstrap.Toast(toastEl).show();
}

function addToCart(name, price) {
    const item = cart.find(i => i.name === name);
    if (item) {
        item.quantity++;
    } else {
        cart.push({ name, price, quantity: 1 });
    }
    updateCartUI();
    
    // Show Toast Notification
    const toastEl = document.getElementById('cartToast');
    if (toastEl) {
        const toast = new bootstrap.Toast(toastEl);
        toast.show();
    }
}

function removeFromCart(name) {
    const item = cart.find(i => i.name === name);
    if (item) {
        item.quantity--;
        if (item.quantity <= 0) {
            cart = cart.filter(i => i.name !== name);
        }
    }
    updateCartUI();
}

function openCheckout() {
    if (!user) {
        notifyUser('Please login to place an order', 'warning');
        const cartSidebarEl = document.getElementById('cartSidebar');
        if (cartSidebarEl) {
            const sidebar = bootstrap.Offcanvas.getInstance(cartSidebarEl);
            if (sidebar) sidebar.hide();
        }
        const loginModalEl = document.getElementById('loginModal');
        if (loginModalEl) {
            new bootstrap.Modal(loginModalEl).show();
        }
        return;
    }
    if (cart.length === 0) {
        notifyUser('Your cart is empty', 'warning');
        return;
    }
    const cartSidebarEl = document.getElementById('cartSidebar');
    if (cartSidebarEl) {
        const sidebar = bootstrap.Offcanvas.getInstance(cartSidebarEl);
        if (sidebar) sidebar.hide();
    }
    const checkoutModalEl = document.getElementById('checkoutModal');
    if (checkoutModalEl) {
        goToStep(1); // Reset to first step
        new bootstrap.Modal(checkoutModalEl).show();
    }
}

async function goToStep(step) {
    if (step === 2) {
        // Validate and save address before moving to next step
        const saved = await saveAddress();
        if (!saved) return; // Don't proceed if saving failed (validation error, etc.)
    }
    
    // Hide all steps
    const step1 = document.getElementById('checkout-step-1');
    const step2 = document.getElementById('checkout-step-2');
    
    if (step1) step1.classList.add('d-none');
    if (step2) step2.classList.add('d-none');
    
    // Show target step
    const target = document.getElementById(`checkout-step-${step}`);
    if (target) target.classList.remove('d-none');
    
    // Update indicators
    document.querySelectorAll('.checkout-stepper .step-item').forEach(el => el.classList.remove('active'));
    const indicator = document.getElementById(`step${step}-indicator`);
    if (indicator) indicator.classList.add('active');
    
    // Smooth scroll to top of modal
    const modalBody = document.querySelector('#checkoutModal .modal-body');
    if (modalBody) modalBody.scrollTop = 0;
    
    // If going to step 2, update cart summary
    if (step === 2) {
        updateCartDisplay();
    }
}

function updateCartUI() {
    localStorage.setItem('cart', JSON.stringify(cart));
    const total = cart.reduce((sum, i) => sum + (i.price * i.quantity), 0);
    const count = cart.reduce((sum, i) => sum + i.quantity, 0);

    const cartBadge = document.getElementById('cartBadge');
    const cartFAB = document.getElementById('cartFAB');
    const navCartBadge = document.getElementById('navCartBadge');
    const navCartBadgeUser = document.getElementById('navCartBadgeUser');
    const mobileNavCartBadge = document.getElementById('mobileNavCartBadge');
    
    if (cartBadge) cartBadge.innerText = count;
    if (navCartBadge) navCartBadge.innerText = count;
    if (navCartBadgeUser) navCartBadgeUser.innerText = count;
    if (mobileNavCartBadge) {
        mobileNavCartBadge.innerText = count;
        mobileNavCartBadge.classList.toggle('d-none', count === 0);
    }
    const isCustomerOrGuest = typeof user === 'undefined' || !user || user.role === 'user';
    if (cartFAB) cartFAB.classList.toggle('d-none', count === 0 || !isCustomerOrGuest);

    // Calculate Discount
    if (appliedCoupon) {
        if (appliedCoupon.discountType === 'percent') {
            discountAmount = Math.round(total * (appliedCoupon.discountValue / 100));
        } else {
            discountAmount = appliedCoupon.discountValue;
        }
        document.getElementById('discountRow').classList.remove('d-none');
        document.getElementById('checkoutDiscount').innerText = `-₹${discountAmount}`;
    } else {
        discountAmount = 0;
        document.getElementById('discountRow').classList.add('d-none');
    }

    const finalTotal = Math.max(0, total - discountAmount) + 20;

    const checkoutTotal = document.getElementById('checkoutTotal');
    const finalTotalEl = document.getElementById('finalTotal');
    if (checkoutTotal) checkoutTotal.innerText = `₹${total}`;
    if (finalTotalEl) finalTotalEl.innerText = `₹${finalTotal}`;

    // Update quantities in cards
    // First reset all to 0
    document.querySelectorAll('[id^="qty-"]').forEach(el => el.innerText = '0');
    
    // Then set actual quantities from cart
    cart.forEach(i => {
        const baseId = i.baseName ? i.baseName : i.name;
        const safeId = `qty-${baseId.replace(/\s+/g, '')}`;
        const el = document.getElementById(safeId);
        if (el) el.innerText = i.quantity;
    });

    // Update Sidebar items
    const sidebarCartItems = document.getElementById('sidebarCartItems');
    const emptyCartMsg = document.getElementById('emptyCartMsg');
    const sidebarTotal = document.getElementById('sidebarTotal');
    
    if (sidebarCartItems) {
        sidebarCartItems.innerHTML = cart.map(i => `
            <div class="service-card p-3 mb-3 d-flex justify-content-between align-items-center">
                <div>
                    <h6 class="mb-0">${i.name}</h6>
                    <small class="text-secondary">₹${i.price} x ${i.quantity}</small>
                </div>
                <div class="d-flex align-items-center gap-3">
                    <span class="fw-bold">₹${i.price * i.quantity}</span>
                    <button class="btn btn-sm btn-outline-danger border-0" onclick="removeFromCartFully('${i.name}')">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            </div>
        `).join('');
        
        if (sidebarTotal) sidebarTotal.innerText = `₹${total}`;
        if (emptyCartMsg) emptyCartMsg.classList.toggle('d-none', count > 0);
    }

    // Update checkout items
    const checkoutItems = document.getElementById('checkoutItems');
    if (checkoutItems) {
        checkoutItems.innerHTML = cart.map(i => `
            <div class="d-flex justify-content-between mb-2 small">
                <span>${i.name} x ${i.quantity}</span>
                <span>₹${i.price * i.quantity}</span>
            </div>
        `).join('');
        document.getElementById('checkoutTotal').innerText = `₹${total}`;
    }
}

function removeFromCartFully(name) {
    cart = cart.filter(i => i.name !== name);
    updateCartUI();
}

// Auth Actions
// Auth Error Helpers
function showFormError(alertId, msgId, message) {
    const errorAlert = document.getElementById(alertId);
    const errorMsg = document.getElementById(msgId);
    if (errorAlert && errorMsg) {
        errorMsg.innerText = message || 'Error occurred';
        errorAlert.classList.remove('d-none');
        errorAlert.classList.add('d-flex');
        
        // Shake animation
        errorAlert.style.animation = 'shake 0.5s ease-in-out';
        setTimeout(() => { errorAlert.style.animation = ''; }, 500);
    }
}

function clearFormError(alertId) {
    const errorAlert = document.getElementById(alertId);
    if (errorAlert) {
        errorAlert.classList.add('d-none');
        errorAlert.classList.remove('d-flex');
    }
}

// Clear errors when typing
function setupAuthErrorClearing() {
    const setupErrorClear = (inputIds, alertId) => {
        inputIds.forEach(id => {
            document.getElementById(id)?.addEventListener('input', () => {
                clearFormError(alertId);
            });
        });
    };

    setupErrorClear(['loginEmail', 'loginPassword'], 'loginErrorAlert');
    setupErrorClear(['signupName', 'signupEmail', 'signupPhone', 'signupPassword'], 'signupErrorAlert');
    setupErrorClear(['signupOtp'], 'signupOtpErrorAlert');
    setupErrorClear(['resetInput'], 'forgotReqErrorAlert');
    setupErrorClear(['resetOtp', 'newPassword'], 'forgotVerifyErrorAlert');
    
    // Clear errors when modals are shown/hidden
    const modals = ['loginModal', 'signupModal', 'signupOtpModal', 'forgotPasswordModal'];
    modals.forEach(modalId => {
        const el = document.getElementById(modalId);
        if (el) {
            el.addEventListener('hidden.bs.modal', () => {
                clearFormError('loginErrorAlert');
                clearFormError('signupErrorAlert');
                clearFormError('signupOtpErrorAlert');
                clearFormError('forgotReqErrorAlert');
                clearFormError('forgotVerifyErrorAlert');
            });
            el.addEventListener('show.bs.modal', () => {
                clearFormError('loginErrorAlert');
                clearFormError('signupErrorAlert');
                clearFormError('signupOtpErrorAlert');
                clearFormError('forgotReqErrorAlert');
                clearFormError('forgotVerifyErrorAlert');
            });
        }
    });
}
document.addEventListener('DOMContentLoaded', setupAuthErrorClearing);

document.getElementById('loginForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    console.log('Login Form Submitted');
    const email = document.getElementById('loginEmail').value.trim();
    const password = document.getElementById('loginPassword').value.trim();
    clearFormError('loginErrorAlert');

    try {
        console.log('Fetching /api/auth/login...');
        const res = await fetch('/api/auth/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password })
        });
        
        console.log('Response Status:', res.status);
        const data = await res.json();
        console.log('Response Data:', data);

        if (res.ok) {
            console.log('Login success! Updating local storage...');
            localStorage.setItem('user', JSON.stringify(data));
            user = data;
            updateAuthUI();
            if (typeof fetchAddress === 'function') fetchAddress(); 
            
            const loginModalEl = document.getElementById('loginModal');
            if (loginModalEl) {
                const modalInstance = bootstrap.Modal.getInstance(loginModalEl) || new bootstrap.Modal(loginModalEl);
                modalInstance.hide();
            }
            notifyUser('Welcome back, ' + user.name + '!', 'success');
        } else {
            console.log('Login failed with message:', data.message);
            if (data.userId) {
                currentSignupUserId = data.userId;
                
                // Hide login modal
                const loginModalEl = document.getElementById('loginModal');
                if (loginModalEl) {
                    const modalInstance = bootstrap.Modal.getInstance(loginModalEl) || new bootstrap.Modal(loginModalEl);
                    modalInstance.hide();
                }

                // Wait for backdrop to clear before showing OTP modal
                setTimeout(() => {
                    document.querySelectorAll('.modal-backdrop').forEach(el => el.remove());
                    document.body.classList.remove('modal-open');
                    document.body.style.paddingRight = '';
                    
                    const otpModalEl = document.getElementById('signupOtpModal');
                    if (otpModalEl) {
                        new bootstrap.Modal(otpModalEl).show();
                    }
                }, 400);
            } else {
                showFormError('loginErrorAlert', 'loginErrorMsg', data.message || 'Invalid credentials');
                notifyUser(data.message || 'Invalid credentials', 'danger');
            }
        }
    } catch (err) {
        console.error('Fetch Error:', err);
        showFormError('loginErrorAlert', 'loginErrorMsg', 'Connection error: ' + err.message);
        notifyUser('Connection error: ' + err.message, 'danger');
    }
});

let currentSignupUserId = '';

document.getElementById('signupForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = document.getElementById('signupName').value;
    const email = document.getElementById('signupEmail').value;
    const phone = document.getElementById('signupPhone').value;
    const password = document.getElementById('signupPassword').value;
    clearFormError('signupErrorAlert');

    try {
        const res = await fetch('/api/auth/register', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, email, phone, password })
        });
        const data = await res.json();
        if (res.ok) {
            currentSignupUserId = data.userId;
            notifyUser('OTP sent to your phone!', 'success');
            
            // Hide signup modal
            const signupModalEl = document.getElementById('signupModal');
            const signupModal = bootstrap.Modal.getInstance(signupModalEl) || new bootstrap.Modal(signupModalEl);
            signupModal.hide();
            
            // Wait for backdrop to clear before showing OTP modal
            setTimeout(() => {
                document.querySelectorAll('.modal-backdrop').forEach(el => el.remove());
                document.body.classList.remove('modal-open');
                document.body.style.paddingRight = '';
                
                const otpModalEl = document.getElementById('signupOtpModal');
                const otpModal = new bootstrap.Modal(otpModalEl);
                otpModal.show();
            }, 400);
        } else {
            showFormError('signupErrorAlert', 'signupErrorMsg', data.message);
        }
    } catch (err) {
        showFormError('signupErrorAlert', 'signupErrorMsg', 'Signup failed.');
    }
});

document.getElementById('signupOtpForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const otp = document.getElementById('signupOtp').value;
    clearFormError('signupOtpErrorAlert');
    try {
        const res = await fetch('/api/auth/verify-signup', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId: currentSignupUserId, otp })
        });
        const data = await res.json();
        if (res.ok) {
            localStorage.setItem('user', JSON.stringify(data));
            user = data;
            updateAuthUI();
            bootstrap.Modal.getInstance(document.getElementById('signupOtpModal')).hide();
            notifyUser('Welcome! Your account is verified and created.', 'success')
        } else {
            showFormError('signupOtpErrorAlert', 'signupOtpErrorMsg', data.message);
        }
    } catch (err) {
        showFormError('signupOtpErrorAlert', 'signupOtpErrorMsg', 'Verification failed.');
    }
});

function logout() {
    localStorage.removeItem('user');
    user = null;
    updateAuthUI();
}

function openForgotModal() {
    const loginModalEl = document.getElementById('loginModal');
    const loginModal = bootstrap.Modal.getInstance(loginModalEl);
    if (loginModal) loginModal.hide();
    
    // Smooth transition for mobile to avoid backdrop freeze
    setTimeout(() => {
        // Clear any stuck backdrops
        document.querySelectorAll('.modal-backdrop').forEach(el => el.remove());
        document.body.classList.remove('modal-open');
        document.body.style.paddingRight = '';
        
        const forgotModalEl = document.getElementById('forgotPasswordModal');
        const forgotModal = new bootstrap.Modal(forgotModalEl);
        forgotModal.show();
    }, 400);
}

async function sendResetOtp() {
    console.log("sendResetOtp called");
    const identifier = document.getElementById('resetInput').value;
    clearFormError('forgotReqErrorAlert');
    if (!identifier) return showFormError('forgotReqErrorAlert', 'forgotReqErrorMsg', 'Please enter email or phone');

    try {
        const res = await fetch('/api/auth/forgotpassword', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ identifier })
        });
        const data = await res.json();
        if (res.ok) {
            document.getElementById('otpRequestArea').classList.add('d-none');
            document.getElementById('otpVerifyArea').classList.remove('d-none');
            notifyUser('OTP sent successfully', 'success');
        } else {
            showFormError('forgotReqErrorAlert', 'forgotReqErrorMsg', data.message);
        }
    } catch (err) {
        showFormError('forgotReqErrorAlert', 'forgotReqErrorMsg', 'Server error');
    }
}

async function resetPassword() {
    const email = document.getElementById('resetInput').value;
    const otp = document.getElementById('resetOtp').value;
    const newPassword = document.getElementById('newPassword').value;
    clearFormError('forgotVerifyErrorAlert');

    if (!otp || !newPassword) return showFormError('forgotVerifyErrorAlert', 'forgotVerifyErrorMsg', 'Enter OTP and New Password');

    try {
        const res = await fetch('/api/auth/resetpassword', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, otp, newPassword })
        });
        const data = await res.json();
        if (res.ok) {
            notifyUser('Password reset successfully! Please login.', 'success');
            const modalEl = document.getElementById('forgotPasswordModal');
            const modalInstance = bootstrap.Modal.getInstance(modalEl) || new bootstrap.Modal(modalEl);
            modalInstance.hide();
            // Reset modal for next use
            setTimeout(() => {
                document.getElementById('otpRequestArea').classList.remove('d-none');
                document.getElementById('otpVerifyArea').classList.add('d-none');
                document.getElementById('resetInput').value = '';
                document.getElementById('resetOtp').value = '';
                document.getElementById('newPassword').value = '';
            }, 500);
        } else {
            showFormError('forgotVerifyErrorAlert', 'forgotVerifyErrorMsg', data.message);
        }
    } catch (err) {
        showFormError('forgotVerifyErrorAlert', 'forgotVerifyErrorMsg', 'Server error');
    }
}

async function verifySession() {
    if (!user || !user.token) return;
    try {
        const res = await fetch('/api/auth/profile', {
            headers: { 'Authorization': `Bearer ${user.token}` }
        });
        if (res.status === 401) {
            // Only logout if token is explicitly invalid/expired
            logout();
        } else if (res.ok) {
            const freshUser = await res.json();
            // Merge fresh profile data but preserve the token from localStorage
            const updatedUser = { ...user, ...freshUser, token: user.token };
            localStorage.setItem('user', JSON.stringify(updatedUser));
            user = updatedUser;
            // Refresh UI with latest session data
            updateAuthUI();
        }
        // For any other HTTP error (500, 503, etc.) or network issue — do nothing, keep user logged in
    } catch (err) {
        // Network offline or server temporarily down — silently keep session alive
        console.warn('Session check skipped (offline or server error):', err.message);
    }
}

async function fetchAddress() {
    if (!user) return;
    try {
        const res = await fetch('/api/auth/address', {
            headers: { 'Authorization': `Bearer ${user.token}` }
        });
        const addresses = await res.json();
        allUserAddresses = Array.isArray(addresses) ? addresses : [];
        
        const area = document.getElementById('savedAddressesArea');
        const select = document.getElementById('savedAddressesSelect');
        
        if (allUserAddresses.length > 0) {
            if (area) area.classList.remove('d-none');
            if (select) {
                select.innerHTML = '<option value="">-- Choose a saved address --</option>' + 
                    allUserAddresses.map(a => `<option value="${a._id}">${a.label}: ${a.addressLine.substring(0, 20)}...</option>`).join('');
            }
            
            // Auto-fill first one if checkout is just opened
            useSavedAddress(allUserAddresses[0]._id);
        } else {
            if (area) area.classList.add('d-none');
        }

        // Fill Profile Fields with most recent
        if (allUserAddresses.length > 0) {
            const latest = allUserAddresses[0];
            const profLine = document.getElementById('profileAddressLine');
            const profPin = document.getElementById('profilePincode');
            if (profLine) profLine.value = latest.addressLine || '';
            if (profPin) profPin.value = latest.pincode || '';
        }
    } catch (err) {
        console.error('Error fetching address');
    }
}

function useSavedAddress(id) {
    const addr = allUserAddresses.find(a => a._id === id);
    if (!addr) return;
    
    const fields = {
        'addrLabel': addr.label,
        'addrName': addr.fullName,
        'addrMobile': addr.mobile,
        'addrLine': addr.addressLine,
        'addrPincode': addr.pincode
    };
    
    Object.keys(fields).forEach(fId => {
        const el = document.getElementById(fId);
        if (el) el.value = fields[fId];
    });
}

async function saveAddress() {
    if (!user) {
        notifyUser('Please login to save address', 'warning')
        return;
    }
    const checkoutModal = document.getElementById('checkoutModal');
    const isCheckout = checkoutModal && checkoutModal.classList.contains('show');
    
    const addrLabelEl = document.getElementById('addrLabel');
    const addrNameEl = document.getElementById('addrName');
    const addrMobileEl = document.getElementById('addrMobile');
    const addrLineEl = document.getElementById('addrLine');
    const addrPincodeEl = document.getElementById('addrPincode');
    
    const profLineEl = document.getElementById('profileAddressLine');
    const profPinEl = document.getElementById('profilePincode');

    const address = {
        label: isCheckout ? (addrLabelEl ? addrLabelEl.value : 'Home') : 'Home',
        fullName: isCheckout ? (addrNameEl ? addrNameEl.value : user.name) : user.name,
        mobile: isCheckout ? (addrMobileEl ? addrMobileEl.value : user.phone) : user.phone,
        addressLine: isCheckout ? (addrLineEl ? addrLineEl.value : '') : (profLineEl ? profLineEl.value : ''),
        pincode: isCheckout ? (addrPincodeEl ? addrPincodeEl.value : '') : (profPinEl ? profPinEl.value : '')
    };

    try {
        const res = await fetch('/api/auth/address', {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${user.token}`
            },
            body: JSON.stringify(address)
        });
        if (res.ok) {
            const btn = document.getElementById('saveAddrBtn');
            if (btn) {
                btn.innerText = 'Address Saved! ✅';
                btn.classList.replace('btn-outline-primary', 'btn-success');
                setTimeout(() => {
                    btn.innerText = 'Save / Update Address';
                    btn.classList.replace('btn-success', 'btn-outline-primary');
                }, 3000);
            }
            notifyUser('Address saved successfully!', 'info');
            fetchAddress(); // Refresh list
            return true;
        }
    } catch (err) {
        console.error('Failed to save address');
        notifyUser('Failed to save address', 'info')
    }
    return false;
}

// Update checkout modal listener to fetch address
document.getElementById('checkoutModal')?.addEventListener('show.bs.modal', fetchAddress);
document.getElementById('profileModal')?.addEventListener('show.bs.modal', fetchAddress);

document.getElementById('profileForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = document.getElementById('profileName').value;
    
    try {
        // 1. Update Profile (Name)
        const profileRes = await fetch('/api/auth/profile', {
            method: 'PUT',
            headers: { 
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${user.token}`
            },
            body: JSON.stringify({ name })
        });

        // 2. Update Address
        await saveAddress();

        if (profileRes.ok) {
            const updatedUser = await profileRes.json();
            localStorage.setItem('user', JSON.stringify(updatedUser));
            user = updatedUser;
            updateAuthUI();
            notifyUser('Profile & Address updated successfully!', 'success')
            bootstrap.Modal.getInstance(document.getElementById('profileModal')).hide();
        }
    } catch (err) {
        notifyUser('Failed to update profile', 'info')
    }
});

function togglePaymentView(mode) {
    const upiSection = document.getElementById('upiSection');
    const total = cart.reduce((sum, i) => sum + (i.price * i.quantity), 0);
    
    if (mode === 'online') {
        upiSection.classList.remove('d-none');
        document.getElementById('qrAmount').innerText = `₹${total}`;
        
        // Generate UPI QR using QRServer API
        const upiId = '9548706353@ibl'; // YOUR ACTUAL UPI ID
        const name = 'CleanKart Laundry';
        const upiUrl = `upi://pay?pa=${upiId}&pn=${encodeURIComponent(name)}&am=${total}&cu=INR`;
        const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(upiUrl)}`;
        
        document.getElementById('qrImage').src = qrUrl;
        document.getElementById('upiDeepLink').href = upiUrl;
    } else {
        upiSection.classList.add('d-none');
    }
}

async function placeOrder() {
    if (!user) {
        notifyUser('Please login to place order', 'warning')
        bootstrap.Modal.getInstance(document.getElementById('checkoutModal')).hide();
        new bootstrap.Modal(document.getElementById('loginModal')).show();
        return;
    }
    if (cart.length === 0) return;

    const totalPrice = cart.reduce((sum, i) => sum + (i.price * i.quantity), 0);
    
    if (totalPrice < 100) {
        notifyUser('Minimum order amount must be ₹100 or more!', 'warning');
        return;
    }

    const addressData = {
        fullName: document.getElementById('addrName').value,
        mobile: document.getElementById('addrMobile').value,
        addressLine: document.getElementById('addrLine').value,
        pincode: document.getElementById('addrPincode').value
    };

    if (!addressData.fullName || !addressData.mobile || !addressData.addressLine || !addressData.pincode) {
        notifyUser('Please provide a delivery address', 'warning')
        return;
    }

    // Auto-save address for future use
    saveAddress();

    const isOnline = document.getElementById('payOnline').checked;
    const paymentMethod = isOnline ? 'Online (Razorpay)' : 'Cash on Delivery';
    
    const orderData = {
        items: cart,
        totalPrice,
        deliveryFee: 20,
        address: addressData,
        paymentMethod
    };

    if (isOnline) {
        try {
            const res = await fetch('/api/orders/razorpay-order', {
                method: 'POST',
                headers: { 
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${user.token}`
                },
                body: JSON.stringify({ amount: totalPrice + 20 })
            });
            const rzpOrder = await res.json();
            const options = {
                "key": "rzp_test_placeholder", 
                "amount": rzpOrder.amount,
                "currency": "INR",
                "name": "CleanKart",
                "description": "Laundry Payment",
                "order_id": rzpOrder.id,
                "handler": (response) => completeOrderPlacement({
                    paymentMethod: 'Online (Razorpay)',
                    paymentId: response.razorpay_payment_id
                }, addressData),
                "prefill": { "name": user.name, "email": user.email, "contact": user.phone },
                "theme": { "color": "#0ea5e9" }
            };
            new Razorpay(options).open();
        } catch (err) { notifyUser('Payment Error', 'danger') }
        return;
    }
    completeOrderPlacement({ paymentMethod: 'Cash on Delivery' }, addressData);
}

function sendWhatsAppNotification(order, mobile) {
    const phone = '91' + mobile;
    const message = `*CleanKart Order Confirmed!* 🧺\n\nHi! Your order #${order._id.slice(-6)} has been placed successfully.\n\n*Details:*\n- Total: ₹${order.totalPrice}\n- Items: ${order.items.length}\n- Payment: ${order.paymentMethod}\n\nOur partner will pick up your clothes soon! 🚚`;
    
    const whatsappUrl = `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;
    window.open(whatsappUrl, '_blank');
}

function openRatingModal(orderId) {
    document.getElementById('ratingOrderId').value = orderId;
    new bootstrap.Modal(document.getElementById('ratingModal')).show();
}

function setRating(val) {
    document.getElementById('ratingValue').value = val;
    const stars = document.getElementById('ratingStars').children;
    for (let i = 0; i < 5; i++) {
        stars[i].className = i < val ? 'fas fa-star cursor-pointer' : 'far fa-star cursor-pointer';
    }
}

async function submitRating() {
    const id = document.getElementById('ratingOrderId').value;
    const rating = document.getElementById('ratingValue').value;
    const review = document.getElementById('reviewText').value;

    try {
        const res = await fetch(`/api/orders/${id}/rate`, {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${user.token}`
            },
            body: JSON.stringify({ rating, review })
        });
        if (res.ok) {
            notifyUser('Thank you for your feedback!', 'success')
            bootstrap.Modal.getInstance(document.getElementById('ratingModal')).hide();
            fetchUserOrders();
        }
    } catch (err) {
        notifyUser('Failed to submit review', 'info')
    }
}

async function updateOrderStatusAdmin(id, status) {
    try {
        const res = await fetch(`/api/orders/${id}/status`, {
            method: 'PUT',
            headers: { 
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${user.token}`
            },
            body: JSON.stringify({ status })
        });
        if (res.ok) {
            notifyUser('Order status updated!', 'info')
            fetchAdminOrders();
        }
    } catch (err) {
        notifyUser('Failed to update status', 'info')
    }
}
async function fetchAdminStats() {
    try {
        const res = await fetch('/api/admin/stats', {
            headers: { 'Authorization': `Bearer ${user.token}` },
            cache: 'no-cache'
        });
        const stats = await res.json();
        
        const totalOrders = document.getElementById('totalOrdersCount');
        const revenue = document.getElementById('totalRevenue');
        const pending = document.getElementById('pendingAppsCount');
        const active = document.getElementById('activePartnersCount');
        const totalFleet = document.getElementById('totalFleetCount');

        if (totalOrders) totalOrders.innerText = stats.totalOrders;
        if (revenue) revenue.innerText = `₹${stats.totalRevenue}`;
        if (pending) pending.innerText = stats.pendingApps;
        if (active) active.innerText = stats.activePartners;
        if (totalFleet) totalFleet.innerText = `Total Fleet: ${stats.totalFleet}`;
    } catch (err) {
        console.error('Error fetching admin stats');
    }
}

async function fetchAdminSalesReport() {
    try {
        const res = await fetch('/api/admin/reports', {
            headers: { 'Authorization': `Bearer ${user.token}` },
            cache: 'no-cache'
        });
        const data = await res.json();
        const tableBody = document.getElementById('salesReportTable');
        if (tableBody) {
            tableBody.innerHTML = data.map(r => `
                <tr>
                    <td class="text-secondary">${new Date(r.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</td>
                    <td><span class="badge bg-dark border border-primary text-primary">${r.orderCount} Orders</span></td>
                    <td class="fw-bold text-success">₹${r.revenue}</td>
                </tr>
            `).join('') || '<tr><td colspan="3" class="text-center text-secondary py-3">No sales data for last 60 days</td></tr>';
        }
    } catch (err) {
        console.error('Error fetching sales report');
    }
}

// --- Admin Services Management ---
let allServicesList = [];

async function fetchAdminServices() {
    try {
        const res = await fetch('/api/services');
        const services = await res.json();
        allServicesList = services;
        const table = document.getElementById('adminServicesTable');
        if (table) {
            table.innerHTML = services.map(s => `
                <tr>
                    <td class="fw-bold">${s.name}</td>
                    <td><span class="badge bg-secondary">${s.category}</span></td>
                    <td>₹${s.price}</td>
                    <td>
                        <button class="btn btn-sm btn-outline-info me-2" onclick="editService('${s._id}')"><i class="fas fa-edit"></i></button>
                        <button class="btn btn-sm btn-outline-danger" onclick="deleteService('${s._id}')"><i class="fas fa-trash"></i></button>
                    </td>
                </tr>
            `).join('') || '<tr><td colspan="4" class="text-center text-secondary py-3">No services found</td></tr>';
        }
    } catch (err) {
        console.error('Error fetching admin services');
    }
}

function prepareServiceForm() {
    document.getElementById('serviceForm').reset();
    document.getElementById('serviceId').value = '';
    document.getElementById('serviceModalTitle').innerText = 'Add New Service';
    
    // Show all input containers for adding a new service
    document.getElementById('serviceNameContainer').style.display = 'block';
    document.getElementById('serviceCategoryContainer').style.display = 'block';
    document.getElementById('serviceIconContainer').style.display = 'block';
    document.getElementById('serviceImageContainer').style.display = 'block';
    
    // Restore validation requirements for adding
    document.getElementById('serviceName').required = true;
    document.getElementById('serviceCategory').required = true;
    
    loadCategoriesIntoSelect();
}

async function loadCategoriesIntoSelect() {
    try {
        const res = await fetch('/api/categories');
        const categories = await res.json();
        const select = document.getElementById('serviceCategory');
        if (select) {
            // Default options if none in DB
            let html = `
                <option value="Men's Wear">Men's Wear</option>
                <option value="Women's Wear">Women's Wear</option>
                <option value="Home & Others">Home & Others</option>
            `;
            if (categories && categories.length > 0) {
                html = categories.map(cat => `<option value="${cat.name}">${cat.name}</option>`).join('');
            }
            select.innerHTML = html;
        }
    } catch (err) { console.error('Failed to load categories'); }
}

document.getElementById('categoryForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const data = {
        name: document.getElementById('catName').value,
        icon: document.getElementById('catIcon').value
    };
    try {
        const res = await fetch('/api/categories', {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${user.token}`
            },
            body: JSON.stringify(data)
        });
        if (res.ok) {
            notifyUser('Category added successfully!', 'success')
            document.getElementById('categoryForm').reset();
            bootstrap.Modal.getInstance(document.getElementById('categoryModal')).hide();
            loadCategoriesIntoSelect();
        } else {
            const err = await res.json();
            notifyUser(err.message || 'Failed to add category', 'info')
        }
    } catch (err) { notifyUser('Error adding category', 'danger') }
});

async function editService(id) {
    const service = allServicesList.find(s => s._id === id);
    if (!service) return;

    // Load categories first so dropdown has options to match
    await loadCategoriesIntoSelect();

    document.getElementById('serviceId').value = service._id;
    document.getElementById('serviceName').value = service.name;
    document.getElementById('serviceCategory').value = service.category;
    document.getElementById('servicePrice').value = service.price;
    document.getElementById('serviceIcon').value = service.icon || 'fas fa-shirt';
    
    // Hide all other containers so only Price can be edited
    document.getElementById('serviceNameContainer').style.display = 'none';
    document.getElementById('serviceCategoryContainer').style.display = 'none';
    document.getElementById('serviceIconContainer').style.display = 'none';
    document.getElementById('serviceImageContainer').style.display = 'none';
    
    // Bypass validation requirements on hidden elements for editing
    document.getElementById('serviceName').required = false;
    document.getElementById('serviceCategory').required = false;

    document.getElementById('serviceModalTitle').innerText = 'Edit Service Price';
    const modal = new bootstrap.Modal(document.getElementById('serviceModal'));
    modal.show();
}

async function deleteService(id) {
    if (!confirm('Are you sure you want to delete this service?')) return;
    try {
        const res = await fetch(`/api/services/${id}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${user.token}` }
        });
        if (res.ok) {
            notifyUser('Service deleted successfully', 'success')
            fetchAdminServices();
            fetchServices(); // update the customer view
        }
    } catch (err) {
        notifyUser('Failed to delete service', 'info')
    }
}

document.getElementById('serviceForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = document.getElementById('serviceId').value;
    const formData = new FormData();
    formData.append('name', document.getElementById('serviceName').value);
    formData.append('category', document.getElementById('serviceCategory').value);
    formData.append('price', document.getElementById('servicePrice').value);
    formData.append('icon', document.getElementById('serviceIcon').value);
    
    const fileInput = document.getElementById('serviceIconFile');
    if (fileInput && fileInput.files[0]) {
        formData.append('serviceIcon', fileInput.files[0]);
    }

    const url = id ? `/api/services/${id}` : '/api/services';
    const method = id ? 'PUT' : 'POST';

    try {
        const res = await fetch(url, {
            method,
            headers: { 
                'Authorization': `Bearer ${user.token}`
            },
            body: formData
        });
        if (res.ok) {
            notifyUser(`Service ${id ? 'updated' : 'added'} successfully!`, 'success')
            try {
                if (fileInput) fileInput.value = '';
                const modalEl = document.getElementById('serviceModal');
                const modal = bootstrap.Modal.getInstance(modalEl);
                if (modal) modal.hide();
                fetchAdminServices();
                fetchServices(); 
            } catch (err) { console.error('UI Update error:', err); }
        } else {
            let errorMsg = 'Failed to save service';
            try {
                const errorData = await res.json();
                errorMsg = errorData.message || errorMsg;
            } catch (e) {}
            notifyUser(errorMsg, 'info')
        }
    } catch (err) {
        console.error('Save error:', err);
        notifyUser('Connection error. Failed to save service.', 'info')
    }
});

// --- Forgot & Reset Password (Handled dynamically in sendResetOtp & resetPassword) ---

// --- Real-time Map Tracking ---
function initLeafletMap() {
    if (leafletMap) return;
    
    // Initialize map centered on India
    if (typeof L !== 'undefined') {
        leafletMap = L.map('realMap').setView([20.5937, 78.9629], 5);
        
        // Add OpenStreetMap tiles
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '&copy; OpenStreetMap contributors'
        }).addTo(leafletMap);
        
        // Define Truck Icon
        const truckIcon = L.divIcon({
            className: 'custom-div-icon',
            html: '<div style="background-color:#3b82f6;width:30px;height:30px;border-radius:50%;display:flex;align-items:center;justify-content:center;color:white;border:2px solid white;box-shadow:0 0 10px rgba(0,0,0,0.5);"><i class="fas fa-truck-fast"></i></div>',
            iconSize: [30, 30],
            iconAnchor: [15, 15]
        });
        
        truckMarker = L.marker([20.5937, 78.9629], { icon: truckIcon }).addTo(leafletMap);
        truckMarker.setOpacity(0); // Hide initially
    }
}

function startTrackingOrder(orderId) {
    document.getElementById('mapOverlay').classList.add('d-none');
    document.getElementById('trackingOrderIdDisplay').innerText = `#${orderId.slice(-6)}`;
    
    window.location.hash = 'tracking';
    
    initLeafletMap();
    
    if (!trackingSocket) {
        trackingSocket = io();
    }
    
    trackingSocket.emit('joinTrackingRoom', orderId);
    
    trackingSocket.on('locationUpdate', (data) => {
        if (data.orderId === orderId) {
            truckMarker.setOpacity(1);
            const newLatLng = new L.LatLng(data.lat, data.lng);
            truckMarker.setLatLng(newLatLng);
            leafletMap.setView(newLatLng, 15); // Zoom in on the truck
        }
    });
}

function toggleLocationSharing(btnElement) {
    const btn = btnElement || document.getElementById('shareLocationBtn');
    
    if (locationWatchId) {
        // Stop sharing
        navigator.geolocation.clearWatch(locationWatchId);
        locationWatchId = null;
        btn.innerText = 'Share Live Location';
        btn.classList.replace('btn-danger', 'btn-warning');
        if (trackingSocket) trackingSocket.disconnect();
        trackingSocket = null;
    } else {
        // Start sharing
        if (!navigator.geolocation) {
            notifyUser('Geolocation is not supported by your browser', 'info')
            return;
        }
        
        const activeOrderIds = Array.from(document.querySelectorAll('.delivery-order-card')).map(el => el.dataset.id);
        if (activeOrderIds.length === 0) {
            notifyUser('No active orders to share location for.', 'warning')
            return;
        }
        
        btn.innerText = 'Stop Sharing Location';
        btn.classList.replace('btn-warning', 'btn-danger');
        
        if (!trackingSocket) trackingSocket = io();
        
        locationWatchId = navigator.geolocation.watchPosition((position) => {
            const { latitude: lat, longitude: lng } = position.coords;
            activeOrderIds.forEach(orderId => {
                trackingSocket.emit('locationUpdate', { orderId, lat, lng });
            });
        }, (error) => {
            console.error('Error getting location', error);
        }, { enableHighAccuracy: true });
    }
}

document.getElementById('profileForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const data = {
        name: document.getElementById('profileName').value,
        phone: document.getElementById('profilePhone').value
    };

    try {
        const res = await fetch('/api/auth/profile', {
            method: 'PUT',
            headers: { 
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${user.token}`
            },
            body: JSON.stringify(data)
        });
        const updatedUser = await res.json();
        if (res.ok) {
            notifyUser('Profile updated successfully!', 'success')
            user = { ...user, ...updatedUser };
            localStorage.setItem('user', JSON.stringify(user));
            bootstrap.Modal.getInstance(document.getElementById('profileModal')).hide();
            updateAuthUI();
        } else {
            notifyUser(updatedUser.message, 'info')
        }
    } catch (err) {
        notifyUser('Failed to update profile', 'info')
    }
});
async function initTrackingMap(orderId, currentStatus) {
    console.log('Tracking Start for Order:', orderId);
    console.log('Initializing tracking for:', orderId, currentStatus);
    
    const trackingSection = document.getElementById('tracking');
    if (!trackingSection) {
        notifyUser('CRITICAL: Tracking section #tracking not found!', 'danger')
        return;
    }

    trackingSection.scrollIntoView({ behavior: 'smooth', block: 'start' });

    const idDisplay = document.getElementById('trackingOrderIdDisplay');
    if (idDisplay) idDisplay.innerText = `#${orderId.slice(-6)}`;

    const overlay = document.getElementById('mapOverlay');
    if (overlay) overlay.classList.add('d-none');

    // Update progress UI
    if (currentStatus) {
        renderOrderProgress(currentStatus);
    } else {
        try {
            const res = await fetch('/api/orders/myorders', {
                headers: { 'Authorization': `Bearer ${user.token}` }
            });
            const orders = await res.json();
            const order = orders.find(o => String(o._id) === String(orderId));
            if (order) renderOrderProgress(order.status);
        } catch (err) { console.error('Progress fetch failed:', err); }
    }

    try {
        if (!trackingMap) {
            trackingMap = L.map('trackingMap').setView([28.6139, 77.2090], 13);
            L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(trackingMap);
        } else {
            trackingMap.invalidateSize();
        }

        trackingSocket = getSocket();
        trackingSocket.emit('joinTrackingRoom', orderId);

        trackingSocket.off('statusUpdate');
        trackingSocket.on('statusUpdate', async (data) => {
            if (data.orderId === orderId) {
                renderOrderProgress(data.status);
                notifyUser(`Order Status: ${data.status}`, 'info')
                // Re-fetch to update agent details
                await fetchAndRefreshAgentInfo(orderId);
            }
        });

        trackingSocket.off('locationUpdate');
        trackingSocket.on('locationUpdate', (data) => {
            if (data.orderId === orderId) {
                const pos = [data.lat, data.lng];
                if (!trackingMarker) {
                    trackingMarker = L.marker(pos).addTo(trackingMap);
                    trackingMap.setView(pos, 15);
                } else {
                    trackingMarker.setLatLng(pos);
                }
            }
        });
    } catch (err) {
        console.error('Map/Socket initialization failed:', err);
    }

    // Initial fetch for Agent Details
    await fetchAndRefreshAgentInfo(orderId);
}

async function fetchAndRefreshAgentInfo(orderId) {
    console.log('--- fetchAndRefreshAgentInfo for:', orderId);
    try {
        const res = await fetch(`/api/orders/myorders?t=${Date.now()}`, {
            headers: { 'Authorization': `Bearer ${user.token}` }
        });
        const orders = await res.json();
        const order = orders.find(o => String(o._id) === String(orderId));
        
        if (order) {
            console.log('Order found:', order);
            updateDeliveryInfo(order);
        } else {
            console.log('Order not found in myorders list');
        }
    } catch (err) { console.error('Agent data fetch failed:', err); }
}

function updateDeliveryInfo(order) {
    console.log('--- updateDeliveryInfo called ---');
    if (!order) return;
    
    const s = (order.status || '').toLowerCase();
    console.log('Order Status (Lower):', s);

    const nameDisplay = document.getElementById('agentNameDisplay');
    const roleDisplay = document.getElementById('agentRoleDisplay');
    const contactArea = document.getElementById('agentContactArea');
    const callBtn = document.getElementById('agentCallBtn');
    const statusMsg = document.getElementById('deliveryStatusMsg');

    // Use deliveryAgent if status is ready/out/delivered, otherwise pickupAgent
    const agent = (s.includes('ready') || s.includes('out') || s.includes('delivered') || s.includes('dispatch')) ? order.deliveryAgent : order.pickupAgent;

    if (agent) {
        console.log('AGENT FOUND IN FRONTEND:', agent);
        let agentName = 'CleanKart Agent';
        let agentPhone = '';

        if (typeof agent === 'object') {
            agentName = agent.name || 'CleanKart Agent';
            agentPhone = agent.phone || '';
        } else {
            // It's just an ID string
            agentName = 'Agent Assigned (Loading...)';
        }

        if (nameDisplay) {
            nameDisplay.innerText = agentName;
            nameDisplay.style.color = '#00ff00'; // Make it green to see if it changed
        }
        if (roleDisplay) roleDisplay.innerText = (s.includes('ready') || s.includes('out')) ? 'Delivery Partner' : 'Pickup Partner';
        if (contactArea) contactArea.classList.remove('d-none');
        if (callBtn && agentPhone) callBtn.href = `tel:${agentPhone}`;
        
        if (statusMsg) {
            statusMsg.classList.remove('text-info', 'text-success', 'blink');
            if (s.includes('placed') || s.includes('assign')) {
                statusMsg.innerText = 'Order pickup soon';
                statusMsg.classList.add('text-warning', 'blink');
            } else if (s.includes('ready')) {
                statusMsg.innerText = 'Your order delivered soon';
                statusMsg.classList.add('text-success', 'blink');
            } else {
                statusMsg.innerText = `Status: ${order.status}`;
                statusMsg.classList.add('text-info');
            }
        }
    } else {
        console.log('No agent assigned yet for status:', s);
        if (nameDisplay) nameDisplay.innerText = 'Awaiting Assignment';
        if (roleDisplay) roleDisplay.innerText = 'CleanKart Professional';
        if (contactArea) contactArea.classList.add('d-none');
        if (statusMsg) {
            statusMsg.innerText = 'Finding best agent for you...';
            statusMsg.classList.remove('blink');
            statusMsg.classList.add('text-info');
        }
    }
}

function renderOrderProgress(status) {
    if (!status) return;
    const s = status.trim().toLowerCase();
    
    let uiIdx = 0;
    if (s === 'placed') uiIdx = 0;
    else if (s === 'picked' || s === 'picked up' || s === 'dropped at laundry') uiIdx = 1;
    else if (s === 'arrived' || s === 'arrived in laundry') uiIdx = 2;
    else if (s === 'washing' || s === 'wash' || s === 'in process') uiIdx = 3;
    else if (s === 'ready' || s === 'delivery assigned') uiIdx = 4;
    else if (s === 'dispatched' || s === 'out for delivery') uiIdx = 5;
    else if (s === 'delivered') uiIdx = 6;

    console.log('Rendering progress for index:', uiIdx);

    const stepIds = ['step-placed', 'step-picked', 'step-arrived', 'step-washing', 'step-ready', 'step-dispatched', 'step-delivered'];
    const activeColor = '#3b82f6'; // Bright Blue
    const inactiveColor = '#475569'; // Slate Grey

    stepIds.forEach((id, index) => {
        const el = document.getElementById(id);
        if (!el) return;
        const dot = el.querySelector('.step-dot');
        const text = el.querySelector('.step-text');
        
        el.classList.remove('active');

        if (index <= uiIdx) {
            if (dot) dot.style.backgroundColor = activeColor;
            if (text) text.style.color = activeColor;
            if (index === uiIdx) el.classList.add('active'); // Add pulse to current step
        } else {
            if (dot) dot.style.backgroundColor = inactiveColor;
            if (text) text.style.color = inactiveColor;
        }
    });

    const line = document.getElementById('progress-line');
    if (line) {
        line.style.borderColor = uiIdx > 0 ? activeColor : inactiveColor;
    }
}
function notifyUser(message, type = 'primary') {
    const toastEl = document.getElementById('appToast');
    const toastBody = toastEl.querySelector('.toast-body');
    toastBody.innerHTML = `<i class="fas fa-info-circle me-2"></i>${message}`;
    
    // Reset colors
    toastEl.classList.remove('bg-primary', 'bg-success', 'bg-danger', 'bg-warning', 'bg-info');
    toastEl.classList.add(`bg-${type}`);
    
    new bootstrap.Toast(toastEl).show();
}

function viewKYC(path) {
    document.getElementById('kycFullImage').src = path;
    new bootstrap.Modal(document.getElementById('kycViewerModal')).show();
}

async function applyCoupon() {
    const code = document.getElementById('couponCode').value.toUpperCase();
    const msg = document.getElementById('couponMessage');
    const total = cart.reduce((sum, i) => sum + (i.price * i.quantity), 0);

    if (!code) return;

    try {
        const res = await fetch('/api/orders/validate-coupon', {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${user.token}`
            },
            body: JSON.stringify({ code, cartTotal: total })
        });
        const data = await res.json();
        if (res.ok) {
            appliedCoupon = data;
            msg.innerHTML = `<span class="text-success">Coupon applied: ${data.discountType === 'percent' ? data.discountValue + '%' : '₹' + data.discountValue} OFF!</span>`;
            updateCartUI();
        } else {
            appliedCoupon = null;
            msg.innerHTML = `<span class="text-danger">${data.message || 'Invalid Coupon'}</span>`;
            updateCartUI();
        }
    } catch (err) {
        notifyUser('Failed to apply coupon', 'info');
    }
}

async function exportOrdersCSV() {
    try {
        const u = JSON.parse(localStorage.getItem('user'));
        if (!u || u.role !== 'admin') {
            notifyUser('Admin access required', 'danger')
            return;
        }

        const res = await fetch('/api/admin/export-csv', {
            headers: { 'Authorization': `Bearer ${u.token}` }
        });
        
        if (!res.ok) throw new Error('Export failed');

        const blob = await res.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.setAttribute('download', 'CleanKart_Sales_Report.csv');
        document.body.appendChild(a);
        a.click();
        
        // Cleanup with slight delay
        setTimeout(() => {
            window.URL.revokeObjectURL(url);
            document.body.removeChild(a);
        }, 200);

        notifyUser('Sales report downloaded!', 'info')
    } catch (err) {
        console.error('Export error:', err);
        notifyUser('Failed to download report', 'info')
    }
}
// --- Admin Coupon Management ---
async function fetchAdminCoupons() {
    try {
        const res = await fetch('/api/admin/coupons', {
            headers: { 'Authorization': `Bearer ${user.token}` },
            cache: 'no-cache'
        });
        const coupons = await res.json();
        const table = document.getElementById('adminCouponsTable');
        if (!table) return;
        table.innerHTML = coupons.map(c => `
            <tr>
                <td class="fw-bold text-primary">${c.code}</td>
                <td><span class="badge bg-dark border border-info text-info">${c.discountType === 'percent' ? c.discountValue + '%' : '₹' + c.discountValue}</span></td>
                <td>₹${c.minOrderValue}</td>
                <td class="small text-secondary">${new Date(c.expiryDate).toLocaleDateString()}</td>
                <td>
                    <button class="btn btn-sm btn-outline-danger" onclick="deleteAdminCoupon('${c._id}')"><i class="fas fa-trash"></i></button>
                </td>
            </tr>
        `).join('') || '<tr><td colspan="5" class="text-center text-secondary py-3">No active coupons</td></tr>';
    } catch (err) { console.error('Error fetching coupons'); }
}

function prepareCouponForm() {
    document.getElementById('adminCouponForm').reset();
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 7);
    document.getElementById('adminCouponExpiry').value = tomorrow.toISOString().split('T')[0];
}

document.getElementById('adminCouponForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const data = {
        code: document.getElementById('adminCouponCode').value,
        discountType: document.getElementById('adminCouponType').value,
        discountValue: document.getElementById('adminCouponValue').value,
        minOrderValue: document.getElementById('adminCouponMin').value,
        expiryDate: document.getElementById('adminCouponExpiry').value
    };

    try {
        const res = await fetch('/api/admin/coupons', {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${user.token}`
            },
            body: JSON.stringify(data)
        });
        if (res.ok) {
            notifyUser('Coupon created successfully!', 'success')
            bootstrap.Modal.getInstance(document.getElementById('adminCouponModal')).hide();
            fetchAdminCoupons();
        } else {
            const err = await res.json();
            notifyUser(err.message || 'Failed to create coupon', 'info')
        }
    } catch (err) { notifyUser('Connection error', 'danger') }
});

async function deleteAdminCoupon(id) {
    if (!confirm('Delete this coupon?')) return;
    try {
        const res = await fetch(`/api/admin/coupons/${id}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${user.token}` }
        });
        if (res.ok) {
            notifyUser('Coupon deleted', 'info')
            fetchAdminCoupons();
        }
    } catch (err) { notifyUser('Delete failed', 'danger') }
}

async function completeOrderPlacement(paymentInfo, addressData) {
    const totalPrice = cart.reduce((sum, i) => sum + (i.price * i.quantity), 0);
    
    // Use FormData to support file uploads for garment pictures!
    const formData = new FormData();
    formData.append('items', JSON.stringify(cart));
    formData.append('totalPrice', totalPrice);
    formData.append('deliveryFee', 20);
    formData.append('address', JSON.stringify(addressData));
    formData.append('paymentMethod', paymentInfo.paymentMethod);
    if (paymentInfo.paymentId) {
        formData.append('paymentId', paymentInfo.paymentId);
    }
    
    const fileInput = document.getElementById('garmentPics');
    if (fileInput && fileInput.files && fileInput.files.length > 0) {
        for (let i = 0; i < fileInput.files.length; i++) {
            formData.append('garmentImages', fileInput.files[i]);
        }
    }

    try {
        const res = await fetch('/api/orders', {
            method: 'POST',
            headers: { 
                'Authorization': `Bearer ${user.token}`
            },
            body: formData
        });
        if (res.ok) {
            const order = await res.json();
            notifyUser('Order placed successfully!', 'success');
            saveAddress();
            sendWhatsAppNotification(order, addressData.mobile);
            cart = [];
            localStorage.removeItem('cart');
            updateCartUI();
            
            // Clear uploader file list and preview
            if (fileInput) fileInput.value = '';
            const previewContainer = document.getElementById('garmentPicsPreview');
            if (previewContainer) previewContainer.innerHTML = '';
            
            bootstrap.Modal.getInstance(document.getElementById('checkoutModal')).hide();
            const cartSidebar = document.getElementById('cartSidebar');
            if (cartSidebar) {
                const offcanvas = bootstrap.Offcanvas.getInstance(cartSidebar);
                if (offcanvas) offcanvas.hide();
            }
            showSection('myOrders');
            fetchOrders();
        }
    } catch (err) {
        notifyUser('Failed to place order.', 'danger');
    }
}

window.previewGarmentPics = function() {
    const previewContainer = document.getElementById('garmentPicsPreview');
    const files = document.getElementById('garmentPics').files;
    previewContainer.innerHTML = '';
    
    if (files.length === 0) return;
    
    if (files.length > 25) {
        notifyUser('You can upload up to 25 garment pictures per order!', 'warning');
        document.getElementById('garmentPics').value = '';
        return;
    }
    
    Array.from(files).forEach((file) => {
        const reader = new FileReader();
        reader.onload = function(e) {
            const div = document.createElement('div');
            div.style.position = 'relative';
            div.style.width = '65px';
            div.style.height = '65px';
            div.style.borderRadius = '8px';
            div.style.overflow = 'hidden';
            div.style.border = '2px solid rgba(13, 202, 240, 0.4)';
            div.style.boxShadow = '0 2px 5px rgba(0,0,0,0.2)';
            
            div.innerHTML = `
                <img src="${e.target.result}" style="width:100%; height:100%; object-fit:cover;">
            `;
            previewContainer.appendChild(div);
        }
        reader.readAsDataURL(file);
    });
};

// --- Mobile Bottom Navigation Helper Functions ---
function selectMobileNavItem(element) {
    if (!element) return;
    document.querySelectorAll('.mobile-nav-item').forEach(item => {
        item.classList.remove('active');
    });
    element.classList.add('active');
}

function triggerMobileAccountAction() {
    if (user) {
        // Logged in: show profile modal
        const profileModalEl = document.getElementById('profileModal');
        if (profileModalEl) {
            new bootstrap.Modal(profileModalEl).show();
        }
    } else {
        // Guest: show login modal
        const loginModalEl = document.getElementById('loginModal');
        if (loginModalEl) {
            new bootstrap.Modal(loginModalEl).show();
        }
    }
}

// --- Progressive Web App (PWA) Custom Install Trigger Logic ---
let deferredPrompt;

window.addEventListener('beforeinstallprompt', (e) => {
    // Prevent the default mini-infobar prompt
    e.preventDefault();
    // Stash the event so it can be triggered later
    deferredPrompt = e;
    
    // Show the custom install banners inside Login and Profile Modals
    const bannerLogin = document.getElementById('pwaInstallBannerLogin');
    const bannerProfile = document.getElementById('pwaInstallBannerProfile');
    if (bannerLogin) bannerLogin.classList.remove('d-none');
    if (bannerProfile) bannerProfile.classList.remove('d-none');
});

// Setup click handlers for the install buttons
document.addEventListener('DOMContentLoaded', () => {
    const installBtnLogin = document.getElementById('pwaInstallBtnLogin');
    const installBtnProfile = document.getElementById('pwaInstallBtnProfile');
    
    const triggerInstall = async () => {
        if (!deferredPrompt) return;
        // Show the prompt
        deferredPrompt.prompt();
        // Wait for the user's choice
        const { outcome } = await deferredPrompt.userChoice;
        console.log(`User accepted the PWA install prompt: ${outcome}`);
        
        // Clear prompt
        deferredPrompt = null;
        
        // Hide the custom install banners
        const bannerLogin = document.getElementById('pwaInstallBannerLogin');
        const bannerProfile = document.getElementById('pwaInstallBannerProfile');
        if (bannerLogin) bannerLogin.classList.add('d-none');
        if (bannerProfile) bannerProfile.classList.add('d-none');
    };
    
    if (installBtnLogin) installBtnLogin.addEventListener('click', triggerInstall);
    if (installBtnProfile) installBtnProfile.addEventListener('click', triggerInstall);
});

window.addEventListener('appinstalled', (event) => {
    console.log('CleanKart was successfully installed as a PWA!');
    // Hide PWA banners if still visible
    const bannerLogin = document.getElementById('pwaInstallBannerLogin');
    const bannerProfile = document.getElementById('pwaInstallBannerProfile');
    if (bannerLogin) bannerLogin.classList.add('d-none');
    if (bannerProfile) bannerProfile.classList.add('d-none');
});

window.trackSupportOrder = function() {
    const input = document.getElementById('supportOrderSearchInput');
    const resultContainer = document.getElementById('supportTrackResult');
    if (!input || !resultContainer) return;
    
    const query = input.value.trim().toLowerCase();
    if (!query) {
        notifyUser('Please enter an Order ID or Bill Number to search', 'warning');
        return;
    }
    
    // Find the order
    const order = allAdminOrders.find(o => 
        o._id.toLowerCase() === query || 
        o._id.toLowerCase().endsWith(query) || 
        o._id.slice(-6).toLowerCase() === query
    );
    
    resultContainer.classList.remove('d-none');
    
    if (!order) {
        resultContainer.innerHTML = `
            <div class="alert alert-danger border-danger bg-dark text-danger p-4 rounded-4 mb-0 text-center shadow-sm">
                <i class="fas fa-exclamation-triangle fa-2x mb-3"></i>
                <h6 class="fw-bold mb-1">Order Not Found</h6>
                <p class="small mb-0">We couldn't find any order matching "#${query.toUpperCase()}". Please verify the Bill/Order Number and try again.</p>
            </div>
        `;
        return;
    }
    
    // Color coding for order status
    let statusBadgeColor = 'secondary';
    if (order.status === 'Placed') statusBadgeColor = 'primary';
    else if (['Laundry Confirmed', 'Pickup Assigned', 'Picked', 'Dropped at Laundry'].includes(order.status)) statusBadgeColor = 'warning';
    else if (['Arrived in Laundry', 'Washing'].includes(order.status)) statusBadgeColor = 'info';
    else if (order.status === 'Ready') statusBadgeColor = 'success';
    else if (order.status === 'Delivered') statusBadgeColor = 'success';
    else if (order.status === 'Cancelled') statusBadgeColor = 'danger';
    
    // Create live tracking cards
    const pickupHtml = order.pickupAgent ? `
        <div class="col-md-4">
            <div class="p-3 rounded-4 bg-dark border border-warning h-100 shadow-sm">
                <div class="d-flex justify-content-between align-items-center mb-3">
                    <span class="badge bg-warning text-dark fw-bold"><i class="fas fa-truck-pickup me-1"></i>PICKUP BOY</span>
                    <span class="badge bg-secondary x-small" style="font-size: 0.6rem;">Assigned</span>
                </div>
                <h6 class="text-white fw-bold mb-1">${escapeHtml(order.pickupAgent.name)}</h6>
                <p class="small text-secondary mb-3"><i class="fas fa-phone-alt me-1"></i> ${escapeHtml(order.pickupAgent.phone)}</p>
                <a href="tel:${order.pickupAgent.phone}" class="btn btn-sm btn-outline-warning w-100 rounded-pill fw-bold">
                    <i class="fas fa-phone me-2"></i>Call Pickup Boy
                </a>
            </div>
        </div>
    ` : `
        <div class="col-md-4">
            <div class="p-3 rounded-4 bg-dark border border-secondary h-100 shadow-sm opacity-75">
                <div class="d-flex justify-content-between align-items-center mb-3">
                    <span class="badge bg-secondary text-light"><i class="fas fa-truck-pickup me-1"></i>PICKUP BOY</span>
                    <span class="badge bg-dark border border-secondary text-secondary x-small" style="font-size: 0.6rem;">Unassigned</span>
                </div>
                <h6 class="text-secondary fw-bold mb-1">Not Assigned Yet</h6>
                <p class="small text-secondary mb-3">Waiting for order pickup claim.</p>
                <button class="btn btn-sm btn-outline-secondary w-100 rounded-pill" disabled>
                    <i class="fas fa-phone me-2"></i>No Contact
                </button>
            </div>
        </div>
    `;
    
    const laundryHtml = order.laundryPartner ? `
        <div class="col-md-4">
            <div class="p-3 rounded-4 bg-dark border border-info h-100 shadow-sm">
                <div class="d-flex justify-content-between align-items-center mb-3">
                    <span class="badge bg-info text-dark fw-bold"><i class="fas fa-store me-1"></i>LAUNDRY SHOP</span>
                    <span class="badge bg-secondary x-small" style="font-size: 0.6rem;">Confirmed</span>
                </div>
                <h6 class="text-white fw-bold mb-1">${escapeHtml(order.laundryPartner.name)}</h6>
                <p class="small text-secondary mb-3"><i class="fas fa-phone-alt me-1"></i> ${escapeHtml(order.laundryPartner.phone)}</p>
                <a href="tel:${order.laundryPartner.phone}" class="btn btn-sm btn-outline-info w-100 rounded-pill fw-bold">
                    <i class="fas fa-phone me-2"></i>Call Laundry Shop
                </a>
            </div>
        </div>
    ` : `
        <div class="col-md-4">
            <div class="p-3 rounded-4 bg-dark border border-secondary h-100 shadow-sm opacity-75">
                <div class="d-flex justify-content-between align-items-center mb-3">
                    <span class="badge bg-secondary text-light"><i class="fas fa-store me-1"></i>LAUNDRY SHOP</span>
                    <span class="badge bg-dark border border-secondary text-secondary x-small" style="font-size: 0.6rem;">Unclaimed</span>
                </div>
                <h6 class="text-secondary fw-bold mb-1">Not Claimed Yet</h6>
                <p class="small text-secondary mb-3">Waiting for laundry shop claim.</p>
                <button class="btn btn-sm btn-outline-secondary w-100 rounded-pill" disabled>
                    <i class="fas fa-phone me-2"></i>No Contact
                </button>
            </div>
        </div>
    `;
    
    const deliveryHtml = order.deliveryAgent ? `
        <div class="col-md-4">
            <div class="p-3 rounded-4 bg-dark border border-success h-100 shadow-sm">
                <div class="d-flex justify-content-between align-items-center mb-3">
                    <span class="badge bg-success text-white fw-bold"><i class="fas fa-truck me-1"></i>DELIVERY BOY</span>
                    <span class="badge bg-secondary x-small" style="font-size: 0.6rem;">Assigned</span>
                </div>
                <h6 class="text-white fw-bold mb-1">${escapeHtml(order.deliveryAgent.name)}</h6>
                <p class="small text-secondary mb-3"><i class="fas fa-phone-alt me-1"></i> ${escapeHtml(order.deliveryAgent.phone)}</p>
                <a href="tel:${order.deliveryAgent.phone}" class="btn btn-sm btn-outline-success w-100 rounded-pill fw-bold">
                    <i class="fas fa-phone me-2"></i>Call Delivery Boy
                </a>
            </div>
        </div>
    ` : `
        <div class="col-md-4">
            <div class="p-3 rounded-4 bg-dark border border-secondary h-100 shadow-sm opacity-75">
                <div class="d-flex justify-content-between align-items-center mb-3">
                    <span class="badge bg-secondary text-light"><i class="fas fa-truck me-1"></i>DELIVERY BOY</span>
                    <span class="badge bg-dark border border-secondary text-secondary x-small" style="font-size: 0.6rem;">Unassigned</span>
                </div>
                <h6 class="text-secondary fw-bold mb-1">Not Assigned Yet</h6>
                <p class="small text-secondary mb-3">Waiting for order ready status.</p>
                <button class="btn btn-sm btn-outline-secondary w-100 rounded-pill" disabled>
                    <i class="fas fa-phone me-2"></i>No Contact
                </button>
            </div>
        </div>
    `;
    
    resultContainer.innerHTML = `
        <div class="p-4 rounded-4 bg-dark border border-secondary shadow-lg">
            <div class="d-flex flex-column flex-md-row justify-content-between align-items-md-center gap-3 mb-4 pb-3 border-bottom border-secondary">
                <div>
                    <h5 class="text-white fw-bold mb-1">Bill Number: <span class="text-info">#${order._id.slice(-6).toUpperCase()}</span></h5>
                    <p class="small text-secondary mb-0">Order ID: ${order._id}</p>
                </div>
                <div class="d-flex align-items-center gap-2">
                    <span class="badge bg-${statusBadgeColor} fs-6 py-2 px-3">${order.status.toUpperCase()}</span>
                    <span class="badge bg-dark border border-secondary text-secondary py-2 px-3 small"><i class="fas fa-eye me-1"></i> View Only</span>
                </div>
            </div>
            
            <div class="row g-4 mb-4">
                <!-- Customer info card -->
                <div class="col-md-6">
                    <div class="p-3 rounded-4 bg-glass border border-secondary h-100">
                        <h6 class="text-secondary small fw-bold mb-3"><i class="fas fa-user me-2 text-primary"></i>CUSTOMER PROFILE</h6>
                        <h6 class="text-white fw-bold mb-1">${escapeHtml(order.user?.name || 'Guest')}</h6>
                        <p class="small text-info mb-1"><i class="fas fa-phone me-1"></i> ${escapeHtml(order.address?.mobile || 'No Contact')}</p>
                        <p class="small text-secondary mb-0"><i class="fas fa-envelope me-1"></i> ${escapeHtml(order.user?.email || 'N/A')}</p>
                    </div>
                </div>
                <!-- Delivery destination card -->
                <div class="col-md-6">
                    <div class="p-3 rounded-4 bg-glass border border-secondary h-100">
                        <h6 class="text-secondary small fw-bold mb-3"><i class="fas fa-location-dot me-2 text-danger"></i>DELIVERY ADDRESS</h6>
                        <p class="small text-white mb-1 fw-bold">${escapeHtml(order.address?.fullName || 'Guest')}</p>
                        <p class="small text-secondary mb-0"><i class="fas fa-map-marked-alt me-1"></i> ${escapeHtml(order.address?.addressLine)}, Pincode: ${escapeHtml(order.address?.pincode)}</p>
                    </div>
                </div>
            </div>
            
            <h6 class="text-secondary small fw-bold mb-3"><i class="fas fa-users me-2 text-info"></i>LIVE FLEET PARTNERS DIRECTORY</h6>
            <div class="row g-3 mb-4">
                ${pickupHtml}
                ${laundryHtml}
                ${deliveryHtml}
            </div>
            
            <!-- Secure Handover Transaction OTP Ledger -->
            <div class="p-3 rounded-4 bg-glass border border-warning mb-3">
                <h6 class="text-warning small fw-bold mb-3"><i class="fas fa-lock me-2 text-warning"></i>🔒 SECURE TRANSACTION OTP LEDGER (SUPPORT TELEPHONY CODES)</h6>
                <div class="row g-2 text-start">
                    <div class="col-6 col-md-4"><div class="p-2 bg-dark rounded border border-secondary small"><span class="text-secondary d-block" style="font-size: 0.6rem;">Confirm Claim</span><strong class="text-white">${window.getTransitionOtp(order._id, 'Laundry Confirmed')}</strong></div></div>
                    <div class="col-6 col-md-4"><div class="p-2 bg-dark rounded border border-secondary small"><span class="text-secondary d-block" style="font-size: 0.6rem;">Pickup Claim</span><strong class="text-white">${window.getTransitionOtp(order._id, 'Pickup Assigned')}</strong></div></div>
                    <div class="col-6 col-md-4"><div class="p-2 bg-dark rounded border border-secondary small"><span class="text-secondary d-block" style="font-size: 0.6rem;">Mark Picked</span><strong class="text-warning">${window.getTransitionOtp(order._id, 'Picked')}</strong></div></div>
                    <div class="col-6 col-md-4"><div class="p-2 bg-dark rounded border border-secondary small"><span class="text-secondary d-block" style="font-size: 0.6rem;">Drop Laundry</span><strong class="text-white">${window.getTransitionOtp(order._id, 'Dropped at Laundry')}</strong></div></div>
                    <div class="col-6 col-md-4"><div class="p-2 bg-dark rounded border border-secondary small"><span class="text-secondary d-block" style="font-size: 0.6rem;">Confirm Order</span><strong class="text-white">${window.getTransitionOtp(order._id, 'Arrived in Laundry')}</strong></div></div>
                    <div class="col-6 col-md-4"><div class="p-2 bg-dark rounded border border-secondary small"><span class="text-secondary d-block" style="font-size: 0.6rem;">Start Washing</span><strong class="text-white">${window.getTransitionOtp(order._id, 'Washing')}</strong></div></div>
                    <div class="col-6 col-md-4"><div class="p-2 bg-dark rounded border border-secondary small"><span class="text-secondary d-block" style="font-size: 0.6rem;">Mark Ready</span><strong class="text-white">${window.getTransitionOtp(order._id, 'Ready')}</strong></div></div>
                    <div class="col-6 col-md-4"><div class="p-2 bg-dark rounded border border-secondary small"><span class="text-secondary d-block" style="font-size: 0.6rem;">Delivery Claim</span><strong class="text-white">${window.getTransitionOtp(order._id, 'Delivery Assigned')}</strong></div></div>
                    <div class="col-6 col-md-4"><div class="p-2 bg-dark rounded border border-secondary small"><span class="text-secondary d-block" style="font-size: 0.6rem;">Pick Laundry</span><strong class="text-white">${window.getTransitionOtp(order._id, 'Out for Delivery')}</strong></div></div>
                    <div class="col-6 col-md-4"><div class="p-2 bg-dark rounded border border-secondary small"><span class="text-secondary d-block" style="font-size: 0.6rem;">Mark Delivered</span><strong class="text-success">${window.getTransitionOtp(order._id, 'Delivered')}</strong></div></div>
                </div>
            </div>
            
            <!-- Items summary card -->
            <div class="p-3 rounded-4 bg-glass border border-secondary mb-3">
                <h6 class="text-secondary small fw-bold mb-3"><i class="fas fa-basket-shopping me-2 text-warning"></i>CLOTHES SUMMARY</h6>
                <div class="d-flex flex-wrap gap-2 mb-3">
                    ${order.items.map(item => `
                        <span class="badge bg-dark border border-secondary text-light px-3 py-2 fs-7">
                            ${escapeHtml(item.name)} <span class="text-info mx-1">x</span> ${item.quantity}
                        </span>
                    `).join('')}
                </div>
                <div class="d-flex justify-content-between align-items-center pt-3 border-top border-secondary">
                    <span class="text-secondary small">Total Invoice Amount:</span>
                    <span class="h5 text-success mb-0 fw-bold">₹${order.totalPrice}</span>
                </div>
            </div>

            <!-- Doorstep Inspection Report Card -->
            ${order.pickupInspectionReport ? `
            <div class="p-3 rounded-4 bg-glass border border-info mb-3 text-start">
                <h6 class="text-info small fw-bold mb-2"><i class="fas fa-clipboard-check me-2 text-info"></i>DOORSTEP QUALITY INSPECTION REPORT</h6>
                <div class="p-3 rounded-3 bg-dark border border-secondary text-light small">
                    <i class="fas fa-circle-info text-info me-2"></i>${escapeHtml(order.pickupInspectionReport)}
                </div>
            </div>
            ` : `
            <div class="p-3 rounded-4 bg-glass border border-secondary mb-3 text-start opacity-75">
                <h6 class="text-secondary small fw-bold mb-2"><i class="fas fa-clipboard-question me-2"></i>DOORSTEP QUALITY INSPECTION REPORT</h6>
                <p class="x-small text-secondary mb-0">No quality inspection has been filed for this order yet (Order is still pending collection).</p>
            </div>
            `}

            <!-- Laundry Receipt Inspection Report Card -->
            ${order.laundryInspectionReport ? `
            <div class="p-3 rounded-4 bg-glass border border-info mb-3 text-start">
                <h6 class="text-info small fw-bold mb-2"><i class="fas fa-store me-2 text-info"></i>LAUNDRY SHOP INCOMING QA REPORT</h6>
                <div class="p-3 rounded-3 bg-dark border border-secondary text-light small">
                    <i class="fas fa-circle-info text-info me-2"></i>${escapeHtml(order.laundryInspectionReport)}
                </div>
            </div>
            ` : ''}

            <!-- Delivery Dispatch QA Report Card -->
            ${order.deliveryInspectionReport ? `
            <div class="p-3 rounded-4 bg-glass border border-info mb-3 text-start">
                <h6 class="text-info small fw-bold mb-2"><i class="fas fa-truck-ramp-box me-2 text-info"></i>DELIVERY DISPATCH QA REPORT</h6>
                <div class="p-3 rounded-3 bg-dark border border-secondary text-light small">
                    <i class="fas fa-circle-info text-info me-2"></i>${escapeHtml(order.deliveryInspectionReport)}
                </div>
            </div>
            ` : ''}

            <!-- Customer Delivery Acknowledgement Card -->
            ${order.customerDeliveryAcknowledgement ? `
            <div class="p-3 rounded-4 bg-glass border border-success mb-3 text-start">
                <h6 class="text-success small fw-bold mb-2"><i class="fas fa-circle-check me-2 text-success"></i>🔒 LOCK-DOWN CUSTOMER DELIVERY ACKNOWLEDGEMENT</h6>
                <div class="p-3 rounded-3 bg-dark border border-success text-light small">
                    <i class="fas fa-circle-info text-success me-2"></i>${escapeHtml(order.customerDeliveryAcknowledgement)}
                </div>
            </div>
            ` : ''}
            
            <div class="text-center text-secondary x-small opacity-75">
                <i class="fas fa-info-circle me-1"></i> <strong>Support Notice:</strong> Support Desk is view-only. Use <strong>Master Order Control</strong> below to update states.
            </div>
        </div>
    `;
};

window.viewGarmentPhotosModal = async function(orderId) {
    const grid = document.getElementById('garmentModalPicsGrid');
    if (!grid) return;
    grid.innerHTML = '<div class="spinner-border text-info" role="status"></div>';
    
    // Show modal first
    const modal = new bootstrap.Modal(document.getElementById('garmentPhotosModal'));
    modal.show();
    
    let garmentImages = [];
    
    // Look up in global admin orders
    if (typeof allAdminOrders !== 'undefined' && allAdminOrders.length > 0) {
        const o = allAdminOrders.find(x => x._id === orderId);
        if (o) garmentImages = o.garmentImages || [];
    }
    
    // If not found in admin list, check user/partner lists or do a quick fetch
    if (garmentImages.length === 0) {
        try {
            const token = user ? user.token : '';
            const res = await fetch(`/api/orders/myorders`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (res.ok) {
                const orders = await res.json();
                const o = orders.find(x => x._id === orderId);
                if (o) garmentImages = o.garmentImages || [];
            }
        } catch (e) {
            console.error('Error fetching garment pics', e);
        }
    }
    
    if (garmentImages.length === 0) {
        grid.innerHTML = `
            <div class="text-secondary p-3">
                <i class="fas fa-image fa-2x mb-2 text-muted"></i>
                <p class="small mb-0">No garment pictures uploaded for this order.</p>
            </div>
        `;
        return;
    }
    
    grid.innerHTML = garmentImages.map(img => `
        <div style="width: 100px; height: 100px; border-radius: 8px; overflow: hidden; border: 2px solid rgba(13, 202, 240, 0.4); box-shadow: 0 4px 10px rgba(0,0,0,0.3);">
            <img src="${img}" style="width: 100%; height: 100%; object-fit: cover; cursor: pointer;" onclick="window.open('${img}', '_blank')">
        </div>
    `).join('');
};

window.sendAutomatedPartnerNotification = function(order, status) {
    let message = '';
    let targetPhone = '';
    
    const orderIdShort = order._id.slice(-6).toUpperCase();
    const customerMobile = order.address?.mobile || '';
    
    if (status === 'Laundry Confirmed') {
        // Confirmed -> notify pickup boy!
        if (order.pickupAgent && order.pickupAgent.phone) {
            targetPhone = order.pickupAgent.phone;
            message = `Hello ${order.pickupAgent.name}, CleanKart Order #${orderIdShort} has been Confirmed! Please pick up the garments from the customer's address: ${order.address.addressLine}. Customer Mobile: ${customerMobile}. Link: ${window.location.origin}`;
        } else {
            message = `CleanKart Alert: A new order #${orderIdShort} has been confirmed and is waiting for a Pickup Boy to claim it! Link: ${window.location.origin}`;
        }
    } else if (status === 'Ready') {
        // Ready -> notify delivery boy!
        if (order.deliveryAgent && order.deliveryAgent.phone) {
            targetPhone = order.deliveryAgent.phone;
            message = `Hello ${order.deliveryAgent.name}, CleanKart Order #${orderIdShort} is Ready at the laundry shop! Please collect the package and deliver it to the customer: ${order.address.fullName} (${order.address.addressLine}). Customer Mobile: ${customerMobile}. Link: ${window.location.origin}`;
        } else {
            message = `CleanKart Alert: Order #${orderIdShort} is fully washed and Ready! Delivery Boys, please claim and deliver it. Link: ${window.location.origin}`;
        }
    } else if (status === 'Placed') {
        // Placed -> notify laundry shop!
        if (order.laundryPartner && order.laundryPartner.phone) {
            targetPhone = order.laundryPartner.phone;
            message = `Hello, CleanKart Order #${orderIdShort} has been Placed by customer! Please start processing. Address: ${order.address.addressLine}. Customer Mobile: ${customerMobile}. Link: ${window.location.origin}`;
        } else {
            message = `CleanKart Alert: New Order #${orderIdShort} has been placed in your service area! Laundry Partners, please claim it now. Link: ${window.location.origin}`;
        }
    }

    if (message) {
        const encodedMsg = encodeURIComponent(message);
        const url = targetPhone ? `https://wa.me/${targetPhone}?text=${encodedMsg}` : `https://wa.me/?text=${encodedMsg}`;
        
        // Open WhatsApp redirect safely
        window.open(url, '_blank');
        notifyUser('Automated WhatsApp dispatch link prepared!', 'success');
    }
};

window.verifySecureHandover = function() {
    const input = document.getElementById('handoverOtpInput').value.trim();
    if (!window.activeHandoverVerification) return;
    
    const { orderId, status, expectedOtp } = window.activeHandoverVerification;
    
    if (parseInt(input) === expectedOtp) {
        let pickupInspectionReport = '';
        let laundryInspectionReport = '';
        let deliveryInspectionReport = '';
        let customerDeliveryAcknowledgement = '';

        if (status === 'Picked') {
            const isTorn = document.getElementById('inspectionTornCheck').checked;
            const isStained = document.getElementById('inspectionStainedCheck').checked;
            const notes = document.getElementById('inspectionNotesInput').value.trim();
            
            if (isTorn || isStained || notes) {
                pickupInspectionReport = `Doorstep Inspection: [Torn: ${isTorn ? 'YES' : 'NO'}], [Stained: ${isStained ? 'YES' : 'NO'}]. Notes: ${notes || 'None'}`;
            } else {
                pickupInspectionReport = 'Doorstep Inspection: Passed (All garments inspected, 0 pre-existing damage found).';
            }
        } else if (status === 'Arrived in Laundry') {
            const isTorn = document.getElementById('laundryInspectionTornCheck').checked;
            const isCountOk = document.getElementById('laundryInspectionCountCheck').checked;
            const notes = document.getElementById('laundryInspectionNotesInput').value.trim();
            
            laundryInspectionReport = `Laundry Incoming QA: [Torn/Damaged: ${isTorn ? 'YES' : 'NO'}], [Count Confirmed: ${isCountOk ? 'YES' : 'NO'}]. Notes: ${notes || 'None'}`;
        } else if (status === 'Out for Delivery') {
            const isIntact = document.getElementById('deliveryInspectionIntactCheck').checked;
            const notes = document.getElementById('deliveryInspectionNotesInput').value.trim();
            
            deliveryInspectionReport = `Delivery Dispatch QA: [Intact, Pressed & Sealed: ${isIntact ? 'YES' : 'NO'}]. Notes: ${notes || 'None'}`;
        } else if (status === 'Delivered') {
            const isPerfect = document.getElementById('customerAckPerfectCheck').checked;
            const notes = document.getElementById('customerAckNotesInput').value.trim();
            
            customerDeliveryAcknowledgement = `Customer Doorstep Acknowledgement: [Received Perfect & Intact: ${isPerfect ? 'YES' : 'NO'}]. Customer Signature Remarks: ${notes || 'Perfect delivery confirmed.'}`;
        }

        // Hide the verification modal
        const modalEl = document.getElementById('secureHandoverModal');
        const modal = bootstrap.Modal.getInstance(modalEl);
        if (modal) modal.hide();
        
        notifyUser('Handover OTP and inspection verified!', 'success');
        
        // Proceed with actual update status bypassing OTP check
        updateStatus(orderId, status, true, pickupInspectionReport, laundryInspectionReport, deliveryInspectionReport, customerDeliveryAcknowledgement);
    } else {
        notifyUser('Invalid Secure Handover OTP! Please enter the correct code.', 'danger');
    }
};

window.getTransitionOtp = function(oId, st) {
    const idNum = parseInt(oId.slice(-6), 16);
    switch(st) {
        case 'Laundry Confirmed': return (idNum * 11 % 9000 + 1000);
        case 'Pickup Assigned': return (idNum * 13 % 9000 + 1000);
        case 'Picked': return (idNum * 3 % 9000 + 1000);
        case 'Dropped at Laundry': return (idNum * 17 % 9000 + 1000);
        case 'Arrived in Laundry': return (idNum * 5 % 9000 + 1000);
        case 'Washing': return (idNum * 19 % 9000 + 1000);
        case 'Ready': return (idNum * 21 % 9000 + 1000);
        case 'Delivery Assigned': return (idNum * 23 % 9000 + 1000);
        case 'Out for Delivery': return (idNum * 7 % 9000 + 1000);
        case 'Delivered': return (idNum * 9 % 9000 + 1000);
        case 'Cancelled': return (idNum * 27 % 9000 + 1000);
        default: return (idNum * 29 % 9000 + 1000);
    }
};

let pincodeAlertTimeout = null;

// Helper to inject a real close (×) button into the pincode alert message
function showPincodeMsg(msgDiv, className, html) {
    if (pincodeAlertTimeout) clearTimeout(pincodeAlertTimeout);
    msgDiv.className = className;
    msgDiv.innerHTML = `
        <div class="d-flex align-items-start justify-content-between gap-2">
            <span>${html}</span>
            <button onclick="document.getElementById('allIndiaPincodeStatusMessage').classList.add('d-none')" 
                style="background:none;border:none;color:inherit;cursor:pointer;font-size:1.1rem;line-height:1;padding:0;opacity:0.8;flex-shrink:0;"
                title="Close">✕</button>
        </div>`;
    msgDiv.classList.remove('d-none');
}

window.checkAllIndiaPincode = async function() {
    const input = document.getElementById('inputPincodeAllIndia');
    const msgDiv = document.getElementById('allIndiaPincodeStatusMessage');
    if (!input || !msgDiv) return;
    
    // Clear any previous hide-timeout
    if (pincodeAlertTimeout) clearTimeout(pincodeAlertTimeout);
    
    // Setup listener to hide message box instantly when typing
    if (!input.dataset.listenerAttached) {
        input.addEventListener('input', () => {
            msgDiv.classList.add('d-none');
        });
        input.dataset.listenerAttached = "true";
    }

    const pincode = input.value.trim();
    if (!/^\d{6}$/.test(pincode)) {
        showPincodeMsg(msgDiv, 'mt-2 small text-danger fw-bold', '<i class="fas fa-triangle-exclamation me-1"></i>Please enter a valid 6-digit Indian Pincode!');
        
        // Auto-hide after 5 seconds
        pincodeAlertTimeout = setTimeout(() => {
            msgDiv.classList.add('d-none');
        }, 5000);
        return;
    }
    
    msgDiv.className = 'mt-2 small text-secondary';
    msgDiv.innerHTML = '<i class="fas fa-spinner fa-spin me-1"></i>Checking service availability...';
    msgDiv.classList.remove('d-none');
    
    try {
        const res = await fetch(`/api/orders/check-pincode/${pincode}`);
        const data = await res.json();
        
        if (res.ok && data.serviceable) {
            showPincodeMsg(msgDiv,
                'mt-2 small fw-bold p-2 rounded bg-success bg-opacity-25 border border-success text-white',
                `<i class="fas fa-circle-check me-1 text-success"></i>${data.message} <a href="#services" class="text-success text-decoration-underline ms-2">Book Now!</a>`
            );
        } else {
            showPincodeMsg(msgDiv,
                'mt-2 small fw-bold p-2 rounded bg-warning bg-opacity-25 border border-warning text-white',
                `<i class="fas fa-circle-xmark me-1 text-warning"></i>${data.message || 'Service not active yet.'}`
            );
        }
        
        // Auto-hide after 6 seconds
        pincodeAlertTimeout = setTimeout(() => {
            msgDiv.classList.add('d-none');
        }, 6000);
    } catch (err) {
        showPincodeMsg(msgDiv,
            'mt-2 small text-danger fw-bold',
            '<i class="fas fa-circle-exclamation me-1"></i>Network error checking availability. Please try again.'
        );
        
        pincodeAlertTimeout = setTimeout(() => {
            msgDiv.classList.add('d-none');
        }, 5000);
    }
};

// Force Indian Pincode Input to be 100% empty on page load/refresh (Disables browser form persistence & late-stage autofill)
const forceClearPincodeInput = () => {
    const pinInput = document.getElementById('inputPincodeAllIndia');
    const msgDiv = document.getElementById('allIndiaPincodeStatusMessage');
    if (pinInput) {
        pinInput.value = '';
        if (msgDiv && !pinInput.dataset.listenerAttached) {
            pinInput.addEventListener('input', () => {
                msgDiv.classList.add('d-none');
            });
            pinInput.dataset.listenerAttached = "true";
        }
    }
};
document.addEventListener('DOMContentLoaded', forceClearPincodeInput);
window.addEventListener('load', forceClearPincodeInput);
// Clear it after a micro delay to ensure Chrome's late autofill trigger is fully wiped out
setTimeout(forceClearPincodeInput, 100);
setTimeout(forceClearPincodeInput, 500);
