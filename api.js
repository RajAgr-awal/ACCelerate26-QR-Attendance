const SUPABASE_URL = 'https://ionwyohuqszattwbrskr.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imlvbnd5b2h1cXN6YXR0d2Jyc2tyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkwMjE0MTYsImV4cCI6MjA5NDU5NzQxNn0.ksIBk0gJJHpLVAf_GJ15Y3fL2Fj-8K7-tJQZYWgNViM';
const headers = {
  'Content-Type': 'application/json',
  'apikey': SUPABASE_KEY,
  'Authorization': `Bearer ${SUPABASE_KEY}`
};

// 1. Get participant by QR token
async function getParticipantByToken(token) {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/participants?qr_token=eq.${token}&is_active=eq.true&select=*`,
    { headers }
  );
  const data = await res.json();
  if (!data.length) return { success: false, error: 'Participant not found' };
  return { success: true, data: data[0] };
}

// 2. Check IN — inserts a row into attendance_logs
async function checkIn(participantId, eventDay) {
  // eventDay must be integer: 1, 2, or 3
  const res = await fetch(`${SUPABASE_URL}/rest/v1/attendance_logs`, {
    method: 'POST',
    headers: { ...headers, 'Prefer': 'return=representation' },
    body: JSON.stringify({
      participant_id: participantId,
      event_day: eventDay,        // integer, NOT "Day 1"
      action: 'CHECK_IN',         // must match your action enum exactly
      scan_time: new Date().toISOString()
    })
  });
  if (!res.ok) {
    const err = await res.json();
    // Duplicate check-in → Postgres unique constraint fires
    if (err.code === '23505') return { success: false, error: 'Already checked in today' };
    return { success: false, error: JSON.stringify(err) };
  }
  const data = await res.json();
  return { success: true, data };
}

// 3. Check OUT — same table, action = CHECK_OUT
async function checkOut(participantId, eventDay) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/attendance_logs`, {
    method: 'POST',
    headers: { ...headers, 'Prefer': 'return=representation' },
    body: JSON.stringify({
      participant_id: participantId,
      event_day: eventDay,
      action: 'CHECK_OUT',
      scan_time: new Date().toISOString()
    })
  });
  if (!res.ok) {
    const err = await res.json();
    return { success: false, error: JSON.stringify(err) };
  }
  const data = await res.json();
  return { success: true, data };
}

// 4. Log every scan attempt to security log
async function logScanAttempt(qrToken, participantId, scanResult) {
  await fetch(`${SUPABASE_URL}/rest/v1/qr_scan_security_logs`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      qr_token: qrToken,
      participant_id: participantId || null,
      scan_result: scanResult   // e.g. 'SUCCESS', 'INVALID_TOKEN', 'DUPLICATE'
    })
  });
}

// 5. Get live status for dashboard
async function getLiveStatus(eventDay) {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/attendance_logs?event_day=eq.${eventDay}&select=*,participants(full_name,participant_code)&order=scan_time.desc`,
    { headers }
  );
  const data = await res.json();
  return { success: true, data };
}

// 6. CSV export from daily_attendance_summary
async function exportCSV(eventDay) {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/daily_attendance_summary?event_day=eq.${eventDay}&select=*,participants(full_name,participant_code,email,college_name)`,
    { headers }
  );
  const rows = await res.json();
  const csv = [
    ['Name','Code','Email','College','Day','Checked In','Checked Out','First In','Last Out'],
    ...rows.map(r => [
      r.participants?.full_name, r.participants?.participant_code,
      r.participants?.email, r.participants?.college_name,
      r.event_day, r.checked_in, r.checked_out,
      r.first_check_in_time, r.last_check_out_time
    ])
  ].map(r => r.join(',')).join('\n');

  const blob = new Blob([csv], { type: 'text/csv' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `attendance_day${eventDay}.csv`;
  a.click();
}

// ─────────────────────────────────────────
// EXPORTS (for use in React / ES module projects)
// ─────────────────────────────────────────
export {
  getParticipantByToken,
  checkIn,
  checkOut,
  logScanAttempt,
  getLiveStatus,
  exportCSV
};
