const { getPool, sql } = require('../db');
const bcrypt = require('bcrypt');

const BASE_URL = 'http://localhost:5000';

async function runTests() {
  console.log('--- STARTING EXIT FEEDBACK INTEGRATION TESTS ---');
  let pool;
  try {
    pool = await getPool();
  } catch (err) {
    console.error('Cannot connect to DB:', err);
    process.exit(1);
  }

  const empEmail = 'test.feedback.emp@example.com';
  const hrEmail = 'test.feedback.hr@example.com';
  const dummyPasswordHash = await bcrypt.hash('password123', 10);

  try {
    // 1. Database Cleanup
    console.log('Cleaning up old test records...');
    await pool.request().query(`
      DELETE FROM exit_feedback WHERE employee_id IN (SELECT id FROM users WHERE email IN ('${empEmail}', '${hrEmail}'))
      DELETE FROM exit_formalities WHERE employee_id IN (SELECT id FROM users WHERE email IN ('${empEmail}', '${hrEmail}'))
      DELETE FROM resignations WHERE employee_id IN (SELECT id FROM users WHERE email IN ('${empEmail}', '${hrEmail}'))
      DELETE FROM users WHERE email IN ('${empEmail}', '${hrEmail}')
    `);

    // 2. Create Test Users
    console.log('Creating test employee and HR user...');
    const hrInsert = await pool.request()
      .input('email', sql.NVarChar, hrEmail)
      .input('password', sql.NVarChar, dummyPasswordHash)
      .input('name', sql.NVarChar, 'Test Feedback HR')
      .input('role', sql.NVarChar, 'HR Manager')
      .input('status', sql.NVarChar, 'Active')
      .query(`
        INSERT INTO users (email, password, name, role, status, token_version)
        VALUES (@email, @password, @name, @role, @status, 0);
        SELECT SCOPE_IDENTITY() as id;
      `);
    const hrUserId = hrInsert.recordset[0].id;

    const empInsert = await pool.request()
      .input('email', sql.NVarChar, empEmail)
      .input('password', sql.NVarChar, dummyPasswordHash)
      .input('name', sql.NVarChar, 'Test Feedback Employee')
      .input('role', sql.NVarChar, 'Software Developer')
      .input('status', sql.NVarChar, 'Active')
      .input('reporting_manager_id', sql.Int, hrUserId)
      .query(`
        INSERT INTO users (email, password, name, role, status, reporting_manager_id, token_version)
        VALUES (@email, @password, @name, @role, @status, @reporting_manager_id, 0);
        SELECT SCOPE_IDENTITY() as id;
      `);
    const empUserId = empInsert.recordset[0].id;

    // 3. Log in to acquire tokens
    console.log('Logging in to acquire JWT tokens...');
    const empLogin = await fetch(`${BASE_URL}/api/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: empEmail, password: 'password123', role: 'employee' })
    });
    const empToken = (await empLogin.json()).token;

    const hrLogin = await fetch(`${BASE_URL}/api/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: hrEmail, password: 'password123', role: 'hr' })
    });
    const hrToken = (await hrLogin.json()).token;

    const empHeaders = { Authorization: `Bearer ${empToken}`, 'Content-Type': 'application/json' };
    const hrHeaders = { Authorization: `Bearer ${hrToken}`, 'Content-Type': 'application/json' };

    // 4. Test GET /api/exit-feedback/my (template fallback)
    console.log('\n[Test 1] GET /api/exit-feedback/my (Fallback template)...');
    const getMyRes = await fetch(`${BASE_URL}/api/exit-feedback/my`, { headers: empHeaders });
    console.log('GET /api/exit-feedback/my Status:', getMyRes.status);
    const myMockData = await getMyRes.json();
    if (myMockData.id !== null) {
      throw new Error(`Expected id to be null initially, got ${myMockData.id}`);
    }
    if (myMockData.employee_signature !== 'Test Feedback Employee') {
      throw new Error(`Mock template details mismatch: employee_signature=${myMockData.employee_signature}`);
    }
    console.log('✅ Fallback template details verified successfully.');

    // 5. Test POST /api/exit-feedback (Submit feedback)
    console.log('\n[Test 2] POST /api/exit-feedback (Submit feedback)...');
    const postRes = await fetch(`${BASE_URL}/api/exit-feedback`, {
      method: 'POST',
      headers: empHeaders,
      body: JSON.stringify({
        like_most: 'The collaborative team environment',
        improve_company: 'Provide more developer training resources',
        employee_signature: 'Test Feedback Employee Signed',
        employee_signature_date: '2026-06-22'
      })
    });
    const postData = await postRes.json();
    if (!postData.success || !postData.id) {
      throw new Error(`POST request failed: ${JSON.stringify(postData)}`);
    }
    const recordId = postData.id;
    console.log(`✅ Exit feedback created successfully. ID: ${recordId}`);

    // 6. Test GET /api/exit-feedback/my (Saved details)
    console.log('\n[Test 3] GET /api/exit-feedback/my (Saved details)...');
    const getSavedRes = await fetch(`${BASE_URL}/api/exit-feedback/my`, { headers: empHeaders });
    const savedData = await getSavedRes.json();
    if (
      savedData.id !== recordId || 
      savedData.like_most !== 'The collaborative team environment' || 
      savedData.improve_company !== 'Provide more developer training resources' ||
      savedData.employee_signature !== 'Test Feedback Employee Signed'
    ) {
      throw new Error(`Saved details mismatch: ${JSON.stringify(savedData)}`);
    }
    console.log('✅ Saved details verified successfully.');

    // 7. Test PUT /api/exit-feedback/:id (Employee security restrictions)
    console.log('\n[Test 4] PUT /api/exit-feedback/:id (Security checks for employee)...');
    const putEmpRes = await fetch(`${BASE_URL}/api/exit-feedback/${recordId}`, {
      method: 'PUT',
      headers: empHeaders,
      body: JSON.stringify({
        like_most: 'Updated collaborative team environment',
        hr_signature: 'Bypassed HR Signature', // Employee tries to sign for HR
        hr_signature_date: '2026-06-22'
      })
    });
    const putEmpData = await putEmpRes.json();
    if (!putEmpData.success) {
      throw new Error(`PUT request failed: ${JSON.stringify(putEmpData)}`);
    }

    // Verify HR signature remained null/Pending because employee is not HR/Admin
    const getVerificationRes = await fetch(`${BASE_URL}/api/exit-feedback/my`, { headers: empHeaders });
    const verifiedData = await getVerificationRes.json();
    if (verifiedData.hr_signature !== null) {
      throw new Error(`Security Fail: Employee was able to write HR signature. hr_signature=${verifiedData.hr_signature}`);
    }
    if (verifiedData.like_most !== 'Updated collaborative team environment') {
      throw new Error(`Employee was not able to update their own fields: like_most=${verifiedData.like_most}`);
    }
    console.log('✅ Employee security restriction works as expected.');

    // 8. Test PUT /api/exit-feedback/:id (HR signing the feedback)
    console.log('\n[Test 5] PUT /api/exit-feedback/:id (HR signature update)...');
    const putHrRes = await fetch(`${BASE_URL}/api/exit-feedback/${recordId}`, {
      method: 'PUT',
      headers: hrHeaders,
      body: JSON.stringify({
        hr_signature: 'HR Director Signature',
        hr_signature_date: '2026-06-22'
      })
    });
    const putHrData = await putHrRes.json();
    if (!putHrData.success) {
      throw new Error(`HR PUT request failed: ${JSON.stringify(putHrData)}`);
    }

    // Verify details as HR
    const getHrVerifyRes = await fetch(`${BASE_URL}/api/exit-feedback/employee/${empUserId}`, { headers: hrHeaders });
    const hrVerifyData = await getHrVerifyRes.json();
    if (hrVerifyData.hr_signature !== 'HR Director Signature') {
      throw new Error(`HR update verification failed: ${JSON.stringify(hrVerifyData)}`);
    }
    console.log('✅ HR signature updated and verified successfully.');

    // 9. Test GET /api/admin/exit-feedback (Auth checking)
    console.log('\n[Test 6] GET /api/admin/exit-feedback (Auth verification)...');
    const getAdminListRes = await fetch(`${BASE_URL}/api/admin/exit-feedback`, { headers: hrHeaders });
    if (getAdminListRes.status !== 200) {
      throw new Error(`Admin fetch failed with status ${getAdminListRes.status}`);
    }
    const adminList = await getAdminListRes.json();
    if (!adminList.find(x => x.id === recordId)) {
      throw new Error('Created record not found in admin list');
    }
    console.log('✅ HR list access verified.');

    // Test Employee access rejection
    const getAdminListEmpRes = await fetch(`${BASE_URL}/api/admin/exit-feedback`, { headers: empHeaders });
    if (getAdminListEmpRes.status !== 403) {
      throw new Error(`Expected 403 Forbidden for employee access to admin list, got ${getAdminListEmpRes.status}`);
    }
    console.log('✅ Employee access rejection verified.');

    // 10. Cleanup test database records
    console.log('\nCleaning up test database records...');
    await pool.request().query(`
      DELETE FROM exit_feedback WHERE employee_id IN (SELECT id FROM users WHERE email IN ('${empEmail}', '${hrEmail}'))
      DELETE FROM users WHERE email IN ('${empEmail}', '${hrEmail}')
    `);

    console.log('\n⭐⭐⭐ ALL EXIT FEEDBACK TESTS PASSED SUCCESSFULLY! ⭐⭐⭐');
    process.exit(0);
  } catch (err) {
    console.error('\n❌ TEST SUITE FAILED:', err.message);
    try {
      // Attempt cleanup
      await pool.request().query(`
        DELETE FROM exit_feedback WHERE employee_id IN (SELECT id FROM users WHERE email IN ('${empEmail}', '${hrEmail}'))
        DELETE FROM users WHERE email IN ('${empEmail}', '${hrEmail}')
      `);
    } catch (e) {}
    process.exit(1);
  }
}

// Wait 2 seconds for server to reload
console.log('Waiting 2 seconds for server to reload...');
setTimeout(runTests, 2000);
