// Creates non-sensitive demonstration accounts through the public API.
// Does not delete records or change existing credentials.
const baseUrl = process.env.BASE_URL || 'http://localhost:3000';
const password = 'DemoOnly!3123Pass';
async function call(path, body, token) {
  const response = await fetch(baseUrl + path, {method: 'POST', headers: {'Content-Type': 'application/json', ...(token ? {Authorization: 'Bearer ' + token} : {})}, body: JSON.stringify(body)});
  const data = await response.json();
  return {status: response.status, data};
}
(async () => {
  for (const suffix of ['a', 'b']) {
    const user = {username: 'marker_' + suffix, email: 'marker.' + suffix + '@example.test', password};
    const signup = await call('/api/v1/user/signup', user);
    if (![201,409].includes(signup.status)) throw new Error('Signup failed: HTTP ' + signup.status);
    const login = await call('/api/v1/user/login', {username: user.username, password});
    if (login.status !== 200) throw new Error('Demo account login failed; no existing credential will be changed');
    const token = login.data.data.token;
    const list = await fetch(baseUrl + '/api/v1/emp/employees', {headers: {Authorization: 'Bearer ' + token}});
    const employees = await list.json();
    if (list.status !== 200) throw new Error('Employee listing failed: HTTP ' + list.status);
    const email = suffix === 'a' ? 'alex@example.test' : 'blair@example.test';
    if (!employees.data.some(employee => employee.email === email)) {
      const created = await call('/api/v1/emp/employees', {first_name: suffix === 'a' ? 'Alex' : 'Blair', last_name: 'Example', email, position: 'Developer', salary: 65000, date_of_joining: '2026-10-01', department: 'Engineering'}, token);
      if (created.status !== 201) throw new Error('Employee creation failed: HTTP ' + created.status);
    }
    console.log('Demo account and employee ready: ' + user.username);
  }
})().catch(error => {console.error(error.message); process.exitCode = 1;});
