const loginForm = document.getElementById('loginForm');
const registrationForm = document.getElementById('regForm');

function showAuthMessage(element, message, kind = 'error') {
  if (!element) return;
  element.className = kind === 'error' ? 'error' : 'msg success';
  element.textContent = message;
  element.style.display = 'block';
}

if (loginForm) {
  loginForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const button = loginForm.querySelector('button[type="submit"]');
    const error = document.getElementById('error');
    const identifier = document.getElementById('email').value.trim();
    const password = document.getElementById('password').value;
    button.disabled = true;
    button.textContent = 'Signing in...';

    try {
      const result = await window.attendkaApi.request('/auth/login', {
        method: 'POST',
        body: JSON.stringify({
          ...(identifier.includes('@') ? { email: identifier } : { username: identifier }),
          password,
        }),
      });
      window.attendkaApi.saveSession(result.token, result.user);
      window.location.href = 'app.html';
    } catch (requestError) {
      showAuthMessage(error, requestError.message);
    } finally {
      button.disabled = false;
      button.textContent = 'Sign In';
    }
  });
}

if (registrationForm) {
  const departmentSelect = document.getElementById('department');
  const message = document.getElementById('msg');

  window.attendkaApi.request('/departments')
    .then(({ departments }) => {
      if (!departmentSelect) return;
      departmentSelect.replaceChildren(new Option('Select a department', ''));
      departments.forEach((department) => {
        departmentSelect.add(new Option(`${department.code} — ${department.name}`, department.department_id));
      });
    })
    .catch((error) => showAuthMessage(message, error.message));

  registrationForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const button = registrationForm.querySelector('button[type="submit"]');
    const password = document.getElementById('password').value;
    const confirm = document.getElementById('confirm').value;
    if (password !== confirm) {
      showAuthMessage(message, 'Passwords do not match.');
      return;
    }
    button.disabled = true;
    button.textContent = 'Creating account...';
    const payload = {
      first_name: document.getElementById('first').value.trim(),
      last_name: document.getElementById('last').value.trim(),
      username: document.getElementById('username').value.trim(),
      email: document.getElementById('email').value.trim(),
      password,
      student_no: document.getElementById('studentNo').value.trim(),
      department_id: Number(departmentSelect.value),
      year_level: Number(document.getElementById('yearLevel').value),
      section: document.getElementById('section').value.trim(),
    };

    try {
      const result = await window.attendkaApi.request('/auth/register', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      window.attendkaApi.saveSession(result.token, result.user);
      showAuthMessage(message, 'Student account created. Opening your dashboard...', 'success');
      window.setTimeout(() => { window.location.href = 'app.html'; }, 700);
    } catch (requestError) {
      showAuthMessage(message, requestError.message);
    } finally {
      button.disabled = false;
      button.textContent = 'Create Student Account';
    }
  });
}
