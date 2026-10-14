let items = [];
let claims = [];
let myClaims = [];
let currentUser = null;
let canInviteStaff = false;
let selectedClaimItem = null;
let editingItemId = null;
let reportRequestKey = null;
let authMode = 'login';
let previousFocus = null;
const $ = id => document.getElementById(id);

const dateInputValue = date => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
const daysAgo = value => { const date = new Date(value); return Number.isNaN(date.getTime()) ? 0 : Math.max(0, Math.floor((new Date().setHours(0, 0, 0, 0) - date.setHours(0, 0, 0, 0)) / 86400000)); };
const formatDate = value => { const date = new Date(`${value}T12:00:00`); return Number.isNaN(date.getTime()) ? 'Date unavailable' : new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }).format(date); };
const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));

async function api(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) }
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || 'Something went wrong. Please try again.');
  return data;
}

function toast(message) {
  $('toast').textContent = message;
  $('toast').classList.add('show');
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => $('toast').classList.remove('show'), 3800);
}
function showStatus(message, type = 'error') {
  const banner = $('appStatus');
  banner.textContent = message;
  banner.className = `status-banner ${type}`;
  banner.classList.remove('hidden');
}
function clearStatus() { $('appStatus').classList.add('hidden'); }
function show(id) {
  previousFocus = document.activeElement;
  $(id).classList.remove('hidden');
  document.body.classList.add('modal-open');
  if (history.state?.modal !== id) history.pushState({ modal: id }, '');
  const focusDialog = () => $(id).querySelector('input,button,select,textarea')?.focus();
  if (typeof requestAnimationFrame === 'function') requestAnimationFrame(focusDialog); else setTimeout(focusDialog, 0);
}
function closeDialogs() {
  document.querySelectorAll('.modal-backdrop:not(.hidden)').forEach(modal => modal.classList.add('hidden'));
  $('staffPanel').classList.add('hidden');
  $('studentPanel').classList.add('hidden');
  document.body.classList.remove('modal-open');
  previousFocus?.focus?.();
}
function hide(element) {
  if (history.state?.modal) { history.back(); return; }
  element.closest('.modal-backdrop')?.classList.add('hidden');
  document.body.classList.remove('modal-open');
  previousFocus?.focus?.();
}
window.addEventListener('popstate', closeDialogs);

async function refresh() {
  const grid = $('itemGrid');
  grid.setAttribute('aria-busy', 'true');
  try {
    const itemRequest = api('/api/items');
    const claimRequest = currentUser?.role === 'staff' ? api('/api/staff/claims') : currentUser ? api('/api/my/claims') : Promise.resolve([]);
    const [nextItems, nextClaims] = await Promise.all([itemRequest, claimRequest]);
    items = nextItems;
    if (currentUser?.role === 'staff') claims = nextClaims;
    else myClaims = nextClaims;
    clearStatus();
    render();
  } catch (error) {
    grid.innerHTML = '<div class="empty-state load-error"><span class="empty-icon" aria-hidden="true">!</span><h3>We couldn’t load the board</h3><p>Check your connection and try again.</p><button class="button secondary" id="retryLoad" type="button">Try again</button></div>';
    grid.setAttribute('aria-busy', 'false');
    showStatus(error.message);
  }
}

function render() {
  const query = $('searchInput').value.toLowerCase().trim();
  const category = $('categoryFilter').value;
  const range = $('dateFilter').value;
  const visible = items.filter(item =>
    (item.status === 'published' || item.canEdit || currentUser?.role === 'staff') &&
    (!query || `${item.title} ${item.description} ${item.location}`.toLowerCase().includes(query)) &&
    (category === 'all' || item.category === category) &&
    (range === 'all' || daysAgo(item.date) <= Number(range))
  );
  $('resultCount').textContent = `${visible.length} ${visible.length === 1 ? 'item' : 'items'}`;
  $('itemGrid').innerHTML = visible.map(renderItem).join('');
  $('itemGrid').setAttribute('aria-busy', 'false');
  $('emptyState').classList.toggle('hidden', visible.length > 0);
  $('staffToggle').classList.toggle('hidden', currentUser?.role !== 'staff');
  $('studentToggle').classList.toggle('hidden', currentUser?.role !== 'student');
  $('inviteAdmin').classList.toggle('hidden', !canInviteStaff);
  $('openReport').disabled = false;
  $('openReport2').disabled = false;
  renderStudentDashboard();
  renderStaffDashboard();
}

function renderItem(item) {
  const image = item.photo
    ? `<img src="${escapeHtml(item.photo)}" alt="${escapeHtml(item.title)}" loading="lazy" />`
    : `<div class="image-placeholder" aria-hidden="true"><span>${escapeHtml(item.emoji || '📦')}</span></div>`;
  const canManage = currentUser?.role === 'staff' || item.canEdit;
  const statusLabel = `<span class="status-label ${item.status === 'pending' ? 'pending' : ''}">${escapeHtml(item.status)}</span>`;
  const actions = [];
  if (item.status === 'published') actions.push(`<button class="claim-button claim-action" data-claim="${Number(item.id)}">${currentUser ? 'This might be mine' : 'Sign in to claim'} <span aria-hidden="true">→</span></button>`);
  if (canManage) {
    actions.push(`<button class="item-action" data-edit="${Number(item.id)}">Edit</button>`);
    actions.push(`<button class="item-action" data-delete="${Number(item.id)}">Delete</button>`);
  }
  if (currentUser?.role === 'staff' && item.status === 'pending') actions.push(`<button class="item-action" data-publish="${Number(item.id)}">Publish</button>`);
  return `<article class="item-card"><div class="item-image">${image}<span class="category-pill">${escapeHtml(item.category)}</span></div><div class="item-content"><div class="item-meta"><span>${daysAgo(item.date) === 0 ? 'Today' : `${daysAgo(item.date)} days ago`}</span><span aria-hidden="true">·</span><span>${escapeHtml(formatDate(item.date))}</span>${canManage ? statusLabel : ''}</div><h3>${escapeHtml(item.title)}</h3><p class="location"><span aria-hidden="true">⌖</span> ${escapeHtml(item.location)}</p><p>${escapeHtml(item.description)}</p>${actions.length ? `<div class="item-actions">${actions.join('')}</div>` : ''}</div></article>`;
}

function renderStudentDashboard() {
  if (currentUser?.role !== 'student') return;
  const ownItems = items.filter(item => item.canEdit);
  const openClaims = myClaims.filter(claim => ['pending', 'approved'].includes(claim.status));
  const resolved = myClaims.filter(claim => ['rejected', 'collected'].includes(claim.status));
  $('studentGreeting').textContent = `Signed in as ${currentUser.email}`;
  $('myItemsCount').textContent = ownItems.length;
  $('myClaimsCount').textContent = openClaims.length;
  $('myResolvedCount').textContent = resolved.length;
  const reportRows = ownItems.slice(0, 5).map(item => `<div class="queue-row"><span class="queue-icon" aria-hidden="true">${escapeHtml(item.emoji || '📦')}</span><div><strong>${escapeHtml(item.title)}</strong><small>${escapeHtml(item.location)} · ${escapeHtml(item.status)}</small></div><button data-dashboard-edit="${Number(item.id)}" type="button">View</button></div>`);
  const claimRows = myClaims.slice(0, 4).map(claim => `<div class="queue-row"><span class="queue-icon" aria-hidden="true">♡</span><div><strong>${escapeHtml(claim.title)}</strong><small>Claim · ${escapeHtml(claim.status)}</small></div></div>`);
  $('studentQueue').innerHTML = `${reportRows.join('')}${claimRows.join('')}` || '<div class="queue-empty"><span aria-hidden="true">✓</span>You’re all caught up. Your reports and claims will show here.</div>';
}

function renderStaffDashboard() {
  if (currentUser?.role !== 'staff') return;
  const pendingItems = items.filter(item => item.status === 'pending');
  const activeClaims = claims.filter(claim => claim.status === 'pending');
  const approvedClaims = claims.filter(claim => claim.status === 'approved');
  $('pendingReports').textContent = pendingItems.length;
  $('pendingClaims').textContent = activeClaims.length;
  $('expiringSoon').textContent = items.filter(item => item.status === 'published' && daysAgo(item.posted_at || item.date) >= 23 && daysAgo(item.posted_at || item.date) < 30).length;
  $('queueTotal').textContent = pendingItems.length + activeClaims.length + approvedClaims.length;
  const reportRows = pendingItems.map(item => `<div class="queue-row"><span class="queue-icon" aria-hidden="true">${escapeHtml(item.emoji || '📦')}</span><div><strong>${escapeHtml(item.title)}</strong><small>Report · ${escapeHtml(item.location)}</small></div><button data-publish="${Number(item.id)}" type="button">Publish</button></div>`);
  const claimRows = activeClaims.map(claim => `<div class="queue-row"><span class="queue-icon" aria-hidden="true">♡</span><div><strong>Claim: ${escapeHtml(claim.title)}</strong><small>${escapeHtml(claim.email)} · Proof: ${escapeHtml(claim.proof)}</small></div><span class="queue-actions"><button data-decision="approved" data-id="${Number(claim.id)}" type="button">Approve</button><button class="reject" data-decision="rejected" data-id="${Number(claim.id)}" type="button">Reject</button></span></div>`);
  const pickupRows = approvedClaims.map(claim => `<div class="queue-row"><span class="queue-icon" aria-hidden="true">↗</span><div><strong>Pickup: ${escapeHtml(claim.title)}</strong><small>Approved claim · Ready for handoff</small></div><button data-decision="collected" data-id="${Number(claim.id)}" type="button">Collected</button></div>`);
  $('staffQueue').innerHTML = [...reportRows, ...claimRows, ...pickupRows].join('') || '<div class="queue-empty"><span aria-hidden="true">✓</span>All caught up. New reports will appear here.</div>';
}

function setAuthMode(mode) {
  authMode = mode;
  const registering = mode === 'register';
  $('authHeading').textContent = registering ? 'Join the community.' : 'Welcome back.';
  $('authIntro').textContent = registering ? 'Create a student account to post items and make private claims.' : 'Sign in to post an item, follow your reports, and make a claim.';
  $('authSubmit').innerHTML = `${registering ? 'Create student account' : 'Sign in'} <span aria-hidden="true">→</span>`;
  $('authPassword').autocomplete = registering ? 'new-password' : 'current-password';
  $('authPassword').maxLength = registering ? 128 : 1024;
  if (registering) $('authPassword').setAttribute('minlength', '10');
  else $('authPassword').removeAttribute('minlength');
  $('showLogin').classList.toggle('active', !registering);
  $('showRegister').classList.toggle('active', registering);
  $('showLogin').setAttribute('aria-pressed', String(!registering));
  $('showRegister').setAttribute('aria-pressed', String(registering));
  $('authMessage').classList.add('hidden');
}

function openReportForm(item = null) {
  if (!currentUser) {
    setAuthMode('login');
    show('authModal');
    $('authMessage').textContent = 'Sign in or create a student account to post an item.';
    $('authMessage').classList.remove('hidden');
    return;
  }
  editingItemId = item?.id || null;
  $('reportForm').reset();
  $('reportMessage').classList.add('hidden');
  $('reportHeading').textContent = item ? 'Update your report' : 'Post a found item';
  $('photoInput').required = !item?.photo;
  $('reportDate').value = item?.date || dateInputValue(new Date());
  if (item) {
    $('reportTitle').value = item.title;
    $('reportCategory').value = item.category;
    $('reportLocation').value = item.location;
    $('reportDescription').value = item.description;
    if (item.photo) {
      $('previewImage').src = item.photo;
      $('photoPreview').classList.remove('hidden');
      $('uploadBox').classList.add('hidden');
      $('photoInput').required = false;
    }
  } else {
    $('previewImage').removeAttribute('src');
    $('photoPreview').classList.add('hidden');
    $('uploadBox').classList.remove('hidden');
  }
  show('reportModal');
}

async function authAction() {
  if (!currentUser) {
    setAuthMode('login');
    show('authModal');
    return;
  }
  try {
    await api('/api/logout', { method: 'POST' });
    currentUser = null;
    claims = [];
    myClaims = [];
    canInviteStaff = false;
    $('accountButton').textContent = 'Sign in';
    await refresh();
    toast('You’ve been signed out.');
  } catch (error) { showStatus(error.message); }
}

function setFormMessage(id, message, success = false) {
  const element = $(id);
  element.textContent = message;
  element.classList.toggle('success', success);
  element.classList.remove('hidden');
}

function closeMenu() {
  $('primaryNav').classList.remove('open');
  $('menuToggle').setAttribute('aria-expanded', 'false');
  $('menuToggle').setAttribute('aria-label', 'Open navigation');
}

$('menuToggle').addEventListener('click', () => {
  const open = $('menuToggle').getAttribute('aria-expanded') !== 'true';
  $('menuToggle').setAttribute('aria-expanded', String(open));
  $('menuToggle').setAttribute('aria-label', open ? 'Close navigation' : 'Open navigation');
  $('primaryNav').classList.toggle('open', open);
});
$('primaryNav').addEventListener('click', event => { if (event.target.closest('a')) closeMenu(); });
document.addEventListener('click', async event => {
  const target = event.target;
  try {
    if (target.closest('[data-close]')) return hide(target);
    if (target.matches('#accountButton')) return authAction();
    if (target.matches('#showLogin')) return setAuthMode('login');
    if (target.matches('#showRegister')) return setAuthMode('register');
    if (target.matches('#staffToggle')) { closeMenu(); return show('staffPanel'); }
    if (target.matches('#studentToggle')) { closeMenu(); return show('studentPanel'); }
    if (target.matches('#staffClose')) return $('staffPanel').classList.add('hidden');
    if (target.matches('#studentClose')) return $('studentPanel').classList.add('hidden');
    if (target.matches('#openReport, #openReport2, #dashboardReport')) return openReportForm();
    if (target.matches('#createStaffInvite')) {
      target.disabled = true;
      const result = await api('/api/staff/invitations', { method: 'POST', body: JSON.stringify({}) });
      const invitationUrl = new URL(result.invitationUrl, location.href).href;
      try {
        await navigator.clipboard.writeText(invitationUrl);
        toast('Private invitation link copied. Send it directly to your professor; it expires in 7 days.');
      } catch { prompt('Copy this private invitation link and send it directly to your professor:', invitationUrl); }
      return;
    }
    if (target.matches('#retryLoad')) return refresh();
    if (target.matches('#resetFilters, #emptyReset')) {
      $('searchInput').value = '';
      $('categoryFilter').value = 'all';
      $('dateFilter').value = 'all';
      return render();
    }
    const claimButton = target.closest('[data-claim]');
    if (claimButton) {
      if (!currentUser) { setAuthMode('login'); show('authModal'); $('authMessage').textContent = 'Sign in to submit a claim. Your details stay private.'; $('authMessage').classList.remove('hidden'); return; }
      selectedClaimItem = Number(claimButton.dataset.claim);
      const item = items.find(entry => Number(entry.id) === selectedClaimItem);
      $('claimItemName').textContent = item ? `You’re claiming “${item.title}”. Add a detail that helps staff confirm it belongs to you.` : 'Add a detail that helps staff confirm this item belongs to you.';
      $('claimAccountEmail').textContent = `Submitting as ${currentUser.email}`;
      $('claimMessage').classList.add('hidden');
      $('claimProof').value = '';
      return show('claimModal');
    }
    const publish = target.closest('[data-publish]');
    if (publish) {
      await api(`/api/staff/items/${publish.dataset.publish}/status`, { method: 'PATCH', body: JSON.stringify({ status: 'published' }) });
      await refresh();
      return toast('Report published. It’s now visible to the campus community.');
    }
    const deleteButton = target.closest('[data-delete]');
    if (deleteButton) {
      if (!confirm('Delete this item and its claims? This cannot be undone.')) return;
      await api(`/api/items/${deleteButton.dataset.delete}`, { method: 'DELETE' });
      await refresh();
      return toast('Item deleted.');
    }
    const editButton = target.closest('[data-edit], [data-dashboard-edit]');
    if (editButton) {
      const item = items.find(entry => Number(entry.id) === Number(editButton.dataset.edit || editButton.dataset.dashboardEdit));
      if (item) openReportForm(item);
      return;
    }
    const decision = target.closest('[data-decision]');
    if (decision) {
      await api(`/api/staff/claims/${decision.dataset.id}`, { method: 'PATCH', body: JSON.stringify({ status: decision.dataset.decision }) });
      await refresh();
      return toast('Claim status updated.');
    }
  } catch (error) {
    const formMessage = $('reportModal').classList.contains('hidden') ? null : $('reportMessage');
    if (formMessage) setFormMessage('reportMessage', error.message);
    else showStatus(error.message);
  } finally {
    if (target.matches('#createStaffInvite')) target.disabled = false;
  }
});

['searchInput', 'categoryFilter', 'dateFilter'].forEach(id => $(id).addEventListener('input', render));
$('searchInput').addEventListener('keydown', event => { if (event.key === 'Escape') { $('searchInput').value = ''; render(); } });
document.addEventListener('keydown', event => {
  if (event.key === 'Tab') {
    const dialog = document.querySelector('.modal-backdrop:not(.hidden) [role="dialog"]');
    if (dialog) {
      const focusable = [...dialog.querySelectorAll('a[href],button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled),[tabindex]:not([tabindex="-1"])')].filter(element => element.getClientRects().length);
      if (focusable.length) {
        const first = focusable[0], last = focusable.at(-1);
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
      }
    }
  }
  if (event.key === '/'  && !['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement.tagName) && !event.metaKey && !event.ctrlKey && !event.altKey) {
    event.preventDefault(); $('searchInput').focus();
  }
  if (event.key === 'Escape') {
    if (history.state?.modal) history.back();
    else { closeDialogs(); closeMenu(); }
  }
});
$('resetFilters').addEventListener('click', () => {
  $('searchInput').value = ''; $('categoryFilter').value = 'all'; $('dateFilter').value = 'all'; render();
});
$('emptyReset').addEventListener('click', () => $('resetFilters').click());

$('authForm').addEventListener('submit', async event => {
  event.preventDefault();
  const form = event.currentTarget;
  if (!form.reportValidity()) return;
  const button = $('authSubmit');
  button.disabled = true;
  $('authMessage').classList.add('hidden');
  try {
    const endpoint = authMode === 'register' ? '/api/register' : '/api/login';
    const result = await api(endpoint, { method: 'POST', body: JSON.stringify({ email: $('authEmail').value.trim(), password: $('authPassword').value }) });
    currentUser = result.user;
    const me = await api('/api/me');
    canInviteStaff = me.canInviteStaff;
    $('accountButton').textContent = 'Sign out';
    $('accountButton').title = `Signed in as ${currentUser.email}. Sign out`;
    $('authPassword').value = '';
    hide($('authModal'));
    await refresh();
    toast(authMode === 'register' ? 'Your student account is ready.' : `Welcome back, ${currentUser.email}.`);
  } catch (error) { setFormMessage('authMessage', error.message); }
  finally { button.disabled = false; }
});

const photoInput = $('photoInput');
photoInput.addEventListener('change', () => {
  const file = photoInput.files[0];
  if (!file) return;
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 10 * 1024 * 1024) {
    photoInput.value = '';
    setFormMessage('reportMessage', 'Choose a JPG, PNG, or WebP image under 10 MB.');
    return;
  }
  const reader = new FileReader();
  reader.onerror = () => setFormMessage('reportMessage', 'This image couldn’t be opened. Try another photo.');
  reader.onload = () => {
    const image = new Image();
    image.onerror = () => setFormMessage('reportMessage', 'This image couldn’t be opened. Try another photo.');
    image.onload = () => {
      const scale = Math.min(1, 1400 / Math.max(image.width, image.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(image.width * scale); canvas.height = Math.round(image.height * scale);
      canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height);
      $('previewImage').src = canvas.toDataURL('image/jpeg', .82);
      $('photoPreview').classList.remove('hidden'); $('uploadBox').classList.add('hidden'); $('reportMessage').classList.add('hidden');
    };
    image.src = reader.result;
  };
  reader.readAsDataURL(file);
});
$('removePhoto').addEventListener('click', () => {
  photoInput.value = ''; $('previewImage').removeAttribute('src'); $('photoPreview').classList.add('hidden'); $('uploadBox').classList.remove('hidden');
  photoInput.required = !editingItemId;
});
$('reportDate').value = dateInputValue(new Date());
$('reportDate').max = dateInputValue(new Date());
$('reportForm').addEventListener('submit', async event => {
  event.preventDefault();
  const form = event.currentTarget;
  if (form.dataset.submitting || !form.reportValidity()) return;
  form.dataset.submitting = 'true';
  const button = form.querySelector('[type="submit"]');
  button.disabled = true;
  $('reportMessage').classList.add('hidden');
  try {
    const photo = $('previewImage').src.startsWith('data:') ? $('previewImage').src : undefined;
    const payload = {
      title: $('reportTitle').value.trim(), category: $('reportCategory').value, location: $('reportLocation').value.trim(),
      date: $('reportDate').value, description: $('reportDescription').value.trim(), ...(photo ? { photo } : {}), emoji: '📦'
    };
    if (editingItemId) await api(`/api/items/${editingItemId}`, { method: 'PATCH', body: JSON.stringify(payload) });
    else {
      reportRequestKey ||= globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`;
      await api('/api/items', { method: 'POST', headers: { 'Idempotency-Key': reportRequestKey }, body: JSON.stringify(payload) });
      reportRequestKey = null;
    }
    editingItemId = null;
    hide($('reportModal'));
    form.reset(); $('photoPreview').classList.add('hidden'); $('previewImage').removeAttribute('src'); $('uploadBox').classList.remove('hidden');
    $('reportDate').value = dateInputValue(new Date()); $('photoInput').required = true;
    await refresh();
    toast('Report saved for staff review.');
  } catch (error) { setFormMessage('reportMessage', error.message); }
  finally { delete form.dataset.submitting; button.disabled = false; }
});
$('claimForm').addEventListener('submit', async event => {
  event.preventDefault();
  const form = event.currentTarget;
  if (form.dataset.submitting || !form.reportValidity()) return;
  form.dataset.submitting = 'true';
  const button = form.querySelector('[type="submit"]');
  button.disabled = true;
  $('claimMessage').classList.add('hidden');
  try {
    await api(`/api/items/${selectedClaimItem}/claims`, { method: 'POST', body: JSON.stringify({ proof: $('claimProof').value.trim() }) });
    hide($('claimModal')); form.reset(); await refresh(); toast('Your private claim was sent to staff.');
  } catch (error) { setFormMessage('claimMessage', error.message); }
  finally { delete form.dataset.submitting; button.disabled = false; }
});

(async () => {
  try {
    const data = await api('/api/me');
    currentUser = data.user;
    canInviteStaff = data.canInviteStaff;
    if (currentUser) {
      $('accountButton').textContent = 'Sign out';
      $('accountButton').title = `Signed in as ${currentUser.email}. Sign out`;
      if (currentUser.role === 'student') myClaims = await api('/api/my/claims');
      if (currentUser.role === 'staff') claims = await api('/api/staff/claims');
    }
    await refresh();
  } catch (error) {
    $('itemGrid').setAttribute('aria-busy', 'false');
    showStatus(error.message);
  }
})();
