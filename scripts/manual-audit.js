require('dotenv').config({ path: '../.env' });
const { getPool } = require('../db');
const jwt = require('jsonwebtoken');

async function runManualAudit() {
  console.log('🚀 Triggering Manual Compliance Audit...');
  try {
    // Generate an admin token on the fly
    const token = jwt.sign({ id: 20250, role: 'Admin' }, process.env.JWT_SECRET || 'fallbacksecret');
    
    // Call the local endpoint
    const response = await fetch('http://localhost:5000/api/admin/new-joinees/audit-now', {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });
    
    const data = await response.json();
    console.log('✅ Audit Completed Successfully!');
    console.dir(data, { depth: null, colors: true });
    
  } catch (err) {
    console.error('❌ Failed to run manual audit:', err.message);
  }
}

runManualAudit();
