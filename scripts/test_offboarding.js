const { getPool, sql } = require('../db');

const BASE_URL = 'http://localhost:5000';

async function runTests() {
  console.log('--- STARTING OFFBOARDING INTEGRATION TESTS ---');
  let pool;
  try {
    pool = await getPool();
  } catch (err) {
    console.error('Cannot connect to DB:', err);
    process.exit(1);
  }

  try {
    // Clean up any leftover records first
    await pool.request().query("DELETE FROM service_certificate_requests WHERE employee_id IN (SELECT id FROM users WHERE email IN ('test.active@example.com', 'test.resigner@example.com', 'test.pm.resigner@example.com', 'test.pm@example.com'))");
    await pool.request().query("DELETE FROM resignations WHERE employee_id IN (SELECT id FROM users WHERE email IN ('test.active@example.com', 'test.resigner@example.com', 'test.pm.resigner@example.com', 'test.pm@example.com'))");
    await pool.request().query("DELETE FROM users WHERE email IN ('test.active@example.com', 'test.resigner@example.com', 'test.pm.resigner@example.com', 'test.pm@example.com')");

    // Test 1: Check if historically resigned user (Faraz) is filtered out of GET /api/users
    console.log('\n[Test 1] GET /api/users (Default vs include_inactive=true)');
    
    const resDefault = await fetch(`${BASE_URL}/api/users`);
    const usersDefault = await resDefault.json();
    const farazDefault = usersDefault.find(u => u.id === 20257);
    if (farazDefault) {
      throw new Error('FAIL: Mohammed Faraz (ID 20257, Resigned) was returned by default in GET /api/users');
    }
    console.log('✅ Mohammed Faraz successfully excluded by default.');

    const resAll = await fetch(`${BASE_URL}/api/users?include_inactive=true`);
    const usersAll = await resAll.json();
    const farazAll = usersAll.find(u => u.id === 20257);
    if (!farazAll) {
      throw new Error('FAIL: Mohammed Faraz was NOT returned when include_inactive=true in GET /api/users');
    }
    console.log('✅ Mohammed Faraz successfully returned when include_inactive=true.');

    // Test 2: Check search endpoint
    console.log('\n[Test 2] GET /api/users/search');
    
    console.log('\nCreating dummy active user for tests...');
    const bcrypt = require('bcrypt');
    const dummyPasswordHash = await bcrypt.hash('password123', 10);
    const dummyEmail = 'test.active@example.com';
    const dummyName = 'Test Active User';

    await pool.request()
      .input('email', sql.NVarChar, dummyEmail)
      .input('password', sql.NVarChar, dummyPasswordHash)
      .input('name', sql.NVarChar, dummyName)
      .input('role', sql.NVarChar, 'HR Manager')
      .input('status', sql.NVarChar, 'Active')
      .query(`
        INSERT INTO users (email, password, name, role, status, token_version)
        VALUES (@email, @password, @name, @role, @status, 0)
      `);
    console.log('Dummy active user created.');

    // Let's login as this dummy user
    console.log('Logging in as dummy active user...');
    const loginRes = await fetch(`${BASE_URL}/api/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: dummyEmail,
        password: 'password123',
        role: 'hr'
      })
    });
    const loginData = await loginRes.json();
    const token = loginData.token;
    const authHeaders = { Authorization: `Bearer ${token}` };
    console.log('✅ Login successful, token acquired.');

    // Test 2: search endpoint
    console.log('Searching for Mohammed Faraz (should be excluded)...');
    const searchResExclude = await fetch(`${BASE_URL}/api/users/search?q=Faraz`, { headers: authHeaders });
    const searchDataExclude = await searchResExclude.json();
    if (searchDataExclude.find(u => u.id === 20257)) {
      throw new Error('FAIL: Mohammed Faraz returned by default in search.');
    }
    console.log('✅ Mohammed Faraz excluded by default in search.');

    console.log('Searching with include_inactive=true (should be included)...');
    const searchResInclude = await fetch(`${BASE_URL}/api/users/search?q=Faraz&include_inactive=true`, { headers: authHeaders });
    const searchDataInclude = await searchResInclude.json();
    if (!searchDataInclude.find(u => u.id === 20257)) {
      throw new Error('FAIL: Mohammed Faraz not returned in search when include_inactive=true.');
    }
    console.log('✅ Mohammed Faraz included with flag in search.');

    // Test 3: Attempting login as a resigned user
    console.log('\n[Test 3] Attempting login as resigned user (Mohammed Faraz)');
    const resignedLoginRes = await fetch(`${BASE_URL}/api/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'mohammed@navabharathtechnologies.com',
        password: 'any_password',
        role: 'employee'
      })
    });
    if (resignedLoginRes.status === 403) {
      const data = await resignedLoginRes.json();
      if (data.message !== 'Account disabled.') {
        throw new Error(`FAIL: Expected message 'Account disabled.', got '${data.message}'`);
      }
      console.log('✅ Resigned login successfully blocked with 403 Forbidden: Account disabled.');
    } else {
      throw new Error(`FAIL: Expected 403 Forbidden for resigned login, got: ${resignedLoginRes.status}`);
    }

    // Test 4: Deactivation flow upon resignation & service certificate approval
    console.log('\n[Test 4] Testing resignation & service certificate deactivation flow');
    
    // Create a test employee
    const testEmployeeEmail = 'test.resigner@example.com';
    const testEmployeeName = 'Test Resigner User';
    
    const createRes = await pool.request()
      .input('email', sql.NVarChar, testEmployeeEmail)
      .input('password', sql.NVarChar, dummyPasswordHash)
      .input('name', sql.NVarChar, testEmployeeName)
      .input('role', sql.NVarChar, 'Employee')
      .input('status', sql.NVarChar, 'Active')
      .query(`
        INSERT INTO users (email, password, name, role, status, token_version)
        VALUES (@email, @password, @name, @role, @status, 1)
        SELECT SCOPE_IDENTITY() as id
      `);
    const testEmployeeId = createRes.recordset[0].id;
    console.log(`Created test employee with ID: ${testEmployeeId}`);

    // Insert a pending resignation request
    const resignRes = await pool.request()
      .input('employee_id', sql.Int, testEmployeeId)
      .input('resignation_date', sql.Date, new Date())
      .input('last_working_day', sql.Date, new Date())
      .input('reason', sql.NVarChar, 'Testing offboarding flow')
      .input('letter_content', sql.NVarChar, 'My resignation letter')
      .query(`
        INSERT INTO resignations (employee_id, resignation_date, last_working_day, reason, letter_content, hr_status, pm_status)
        VALUES (@employee_id, @resignation_date, @last_working_day, @reason, @letter_content, 'Pending', 'Pending')
        SELECT SCOPE_IDENTITY() as id
      `);
    const resignationId = resignRes.recordset[0].id;
    console.log(`Created pending resignation ticket ID: ${resignationId}`);

    // Log in as the test employee to get a valid token
    const resignerLoginRes = await fetch(`${BASE_URL}/api/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: testEmployeeEmail,
        password: 'password123',
        role: 'employee'
      })
    });
    const resignerLoginData = await resignerLoginRes.json();
    const resignerToken = resignerLoginData.token;
    console.log('Obtained active token for resigner.');

    // Verify token works initially
    const verifyRes = await fetch(`${BASE_URL}/api/job-postings`, { headers: { Authorization: `Bearer ${resignerToken}` } });
    if (verifyRes.status !== 200) {
      throw new Error(`FAIL: Resigner token failed to validate initially, status: ${verifyRes.status}`);
    }
    console.log('✅ Resigner token successfully validated before resignation approval.');

    // HR approves resignation
    console.log('HR approving resignation via API...');
    const approveHRRes = await fetch(`${BASE_URL}/api/admin/resignations/${resignationId}/review`, {
      method: 'PUT',
      headers: { ...authHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        hr_status: 'Approved',
        hr_remark: 'Approved in offboarding test'
      })
    });
    const approveHRResData = await approveHRRes.json();
    if (!approveHRResData.success) {
      throw new Error('FAIL: HR resignation approval API failed.');
    }
    console.log('✅ HR resignation approved successfully.');

    // PM approves resignation
    console.log('PM approving resignation via API...');
    const approvePMRes = await fetch(`${BASE_URL}/api/admin/resignations/${resignationId}/review`, {
      method: 'PUT',
      headers: { ...authHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        pm_status: 'Approved',
        project_manager_remark: 'Approved in offboarding test'
      })
    });
    const approvePMResData = await approvePMRes.json();
    if (!approvePMResData.success) {
      throw new Error('FAIL: PM resignation approval API failed.');
    }
    console.log('✅ PM resignation approved successfully.');

    // Verify employee is STILL active
    const checkUserResignationApproved = await pool.request()
      .input('id', sql.Int, testEmployeeId)
      .query('SELECT status FROM users WHERE id = @id');
    if (checkUserResignationApproved.recordset[0].status !== 'Active') {
      throw new Error(`FAIL: User is '${checkUserResignationApproved.recordset[0].status}', expected 'Active' after resignation approval before Service Certificate approval`);
    }
    console.log('✅ Employee user status remained Active after resignation approvals.');

    // Create a pending service certificate request for the employee
    console.log('Creating pending service certificate request...');
    const certInsertRes = await pool.request()
      .input('employee_id', sql.Int, testEmployeeId)
      .input('purpose', sql.NVarChar, 'Job change verification')
      .query(`
        INSERT INTO service_certificate_requests (employee_id, purpose, hr_status, pm_status, designation_at_request, created_at, updated_at)
        VALUES (@employee_id, @purpose, 'Pending', 'Pending', 'Developer', GETDATE(), GETDATE())
        SELECT SCOPE_IDENTITY() as id
      `);
    const certificateId = certInsertRes.recordset[0].id;
    console.log(`Created service certificate request ID: ${certificateId}`);

    // PM approves the service certificate
    console.log('PM approving service certificate...');
    const approveCertPM = await fetch(`${BASE_URL}/api/service-certificates/${certificateId}`, {
      method: 'PUT',
      headers: { ...authHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        pm_status: 'Approved'
      })
    });
    if (approveCertPM.status !== 200) {
      throw new Error(`FAIL: PM service certificate approval API returned status ${approveCertPM.status}`);
    }
    console.log('✅ PM approved service certificate.');

    // Verify employee is STILL active
    const checkUserCertPMApproved = await pool.request()
      .input('id', sql.Int, testEmployeeId)
      .query('SELECT status FROM users WHERE id = @id');
    if (checkUserCertPMApproved.recordset[0].status !== 'Active') {
      throw new Error('FAIL: User status became Resigned after only PM service certificate approval.');
    }
    console.log('✅ Employee user status remained Active after PM service certificate approval.');

    // HR approves the service certificate (The final deactivation trigger!)
    console.log('HR approving service certificate...');
    const approveCertHR = await fetch(`${BASE_URL}/api/service-certificates/${certificateId}`, {
      method: 'PUT',
      headers: { ...authHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        hr_status: 'Approved'
      })
    });
    if (approveCertHR.status !== 200) {
      throw new Error(`FAIL: HR service certificate approval API returned status ${approveCertHR.status}`);
    }
    console.log('✅ HR approved service certificate.');

    // Check if user status is updated to 'Resigned' in DB
    const checkDbUser = await pool.request()
      .input('id', sql.Int, testEmployeeId)
      .query('SELECT status, token_version FROM users WHERE id = @id');
    
    const dbUser = checkDbUser.recordset[0];
    if (dbUser.status !== 'Resigned') {
      throw new Error(`FAIL: User status is '${dbUser.status}', expected 'Resigned' after final approvals.`);
    }
    if (dbUser.token_version <= 1) {
      throw new Error(`FAIL: token_version is '${dbUser.token_version}', expected it to be incremented`);
    }
    console.log(`✅ User status successfully updated to 'Resigned' in DB.`);

    // Verify that the resigner's token is now rejected due to account deactivation
    console.log('Attempting request with resigner token (should be rejected)...');
    const verifyDeactivatedRes = await fetch(`${BASE_URL}/api/job-postings`, { headers: { Authorization: `Bearer ${resignerToken}` } });
    if (verifyDeactivatedRes.status === 401) {
      console.log('✅ Request successfully rejected with 401 Unauthorized.');
    } else {
      throw new Error(`FAIL: Expected 401 for deactivated token, got: ${verifyDeactivatedRes.status}`);
    }

    // Clean up Test 4 records
    console.log('Cleaning up Test 4 records...');
    await pool.request().input('empId', sql.Int, testEmployeeId).query('DELETE FROM service_certificate_requests WHERE employee_id = @empId');
    await pool.request().input('empId', sql.Int, testEmployeeId).query('DELETE FROM resignations WHERE employee_id = @empId');
    await pool.request().input('email', sql.NVarChar, testEmployeeEmail).query('DELETE FROM users WHERE email = @email');
    await pool.request().input('email', sql.NVarChar, dummyEmail).query('DELETE FROM users WHERE email = @email');

    console.log('\n⭐⭐⭐ ALL TESTS PASSED SUCCESSFULLY! ⭐⭐⭐');
    process.exit(0);

  } catch (err) {
    console.error('\n❌ TEST SUITE FAILED:', err.message);
    // Attempt cleanup of test records
    try {
      await pool.request().query("DELETE FROM service_certificate_requests WHERE employee_id IN (SELECT id FROM users WHERE email IN ('test.active@example.com', 'test.resigner@example.com', 'test.pm.resigner@example.com', 'test.pm@example.com'))");
      await pool.request().query("DELETE FROM resignations WHERE employee_id IN (SELECT id FROM users WHERE email IN ('test.active@example.com', 'test.resigner@example.com', 'test.pm.resigner@example.com', 'test.pm@example.com'))");
      await pool.request().query("DELETE FROM users WHERE email IN ('test.active@example.com', 'test.resigner@example.com', 'test.pm.resigner@example.com', 'test.pm@example.com')");
    } catch (e) {}
    process.exit(1);
  }
}

// Wait a bit for PM2 to reload the app before running tests
console.log('Waiting 3 seconds for server to reload...');
setTimeout(runTests, 3000);
