const { getPool, sql } = require('../db');
const bcrypt = require('bcrypt');

const BASE_URL = 'http://localhost:5000';

async function runTests() {
  console.log('--- STARTING EXIT FORMALITIES INTEGRATION TESTS ---');
  let pool;
  try {
    pool = await getPool();
  } catch (err) {
    console.error('Cannot connect to DB:', err);
    process.exit(1);
  }

  const empEmail = 'test.exit.emp@example.com';
  const hrEmail = 'test.exit.hr@example.com';
  const dummyPasswordHash = await bcrypt.hash('password123', 10);

  try {
    // 1. Database Cleanup
    console.log('Cleaning up old test records...');
    await pool.request().query(`
      DELETE FROM exit_formalities WHERE employee_id IN (SELECT id FROM users WHERE email IN ('${empEmail}', '${hrEmail}'))
      DELETE FROM resignations WHERE employee_id IN (SELECT id FROM users WHERE email IN ('${empEmail}', '${hrEmail}'))
      DELETE FROM employee WHERE user_id IN (SELECT id FROM users WHERE email IN ('${empEmail}', '${hrEmail}'))
      DELETE FROM users WHERE email IN ('${empEmail}', '${hrEmail}')
    `);

    // 2. Create Test Users & Employee details
    console.log('Creating test employee and HR user...');
    const hrInsert = await pool.request()
      .input('email', sql.NVarChar, hrEmail)
      .input('password', sql.NVarChar, dummyPasswordHash)
      .input('name', sql.NVarChar, 'Test Exit HR')
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
      .input('name', sql.NVarChar, 'Test Exit Employee')
      .input('role', sql.NVarChar, 'Software Developer')
      .input('status', sql.NVarChar, 'Active')
      .input('reporting_manager_id', sql.Int, hrUserId)
      .input('joining_date', sql.Date, new Date('2024-01-15'))
      .input('team', sql.NVarChar, 'Engineering')
      .query(`
        INSERT INTO users (email, password, name, role, status, reporting_manager_id, joining_date, team, token_version)
        VALUES (@email, @password, @name, @role, @status, @reporting_manager_id, @joining_date, @team, 0);
        SELECT SCOPE_IDENTITY() as id;
      `);
    const empUserId = empInsert.recordset[0].id;

    // Create record in employee table
    await pool.request()
      .input('userId', sql.Int, empUserId)
      .input('empId', sql.Int, 99999)
      .input('empName', sql.NVarChar, 'Test Exit Employee')
      .input('designation', sql.NVarChar, 'Software Developer')
      .input('teamName', sql.NVarChar, 'Engineering')
      .query(`
        INSERT INTO employee (user_id, emp_name, designation, emp_id, team_name)
        VALUES (@userId, @empName, @designation, @empId, @teamName)
      `);

    // 3. Create Resignation request for the employee
    console.log('Creating resignation request...');
    const resignInsert = await pool.request()
      .input('employee_id', sql.Int, empUserId)
      .input('resignation_date', sql.Date, new Date('2026-06-01'))
      .input('last_working_day', sql.Date, new Date('2026-07-01'))
      .input('reason', sql.NVarChar, 'Career progression')
      .input('letter_content', sql.NVarChar, 'Dear team, this is my resignation.')
      .query(`
        INSERT INTO resignations (employee_id, resignation_date, last_working_day, reason, letter_content, hr_status, pm_status)
        VALUES (@employee_id, @resignation_date, @last_working_day, @reason, @letter_content, 'Approved', 'Approved');
        SELECT SCOPE_IDENTITY() as id;
      `);
    const resignationId = resignInsert.recordset[0].id;

    // 4. Log in to acquire tokens
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

    // 5. Test GET /api/exit-formalities/my (mock template fallback)
    console.log('\n[Test 1] GET /api/exit-formalities/my (Fallback template)...');
    const getMyRes = await fetch(`${BASE_URL}/api/exit-formalities/my`, { headers: empHeaders });
    console.log('GET /api/exit-formalities/my Status:', getMyRes.status);
    const myMockData = await getMyRes.json();
    console.log('GET /api/exit-formalities/my Response Body:', myMockData);
    if (myMockData.id !== null) {
      throw new Error(`Expected id to be null initially, got ${myMockData.id}`);
    }
    if (myMockData.employee_name !== 'Test Exit Employee' || myMockData.company_employee_id !== 99999) {
      throw new Error(`Mock template details mismatch: name=${myMockData.employee_name}, company_employee_id=${myMockData.company_employee_id}`);
    }
    console.log('✅ Fallback template details verified successfully.');

    // 6. Test POST /api/exit-formalities (Save record)
    console.log('\n[Test 2] POST /api/exit-formalities (Submit handover)...');
    const postRes = await fetch(`${BASE_URL}/api/exit-formalities`, {
      method: 'POST',
      headers: empHeaders,
      body: JSON.stringify({
        reason_type: 'Career growth',
        handover_completed: 'Yes',
        handover_to_name: 'Jane Doe',
        pending_tasks: 'Fix bugs in backend module'
      })
    });
    const postData = await postRes.json();
    if (!postData.success || !postData.id) {
      throw new Error(`POST request failed: ${JSON.stringify(postData)}`);
    }
    const recordId = postData.id;
    console.log(`✅ Exit formalities created successfully. ID: ${recordId}`);

    // 7. Test GET /api/exit-formalities/my (Saved record verification)
    console.log('\n[Test 3] GET /api/exit-formalities/my (Saved details)...');
    const getSavedRes = await fetch(`${BASE_URL}/api/exit-formalities/my`, { headers: empHeaders });
    const savedData = await getSavedRes.json();
    if (savedData.id !== recordId || savedData.reason_type !== 'Career growth' || savedData.handover_completed !== 'Yes') {
      throw new Error(`Saved details mismatch: ${JSON.stringify(savedData)}`);
    }
    
    // Explicitly verify the details columns are stored in the exit_formalities table
    if (savedData.employee_name !== 'Test Exit Employee' || savedData.company_employee_id !== '99999' || savedData.department !== 'Engineering' || savedData.designation !== 'Software Developer') {
      throw new Error(`Saved explicit employee snapshot details mismatch: ${JSON.stringify(savedData)}`);
    }
    if (savedData.reporting_manager !== 'Test Exit HR' || savedData.hr_name !== 'HR Department') {
      throw new Error(`Saved manager/HR snapshot details mismatch: ${JSON.stringify(savedData)}`);
    }
    console.log('✅ Saved details and explicit employee snapshot columns verified successfully.');

    // 8. Test PUT /api/exit-formalities/:id (Employee security restrictions)
    console.log('\n[Test 4] PUT /api/exit-formalities/:id (Security checks for employee)...');
    const putEmpRes = await fetch(`${BASE_URL}/api/exit-formalities/${recordId}`, {
      method: 'PUT',
      headers: empHeaders,
      body: JSON.stringify({
        handover_completed: 'Yes',
        pending_tasks: 'All completed',
        clearance_it_status: 'Yes', // Employee tries to approve IT clearance
        asset_laptop_status: 'Yes'  // Employee tries to return laptop
      })
    });
    const putEmpData = await putEmpRes.json();
    if (!putEmpData.success) {
      throw new Error(`PUT request failed: ${JSON.stringify(putEmpData)}`);
    }

    // Verify IT clearance and laptop asset remained 'Pending' because the employee is not HR/Admin
    const getVerificationRes = await fetch(`${BASE_URL}/api/exit-formalities/my`, { headers: empHeaders });
    const verifiedData = await getVerificationRes.json();
    if (verifiedData.clearance_it_status !== 'Pending' || verifiedData.asset_laptop_status !== 'Pending') {
      throw new Error(`Security Fail: Employee was able to change clearances or asset return status. it_status=${verifiedData.clearance_it_status}, laptop_status=${verifiedData.asset_laptop_status}`);
    }
    console.log('✅ Employee security restriction works as expected.');

    // 9. Test PUT /api/exit-formalities/:id (HR approval of clearances and assets)
    console.log('\n[Test 5] PUT /api/exit-formalities/:id (HR clearance updates)...');
    const putHrRes = await fetch(`${BASE_URL}/api/exit-formalities/${recordId}`, {
      method: 'PUT',
      headers: hrHeaders,
      body: JSON.stringify({
        clearance_hr_status: 'Yes',
        clearance_hr_remarks: 'All clean',
        clearance_it_status: 'Yes',
        clearance_it_remarks: 'Laptop returned',
        asset_laptop_status: 'Yes',
        asset_laptop_remarks: 'In good condition',
        notice_period_served: 'Yes',
        final_settlement_date: '2026-07-02'
      })
    });
    const putHrData = await putHrRes.json();
    if (!putHrData.success) {
      throw new Error(`HR PUT request failed: ${JSON.stringify(putHrData)}`);
    }

    // Verify details as HR
    const getHrVerifyRes = await fetch(`${BASE_URL}/api/exit-formalities/employee/${empUserId}`, { headers: hrHeaders });
    const hrVerifyData = await getHrVerifyRes.json();
    if (
      hrVerifyData.clearance_it_status !== 'Yes' || 
      hrVerifyData.clearance_hr_status !== 'Yes' ||
      hrVerifyData.asset_laptop_status !== 'Yes' ||
      hrVerifyData.notice_period_served !== 'Yes'
    ) {
      throw new Error(`HR update verification failed: ${JSON.stringify(hrVerifyData)}`);
    }
    console.log('✅ HR clearances and asset checklist updated and verified successfully.');

    // 10. Test GET /api/admin/exit-formalities (Auth checking)
    console.log('\n[Test 6] GET /api/admin/exit-formalities (Auth verification)...');
    const getAdminListRes = await fetch(`${BASE_URL}/api/admin/exit-formalities`, { headers: hrHeaders });
    if (getAdminListRes.status !== 200) {
      throw new Error(`Admin fetch failed with status ${getAdminListRes.status}`);
    }
    const adminList = await getAdminListRes.json();
    if (!adminList.find(x => x.id === recordId)) {
      throw new Error('Created record not found in admin list');
    }
    console.log('✅ HR list access verified.');

    // Test Employee access rejection
    const getAdminListEmpRes = await fetch(`${BASE_URL}/api/admin/exit-formalities`, { headers: empHeaders });
    if (getAdminListEmpRes.status !== 403) {
      throw new Error(`Expected 403 Forbidden for employee access to admin list, got ${getAdminListEmpRes.status}`);
    }
    console.log('✅ Employee access rejection verified.');

    // 11. Cleanup test database records
    console.log('\nCleaning up test database records...');
    await pool.request().query(`
      DELETE FROM exit_formalities WHERE employee_id IN (SELECT id FROM users WHERE email IN ('${empEmail}', '${hrEmail}'))
      DELETE FROM resignations WHERE employee_id IN (SELECT id FROM users WHERE email IN ('${empEmail}', '${hrEmail}'))
      DELETE FROM employee WHERE user_id IN (SELECT id FROM users WHERE email IN ('${empEmail}', '${hrEmail}'))
      DELETE FROM users WHERE email IN ('${empEmail}', '${hrEmail}')
    `);

    console.log('\n⭐⭐⭐ ALL EXIT FORMALITIES TESTS PASSED SUCCESSFULLY! ⭐⭐⭐');
    process.exit(0);
  } catch (err) {
    console.error('\n❌ TEST SUITE FAILED:', err.message);
    try {
      // Attempt cleanup
      await pool.request().query(`
        DELETE FROM exit_formalities WHERE employee_id IN (SELECT id FROM users WHERE email IN ('${empEmail}', '${hrEmail}'))
        DELETE FROM resignations WHERE employee_id IN (SELECT id FROM users WHERE email IN ('${empEmail}', '${hrEmail}'))
        DELETE FROM employee WHERE user_id IN (SELECT id FROM users WHERE email IN ('${empEmail}', '${hrEmail}'))
        DELETE FROM users WHERE email IN ('${empEmail}', '${hrEmail}')
      `);
    } catch (e) {}
    process.exit(1);
  }
}

// Wait 2 seconds for server to reload
console.log('Waiting 2 seconds for server to reload...');
setTimeout(runTests, 2000);
